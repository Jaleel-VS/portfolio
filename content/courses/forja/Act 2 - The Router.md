# Act 2 — The Router

> *"Any sufficiently advanced routing table is indistinguishable from an application framework."*

In Act 1 you built a raw HTTP server — TCP listener, request parser, response writer. You handled every request in one big `handle_connection` function with `if/else` branches on the path. That works for two routes. It falls apart at ten.

In this act you'll build a **router** — the core of every web framework. By the end, you'll have something that feels like Express.js or Flask, but you built every piece yourself. You'll understand what API Gateway, ALB, and every web framework does under the hood, because you wrote the engine.

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
- `impl` blocks and methods
- Pattern matching with `Option` and `Result`
- `Vec` iteration and searching

---

## Stage 9 — Route Matching

**Goal:** Register handler functions for specific method+path combinations, and dispatch incoming requests to the right handler.

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

In Express.js, you'd write:

```javascript
app.get('/', handleIndex);
app.get('/about', handleAbout);
app.get('/health', handleHealth);
```

In Flask:

```python
@app.route('/')
def index():
    return render_template('index.html')
```

We want the same thing in Rust. Let's build it.

### Concept: Closures in Rust

A **closure** is an anonymous function that can capture variables from its surrounding scope. If you know Python lambdas or JavaScript arrow functions, closures are the Rust equivalent — but more powerful.

```rust
// Python:  square = lambda x: x * x
// JS:      const square = (x) => x * x;
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

In JavaScript, every function closes over its scope automatically. Rust does the same, but the borrow checker tracks *how* the closure uses captured variables — by reference, by mutable reference, or by taking ownership.

### Concept: Function Pointers vs Closures vs Trait Objects

Rust has three ways to pass "a function" around:

1. **Function pointer** (`fn(Request) -> Response`) — a plain function, no captured state
2. **Generic closure** (`impl Fn(Request) -> Response`) — known at compile time, zero overhead
3. **Trait object** (`Box<dyn Fn(Request) -> Response>`) — erased type, stored on the heap, small runtime cost

We need option 3 because our route table stores *different* handler functions in the same `Vec`. Each handler might be a different closure with different captured variables. The compiler can't know the size of each one at compile time, so we put them behind a `Box` (heap pointer).

Think of it like Python's duck typing — any callable that takes a `Request` and returns a `Response` can be a handler. In Rust, `Box<dyn Fn(Request) -> Response>` is the typed version of that idea.

**AWS connection:** API Gateway's route table does exactly this — it maps `(method, resource)` pairs to Lambda function ARNs. You're building the same dispatch table, except your "Lambda functions" are Rust closures.

### Concept: `Box<dyn Fn>` — What Each Part Means

Let's break down `Box<dyn Fn(&Request) -> Response>`:

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

### The Route Struct

```rust
struct Route {
    method: String,
    path: String,
    handler: Box<dyn Fn(&Request) -> Response>,
}
```

Each route stores the HTTP method, the path pattern, and a boxed handler function.

### The Router

```rust
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

    fn route(&self, request: &Request) -> Response {
        for route in &self.routes {
            if route.method == request.method && route.path == request.path {
                return (route.handler)(request);
            }
        }

        Response {
            status_code: 404,
            status_text: "Not Found".to_string(),
            headers: HashMap::new(),
            body: "404 Not Found".to_string(),
        }
    }
}
```

Let's unpack the new syntax:

**`impl Router`** — this is how you add methods to a struct in Rust. Like a class in Python/TS, but data (`struct`) and behavior (`impl`) are separate.

**`fn add_route<F>(&mut self, ...)`** — the `<F>` is a *generic type parameter*. It means "this function works with any type `F`". The `where` clause constrains `F`: it must implement `Fn(&Request) -> Response` (it's callable with the right signature) and `'static` (it doesn't borrow short-lived data — more on lifetimes later).

**`&mut self`** — the method borrows `self` mutably because it modifies `self.routes`.

**`&self`** — the `route` method only reads, so it borrows immutably.

### Convenience Methods

Express has `app.get()`, `app.post()`, etc. Let's add those:

```rust
impl Router {
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
}
```

### Wiring It Into main.rs

Now let's restructure `main.rs` to use the router. Here's the full file:

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

// ── Route & Router ──────────────────────────────────────────────────

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

### Test It

```bash
cd ~/juk/forja/forja
cargo run
```

In another terminal:

```bash
# Should return HTML welcome page
curl -s http://localhost:7878/

# Should return "OK"
curl -s http://localhost:7878/health

# Should return about page
curl -s http://localhost:7878/about

# Should return 404
curl -s http://localhost:7878/nonexistent
```

Expected output:

```
<h1>Welcome to Forja</h1><p>Your Rust HTTP server.</p>
OK
<h1>About</h1><p>Built from scratch in Rust.</p>
404 Not Found
```

### Common Mistake: Closures and the Borrow Checker

What if you try to use a variable from `main` inside a handler?

```rust
let server_name = String::from("Forja v2");

router.get("/info", |_req| {
    // ERROR: closure may outlive the current function
    Response::new(200, "OK", &server_name)
});
```

The compiler complains because `server_name` lives on the stack in `main`, but the closure is stored in the router and might be called later — after `server_name` is dropped.

**Fix: use `move`** to transfer ownership into the closure:

```rust
let server_name = String::from("Forja v2");

router.get("/info", move |_req| {
    Response::new(200, "OK", &server_name)
});
// server_name has been moved — you can't use it here anymore
```

The `move` keyword tells Rust: "don't borrow these variables — take ownership of them." The closure now *owns* `server_name`, so it's valid for as long as the closure exists.

In JavaScript, closures capture by reference and the garbage collector handles cleanup. In Rust, you choose: borrow (default) or move (explicit). The compiler enforces that your choice is safe.

### Checkpoint — Stage 9

You now have:
- A `Router` struct with a `Vec<Route>`
- `get()`, `post()`, `delete()` convenience methods
- Path-based dispatch with 404 fallback
- `Response::new()` and `Response::html()` constructors
- Clean separation: routes registered in `main`, dispatch in `Router::route()`

This is the skeleton of every web framework. Express, Flask, Actix-web, Axum — they all start here.

---

## Stage 10 — Path Parameters

