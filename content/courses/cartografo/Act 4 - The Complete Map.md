# Act 4 — The Complete Map

> *The Cartógrafo resolves, caches, and serves. This final act adds the finishing touches: TCP for large responses, EDNS for modern DNS features, a polished CLI, and the satisfaction of seeing your resolver handle anything the internet throws at it.*

```mermaid
flowchart LR
    S22["Stage 22 - TCP"] --> S23["Stage 23 - EDNS"]
    S23 --> S24["Stage 24 - CLI"]
    S24 --> S25["Stage 25 - Pretty Output"]
    S25 --> S26["Stage 26 - Config"]
    S26 --> S27["Stage 27 - Integration"]
    style S22 fill:#49a,stroke:#333
    style S27 fill:#a4e,stroke:#333
```

---

## Stage 22 — TCP Fallback

> *Difficulty: Medium — When UDP isn't enough.*

*~50 min*

DNS over UDP is limited to 512 bytes (without EDNS). Some responses — especially TXT records with SPF policies or DNSSEC signatures — exceed this limit. When a response is truncated (the TC flag is set), the resolver must retry over TCP. TCP DNS uses a simple framing: a 2-byte length prefix before each message.

> [!tip] What You'll Learn
> - The TC (truncated) flag and when it's set
> - TCP DNS framing — 2-byte length prefix
> - `TcpStream` for connection-oriented queries
> - Why DNS uses UDP by default and TCP as fallback

### Why the 2-byte length prefix?

UDP is a datagram protocol — each `send_to` is one complete message. TCP is a stream protocol — bytes flow continuously with no message boundaries. The receiver doesn't know where one DNS message ends and the next begins. The 2-byte length prefix solves this: read 2 bytes to get the message length, then read exactly that many bytes.

```
UDP:  [DNS message]                    ← one packet = one message
TCP:  [2-byte len][DNS message]        ← length prefix tells you where the message ends
```

### Try it yourself — TCP query function

Implement `query_tcp` that sends a DNS query over TCP and returns the response:

```rust
/// Send a DNS query over TCP and return the response bytes.
async fn query_tcp(server: &str, query: &[u8]) -> Result<Vec<u8>, ResolveError> {
    todo!()
}
```

Steps:
1. Connect to `server:53` with `TcpStream::connect`
2. Send: 2-byte big-endian length + query bytes
3. Receive: 2-byte big-endian length, then that many bytes
4. Return the response bytes

Use `tokio::net::TcpStream` and `tokio::io::{AsyncReadExt, AsyncWriteExt}`.

<details>
<summary>Solution</summary>

```rust
use tokio::net::TcpStream;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

async fn query_tcp(server: &str, query: &[u8]) -> Result<Vec<u8>, ResolveError> {
    let mut stream = TcpStream::connect(format!("{}:53", server)).await
        .map_err(ResolveError::Network)?;

    // Send: 2-byte length + query
    let len = (query.len() as u16).to_be_bytes();
    stream.write_all(&len).await.map_err(ResolveError::Network)?;
    stream.write_all(query).await.map_err(ResolveError::Network)?;

    // Receive: 2-byte length + response
    let mut len_buf = [0u8; 2];
    stream.read_exact(&mut len_buf).await.map_err(ResolveError::Network)?;
    let response_len = u16::from_be_bytes(len_buf) as usize;

    let mut response = vec![0u8; response_len];
    stream.read_exact(&mut response).await.map_err(ResolveError::Network)?;

    Ok(response)
}
```

</details>

### 22.2 — Retry on truncation

Update `query_server` to fall back to TCP when the response is truncated:

```rust
// After receiving a UDP response and parsing the header:
if header.truncated {
    eprintln!("  Response truncated, retrying over TCP...");
    let tcp_buf = query_tcp(server, &query).await?;
    // Re-parse from tcp_buf instead of the UDP buf
    let header = Header::from_bytes(&tcp_buf)
        .map_err(|e| ResolveError::ServerFail(e))?;
    let mut parser = PacketParser::new(&tcp_buf);
    parser.pos = 12;
    // ... parse sections as before ...
}
```

### Tests

