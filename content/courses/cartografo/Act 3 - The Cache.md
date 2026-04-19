# Act 3 — The Cache

> *A cartographer who retraces every step from the root for every query is thorough but slow. The cache is your map room — answers you've already found, stored with expiry dates, ready for instant recall. But caching introduces new problems: stale data, negative answers, and the ever-present threat of poisoned entries.*

```mermaid
flowchart LR
    S16["Stage 16 - TTL Cache"] --> S17["Stage 17 - Negative Cache"]
    S17 --> S18["Stage 18 - Cache Poisoning"]
    S18 --> S19["Stage 19 - Performance"]
    S19 --> S20["Stage 20 - Async"]
    S20 --> S21["Stage 21 - Local Server"]
    style S16 fill:#49a,stroke:#333
    style S21 fill:#a4e,stroke:#333
```

---

## Stage 16 — The Map Room

> *Difficulty: Medium — In-memory cache with TTL expiry.*

Every DNS answer includes a TTL (Time To Live) — the number of seconds you're allowed to cache it. After the TTL expires, you must re-query. This stage builds an in-memory cache that stores answers and automatically expires them.

> [!tip] What You'll Learn
> - Cache design with `HashMap` and timestamps
> - TTL-based expiry
> - Cache lookup before recursive resolution
> - Why caching is essential (root servers handle 100,000+ queries per second)

### 16.1 — The cache struct

Create `src/cache.rs`:

```rust
use crate::protocol::ResourceRecord;
use std::collections::HashMap;
use std::time::{Duration, Instant};

struct CacheEntry {
    records: Vec<ResourceRecord>,
    expires_at: Instant,
}

pub struct DnsCache {
    entries: HashMap<(String, u16), CacheEntry>, // (name, type) → entry
}

impl DnsCache {
    pub fn new() -> Self {
        DnsCache { entries: HashMap::new() }
    }

    /// Look up a cached answer. Returns None if not cached or expired.
    pub fn get(&mut self, name: &str, record_type: u16) -> Option<&Vec<ResourceRecord>> {
        let key = (name.to_lowercase(), record_type);

        // Check expiry
        if let Some(entry) = self.entries.get(&key) {
            if Instant::now() < entry.expires_at {
                return Some(&entry.records);
            }
            // Expired — remove it
        }
        self.entries.remove(&key);
        None
    }

    /// Store records in the cache with TTL-based expiry.
    pub fn put(&mut self, name: &str, record_type: u16, records: Vec<ResourceRecord>) {
        let ttl = records.iter().map(|r| r.ttl).min().unwrap_or(300);
        let entry = CacheEntry {
            records,
            expires_at: Instant::now() + Duration::from_secs(ttl as u64),
        };
        self.entries.insert((name.to_lowercase(), record_type), entry);
    }

    /// Number of entries currently in the cache.
    pub fn len(&self) -> usize {
        self.entries.len()
    }
}
```

The cache key is `(name, record_type)` — querying `google.com` for A and AAAA are separate cache entries. The TTL is the minimum TTL across all records in the answer (conservative — we expire when the shortest-lived record expires).

### 16.2 — Integrate with the resolver

Pass a `&mut DnsCache` into the `resolve` function. Before starting the recursive walk, check the cache. After getting an answer, store it:

```rust
pub fn resolve(name: &str, record_type: RecordType, cache: &mut DnsCache) -> Result<Vec<ResourceRecord>, ResolveError> {
    // Check cache first
    if let Some(cached) = cache.get(name, record_type.to_u16()) {
        eprintln!("  [cache hit] {}", name);
        return Ok(cached.clone());
    }

    // ... existing recursive resolution ...

    // Cache the result
    if !answers.is_empty() {
        cache.put(name, record_type.to_u16(), answers.clone());
    }

    Ok(answers)
}
```

### 16.3 — Test it

