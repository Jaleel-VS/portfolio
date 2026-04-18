# Forja Reference Guide

> Companion quick-reference for the Forja course — building an HTTP server from scratch in Rust.
> Keep this open alongside the course modules.

---

## 1. Rust Cheat Sheet

### Variables, Mutability & Shadowing

```rust
let x = 5;           // immutable (default)
let mut y = 10;      // mutable
let x = x + 1;       // shadowing — new binding, can change type
let x = "now a str"; // still valid — shadow with different type
```

| Concept | Python | TypeScript | Rust |
|---------|--------|-----------|------|
| Immutable binding | `x = 5` (convention) | `const x = 5` | `let x = 5;` |
| Mutable binding | `x = 5` (default) | `let x = 5` | `let mut x = 5;` |
| Shadowing | ❌ | ❌ | `let x = x + 1;` |
| Type annotation | `x: int = 5` | `let x: number = 5` | `let x: i32 = 5;` |
| Constants | `X = 5` (UPPER) | `const X = 5` | `const X: i32 = 5;` |

### Functions, Closures & Return Values

```rust
// Function — last expression is the return value (no semicolon)
fn add(a: i32, b: i32) -> i32 {
    a + b
}

// Closure (like Python lambda / TS arrow function)
let add = |a, b| a + b;
let greet = |name: &str| -> String {
    format!("Hello, {name}")
};

// Closure capturing environment
let factor = 3;
let multiply = |x| x * factor;  // captures `factor` by reference
let take_it = move |x| x * factor; // captures by value (moves)
```

| Python | TypeScript | Rust |
|--------|-----------|------|
| `def add(a, b): return a + b` | `const add = (a, b) => a + b` | `fn add(a: i32, b: i32) -> i32 { a + b }` |
| `lambda x: x * 2` | `(x) => x * 2` | `\|x\| x * 2` |

### Ownership, Borrowing & Lifetimes

```
OWNERSHIP RULES:
  1. Each value has exactly one owner
  2. When the owner goes out of scope, the value is dropped
  3. You can transfer ownership (move) or lend it (borrow)
```

```
  MOVE (transfer ownership)
  ┌──────────┐    move    ┌──────────┐
  │  s1       │ ────────► │  s2       │
  │  (owner)  │           │  (owner)  │
  └──────────┘            └──────────┘
  s1 is INVALID                s2 owns it
  after move                   now

  let s1 = String::from("hello");
  let s2 = s1;    // s1 moved to s2
  // println!("{s1}");  ← COMPILE ERROR
```

```
  BORROW (immutable reference — can have many)
  ┌──────────┐  &borrow   ┌──────────┐
  │  owner    │ ◄───────── │  &ref1    │
  │  String   │ ◄───────── │  &ref2    │
  └──────────┘             └──────────┘
  owner keeps it           read-only access

  let s = String::from("hello");
  let r1 = &s;   // immutable borrow
  let r2 = &s;   // another — OK, many readers allowed
```

```
  MUTABLE BORROW (exclusive — only one at a time)
  ┌──────────┐  &mut      ┌──────────┐
  │  owner    │ ◄───────── │  &mut ref │
  └──────────┘             └──────────┘
  owner locked             exclusive read+write

  let mut s = String::from("hello");
  let r = &mut s;  // mutable borrow — only one allowed
  r.push_str(" world");
```

```
  LIFETIMES — tell the compiler how long references live

  fn longest<'a>(a: &'a str, b: &'a str) -> &'a str {
      if a.len() > b.len() { a } else { b }
  }
  // 'a means: the returned ref lives as long as the shorter input
```

### Structs, Enums & impl Blocks