**Goal:** Extract dynamic segments from URLs like `/users/:id` and make them available to handlers.

### The Problem

Real APIs have dynamic paths. You don't register a route for every user ID:

```javascript
// Express.js
app.get('/users/:id', (req, res) => {
    const userId = req.params.id;
    res.json({ user: userId });
});
```

```python
# Flask
@app.route('/users/<user_id>')
def get_user(user_id):
    return jsonify(user=user_id)
```

**AWS connection:** API Gateway uses `{proxy+}` and `{id}` syntax for path parameters. When you define a resource like `/users/{userId}`, API Gateway extracts `userId` from the URL and passes it in the event object to your Lambda. You're building that extraction engine.

Right now our router does exact string matching: `route.path == request.path`. We need pattern matching: `/users/:id` should match `/users/42`, `/users/alice`, etc., and extract the dynamic part.

### The Approach

We'll split both the route pattern and the request path into segments, then compare segment by segment:

| Route Pattern | Request Path | Match? | Params |
|--------------|-------------|--------|--------|
| `/users/:id` | `/users/42` | ✅ | `id=42` |
| `/users/:id` | `/users/42/posts` | ❌ | — |
| `/users/:id/posts/:post_id` | `/users/42/posts/7` | ✅ | `id=42, post_id=7` |
| `/health` | `/health` | ✅ | — |

A segment starting with `:` is a parameter. Everything else must match exactly.

### Adding Params to Request

First, let's give `Request` a place to store extracted parameters:

```rust
struct Request {
    method: String,
    path: String,
    version: String,
    headers: HashMap<String, String>,
    body: String,
    params: HashMap<String, String>,  // NEW: path parameters
}
```

Update `parse_request` to initialize `params` as empty:

```rust
Some(Request {
    method,
    path,
    version,
    headers,
    body: body_lines.join("\n"),
    params: HashMap::new(),  // filled in by the router
})
```

### The Matching Function

Add this method to `Router`:

```rust
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
```

New Rust concepts here:

**`Vec<&str>`** — a vector of string slices. `split('/')` returns an iterator; `.collect()` gathers it into a `Vec`.

**`.iter().zip()`** — pairs up elements from two iterators, like Python's `zip()`. If you've used `zip(list_a, list_b)` in Python, this is the same thing.

**`strip_prefix(':')`** — returns `Some("id")` if the string starts with `:`, otherwise `None`. Clean pattern matching without manual string slicing.

**`Option<HashMap<...>>`** — returns `Some(params)` on match, `None` on mismatch. This is Rust's alternative to returning `null` — the compiler forces you to handle both cases.

### Update the Router's Dispatch

Replace the `route` method:

```rust
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
```

Note: `request` is now `&mut Request` because we write to `request.params`. Update the handler signatures too — they now receive `&Request` (immutable borrow is fine since params are already set).

Also update `main` to pass `&mut`:

```rust
if let Some(mut request) = parse_request(&mut stream) {
    let response = router.route(&mut request);
    let _ = stream.write_all(&response.to_bytes());
}
```

### Register Routes with Parameters

```rust
fn main() {
    let mut router = Router::new();

    router.get("/", |_req| {
        Response::html(200, "OK", "<h1>Welcome to Forja</h1>")
    });

    router.get("/health", |_req| {
        Response::new(200, "OK", "OK")
    });

    router.get("/users/:id", |req| {
        let user_id = req.params.get("id").unwrap();
        Response::new(200, "OK", &format!("User profile: {}", user_id))
    });

    router.get("/users/:id/posts/:post_id", |req| {
        let user_id = req.params.get("id").unwrap();
        let post_id = req.params.get("post_id").unwrap();
        Response::new(
            200,
            "OK",
            &format!("Post {} by user {}", post_id, user_id),
        )
    });

    let listener = TcpListener::bind("127.0.0.1:7878").expect("Failed to bind to port 7878");
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

### Test It

```bash
cargo run
```

```bash
curl -s http://localhost:7878/users/42
# → User profile: 42

curl -s http://localhost:7878/users/alice
# → User profile: alice

curl -s http://localhost:7878/users/42/posts/7
# → Post 7 by user 42

curl -s http://localhost:7878/users
# → 404 Not Found (no match — different segment count)
```

### Parsing Params into Typed Values

Right now params are all strings. What if you want a numeric ID? Add a helper method to `Request`:

```rust
impl Request {
    fn param(&self, name: &str) -> Option<&String> {
        self.params.get(name)
    }

