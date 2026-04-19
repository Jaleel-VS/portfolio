# Act 2 — The Router

> *"Any sufficiently advanced routing table is indistinguishable from an application framework."*

In Act 1 you built a raw HTTP server — TCP listener, request parser, response writer. You handled every request in one big `handle_connection` function with `if/else` branches on the path. That works for two routes. It falls apart at ten.

In this act you'll build a **router** — the core of every web framework. By the end, you'll have something that feels like Flask, but you built every piece yourself. You'll understand what API Gateway, ALB, and every web framework does under the hood, because you wrote the engine.

**What you'll build:**
- A route table that maps `(method, path)` → handler function
- Path parameters (`/users/:id`) with typed extraction
- Query string parsing
- POST body parsing with JSON support (serde)
- A complete REST API for a todo list
- Request logging middleware
- A static file server with directory listing

**New Rust concepts you'll learn:**
- Closures and function pointers
- Trait objects (`Box<dyn Fn>`) and dynamic dispatch
- The `move` keyword with closures
- External crates (serde, serde_json)
- Generics and trait bounds
- `Arc<Mutex<T>>` for shared mutable state
- Lifetime annotations

```mermaid
flowchart LR
    S9[Stage 9\nRoute Matching] --> S10[Stage 10\nPath Parameters]
    S10 --> S11[Stage 11\nQuery Strings]
    S11 --> S12[Stage 12\nPOST Bodies]
    S12 --> S13[Stage 13\nJSON API]
    S13 --> S14[Stage 14\nMiddleware]
    S14 --> S15[Stage 15\nStatic Files]

    style S9 fill:#1b4332,stroke:#40916c
    style S10 fill:#1b4332,stroke:#40916c
    style S11 fill:#2d6a4f,stroke:#40916c
    style S12 fill:#1b4332,stroke:#40916c
    style S13 fill:#1b4332,stroke:#40916c
    style S14 fill:#1b4332,stroke:#40916c
    style S15 fill:#1b4332,stroke:#40916c
```

---

## Stage 9 — Route Matching

> *Every web framework begins here — mapping incoming requests to the right handler function.*

*Difficulty: Medium — Est. time: 90 min*

> [!warning] Difficulty Spike
> This stage introduces several new concepts at once — closures, trait objects, `Box<dyn Fn>`, and the `'static` lifetime. Focus on getting the router working first, then come back to understand each abstraction.

Right now your server handles all requests in one monolithic function with a growing chain of `if/else` branches. Two routes is manageable; ten is chaos. This stage solves the dispatch problem: mapping incoming requests to the right handler function, so adding a new endpoint is one line of code instead of another branch in a tangled conditional.

### The Problem

Right now your `handle_connection` probably looks something like this:

```rust
fn handle_connection(stream: &mut TcpStream) {
    let request = parse_request(stream);
    
    if request.path == "/" {
        // serve index
    } else if request.path == "/about" {
        // serve about page
    } else if request.path == "/health" {
        // health check
    } else {
        // 404
    }
}
```

In Flask:

```python
@app.route('/')
def index():
    return render_template('index.html')
```

We want the same thing in Rust. Let's build it.

### Concept: Closures in Rust

A **closure** is an anonymous function that can capture variables from its surrounding scope. If you know Python lambdas, closures are the Rust equivalent — but more powerful.

```rust
// Python:  square = lambda x: x * x
// Rust:
let square = |x: i32| -> i32 { x * x };
println!("{}", square(5)); // 25
```

The `|args|` syntax defines the parameters. The body goes in `{}` (or inline for single expressions).

Closures can **capture** variables from their environment:

```rust
let greeting = String::from("Hello");
let greet = |name: &str| {
    println!("{}, {}!", greeting, name);  // captures `greeting`
};
greet("world");
```

In Python, closures capture variables from the enclosing scope automatically. Rust does the same, but the borrow checker tracks *how* the closure uses captured variables — by reference, by mutable reference, or by taking ownership.

### Concept: Function Pointers vs Closures vs Trait Objects

Rust has three ways to pass "a function" around:

1. **Function pointer** (`fn(Request) -> Response`) — a plain function, no captured state
2. **Generic closure** (`impl Fn(Request) -> Response`) — known at compile time, zero overhead
3. **Trait object** (`Box<dyn Fn(Request) -> Response>`) — erased type, stored on the heap, small runtime cost

We need option 3 because our route table stores *different* handler functions in the same `Vec`. Each handler might be a different closure with different captured variables. The compiler can't know the size of each one at compile time, so we put them behind a `Box` (heap pointer).

Think of it like Python's duck typing — any callable that takes a `Request` and returns a `Response` can be a handler. In Rust, `Box<dyn Fn(Request) -> Response>` is the typed version of that idea.

| Part | Meaning |
|------|---------|
| `Box<...>` | Heap-allocated smart pointer. Like `new` in JS/Python. Gives us a fixed-size pointer to variable-size data. |
| `dyn` | "Dynamic dispatch" — the concrete type is determined at runtime, not compile time. |
| `Fn(&Request) -> Response` | A trait for callable things. `Fn` = can be called multiple times, borrows captured state immutably. |

There are three `Fn` traits:
- `Fn` — can call many times, captures by shared reference (most common for handlers)
- `FnMut` — can call many times, captures by mutable reference
- `FnOnce` — can call exactly once, takes ownership of captures

We use `Fn` because a route handler should be callable for every matching request, not just once.

> [!info] AWS Connection
> API Gateway's route table does exactly this — it maps `(method, resource)` pairs to Lambda function ARNs. You're building the same dispatch table, except your "Lambda functions" are Rust closures.

### Your task: Build the Router

Build a `Route` struct and a `Router` struct with these capabilities:

**`Route`** — stores a method (`String`), path (`String`), and handler (`Box<dyn Fn(&Request) -> Response>`)

**`Router`** — stores a `Vec<Route>` and provides:
- `new()` — constructor
- `add_route(method, path, handler)` — registers a route
- `get(path, handler)` / `post(path, handler)` / `delete(path, handler)` — convenience methods
- `route(request)` — finds the matching route and calls its handler, or returns 404

The `add_route` signature needs generics:
```rust
fn add_route<F>(&mut self, method: &str, path: &str, handler: F)
where
    F: Fn(&Request) -> Response + 'static,
```

The `'static` bound means the closure can't borrow short-lived data — it must own everything it captures (or capture only `'static` references like string literals).

<details>
<summary>Solution — Route and Router</summary>

```rust
struct Route {
    method: String,
    path: String,
    handler: Box<dyn Fn(&Request) -> Response>,
}

struct Router {
    routes: Vec<Route>,
}

impl Router {
    fn new() -> Self {
        Router { routes: Vec::new() }
    }

    fn add_route<F>(&mut self, method: &str, path: &str, handler: F)
    where
        F: Fn(&Request) -> Response + 'static,
    {
        self.routes.push(Route {
            method: method.to_string(),
            path: path.to_string(),
            handler: Box::new(handler),
        });
    }