```rust
// Struct (like TS interface + class, Python dataclass)
struct Request {
    method: String,
    path: String,
    headers: HashMap<String, String>,
}

impl Request {
    // Associated function (like static method)
    fn new(method: &str, path: &str) -> Self {
        Self {
            method: method.to_string(),
            path: path.to_string(),
            headers: HashMap::new(),
        }
    }

    // Method (takes &self)
    fn is_get(&self) -> bool {
        self.method == "GET"
    }
}

// Enum (tagged union — way more powerful than Python/TS enums)
enum Status {
    Ok,                          // unit variant
    NotFound,
    Error(String),               // holds data
    Redirect { url: String },    // named fields
}
```

### Pattern Matching

```rust
// match — must be exhaustive
match status {
    Status::Ok => println!("200"),
    Status::NotFound => println!("404"),
    Status::Error(msg) => println!("Error: {msg}"),
    Status::Redirect { url } => println!("→ {url}"),
}

// if let — when you only care about one variant
if let Some(value) = maybe_value {
    println!("Got: {value}");
}

// let-else (Rust 1.65+) — early return on mismatch
let Some(value) = maybe_value else {
    return Err("missing value".into());
};
```

### Error Handling

```rust
// Option — value might not exist (like null/None)
let maybe: Option<i32> = Some(42);
let nothing: Option<i32> = None;

// Result — operation might fail
let ok: Result<i32, String> = Ok(42);
let err: Result<i32, String> = Err("failed".into());

// ? operator — propagate errors (like try/except but at compile time)
fn read_file(path: &str) -> Result<String, std::io::Error> {
    let content = std::fs::read_to_string(path)?;  // returns Err early if fails
    Ok(content)
}

// unwrap — panic if Err/None (OK in tests, bad in production)
let val = some_result.unwrap();        // panics on Err
let val = some_result.expect("msg");   // panics with message
let val = some_result.unwrap_or(0);    // default on Err
```

| Method | On Err/None | Use when |
|--------|------------|----------|
| `?` | Returns error to caller | Production code |
| `.unwrap()` | Panics | Tests, prototyping |
| `.expect("msg")` | Panics with message | "This should never fail" |
| `.unwrap_or(default)` | Returns default | Fallback value known |
| `.unwrap_or_else(\|\| ...)` | Runs closure | Expensive default |

### Traits (Interfaces)

```rust
// Rust trait ≈ TS interface ≈ Python Protocol
trait Handler {
    fn handle(&self, req: &Request) -> Response;

    // Default implementation (optional)
    fn name(&self) -> &str { "unnamed" }
}

struct FileHandler { root: PathBuf }

impl Handler for FileHandler {
    fn handle(&self, req: &Request) -> Response {
        // ...
    }
}
```

| Python | TypeScript | Rust |
|--------|-----------|------|
| `class Protocol` | `interface Handler` | `trait Handler` |
| `class Foo(Protocol)` | `class Foo implements Handler` | `impl Handler for Foo` |
| Duck typing | Structural typing | Explicit `impl` |

### Generics

```rust
fn first<T>(items: &[T]) -> Option<&T> {
    items.first()
}

// With trait bounds (constraints)
fn print_all<T: std::fmt::Display>(items: &[T]) {
    for item in items {
        println!("{item}");
    }
}

// where clause (cleaner for multiple bounds)
fn process<T>(item: T) -> String
where
    T: Display + Debug + Clone,
{
    format!("{item}")
}
```

### Collections

| Type | Like (Python) | Like (TS) | Notes |
|------|--------------|-----------|-------|
| `Vec<T>` | `list` | `Array<T>` | Growable array |
| `HashMap<K,V>` | `dict` | `Map<K,V>` | Key-value store |
| `HashSet<T>` | `set` | `Set<T>` | Unique values |
| `String` | `str` | `string` | Owned, heap-allocated UTF-8 |
| `&str` | — | — | Borrowed string slice (view into a String) |

```rust
// String vs &str
let owned: String = String::from("hello");  // heap, owned, mutable
let slice: &str = "hello";                  // stack ref, borrowed, immutable
let slice2: &str = &owned;                  // borrow a String as &str
let owned2: String = slice.to_string();     // &str → String
```