```bash
# First query — full recursive resolution
cargo run -- google.com
# [0] Asking 198.41.0.4...
# → referred to 192.5.6.30
# ...
# google.com  300  IN  A  142.250.80.46

# Second query — cache hit (instant)
cargo run -- google.com
# [cache hit] google.com
# google.com  300  IN  A  142.250.80.46
```

The second query returns instantly — no network traffic at all.

> [!check] Checkpoint
> Resolve a domain twice. Verify the second resolution is a cache hit with no network queries. Stage 16 complete.

---

## Stage 17 — Negative Caching

> *Difficulty: Medium — Caching "this domain doesn't exist."*

When a domain doesn't exist (NXDOMAIN), we should cache that fact too. Otherwise, every typo triggers a full recursive walk from the root. The SOA record in the authority section of an NXDOMAIN response tells us how long to cache the negative answer.

> [!tip] What You'll Learn
> - Negative caching — storing NXDOMAIN results
> - The SOA minimum TTL field
> - Why negative caching matters (typos, probing, DDoS mitigation)

### 17.1 — Cache NXDOMAIN

Add a negative cache entry type:

```rust
enum CacheValue {
    Records(Vec<ResourceRecord>),
    NxDomain, // domain does not exist
}

struct CacheEntry {
    value: CacheValue,
    expires_at: Instant,
}
```

When the resolver gets NXDOMAIN, extract the SOA minimum TTL from the authority section and cache the negative result:

```rust
// In the resolver, when we get NXDOMAIN:
Err(ResolveError::NxDomain(ref name)) => {
    // Cache the negative result using SOA minimum TTL (default 300s)
    cache.put_negative(name, record_type.to_u16(), soa_minimum_ttl);
}
```

### 17.2 — Test it

```bash
cargo run -- thisdoesnotexist12345.com
# NXDOMAIN (full recursive walk)

cargo run -- thisdoesnotexist12345.com
# [cache hit: NXDOMAIN] thisdoesnotexist12345.com
```

> [!check] Checkpoint
> Query a non-existent domain twice. Verify the second query is a cached NXDOMAIN. Stage 17 complete.

---

## Stage 18 — Cache Poisoning

> *Difficulty: Medium — Why trusting any response is dangerous.*

A DNS cache poisoning attack works like this: an attacker sends a forged response to your resolver before the real response arrives. If the forged response has the right transaction ID, your resolver caches the attacker's answer — sending users to a malicious IP address. This stage explains the attack and implements defenses.