    fn param_as<T: std::str::FromStr>(&self, name: &str) -> Option<T> {
        self.params.get(name)?.parse().ok()
    }
}
```

**`T: std::str::FromStr`** — this is a *trait bound*. It means "T can be any type that knows how to parse itself from a string." `i32`, `u64`, `f64`, `bool` all implement `FromStr`. It's like a TypeScript generic with a constraint: `function parse<T extends Parseable>(s: string): T`.

**`?.parse().ok()?`** — chained Option operations:
1. `self.params.get(name)?` — returns `None` if the param doesn't exist
2. `.parse()` — tries to parse the string into type `T`, returns `Result`
3. `.ok()` — converts `Result` to `Option` (discards the error detail)

Usage in a handler:

```rust
router.get("/users/:id", |req| {
    match req.param_as::<u64>("id") {
        Some(id) => Response::new(200, "OK", &format!("User #{}", id)),
        None => Response::new(400, "Bad Request", "Invalid user ID — must be a number"),
    }
});
```

The `::<u64>` is called the **turbofish** syntax — it tells Rust which type to parse into. It's like TypeScript's `parseFloat()` vs `parseInt()`, but generalized to any parseable type.

### Common Mistake: Route Order Matters

Routes are checked in registration order. If you register `/users/me` *after* `/users/:id`, the parameter route matches first and `me` becomes the `id` value:

```rust
// BUG: /users/me is caught by :id
router.get("/users/:id", |req| { /* ... */ });
router.get("/users/me", |req| { /* ... */ });  // never reached!
```

**Fix:** Register specific routes before parameterized ones:

```rust
// CORRECT: specific before generic
router.get("/users/me", |req| { /* ... */ });
router.get("/users/:id", |req| { /* ... */ });
```

This is the same issue in Express.js and Flask. API Gateway avoids it by using a tree structure instead of linear search — but linear search is simpler and fine for learning.

### Checkpoint — Stage 10

Full `main.rs` at this point:

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
        resp.headers
            .insert("Content-Type".to_string(), "text/html".to_string());
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

// ── Route & Router ──────────────────────────────────────────────────

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
        params: HashMap::new(),
    })
}

// ── Main ────────────────────────────────────────────────────────────

fn main() {
    let mut router = Router::new();

    router.get("/", |_req| {
        Response::html(200, "OK", "<h1>Welcome to Forja</h1>")
    });

    router.get("/health", |_req| {
        Response::new(200, "OK", "OK")
    });

    router.get("/users/:id", |req| {
        match req.param_as::<u64>("id") {
            Some(id) => Response::new(200, "OK", &format!("User #{}", id)),
            None => Response::new(400, "Bad Request", "Invalid user ID"),
        }
    });

    router.get("/users/:id/posts/:post_id", |req| {
        let user_id = req.params.get("id").unwrap();
        let post_id = req.params.get("post_id").unwrap();
        Response::new(200, "OK", &format!("Post {} by user {}", post_id, user_id))
    });

    let listener = TcpListener::bind("127.0.0.1:7878").expect("Failed to bind to port 7878");
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

---

## Stage 11 — Query Strings

**Goal:** Parse `?key=value&other=thing` from the URL and make it available to handlers.

### The Problem

Query strings are how clients pass optional parameters without changing the URL path:

```
GET /search?q=rust+http&page=2&limit=10
GET /users?sort=name&order=asc
```

In Express: `req.query.q`. In Flask: `request.args.get('q')`. We need the same.

**AWS connection:** API Gateway passes query string parameters to Lambda in `event.queryStringParameters`. CloudFront uses query strings for cache keys. When you configure "Forward query strings" in a CloudFront distribution, this is the parsing that happens at the edge.

### HTTP Concept: Query String Format

The query string starts after `?` in the URL and consists of `key=value` pairs separated by `&`:

```
/path?key1=value1&key2=value2&key3=value3
      ↑ query string starts here
```

Special characters are percent-encoded: spaces become `+` or `%20`, `&` becomes `%26`, etc. We'll handle basic decoding.

### Splitting Path and Query

Right now, `request.path` contains the full URL including the query string. We need to split it. Add a `query` field to `Request`:

```rust
struct Request {
    method: String,
    path: String,
    query_string: String,
    version: String,
    headers: HashMap<String, String>,
    body: String,
    params: HashMap<String, String>,
    query: HashMap<String, String>,
}
```

### The Query Parser

Add these functions:

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
```

New Rust here:

**`chars.by_ref().take(2)`** — `by_ref()` borrows the iterator instead of consuming it, so we can keep using `chars` in the outer loop after taking 2 characters. Without `by_ref()`, `take()` would move ownership of the iterator.

**`String::with_capacity(s.len())`** — pre-allocates memory. Like Python's `io.StringIO` or pre-sizing a JS array. Not required, but avoids repeated reallocations.

### Update parse_request

Split the path from the query string during parsing:

```rust
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
    let full_path = parts.next()?.to_string();
    let version = parts.next()?.to_string();

    // Split path from query string
    let (path, query_string) = match full_path.split_once('?') {
        Some((p, q)) => (p.to_string(), q.to_string()),
        None => (full_path, String::new()),
    };

    let query = parse_query_string(&query_string);

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
        query_string,
        version,
        headers,
        body: body_lines.join("\n"),
        params: HashMap::new(),
        query,
    })
}
```

### Add Query Helpers to Request

```rust
impl Request {
    fn param(&self, name: &str) -> Option<&String> {
        self.params.get(name)
    }

    fn param_as<T: std::str::FromStr>(&self, name: &str) -> Option<T> {
        self.params.get(name)?.parse().ok()
    }

    fn query_param(&self, name: &str) -> Option<&String> {
        self.query.get(name)
    }

    fn query_param_or<'a>(&'a self, name: &str, default: &'a str) -> &'a str {
        self.query.get(name).map(|s| s.as_str()).unwrap_or(default)
    }
}
```

**Lifetime annotation `'a`** — this is new. The `'a` tells the compiler: "the returned `&str` lives as long as either `self` or the `default` string." Without it, Rust can't figure out which reference the return value is tied to. Think of it as a label that connects input lifetimes to output lifetimes.

Don't worry about mastering lifetimes now — the compiler will tell you when you need them. The pattern `fn foo<'a>(&'a self, s: &'a str) -> &'a str` is the most common one.

### Add a Search Route

```rust
router.get("/search", |req| {
    let query = req.query_param_or("q", "");
    let page: u32 = req.query.get("page")
        .and_then(|p| p.parse().ok())
        .unwrap_or(1);
    let limit: u32 = req.query.get("limit")
        .and_then(|l| l.parse().ok())
        .unwrap_or(10);

    Response::new(
        200,
        "OK",
        &format!("Search: q={}, page={}, limit={}", query, page, limit),
    )
});
```

**`.and_then()`** — chains `Option` operations. If the `Option` is `Some`, applies the function; if `None`, stays `None`. Like optional chaining in JS (`value?.parse()`) but explicit.

### Test It

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

# Path params still work alongside query strings
curl -s "http://localhost:7878/users/42"
# → User #42
```

Note: the `+` was decoded to a space, and `%20` was decoded to a space. Default values kick in when params are missing.

### Important: Router Matches on Path Only

The router's `match_path` compares against `request.path`, which no longer includes the query string. This is correct — query strings are optional metadata, not part of the route identity. `/search?q=foo` and `/search?q=bar` both match the `/search` route.

This matches how every framework works: Express, Flask, API Gateway — they all route on the path and pass query params separately.

### Checkpoint — Stage 11

You now have:
- Query string parsing with percent-decoding
- `request.query` HashMap for raw access
- `query_param()` and `query_param_or()` helpers
- Type-safe parsing via `.parse()` with defaults
- Clean separation of path routing and query parameters

---

## Stage 12 — POST Bodies

**Goal:** Read request bodies, parse form data and JSON. Introduce your first external crate: serde.

### The Problem

So far we've only handled GET requests — data flows through the URL. POST, PUT, and PATCH send data in the *body*. Two common formats:

1. **Form data** (`application/x-www-form-urlencoded`) — same format as query strings, but in the body. HTML `<form>` submissions use this by default.
2. **JSON** (`application/json`) — the standard for APIs. What you send to Lambda, DynamoDB, every AWS API.

**AWS connection:** Every AWS API call is either a query-string request (older services like EC2, SQS) or a JSON body request (newer services like DynamoDB, Lambda). When you call `aws lambda invoke`, the CLI sends a JSON body. When you call `aws ec2 describe-instances`, it sends form-encoded parameters. You're building parsers for both.

### HTTP Concept: Content-Length and Content-Type

When a client sends a body, it includes two headers:

```
POST /api/todos HTTP/1.1
Content-Type: application/json
Content-Length: 27