```rust
#[test]
fn test_tcp_framing() {
    // Verify our length prefix encoding
    let query = vec![0u8; 28]; // a 28-byte query
    let len_bytes = (query.len() as u16).to_be_bytes();
    assert_eq!(len_bytes, [0x00, 0x1C]); // 28 in big-endian

    // Verify decoding
    let decoded_len = u16::from_be_bytes(len_bytes) as usize;
    assert_eq!(decoded_len, 28);
}
```

### Extend it

Query `google.com` for TXT records — these are often large enough to trigger truncation over UDP. Verify that your TCP fallback retrieves the full response. Compare the response size over UDP (truncated) vs TCP (complete).

> [!check] Checkpoint
> Query a domain with large TXT records. If truncated, verify TCP fallback retrieves the full response. Run `cargo test`. Stage 22 complete.

---

## Stage 23 — EDNS(0)

> *Difficulty: Medium — Extended DNS for larger packets and modern features.*

*~50 min*

EDNS (Extension Mechanisms for DNS) lifts the 512-byte UDP limit. By adding an OPT pseudo-record to the additional section, the client tells the server "I can handle responses up to 4096 bytes over UDP." This reduces TCP fallbacks dramatically.

> [!tip] What You'll Learn
> - The OPT pseudo-record format
> - Advertising a larger UDP buffer size
> - The DO (DNSSEC OK) flag
> - Why EDNS is essential for modern DNS

### The OPT record

The OPT record is a "pseudo-record" — it doesn't represent real DNS data. It's a signaling mechanism added to the additional section:

| Field | Value | Meaning |
|-------|-------|---------|
| NAME | `0x00` (root) | Always empty |
| TYPE | 41 | OPT record type |
| CLASS | 4096 | UDP payload size we can handle |
| TTL | 0 | Extended RCODE + flags (we set all to 0) |
| RDLENGTH | 0 | No options |

### Try it yourself — append_edns

Write a function that appends an EDNS OPT record to a query packet:

```rust
/// Append an EDNS(0) OPT record to a query packet.
pub fn append_edns(packet: &mut Vec<u8>) {
    todo!()
}
```

The OPT record is 11 bytes: 1 (name) + 2 (type) + 2 (class/UDP size) + 4 (TTL/flags) + 2 (rdlength).

<details>
<summary>Solution</summary>

```rust
pub fn append_edns(packet: &mut Vec<u8>) {
    packet.push(0x00);                                    // name (root)
    packet.extend_from_slice(&41u16.to_be_bytes());       // type OPT
    packet.extend_from_slice(&4096u16.to_be_bytes());     // UDP payload size
    packet.extend_from_slice(&0u32.to_be_bytes());        // extended RCODE + flags
    packet.extend_from_slice(&0u16.to_be_bytes());        // RDLENGTH (no options)
}
```

</details>

### 23.2 — Update build_query

```rust
pub fn build_query(id: u16, name: &str, record_type: RecordType) -> Vec<u8> {
    let mut header = Header::new_query(id);
    header.additional_count = 1; // EDNS OPT record
    let mut packet = header.to_bytes();

    packet.extend_from_slice(&encode_name(name));
    packet.extend_from_slice(&record_type.to_u16().to_be_bytes());
    packet.extend_from_slice(&1u16.to_be_bytes()); // class IN

    append_edns(&mut packet);
    packet
}
```

### 23.3 — Increase the receive buffer

```rust
// Change from 512 to 4096 everywhere you have a receive buffer
let mut buf = [0u8; 4096];
```

### Tests

```rust
#[test]
fn test_edns_opt_record() {
    let mut packet = Vec::new();
    append_edns(&mut packet);

    assert_eq!(packet.len(), 11);
    assert_eq!(packet[0], 0x00);                          // root name
    assert_eq!(&packet[1..3], &41u16.to_be_bytes());      // type OPT
    assert_eq!(&packet[3..5], &4096u16.to_be_bytes());    // UDP size
}

#[test]
fn test_build_query_with_edns() {
    let query = build_query(0x1234, "example.com", RecordType::A);
    // Header says 1 additional record
    assert_eq!(&query[10..12], &[0x00, 0x01]); // ARCOUNT = 1
    // Last 11 bytes should be the OPT record
    let opt_start = query.len() - 11;
    assert_eq!(query[opt_start], 0x00); // root name
}
```

### Extend it

