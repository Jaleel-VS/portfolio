# Forja — Build Your Own HTTP Server in Rust

> *Forja* means "forge" in Spanish — you're forging your understanding of HTTP from raw metal.

A progressive, project-based Rust course. You build ONE project from scratch — starting with `println!` and ending with a fully-featured HTTP/1.1 server deployed to EC2. No frameworks, no magic. Just `std::net`, Tokio, and your understanding of every byte on the wire.

**Project:** `~/juk/forja/forja/` (Rust 2024 edition)

---

## Course Map

### [[Act 1 - Raw TCP]] — "The Socket"

| # | Stage | Difficulty | Est. Time |
|---|-------|-----------|-----------|
| 1 | Hello Cargo — cargo new, println!, project setup | Very Easy | 30 min |
| 2 | The Listener — bind a TCP socket, accept connections, print raw bytes | Easy | 45 min |
| 3 | What the Browser Sent — parse the HTTP request line | Easy | 50 min |
| 4 | Your First Response — write a valid HTTP response | Easy | 50 min |
| 5 | The Headers — parse headers into a HashMap | Medium | 60 min |
| 6 | Serving Files — read from disk, Content-Type, serve HTML/CSS/JS | Medium | 70 min |
| 7 | 404 Not Found — error responses, status codes, path security | Easy | 50 min |
| 8 | The Request Struct — refactor into Request/Response structs, first tests | Medium | 90 min |

**Act 1 total: ~7.5 hours**

---

### [[Act 2 - The Router]] — "The Pathways"

| # | Stage | Difficulty | Est. Time |
|---|-------|-----------|-----------|
| 9 | Route Matching — register handlers, match paths | Medium | 90 min |
| 10 | Path Parameters — extract `/users/:id`, typed parsing | Medium | 70 min |
| 11 | Query Strings — parse `?key=value` into a map | Easy | 45 min |
| 12 | POST Bodies — form data and JSON with serde | Medium | 90 min |
| 13 | The JSON API — REST todo list (GET/POST/DELETE) | Medium | 90 min |
| 14 | Middleware — logging with method, path, status, duration | Medium | 60 min |
| 15 | Static File Server — directory listing, index.html, MIME types | Medium | 90 min |

**Act 2 total: ~9 hours**

---

### [[Act 3 - Concurrency]] — "The Thread Pool"

| # | Stage | Difficulty | Est. Time |
|---|-------|-----------|-----------|
| 16 | One at a Time — demonstrate the blocking problem | Easy | 30 min |
| 17 | Thread Per Connection — spawn threads, handle concurrency | Medium | 70 min |
| 18 | The Thread Pool — fixed-size pool with job queue | Hard | 120 min |
| 19 | Shared State — Arc<Mutex<>> for cross-handler data | Medium | 70 min |
| 20 | Tokio Awakens — rewrite with async/await | Hard | 120 min |
| 21 | Async Handlers — async routes, tokio::spawn | Medium | 70 min |
| 22 | Graceful Shutdown — Ctrl+C, drain connections | Medium | 70 min |

**Act 3 total: ~9 hours**

---

### [[Act 4 - Production Features]] — "The Forge"

| # | Stage | Difficulty | Est. Time |
|---|-------|-----------|-----------|
| 23 | Keep-Alive — persistent connections, Connection header | Medium | 70 min |
| 24 | Chunked Transfer — streaming responses | Medium | 70 min |
| 25 | Compression — gzip with Accept-Encoding | Medium | 90 min |
| 26 | CORS — preflight OPTIONS, Access-Control headers | Easy | 45 min |
| 27 | Rate Limiting — token bucket per IP, 429 responses | Medium | 90 min |
| 28 | TLS (HTTPS) — rustls, self-signed certs | Hard | 120 min |
| 29 | Benchmarking — wrk/hey, thread pool vs async | Medium | 70 min |
| 30 | Deploy to EC2 — cross-compile, deploy, serve real traffic | Hard | 120 min |

**Act 4 total: ~11 hours**

---

### [[Reference Guide]]

Quick-reference companion — keep it open alongside the course:
- Rust cheat sheet (ownership, borrowing, lifetimes, common patterns)
- HTTP reference (methods, status codes, headers, raw format)
- Networking glossary (TCP, sockets, TLS, DNS)
- AWS service mapping (every concept → the AWS service that does it)
- Cargo commands
- Useful crates
- Debugging & troubleshooting

---

## Total Estimated Time

| Act | Hours |
|-----|-------|
| Act 1 — Raw TCP | 7.5 |
| Act 2 — The Router | 9 |
| Act 3 — Concurrency | 9 |
| Act 4 — Production | 11 |
| **Total** | **~36.5 hours** |

---

## Prerequisites

- Rust installed (`rustup` — [rustup.rs](https://rustup.rs))
- A terminal (Ghostty, iTerm2, etc.)
- A text editor (nvim, VS Code, etc.)
- `curl` for testing
- Python experience (comparisons throughout)
- An AWS account (for Stage 30)

## Getting Started

```bash
cd ~/juk/forja/forja
cargo run
```

Open [[Act 1 - Raw TCP]] and begin with Stage 1.
