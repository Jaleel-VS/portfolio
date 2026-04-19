# Reference Guide

> *Quick reference for DNS protocol details, byte manipulation patterns, Rust networking, and project patterns.*

---

## DNS Packet Format (RFC 1035)

### Header (12 bytes)

```
Byte 0-1:   ID (transaction identifier)
Byte 2-3:   Flags (QR, Opcode, AA, TC, RD, RA, Z, RCODE)
Byte 4-5:   QDCOUNT (number of questions)
Byte 6-7:   ANCOUNT (number of answers)
Byte 8-9:   NSCOUNT (number of authority records)
Byte 10-11: ARCOUNT (number of additional records)
```

### Flags (16 bits)

```
Bit 15:    QR (0=query, 1=response)
Bit 11-14: Opcode (0=standard query)
Bit 10:    AA (authoritative answer)
Bit 9:     TC (truncated)
Bit 8:     RD (recursion desired)
Bit 7:     RA (recursion available)
Bit 4-6:   Z (reserved, must be 0)
Bit 0-3:   RCODE (response code)
```

### Name Encoding

```
google.com → [6] g o o g l e [3] c o m [0]
```

- Each label prefixed with its length (1 byte, max 63)
- Terminated by a zero-length label (0x00)
- Total name max 253 bytes

### Name Compression

```
Pointer: top 2 bits = 11, bottom 14 bits = byte offset
0xC00C = pointer to offset 12
```

- Normal label: first byte 0-63 (length)
- Pointer: first byte ≥ 192 (0xC0) — top 2 bits set
- Offset: `((byte1 & 0x3F) << 8) | byte2`
- After following a pointer, cursor advances by 2 bytes (not by the name length)

### Resource Record

```
NAME:     variable (or compression pointer)
TYPE:     2 bytes
CLASS:    2 bytes (usually 1 = IN)
TTL:      4 bytes (seconds to cache)
RDLENGTH: 2 bytes
RDATA:    variable (RDLENGTH bytes)
```

---

## Record Types

| Type | Value | RDATA Format |
|------|-------|-------------|
| A | 1 | 4 bytes → IPv4 address |
| NS | 2 | Compressed domain name |
| CNAME | 5 | Compressed domain name |
| SOA | 6 | MNAME + RNAME + serial + refresh + retry + expire + minimum |
| MX | 15 | 2-byte priority + compressed domain name |
| TXT | 16 | One or more length-prefixed strings |
| AAAA | 28 | 16 bytes → IPv6 address |
| OPT | 41 | EDNS pseudo-record (variable options) |

---

## Response Codes (RCODE)

| Code | Name | Meaning |
|------|------|---------|
| 0 | NOERROR | Success |
| 1 | FORMERR | Format error (malformed query) |
| 2 | SERVFAIL | Server failure |
| 3 | NXDOMAIN | Domain does not exist |
| 4 | NOTIMP | Not implemented |
| 5 | REFUSED | Query refused (policy) |

---

## Byte Manipulation Cheat Sheet

### Numbers ↔ Bytes

```rust
// Write a u16 to a packet (big-endian / network byte order)
let value: u16 = 256;
buf.extend_from_slice(&value.to_be_bytes()); // [0x01, 0x00]

// Read a u16 from a packet
let value = u16::from_be_bytes([buf[0], buf[1]]); // 256

// u32
let ttl: u32 = 300;
buf.extend_from_slice(&ttl.to_be_bytes()); // [0x00, 0x00, 0x01, 0x2C]
let ttl = u32::from_be_bytes([buf[0], buf[1], buf[2], buf[3]]);
```

### Bitwise Operations

```rust
// Extract bit N from a u16
let bit = (flags >> N) & 1;

// Extract N bits starting at position P
let bits = (flags >> P) & ((1 << N) - 1);

// Set bit N
flags |= 1 << N;

// Clear bit N
flags &= !(1 << N);
```

### Hex Formatting

```rust
println!("{:02x}", byte);        // "0a" (2-digit hex, zero-padded)
println!("{:04x}", u16_val);     // "0100" (4-digit hex)
println!("{:02x?}", &buf[..4]);  // [0a, 0b, 0c, 0d] (slice as hex)
```

---

## Rust Module System

### File → Module mapping

```
src/
├── main.rs          ← crate root, declares modules with `mod`
├── protocol.rs      ← `mod protocol;` in main.rs
├── resolver.rs      ← `mod resolver;` in main.rs
├── roots.rs         ← `mod roots;` in main.rs
├── cache.rs         ← `mod cache;` in main.rs
└── config.rs        ← `mod config;` in main.rs
```

### Key rules

```rust
// main.rs — declare modules
mod protocol;   // loads src/protocol.rs
mod resolver;   // loads src/resolver.rs

// protocol.rs — mark items as public
pub struct Header { ... }     // visible from other modules
pub fn encode_name() { ... }  // visible from other modules
fn private_helper() { ... }   // only visible within protocol.rs

// resolver.rs — reference other modules
use crate::protocol::{self, Header, RecordType};  // import from protocol
use crate::roots;                                   // import roots module
```

### Common errors

| Error | Cause | Fix |
|-------|-------|-----|
| `use of undeclared module` | Missing `mod foo;` in main.rs | Add `mod foo;` |
| `struct is private` | Missing `pub` on struct/fn | Add `pub` |
| `unresolved import` | Wrong path | Use `crate::module::Item` |

---

## Testing Patterns