    fn get<F>(&mut self, path: &str, handler: F)
    where
        F: Fn(&Request) -> Response + 'static,
    {
        self.add_route("GET", path, handler);
    }

    fn post<F>(&mut self, path: &str, handler: F)
    where
        F: Fn(&Request) -> Response + 'static,
    {
        self.add_route("POST", path, handler);
    }

    fn delete<F>(&mut self, path: &str, handler: F)
    where
        F: Fn(&Request) -> Response + 'static,
    {
        self.add_route("DELETE", path, handler);
    }

    fn route(&self, request: &Request) -> Response {
        for route in &self.routes {
            if route.method == request.method && route.path == request.path {
                return (route.handler)(request);
            }
        }
        Response::new(404, "Not Found", "404 Not Found")
    }
}
```

</details>

Key concepts in the solution:

- **`impl Router`** — this is how you add methods to a struct. Data (`struct`) and behavior (`impl`) are separate in Rust.

- **`fn add_route<F>(&mut self, ...)`** — the `<F>` is a *generic type parameter*. The `where` clause constrains `F`: it must implement `Fn(&Request) -> Response` and `'static`.

- **`&mut self`** — the method borrows `self` mutably because it modifies `self.routes`.

- **`&self`** — the `route` method only reads, so it borrows immutably.

- **`(route.handler)(request)`** — calls the boxed closure. The extra parentheses are needed because `route.handler` is a field access, not a method call.

### Wiring it into main

Now restructure `main.rs` to use the router. You'll also need to update `Request` and `Response` — add a `body` field to `Request` and update `Response` to have `html()` and `to_bytes()` methods.

<details>
<summary>Full main.rs with Router</summary>

```rust
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};

// ── Request & Response ──────────────────────────────────────────────

struct Request {
    method: String,
    path: String,
    version: String,
    headers: HashMap<String, String>,
    body: String,
}

struct Response {
    status_code: u16,
    status_text: String,
    headers: HashMap<String, String>,
    body: String,
}

impl Response {
    fn new(status_code: u16, status_text: &str, body: &str) -> Self {
        let mut headers = HashMap::new();
        headers.insert("Content-Length".to_string(), body.len().to_string());
        headers.insert("Content-Type".to_string(), "text/plain".to_string());
        Response {
            status_code,
            status_text: status_text.to_string(),
            headers,
            body: body.to_string(),
        }
    }

    fn html(status_code: u16, status_text: &str, body: &str) -> Self {
        let mut resp = Response::new(status_code, status_text, body);
        resp.headers.insert("Content-Type".to_string(), "text/html".to_string());
        resp
    }

    fn to_bytes(&self) -> Vec<u8> {
        let mut output = format!("HTTP/1.1 {} {}\r\n", self.status_code, self.status_text);
        for (key, value) in &self.headers {
            output.push_str(&format!("{}: {}\r\n", key, value));
        }
        output.push_str("\r\n");
        output.push_str(&self.body);
        output.into_bytes()
    }
}

// ── Route & Router (from above) ─────────────────────────────────────

struct Route {
    method: String,
    path: String,
    handler: Box<dyn Fn(&Request) -> Response>,
}

struct Router {
    routes: Vec<Route>,
}

impl Router {
    fn new() -> Self {
        Router { routes: Vec::new() }
    }

    fn add_route<F>(&mut self, method: &str, path: &str, handler: F)
    where
        F: Fn(&Request) -> Response + 'static,
    {
        self.routes.push(Route {
            method: method.to_string(),
            path: path.to_string(),
            handler: Box::new(handler),
        });
    }

    fn get<F>(&mut self, path: &str, handler: F)
    where
        F: Fn(&Request) -> Response + 'static,
    {
        self.add_route("GET", path, handler);
    }

    fn post<F>(&mut self, path: &str, handler: F)
    where
        F: Fn(&Request) -> Response + 'static,
    {
        self.add_route("POST", path, handler);
    }

    fn delete<F>(&mut self, path: &str, handler: F)
    where
        F: Fn(&Request) -> Response + 'static,
    {
        self.add_route("DELETE", path, handler);
    }

    fn route(&self, request: &Request) -> Response {
        for route in &self.routes {
            if route.method == request.method && route.path == request.path {
                return (route.handler)(request);
            }
        }
        Response::new(404, "Not Found", "404 Not Found")
    }
}

// ── Request Parsing ─────────────────────────────────────────────────

fn parse_request(stream: &mut TcpStream) -> Option<Request> {
    let mut buffer = [0u8; 4096];
    let bytes_read = stream.read(&mut buffer).ok()?;
    if bytes_read == 0 {
        return None;
    }

    let request_str = String::from_utf8_lossy(&buffer[..bytes_read]).to_string();
    let mut lines = request_str.lines();

    let request_line = lines.next()?;
    let mut parts = request_line.split_whitespace();
    let method = parts.next()?.to_string();
    let path = parts.next()?.to_string();
    let version = parts.next()?.to_string();

    let mut headers = HashMap::new();
    let mut body_start = false;
    let mut body_lines: Vec<&str> = Vec::new();

    for line in lines {
        if body_start {
            body_lines.push(line);
        } else if line.is_empty() {
            body_start = true;
        } else if let Some((key, value)) = line.split_once(':') {
            headers.insert(key.trim().to_string(), value.trim().to_string());
        }
    }

    Some(Request {
        method,
        path,
        version,
        headers,
        body: body_lines.join("\n"),
    })
}

// ── Main ────────────────────────────────────────────────────────────

fn main() {
    let mut router = Router::new();

    router.get("/", |_req| {
        Response::html(200, "OK", "<h1>Welcome to Forja</h1><p>Your Rust HTTP server.</p>")
    });

    router.get("/health", |_req| {
        Response::new(200, "OK", "OK")
    });

    router.get("/about", |_req| {
        Response::html(200, "OK", "<h1>About</h1><p>Built from scratch in Rust.</p>")
    });

    let listener = TcpListener::bind("127.0.0.1:7878").expect("Failed to bind to port 7878");
    println!("Listening on http://127.0.0.1:7878");

    for stream in listener.incoming() {
        match stream {
            Ok(mut stream) => {
                if let Some(request) = parse_request(&mut stream) {
                    let response = router.route(&request);
                    let _ = stream.write_all(&response.to_bytes());
                }
            }
            Err(e) => eprintln!("Connection error: {}", e),
        }
    }
}
```

</details>

### 9.1 — Tests for the Router

