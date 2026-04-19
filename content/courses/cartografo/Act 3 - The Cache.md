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

*~55 min*

Every DNS answer includes a TTL (Time To Live) — the number of seconds you're allowed to cache it. After the TTL expires, you must re-query. This stage builds an in-memory cache that stores answers and automatically expires them.

> [!tip] What You'll Learn
> - Cache design with `HashMap` and timestamps
> - TTL-based expiry
> - Cache lookup before recursive resolution
> - Why caching is essential (root servers handle 100,000+ queries per second)

### 16.1 — The cache struct

Create `src/cache.rs` (and add `mod cache;` to `main.rs`):

```rust
use crate::protocol::ResourceRecord;
use std::collections::HashMap;
use std::time::{Duration, Instant};

struct CacheEntry {
    records: Vec<ResourceRecord>,
    expires_at: Instant,
}

pub struct DnsCache {
    entries: HashMap<(String, u16), CacheEntry>,
}
```

The cache key is `(name, record_type)` — querying `google.com` for A and AAAA are separate cache entries.

### Try it yourself — implement the cache

Implement three methods:

```rust
impl DnsCache {
    pub fn new() -> Self { todo!() }

    /// Look up a cached answer. Returns None if not cached or expired.
    pub fn get(&mut self, name: &str, record_type: u16) -> Option<&Vec<ResourceRecord>> {
        todo!()
    }

    /// Store records with TTL-based expiry (use the minimum TTL across all records).
    pub fn put(&mut self, name: &str, record_type: u16, records: Vec<ResourceRecord>) {
        todo!()
    }
}
```

Key decisions:
- Normalize the name to lowercase (DNS is case-insensitive)
- Use `Instant::now()` for timestamps (monotonic clock, not wall clock)
- Use the minimum TTL across all records (conservative — expire when the shortest-lived record expires)
- Remove expired entries on `get` (lazy expiry)

<details>
<summary>Solution</summary>

```rust
impl DnsCache {
    pub fn new() -> Self {
        DnsCache { entries: HashMap::new() }
    }

    pub fn get(&mut self, name: &str, record_type: u16) -> Option<&Vec<ResourceRecord>> {
        let key = (name.to_lowercase(), record_type);

        if let Some(entry) = self.entries.get(&key) {
            if Instant::now() < entry.expires_at {
                return Some(&entry.records);
            }
        }
        self.entries.remove(&key);
        None
    }

    pub fn put(&mut self, name: &str, record_type: u16, records: Vec<ResourceRecord>) {
        let ttl = records.iter().map(|r| r.ttl).min().unwrap_or(300);
        let entry = CacheEntry {
            records,
            expires_at: Instant::now() + Duration::from_secs(ttl as u64),
        };
        self.entries.insert((name.to_lowercase(), record_type), entry);
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }
}
```

</details>

> [!warning] Using `&mut self` for `get`
> `get` takes `&mut self` even though it's a "read" operation. That's because it removes expired entries — a mutation. If you tried `&self`, you'd get:
> ```
> error[E0596]: cannot borrow `*self` as mutable, as it is behind a `&` reference
>   --> src/cache.rs:20:9
>    |
> 20 |         self.entries.remove(&key);
>    |         ^^^^^^^^^^^^^^^^^^^^^^^^^ `self` is a `&` reference, so the data it refers to cannot be borrowed as mutable
> ```
> This is Rust's borrow checker protecting you — it won't let you mutate data through an immutable reference. The fix is `&mut self`, which is honest about what the method does.

### 16.2 — Integrate with the resolver

Pass a `&mut DnsCache` into the `resolve` function. Before starting the recursive walk, check the cache. After getting an answer, store it:

```rust
pub fn resolve(
    name: &str, record_type: RecordType, cache: &mut DnsCache,
) -> Result<Vec<ResourceRecord>, ResolveError> {
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

### Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::ResourceRecord;

    fn make_record(name: &str, ttl: u32) -> ResourceRecord {
        ResourceRecord {
            name: name.to_string(),
            record_type: 1,
            class: 1,
            ttl,
            data: vec![1, 2, 3, 4],
            data_offset: 0,
        }
    }

    #[test]
    fn test_cache_hit() {
        let mut cache = DnsCache::new();
        cache.put("google.com", 1, vec![make_record("google.com", 300)]);

        assert!(cache.get("google.com", 1).is_some());
        assert!(cache.get("google.com", 28).is_none()); // different type
    }

    #[test]
    fn test_cache_case_insensitive() {
        let mut cache = DnsCache::new();
        cache.put("Google.COM", 1, vec![make_record("google.com", 300)]);

        assert!(cache.get("google.com", 1).is_some());
        assert!(cache.get("GOOGLE.COM", 1).is_some());
    }
}
```

### Extend it

Add a `pub fn clear(&mut self)` method and a `pub fn remove_expired(&mut self) -> usize` method that proactively removes all expired entries and returns how many were removed. Write tests for both.

> [!check] Checkpoint
> Resolve a domain twice. Verify the second resolution is a cache hit with no network queries. Run `cargo test`. Stage 16 complete.

---

## Stage 17 — Negative Caching

> *Difficulty: Medium — Caching "this domain doesn't exist."*

*~40 min*

When a domain doesn't exist (NXDOMAIN), we should cache that fact too. Otherwise, every typo triggers a full recursive walk from the root. The SOA record in the authority section of an NXDOMAIN response tells us how long to cache the negative answer.

> [!tip] What You'll Learn
> - Negative caching — storing NXDOMAIN results
> - The SOA minimum TTL field
> - Rust enums with data — `CacheValue` variants

### 17.1 — Cache NXDOMAIN

Replace the simple `CacheEntry` with a value enum:

```rust
enum CacheValue {
    Records(Vec<ResourceRecord>),
    NxDomain,
}

struct CacheEntry {
    value: CacheValue,
    expires_at: Instant,
}
```

Add methods for negative caching:

```rust
impl DnsCache {
    pub fn put_negative(&mut self, name: &str, record_type: u16, ttl: u32) {
        let entry = CacheEntry {
            value: CacheValue::NxDomain,
            expires_at: Instant::now() + Duration::from_secs(ttl as u64),
        };
        self.entries.insert((name.to_lowercase(), record_type), entry);
    }

    pub fn get(&mut self, name: &str, record_type: u16) -> Option<CacheResult> {
        let key = (name.to_lowercase(), record_type);

        if let Some(entry) = self.entries.get(&key) {
            if Instant::now() < entry.expires_at {
                return match &entry.value {
                    CacheValue::Records(records) => Some(CacheResult::Records(records)),
                    CacheValue::NxDomain => Some(CacheResult::NxDomain),
                };
            }
        }
        self.entries.remove(&key);
        None
    }
}

pub enum CacheResult<'a> {
    Records(&'a Vec<ResourceRecord>),
    NxDomain,
}
```

Update the resolver to cache NXDOMAIN responses:

```rust
// In resolve(), when catching NxDomain:
Err(ResolveError::NxDomain(ref name)) => {
    cache.put_negative(name, record_type.to_u16(), 300); // default 300s
    return Err(ResolveError::NxDomain(name.clone()));
}
```

### Tests

```rust
#[test]
fn test_negative_cache() {
    let mut cache = DnsCache::new();
    cache.put_negative("doesnotexist.example", 1, 60);

    match cache.get("doesnotexist.example", 1) {
        Some(CacheResult::NxDomain) => {} // expected
        other => panic!("Expected NxDomain, got {:?}", other.is_some()),
    }
}
```

### Extend it

Extract the SOA minimum TTL from the authority section of NXDOMAIN responses instead of hardcoding 300 seconds. The SOA record's last u32 field is the minimum TTL. If no SOA is present, fall back to 300.

> [!check] Checkpoint
> Query a non-existent domain twice. Verify the second query is a cached NXDOMAIN. Run `cargo test`. Stage 17 complete.

---

## Stage 18 — Cache Poisoning

> *Difficulty: Medium — Why trusting any response is dangerous.*

*~45 min*