{"title":"Buy groceries"}
```

- **Content-Type** tells the server how to parse the body
- **Content-Length** tells the server how many bytes to read

Our current parser already captures the body (everything after the blank line). But we should use `Content-Length` to read the exact right amount. For now, our simple parser works for small payloads.

### Parsing Form Data

Form data uses the same format as query strings. We already wrote `parse_query_string` — let's reuse it:

```rust
impl Request {
    fn form_data(&self) -> HashMap<String, String> {
        parse_query_string(&self.body)
    }
}
```

That's it. The `application/x-www-form-urlencoded` format is literally `key=value&key2=value2` — the same as query strings.

### Adding serde for JSON

Now for JSON. We *could* write a JSON parser from scratch, but that's a course in itself. Instead, we'll use **serde** and **serde_json** — the standard Rust serialization framework. This is your first external crate.

**What is serde?** It's Rust's equivalent of Python's `json` module or JavaScript's `JSON.parse()`/`JSON.stringify()`, but it works with *any* data format (JSON, YAML, TOML, MessagePack, etc.) and *any* Rust type. The name comes from **ser**ialize/**de**serialize.

Add the dependencies:

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

### Using serde_json

Add the imports at the top of `main.rs`:

```rust
use serde::{Deserialize, Serialize};
```

Now add a JSON helper to `Response`:

```rust
impl Response {
    // ... existing methods ...

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
```

**`T: Serialize`** — any type that implements serde's `Serialize` trait. This includes `HashMap`, `Vec`, `String`, and any struct you annotate with `#[derive(Serialize)]`.

**`serde_json::to_string(data)`** — converts any `Serialize` type to a JSON string. Returns `Result<String, Error>`. We use `unwrap_or_else` to fall back to `"{}"` on error.

And a JSON parsing helper on `Request`:

```rust
impl Request {
    // ... existing methods ...

    fn json_body<T: for<'de> Deserialize<'de>>(&self) -> Result<T, String> {
        serde_json::from_str(&self.body).map_err(|e| format!("JSON parse error: {}", e))
    }
}
```

**`for<'de> Deserialize<'de>`** — this is a *higher-ranked trait bound* (HRTB). Don't worry about the theory — it means "can be deserialized from any input lifetime." This is the standard bound for deserialization. You'll see it in every serde example. Just copy the pattern: `T: for<'de> Deserialize<'de>` or equivalently `T: serde::de::DeserializeOwned`.

Let's use the simpler equivalent:

```rust
impl Request {
    fn json_body<T: serde::de::DeserializeOwned>(&self) -> Result<T, String> {
        serde_json::from_str(&self.body).map_err(|e| format!("JSON parse error: {}", e))
    }
}
```

**`DeserializeOwned`** means "can deserialize into an owned value (no borrowed data)." For most cases, this is what you want.

### Define a Data Struct

```rust
#[derive(Debug, Serialize, Deserialize)]
struct CreateUser {
    name: String,
    email: String,
}
```

The `#[derive(...)]` attribute auto-generates implementations:
- `Debug` — enables `println!("{:?}", user)` for debugging
- `Serialize` — enables converting to JSON
- `Deserialize` — enables parsing from JSON

In Python, you'd write a class and manually handle `json.loads()`. In TypeScript, you'd define an interface and cast. In Rust, serde generates type-safe parsing code at compile time — if the JSON doesn't match the struct, you get a clear error at runtime, not a silent `undefined`.

### Wire Up POST Routes

```rust
fn main() {
    let mut router = Router::new();

    router.get("/", |_req| {
        Response::html(200, "OK", "<h1>Welcome to Forja</h1>")
    });

    router.get("/health", |_req| {
        Response::new(200, "OK", "OK")
    });

    router.get("/users/:id", |req| {
        match req.param_as::<u64>("id") {
            Some(id) => Response::new(200, "OK", &format!("User #{}", id)),
            None => Response::new(400, "Bad Request", "Invalid user ID"),
        }
    });

    router.get("/search", |req| {
        let query = req.query_param_or("q", "");
        let page: u32 = req.query.get("page")
            .and_then(|p| p.parse().ok())
            .unwrap_or(1);
        Response::new(200, "OK", &format!("Search: q={}, page={}", query, page))
    });

    // Form data endpoint
    router.post("/form", |req| {
        let form = req.form_data();
        let name = form.get("name").cloned().unwrap_or_default();
        let email = form.get("email").cloned().unwrap_or_default();
        Response::new(
            200,
            "OK",
            &format!("Received form: name={}, email={}", name, email),
        )
    });

    // JSON endpoint
    router.post("/api/users", |req| {
        match req.json_body::<CreateUser>() {
            Ok(user) => {
                println!("Created user: {:?}", user);
                let mut response_data = HashMap::new();
                response_data.insert("status", "created");
                response_data.insert("name", &user.name);
                Response::json(201, "Created", &response_data)
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

    let listener = TcpListener::bind("127.0.0.1:7878").expect("Failed to bind to port 7878");
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

**`serde_json::Value`** — an untyped JSON value. Like Python's `json.loads()` returning a dict, or JavaScript's `JSON.parse()` returning `any`. Useful when you don't know the structure ahead of time.

### Test It

```bash
cargo run
```

```bash
# Form data
curl -s -X POST http://localhost:7878/form \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "name=Alice&email=alice%40example.com"
# → Received form: name=Alice, email=alice@example.com

# JSON body
curl -s -X POST http://localhost:7878/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Bob","email":"bob@example.com"}'
# → {"name":"Bob","status":"created"}

# Invalid JSON
curl -s -X POST http://localhost:7878/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Bob"}'
# → JSON parse error: missing field `email` at line 1 column 14

# Echo endpoint
curl -s -X POST http://localhost:7878/echo \
  -H "Content-Type: application/json" \
  -d '{"anything":"works","nested":{"values":true}}'
# → {"anything":"works","nested":{"values":true}}
```

Notice the error message for the missing `email` field — serde gives you precise, helpful errors for free. In JavaScript, you'd get `undefined` and find out three function calls later. In Rust, the error is immediate and descriptive.

### Common Mistake: Forgetting `derive` Feature

If you see this error:

```
error: cannot find derive macro `Serialize` in this scope
```

You forgot the `derive` feature. Check your `Cargo.toml`:

```toml
# WRONG — missing derive feature
serde = "1"

# CORRECT
serde = { version = "1", features = ["derive"] }
```

### Common Mistake: Owned vs Borrowed in HashMap

This won't compile:

```rust
let mut map = HashMap::new();
map.insert("status", "created");
map.insert("name", &user.name);  // ERROR: &String vs &str
```

The issue: `"status"` is `&str` (string literal), but `&user.name` is `&String`. They're different types. Fix by being consistent:

```rust
// Option 1: all &str
let mut map = HashMap::new();
map.insert("status", "created");
map.insert("name", user.name.as_str());

// Option 2: use serde_json::json! macro
let response = serde_json::json!({
    "status": "created",
    "name": user.name
});
Response::json(201, "Created", &response)
```

The `json!` macro is usually cleaner for building JSON responses. It accepts any type that implements `Serialize` and handles the type juggling for you.

### Checkpoint — Stage 12

Full `main.rs` at this point — I'll show just the new/changed parts since the checkpoint code is getting long. The full structure is:

```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};