Let's add tests for the routing logic. Add this at the bottom of `main.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn test_request(method: &str, path: &str) -> Request {
        Request {
            method: method.to_string(),
            path: path.to_string(),
            version: "HTTP/1.1".to_string(),
            headers: HashMap::new(),
            body: String::new(),
        }
    }

    #[test]
    fn test_router_matches_exact_path() {
        let mut router = Router::new();
        router.get("/health", |_req| Response::new(200, "OK", "healthy"));

        let req = test_request("GET", "/health");
        let resp = router.route(&req);
        assert_eq!(resp.status_code, 200);
        assert_eq!(resp.body, "healthy");
    }

    #[test]
    fn test_router_returns_404_for_unknown_path() {
        let router = Router::new();
        let req = test_request("GET", "/nonexistent");
        let resp = router.route(&req);
        assert_eq!(resp.status_code, 404);
    }

    #[test]
    fn test_router_matches_method() {
        let mut router = Router::new();
        router.get("/data", |_req| Response::new(200, "OK", "get"));
        router.post("/data", |_req| Response::new(201, "Created", "post"));

        let get_req = test_request("GET", "/data");
        assert_eq!(router.route(&get_req).body, "get");

        let post_req = test_request("POST", "/data");
        assert_eq!(router.route(&post_req).body, "post");
    }

    #[test]
    fn test_response_to_bytes_format() {
        let resp = Response::new(200, "OK", "hello");
        let bytes = resp.to_bytes();
        let text = String::from_utf8(bytes).unwrap();
        assert!(text.starts_with("HTTP/1.1 200 OK\r\n"));
        assert!(text.contains("Content-Length: 5"));
        assert!(text.ends_with("\r\n\r\nhello"));
    }
}
```

```bash
cargo test
```

All 4 tests should pass. From now on, run `cargo test` after every stage to make sure nothing breaks.

> [!warning] Common Mistake: Closures and the Borrow Checker
> What if you try to use a variable from `main` inside a handler?
>
> ```rust
> let server_name = String::from("Forja v2");
>
> router.get("/info", |_req| {
>     // ERROR: closure may outlive the current function
>     Response::new(200, "OK", &server_name)
> });
> ```
>
> The compiler complains because `server_name` lives on the stack in `main`, but the closure is stored in the router and might be called later — after `server_name` is dropped.
>
> **Fix: use `move`** to transfer ownership into the closure:
>
> ```rust
> let server_name = String::from("Forja v2");
>
> router.get("/info", move |_req| {
>     Response::new(200, "OK", &server_name)
> });
> // server_name has been moved — you can't use it here anymore
> ```
>
> The `move` keyword tells Rust: "don't borrow these variables — take ownership of them." The closure now *owns* `server_name`, so it's valid for as long as the closure exists.

### 9.2 — Test the server

```bash
cargo run
```

```bash
curl -s http://localhost:7878/           # Welcome page
curl -s http://localhost:7878/health     # OK
curl -s http://localhost:7878/about      # About page
curl -s http://localhost:7878/nonexistent # 404
```

### 9.3 — Extend it (exercise)

1. Add a `PUT` convenience method to the Router. Register a `PUT /data` route and test it with `curl -X PUT`.
2. Add a route counter: print how many routes are registered when the server starts. (Hint: `router.routes.len()`)

> [!check] Checkpoint
> You've forged the routing table — the backbone of every web framework. But real APIs don't have static paths like `/users`. They have dynamic segments like `/users/42`. Next, we'll teach the router to extract parameters from the URL.


---

## Stage 10 — Path Parameters

> *Real APIs have dynamic URLs. You can't register a separate route for every user ID.*

*Difficulty: Medium — Est. time: 70 min*

Your router can match exact paths, but real APIs are built on dynamic URLs. You can't register a route for every user ID, every product, every post. This stage teaches your router to recognize patterns like `/users/:id`, pull out the dynamic value, and hand it to the handler.

> [!info] AWS Connection
> API Gateway uses `{proxy+}` and `{id}` syntax for path parameters. When you define a resource like `/users/{userId}`, API Gateway extracts `userId` from the URL and passes it in the event object to your Lambda. You're building that extraction engine.

### The Approach

We'll split both the route pattern and the request path into segments, then compare segment by segment:

| Route Pattern | Request Path | Match? | Params |
|--------------|-------------|--------|--------|
| `/users/:id` | `/users/42` | yes | `id=42` |
| `/users/:id` | `/users/42/posts` | no | — |
| `/users/:id/posts/:post_id` | `/users/42/posts/7` | yes | `id=42, post_id=7` |
| `/health` | `/health` | yes | — |

A segment starting with `:` is a parameter. Everything else must match exactly.

### Your task

1. Add a `params: HashMap<String, String>` field to `Request`
2. Implement `Router::match_path(pattern, path) -> Option<HashMap<String, String>>` that compares segments
3. Update `Router::route()` to use `match_path` instead of exact string comparison
4. Add `Request::param()` and `Request::param_as::<T>()` helper methods

**Hints:**
- `pattern.split('/').collect::<Vec<&str>>()` splits into segments
- `.iter().zip()` pairs up elements from two iterators (like Python's `zip()`)
- `segment.strip_prefix(':')` returns `Some("id")` if the segment starts with `:`
- `route()` now needs `&mut Request` to write params into it

<details>
<summary>Solution — match_path and updated route</summary>

```rust
// Add to Request struct:
struct Request {
    method: String,
    path: String,
    version: String,
    headers: HashMap<String, String>,
    body: String,
    params: HashMap<String, String>,
}

impl Request {
    fn param(&self, name: &str) -> Option<&String> {
        self.params.get(name)
    }

    fn param_as<T: std::str::FromStr>(&self, name: &str) -> Option<T> {
        self.params.get(name)?.parse().ok()
    }
}

// Add to Router impl:
impl Router {
    fn match_path(pattern: &str, path: &str) -> Option<HashMap<String, String>> {
        let pattern_segments: Vec<&str> = pattern.split('/').collect();
        let path_segments: Vec<&str> = path.split('/').collect();

        if pattern_segments.len() != path_segments.len() {
            return None;
        }

        let mut params = HashMap::new();

        for (pattern_seg, path_seg) in pattern_segments.iter().zip(path_segments.iter()) {
            if let Some(param_name) = pattern_seg.strip_prefix(':') {
                params.insert(param_name.to_string(), path_seg.to_string());
            } else if pattern_seg != path_seg {
                return None;
            }
        }

        Some(params)
    }

    fn route(&self, request: &mut Request) -> Response {
        for route in &self.routes {
            if route.method != request.method {
                continue;
            }
            if let Some(params) = Router::match_path(&route.path, &request.path) {
                request.params = params;
                return (route.handler)(request);
            }
        }
        Response::new(404, "Not Found", "404 Not Found")
    }
}
```

</details>

New concepts:

- **`T: std::str::FromStr`** — a *trait bound*. It means "T can be any type that knows how to parse itself from a string." `i32`, `u64`, `f64`, `bool` all implement `FromStr`.

- **`.iter().zip()`** — pairs up elements from two iterators, like Python's `zip()`.

- **`strip_prefix(':')`** — returns `Some("id")` if the string starts with `:`, otherwise `None`.

- **`::<u64>` (turbofish)** — tells Rust which type to parse into: `req.param_as::<u64>("id")`.

### 10.1 — Tests for path matching

```rust
#[cfg(test)]
mod tests {
    use super::*;

    // ... existing tests ...

    #[test]
    fn test_match_path_exact() {
        let result = Router::match_path("/health", "/health");
        assert!(result.is_some());
        assert!(result.unwrap().is_empty());
    }