### Iterator Patterns

```rust
let nums = vec![1, 2, 3, 4, 5];

// map + collect (like Python list comprehension / TS .map)
let doubled: Vec<i32> = nums.iter().map(|n| n * 2).collect();

// filter
let evens: Vec<&i32> = nums.iter().filter(|n| *n % 2 == 0).collect();

// chain operations
let result: Vec<String> = nums.iter()
    .filter(|n| *n > 2)
    .map(|n| format!("item-{n}"))
    .collect();

// find, any, all
let first_even = nums.iter().find(|n| *n % 2 == 0);  // Option<&i32>
let has_five = nums.iter().any(|n| *n == 5);           // bool

// fold (like Python reduce / TS .reduce)
let sum = nums.iter().fold(0, |acc, n| acc + n);

// enumerate (like Python enumerate)
for (i, val) in nums.iter().enumerate() {
    println!("{i}: {val}");
}
```

### Modules & use

```rust
// File structure = module structure
// src/
//   main.rs          ← crate root
//   router.rs        ← mod router
//   handlers/
//     mod.rs          ← mod handlers
//     static_files.rs ← handlers::static_files

// In main.rs:
mod router;       // loads router.rs
mod handlers;     // loads handlers/mod.rs

use router::Router;
use handlers::static_files::serve;

// Visibility
pub fn public_fn() {}     // accessible outside module
fn private_fn() {}        // module-private (default)
pub(crate) fn internal() {} // visible within crate only
```


---

## 2. HTTP Reference

### Request Format

```
GET /index.html HTTP/1.1\r\n          ← request line
Host: localhost:7878\r\n              ← headers (key: value)
User-Agent: curl/8.1.0\r\n
Accept: text/html\r\n
Connection: keep-alive\r\n
\r\n                                  ← empty line = end of headers
                                      ← body (optional, for POST/PUT)
```

Raw bytes (hex):
```
47 45 54 20 2f 69 6e 64 65 78 2e 68 74 6d 6c 20   GET /index.html
48 54 54 50 2f 31 2e 31 0d 0a                       HTTP/1.1\r\n
48 6f 73 74 3a 20 6c 6f 63 61 6c 68 6f 73 74 0d 0a Host: localhost\r\n
0d 0a                                               \r\n (end of headers)
```

### Response Format

```
HTTP/1.1 200 OK\r\n                   ← status line
Content-Type: text/html\r\n           ← headers
Content-Length: 45\r\n
Connection: keep-alive\r\n
\r\n                                  ← empty line = end of headers
<html><body>Hello Forja!</body></html> ← body
```

### HTTP Methods

| Method | Idempotent | Body | Purpose |
|--------|-----------|------|---------|
| `GET` | Yes | No | Retrieve a resource |
| `HEAD` | Yes | No | Like GET but headers only |
| `POST` | No | Yes | Create a resource / submit data |
| `PUT` | Yes | Yes | Replace a resource entirely |
| `PATCH` | No | Yes | Partial update |
| `DELETE` | Yes | Optional | Remove a resource |
| `OPTIONS` | Yes | No | CORS preflight / discover methods |

### Status Codes

**1xx — Informational**

| Code | Name | Meaning |
|------|------|---------|
| 100 | Continue | Client should continue sending body |
| 101 | Switching Protocols | Upgrading to WebSocket, HTTP/2, etc. |

**2xx — Success**

| Code | Name | Meaning |
|------|------|---------|
| 200 | OK | Request succeeded |
| 201 | Created | Resource created (POST) |
| 204 | No Content | Success, no body (DELETE) |

**3xx — Redirection**

| Code | Name | Meaning |
|------|------|---------|
| 301 | Moved Permanently | Resource moved, update bookmarks |
| 302 | Found | Temporary redirect |
| 304 | Not Modified | Use cached version |
| 307 | Temporary Redirect | Like 302 but preserves method |
| 308 | Permanent Redirect | Like 301 but preserves method |