struct Request {
    method: String,
    path: String,
    query_string: String,
    version: String,
    headers: HashMap<String, String>,
    body: String,
    params: HashMap<String, String>,
    query: HashMap<String, String>,
}

impl Request {
    fn param(&self, name: &str) -> Option<&String> { self.params.get(name) }
    fn param_as<T: std::str::FromStr>(&self, name: &str) -> Option<T> {
        self.params.get(name)?.parse().ok()
    }
    fn query_param(&self, name: &str) -> Option<&String> { self.query.get(name) }
    fn query_param_or<'a>(&'a self, name: &str, default: &'a str) -> &'a str {
        self.query.get(name).map(|s| s.as_str()).unwrap_or(default)
    }
    fn form_data(&self) -> HashMap<String, String> { parse_query_string(&self.body) }
    fn json_body<T: serde::de::DeserializeOwned>(&self) -> Result<T, String> {
        serde_json::from_str(&self.body).map_err(|e| format!("JSON parse error: {}", e))
    }
}

struct Response { /* status_code, status_text, headers, body */ }

impl Response {
    fn new(status_code: u16, status_text: &str, body: &str) -> Self { /* ... */ }
    fn html(status_code: u16, status_text: &str, body: &str) -> Self { /* ... */ }
    fn json<T: Serialize>(status_code: u16, status_text: &str, data: &T) -> Self { /* ... */ }
    fn to_bytes(&self) -> Vec<u8> { /* ... */ }
}

// Route, Router (with match_path, get/post/delete, route)
// decode_percent, parse_query_string, parse_request
// CreateUser struct with derive(Debug, Serialize, Deserialize)
// main with all routes
```

You now have a server that can:
- Route GET and POST requests to handlers
- Extract path parameters and query strings
- Parse form-encoded and JSON request bodies
- Return JSON responses
- Give helpful error messages for malformed input

This is a real web framework. Small, but real.

---

## Stage 13 — The JSON API

**Goal:** Build a complete REST API for a todo list — GET, POST, DELETE — with JSON throughout. This is where everything comes together.

### REST Conventions

REST (Representational State Transfer) maps CRUD operations to HTTP methods:

| Operation | HTTP Method | Path | Description |
|-----------|------------|------|-------------|
| List all | GET | `/api/todos` | Returns array of todos |
| Get one | GET | `/api/todos/:id` | Returns single todo |
| Create | POST | `/api/todos` | Creates a new todo |
| Delete | DELETE | `/api/todos/:id` | Deletes a todo |

**AWS connection:** This is exactly how you'd design a Lambda-backed API Gateway. Each row becomes an API Gateway resource + method, wired to a Lambda handler. DynamoDB stores the items. You're building the API Gateway + Lambda layer.

### The Challenge: Shared Mutable State

Here's the problem. Each route handler is a closure stored in the router. Multiple handlers need to access the *same* todo list — one handler adds items, another reads them, another deletes. In JavaScript, you'd just use a module-level variable. In Python, a global list.

In Rust, the borrow checker won't let multiple closures mutably borrow the same data. This is where you meet one of Rust's most important patterns.

### Concept: `Arc<Mutex<T>>` — Shared Mutable State

To share mutable data between closures, we need two things:

1. **`Mutex<T>`** (mutual exclusion) — a lock that ensures only one piece of code accesses the data at a time. Like a bathroom lock — one person at a time.

2. **`Arc<T>`** (atomic reference counting) — a smart pointer that lets multiple owners share the same data. When the last owner drops it, the data is freed.

Together, `Arc<Mutex<Vec<Todo>>>` means: "a reference-counted pointer to a locked vector of todos."

```rust
use std::sync::{Arc, Mutex};
```

In Python, you'd use `threading.Lock()`. In JavaScript (single-threaded), you don't need locks. In Rust, the type system *forces* you to use them — you literally cannot share mutable data between closures without `Mutex`.

**Why not just `Mutex`?** Because `Mutex<T>` has a single owner. When you `move` it into one closure, the other closures can't use it. `Arc` (Atomic Reference Count) lets multiple closures each hold a reference to the *same* `Mutex`.

**Why not `Rc` instead of `Arc`?** `Rc` (Reference Count) is the single-threaded version. `Arc` is thread-safe. We'll need `Arc` when we add threading later, and it works fine for single-threaded code too.

### Your Task

This stage gives you partial code and hints. Build the todo API yourself, then check against the solution.

**Step 1: Define the Todo struct**

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

`Clone` lets us copy a `Todo` out of the `Vec` without moving it. We need this because the `Mutex` lock is temporary — we lock, clone the data we need, unlock.

**Step 2: Create shared state**

```rust
fn main() {
    let mut router = Router::new();
    let todos: Arc<Mutex<Vec<Todo>>> = Arc::new(Mutex::new(Vec::new()));
    let next_id: Arc<Mutex<u64>> = Arc::new(Mutex::new(1));

    // ... routes go here ...
}
```

**Step 3: Implement the routes**

For each route, you'll need to:
1. `clone()` the `Arc` before the closure (so the closure owns its own reference)
2. Use `move` on the closure to take ownership of the cloned `Arc`
3. `.lock().unwrap()` to access the data inside the `Mutex`

Here's the pattern for the list endpoint:

```rust
    let todos_clone = Arc::clone(&todos);
    router.get("/api/todos", move |_req| {
        let todos = todos_clone.lock().unwrap();
        Response::json(200, "OK", &*todos)
    });
