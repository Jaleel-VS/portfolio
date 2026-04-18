# Act 4 — Production Features

> *You built a server. Now make it survive the internet.*

In Acts 1–3 you went from zero Rust to a working async HTTP server with routing, middleware, JSON APIs, static files, shared state, and graceful shutdown. That server *works* — but it wouldn't last five minutes behind a load balancer.

This act closes the gap between "works on localhost" and "serves real traffic." Every stage adds a feature that production HTTP servers need, and that you've been relying on AWS services to provide for you. By the end, you'll deploy your hand-built server to an EC2 instance and hit it from the internet.

**What you'll add:**

| Stage | Feature | Why it matters |
|-------|---------|---------------|
| 23 | Keep-Alive | Stop opening a new TCP connection for every request |
| 24 | Chunked Transfer | Stream responses without knowing the size upfront |
| 25 | Compression | Send less data over the wire |
| 26 | CORS | Let browsers call your API from other origins |
| 27 | Rate Limiting | Don't let one client kill your server |
| 28 | TLS (HTTPS) | Encrypt traffic — no more plaintext passwords |
| 29 | Benchmarking | Measure before you optimize |
| 30 | Deploy to EC2 | Serve real traffic from the internet |

**Pedagogical shift:** By Act 4, you write more code yourself. Stages give you the key pieces — the tricky Rust parts, the type signatures, the gotchas — and you assemble them. If you get stuck, the checkpoint at the end of each stage has the full working code.

---

## Stage 23 — Keep-Alive: Persistent Connections

### Why this matters

Open your browser's dev tools, load a page with 20 images, and watch the "Connection" column. Without keep-alive, every single resource requires a full TCP handshake — that's 20 round trips of SYN/SYN-ACK/ACK *before any data flows*. On a 100ms link, that's 2 seconds of pure handshake overhead.

HTTP/1.0 closed the connection after every response. HTTP/1.1 changed the default: connections stay open unless someone sends `Connection: close`. This is the single biggest performance improvement in HTTP/1.1.

**AWS connection:** Keep-alive is what ALB uses to maintain connection pools to your targets. When you configure an ALB target group, the "deregistration delay" and "idle timeout" settings are keep-alive parameters. ALB holds persistent connections to your backend and multiplexes requests over them. Without keep-alive support in your server, ALB would open and close a TCP connection for every single request it forwards — destroying performance.

### What your server does now (the problem)

Look at your `handle_connection` function from Act 3. It probably looks like this:

```rust
async fn handle_connection(mut stream: TcpStream, router: Arc<Router>) {
    let mut buf = [0u8; 4096];
    let n = stream.read(&mut buf).await.unwrap();
    let request = parse_request(&buf[..n]);
    let response = router.handle(request).await;
    stream.write_all(response.as_bytes()).await.unwrap();
    // Connection drops here — TcpStream is dropped, socket closed
}
```

One request, one response, goodbye. Every client pays the TCP handshake tax on every request.

### The fix: loop until close

The core idea is simple — wrap the read/respond cycle in a loop:

```rust
async fn handle_connection(mut stream: TcpStream, router: Arc<Router>) {
    let mut buf = vec![0u8; 8192];

    loop {
        // Read the next request (or detect disconnect)
        let n = match tokio::time::timeout(
            Duration::from_secs(30),
            stream.read(&mut buf),
        ).await {
            Ok(Ok(0)) => break,        // Client closed cleanly
            Ok(Ok(n)) => n,
            Ok(Err(_)) => break,        // Read error
            Err(_) => break,            // Timeout — idle too long
        };

        let request = parse_request(&buf[..n]);

        // Check if client wants to close
        let close = request.header("Connection")
            .map(|v| v.eq_ignore_ascii_case("close"))
            .unwrap_or(false);

        let mut response = router.handle(request).await;

        // Echo the connection decision back
        if close {
            response.set_header("Connection", "close");
        } else {
            response.set_header("Connection", "keep-alive");
        }

        stream.write_all(response.as_bytes()).await.ok();

        if close {
            break;
        }
    }
}
```

### The three things you must handle

**1. Timeout idle connections**

Without a timeout, a client that opens a connection and never sends another request holds a file descriptor forever. Enough of these and your server runs out of sockets.

```rust
use tokio::time::{timeout, Duration};

const KEEP_ALIVE_TIMEOUT: Duration = Duration::from_secs(30);

// Wrap every read in a timeout
let result = timeout(KEEP_ALIVE_TIMEOUT, stream.read(&mut buf)).await;
```

In Python/Flask, the WSGI server (gunicorn) handles this for you. In Node/Express, `server.keepAliveTimeout` defaults to 5 seconds. Here, you're the server — you set the policy.

**2. Respect `Connection: close`**

The client can opt out of keep-alive by sending `Connection: close`. You must honor it. And you should echo it back so the client knows you're closing too.

**3. Content-Length is now mandatory**

When you had one-request-per-connection, the client knew the response was done when the socket closed. With keep-alive, the socket stays open — so how does the client know where one response ends and the next begins? `Content-Length`. Every response must include it (or use chunked transfer — Stage 24).

```rust
// In your response builder, always set Content-Length
let body = response.body();
response.set_header("Content-Length", &body.len().to_string());
```

### Common mistake: partial reads

Your 8192-byte buffer might not contain the complete request. A POST with a large body arrives in multiple TCP segments. For now, a simple approach:

```rust
// Read Content-Length from headers, then read remaining body bytes
fn parse_content_length(headers: &str) -> Option<usize> {
    headers.lines()
        .find(|l| l.to_lowercase().starts_with("content-length:"))
        .and_then(|l| l.split(':').nth(1))
        .and_then(|v| v.trim().parse().ok())
}
```

You'll need to keep reading from the stream until you have `header_length + content_length` bytes. This is fiddly — real HTTP parsers handle this with state machines. For Forja, handling GET requests (no body) in the keep-alive loop is enough to prove the concept.