When parsing responses, skip OPT records in the additional section (type 41) instead of trying to parse them as normal records. OPT records have a different format — the "class" field is the UDP payload size, not a network class.

> [!check] Checkpoint
> Add EDNS to queries. Verify the query packet includes an OPT record. Run `cargo test`. Stage 23 complete.

---

## Stage 24 — The CLI

> *Difficulty: Easy — A polished command-line interface with clap.*

*~40 min*

Time to replace our ad-hoc argument parsing with a proper CLI. The Cartógrafo should have two modes: `resolve` (one-shot query) and `server` (run as a local DNS server).

> [!tip] What You'll Learn
> - `clap` derive macros for CLI parsing
> - Subcommands and arguments
> - Default values and optional flags

### 24.1 — Add clap

Add to `Cargo.toml`:

```toml
[dependencies]
clap = { version = "4", features = ["derive"] }
```

### 24.2 — The CLI struct

```rust
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "cartografo", about = "A DNS resolver built from scratch")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Resolve a domain name
    Resolve {
        /// Domain name to resolve
        name: String,

        /// Record type (A, AAAA, MX, TXT, NS, CNAME)
        #[arg(short = 't', long = "type", default_value = "A")]
        record_type: String,

        /// Show the resolution trace
        #[arg(long)]
        trace: bool,
    },

    /// Run as a local DNS server
    Server {
        /// Address to bind to
        #[arg(short, long, default_value = "127.0.0.1:5353")]
        bind: String,
    },

    /// Show cache statistics
    Cache,
}
```

### 24.3 — Wire it up

```rust
#[tokio::main]
async fn main() {
    let cli = Cli::parse();

    match cli.command {
        Commands::Resolve { name, record_type, trace } => {
            let rt = parse_record_type(&record_type);
            let mut cache = DnsCache::new();

            let start = Instant::now();
            match resolver::resolve(&name, rt, &mut cache).await {
                Ok(answers) => {
                    let elapsed = start.elapsed();
                    for record in &answers {
                        println!("{}\t{}\tIN\t{}\t{}",
                            record.name, record.ttl,
                            record_type_name(record.record_type),
                            record.data_string(&[])); // TODO: pass packet for compression
                    }
                    println!("\n;; Query time: {:.1}ms", elapsed.as_secs_f64() * 1000.0);
                }
                Err(e) => eprintln!("Error: {}", e),
            }
        }
        Commands::Server { bind } => {
            let cache = Arc::new(Mutex::new(DnsCache::new()));
            run_server(&bind, cache).await.expect("Server failed");
        }
        Commands::Cache => {
            println!("Cache statistics not available in one-shot mode.");
            println!("Run 'cartografo server' to see cache stats.");
        }
    }
}

fn parse_record_type(s: &str) -> RecordType {
    match s.to_uppercase().as_str() {
        "A" => RecordType::A,
        "AAAA" => RecordType::AAAA,
        "MX" => RecordType::MX,
        "TXT" => RecordType::TXT,
        "NS" => RecordType::NS,
        "CNAME" => RecordType::CNAME,
        _ => {
            eprintln!("Unknown record type '{}', defaulting to A", s);
            RecordType::A
        }
    }
}

fn record_type_name(t: u16) -> &'static str {
    match t {
        1 => "A", 2 => "NS", 5 => "CNAME", 6 => "SOA",
        15 => "MX", 16 => "TXT", 28 => "AAAA", _ => "?",
    }
}
```

### 24.4 — Test it

```bash
cargo run -- resolve google.com
cargo run -- resolve google.com -t MX
cargo run -- resolve google.com -t AAAA --trace
cargo run -- server
cargo run -- server --bind 127.0.0.1:5300
```

### Extend it

Add a `--server` flag to the `resolve` subcommand that lets the user query a specific DNS server instead of starting from root. For example: `cartografo resolve google.com --server 1.1.1.1`.

> [!check] Checkpoint
> Verify `cartografo resolve google.com`, `cartografo resolve google.com -t MX`, and `cartografo server` all work. Stage 24 complete.

---

## Stage 25 — Pretty Output

> *Difficulty: Easy — Colored output and query tracing.*

*~35 min*

Raw output is functional but hard to scan. This stage adds color, formatting, and an optional `--trace` flag that shows every step of the recursive walk — like `dig +trace` but from your own resolver.