    #[test]
    fn test_match_path_with_param() {
        let result = Router::match_path("/users/:id", "/users/42").unwrap();
        assert_eq!(result.get("id").unwrap(), "42");
    }

    #[test]
    fn test_match_path_multiple_params() {
        let result = Router::match_path("/users/:id/posts/:post_id", "/users/42/posts/7").unwrap();
        assert_eq!(result.get("id").unwrap(), "42");
        assert_eq!(result.get("post_id").unwrap(), "7");
    }

    #[test]
    fn test_match_path_different_length() {
        assert!(Router::match_path("/users/:id", "/users/42/posts").is_none());
    }

    #[test]
    fn test_match_path_no_match() {
        assert!(Router::match_path("/users/:id", "/posts/42").is_none());
    }
}
```

```bash
cargo test
```

### 10.2 — Register routes with parameters

Update `main`:

```rust
router.get("/users/:id", |req| {
    match req.param_as::<u64>("id") {
        Some(id) => Response::new(200, "OK", &format!("User #{}", id)),
        None => Response::new(400, "Bad Request", "Invalid user ID — must be a number"),
    }
});

router.get("/users/:id/posts/:post_id", |req| {
    let user_id = req.params.get("id").unwrap();
    let post_id = req.params.get("post_id").unwrap();
    Response::new(200, "OK", &format!("Post {} by user {}", post_id, user_id))
});
```

Don't forget to update `main` to pass `&mut request` to `router.route()` and initialize `params: HashMap::new()` in `parse_request`.

### 10.3 — Test it

```bash
cargo run
```

```bash
curl -s http://localhost:7878/users/42        # User #42
curl -s http://localhost:7878/users/alice      # Invalid user ID
curl -s http://localhost:7878/users/42/posts/7 # Post 7 by user 42
curl -s http://localhost:7878/users            # 404 (different segment count)
```

> [!warning] Common Mistake: Route Order Matters
> Routes are checked in registration order. If you register `/users/me` *after* `/users/:id`, the parameter route matches first:
>
> ```rust
> // BUG: /users/me is caught by :id
> router.get("/users/:id", |req| { /* ... */ });
> router.get("/users/me", |req| { /* ... */ });  // never reached!
> ```
>
> **Fix:** Register specific routes before parameterized ones.

### 10.4 — Extend it (exercise)

1. Add a `param_or(&self, name: &str, default: &str) -> &str` method that returns the param value or a default. Write a test for it.
2. What happens if you register two routes with different param names but the same structure, like `/users/:id` and `/users/:name`? Which one wins? Test it.

> [!check] Checkpoint
> Your router now extracts dynamic values from URLs. But URLs carry more than just the path: query strings like `?page=2&limit=10` are how clients pass optional parameters. That's next.

---

## Stage 11 — Query Strings

> *Path parameters identify which resource. Query strings modify how you get it.*

*Difficulty: Easy — Est. time: 45 min*

Query strings are how clients pass optional parameters without changing the URL path — pagination, sorting, filtering, search terms. Every search engine, API, and web app depends on them.

> [!info] AWS Connection
> API Gateway passes query string parameters to Lambda in `event.queryStringParameters`. CloudFront uses query strings for cache keys. When you configure "Forward query strings" in a CloudFront distribution, this is the parsing that happens at the edge.

### HTTP Concept: Query String Format

The query string starts after `?` in the URL:

```
/path?key1=value1&key2=value2&key3=value3
      ↑ query string starts here
```

Special characters are percent-encoded: spaces become `+` or `%20`, `&` becomes `%26`, etc.

### Your task

1. Add `query_string: String` and `query: HashMap<String, String>` fields to `Request`
2. In `parse_request`, split the path at `?` before storing it
3. Implement `parse_query_string(query: &str) -> HashMap<String, String>`
4. Implement `decode_percent(s: &str) -> String` for `+` and `%XX` decoding
5. Add `query_param()` and `query_param_or()` helpers to `Request`

**Hints:**
- `full_path.split_once('?')` splits at the first `?`
- `query.split('&')` splits into key-value pairs
- `pair.split_once('=')` splits each pair
- For percent decoding: replace `+` with space, then handle `%XX` hex sequences

<details>
<summary>Solution — query parsing</summary>

```rust
fn decode_percent(s: &str) -> String {
    let s = s.replace('+', " ");
    let mut result = String::with_capacity(s.len());
    let mut chars = s.chars();

    while let Some(c) = chars.next() {
        if c == '%' {
            let hex: String = chars.by_ref().take(2).collect();
            if let Ok(byte) = u8::from_str_radix(&hex, 16) {
                result.push(byte as char);
            } else {
                result.push('%');
                result.push_str(&hex);
            }
        } else {
            result.push(c);
        }
    }
    result
}

fn parse_query_string(query: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    if query.is_empty() {
        return map;
    }
    for pair in query.split('&') {
        if let Some((key, value)) = pair.split_once('=') {
            map.insert(decode_percent(key), decode_percent(value));
        } else if !pair.is_empty() {
            map.insert(decode_percent(pair), String::new());
        }
    }
    map
}

// In parse_request, split path from query:
let (path, query_string) = match full_path.split_once('?') {
    Some((p, q)) => (p.to_string(), q.to_string()),
    None => (full_path, String::new()),
};
let query = parse_query_string(&query_string);

// Add to Request impl:
impl Request {
    fn query_param(&self, name: &str) -> Option<&String> {
        self.query.get(name)
    }

    fn query_param_or<'a>(&'a self, name: &str, default: &'a str) -> &'a str {
        self.query.get(name).map(|s| s.as_str()).unwrap_or(default)
    }
}
```

</details>

New concepts:

- **`chars.by_ref().take(2)`** — `by_ref()` borrows the iterator instead of consuming it, so we can keep using `chars` in the outer loop.

- **Lifetime annotation `'a`** — in `query_param_or`, the `'a` tells the compiler: "the returned `&str` lives as long as either `self` or the `default` string." The compiler needs this to know which reference the return value is tied to. Don't worry about mastering lifetimes now — the compiler will tell you when you need them.

### 11.1 — Tests for query parsing

```rust
#[test]
fn test_parse_query_string_basic() {
    let result = parse_query_string("q=rust&page=2");
    assert_eq!(result.get("q").unwrap(), "rust");
    assert_eq!(result.get("page").unwrap(), "2");
}

#[test]
fn test_parse_query_string_empty() {
    let result = parse_query_string("");
    assert!(result.is_empty());
}

#[test]
fn test_decode_percent_plus() {
    assert_eq!(decode_percent("hello+world"), "hello world");
}

#[test]
fn test_decode_percent_hex() {
    assert_eq!(decode_percent("hello%20world"), "hello world");
}