### Test it

```bash
# Single request with Connection: close — should close immediately
curl -v http://localhost:7878/api/hello -H "Connection: close"
# Look for: "Connection: close" in response, then "Closing connection"

# Keep-alive (default for curl with HTTP/1.1)
curl -v http://localhost:7878/api/hello http://localhost:7878/api/hello
# Two requests, but curl reuses the connection — look for "Re-using existing connection"

# Test timeout — connect and wait
nc localhost 7878
# Type nothing, wait 30 seconds — server should close the connection
```

### Checkpoint

Your `handle_connection` now:
- Loops, reading multiple requests per connection
- Times out idle connections after 30 seconds
- Respects `Connection: close`
- Sets `Content-Length` on every response

---

## Stage 24 — Chunked Transfer Encoding

### Why this matters

Content-Length requires you to know the response size before you start sending. That's fine for a JSON object or a small HTML page. But what about:

- A database query that returns rows one at a time?
- A log file you're tailing in real time?
- A large file you're reading from disk and don't want to buffer entirely in memory?

Chunked transfer encoding lets you stream the response in pieces. Each chunk is prefixed with its size in hex, and a zero-length chunk signals the end.

**AWS connection:** This is how API Gateway streams Lambda responses back to clients. When you enable Lambda response streaming, API Gateway uses `Transfer-Encoding: chunked` to send data as your Lambda produces it, rather than buffering the entire response. CloudFront also uses chunked encoding when it doesn't know the origin's response size upfront.

### The wire format

```
HTTP/1.1 200 OK\r\n
Transfer-Encoding: chunked\r\n
\r\n
7\r\n
Hello, \r\n
6\r\n
World!\r\n
0\r\n
\r\n
```

Each chunk: `{size_in_hex}\r\n{data}\r\n`. Final chunk: `0\r\n\r\n`.

In Python, Flask does this automatically when you return a generator. In Node, `res.write()` chunks automatically. In Rust, you're writing the wire format yourself.

### Build a chunked writer

```rust
use tokio::io::AsyncWriteExt;

async fn write_chunk(stream: &mut TcpStream, data: &[u8]) -> std::io::Result<()> {
    // Write chunk size as hex
    let size = format!("{:x}\r\n", data.len());
    stream.write_all(size.as_bytes()).await?;
    // Write chunk data
    stream.write_all(data).await?;
    // Write chunk terminator
    stream.write_all(b"\r\n").await?;
    Ok(())
}

async fn end_chunked(stream: &mut TcpStream) -> std::io::Result<()> {
    stream.write_all(b"0\r\n\r\n").await
}
```

### Add a streaming endpoint

Create a `/stream` endpoint that sends data in chunks with a delay — simulating a slow data source:

```rust
// Send headers first (no Content-Length!)
let headers = "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n";
stream.write_all(headers.as_bytes()).await?;

// Stream chunks with delays
for i in 0..5 {
    let chunk = format!("chunk {} at {:?}\n", i, std::time::Instant::now());
    write_chunk(&mut stream, chunk.as_bytes()).await?;
    tokio::time::sleep(Duration::from_secs(1)).await;
}

end_chunked(&mut stream).await?;
```

### Your task

1. Add the `write_chunk` and `end_chunked` helper functions
2. Add a `/stream` route that sends 5 chunks with 1-second delays
3. Modify your response builder: if a response has no `Content-Length`, use chunked encoding
4. Make sure keep-alive still works after a chunked response

### Common mistake: forgetting the final chunk

If you don't send the `0\r\n\r\n` terminator, the client hangs forever waiting for more data. curl will sit there spinning. Always send the final chunk, even if your stream errors out — wrap it in a cleanup block.

### Test it

```bash
# Watch chunks arrive in real time
curl -v --no-buffer http://localhost:7878/stream
# You should see data appear every second, not all at once

# Verify the encoding header
curl -sI http://localhost:7878/stream
# Should show: Transfer-Encoding: chunked
# Should NOT show: Content-Length

# Verify keep-alive works after chunked response
curl -v http://localhost:7878/stream http://localhost:7878/api/hello
# Second request should reuse the connection
```

### Checkpoint

Your server now supports two response modes:
- **Fixed-length**: `Content-Length` header, body sent all at once
- **Chunked**: `Transfer-Encoding: chunked`, body sent in pieces

Both work with keep-alive connections.

---

## Stage 25 — Compression: gzip Response Bodies

### Why this matters

A typical JSON API response is 70-80% whitespace and repeated keys. A 50KB JSON payload compresses to ~8KB with gzip. That's 6x less data over the wire — faster page loads, lower bandwidth costs, happier mobile users on slow connections.

Every production HTTP server supports compression. If yours doesn't, you're wasting bandwidth on every single response.

**AWS connection:** This is exactly what CloudFront does — compress at the edge. When you enable "Compress Objects Automatically" in a CloudFront distribution, it checks `Accept-Encoding: gzip` in the request and compresses the response body before sending it to the client. ALB doesn't compress — it expects your backend to handle it. So if you're running behind ALB without CloudFront, your server needs to compress.

### The protocol

1. Client sends: `Accept-Encoding: gzip, deflate, br`
2. Server checks if it supports any of those encodings
3. Server compresses the body and adds: `Content-Encoding: gzip`
4. Server updates `Content-Length` to the *compressed* size

If the client doesn't send `Accept-Encoding`, or doesn't include `gzip`, send the response uncompressed. Never compress without the client asking.

### Add the flate2 crate

```bash
cargo add flate2
```

This gives you `flate2::write::GzEncoder` — a `Write` adapter that compresses data with gzip. The API is straightforward:

```rust
use flate2::write::GzEncoder;
use flate2::Compression;
use std::io::Write;

fn gzip_compress(data: &[u8]) -> Vec<u8> {
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(data).unwrap();
    encoder.finish().unwrap()  // MUST call finish() to flush the gzip footer
}
```