> [!tip] What You'll Learn
> - The `colored` crate for terminal colors
> - Formatting DNS output in the standard `dig`-like format
> - Trace mode — showing every hop in the resolution

### 25.1 — Add colored

```toml
[dependencies]
colored = "2"
```

### 25.2 — Colored output

```rust
use colored::Colorize;

fn print_record(record: &ResourceRecord, packet: &[u8]) {
    let type_str = match record.record_type {
        1 => "A".green(),
        28 => "AAAA".cyan(),
        5 => "CNAME".yellow(),
        15 => "MX".magenta(),
        16 => "TXT".blue(),
        2 => "NS".white(),
        _ => "?".dimmed(),
    };
    println!("{}\t{}\tIN\t{}\t{}",
        record.name, record.ttl, type_str, record.data_string(packet));
}

fn print_timing(elapsed: std::time::Duration, cache: &DnsCache) {
    println!("\n;; Query time: {}",
        format!("{:.1}ms", elapsed.as_secs_f64() * 1000.0).dimmed());
    println!(";; Cache: {} entries, {:.0}% hit rate",
        cache.len(), cache.hit_rate());
}
```

### 25.3 — Trace mode

When `--trace` is passed, the resolver should print each step. Add a `trace: bool` parameter to `resolve` that enables verbose output:

```
;; Resolving google.com (A) from root...

→ 198.41.0.4 (a.root-servers.net)
  ← REFERRAL: com. → 192.5.6.30 (a.gtld-servers.net)
→ 192.5.6.30 (a.gtld-servers.net)
  ← REFERRAL: google.com. → 216.239.34.10 (ns2.google.com)
→ 216.239.34.10 (ns2.google.com)
  ← ANSWER: google.com. A 142.250.80.46

google.com	300	IN	A	142.250.80.46

;; Query time: 47.3ms
;; Hops: 3
```

### Try it yourself

Implement the trace output by collecting trace entries in a `Vec<String>` during resolution (you already have this from Stage 11). When `trace` is true, print them before the answer. When false, suppress them.

### Extend it

Add a `--json` flag that outputs the answer in JSON format instead of the `dig`-like table. Use `serde_json` or just format it manually:

```json
{"name": "google.com", "type": "A", "ttl": 300, "data": "142.250.80.46"}
```

> [!check] Checkpoint
> Run with `--trace` and verify each hop is displayed. Verify colors work in the terminal. Stage 25 complete.

---

## Stage 26 — Configuration

> *Difficulty: Medium — Config file for customizing resolver behavior.*

*~45 min*

A config file lets users customize the bind address, cache size, upstream fallback servers, and logging level without recompiling.

> [!tip] What You'll Learn
> - Reading a TOML config file with `serde`
> - Default values with `#[serde(default)]`
> - Separating configuration from code

### 26.1 — Add dependencies

```toml
[dependencies]
serde = { version = "1", features = ["derive"] }
toml = "0.8"
```

### 26.2 — Config struct

Create `src/config.rs`:

```rust
use serde::Deserialize;
use std::path::Path;

#[derive(Debug, Deserialize)]
#[serde(default)]
pub struct Config {
    pub server: ServerConfig,
    pub cache: CacheConfig,
    pub resolver: ResolverConfig,
}

#[derive(Debug, Deserialize)]
#[serde(default)]
pub struct ServerConfig {
    pub bind: String,
}

#[derive(Debug, Deserialize)]
#[serde(default)]
pub struct CacheConfig {
    pub max_entries: usize,
    pub negative_ttl: u32,
}

#[derive(Debug, Deserialize)]
#[serde(default)]
pub struct ResolverConfig {
    pub upstream: Option<String>,
    pub timeout_ms: u64,
    pub max_retries: u32,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            server: ServerConfig::default(),
            cache: CacheConfig::default(),
            resolver: ResolverConfig::default(),
        }
    }
}

impl Default for ServerConfig {
    fn default() -> Self {
        ServerConfig { bind: "127.0.0.1:5353".to_string() }
    }
}

impl Default for CacheConfig {
    fn default() -> Self {
        CacheConfig { max_entries: 10000, negative_ttl: 300 }
    }
}

impl Default for ResolverConfig {
    fn default() -> Self {
        ResolverConfig {
            upstream: None,
            timeout_ms: 3000,
            max_retries: 2,
        }
    }
}

impl Config {
    pub fn load(path: &Path) -> Result<Self, String> {
        if !path.exists() {
            return Ok(Config::default());
        }
        let content = std::fs::read_to_string(path)
            .map_err(|e| format!("Failed to read config: {}", e))?;
        toml::from_str(&content)
            .map_err(|e| format!("Failed to parse config: {}", e))
    }
}
```