> [!tip] What You'll Learn
> - How cache poisoning works
> - Transaction ID randomization
> - Bailiwick checking (only accept answers for the domain you asked about)
> - Why DNSSEC exists (and why we won't implement it)

### 18.1 — Randomize transaction IDs

Replace our simple timestamp-based ID with a cryptographically random one:

```rust
fn rand_id() -> u16 {
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hasher};
    let s = RandomState::new();
    let mut h = s.build_hasher();
    h.write_u64(std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos() as u64);
    h.finish() as u16
}
```

This isn't cryptographically secure, but it's much harder to predict than a simple timestamp. Production resolvers use OS-level randomness (`/dev/urandom`).

### 18.2 — Bailiwick checking

Only accept records that are "in bailiwick" — the server for `.com` can give you NS records for `google.com`, but it shouldn't be giving you A records for `evil.example.org`. Add a check:

```rust
/// Check if a record is in bailiwick for the query.
/// A record for "ns1.google.com" is in bailiwick when querying "google.com"
/// but not when querying "example.org".
fn is_in_bailiwick(record_name: &str, query_name: &str) -> bool {
    let record = record_name.to_lowercase();
    let query = query_name.to_lowercase();
    record.ends_with(&query) || query.ends_with(&record)
}
```

### 18.3 — Verify response ID

Always check that the response ID matches the query ID:

```rust
if header.id != id {
    eprintln!("  Warning: response ID mismatch (expected 0x{:04x}, got 0x{:04x})", id, header.id);
    continue; // ignore this response, wait for the real one
}
```

> [!note] Why DNSSEC exists
> Transaction ID randomization and bailiwick checking make poisoning harder but not impossible. DNSSEC (DNS Security Extensions) adds cryptographic signatures to DNS records, making forgery detectable. Implementing DNSSEC is beyond this course's scope, but understanding *why* it exists is important — it's the definitive solution to cache poisoning.

> [!check] Checkpoint
> Verify your resolver uses random transaction IDs and checks response IDs. Understand bailiwick checking. Stage 18 complete.

---

## Stage 19 — Measuring Performance

> *Difficulty: Easy — Timing queries and measuring cache effectiveness.*

Before optimizing further, let's measure. How long does a cold resolution take? How much does caching help? This stage adds timing to every query so you can see the performance impact of each feature.

> [!tip] What You'll Learn
> - `Instant::now()` for precise timing
> - Measuring cache hit rates
> - Comparing cold vs warm resolution times

### 19.1 — Add timing

```rust
use std::time::Instant;

let start = Instant::now();
let result = resolver::resolve(&name, record_type, &mut cache);
let elapsed = start.elapsed();

println!(";; Query time: {:.1}ms", elapsed.as_secs_f64() * 1000.0);
println!(";; Cache entries: {}", cache.len());
```

### 19.2 — Test it

```bash
cargo run -- google.com
# ;; Query time: 45.2ms (cold — 3 network hops)

cargo run -- google.com
# ;; Query time: 0.01ms (cached — no network)
```

The difference is dramatic — 45ms vs 0.01ms. Caching turns a multi-hop network operation into a hash table lookup.

> [!check] Checkpoint
> Measure cold and cached resolution times. Verify cached queries are orders of magnitude faster. Stage 19 complete.

---

## Stage 20 — Concurrent Queries

> *Difficulty: Hard — Async UDP with tokio for handling multiple queries.*

Our resolver is synchronous — it can only handle one query at a time. A real DNS server needs to handle hundreds of concurrent queries. This stage introduces `tokio` for async I/O, allowing multiple queries to be in flight simultaneously.

> [!tip] What You'll Learn
> - `tokio` runtime and `#[tokio::main]`
> - `tokio::net::UdpSocket` — async UDP
> - `Arc<Mutex<>>` for shared cache access
> - Why async matters for network servers

### 20.1 — Add tokio

```toml
[dependencies]
tokio = { version = "1", features = ["full"] }
```

### 20.2 — Convert to async

The key changes:
- `UdpSocket::bind` → `tokio::net::UdpSocket::bind`
- `socket.send_to` → `socket.send_to().await`
- `socket.recv_from` → `socket.recv_from().await`
- `fn main()` → `#[tokio::main] async fn main()`
- Cache wrapped in `Arc<Mutex<DnsCache>>` for shared access

```rust
use std::sync::{Arc, Mutex};
use tokio::net::UdpSocket;

#[tokio::main]
async fn main() {
    let cache = Arc::new(Mutex::new(DnsCache::new()));
    // ... use cache.lock().unwrap() to access
}
```

The resolver functions become `async fn` and use `.await` on socket operations. The logic is identical — only the I/O calls change.

> [!warning] Common Mistake
> **Using `std::net::UdpSocket` inside async code.** The standard library's socket blocks the entire tokio thread. Always use `tokio::net::UdpSocket` in async contexts.

> [!check] Checkpoint
> Convert the resolver to async with tokio. Verify it still resolves domains correctly. Stage 20 complete.

---

## Stage 21 — The Local Server

> *Difficulty: Medium — Running as a DNS server that other programs can query.*

The ultimate test: run the Cartógrafo as a local DNS server on port 5353, then point `dig` or `nslookup` at it. Other programs send DNS queries to your server, and your server resolves them recursively from the root.

> [!tip] What You'll Learn
> - Binding a UDP server socket
> - Receiving queries from external programs
> - Sending responses back to the client
> - Building a response packet from scratch

### 21.1 — The server loop

```rust
async fn run_server(cache: Arc<Mutex<DnsCache>>) -> std::io::Result<()> {
    let socket = UdpSocket::bind("127.0.0.1:5353").await?;
    println!("Cartógrafo listening on 127.0.0.1:5353");

    let mut buf = [0u8; 512];
    loop {
        let (size, client_addr) = socket.recv_from(&mut buf).await?;

        // Parse the incoming query
        let header = protocol::Header::from_bytes(&buf);
        let mut parser = protocol::PacketParser::new(&buf[..size]);
        parser.pos = 12;
        let question = parser.read_question();

        let record_type = protocol::RecordType::from_u16(question.record_type)
            .unwrap_or(protocol::RecordType::A);

        println!("Query from {}: {} type {:?}", client_addr, question.name, record_type);

        // Resolve
        let mut cache_lock = cache.lock().unwrap();
        let answers = resolver::resolve(&question.name, record_type, &mut cache_lock)
            .unwrap_or_default();
        drop(cache_lock);

        // Build response
        let response = protocol::build_response(header.id, &question.name, &answers);
        socket.send_to(&response, client_addr).await?;
    }
}
```

### 21.2 — Build a response packet

Add to `src/protocol.rs`:

```rust
/// Build a DNS response packet.
pub fn build_response(id: u16, name: &str, answers: &[ResourceRecord]) -> Vec<u8> {
    let mut header = Header::new_query(id);
    header.is_response = true;
    header.recursion_available = true;
    header.answer_count = answers.len() as u16;

    let mut packet = header.to_bytes();

    // Echo the question
    packet.extend_from_slice(&encode_name(name));
    packet.extend_from_slice(&RecordType::A.to_u16().to_be_bytes());
    packet.extend_from_slice(&1u16.to_be_bytes()); // class IN

    // Write answer records
    for record in answers {
        packet.extend_from_slice(&encode_name(&record.name));
        packet.extend_from_slice(&record.record_type.to_be_bytes());
        packet.extend_from_slice(&record.class.to_be_bytes());
        packet.extend_from_slice(&record.ttl.to_be_bytes());
        packet.extend_from_slice(&(record.data.len() as u16).to_be_bytes());
        packet.extend_from_slice(&record.data);
    }

    packet
}
```

### 21.3 — Test it

In one terminal:

```bash
cargo run -- server
# Cartógrafo listening on 127.0.0.1:5353
```

In another terminal:

```bash
dig @127.0.0.1 -p 5353 google.com
```

```
;; ANSWER SECTION:
google.com.		300	IN	A	142.250.80.46

;; Query time: 47 msec
;; SERVER: 127.0.0.1#5353
```

`dig` sent a query to your server. Your server resolved it from the root servers and sent back the answer. You built a DNS server.

```bash
# Second query — cached
dig @127.0.0.1 -p 5353 google.com
# ;; Query time: 0 msec
```

> [!check] Checkpoint
> Run the server and query it with `dig`. Verify it resolves domains and caches results. Stage 21 complete.

---

## Act 3 Complete — The Cache

You built a caching recursive DNS server. It starts from the root, follows referrals, caches answers with TTL expiry, handles NXDOMAIN, defends against basic cache poisoning, runs asynchronously, and serves queries to external programs.

| Concept | Where You Used It |
|---------|-------------------|
| `HashMap` with timestamps | TTL-based cache |
| `Arc<Mutex<>>` | Shared cache in async context |
| `tokio` async runtime | Concurrent query handling |
| Security thinking | Transaction ID randomization, bailiwick checking |
| Server architecture | UDP listen loop, query parsing, response building |

**Next up — Act 4: The Complete Map.** TCP fallback for large responses, EDNS for modern DNS, a polished CLI, and the final integration test.