```

**`Arc::clone(&todos)`** — creates a new reference to the same data. This is cheap (just increments a counter), not a deep copy.

**`move |_req|`** — the closure takes ownership of `todos_clone`. Each closure gets its own `Arc` pointing to the shared `Mutex`.

**`todos_clone.lock().unwrap()`** — acquires the mutex lock. Returns a `MutexGuard` that auto-unlocks when dropped (end of scope). The `.unwrap()` panics if the lock is poisoned (another thread panicked while holding it).

**`&*todos`** — dereferences the `MutexGuard` to get `&Vec<Todo>`, which serde can serialize.

**Now implement these yourself:**

1. `GET /api/todos` — return all todos as JSON array (shown above)
2. `GET /api/todos/:id` — find a todo by ID, return it or 404
3. `POST /api/todos` — parse `CreateTodo` from body, assign an ID, add to the list, return the created todo
4. `DELETE /api/todos/:id` — remove a todo by ID, return 204 No Content or 404

**Hints:**
- For GET by ID: `todos.iter().find(|t| t.id == id).cloned()`
- For POST: lock both `next_id` and `todos`, create the `Todo`, push it
- For DELETE: `todos.retain(|t| t.id != id)` removes matching items
- Return `Response::new(204, "No Content", "")` for successful delete

Try it yourself before looking at the solution below.

---

### Solution

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

    // Keep existing routes
    router.get("/", |_req| {
        Response::html(200, "OK", "<h1>Forja Todo API</h1>")
    });

    router.get("/health", |_req| {
        Response::new(200, "OK", "OK")
    });

    let listener = TcpListener::bind("127.0.0.1:7878").expect("Failed to bind to port 7878");
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

Don't forget to add the imports at the top of the file:

```rust
use std::sync::{Arc, Mutex};
```

### Test the Full API

```bash
cargo run
```

```bash
# List todos (empty)
curl -s http://localhost:7878/api/todos
# → []

# Create a todo
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
# → [{"id":1,"title":"Buy groceries","completed":false},{"id":2,"title":"Learn Rust","completed":false}]

# Get one
curl -s http://localhost:7878/api/todos/1
# → {"id":1,"title":"Buy groceries","completed":false}

# Get nonexistent
curl -s http://localhost:7878/api/todos/99
# → Todo not found

# Delete
curl -s -X DELETE http://localhost:7878/api/todos/1
# → (empty body, 204 status)

# Verify deletion
curl -s http://localhost:7878/api/todos
# → [{"id":2,"title":"Learn Rust","completed":false}]
```

You just built a REST API from scratch. No framework, no magic — just TCP, HTTP parsing, routing, and JSON serialization.

### Common Mistake: Deadlock with Multiple Locks

If you lock `next_id` and `todos` in different orders in different handlers, you can deadlock:

```rust
// Handler A: locks todos, then next_id
let todos = todos.lock().unwrap();
let id = next_id.lock().unwrap();  // DEADLOCK if Handler B holds next_id

// Handler B: locks next_id, then todos
let id = next_id.lock().unwrap();
let todos = todos.lock().unwrap();  // DEADLOCK if Handler A holds todos
```

**Fix:** Always lock in the same order, or lock one at a time and release before locking the next. In our solution, the POST handler locks `next_id` first, then `todos` — and no other handler locks both, so we're safe.

### Checkpoint — Stage 13

You now have a working REST API with:
- CRUD operations (Create, Read, Delete)
- Shared mutable state via `Arc<Mutex<T>>`
- JSON request parsing and response serialization
- Proper HTTP status codes (200, 201, 204, 400, 404)
- Error handling for invalid input

---

## Stage 14 — Middleware

**Goal:** Add a logging middleware that prints method, path, status code, and duration for every request.

### What Is Middleware?

Middleware is code that runs *around* your route handlers — before and/or after. It's the same concept everywhere:

- **Express.js:** `app.use((req, res, next) => { ... })`
- **Python/Flask:** `@app.before_request` / `@app.after_request`
- **AWS:** API Gateway has "request/response transformations" and Lambda authorizers — both are middleware

Common uses: logging, authentication, CORS headers, rate limiting, request ID injection.

**AWS connection:** CloudFront Functions and Lambda@Edge are literally middleware — they intercept requests before they reach your origin, and responses before they reach the client. API Gateway's request validators, authorizers, and usage plans are all middleware patterns. You're building the same interception mechanism.

### The Approach

The simplest middleware pattern: wrap the router's `route()` method. Instead of calling the handler directly, we call a chain of middleware functions, each of which can inspect/modify the request, call the next function, and inspect/modify the response.

For now, we'll keep it simple — a logging wrapper around the dispatch.

### Concept: `std::time::Instant`

Rust's `std::time::Instant` is a monotonic clock for measuring durations. Like Python's `time.monotonic()` or JavaScript's `performance.now()`.

```rust
use std::time::Instant;

let start = Instant::now();
// ... do work ...
let duration = start.elapsed(); // returns std::time::Duration
println!("Took {:?}", duration); // "Took 1.234ms"
```

### Your Task

Modify the request handling loop in `main` to log every request. This is the simplest form of middleware — wrapping the dispatch call.

**What to log:**
```
GET /api/todos → 200 (1.23ms)
POST /api/todos → 201 (0.45ms)
DELETE /api/todos/1 → 204 (0.12ms)
GET /nonexistent → 404 (0.08ms)
```

**Hints:**
1. Capture `Instant::now()` before calling `router.route()`
2. After getting the response, compute `start.elapsed()`
3. Print method, path, status code, and duration
4. The duration's `as_secs_f64() * 1000.0` gives milliseconds as a float

Try it yourself, then check the solution.

---

### Solution

Update the request handling loop in `main`:

```rust
use std::time::Instant;