#[test]
fn test_decode_percent_at_sign() {
    assert_eq!(decode_percent("user%40example.com"), "user@example.com");
}
```

### 11.2 — Add a search route

```rust
router.get("/search", |req| {
    let query = req.query_param_or("q", "");
    let page: u32 = req.query.get("page")
        .and_then(|p| p.parse().ok())
        .unwrap_or(1);
    let limit: u32 = req.query.get("limit")
        .and_then(|l| l.parse().ok())
        .unwrap_or(10);

    Response::new(200, "OK", &format!("Search: q={}, page={}, limit={}", query, page, limit))
});
```

**`.and_then()`** — chains `Option` operations. If `Some`, applies the function; if `None`, stays `None`. Like optional chaining in JS.

### 11.3 — Test it

```bash
cargo run
```

```bash
curl -s "http://localhost:7878/search?q=rust+http&page=2&limit=5"
# → Search: q=rust http, page=2, limit=5

curl -s "http://localhost:7878/search?q=hello%20world"
# → Search: q=hello world, page=1, limit=10

curl -s "http://localhost:7878/search"
# → Search: q=, page=1, limit=10
```

### 11.4 — Extend it (exercise)

1. Add a `query_param_as::<T>()` method (like `param_as` but for query params). Write a test.
2. What happens if a query string has duplicate keys like `?tag=rust&tag=http`? Only the last value is kept. Is that correct? (Hint: real servers often support multi-valued params with `Vec<String>`.)

> [!check] Checkpoint
> Your server now handles the full URL — path, parameters, and query strings. But so far, all data flows from client to server through the URL. POST requests carry data in the *body*. That's next.


---

## Stage 12 — POST Bodies

> *Creating a user, submitting a form, or sending a JSON payload all require data in the request body.*

*Difficulty: Medium — Est. time: 90 min*

So far we've only handled GET requests — data flows through the URL. POST, PUT, and PATCH send data in the *body*. This stage opens the forge to incoming material: parsing form submissions and JSON payloads, and introducing serde — the serialization framework that every Rust web application depends on.

> [!info] AWS Connection
> Every AWS API call is either a query-string request (older services like EC2, SQS) or a JSON body request (newer services like DynamoDB, Lambda). When you call `aws lambda invoke`, the CLI sends a JSON body. You're building parsers for both.

### Two common body formats

1. **Form data** (`application/x-www-form-urlencoded`) — same format as query strings, but in the body. HTML `<form>` submissions use this by default.
2. **JSON** (`application/json`) — the standard for APIs.

### Form data parsing

Form data uses the same format as query strings. We already wrote `parse_query_string` — reuse it:

```rust
impl Request {
    fn form_data(&self) -> HashMap<String, String> {
        parse_query_string(&self.body)
    }
}
```

That's it. The `application/x-www-form-urlencoded` format is literally `key=value&key2=value2`.

### Adding serde for JSON

We *could* write a JSON parser from scratch, but that's a course in itself. Instead, we'll use **serde** and **serde_json** — the standard Rust serialization framework. This is your first external crate.

```bash
cd ~/juk/forja/forja
cargo add serde --features derive
cargo add serde_json
```

This modifies your `Cargo.toml`:

```toml
[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

The `derive` feature enables `#[derive(Serialize, Deserialize)]` — macros that auto-generate serialization code for your structs at compile time. No runtime reflection, no performance cost.

### Your task

1. Add `use serde::{Deserialize, Serialize};` to your imports
2. Add a `Response::json<T: Serialize>(status, text, data)` constructor
3. Add a `Request::json_body<T: serde::de::DeserializeOwned>()` method
4. Define a `CreateUser` struct with `#[derive(Debug, Serialize, Deserialize)]`
5. Wire up POST routes for form data and JSON

**Hints:**
- `serde_json::to_string(data).unwrap_or_else(|_| "{}".to_string())` serializes to JSON
- `serde_json::from_str(&self.body).map_err(|e| format!("JSON parse error: {}", e))` deserializes
- `DeserializeOwned` means "can deserialize into an owned value (no borrowed data)"

<details>
<summary>Solution — JSON support</summary>

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
struct CreateUser {
    name: String,
    email: String,
}

impl Response {
    fn json<T: Serialize>(status_code: u16, status_text: &str, data: &T) -> Self {
        let body = serde_json::to_string(data).unwrap_or_else(|_| "{}".to_string());
        let mut headers = HashMap::new();
        headers.insert("Content-Length".to_string(), body.len().to_string());
        headers.insert("Content-Type".to_string(), "application/json".to_string());
        Response {
            status_code,
            status_text: status_text.to_string(),
            headers,
            body,
        }
    }
}

impl Request {
    fn json_body<T: serde::de::DeserializeOwned>(&self) -> Result<T, String> {
        serde_json::from_str(&self.body).map_err(|e| format!("JSON parse error: {}", e))
    }
}
```

</details>

New concepts:

- **`#[derive(Serialize, Deserialize)]`** — auto-generates serialization code at compile time. In Python, you'd manually handle `json.loads()`. In Rust, serde generates type-safe parsing — if the JSON doesn't match the struct, you get a clear error.

- **`T: Serialize`** — any type that implements serde's `Serialize` trait. This includes `HashMap`, `Vec`, `String`, and any struct with `#[derive(Serialize)]`.

- **`DeserializeOwned`** — means "can deserialize into an owned value." The standard bound for deserialization.

### 12.1 — Wire up POST routes

```rust
// Form data endpoint
router.post("/form", |req| {
    let form = req.form_data();
    let name = form.get("name").cloned().unwrap_or_default();
    let email = form.get("email").cloned().unwrap_or_default();
    Response::new(200, "OK", &format!("Received: name={}, email={}", name, email))
});

// JSON endpoint
router.post("/api/users", |req| {
    match req.json_body::<CreateUser>() {
        Ok(user) => {
            println!("Created user: {:?}", user);
            Response::json(201, "Created", &serde_json::json!({
                "status": "created",
                "name": user.name
            }))
        }
        Err(e) => Response::new(400, "Bad Request", &e),
    }
});

// Echo endpoint — returns whatever JSON you send
router.post("/echo", |req| {
    match serde_json::from_str::<serde_json::Value>(&req.body) {
        Ok(value) => Response::json(200, "OK", &value),
        Err(e) => Response::new(400, "Bad Request", &format!("Invalid JSON: {}", e)),
    }
});
```

**`serde_json::json!`** — a macro for building JSON values inline. Cleaner than constructing a `HashMap`.

**`serde_json::Value`** — an untyped JSON value. Like Python's `json.loads()` returning a dict.

### 12.2 — Tests for JSON

```rust
#[test]
fn test_json_response() {
    let data = serde_json::json!({"status": "ok"});
    let resp = Response::json(200, "OK", &data);
    assert_eq!(resp.status_code, 200);
    assert!(resp.headers.get("Content-Type").unwrap().contains("application/json"));
    assert!(resp.body.contains("status"));
}

#[test]
fn test_form_data_parsing() {
    let mut req = test_request("POST", "/form");
    req.body = "name=Alice&email=alice%40example.com".to_string();
    let form = req.form_data();
    assert_eq!(form.get("name").unwrap(), "Alice");
    assert_eq!(form.get("email").unwrap(), "alice@example.com");
}
```

### 12.3 — Test it

```bash
cargo run
```

```bash
# Form data
curl -s -X POST http://localhost:7878/form \
  -d "name=Alice&email=alice%40example.com"
# → Received: name=Alice, email=alice@example.com

# JSON body
curl -s -X POST http://localhost:7878/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Bob","email":"bob@example.com"}'
# → {"name":"Bob","status":"created"}

# Missing field — serde gives precise errors
curl -s -X POST http://localhost:7878/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Bob"}'
# → JSON parse error: missing field `email` at line 1 column 14
```

> [!warning] Common Mistake: Forgetting `derive` Feature
> ```
> error: cannot find derive macro `Serialize` in this scope
> ```
> Check your `Cargo.toml` has `features = ["derive"]` on the serde dependency.

### 12.4 — Extend it (exercise)

1. Add an `UpdateUser` struct with `name: Option<String>` and `email: Option<String>` (both optional). Register a `PUT /api/users/:id` route that accepts partial updates. Test with `curl -X PUT -d '{"name":"New Name"}'`.
2. Use the `serde_json::json!` macro instead of `HashMap` for the response in the `/api/users` handler. Which is cleaner?

> [!check] Checkpoint
> Your server can now receive data in every way HTTP allows — URL paths, query strings, form bodies, and JSON payloads. Next, we'll assemble them into a complete REST API.

---

## Stage 13 — The JSON API

> *Everything comes together: a complete REST API with shared mutable state.*

*Difficulty: Medium — Est. time: 90 min*

You've built routing, parameter extraction, query parsing, and body parsing as separate pieces. But a real API needs all of them working together — and it needs *shared state* that persists across requests. This stage is the crucible where every piece gets combined, and where you'll face Rust's most important concurrency pattern: `Arc<Mutex<T>>`.

### REST Conventions

| Operation | HTTP Method | Path | Description |
|-----------|------------|------|-------------|
| List all | GET | `/api/todos` | Returns array of todos |
| Get one | GET | `/api/todos/:id` | Returns single todo |
| Create | POST | `/api/todos` | Creates a new todo |
| Delete | DELETE | `/api/todos/:id` | Deletes a todo |

> [!info] AWS Connection
> This is exactly how you'd design a Lambda-backed API Gateway. Each row becomes an API Gateway resource + method, wired to a Lambda handler. DynamoDB stores the items.

### Concept: `Arc<Mutex<T>>` — Shared Mutable State

Each route handler is a closure stored in the router. Multiple handlers need to access the *same* todo list. In Python, you'd use a global list. In Rust, the borrow checker won't let multiple closures mutably borrow the same data.

The solution: **`Arc<Mutex<T>>`**

- **`Mutex<T>`** (mutual exclusion) — a lock that ensures only one piece of code accesses the data at a time.
- **`Arc<T>`** (atomic reference counting) — a smart pointer that lets multiple owners share the same data.

Together, `Arc<Mutex<Vec<Todo>>>` means: "a reference-counted pointer to a locked vector of todos."

```rust
use std::sync::{Arc, Mutex};
```

The pattern for each handler:
1. `Arc::clone(&todos)` — create a new reference (cheap, just increments a counter)
2. `move |req|` — the closure takes ownership of the cloned `Arc`
3. `todos.lock().unwrap()` — acquire the lock, get a `MutexGuard` that auto-unlocks when dropped

### Your task

Build the full todo API yourself. Define:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
struct Todo {
    id: u64,
    title: String,
    completed: bool,
}

#[derive(Debug, Deserialize)]
struct CreateTodo {
    title: String,
}
```

Then implement:
1. `GET /api/todos` — return all todos as JSON array
2. `GET /api/todos/:id` — find by ID, return it or 404
3. `POST /api/todos` — parse `CreateTodo`, assign ID, add to list, return created todo
4. `DELETE /api/todos/:id` — remove by ID, return 204 or 404

**Hints:**
- `todos.iter().find(|t| t.id == id).cloned()` — find and clone a todo
- `todos.retain(|t| t.id != id)` — remove matching items
- Lock `next_id` before `todos` in the POST handler (consistent lock ordering prevents deadlocks)

<details>
<summary>Solution — full todo API</summary>

```rust
fn main() {
    let mut router = Router::new();
    let todos: Arc<Mutex<Vec<Todo>>> = Arc::new(Mutex::new(Vec::new()));
    let next_id: Arc<Mutex<u64>> = Arc::new(Mutex::new(1));

    // GET /api/todos — list all
    let todos_list = Arc::clone(&todos);
    router.get("/api/todos", move |_req| {
        let todos = todos_list.lock().unwrap();
        Response::json(200, "OK", &*todos)
    });

    // GET /api/todos/:id — get one
    let todos_get = Arc::clone(&todos);
    router.get("/api/todos/:id", move |req| {
        let id = match req.param_as::<u64>("id") {
            Some(id) => id,
            None => return Response::new(400, "Bad Request", "Invalid ID"),
        };
        let todos = todos_get.lock().unwrap();
        match todos.iter().find(|t| t.id == id).cloned() {
            Some(todo) => Response::json(200, "OK", &todo),
            None => Response::new(404, "Not Found", "Todo not found"),
        }
    });

    // POST /api/todos — create
    let todos_create = Arc::clone(&todos);
    let next_id_create = Arc::clone(&next_id);
    router.post("/api/todos", move |req| {
        let input: CreateTodo = match req.json_body() {
            Ok(data) => data,
            Err(e) => return Response::new(400, "Bad Request", &e),
        };

        let mut id_counter = next_id_create.lock().unwrap();
        let todo = Todo {
            id: *id_counter,
            title: input.title,
            completed: false,
        };
        *id_counter += 1;

        let mut todos = todos_create.lock().unwrap();
        todos.push(todo.clone());

        Response::json(201, "Created", &todo)
    });

    // DELETE /api/todos/:id — delete
    let todos_delete = Arc::clone(&todos);
    router.delete("/api/todos/:id", move |req| {
        let id = match req.param_as::<u64>("id") {
            Some(id) => id,
            None => return Response::new(400, "Bad Request", "Invalid ID"),
        };

        let mut todos = todos_delete.lock().unwrap();
        let len_before = todos.len();
        todos.retain(|t| t.id != id);

        if todos.len() < len_before {
            Response::new(204, "No Content", "")
        } else {
            Response::new(404, "Not Found", "Todo not found")
        }
    });

    // ... existing routes (/, /health, etc.) ...

    let listener = TcpListener::bind("127.0.0.1:7878").expect("Failed to bind");
    println!("Listening on http://127.0.0.1:7878");

    for stream in listener.incoming() {
        match stream {
            Ok(mut stream) => {
                if let Some(mut request) = parse_request(&mut stream) {
                    let response = router.route(&mut request);
                    let _ = stream.write_all(&response.to_bytes());
                }
            }
            Err(e) => eprintln!("Connection error: {}", e),
        }
    }
}
```

</details>

### 13.1 — Test the full API

```bash
cargo run
```

```bash
# List (empty)
curl -s http://localhost:7878/api/todos
# → []

# Create
curl -s -X POST http://localhost:7878/api/todos \
  -H "Content-Type: application/json" \
  -d '{"title":"Buy groceries"}'
# → {"id":1,"title":"Buy groceries","completed":false}

# Create another
curl -s -X POST http://localhost:7878/api/todos \
  -H "Content-Type: application/json" \
  -d '{"title":"Learn Rust"}'
# → {"id":2,"title":"Learn Rust","completed":false}

# List all
curl -s http://localhost:7878/api/todos
# → [{"id":1,...},{"id":2,...}]

# Get one
curl -s http://localhost:7878/api/todos/1
# → {"id":1,"title":"Buy groceries","completed":false}

# Delete
curl -s -X DELETE http://localhost:7878/api/todos/1
# → (empty, 204)

# Verify
curl -s http://localhost:7878/api/todos
# → [{"id":2,"title":"Learn Rust","completed":false}]
```

> [!warning] Common Mistake: Deadlock with Multiple Locks
> If you lock `next_id` and `todos` in different orders in different handlers, you can deadlock. **Always lock in the same order**, or lock one at a time and release before locking the next.

### 13.2 — Extend it (exercise)

1. Add a `PUT /api/todos/:id` route that toggles the `completed` field. Return the updated todo.
2. Add a `GET /api/todos?completed=true` filter that returns only completed (or uncompleted) todos. Use `query_param`.

> [!check] Checkpoint
> You've forged a complete REST API with shared state — the same architecture behind every Lambda + DynamoDB service. Next, we add visibility with logging middleware.


---

## Stage 14 — Middleware

> *Every request should leave a trace — method, path, status, and timing.*

*Difficulty: Medium — Est. time: 60 min*

Your API works, but you're flying blind. When a request is slow, you don't know. When an error occurs, you don't see it. This stage adds the observability layer — middleware that wraps every request with timing and logging.

> [!info] AWS Connection
> CloudFront Functions and Lambda@Edge are literally middleware — they intercept requests before they reach your origin. API Gateway's request validators, authorizers, and usage plans are all middleware patterns.

### What Is Middleware?

Middleware is code that runs *around* your route handlers — before and/or after. Common uses: logging, authentication, CORS headers, rate limiting.

### Your task

Modify the request handling loop in `main` to log every request with this format:

```
GET /api/todos → 200 (1.23ms)
POST /api/todos → 201 (0.45ms)
DELETE /api/todos/1 → 204 (0.12ms)
```

You'll need:
- `use std::time::Instant;`
- `Instant::now()` before routing
- `start.elapsed()` after getting the response
- `duration.as_secs_f64() * 1000.0` for milliseconds

<details>
<summary>Solution</summary>

```rust
use std::time::Instant;

// In the request handling loop:
Ok(mut stream) => {
    if let Some(mut request) = parse_request(&mut stream) {
        let start = Instant::now();
        let response = router.route(&mut request);
        let duration = start.elapsed();

        println!(
            "{} {} → {} ({:.2}ms)",
            request.method,
            request.path,
            response.status_code,
            duration.as_secs_f64() * 1000.0
        );

        let _ = stream.write_all(&response.to_bytes());
    }
}
```

</details>

Three lines of actual middleware logic. That's it.

### 14.1 — Making it extensible

For a more general middleware system, you can define middleware as functions that wrap the handler:

```rust
fn logging_middleware(req: &mut Request, next: &dyn Fn(&mut Request) -> Response) -> Response {
    let start = Instant::now();
    let response = next(req);
    let duration = start.elapsed();
    println!(
        "{} {} → {} ({:.2}ms)",
        req.method, req.path, response.status_code,
        duration.as_secs_f64() * 1000.0
    );
    response
}
```

This is the same pattern as Express middleware calling `next()`, or Python WSGI middleware wrapping the app callable. We won't build the full middleware chain infrastructure now — the inline version works.

### 14.2 — Test it

```bash
cargo run
```

```bash
curl -s http://localhost:7878/api/todos
curl -s -X POST http://localhost:7878/api/todos \
  -H "Content-Type: application/json" \
  -d '{"title":"Test middleware"}'
curl -s http://localhost:7878/nonexistent
```

Server output:

```
GET /api/todos → 200 (0.05ms)
POST /api/todos → 201 (0.12ms)
GET /nonexistent → 404 (0.01ms)
```

### 14.3 — Extend it (exercise)

1. Add color to the log output: green for 2xx, yellow for 4xx, red for 5xx. Use ANSI codes: `\x1b[32m` (green), `\x1b[33m` (yellow), `\x1b[31m` (red), `\x1b[0m` (reset).
2. Add a `X-Response-Time` header to every response with the duration in milliseconds. This is a common pattern — browsers and monitoring tools can read it.

> [!check] Checkpoint
> Every request now leaves a trace. One more piece remains for Act 2: serving static files from a directory.

---

## Stage 15 — Static File Server

> *A real web application needs HTML, CSS, JavaScript, and images alongside the API.*

*Difficulty: Medium — Est. time: 90 min*

Your API routes return JSON, but a real web application also needs static assets. This stage turns your server into a complete static file host — the same thing S3 static website hosting and `python -m http.server` provide.

> [!info] AWS Connection
> S3 static website hosting does exactly this. When you enable "Static website hosting" on a bucket, S3 becomes a file server with index document support, error documents, and MIME type detection. CloudFront sits in front as a CDN.

### Setup: Create test files

```bash
mkdir -p ~/juk/forja/forja/public/css ~/juk/forja/forja/public/js

cat > ~/juk/forja/forja/public/index.html << 'EOF'
<!DOCTYPE html>
<html>
<head><title>Forja</title><link rel="stylesheet" href="/css/style.css"></head>
<body><h1>Welcome to Forja</h1><p>Built from scratch in Rust.</p><script src="/js/app.js"></script></body>
</html>
EOF

cat > ~/juk/forja/forja/public/css/style.css << 'EOF'
body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; }
h1 { color: #b7410e; }
EOF

echo 'console.log("Forja loaded");' > ~/juk/forja/forja/public/js/app.js
```

### Your task

Build a static file handler that:

1. Maps URL paths to filesystem paths under `public/`
2. Serves files with the correct `Content-Type` based on extension
3. Returns `index.html` when a directory is requested
4. Returns a directory listing when no `index.html` exists
5. Prevents path traversal attacks
6. Falls back after API routes (API takes priority)

**Implementation approach:** Add a `serve_static` function that the router calls as a fallback when no API route matches. Update `Router::route()`:

```rust
fn route(&self, request: &mut Request) -> Response {
    // Try registered routes first
    for route in &self.routes {
        // ... existing matching logic ...
    }

    // Fallback: try static files
    if request.method == "GET" {
        if let Some(response) = serve_static(Path::new("public"), &request.path) {
            return response;
        }
    }

    Response::new(404, "Not Found", "404 Not Found")
}
```

You'll need:
- `guess_mime_type(path)` — map extensions to MIME types
- `safe_path(root, requested)` — canonicalize and validate (prevent traversal)
- `directory_listing(dir_path, url_path)` — generate HTML listing
- `serve_static(root, url_path)` — orchestrate the above

<details>
<summary>Solution — static file server</summary>

```rust
use std::path::{Path, PathBuf};
use std::fs;

fn guess_mime_type(path: &str) -> &str {
    match path.rsplit('.').next() {
        Some("html") => "text/html",
        Some("css") => "text/css",
        Some("js") => "application/javascript",
        Some("json") => "application/json",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("svg") => "image/svg+xml",
        Some("txt") => "text/plain",
        Some("ico") => "image/x-icon",
        Some("wasm") => "application/wasm",
        _ => "application/octet-stream",
    }
}

fn safe_path(root: &Path, requested: &str) -> Option<PathBuf> {
    let cleaned = requested.trim_start_matches('/');
    let full_path = root.join(cleaned);
    let canonical_root = root.canonicalize().ok()?;
    let canonical_path = full_path.canonicalize().ok()?;
    if canonical_path.starts_with(&canonical_root) {
        Some(canonical_path)
    } else {
        None
    }
}

fn directory_listing(dir_path: &Path, url_path: &str) -> String {
    let mut html = format!("<h1>Index of {}</h1><ul>", url_path);
    if url_path != "/" {
        html.push_str("<li><a href=\"..\">..</a></li>");
    }
    if let Ok(entries) = fs::read_dir(dir_path) {
        let mut names: Vec<String> = entries
            .filter_map(|e| e.ok())
            .map(|e| {
                let name = e.file_name().to_string_lossy().to_string();
                let is_dir = e.file_type().map(|ft| ft.is_dir()).unwrap_or(false);
                let prefix = url_path.trim_end_matches('/');
                if is_dir {
                    format!("<li><a href=\"{}/{}/\">{}/</a></li>", prefix, name, name)
                } else {
                    format!("<li><a href=\"{}/{}\">{}</a></li>", prefix, name, name)
                }
            })
            .collect();
        names.sort();
        for entry in names {
            html.push_str(&entry);
        }
    }
    html.push_str("</ul>");
    html
}

fn serve_static(root: &Path, url_path: &str) -> Option<Response> {
    let file_path = safe_path(root, url_path)?;

    if file_path.is_dir() {
        let index = file_path.join("index.html");
        if index.exists() {
            let body = fs::read_to_string(&index).ok()?;
            return Some(Response::html(200, "OK", &body));
        }
        let listing = directory_listing(&file_path, url_path);
        return Some(Response::html(200, "OK", &listing));
    }

    if file_path.is_file() {
        let bytes = fs::read(&file_path).ok()?;
        let mime = guess_mime_type(&file_path.to_string_lossy());
        let body = String::from_utf8_lossy(&bytes).to_string();
        let mut headers = HashMap::new();
        headers.insert("Content-Type".to_string(), mime.to_string());
        headers.insert("Content-Length".to_string(), bytes.len().to_string());
        return Some(Response {
            status_code: 200,
            status_text: "OK".to_string(),
            headers,
            body,
        });
    }

    None
}
```

</details>

> [!note] Binary files
> Our `Response` uses `String` for the body, which doesn't handle binary files (images) perfectly. In Act 3, we'll switch to `Vec<u8>` for proper binary support. Text files (HTML, CSS, JS, JSON) work perfectly now.

### 15.1 — Tests for static file helpers

```rust
#[test]
fn test_guess_mime_type() {
    assert_eq!(guess_mime_type("index.html"), "text/html");
    assert_eq!(guess_mime_type("style.css"), "text/css");
    assert_eq!(guess_mime_type("app.js"), "application/javascript");
    assert_eq!(guess_mime_type("data.json"), "application/json");
    assert_eq!(guess_mime_type("unknown.xyz"), "application/octet-stream");
}
```

### 15.2 — Test it

```bash
cargo run
```

```bash
curl -s http://localhost:7878/                    # index.html
curl -sI http://localhost:7878/css/style.css      # Content-Type: text/css
curl -s http://localhost:7878/js/app.js            # JS file
curl -s http://localhost:7878/../../../etc/passwd   # 404 (blocked)
curl -s http://localhost:7878/api/todos            # API still works
```

Open `http://localhost:7878` in your browser — styled page with CSS and JS.

### 15.3 — Extend it (exercise)

1. Add `Cache-Control: max-age=3600` header to static file responses. This tells browsers to cache files for 1 hour — the same thing CloudFront does.
2. Add ETag support: compute a simple hash of the file contents (e.g., `format!("{:x}", contents.len())`) and return it as the `ETag` header. If the request has `If-None-Match` matching the ETag, return `304 Not Modified` with no body.

> [!check] Checkpoint
> Your server is now a complete web platform — API routes for dynamic data, static file serving for the frontend. You've built the equivalent of API Gateway + S3 static hosting in a single binary.

---

## Act 2 — Complete

Starting from a bare TCP listener, you now have:

| Feature | What You Built | AWS Equivalent |
|---------|---------------|----------------|
| Route matching | `Router` with method+path dispatch | API Gateway resource routing |
| Path parameters | `:id` extraction with typed parsing | API Gateway `{proxy+}` / `{id}` |
| Query strings | `?key=value` parsing with defaults | API Gateway query string parameters |
| POST bodies | Form + JSON parsing with serde | Lambda event body parsing |
| REST API | CRUD todo list with JSON | Lambda + DynamoDB |
| Middleware | Request logging with timing | CloudWatch Logs / X-Ray |
| Static files | Directory serving with MIME types | S3 static website hosting |

### New Rust Concepts Learned

| Concept | Python Equivalent | First Used |
|---------|------------------|------------|
| Closures (`\|args\| body`) | `lambda` / nested functions | Stage 9 |
| `move` closures | (automatic in Python) | Stage 9 |
| Trait objects (`Box<dyn Fn>`) | Duck typing / `Callable` | Stage 9 |
| Generics (`<F: Fn(...) + 'static>`) | (no equivalent) | Stage 9 |
| `Arc<Mutex<T>>` | `threading.Lock()` | Stage 13 |
| External crates (serde) | `pip install` | Stage 12 |
| Derive macros | (no equivalent) | Stage 12 |
| Lifetime annotations (`'a`) | (no equivalent) | Stage 11 |
| Turbofish (`::<Type>`) | (no equivalent) | Stage 10 |

### What's Missing (Act 3 Preview)

Your server handles one request at a time. While it's processing a request, every other client waits. In Act 3, you'll fix that:

- **Thread per connection** — handle requests concurrently
- **Thread pool** — fixed-size pool with job queue
- **Tokio async/await** — rewrite with async I/O
- **Graceful shutdown** — handle Ctrl+C cleanly

You'll learn `std::thread`, `Send + Sync` bounds, channels, and how Rust's ownership model makes concurrent programming safe by default.

See you in [[Act 3 - Concurrency]] — where we make this server fast.