A DNS cache poisoning attack works like this: an attacker sends a forged response to your resolver before the real response arrives. If the forged response has the right transaction ID, your resolver caches the attacker's answer — sending users to a malicious IP address. This stage explains the attack and implements defenses.

> [!tip] What You'll Learn
> - How cache poisoning works
> - Transaction ID randomization
> - Bailiwick checking (only accept answers for the domain you asked about)
> - Why DNSSEC exists (and why we won't implement it)

### 18.1 — Randomize transaction IDs

Replace our simple timestamp-based ID with a harder-to-predict one:

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

Only accept records that are "in bailiwick" — the server for `.com` can give you NS records for `google.com`, but it shouldn't be giving you A records for `evil.example.org`:

```rust
/// Check if a record is in bailiwick for the query.
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
    eprintln!("  Warning: response ID mismatch (expected 0x{:04x}, got 0x{:04x})",
        id, header.id);
    continue; // ignore this response, wait for the real one
}
```

### Tests

```rust
#[test]
fn test_bailiwick_checking() {
    assert!(is_in_bailiwick("ns1.google.com", "google.com"));
    assert!(is_in_bailiwick("google.com", "google.com"));
    assert!(!is_in_bailiwick("evil.example.org", "google.com"));
}
```

> [!note] Why DNSSEC exists
> Transaction ID randomization and bailiwick checking make poisoning harder but not impossible. DNSSEC (DNS Security Extensions) adds cryptographic signatures to DNS records, making forgery detectable. Implementing DNSSEC is beyond this course's scope, but understanding *why* it exists is important — it's the definitive solution to cache poisoning.

> [!check] Checkpoint
> Verify your resolver uses random transaction IDs and checks response IDs. Run `cargo test`. Stage 18 complete.

---

## Stage 19 — Measuring Performance

> *Difficulty: Easy — Timing queries and measuring cache effectiveness.*

*~30 min*

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

**Python comparison:** `Instant::now()` is like `time.monotonic()` — a monotonic clock that can't go backwards (unlike wall clock time which can jump due to NTP adjustments). Always use monotonic time for measuring durations.

### Try it yourself — cache hit rate tracker

Add a `hits: u64` and `misses: u64` field to `DnsCache`. Increment `hits` in `get` when a valid entry is found, `misses` when not. Add a `pub fn hit_rate(&self) -> f64` method that returns the percentage. Display it after each query.

<details>
<summary>Solution</summary>

```rust
pub struct DnsCache {
    entries: HashMap<(String, u16), CacheEntry>,
    hits: u64,
    misses: u64,
}

impl DnsCache {
    pub fn hit_rate(&self) -> f64 {
        let total = self.hits + self.misses;
        if total == 0 { 0.0 } else { self.hits as f64 / total as f64 * 100.0 }
    }
}
```

</details>

### 19.2 — Test it

```bash
cargo run -- google.com
# ;; Query time: 45.2ms (cold — 3 network hops)
# ;; Cache: 1 entries, 0.0% hit rate

cargo run -- google.com
# ;; Query time: 0.01ms (cached — no network)
# ;; Cache: 1 entries, 100.0% hit rate
```

> [!check] Checkpoint
> Measure cold and cached resolution times. Verify cached queries are orders of magnitude faster. Stage 19 complete.

---

## Stage 20 — Concurrent Queries

> *Difficulty: Hard — Async UDP with tokio for handling multiple queries.*

*~75 min*

Our resolver is synchronous — it can only handle one query at a time. A real DNS server needs to handle hundreds of concurrent queries. This stage introduces `tokio` for async I/O, allowing multiple queries to be in flight simultaneously.

> [!tip] What You'll Learn
> - `tokio` runtime and `#[tokio::main]`
> - `tokio::net::UdpSocket` — async UDP
> - `Arc<Mutex<>>` for shared cache access
> - Why async matters for network servers

### Concept: Async and why it matters

Our current resolver blocks the entire thread while waiting for a DNS response (up to 3 seconds per timeout). If we're running a server handling 100 concurrent queries, we'd need 100 threads — wasteful.

Async lets one thread handle many concurrent operations. While waiting for a UDP response, the thread can process other queries. `tokio` is Rust's most popular async runtime.

**Python comparison:** This is exactly like Python's `asyncio`. `async def` → `async fn`. `await` → `.await`. `asyncio.run()` → `#[tokio::main]`. The concepts are identical; the syntax is slightly different.

### 20.1 — Add tokio

Add to `Cargo.toml`:

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

### Concept: Arc<Mutex<T>> — shared mutable state

When multiple async tasks need to access the cache, we need two things:
1. **Shared ownership** — multiple tasks hold a reference to the same cache. `Arc` (Atomic Reference Counted) provides this.
2. **Mutual exclusion** — only one task can modify the cache at a time. `Mutex` provides this.

```rust
use std::sync::{Arc, Mutex};

let cache = Arc::new(Mutex::new(DnsCache::new()));

// Clone the Arc to share with another task (cheap — just increments a counter)
let cache_clone = Arc::clone(&cache);

// Lock the mutex to access the cache
let mut cache_lock = cache.lock().unwrap();
cache_lock.put("google.com", 1, records);
drop(cache_lock); // release the lock explicitly (or let it drop at end of scope)
```

**Python comparison:** `Arc` is like Python's reference counting (which happens automatically). `Mutex` is like `threading.Lock()`. In Python you'd write:
```python
cache_lock = threading.Lock()
with cache_lock:
    cache["google.com"] = records
```

> [!warning] Using `std::net::UdpSocket` inside async code
> The standard library's socket blocks the entire tokio thread while waiting. Always use `tokio::net::UdpSocket` in async contexts. If you accidentally use `std::net::UdpSocket`, your server will handle queries one at a time despite being "async."

### 20.3 — Convert query_server to async

```rust
use tokio::net::UdpSocket;
use tokio::time::timeout;

pub async fn query_server(
    server: &str, name: &str, record_type: RecordType,
) -> Result<DnsResponse, ResolveError> {
    let id = rand_id();
    let query = protocol::build_query(id, name, record_type);

    let socket = UdpSocket::bind("0.0.0.0:0").await
        .map_err(ResolveError::Network)?;

    for attempt in 0..3 {
        socket.send_to(&query, format!("{}:53", server)).await
            .map_err(ResolveError::Network)?;

        let mut buf = [0u8; 512];
        match timeout(
            std::time::Duration::from_secs(3),
            socket.recv_from(&mut buf),
        ).await {
            Ok(Ok((size, _))) => {
                // ... same parsing logic as before ...
                let header = Header::from_bytes(&buf)
                    .map_err(|e| ResolveError::ServerFail(e))?;
                // ... parse sections ...
                return Ok(DnsResponse { header, answers, authorities, additionals });
            }
            Ok(Err(e)) => return Err(ResolveError::Network(e)),
            Err(_) => {
                if attempt < 2 {
                    eprintln!("  Timeout from {}, retrying ({}/3)...", server, attempt + 2);
                    continue;
                }
                return Err(ResolveError::Timeout(server.to_string()));
            }
        }
    }

    Err(ResolveError::Timeout(server.to_string()))
}
```

The `resolve` and `resolve_name` functions also become `async fn` with `.await` on `query_server` calls.

### Extend it

Resolve 5 different domains concurrently using `tokio::join!` or `tokio::spawn`. Measure the total time vs resolving them sequentially. With concurrent resolution, 5 queries should take roughly the same time as 1 (they're all waiting for network I/O in parallel).

> [!check] Checkpoint
> Convert the resolver to async with tokio. Verify it still resolves domains correctly. Stage 20 complete.

---

## Stage 21 — The Local Server

> *Difficulty: Medium — Running as a DNS server that other programs can query.*

*~55 min*

The ultimate test: run the Cartógrafo as a local DNS server on port 5353, then point `dig` or `nslookup` at it. Other programs send DNS queries to your server, and your server resolves them recursively from the root.

> [!tip] What You'll Learn
> - Binding a UDP server socket
> - Receiving queries from external programs
> - Building a response packet from scratch
> - Sending responses back to the client

### Try it yourself — build_response

Before building the server, implement the response packet builder. A DNS response is:
1. Header (with `is_response: true`, matching ID, answer count set)
2. Echoed question section
3. Answer records

```rust
/// Build a DNS response packet.
pub fn build_response(id: u16, name: &str, record_type: RecordType, answers: &[ResourceRecord]) -> Vec<u8> {
    todo!()
}
```

Hint: reuse `Header::new_query` but flip `is_response` to `true` and set `answer_count`. Then append the question (encoded name + type + class) and each answer record (encoded name + type + class + TTL + rdlength + rdata).

<details>
<summary>Solution</summary>

```rust
pub fn build_response(
    id: u16, name: &str, record_type: RecordType, answers: &[ResourceRecord],
) -> Vec<u8> {
    let mut header = Header::new_query(id);
    header.is_response = true;
    header.recursion_available = true;
    header.answer_count = answers.len() as u16;

    let mut packet = header.to_bytes();

    // Echo the question
    packet.extend_from_slice(&encode_name(name));
    packet.extend_from_slice(&record_type.to_u16().to_be_bytes());
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

</details>

### 21.1 — The server loop

```rust
async fn run_server(cache: Arc<Mutex<DnsCache>>) -> std::io::Result<()> {
    let socket = UdpSocket::bind("127.0.0.1:5353").await?;
    println!("Cartógrafo listening on 127.0.0.1:5353");

    let mut buf = [0u8; 512];
    loop {
        let (size, client_addr) = socket.recv_from(&mut buf).await?;

        let header = protocol::Header::from_bytes(&buf)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        let mut parser = protocol::PacketParser::new(&buf[..size]);
        parser.pos = 12;
        let question = parser.read_question()
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;

        let record_type = protocol::RecordType::from_u16(question.record_type)
            .unwrap_or(protocol::RecordType::A);

        println!("Query from {}: {} type {:?}", client_addr, question.name, record_type);

        // Resolve
        let answers = {
            let mut cache_lock = cache.lock().unwrap();
            resolver::resolve(&question.name, record_type, &mut cache_lock)
                .await
                .unwrap_or_default()
        };

        // Build and send response
        let response = protocol::build_response(
            header.id, &question.name, record_type, &answers,
        );
        socket.send_to(&response, client_addr).await?;
    }
}
```

### 21.2 — Test it

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

### Tests

```rust
#[test]
fn test_build_response_round_trip() {
    let record = ResourceRecord {
        name: "example.com".to_string(),
        record_type: 1,
        class: 1,
        ttl: 300,
        data: vec![93, 184, 216, 34],
        data_offset: 0,
    };

    let response = build_response(0x1234, "example.com", RecordType::A, &[record]);

    // Parse it back
    let header = Header::from_bytes(&response).unwrap();
    assert!(header.is_response);
    assert_eq!(header.id, 0x1234);
    assert_eq!(header.answer_count, 1);
}
```

### Extend it

Spawn each incoming query as a separate `tokio::spawn` task so the server can handle multiple queries concurrently. Right now it processes them sequentially in the loop. With `tokio::spawn`, a slow resolution won't block other queries.

> [!check] Checkpoint
> Run the server and query it with `dig`. Verify it resolves domains and caches results. Run `cargo test`. Stage 21 complete.

---

## Act 3 Complete — The Cache

You built a caching recursive DNS server. It starts from the root, follows referrals, caches answers with TTL expiry, handles NXDOMAIN, defends against basic cache poisoning, runs asynchronously, and serves queries to external programs.

| Concept | Where You Used It |
|---------|-------------------|
| `HashMap` with timestamps | TTL-based cache with lazy expiry |
| Enum variants with data | `CacheValue::Records` vs `CacheValue::NxDomain` |
| `Arc<Mutex<>>` | Shared cache in async context |
| `tokio` async runtime | Concurrent query handling |
| Lifetimes | `CacheResult<'a>` borrowing cached records |
| Security thinking | Transaction ID randomization, bailiwick checking |
| Server architecture | UDP listen loop, query parsing, response building |
| Performance measurement | `Instant` timing, cache hit rates |

**Next up — Act 4: The Complete Map.** TCP fallback for large responses, EDNS for modern DNS, a polished CLI, and the final integration test.