### 26.3 — Config file

`cartografo.toml`:

```toml
[server]
bind = "127.0.0.1:5353"

[cache]
max_entries = 10000
negative_ttl = 300

[resolver]
timeout_ms = 3000
max_retries = 2
```

### Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = Config::default();
        assert_eq!(config.server.bind, "127.0.0.1:5353");
        assert_eq!(config.cache.max_entries, 10000);
        assert_eq!(config.resolver.timeout_ms, 3000);
    }

    #[test]
    fn test_parse_partial_config() {
        let toml = r#"
            [server]
            bind = "0.0.0.0:53"
        "#;
        let config: Config = toml::from_str(toml).unwrap();
        assert_eq!(config.server.bind, "0.0.0.0:53");
        // Other fields should be defaults
        assert_eq!(config.cache.max_entries, 10000);
    }
}
```

### Extend it

Add a `--config` flag to the CLI that specifies the config file path (default: `cartografo.toml` in the current directory). Load the config at startup and pass relevant values to the resolver and server.

> [!check] Checkpoint
> Create a config file. Verify the server reads it and applies the settings. Run `cargo test`. Stage 26 complete.

---

## Stage 27 — The Complete Cartógrafo

> *Difficulty: Medium — Integration testing and the full workflow.*

*~50 min*

The final stage. Run the Cartógrafo through a comprehensive test: resolve 20+ domains of varying complexity, verify against `dig`, measure performance, and confirm everything works together.

> [!tip] What You'll Learn
> - End-to-end integration testing
> - Comparing your resolver against `dig`
> - Performance benchmarking
> - What you've actually built

### 27.1 — The test suite

Create `tests/integration.rs` (Rust's convention for integration tests — files in the `tests/` directory):

```rust
// tests/integration.rs
// These tests require network access — they query real DNS servers.

use std::process::Command;

fn resolve(domain: &str) -> String {
    let output = Command::new("cargo")
        .args(["run", "-q", "--", "resolve", domain])
        .output()
        .expect("Failed to run cartografo");
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

fn dig_short(domain: &str) -> String {
    let output = Command::new("dig")
        .args(["+short", domain])
        .output()
        .expect("Failed to run dig");
    String::from_utf8_lossy(&output.stdout)
        .lines().next().unwrap_or("").trim().to_string()
}

#[test]
#[ignore] // Run with: cargo test -- --ignored
fn test_resolve_google() {
    let result = resolve("google.com");
    assert!(result.contains("IN\tA\t"), "Expected A record, got: {}", result);
}

#[test]
#[ignore]
fn test_resolve_nxdomain() {
    let output = Command::new("cargo")
        .args(["run", "-q", "--", "resolve", "thisdoesnotexist12345.com"])
        .output()
        .expect("Failed to run");
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("NXDOMAIN"), "Expected NXDOMAIN, got: {}", stderr);
}
```

### 27.2 — The shell test script

```bash
#!/bin/bash
# test_resolver.sh — compare cartografo against dig

DOMAINS=(
    "google.com"
    "amazon.com"
    "github.com"
    "rust-lang.org"
    "en.wikipedia.org"
    "www.github.com"
    "mail.google.com"
    "thisdoesnotexist12345.com"
)

echo "=== Cartógrafo vs dig ==="
echo ""
pass=0
fail=0