**4xx — Client Error**

| Code | Name | Meaning |
|------|------|---------|
| 400 | Bad Request | Malformed request |
| 401 | Unauthorized | Authentication required |
| 403 | Forbidden | Authenticated but not allowed |
| 404 | Not Found | Resource doesn't exist |
| 405 | Method Not Allowed | Wrong HTTP method |
| 408 | Request Timeout | Client too slow |
| 413 | Payload Too Large | Body exceeds limit |
| 415 | Unsupported Media Type | Wrong Content-Type |
| 418 | I'm a Teapot | RFC 2324 (yes, really) |
| 429 | Too Many Requests | Rate limited |

**5xx — Server Error**

| Code | Name | Meaning |
|------|------|---------|
| 500 | Internal Server Error | Unhandled server error |
| 501 | Not Implemented | Method not supported |
| 502 | Bad Gateway | Upstream server error |
| 503 | Service Unavailable | Server overloaded / maintenance |
| 504 | Gateway Timeout | Upstream server timeout |

### Important Headers

| Header | Direction | Example | Purpose |
|--------|----------|---------|---------|
| `Host` | Request | `Host: example.com` | Virtual hosting — which domain |
| `User-Agent` | Request | `User-Agent: curl/8.1` | Client identification |
| `Accept` | Request | `Accept: text/html, application/json` | Preferred response format |
| `Accept-Encoding` | Request | `Accept-Encoding: gzip, deflate` | Supported compression |
| `Authorization` | Request | `Authorization: Bearer <token>` | Authentication credentials |
| `Content-Type` | Both | `Content-Type: application/json` | Body format |
| `Content-Length` | Both | `Content-Length: 348` | Body size in bytes |
| `Content-Encoding` | Response | `Content-Encoding: gzip` | Body compression used |
| `Transfer-Encoding` | Response | `Transfer-Encoding: chunked` | Chunked body transfer |
| `Connection` | Both | `Connection: keep-alive` | Connection persistence |
| `Cache-Control` | Both | `Cache-Control: max-age=3600` | Caching rules |
| `Access-Control-Allow-Origin` | Response | `Access-Control-Allow-Origin: *` | CORS — allowed origins |
| `Access-Control-Allow-Methods` | Response | `Access-Control-Allow-Methods: GET, POST` | CORS — allowed methods |
| `Access-Control-Allow-Headers` | Response | `Access-Control-Allow-Headers: Content-Type` | CORS — allowed headers |

### MIME Types

| Extension | MIME Type | Category |
|-----------|----------|----------|
| `.html` | `text/html` | Document |
| `.css` | `text/css` | Stylesheet |
| `.js` | `application/javascript` | Script |
| `.json` | `application/json` | Data |
| `.xml` | `application/xml` | Data |
| `.txt` | `text/plain` | Text |
| `.png` | `image/png` | Image |
| `.jpg` | `image/jpeg` | Image |
| `.gif` | `image/gif` | Image |
| `.svg` | `image/svg+xml` | Image |
| `.ico` | `image/x-icon` | Image |
| `.woff2` | `font/woff2` | Font |
| `.pdf` | `application/pdf` | Document |
| `.zip` | `application/zip` | Archive |
| `.wasm` | `application/wasm` | Binary |
| `(none)` | `application/octet-stream` | Fallback |


---

## 3. Networking Glossary

### TCP Fundamentals

**Socket** — an endpoint for communication: `(IP address, port)`. Your server creates a socket, binds it to a port, and listens for connections.

**Port** — a 16-bit number (0–65535) identifying a service on a host. Well-known: 80 (HTTP), 443 (HTTPS), 22 (SSH). Ephemeral: 49152–65535 (client-side, OS-assigned).

**Three-Way Handshake** — how TCP connections are established:

```
Client                    Server
  │                         │
  │──── SYN ───────────────►│  1. Client: "I want to connect"
  │                         │
  │◄─── SYN-ACK ───────────│  2. Server: "OK, I acknowledge"
  │                         │
  │──── ACK ───────────────►│  3. Client: "Confirmed, let's go"
  │                         │
  │◄───── data flow ───────►│  Connection established
```

**Connection Lifecycle:**

```
LISTEN → SYN_RECEIVED → ESTABLISHED → FIN_WAIT → CLOSED
  │                         │
  │  (server waiting)       │  (data exchange)
  │                         │
  └─── accept() ────────────┘
```

In Rust:
```rust
let listener = TcpListener::bind("127.0.0.1:7878")?;  // LISTEN
for stream in listener.incoming() {                     // accept()
    let stream = stream?;                               // ESTABLISHED
    handle_connection(stream);                           // data exchange
}                                                       // CLOSED on drop
```

### IP Addresses

| Address | Meaning | Use |
|---------|---------|-----|
| `127.0.0.1` | Loopback (localhost) | Only this machine can connect |
| `0.0.0.0` | All interfaces | Accept connections from anywhere |
| `::1` | IPv6 loopback | IPv6 localhost |
| `::` | IPv6 all interfaces | IPv6 equivalent of 0.0.0.0 |

**For development:** bind to `127.0.0.1:7878` (safe, local only).
**For production:** bind to `0.0.0.0:80` (accepts external traffic).

### DNS Resolution

```
Browser                 OS Resolver          DNS Server
  │                        │                     │
  │─ "example.com" ───────►│                     │
  │                        │─── query ──────────►│
  │                        │◄── 93.184.216.34 ──│
  │◄─ 93.184.216.34 ──────│                     │
  │                        │                     │
  │─── TCP connect to 93.184.216.34:443 ────────►
```

`/etc/hosts` overrides DNS — that's why `127.0.0.1 localhost` works.

### TLS/SSL Handshake

```
Client                           Server
  │                                │
  │── ClientHello ────────────────►│  Supported ciphers, TLS version
  │◄── ServerHello ────────────────│  Chosen cipher, certificate
  │                                │
  │  (client verifies certificate) │
  │                                │
  │── Key Exchange ───────────────►│  Shared secret established
  │◄── Finished ───────────────────│
  │                                │
  │◄══ Encrypted data flow ═══════►│  All traffic encrypted
```

In the course we use `rustls` (pure Rust TLS) instead of OpenSSL.

### Keep-Alive Connections

```
WITHOUT keep-alive (HTTP/1.0 default):
  connect → request → response → CLOSE
  connect → request → response → CLOSE   (new TCP handshake each time)

WITH keep-alive (HTTP/1.1 default):
  connect → request → response
         → request → response             (reuse same connection)
         → request → response → CLOSE
```

Header: `Connection: keep-alive` (request it) / `Connection: close` (end it).

### HTTP Version Differences

| Feature | HTTP/1.0 | HTTP/1.1 | HTTP/2 |
|---------|----------|----------|--------|
| Connections | One request per connection | Keep-alive (default) | Multiplexed streams |
| Host header | Optional | Required | Required (`:authority`) |
| Chunked transfer | No | Yes | Frames replace chunking |
| Pipelining | No | Yes (rarely used) | Multiplexing instead |
| Compression | No standard | Content-Encoding | Header compression (HPACK) |
| Binary | No (text) | No (text) | Yes (binary framing) |
| Server push | No | No | Yes |


---

## 4. AWS Service Mapping

Every concept you build by hand in this course has an AWS service equivalent. This table shows what you're re-implementing and why AWS built a managed service for it.