`Compression::default()` is level 6 (out of 0-9). Good balance of speed and ratio. For a real server you might use `Compression::fast()` (level 1) to reduce CPU overhead.

### Where to compress

Compression belongs in your response pipeline, after the handler produces a body but before you write to the socket. Think of it as middleware:

```rust
fn maybe_compress(request: &Request, response: &mut Response) {
    // Only compress if client accepts gzip
    let accepts_gzip = request.header("Accept-Encoding")
        .map(|v| v.contains("gzip"))
        .unwrap_or(false);

    if !accepts_gzip {
        return;
    }

    // Don't compress tiny responses — overhead isn't worth it
    if response.body().len() < 256 {
        return;
    }

    // Don't compress already-compressed content (images, zip files)
    let content_type = response.header("Content-Type").unwrap_or("");
    if content_type.starts_with("image/")
        || content_type.contains("zip")
        || content_type.contains("compressed")
    {
        return;
    }

    let compressed = gzip_compress(response.body());

    // Only use compressed version if it's actually smaller
    if compressed.len() < response.body().len() {
        response.set_body(compressed);
        response.set_header("Content-Encoding", "gzip");
        // Content-Length must reflect compressed size
        response.set_header("Content-Length", &response.body().len().to_string());
    }
}
```

### Your task

1. Add `flate2` to your `Cargo.toml`
2. Write the `gzip_compress` function
3. Add compression logic to your response pipeline — after routing, before writing to socket
4. Handle the edge cases: small bodies, already-compressed content types, client doesn't accept gzip
5. Make sure `Content-Length` reflects the compressed size

### Common mistakes

**Forgetting `encoder.finish()`** — gzip has a footer with a checksum. If you drop the encoder without calling `finish()`, the output is truncated and clients will reject it with a decompression error.

**Compressing chunked responses** — if you're streaming chunks (Stage 24), you need to either compress each chunk individually (wasteful — gzip works better with more data) or buffer the whole response first (defeats the purpose of streaming). The standard approach: don't compress chunked/streaming responses, or use a streaming gzip encoder that flushes per-chunk. For Forja, skip compression on chunked responses.

**Double compression** — if your static file is already `style.css.gz`, don't gzip it again. Check for existing `Content-Encoding` headers.

### Test it

```bash
# Request with gzip support
curl -v -H "Accept-Encoding: gzip" http://localhost:7878/api/hello | gunzip
# Response headers should include: Content-Encoding: gzip
# Body should be compressed (curl -v shows binary garbage before gunzip)

# Request without gzip — should get plain text
curl -v http://localhost:7878/api/hello
# No Content-Encoding header, body is readable

# Compare sizes
curl -s -H "Accept-Encoding: gzip" http://localhost:7878/api/hello -o /tmp/compressed
curl -s http://localhost:7878/api/hello -o /tmp/plain
ls -la /tmp/compressed /tmp/plain
# Compressed should be smaller (for non-trivial responses)

# Verify decompression works end-to-end
curl -s --compressed http://localhost:7878/api/hello
# --compressed tells curl to send Accept-Encoding and auto-decompress
```

### Checkpoint

Your server now:
- Checks `Accept-Encoding` for gzip support
- Compresses response bodies with flate2
- Sets `Content-Encoding: gzip` and correct `Content-Length`
- Skips compression for small bodies, images, and streaming responses

---

## Stage 26 — CORS: Cross-Origin Resource Sharing

### Why this matters

You build an API at `api.example.com`. Your frontend is at `app.example.com`. A user opens the frontend, it makes a `fetch()` call to the API, and... the browser blocks it. "Access to fetch has been blocked by CORS policy."

Every web developer has hit this wall. CORS is the browser's security mechanism that prevents JavaScript on one origin from making requests to a different origin. Without proper CORS headers, your API is useless to any frontend that isn't served from the exact same origin.

**AWS connection:** This is what API Gateway's CORS configuration does. When you enable CORS on an API Gateway endpoint, it adds the `Access-Control-*` headers and handles OPTIONS preflight requests. AWS WAF can also inject CORS headers. Here, you're implementing what those services do for you.

### How CORS works

**Simple requests** (GET, POST with simple content types) — the browser sends the request normally but checks the response for `Access-Control-Allow-Origin`. If it's missing or doesn't match, the browser hides the response from JavaScript.

**Preflight requests** — for "dangerous" requests (PUT, DELETE, custom headers, JSON content type), the browser sends an OPTIONS request *first* to ask permission. Your server must respond with the right headers or the actual request never happens.

```
Browser → Server: OPTIONS /api/users
                  Origin: https://app.example.com
                  Access-Control-Request-Method: DELETE
                  Access-Control-Request-Headers: Content-Type

Server → Browser: 204 No Content
                  Access-Control-Allow-Origin: https://app.example.com
                  Access-Control-Allow-Methods: GET, POST, PUT, DELETE
                  Access-Control-Allow-Headers: Content-Type
                  Access-Control-Max-Age: 86400
```

### Build CORS middleware

This is one of the simpler stages — it's just headers. But getting the details right matters.

```rust
struct CorsConfig {
    allowed_origins: Vec<String>,  // or "*" for any
    allowed_methods: Vec<String>,
    allowed_headers: Vec<String>,
    max_age: u64,  // seconds to cache preflight
}

impl CorsConfig {
    fn default_permissive() -> Self {
        CorsConfig {
            allowed_origins: vec!["*".to_string()],
            allowed_methods: vec![
                "GET", "POST", "PUT", "DELETE", "OPTIONS"
            ].into_iter().map(String::from).collect(),
            allowed_headers: vec![
                "Content-Type", "Authorization"
            ].into_iter().map(String::from).collect(),
            max_age: 86400,
        }
    }
}
```