// In the for stream in listener.incoming() loop:
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

That's it. Three lines of actual middleware logic.

### Making It Extensible

If you want a more general middleware system, you can define middleware as functions that wrap the handler:

```rust
type Handler = Box<dyn Fn(&mut Request) -> Response>;
type Middleware = Box<dyn Fn(&mut Request, &dyn Fn(&mut Request) -> Response) -> Response>;
```

A middleware takes the request *and* the next handler in the chain, so it can run code before and after:

```rust
fn logging_middleware(req: &mut Request, next: &dyn Fn(&mut Request) -> Response) -> Response {
    let start = Instant::now();
    let response = next(req);  // call the actual handler
    let duration = start.elapsed();
    println!(
        "{} {} → {} ({:.2}ms)",
        req.method, req.path, response.status_code,
        duration.as_secs_f64() * 1000.0
    );
    response
}
```

This is the same pattern as Express middleware calling `next()`, or Python WSGI middleware wrapping the app callable. We won't build the full middleware chain infrastructure now — the inline version works and keeps the code simple. But you can see how it would scale.

### Test It

```bash
cargo run
```

In another terminal, fire off some requests:

```bash
curl -s http://localhost:7878/api/todos
curl -s -X POST http://localhost:7878/api/todos \
  -H "Content-Type: application/json" \
  -d '{"title":"Test middleware"}'
curl -s http://localhost:7878/api/todos/1
curl -s http://localhost:7878/nonexistent
```

In the server terminal, you should see:

```
GET /api/todos → 200 (0.05ms)
POST /api/todos → 201 (0.12ms)
GET /api/todos/1 → 200 (0.04ms)
GET /nonexistent → 404 (0.01ms)
```

Every request logged with method, path, status, and timing. This is what you see in CloudWatch Logs for API Gateway — method, resource, status, latency. You just built the logger.

### Checkpoint — Stage 14

You now have:
- Request logging with method, path, status code, and duration
- Understanding of the middleware pattern
- `std::time::Instant` for performance measurement

---

## Stage 15 — Static File Server

**Goal:** Serve an entire directory of files, with directory listing, `index.html` fallback, and proper MIME types.

### The Problem

In Act 1, you served individual files. Now we want to serve an entire directory — like `python -m http.server` or S3 static website hosting. Point the server at a `public/` folder and it serves whatever's in there.

**AWS connection:** S3 static website hosting does exactly this. When you enable "Static website hosting" on a bucket, S3 becomes a file server with index document support, error documents, and MIME type detection. CloudFront sits in front as a CDN. You're building the S3 static hosting engine.

### Setup: Create Test Files

```bash
mkdir -p ~/juk/forja/forja/public/css
mkdir -p ~/juk/forja/forja/public/js
mkdir -p ~/juk/forja/forja/public/images

cat > ~/juk/forja/forja/public/index.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>Forja</title>
    <link rel="stylesheet" href="/css/style.css">
</head>
<body>
    <h1>Welcome to Forja</h1>
    <p>A web server built from scratch in Rust.</p>
    <script src="/js/app.js"></script>
</body>
</html>
EOF

cat > ~/juk/forja/forja/public/css/style.css << 'EOF'
body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
h1 { color: #b7410e; }
EOF

cat > ~/juk/forja/forja/public/js/app.js << 'EOF'
console.log("Forja loaded");
EOF

echo "About page content" > ~/juk/forja/forja/public/about.txt
```

### Your Task

Build a static file handler that:

1. Maps URL paths to filesystem paths under a root directory (e.g., `/css/style.css` → `public/css/style.css`)
2. Serves files with the correct `Content-Type` based on extension
3. Returns `index.html` when a directory is requested (like S3's index document)
4. Returns a directory listing when no `index.html` exists
5. Returns 404 for missing files
6. Prevents path traversal attacks (`../../../etc/passwd`)

### MIME Types

A quick reference for common MIME types:

| Extension | MIME Type |
|-----------|----------|
| `.html` | `text/html` |
| `.css` | `text/css` |
| `.js` | `application/javascript` |
| `.json` | `application/json` |
| `.png` | `image/png` |
| `.jpg` / `.jpeg` | `image/jpeg` |
| `.gif` | `image/gif` |
| `.svg` | `image/svg+xml` |
| `.txt` | `text/plain` |
| `.ico` | `image/x-icon` |
| `.wasm` | `application/wasm` |

**AWS connection:** CloudFront and S3 use the same MIME type mapping. When you upload a file to S3, you set `ContentType` in the metadata. If you don't, S3 defaults to `application/octet-stream` and browsers won't render HTML or apply CSS. Your server needs to get this right too.

### Hints

**MIME type detection:**

```rust
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
```

**Path traversal prevention:**

```rust
use std::path::{Path, PathBuf};
use std::fs;

fn safe_path(root: &Path, requested: &str) -> Option<PathBuf> {
    // Remove leading slash and normalize
    let cleaned = requested.trim_start_matches('/');
    let full_path = root.join(cleaned);

    // Canonicalize both paths and check the file is under root
    let canonical_root = root.canonicalize().ok()?;
    let canonical_path = full_path.canonicalize().ok()?;

    if canonical_path.starts_with(&canonical_root) {
        Some(canonical_path)
    } else {
        None // path traversal attempt
    }
}
```

**`canonicalize()`** resolves `..`, symlinks, and relative paths to an absolute path. If the resolved path doesn't start with the root directory, someone is trying to escape — return `None`.

**Reading binary files:**

```rust
fn read_file_bytes(path: &Path) -> Option<Vec<u8>> {
    fs::read(path).ok()
}
```

Use `fs::read()` (returns `Vec<u8>`) instead of `fs::read_to_string()` so binary files (images, wasm) work too.

**Directory listing:**

```rust
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
                if is_dir {
                    format!("<li><a href=\"{}/{}/\">{}/</a></li>", url_path.trim_end_matches('/'), name, name)
                } else {
                    format!("<li><a href=\"{}/{}\">{}</a></li>", url_path.trim_end_matches('/'), name, name)
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
```

**The static file handler:**

Wire it all together as a catch-all at the end of your routes. The key insight: register it as a handler that checks the filesystem for any path that doesn't match an API route.

```rust
let static_root = PathBuf::from("public");

router.get("/*", move |req| {
    // ... but we don't have wildcard routes yet
});
```

We don't have wildcard matching in our router. Instead, add a `serve_static` method to `Router` that's checked as a fallback:

```rust
impl Router {
    fn route(&self, request: &mut Request) -> Response {
        // Try registered routes first
        for route in &self.routes {
            if route.method != request.method {
                continue;
            }
            if let Some(params) = Router::match_path(&route.path, &request.path) {
                request.params = params;
                return (route.handler)(request);
            }
        }

        // Fallback: try static files
        if request.method == "GET" {
            if let Some(response) = serve_static(Path::new("public"), &request.path) {
                return response;
            }
        }

        Response::new(404, "Not Found", "404 Not Found")
    }
}
```

Now implement `serve_static`:

```rust
fn serve_static(root: &Path, url_path: &str) -> Option<Response> {
    let file_path = safe_path(root, url_path)?;

    if file_path.is_dir() {
        // Try index.html first
        let index = file_path.join("index.html");
        if index.exists() {
            let body = fs::read_to_string(&index).ok()?;
            return Some(Response::html(200, "OK", &body));
        }
        // Directory listing
        let listing = directory_listing(&file_path, url_path);
        return Some(Response::html(200, "OK", &listing));
    }

    if file_path.is_file() {
        let bytes = fs::read(&file_path).ok()?;
        let mime = guess_mime_type(&file_path.to_string_lossy());
        let mut headers = HashMap::new();
        headers.insert("Content-Type".to_string(), mime.to_string());
        headers.insert("Content-Length".to_string(), bytes.len().to_string());

        // For text files, convert to string body
        // For binary files, we'd need to change Response to support Vec<u8>
        // For now, use lossy conversion (works for text, images need binary support)
        let body = String::from_utf8_lossy(&bytes).to_string();

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

> **Note:** Our `Response` struct uses `String` for the body, which doesn't handle binary files (images) perfectly. In Act 3, we'll switch to `Vec<u8>` for proper binary support. For now, text files (HTML, CSS, JS, JSON) work perfectly.

### Test It

```bash
cargo run
```

```bash
# Serves index.html for root
curl -s http://localhost:7878/
# → <!DOCTYPE html><html>...

# Serves CSS with correct Content-Type
curl -sI http://localhost:7878/css/style.css
# → Content-Type: text/css

# Serves JS
curl -s http://localhost:7878/js/app.js
# → console.log("Forja loaded");

# Text file
curl -s http://localhost:7878/about.txt
# → About page content

# Directory listing (for /images/ which has no index.html)
curl -s http://localhost:7878/images/
# → <h1>Index of /images/</h1><ul>...</ul>

# 404 for missing files
curl -s http://localhost:7878/nonexistent.html
# → 404 Not Found

# Path traversal blocked
curl -s http://localhost:7878/../../../etc/passwd
# → 404 Not Found

# API routes still work (checked before static files)
curl -s http://localhost:7878/api/todos
# → []

# Open in browser for the full experience
open http://localhost:7878
```

### Security: Path Traversal

The `safe_path` function is critical. Without it, a request for `/../../../etc/passwd` would read system files. The `canonicalize()` + `starts_with()` check ensures the resolved path is always under the `public/` directory.

This is the same protection S3 has — you can't access objects outside your bucket, no matter what key you request. CloudFront adds another layer by only forwarding requests that match your origin path pattern.

### Checkpoint — Stage 15

You now have a complete static file server with:
- File serving with MIME type detection
- `index.html` fallback for directories
- Directory listing
- Path traversal prevention
- Fallback after API routes (API takes priority)

---

## Act 2 — Complete

Look at what you built. Starting from a bare TCP listener, you now have:

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

- **Closures** (`|args| body`) — anonymous functions that capture their environment
- **`move` closures** — transfer ownership of captured variables into the closure
- **Trait objects** (`Box<dyn Fn>`) — type-erased callable objects stored on the heap
- **Generics** (`<F: Fn(...) + 'static>`) — functions that work with any type meeting constraints
- **`impl` blocks** — methods on structs
- **`Arc<Mutex<T>>`** — shared mutable state between closures
- **External crates** — serde/serde_json for serialization
- **Derive macros** — `#[derive(Serialize, Deserialize, Clone, Debug)]`
- **Lifetime annotations** (`'a`) — connecting input and output reference lifetimes
- **Turbofish** (`::<Type>`) — explicit type parameters on function calls
- **`Option` chaining** — `.and_then()`, `.unwrap_or()`, `.map()`

### What's Missing (Act 3 Preview)

Your server handles one request at a time. While it's processing a request, every other client waits. In Act 3, you'll fix that:

- **Multithreading** — handle requests concurrently with a thread pool
- **Binary response bodies** — `Vec<u8>` instead of `String` for images and downloads
- **Connection keep-alive** — reuse TCP connections for multiple requests
- **Graceful shutdown** — handle Ctrl+C cleanly
- **Error recovery** — don't crash the server on a bad request

You'll learn `std::thread`, `Send + Sync` bounds, channels, and how Rust's ownership model makes concurrent programming safe by default — the thing that makes Rust special.

### Quick Reference

```bash
# Run the server
cd ~/juk/forja/forja
cargo run

# Test endpoints
curl http://localhost:7878/                          # index.html
curl http://localhost:7878/health                    # health check
curl http://localhost:7878/users/42                  # path params
curl "http://localhost:7878/search?q=rust&page=2"    # query strings
curl -X POST http://localhost:7878/api/todos \
  -H "Content-Type: application/json" \
  -d '{"title":"Test"}'                              # create todo
curl http://localhost:7878/api/todos                  # list todos
curl -X DELETE http://localhost:7878/api/todos/1      # delete todo
curl http://localhost:7878/css/style.css              # static file
```

You're no longer using a web framework. You *are* the web framework.