| Course Concept | AWS Service | What the Service Does |
|---|---|---|
| TCP listener (`TcpListener::bind`) | **ALB / NLB** | Accepts and load-balances TCP connections across targets |
| Request parsing | **ALB** | Parses HTTP requests, extracts headers, routes by path/host |
| URL routing | **API Gateway / ALB rules** | Maps request paths and methods to backend handlers |
| Route parameters (`/users/:id`) | **API Gateway path params** | Extracts variables from URL paths |
| Query string parsing | **API Gateway** | Parses and forwards query parameters |
| Request body parsing (JSON) | **API Gateway models** | Validates and transforms request bodies |
| Response building | **API Gateway response mapping** | Constructs HTTP responses with status, headers, body |
| Static file serving | **S3 + CloudFront** | Serves static assets from object storage via CDN |
| MIME type detection | **S3 Content-Type** | Auto-detects and sets Content-Type on objects |
| Thread pool | **ECS tasks / Lambda concurrency** | Manages compute capacity for concurrent requests |
| Async I/O (tokio) | **Lambda / Fargate** | Handles concurrent I/O without thread-per-request |
| Connection keep-alive | **ALB connection pooling** | Reuses TCP connections to reduce handshake overhead |
| Graceful shutdown | **ECS SIGTERM / Lambda extensions** | Drains in-flight requests before stopping |
| TLS termination | **ALB / CloudFront / ACM** | Handles HTTPS, manages certificates |
| Certificate generation | **ACM (Certificate Manager)** | Issues and auto-renews TLS certificates |
| Gzip compression | **CloudFront / ALB** | Compresses responses at the edge |
| Rate limiting | **WAF / API Gateway throttling** | Limits requests per client to prevent abuse |
| Request logging | **CloudWatch Logs / ALB access logs** | Records every request for debugging and audit |
| Structured logging | **CloudWatch Logs Insights** | Queryable structured log entries |
| Error handling | **API Gateway error responses** | Returns appropriate error codes and messages |
| Middleware / pipeline | **API Gateway authorizers + WAF** | Pre/post-processing chain for requests |
| CORS handling | **API Gateway CORS / CloudFront** | Manages cross-origin request policies |
| Chunked transfer | **ALB / CloudFront streaming** | Streams large responses without buffering |
| Timeouts | **ALB idle timeout / Lambda timeout** | Kills slow requests to free resources |
| Health checks | **ALB target group health checks** | Monitors backend availability |
| Virtual hosting (Host header) | **ALB host-based routing** | Routes by domain name on shared infrastructure |
| Configuration (CLI args) | **SSM Parameter Store / AppConfig** | Externalized, versioned configuration |
| Environment variables | **Lambda env vars / ECS task def** | Runtime configuration injection |
| PID file / process management | **ECS service / systemd** | Ensures exactly one instance runs |
| Signal handling (SIGTERM) | **ECS stop timeout / Lambda SIGTERM** | OS-level shutdown coordination |


---

## 5. Cargo Commands

### Essential Commands

| Command | Purpose | Equivalent |
|---------|---------|-----------|
| `cargo new myproject` | Create new binary project | `npm init` / `mkdir + pyproject.toml` |
| `cargo new --lib mylib` | Create new library project | — |
| `cargo build` | Compile (debug mode) | `tsc` / `python -m compileall` |
| `cargo build --release` | Compile (optimized) | `tsc --build` with optimizations |
| `cargo run` | Build + run | `ts-node app.ts` / `python app.py` |
| `cargo run -- --port 8080` | Run with args | `python app.py --port 8080` |
| `cargo test` | Run all tests | `pytest` / `jest` |
| `cargo test test_name` | Run matching tests | `pytest -k test_name` |
| `cargo check` | Type-check without building | `tsc --noEmit` / `mypy` |
| `cargo clippy` | Lint (catches common mistakes) | `eslint` / `flake8` |
| `cargo fmt` | Auto-format code | `prettier` / `black` |
| `cargo add serde` | Add dependency | `npm install serde` / `pip install` |
| `cargo doc --open` | Generate + open docs | — |
| `cargo clean` | Remove build artifacts | `rm -rf dist/` |