for domain in "${DOMAINS[@]}"; do
    our_result=$(cargo run -q -- resolve "$domain" 2>/dev/null | grep -oP '\d+\.\d+\.\d+\.\d+' | head -1)
    dig_result=$(dig +short "$domain" | grep -oP '\d+\.\d+\.\d+\.\d+' | head -1)

    if [ "$domain" = "thisdoesnotexist12345.com" ]; then
        # Expect NXDOMAIN
        our_err=$(cargo run -q -- resolve "$domain" 2>&1 | grep -c "NXDOMAIN")
        if [ "$our_err" -gt 0 ]; then
            printf "  %-30s ✓  NXDOMAIN\n" "$domain"
            ((pass++))
        else
            printf "  %-30s ✗  Expected NXDOMAIN\n" "$domain"
            ((fail++))
        fi
        continue
    fi

    if [ -n "$our_result" ]; then
        printf "  %-30s ✓  %s\n" "$domain" "$our_result"
        ((pass++))
    else
        printf "  %-30s ✗  (no result, dig says: %s)\n" "$domain" "$dig_result"
        ((fail++))
    fi
done

echo ""
echo "Results: $pass passed, $fail failed"
```

```bash
chmod +x test_resolver.sh
./test_resolver.sh
```

### 27.3 — What you built

| Component | What it does |
|-----------|-------------|
| Packet builder | Constructs DNS queries byte by byte, with EDNS |
| Packet parser | Reads DNS responses with compression support |
| Recursive resolver | Walks from root servers to authoritative answer |
| CNAME follower | Resolves alias chains |
| Cache | TTL-based with negative caching and hit rate tracking |
| Security | Random IDs, bailiwick checking, response ID verification |
| TCP fallback | Handles truncated responses |
| EDNS | 4096-byte UDP support |
| Server mode | Accepts queries from `dig` and other programs |
| CLI | `clap`-based with subcommands, flags, and colored output |
| Config | TOML config file with serde deserialization |

### 27.4 — What you understand now

- **Bytes are just numbers.** `u16::from_be_bytes([0x01, 0x00])` is 256. That's all endianness is.
- **Binary protocols are structured data.** A DNS packet is a struct serialized to bytes with known offsets. No different from JSON — just more compact.
- **The internet has a hierarchy.** 13 root servers → TLD servers → authoritative servers. Every domain name resolution follows this path.
- **Caching is essential.** Without it, every query would start from the root. With it, most queries are instant.
- **Security is an afterthought bolted on.** DNS was designed in 1983 with no security. Transaction ID randomization and bailiwick checking are patches. DNSSEC is the real fix.
- **Ownership makes code safe.** Rust's borrow checker prevented dangling pointers in `PacketParser`, ensured thread-safe cache access with `Arc<Mutex<>>`, and caught use-after-move bugs at compile time.

The map is complete. You are the cartographer now.

> [!check] Checkpoint
> Run the test suite. Verify your resolver matches `dig` for all test domains. Stage 27 complete.

---

## Course Complete — The Cartógrafo

You built a recursive DNS resolver from scratch. You placed every byte in every query. You parsed every byte in every response. You walked the DNS hierarchy from root to answer. You cached results, handled errors, defended against poisoning, and served queries to other programs.

Binary protocols are no longer mysterious. Bytes are no longer scary. The next time someone says "it's a 32-bit big-endian unsigned integer at offset 6," you'll know exactly what to do.

| Rust Concept | Where You Used It |
|-------------|-------------------|
| Byte manipulation | Every stage — `to_be_bytes`, `from_be_bytes`, bitwise ops |
| Structs with methods | `Header`, `ResourceRecord`, `PacketParser`, `DnsCache`, `Config` |
| Enums with data | `RecordType`, `ResolveError`, `CacheValue`, `Commands` |
| Lifetimes | `PacketParser<'a>`, `CacheResult<'a>` |
| Ownership & borrowing | `String` vs `&str`, `.to_vec()`, `&mut self` |
| `HashMap` | DNS cache with TTL expiry |
| `Arc<Mutex<>>` | Shared cache in async server |
| `tokio` async | Concurrent query handling, async UDP/TCP |
| Result / ? operator | Error propagation throughout the codebase |
| Custom error types | `ResolveError` with `Display` |
| Module system | `mod`, `pub`, `crate::`, multi-file organization |
| Testing | `#[test]`, `#[cfg(test)]`, integration tests, `cargo test` |
| Derive macros | `Debug`, `Clone`, `Parser`, `Deserialize` |
| Serde | TOML config deserialization |
| Binary parsing | DNS wire format, name compression, record types |
| Network programming | UDP sockets, TCP streams, server loops |