**Handle preflight (OPTIONS):**

```rust
fn handle_preflight(config: &CorsConfig, request: &Request) -> Response {
    let mut response = Response::new(204); // No Content

    let origin = request.header("Origin").unwrap_or("*");
    add_cors_headers(&mut response, config, origin);

    // Preflight-specific headers
    response.set_header(
        "Access-Control-Allow-Methods",
        &config.allowed_methods.join(", "),
    );
    response.set_header(
        "Access-Control-Allow-Headers",
        &config.allowed_headers.join(", "),
    );
    response.set_header(
        "Access-Control-Max-Age",
        &config.max_age.to_string(),
    );

    response
}
```

**Add CORS headers to every response:**

```rust
fn add_cors_headers(response: &mut Response, config: &CorsConfig, origin: &str) {
    let allow_origin = if config.allowed_origins.contains(&"*".to_string()) {
        "*"
    } else if config.allowed_origins.iter().any(|o| o == origin) {
        origin
    } else {
        return; // Origin not allowed — don't add headers
    };

    response.set_header("Access-Control-Allow-Origin", allow_origin);
}
```

### Your task

1. Add the `CorsConfig` struct
2. In your request handling loop: if the method is OPTIONS and an `Origin` header is present, return the preflight response immediately (don't route it)
3. For all other responses, add `Access-Control-Allow-Origin` based on the request's `Origin` header
4. Wire it up as middleware that runs on every response

### Common mistake: `*` vs specific origin with credentials

If your API uses cookies or `Authorization` headers, `Access-Control-Allow-Origin: *` won't work — browsers require the specific origin. You also need `Access-Control-Allow-Credentials: true`. This trips up everyone at least once.

### Test it

```bash
# Preflight request
curl -v -X OPTIONS http://localhost:7878/api/hello \
  -H "Origin: https://example.com" \
  -H "Access-Control-Request-Method: DELETE"
# Should return 204 with Access-Control-Allow-* headers

# Simple request with Origin
curl -v http://localhost:7878/api/hello \
  -H "Origin: https://example.com"
# Should include Access-Control-Allow-Origin in response

# Request without Origin (not a CORS request)
curl -v http://localhost:7878/api/hello
# No CORS headers needed
```

### Browser test

Open a browser console on any website and try:

```javascript
fetch('http://localhost:7878/api/hello')
  .then(r => r.text())
  .then(console.log)
  .catch(console.error);
```

Without CORS headers: `TypeError: Failed to fetch` (CORS error in console).
With CORS headers: you see the response body.

### Checkpoint

Your server now:
- Responds to OPTIONS preflight requests with proper CORS headers
- Adds `Access-Control-Allow-Origin` to all responses when `Origin` is present
- Is callable from any frontend JavaScript application

---

## Stage 27 — Rate Limiting: Token Bucket per IP

### Why this matters

Without rate limiting, a single client can send thousands of requests per second and monopolize your server. A bot scraping your API, a buggy client in a retry loop, or a deliberate denial-of-service attack — any of these will starve legitimate users.

Rate limiting is the first line of defense. It says: "You get N requests per time window. After that, slow down."

**AWS connection:** Rate limiting is what AWS WAF does. When you create a WAF rate-based rule, you're setting a token bucket per IP address — exactly what you're about to build. API Gateway also has throttling (10,000 requests/second default per account, configurable per stage/method). The difference: WAF operates at the edge (CloudFront), API Gateway at the service level. Your implementation is the service-level version.

### Token bucket algorithm

There are several rate limiting algorithms. Token bucket is the most common because it allows bursts while enforcing an average rate:

- Each IP gets a bucket with `max_tokens` capacity (e.g., 10)
- Tokens refill at a steady rate (e.g., 1 per second)
- Each request costs 1 token
- If the bucket is empty → 429 Too Many Requests
- Tokens accumulate up to `max_tokens`, allowing short bursts

In Python you'd use a dict of `{ip: (tokens, last_refill_time)}`. In Rust, same idea — but you need to handle concurrent access.

### The data structure

```rust
use std::collections::HashMap;
use std::net::IpAddr;
use std::time::Instant;

struct TokenBucket {
    tokens: f64,
    last_refill: Instant,
}

struct RateLimiter {
    buckets: HashMap<IpAddr, TokenBucket>,
    max_tokens: f64,
    refill_rate: f64,  // tokens per second
}

impl RateLimiter {
    fn new(max_tokens: f64, refill_rate: f64) -> Self {
        RateLimiter {
            buckets: HashMap::new(),
            max_tokens,
            refill_rate,
        }
    }

    fn check(&mut self, ip: IpAddr) -> bool {
        let now = Instant::now();

        let bucket = self.buckets.entry(ip).or_insert(TokenBucket {
            tokens: self.max_tokens,
            last_refill: now,
        });

        // Refill tokens based on elapsed time
        let elapsed = now.duration_since(bucket.last_refill).as_secs_f64();
        bucket.tokens = (bucket.tokens + elapsed * self.refill_rate)
            .min(self.max_tokens);
        bucket.last_refill = now;

        // Try to consume a token
        if bucket.tokens >= 1.0 {
            bucket.tokens -= 1.0;
            true
        } else {
            false
        }
    }
}
```

### Sharing across async tasks

Your server spawns a new task per connection. The rate limiter must be shared. You already know the pattern from Act 3:

```rust
use std::sync::Arc;
use tokio::sync::Mutex;

let limiter = Arc::new(Mutex::new(RateLimiter::new(10.0, 1.0)));

// In your connection handler:
let allowed = {
    let mut limiter = limiter.lock().await;
    limiter.check(peer_ip)
};

if !allowed {
    let response = "HTTP/1.1 429 Too Many Requests\r\n\
        Content-Length: 24\r\n\
        Retry-After: 1\r\n\
        \r\n\
        Too Many Requests\r\n";
    stream.write_all(response.as_bytes()).await.ok();
    continue; // Next request in keep-alive loop, or break
}
```

Note `tokio::sync::Mutex`, not `std::sync::Mutex`. You're in async code — a std mutex held across an `.await` point would block the entire Tokio thread. Tokio's mutex yields the task instead.

### Your task

1. Implement the `RateLimiter` struct with token bucket logic
2. Wrap it in `Arc<tokio::sync::Mutex<_>>` and pass it to connection handlers
3. Extract the client IP from the `TcpStream` peer address
4. Check the rate limiter before routing — if denied, return 429 with `Retry-After` header
5. **Bonus:** Add a cleanup task that periodically removes stale buckets (IPs that haven't been seen in 5 minutes) to prevent memory leaks

### Common mistakes

**Using `std::sync::Mutex` in async code** — if the lock is held across an `.await`, you'll deadlock or block the Tokio runtime. Use `tokio::sync::Mutex` for async-safe locking.

**Memory leak from stale buckets** — every unique IP that hits your server gets a HashMap entry. Without cleanup, this grows forever. In production, you'd use an LRU cache or a periodic sweep:

```rust
// Periodic cleanup — spawn as a background task
async fn cleanup_stale_buckets(limiter: Arc<Mutex<RateLimiter>>) {
    let mut interval = tokio::time::interval(Duration::from_secs(60));
    loop {
        interval.tick().await;
        let mut limiter = limiter.lock().await;
        let cutoff = Instant::now() - Duration::from_secs(300);
        limiter.buckets.retain(|_, bucket| bucket.last_refill > cutoff);
    }
}
```

**Lock contention** — every request locks the entire HashMap. For a high-traffic server, this becomes a bottleneck. Production rate limiters use sharded maps (like `dashmap` crate) or per-IP atomic counters. For Forja, the Mutex approach is fine.

### Test it

```bash
# Rapid-fire requests — should get 429 after the bucket empties
for i in $(seq 1 15); do
  echo "Request $i: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:7878/api/hello)"
done
# First 10 should be 200, remaining should be 429

# Wait for refill, then try again
sleep 5
curl -s -o /dev/null -w '%{http_code}' http://localhost:7878/api/hello
# Should be 200 again

# Check Retry-After header on 429
curl -v http://localhost:7878/api/hello  # (after exhausting tokens)
# Should include: Retry-After: 1
```

### Checkpoint

Your server now:
- Tracks request rates per client IP using token bucket
- Returns 429 Too Many Requests with `Retry-After` when rate exceeded
- Cleans up stale entries to prevent memory leaks
- Uses `tokio::sync::Mutex` for async-safe shared state

---

## Stage 28 — TLS: HTTPS with rustls

### Why this matters

Everything your server has sent so far is plaintext. Anyone on the network path — the coffee shop WiFi, the ISP, a compromised router — can read every request and response. Passwords, API keys, user data — all visible.

TLS encrypts the connection between client and server. It's not optional for production. Browsers mark HTTP sites as "Not Secure." Search engines penalize them. Modern HTTP features (HTTP/2, service workers) require HTTPS.

**AWS connection:** TLS termination is what ALB and CloudFront handle for you. When you attach an ACM certificate to an ALB listener, the ALB handles the TLS handshake and forwards decrypted traffic to your backend over HTTP. CloudFront does the same at the edge. Here, you're doing what ALB does — terminating TLS at your server. This is what happens when you run a bare EC2 instance without a load balancer in front.

### The plan

1. Generate a self-signed certificate (for development)
2. Configure rustls with that certificate
3. Wrap your TcpStream in a TLS layer
4. Everything else stays the same — your HTTP handling code doesn't change

### Add dependencies

```bash
cargo add rustls tokio-rustls rcgen
```

- **rustls** (v0.23) — pure-Rust TLS implementation. No OpenSSL dependency, no C code.
- **tokio-rustls** (v0.26) — async wrapper that gives you `TlsAcceptor` for server-side TLS
- **rcgen** (v0.14) — generates self-signed X.509 certificates at runtime

### Generate a self-signed certificate

For development, generate a cert at server startup. In production, you'd load a real certificate from disk (or from ACM via ALB).

```rust
use rcgen::{generate_simple_self_signed, CertifiedKey};

fn generate_self_signed_cert() -> (Vec<u8>, Vec<u8>) {
    let subject_alt_names = vec![
        "localhost".to_string(),
        "127.0.0.1".to_string(),
    ];

    let CertifiedKey { cert, signing_key } =
        generate_simple_self_signed(subject_alt_names)
            .expect("Failed to generate certificate");

    let cert_pem = cert.pem();
    let key_pem = signing_key.serialize_pem();

    (cert_pem.into_bytes(), key_pem.into_bytes())
}
```

### Configure rustls ServerConfig

This is the trickiest part — converting PEM bytes into the types rustls expects:

```rust
use rustls::pki_types::{CertificateDer, PrivateKeyDer};
use rustls::pki_types::pem::PemObject;
use std::sync::Arc;

fn build_tls_config(cert_pem: &[u8], key_pem: &[u8]) -> Arc<rustls::ServerConfig> {
    let certs: Vec<CertificateDer> = CertificateDer::pem_slice_iter(cert_pem)
        .collect::<Result<Vec<_>, _>>()
        .expect("Failed to parse certificate PEM");

    let key = PrivateKeyDer::from_pem_slice(key_pem)
        .expect("Failed to parse private key PEM");

    let config = rustls::ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(certs, key)
        .expect("Failed to build TLS config");

    Arc::new(config)
}
```

The builder chain: `ServerConfig::builder()` → `.with_no_client_auth()` (we don't require client certificates) → `.with_single_cert(certs, key)` (our server's identity).

### Wrap the listener with TLS

```rust
use tokio_rustls::TlsAcceptor;

#[tokio::main]
async fn main() {
    // Generate cert
    let (cert_pem, key_pem) = generate_self_signed_cert();
    let tls_config = build_tls_config(&cert_pem, &key_pem);
    let acceptor = TlsAcceptor::from(tls_config);

    let listener = TcpListener::bind("0.0.0.0:7878").await.unwrap();
    println!("Listening on https://localhost:7878");

    loop {
        let (tcp_stream, peer_addr) = listener.accept().await.unwrap();
        let acceptor = acceptor.clone();  // TlsAcceptor is Clone (Arc inside)

        tokio::spawn(async move {
            // TLS handshake
            let tls_stream = match acceptor.accept(tcp_stream).await {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("TLS handshake failed from {}: {}", peer_addr, e);
                    return;
                }
            };

            // tls_stream implements AsyncRead + AsyncWrite
            // Pass it to your existing handle_connection — just change the type
            handle_connection(tls_stream, router.clone()).await;
        });
    }
}
```

The key insight: `TlsAcceptor::accept()` takes a `TcpStream` and returns a `TlsStream<TcpStream>` that implements `AsyncRead + AsyncWrite`. Your existing `handle_connection` function works unchanged — just make it generic over the stream type:

```rust
use tokio::io::{AsyncReadExt, AsyncWriteExt};

async fn handle_connection<S>(mut stream: S, router: Arc<Router>)
where
    S: AsyncReadExt + AsyncWriteExt + Unpin,
{
    // Exactly the same code as before — read, parse, route, write
}
```

This is Rust generics earning their keep. One function handles both plain TCP and TLS connections.

### Your task

1. Add `rustls`, `tokio-rustls`, and `rcgen` to your dependencies
2. Write `generate_self_signed_cert()` using rcgen
3. Write `build_tls_config()` to create a `ServerConfig`
4. Create a `TlsAcceptor` and wrap incoming connections
5. Make `handle_connection` generic over `AsyncRead + AsyncWrite`
6. **Bonus:** Support both HTTP (port 7878) and HTTPS (port 7879) simultaneously — two listeners, one router

### Common mistakes

**Self-signed cert rejected by curl** — curl (and browsers) don't trust self-signed certificates. Use `curl -k` or `curl --insecure` to skip verification during development:

```bash
curl -k https://localhost:7878/api/hello
```

In a browser, you'll get a "Your connection is not private" warning. Click through it (Advanced → Proceed).

**Wrong PEM parsing** — rustls 0.23 uses `pki_types::pem::PemObject` trait for PEM parsing. The old `rustls_pemfile` crate is no longer needed. If you see examples using `rustls_pemfile::certs()`, that's the old API.

**Certificate doesn't include the hostname** — if your Subject Alternative Names don't include `localhost` or `127.0.0.1`, TLS clients will reject the connection even though encryption works. Always include the hostnames you'll connect with.

**Handshake failure with plain HTTP clients** — if someone sends a plain HTTP request to your HTTPS port, the TLS handshake fails (the first bytes aren't a TLS ClientHello). This is normal — log it and move on. Don't crash.

### Test it

```bash
# Basic HTTPS request (skip cert verification for self-signed)
curl -kv https://localhost:7878/api/hello
# Look for: "SSL connection using TLSv1.3"
# Look for: "subject: CN=rcgen self signed cert"

# Verify TLS version
curl -k --tlsv1.3 https://localhost:7878/api/hello
# Should work — rustls supports TLS 1.3

# Plain HTTP to HTTPS port should fail gracefully
curl http://localhost:7878/api/hello
# Should get connection error, server should log "TLS handshake failed"

# OpenSSL inspection
echo | openssl s_client -connect localhost:7878 2>/dev/null | openssl x509 -text -noout
# Shows certificate details — issuer, subject, SANs, validity
```

### Checkpoint

Your server now:
- Generates a self-signed TLS certificate at startup
- Accepts HTTPS connections using rustls (pure Rust, no OpenSSL)
- Handles TLS handshake failures gracefully
- All existing features (keep-alive, chunked, compression, CORS, rate limiting) work over TLS

---

## Stage 29 — Benchmarking: Measure Before You Optimize

### Why this matters

You've added keep-alive, compression, TLS — but are they actually helping? How many requests per second can your server handle? What's the latency at the 99th percentile? Where's the bottleneck — CPU, memory, network, lock contention?

Without benchmarks, you're guessing. And guessing about performance is almost always wrong.

**AWS connection:** This is what you do before right-sizing EC2 instances. "Should I use a t3.medium or a c6g.large?" depends entirely on your server's performance profile. Load testing tells you the requests/second per vCPU, which tells you the instance type and count you need. It's also what you do before setting ALB target group health check thresholds and Auto Scaling policies.

### Install a load testing tool

**`hey`** is the simplest option — a single binary, no config files:

```bash
# macOS
brew install hey

# Or use wrk (more features, Lua scripting)
brew install wrk
```

### Baseline: your server right now

First, measure what you have. Start your server and run:

```bash
# 10 seconds, 50 concurrent connections, 200 total requests
hey -z 10s -c 50 http://localhost:7878/api/hello

# Or with wrk (10 seconds, 2 threads, 50 connections)
wrk -t2 -c50 -d10s http://localhost:7878/api/hello
```

Record these numbers. They're your baseline.

**What to look at in the output:**

```
Summary:
  Total:        10.0023 secs
  Slowest:      0.0234 secs
  Fastest:      0.0001 secs
  Average:      0.0012 secs
  Requests/sec: 41234.56        ← throughput

Latency distribution:
  50% in 0.0008 secs            ← median
  90% in 0.0019 secs            ← most users
  99% in 0.0089 secs            ← tail latency (the one that matters)

Status code distribution:
  [200] 412345 responses        ← make sure no errors
```

The numbers that matter most:
1. **Requests/sec** — throughput
2. **p99 latency** — the slowest 1% of requests. This is what real users feel.
3. **Error rate** — any non-200 responses under load?

### Benchmark matrix

Run these tests and record results in a table:

```bash
# 1. Plain HTTP, simple response
hey -z 10s -c 50 http://localhost:7878/api/hello

# 2. With compression (larger response body to see the effect)
hey -z 10s -c 50 -H "Accept-Encoding: gzip" http://localhost:7878/api/hello

# 3. HTTPS (TLS overhead)
hey -z 10s -c 50 https://localhost:7878/api/hello  # (if hey supports -k for insecure)
# Note: hey doesn't have -k flag. Use wrk instead:
wrk -t2 -c50 -d10s https://localhost:7878/api/hello
# wrk trusts self-signed certs by default

# 4. Keep-alive vs no keep-alive
hey -z 10s -c 50 -disable-keepalive http://localhost:7878/api/hello
# Compare with the keep-alive result from test 1

# 5. High concurrency stress test
hey -z 10s -c 500 http://localhost:7878/api/hello
# Does it degrade gracefully or fall over?
```

Fill in a table like this:

| Test | Req/sec | p50 (ms) | p99 (ms) | Errors |
|------|---------|----------|----------|--------|
| Plain HTTP | | | | |
| With gzip | | | | |
| HTTPS (TLS) | | | | |
| No keep-alive | | | | |
| 500 concurrent | | | | |

### What you'll likely see

- **Keep-alive vs no keep-alive**: 2-5x throughput difference. TCP handshakes are expensive.
- **TLS overhead**: 10-30% throughput reduction. The handshake is the expensive part — keep-alive amortizes it.
- **Compression**: Minimal throughput impact for small responses. For large responses (>1KB), bandwidth savings outweigh CPU cost.
- **High concurrency**: Async Tokio should handle 500 connections fine. If you see errors, check your file descriptor limit (`ulimit -n`).

### Profiling: where's the time going?

If you want to go deeper, add timing to your server:

```rust
use std::time::Instant;

// In your request handler
let start = Instant::now();
let response = router.handle(request).await;
let elapsed = start.elapsed();

if elapsed.as_millis() > 10 {
    eprintln!("Slow request: {} {} took {:?}",
        request.method(), request.path(), elapsed);
}
```

### Your task

1. Install `hey` or `wrk`
2. Run the benchmark matrix above and record results
3. Add request timing to your server (log slow requests)
4. Identify your bottleneck — is it the rate limiter lock? TLS handshakes? Response building?
5. Try one optimization based on what you find and re-benchmark to verify it helped

### Common mistake: benchmarking over localhost

Localhost benchmarks measure your server's raw throughput without network latency. That's useful for comparing configurations, but it doesn't reflect real-world performance. When you deploy to EC2 (Stage 30), you'll benchmark over a real network and see very different numbers — especially for TLS, where the handshake round trips dominate.

### Checkpoint

You now have:
- Baseline performance numbers for your server
- A benchmark matrix comparing features (keep-alive, TLS, compression)
- Request timing instrumentation
- Data to make informed decisions about optimization and instance sizing

---

## Stage 30 — Deploy to EC2: Serve Real Traffic

### This is graduation

You've built an HTTP server from scratch. It handles persistent connections, streams responses, compresses data, enforces CORS, rate-limits abusers, and encrypts traffic with TLS. Now you're going to put it on the internet.

This is what happens before you add ALB, ECS, or Lambda. Before the managed services, before the abstractions — there's a binary on a Linux box listening on a port. That's what you're deploying.

**AWS connection:** You're deploying like a bare EC2 service — this is what happens before you add ALB/ECS/Lambda. Every abstraction layer you use at work (ECS tasks, Lambda functions, Fargate containers) ultimately runs a binary on a Linux machine. Today you see the bottom of the stack.

### Step 1: Cross-compile for Linux

Your Mac builds a macOS binary. EC2 runs Linux. You need to cross-compile.

```bash
# Add the Linux target
rustup target add x86_64-unknown-linux-gnu

# If your EC2 is ARM/Graviton:
rustup target add aarch64-unknown-linux-gnu
```

For cross-compilation to Linux from macOS, you need a Linux linker. The simplest approach — use `cross` or build in a Docker container:

```bash
# Option A: Install cross (uses Docker under the hood)
cargo install cross

# Build for Linux x86_64
cross build --release --target x86_64-unknown-linux-gnu

# Option B: Build directly on the EC2 instance (simpler, no cross-compile needed)
# Just install Rust on the EC2 instance and build there
```

**Recommendation for Forja:** Build directly on the EC2 instance. Cross-compilation from macOS to Linux requires a C cross-linker for any crate that links C code (like `ring`, which `rustls` uses by default). Building on the target is simpler and guaranteed to work.

### Step 2: Launch an EC2 instance

```bash
# Launch a t3.micro (free tier eligible) with Amazon Linux 2023
aws ec2 run-instances \
  --image-id resolve:ssm:/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
  --instance-type t3.micro \
  --key-name your-key-pair \
  --security-group-ids sg-xxxxx \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=forja-server}]'
```

**Security group rules you need:**

| Type | Port | Source | Why |
|------|------|--------|-----|
| SSH | 22 | Your IP | To deploy and debug |
| HTTPS | 443 | 0.0.0.0/0 | Serve traffic |
| HTTP | 80 | 0.0.0.0/0 | Redirect to HTTPS (optional) |
| Custom TCP | 7878 | 0.0.0.0/0 | Your server's port (if not using 443) |

### Step 3: Install Rust and build on the instance

```bash
# SSH into your instance
ssh -i your-key.pem ec2-user@<public-ip>

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# Install build dependencies (Amazon Linux 2023)
sudo dnf install -y gcc pkg-config
```

### Step 4: Get your code onto the instance

```bash
# Option A: Clone from git
git clone <your-repo-url>
cd forja

# Option B: scp from your Mac
scp -i your-key.pem -r ~/juk/forja/forja/ ec2-user@<public-ip>:~/forja/
```

### Step 5: Build and run

```bash
# Build release (optimized)
cd ~/forja
cargo build --release

# The binary is at target/release/forja
ls -lh target/release/forja
# Note the size — a Rust binary with TLS is typically 3-8MB

# Run it — bind to 0.0.0.0 so it accepts external connections
./target/release/forja
```

**Critical:** Bind to `0.0.0.0`, not `127.0.0.1`. Localhost only accepts connections from the machine itself. `0.0.0.0` accepts connections from any network interface — which is what you need for external traffic.

```rust
// In your main.rs — make sure this says 0.0.0.0
let listener = TcpListener::bind("0.0.0.0:7878").await.unwrap();
```

### Step 6: Test from your Mac

```bash
# Get your instance's public IP
aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=forja-server" \
  --query 'Reservations[].Instances[].PublicIpAddress' \
  --output text

# Hit your server from the internet!
curl -k https://<public-ip>:7878/api/hello

# Run a benchmark over the real network
hey -z 10s -c 10 -host localhost http://<public-ip>:7878/api/hello
# Compare these numbers with your localhost benchmarks from Stage 29
# Network latency will dominate — p99 will be much higher
```

### Step 7: Run as a background service

Your server dies when you close the SSH session. Fix that:

```bash
# Simple: nohup
nohup ./target/release/forja > /tmp/forja.log 2>&1 &

# Better: systemd service
sudo tee /etc/systemd/system/forja.service << 'EOF'
[Unit]
Description=Forja HTTP Server
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/forja
ExecStart=/home/ec2-user/forja/target/release/forja
Restart=on-failure
RestartSec=5
Environment=RUST_LOG=info

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable forja
sudo systemctl start forja

# Check status
sudo systemctl status forja

# View logs
journalctl -u forja -f
```

### Step 8: Bind to port 443 (optional, advanced)

Ports below 1024 require root on Linux. Options:

```bash
# Option A: Use setcap to allow your binary to bind low ports
sudo setcap 'cap_net_bind_service=+ep' ./target/release/forja

# Option B: Use iptables to redirect 443 → 7878
sudo iptables -t nat -A PREROUTING -p tcp --dport 443 -j REDIRECT --to-port 7878

# Then clients can use the standard HTTPS port:
curl -k https://<public-ip>/api/hello
```

### What you've built

Take a moment. Open a browser on your phone. Navigate to `https://<public-ip>:7878/api/hello`. You'll get a TLS warning (self-signed cert) — tap through it.

You're looking at a response from an HTTP server you built from scratch. In Rust. Running on a Linux machine in an AWS data center. The request traveled from your phone, through the internet, hit your EC2 instance, went through your TLS handshake code, your keep-alive connection handler, your router, your rate limiter, your compression middleware, and came back as a gzip-compressed, CORS-enabled, encrypted response.

No framework. No Express. No Flask. No nginx. Just your code.

### Your task

1. Launch an EC2 instance (t3.micro is fine)
2. Install Rust and build your server on the instance
3. Configure the security group to allow inbound traffic
4. Run your server bound to `0.0.0.0`
5. Hit it from your Mac with curl — verify TLS, compression, CORS all work
6. Set it up as a systemd service so it survives SSH disconnects
7. Run `hey` from your Mac against the public IP — record the numbers
8. Compare with your localhost benchmarks from Stage 29

### Common mistakes

**Binding to 127.0.0.1** — the #1 reason "it works locally but not from outside." Use `0.0.0.0`.

**Security group missing the port** — EC2 security groups deny all inbound by default. If curl hangs (no response, no error), it's almost certainly the security group.

**Forgetting to open the firewall on the instance** — Amazon Linux 2023 doesn't run `firewalld` by default, but if you're using a different AMI, check `sudo firewall-cmd --list-all`.

**Binary built for wrong architecture** — if you cross-compiled for x86_64 but launched a Graviton (ARM) instance, the binary won't run. Check with `file target/release/forja`.

### Cleanup

Don't forget to terminate your instance when you're done — t3.micro is cheap but not free:

```bash
aws ec2 terminate-instances --instance-ids <instance-id>
```

### Checkpoint

Your server is deployed and serving real traffic from the internet. You have:
- A release binary running on EC2
- TLS encryption (self-signed, but real TLS 1.3)
- All production features working over a real network
- Performance numbers from real-world benchmarks
- A systemd service for reliability

---

## Act 4 Complete

Look at what you've built across four acts:

| Act | What you built |
|-----|---------------|
| **Act 1** | TCP listener, HTTP parser, basic responses — from raw bytes |
| **Act 2** | Router, middleware, JSON API, static files — a real web server |
| **Act 3** | Async with Tokio, shared state, graceful shutdown — production architecture |
| **Act 4** | Keep-alive, compression, TLS, rate limiting, deployment — production features |

You started with `TcpListener::bind()` and ended with an encrypted, compressed, rate-limited HTTP server running on EC2 and serving traffic from the internet.

Every managed AWS service you use — ALB, API Gateway, CloudFront, Lambda — does some version of what you just built. The difference is scale, reliability, and years of engineering. But the fundamentals are the same: accept a connection, parse a request, route it, build a response, send it back.

You now understand those fundamentals. Not because someone told you — because you built them.

### Where to go from here

- **HTTP/2**: multiplexed streams over a single connection (the `h2` crate)
- **WebSockets**: upgrade an HTTP connection to full-duplex (`tokio-tungstenite`)
- **A real framework**: try `axum` or `actix-web` — you'll recognize everything they do, because you've done it yourself
- **Containerize**: wrap your binary in a Docker image, push to ECR, deploy on ECS
- **Add ALB**: put a load balancer in front, use ACM for a real TLS certificate, and see how the pieces you built map to AWS services

The server is yours. Ship it.