### Cargo.toml Structure

```toml
[package]
name = "forja"
version = "0.1.0"
edition = "2021"          # Rust edition (language version)

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
tracing = "0.1"

[dev-dependencies]        # test-only deps
assert_cmd = "2"

[[bin]]                   # multiple binaries
name = "forja"
path = "src/main.rs"
```

### Useful Flags

| Flag | Command | Purpose |
|------|---------|---------|
| `--release` | build, run | Optimized build (slower compile, faster runtime) |
| `--verbose` / `-v` | any | Show detailed output |
| `--quiet` / `-q` | any | Suppress output |
| `-- --nocapture` | test | Show println! in tests |
| `--features "feat1"` | build, run, test | Enable optional features |
| `--no-default-features` | build, run | Disable default features |
| `--target x86_64-unknown-linux-gnu` | build | Cross-compile |


---

## 6. Useful Crates

| Crate | Purpose | Python Equivalent | TS Equivalent |
|-------|---------|------------------|---------------|
| `serde` | Serialization framework (derive macros) | `dataclasses` + `json` | — |
| `serde_json` | JSON parsing and generation | `json` | `JSON.parse/stringify` |
| `tokio` | Async runtime (tasks, I/O, timers) | `asyncio` | Node.js event loop |
| `rustls` | TLS implementation (pure Rust) | `ssl` | `tls` module |
| `tokio-rustls` | Async TLS streams for tokio | `asyncio` + `ssl` | `tls.connect()` |
| `flate2` | Gzip/deflate compression | `gzip` / `zlib` | `zlib` |
| `rcgen` | Self-signed certificate generation | — | — |
| `tracing` | Structured logging + spans | `logging` + `structlog` | `pino` / `winston` |
| `tracing-subscriber` | Log output formatting | `logging.Handler` | — |
| `clap` | CLI argument parsing (derive macros) | `argparse` / `click` | `commander` / `yargs` |
| `bytes` | Efficient byte buffer manipulation | `bytearray` | `Buffer` |
| `http` | HTTP types (Method, StatusCode, etc.) | — | — |
| `percent-encoding` | URL encoding/decoding | `urllib.parse` | `encodeURIComponent` |

### Quick Examples

**serde — Serialize/Deserialize structs to JSON:**
```rust
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
struct User {
    name: String,
    age: u32,
}

let json = serde_json::to_string(&user)?;     // struct → JSON string
let user: User = serde_json::from_str(&json)?; // JSON string → struct
```

**tokio — Async TCP server:**
```rust
#[tokio::main]
async fn main() {
    let listener = TcpListener::bind("127.0.0.1:7878").await.unwrap();
    loop {
        let (stream, _addr) = listener.accept().await.unwrap();
        tokio::spawn(async move {
            handle(stream).await;
        });
    }
}
```

**clap — CLI arguments:**
```rust
use clap::Parser;

#[derive(Parser)]
struct Args {
    #[arg(short, long, default_value = "7878")]
    port: u16,

    #[arg(short, long, default_value = ".")]
    root: PathBuf,
}

let args = Args::parse();
```

---

## 7. Debugging & Troubleshooting

### Common Compiler Errors