### Unit tests (same file as code)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_something() {
        assert_eq!(1 + 1, 2);
    }

    #[test]
    fn test_error_case() {
        let result = Header::from_bytes(&[0x00; 5]);
        assert!(result.is_err());
    }
}
```

### Integration tests (tests/ directory)

```rust
// tests/integration.rs
#[test]
#[ignore] // skip by default, run with: cargo test -- --ignored
fn test_network_query() {
    // tests that need network access
}
```

### Running tests

```bash
cargo test                    # all unit tests
cargo test protocol           # tests in protocol module
cargo test test_header        # tests matching "test_header"
cargo test -- --ignored       # include #[ignore] tests
```

---

## Error Handling Patterns

### The progression

```rust
// Stage 1-2: .expect() — crashes with a message (OK for main/tests)
let socket = UdpSocket::bind("0.0.0.0:0").expect("bind failed");

// Stage 3+: Result + ? — propagates errors to caller (library code)
fn parse(buf: &[u8]) -> Result<Header, String> {
    if buf.len() < 12 {
        return Err("buffer too short".to_string());
    }
    Ok(Header { ... })
}

// Stage 15+: Custom error enum — typed errors you can match on
enum ResolveError {
    NxDomain(String),
    Timeout(String),
    Network(std::io::Error),
}
```

### Converting between error types

```rust
// io::Error → ResolveError
socket.bind("0.0.0.0:0").map_err(ResolveError::Network)?;

// String → ResolveError
header.from_bytes(&buf).map_err(|e| ResolveError::ServerFail(e))?;

// Option → Result
get_referral_ip(&response).ok_or_else(|| "no referral".to_string())?;
```

---

## Networking Patterns

### UDP (std — synchronous)

```rust
use std::net::UdpSocket;

let socket = UdpSocket::bind("0.0.0.0:0")?;
socket.set_read_timeout(Some(Duration::from_secs(5)))?;
socket.send_to(&query, "8.8.8.8:53")?;

let mut buf = [0u8; 4096];
let (size, addr) = socket.recv_from(&mut buf)?;
```

### UDP (tokio — async)

```rust
use tokio::net::UdpSocket;

let socket = UdpSocket::bind("0.0.0.0:0").await?;
socket.send_to(&query, "8.8.8.8:53").await?;

let mut buf = [0u8; 4096];
let (size, addr) = socket.recv_from(&mut buf).await?;
```

### TCP DNS Framing

```rust
use tokio::net::TcpStream;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

let mut stream = TcpStream::connect("8.8.8.8:53").await?;

// Send: 2-byte length prefix + message
stream.write_all(&(query.len() as u16).to_be_bytes()).await?;
stream.write_all(&query).await?;

// Receive: 2-byte length prefix + message
let mut len_buf = [0u8; 2];
stream.read_exact(&mut len_buf).await?;
let len = u16::from_be_bytes(len_buf) as usize;
let mut response = vec![0u8; len];
stream.read_exact(&mut response).await?;
```

### Shared state in async (Arc<Mutex<T>>)

```rust
use std::sync::{Arc, Mutex};

let cache = Arc::new(Mutex::new(DnsCache::new()));
let cache_clone = Arc::clone(&cache); // cheap — increments ref count

// Lock to access
let mut lock = cache.lock().unwrap();
lock.put("google.com", 1, records);
drop(lock); // release explicitly, or let it drop at end of scope
```

---

## The 13 Root Servers

| Letter | Operator | IPv4 |
|--------|----------|------|
| A | Verisign | 198.41.0.4 |
| B | USC-ISI | 170.247.170.2 |
| C | Cogent | 192.33.4.12 |
| D | U of Maryland | 199.7.91.13 |
| E | NASA | 192.203.230.10 |
| F | ISC | 192.5.5.241 |
| G | US DoD | 192.112.36.4 |
| H | US Army | 198.97.190.53 |
| I | Netnod (Sweden) | 192.36.148.17 |
| J | Verisign | 192.58.128.30 |
| K | RIPE NCC | 193.0.14.129 |
| L | ICANN | 199.7.83.42 |
| M | WIDE (Japan) | 202.12.27.33 |

---

## Useful Commands

```bash
# Query with dig (compare against your resolver)
dig google.com
dig @8.8.8.8 google.com
dig +trace google.com          # show full resolution path
dig +short google.com          # just the answer
dig google.com MX              # specific record type
dig google.com TXT

# Query with nslookup
nslookup google.com
nslookup -type=MX google.com

# Query your local server
dig @127.0.0.1 -p 5353 google.com

# Run your resolver
cargo run -- resolve google.com
cargo run -- resolve google.com -t MX --trace
cargo run -- server
cargo run -- server --bind 127.0.0.1:5300
```

---

## Cargo.toml

```toml
[package]
name = "cartografo"
version = "0.1.0"
edition = "2024"

[dependencies]
tokio = { version = "1", features = ["full"] }
clap = { version = "4", features = ["derive"] }
colored = "2"
serde = { version = "1", features = ["derive"] }
toml = "0.8"
```

No DNS libraries. The entire protocol is implemented by hand.

---

## Ownership Quick Reference

| Situation | Pattern | Why |
|-----------|---------|-----|
| Function reads data | `fn foo(buf: &[u8])` | Borrow — don't need ownership |
| Function modifies data | `fn foo(buf: &mut Vec<u8>)` | Mutable borrow |
| Struct stores data | `data: Vec<u8>` | Own it — struct outlives the source |
| Struct references data | `buf: &'a [u8]` | Borrow with lifetime — efficient but constrained |
| Loop reassigns a string | `let mut s = name.to_string()` | Own it — can't reassign a borrow |
| Shared across threads | `Arc<Mutex<T>>` | Shared ownership + mutual exclusion |
| Copy from borrow to owned | `.to_vec()`, `.to_string()` | Clone the data |