| Error | Meaning | Fix |
|-------|---------|-----|
| `cannot borrow X as mutable because it is also borrowed as immutable` | You have a `&ref` and a `&mut ref` alive at the same time | Restructure so the immutable borrow ends before the mutable one starts |
| `value moved here` / `use of moved value` | Ownership was transferred and you're trying to use the old variable | Clone the value, or use a reference instead of moving |
| `missing lifetime specifier` | Function returns a reference but compiler can't figure out how long it lives | Add lifetime annotations: `fn foo<'a>(s: &'a str) -> &'a str` |
| `expected X, found Y` | Type mismatch | Check return types, use `.into()`, or convert explicitly |
| `the trait X is not implemented for Y` | You're using a value where a trait is required but the type doesn't implement it | Add `#[derive(Trait)]` or write `impl Trait for Y` |
| `cannot find value X in this scope` | Variable not declared or not imported | Add `use` statement or check spelling |
| `this function takes N arguments but M were supplied` | Wrong number of args | Check the function signature |
| `type annotations needed` | Compiler can't infer the type | Add explicit type: `let x: Vec<String> = ...` |
| `doesn't have a size known at compile-time` | Using a trait object without `Box` or `&dyn` | Use `Box<dyn Trait>` or `&dyn Trait` |
| `future is not Send` | Async task holds a non-Send type across an `.await` | Don't hold `Rc`, `RefCell`, or non-Send types across await points; use `Arc`/`Mutex` instead |

### "Address Already in Use"

```bash
# Find what's using the port
lsof -i :7878          # macOS / Linux
ss -tlnp | grep 7878   # Linux only

# Kill it
kill <PID>             # graceful
kill -9 <PID>          # force

# Or just use a different port
cargo run -- --port 7879
```

### Borrow Checker Patterns & Fixes

**Problem: Borrow lives too long**
```rust
// ❌ Won't compile
let mut data = vec![1, 2, 3];
let first = &data[0];     // immutable borrow
data.push(4);              // mutable borrow — conflict!
println!("{first}");       // immutable borrow still alive

// ✅ Fix: end the borrow before mutating
let mut data = vec![1, 2, 3];
let first = data[0];       // copy the value (i32 is Copy)
data.push(4);               // no conflict
println!("{first}");
```

**Problem: Returning a reference to a local**
```rust
// ❌ Won't compile — dangling reference
fn make_greeting() -> &str {
    let s = String::from("hello");
    &s  // s is dropped at end of function!
}

// ✅ Fix: return an owned value
fn make_greeting() -> String {
    String::from("hello")
}
```

**Problem: Mutable reference in a loop**
```rust
// ❌ Won't compile
let mut map = HashMap::new();
for key in &keys {
    let entry = map.get(key);       // immutable borrow
    map.insert(key.clone(), 42);    // mutable borrow — conflict!
}

// ✅ Fix: use the entry API
for key in &keys {
    map.entry(key.clone()).or_insert(42);
}
```

### Async Troubleshooting

**`future is not Send`** — you're holding a non-Send type across `.await`:
```rust
// ❌ Rc is not Send
let data = Rc::new(vec![1, 2, 3]);
tokio::spawn(async move {
    do_something(&data).await;  // Rc can't cross thread boundary
});

// ✅ Use Arc instead
let data = Arc::new(vec![1, 2, 3]);
tokio::spawn(async move {
    do_something(&data).await;
});
```

**Lifetime in async** — async blocks capture references:
```rust
// ❌ Reference doesn't live long enough
async fn process(data: &[u8]) {
    tokio::spawn(async {
        // data reference might be gone when this runs
        parse(data).await;
    });
}

// ✅ Clone/own the data for the spawned task
async fn process(data: &[u8]) {
    let owned = data.to_vec();
    tokio::spawn(async move {
        parse(&owned).await;
    });
}
```

**`blocking` in async context** — don't block the async runtime:
```rust
// ❌ Blocks the tokio thread
async fn read_file(path: &str) -> String {
    std::fs::read_to_string(path).unwrap()  // synchronous I/O!
}

// ✅ Use tokio's async file I/O
async fn read_file(path: &str) -> String {
    tokio::fs::read_to_string(path).await.unwrap()
}

// ✅ Or offload to a blocking thread
async fn read_file(path: &str) -> String {
    let path = path.to_string();
    tokio::task::spawn_blocking(move || {
        std::fs::read_to_string(&path).unwrap()
    }).await.unwrap()
}
```

---

> **Tip:** When the compiler gives you an error, read the *full* message. Rust's error messages include suggestions — they're often exactly right. Run `rustc --explain E0382` for detailed explanations of any error code.
