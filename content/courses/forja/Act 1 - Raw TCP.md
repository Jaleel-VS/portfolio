# Act 1 — Raw TCP

> *You will build an HTTP server from nothing. No frameworks, no libraries — just you, a TCP socket, and the Rust standard library. By the end of this act, you'll understand what happens between the moment a browser sends a request and the moment it renders a page.*

**Prerequisites**: A Mac with [Rust installed](https://rustup.rs/) (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`), a terminal (Ghostty), and a text editor (nvim). You should be comfortable writing Python or TypeScript — we'll reference both throughout.

**Project location**: `~/juk/forja/forja/`

---

## Stage 1 — Hello Cargo

*Difficulty: Very Easy*

Before we touch networking, let's make sure Rust is working and understand the project structure. If you've used `npm init` or `pip init`, Cargo is Rust's equivalent — it's the build tool, package manager, and test runner all in one.

### 1.1 — Create the project

Open your terminal and run:

```bash
cd ~/juk/forja
cargo init forja --edition 2024
cd forja
```

`cargo init` creates a new Rust project inside an existing directory (or `cargo new forja` to create the directory too). The `--edition 2024` flag tells Cargo to use the latest Rust edition — think of editions like Python 3 vs Python 2, but backwards-compatible. Your code opts into the newest language features.

Let's look at what Cargo created:

```bash
ls -la
```

```
.
├── Cargo.toml
├── src/
│   └── main.rs
```

Two things. That's it. Compare this to a fresh `create-react-app` with 30,000 files in `node_modules/` — Rust has no runtime dependencies by default.

### 1.2 — Cargo.toml: your package.json

Open `Cargo.toml`:

```toml
[package]
name = "forja"
version = "0.1.0"
edition = "2024"
```

This is like `package.json` in Node.js or `pyproject.toml` in Python. It declares your project's name, version, and which Rust edition to use. Dependencies will go here later (under `[dependencies]`), but we won't need any external crates for Act 1 — the standard library has everything we need.

### 1.3 — Your first Rust program

Open `src/main.rs`:

```rust
fn main() {
    println!("Hello, world!");
}
```

Let's break this down — every single token matters in Rust:

- **`fn`** — declares a function. Like `def` in Python or `function` in JavaScript.
- **`main()`** — the entry point. Every Rust binary must have exactly one `main` function. Like `if __name__ == "__main__"` in Python, but enforced by the compiler.
- **`println!`** — prints text to the terminal. The `!` means it's a *macro*, not a regular function. For now, think of macros as "functions that can do extra magic at compile time." `println!` needs to be a macro because it accepts a variable number of arguments — something regular Rust functions can't do.
- **`"Hello, world!"`** — a string literal. Double quotes only — single quotes are for individual characters (`'a'`), unlike Python where they're interchangeable.
- **`;`** — semicolons are required at the end of statements. Coming from Python, this will feel annoying for a day, then you'll stop noticing.
- **`{ }`** — curly braces define blocks, like JavaScript. No colons-and-indentation like Python.

### 1.4 — Build and run

```bash
cargo run
```

```
   Compiling forja v0.1.0 (/Users/you/juk/forja/forja)
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.50s
     Running `target/debug/forja`
Hello, world!
```

`cargo run` does two things: compiles your code (`cargo build`) and then runs the resulting binary. The compiled binary lives at `target/debug/forja`.

**What just happened under the hood**: Rust compiled your source code into a native binary — actual machine code, not bytecode. There's no interpreter, no VM, no runtime. When you run `target/debug/forja`, it's as direct as running a C program. This is why Rust programs start instantly — no Python interpreter startup, no Node.js V8 warmup.

> **AWS connection**: This is why Lambda functions written in Rust have near-zero cold starts compared to Python or Node.js. There's no runtime to initialize — the binary just runs.

### 1.5 — Let's customize it

Replace the contents of `src/main.rs`:

```rust
fn main() {
    let port = 7878;
    println!("Forja server will listen on port {port}");
}
```

New concepts:

- **`let`** — declares a variable. Like `let` in JavaScript or just `x = 5` in Python. In Rust, variables are *immutable by default* — you can't change `port` after this line. If you wanted to change it later, you'd write `let mut port = 7878;`. This is the opposite of most languages, and it's intentional: immutability prevents entire categories of bugs.
- **`{port}`** — string interpolation inside `println!`. Like f-strings in Python (`f"port {port}"`) or template literals in JS (`` `port ${port}` ``). This only works inside macros like `println!` — you can't do this with regular strings (we'll see why later).

Run it:

```bash
cargo run
```

```
Forja server will listen on port 7878
```

> **Why port 7878?** It's "rust" typed on a phone keypad. It's the traditional example port in Rust tutorials. We'll use it throughout.

### 1.6 — Common mistakes at this stage

**Forgetting the semicolon:**
```rust
fn main() {
    println!("hello")  // ← missing semicolon
}
```
```
error: expected `;`
```
Rust's error messages are excellent — they'll tell you exactly what's wrong and often suggest the fix.

**Using single quotes for strings:**
```rust
let name = 'forja';  // ← wrong! Single quotes are for chars only
```
```
error: character literal may only contain one codepoint
```
Use double quotes: `let name = "forja";`

**Trying to mutate an immutable variable:**
```rust
let port = 7878;
port = 8080;  // ← error!
```
```
error[E0384]: cannot assign twice to immutable variable `port`
```
The fix: `let mut port = 7878;` — but we don't need mutation here.

### Stage 1 checkpoint

Your `src/main.rs` should be:

```rust
fn main() {
    let port = 7878;
    println!("Forja server will listen on port {port}");
}
```

Your `Cargo.toml` should be:

```toml
[package]
name = "forja"
version = "0.1.0"
edition = "2024"
```

Run `cargo run` and confirm you see: `Forja server will listen on port 7878`

---

## Stage 2 — The Listener

*Difficulty: Easy*

Time to open a socket and listen for connections. This is the foundation of every web server, load balancer, and proxy you've ever used.

### 2.1 — What is a TCP socket?

Before we write code, let's understand what we're building.

When you type `http://localhost:7878` in a browser, here's what happens at the network level:

1. **DNS resolution** — the browser resolves `localhost` to `127.0.0.1` (your own machine).
2. **TCP three-way handshake** — the browser (client) and your server establish a connection:
   - Client → Server: **SYN** ("I want to connect")
   - Server → Client: **SYN-ACK** ("OK, I acknowledge")
   - Client → Server: **ACK** ("Great, we're connected")
3. **Data transfer** — the browser sends an HTTP request over this TCP connection, and your server sends back a response.
4. **Connection close** — either side can close the connection with a FIN packet.

A **socket** is the programming interface to this process. It's identified by an IP address + port number. Think of the IP address as a building's street address, and the port as the apartment number.

> **AWS connection**: This three-way handshake happens billions of times a day on AWS. When your ALB (Application Load Balancer) accepts a connection from a client, it's doing exactly what we're about to do — calling `accept()` on a TCP socket. The ALB then opens a *second* TCP connection to your backend (EC2 instance, ECS container, Lambda), making it a reverse proxy. NLBs (Network Load Balancers) operate at this TCP layer directly — they forward the raw TCP connection without understanding HTTP at all.

### 2.2 — Binding to a port

Replace `src/main.rs` with:

```rust
use std::net::TcpListener;

fn main() {
    let listener = TcpListener::bind("127.0.0.1:7878").unwrap();
    println!("Listening on port 7878");
}
```

Let's unpack every piece:

- **`use std::net::TcpListener;`** — an import statement. Like `from socket import socket` in Python or `import net from 'net'` in Node.js. `std` is the standard library, `net` is the networking module, and `TcpListener` is the specific type we want. Rust doesn't auto-import anything (unlike Python's builtins) — you must be explicit.

- **`TcpListener::bind("127.0.0.1:7878")`** — creates a TCP listener bound to this address. The `::` syntax calls an *associated function* (like a static method in Python/JS). `bind` is `TcpListener`'s constructor — its signature is:
  ```rust
  pub fn bind<A: ToSocketAddrs>(addr: A) -> Result<TcpListener>
  ```
  It takes anything that can be converted to a socket address (a string like `"127.0.0.1:7878"` works) and returns a `Result`.

- **`Result`** — this is how Rust handles errors. There are no exceptions, no try/catch. `Result` is an enum with two variants:
  - `Ok(value)` — success, contains the `TcpListener`
  - `Err(error)` — failure, contains an error (e.g., "address already in use")

  In Python, `socket.bind()` would raise an `OSError`. In Rust, it returns a `Result` and *forces* you to handle it.

- **`.unwrap()`** — "give me the `Ok` value, or crash the program if it's an `Err`." This is the quick-and-dirty way to handle `Result`. In production code you'd handle the error properly, but for learning, `unwrap()` is fine — it'll print a clear error message if something goes wrong.

- **`let listener = ...`** — binds the `TcpListener` to the variable `listener`. Rust infers the type — you don't need to write `let listener: TcpListener = ...` (though you can).

Run it:

```bash
cargo run
```

```
Listening on port 7878
```

The program prints the message and immediately exits. That's because we're not doing anything with the listener yet — we need to accept connections.

### 2.3 — Accepting connections

Update `src/main.rs`:

```rust
use std::net::TcpListener;

fn main() {
    let listener = TcpListener::bind("127.0.0.1:7878").unwrap();
    println!("Listening on port 7878");

    for stream in listener.incoming() {
        let stream = stream.unwrap();
        println!("Connection established from: {}", stream.peer_addr().unwrap());
    }
}
```

New concepts:

- **`listener.incoming()`** — returns an iterator that yields new TCP connections as they arrive. Its signature is:
  ```rust
  pub fn incoming(&self) -> Incoming<'_>
  ```
  Each item in the iterator is a `Result<TcpStream>`. This method blocks — it waits until a client connects, yields that connection, then waits for the next one. The loop runs forever.

- **`for stream in listener.incoming()`** — a for loop, like Python's `for stream in listener.incoming()`. Rust's `for` loops work on anything that implements the `Iterator` trait (like Python's `__iter__`).

- **`let stream = stream.unwrap();`** — wait, we already have a `stream` variable from the `for` line! This is called *shadowing* — Rust lets you reuse a variable name, and the new binding replaces the old one. The `for` loop gives us a `Result<TcpStream>`, and we unwrap it to get the `TcpStream` inside. Shadowing is idiomatic Rust — it avoids names like `stream_result` and `stream_value`.

- **`stream.peer_addr().unwrap()`** — returns the remote client's IP address and port. The `peer_addr()` method signature is:
  ```rust
  pub fn peer_addr(&self) -> Result<SocketAddr>
  ```

- **`{}`** in the format string — a placeholder, like `{}` in Python's `.format()`. We could also write `{:?}` for debug formatting (more detail).

Run the server:

```bash
cargo run
```

```
Listening on port 7878
```

The program now hangs — it's waiting for a connection. Open a **second terminal** and run:

```bash
curl http://localhost:7878
```

Back in the first terminal, you'll see:

```
Connection established from: 127.0.0.1:52431
```

(The port number after the colon will be different — it's an *ephemeral port* assigned by the OS to the client side of the connection.)

`curl` will hang and eventually show `curl: (52) Empty reply from server` — that's expected, because we're not sending any response yet.

Press `Ctrl+C` in the server terminal to stop it.

### 2.4 — Reading the raw bytes

Now let's see what the browser actually sends us. Update `src/main.rs`:

```rust
use std::io::Read;
use std::net::TcpListener;

fn main() {
    let listener = TcpListener::bind("127.0.0.1:7878").unwrap();
    println!("Listening on port 7878");

    for stream in listener.incoming() {
        let mut stream = stream.unwrap();
        println!("Connection established!");

        let mut buffer = [0u8; 1024];
        let bytes_read = stream.read(&mut buffer).unwrap();

        let request = String::from_utf8_lossy(&buffer[..bytes_read]);
        println!("Received {} bytes:\n{}", bytes_read, request);
    }
}
```

Several new concepts here:

- **`use std::io::Read;`** — imports the `Read` trait. `TcpStream` implements `Read`, which gives it the `.read()` method. In Rust, you must import a trait before you can call its methods — even if the type already implements it. This is different from Python/JS where methods are always available.

- **`let mut stream`** — the `mut` keyword makes this variable mutable. We need this because `.read()` takes `&mut self` — it modifies the stream's internal state (advancing the read position). Without `mut`, the compiler would refuse to let us call `.read()`.

- **`let mut buffer = [0u8; 1024];`** — creates a fixed-size array of 1024 bytes, all initialized to zero.
  - `[0u8; 1024]` — array syntax: `[value; count]`. `0u8` means "the number 0, as an unsigned 8-bit integer." The `u8` suffix is a type annotation on the literal.
  - This is a *stack-allocated* buffer — no heap allocation, no garbage collector. In Python, you'd write `buffer = bytearray(1024)`. In Node.js, `Buffer.alloc(1024)`.
  - Why 1024? It's enough for a simple HTTP request. Real servers use larger buffers or read in a loop — we'll improve this later.

- **`stream.read(&mut buffer)`** — reads bytes from the TCP stream into our buffer. The signature (from the `Read` trait) is:
  ```rust
  fn read(&mut self, buf: &mut [u8]) -> Result<usize>
  ```
  It returns the number of bytes actually read. The `&mut buffer` passes a *mutable reference* to the buffer — the function can write into it without taking ownership. This is Rust's borrowing system in action:
  - `&buffer` — "borrow this, read-only" (like passing by const reference in C++)
  - `&mut buffer` — "borrow this, you can modify it"

- **`String::from_utf8_lossy(&buffer[..bytes_read])`** — converts raw bytes to a string.
  - `&buffer[..bytes_read]` — a *slice* of the buffer, from index 0 to `bytes_read`. Like Python's `buffer[:bytes_read]`. We don't want to print the trailing zeros.
  - `from_utf8_lossy` — converts bytes to a string, replacing any invalid UTF-8 with `�`. The "lossy" part means it won't crash on binary data.

Run the server and hit it with curl:

```bash
# Terminal 1:
cargo run

# Terminal 2:
curl http://localhost:7878
```

You'll see something like:

```
Connection established!
Received 78 bytes:
GET / HTTP/1.1
Host: localhost:7878
User-Agent: curl/8.7.1
Accept: */*

```

**That's a raw HTTP request.** You're looking at the actual bytes that travel over the wire between a client and a server. Every web framework you've ever used — Express, Flask, Django, FastAPI — parses exactly this text format under the hood.

Now try it with a browser — open `http://localhost:7878` in Chrome or Safari. You'll see a much longer request with many more headers (Accept-Language, Accept-Encoding, Connection, etc.). Browsers are chatty.

### 2.5 — Common mistakes at this stage

**"Address already in use":**
```
thread 'main' panicked at 'called `Result::unwrap()` on an `Err` value:
Os { code: 48, kind: AddrInUse, message: "Address already in use" }'
```
This means another process (maybe a previous run of your server that you forgot to kill) is already using port 7878. Fix it:
```bash
# Find what's using the port:
lsof -i :7878
# Kill it:
kill -9 <PID>
```
Or just use a different port. This error is the same `EADDRINUSE` you'd get in Node.js or Python.

> **AWS connection**: This is why ECS tasks and Lambda functions don't let you pick arbitrary ports — the platform manages port allocation to avoid conflicts. When you configure an ALB target group, you're telling the ALB which port your application is listening on.

**Forgetting `use std::io::Read;`:**
```
error[E0599]: no method named `read` found for struct `TcpStream` in the current scope
  = help: items from traits can only be used if the trait is in scope
  = help: the following trait is implemented but not in scope; perhaps add a `use` for it:
          use std::io::Read;
```
Rust's error messages are incredibly helpful — it tells you exactly which `use` statement to add.

**Forgetting `mut`:**
```
error[E0596]: cannot borrow `stream` as mutable, as it is not declared as mutable
  --> src/main.rs:10:26
   |
9  |         let stream = stream.unwrap();
   |             ------ help: consider changing this to be mutable: `mut stream`
```
Again, the compiler tells you the fix. This is Rust's philosophy: the compiler is your pair programmer.

### Stage 2 checkpoint

Your `src/main.rs`:

```rust
use std::io::Read;
use std::net::TcpListener;

fn main() {
    let listener = TcpListener::bind("127.0.0.1:7878").unwrap();
    println!("Listening on port 7878");

    for stream in listener.incoming() {
        let mut stream = stream.unwrap();
        println!("Connection established!");

        let mut buffer = [0u8; 1024];
        let bytes_read = stream.read(&mut buffer).unwrap();

        let request = String::from_utf8_lossy(&buffer[..bytes_read]);
        println!("Received {} bytes:\n{}", bytes_read, request);
    }
}
```

**Test it:**
```bash
cargo run
# In another terminal:
curl http://localhost:7878
```

You should see the raw HTTP request printed in the server terminal.

---

## Stage 3 — What the Browser Sent

*Difficulty: Easy*

We can see the raw HTTP request. Now let's parse it — extract the method, path, and HTTP version from the request line.

### 3.1 — Anatomy of an HTTP request

Here's what curl sent us:

```
GET / HTTP/1.1\r\n
Host: localhost:7878\r\n
User-Agent: curl/8.7.1\r\n
Accept: */*\r\n
\r\n
```

The `\r\n` characters are carriage-return + line-feed (CRLF) — the line ending that HTTP requires. The structure is:

1. **Request line**: `METHOD PATH VERSION` — e.g., `GET / HTTP/1.1`
2. **Headers**: `Key: Value` pairs, one per line
3. **Empty line**: signals the end of headers (`\r\n\r\n`)
4. **Body** (optional): for POST/PUT requests

The request line has three parts:
- **Method**: `GET`, `POST`, `PUT`, `DELETE`, etc. — what action to perform
- **Path**: `/`, `/index.html`, `/api/users` — what resource to access
- **Version**: `HTTP/1.1` — which HTTP version

> **AWS connection**: API Gateway parses exactly this format. When you define a route like `GET /users/{id}`, API Gateway is matching against the method and path from the request line. CloudFront does the same thing when evaluating cache behaviors — it looks at the path pattern to decide which origin to forward to.

### 3.2 — Extracting the request line

Let's extract a `handle_connection` function and parse the request line. Update `src/main.rs`:

```rust
use std::io::Read;
use std::net::{TcpListener, TcpStream};

fn handle_connection(mut stream: TcpStream) {
    let mut buffer = [0u8; 1024];
    let bytes_read = stream.read(&mut buffer).unwrap();
    let request = String::from_utf8_lossy(&buffer[..bytes_read]);

    // Split the request into lines
    let request_line = request.lines().next().unwrap_or("");

    // Split the request line into parts
    let parts: Vec<&str> = request_line.split_whitespace().collect();

    if parts.len() >= 3 {
        let method = parts[0];
        let path = parts[1];
        let version = parts[2];
        println!("{method} {path} {version}");
    } else {
        println!("Malformed request: {request_line}");
    }
}

fn main() {
    let listener = TcpListener::bind("127.0.0.1:7878").unwrap();
    println!("Listening on port 7878");

    for stream in listener.incoming() {
        let stream = stream.unwrap();
        handle_connection(stream);
    }
}
```

Lots of new concepts — let's go through each:

- **`fn handle_connection(mut stream: TcpStream)`** — a function that takes a `TcpStream` by value. The `mut` before `stream` means we can mutate it inside the function (needed for `.read()`). Notice: we're *moving* the stream into this function — the caller gives up ownership. After calling `handle_connection(stream)`, the `for` loop can't use `stream` anymore. This is Rust's *ownership* system:
  - In Python: `handle_connection(stream)` passes a reference — both the caller and function can use it.
  - In Rust: `handle_connection(stream)` *moves* the value — only the function owns it now.
  - This prevents data races and use-after-free bugs at compile time.

- **`request.lines()`** — returns an iterator over the lines of the string. Like Python's `request.splitlines()`.

- **`.next()`** — gets the first item from the iterator. Returns an `Option<&str>`:
  - `Some("GET / HTTP/1.1")` — there was a line
  - `None` — the string was empty

- **`.unwrap_or("")`** — like `.unwrap()`, but instead of crashing on `None`, it returns the default value `""`. Safer than `.unwrap()`.

- **`let parts: Vec<&str> = request_line.split_whitespace().collect();`** — this line does a lot:
  - `split_whitespace()` — splits the string by whitespace, returns an iterator. Like Python's `request_line.split()`.
  - `.collect()` — consumes the iterator and collects results into a collection. But what collection? Rust needs to know, so we annotate the type: `Vec<&str>`.
  - **`Vec<&str>`** — a vector (dynamic array, like Python's `list` or JS's `Array`) of string slices.
  - **`&str`** — a *string slice* — a reference to a portion of a string. It doesn't own the data, it just points to it. Think of it as a "view" into the original string. This is different from `String`, which owns its data (like Python's `str`). We'll explore this distinction more in Stage 8.

- **`parts[0]`, `parts[1]`, `parts[2]`** — indexing into the vector. Like any language. If the index is out of bounds, Rust panics (crashes) — unlike C, which would silently read garbage memory.

- **`if parts.len() >= 3 { ... } else { ... }`** — an if/else expression. No parentheses around the condition (unlike JS/C), but curly braces are required (unlike Python).

### 3.3 — Test it

```bash
cargo run
```

```bash
# Terminal 2 — try different requests:
curl http://localhost:7878
curl http://localhost:7878/hello
curl http://localhost:7878/api/users
curl -X POST http://localhost:7878/submit
```

Server output:

```
Listening on port 7878
GET / HTTP/1.1
GET /hello HTTP/1.1
GET /api/users HTTP/1.1
POST /submit HTTP/1.1
```

You're parsing HTTP. Every web framework does exactly this — Express's `app.get('/hello', handler)` is matching against the method and path you just extracted.

### 3.4 — Common mistakes at this stage

**Trying to use `stream` after moving it:**
```rust
for stream in listener.incoming() {
    let stream = stream.unwrap();
    handle_connection(stream);
    println!("{}", stream.peer_addr().unwrap()); // ← error!
}
```
```
error[E0382]: borrow of moved value: `stream`
  --> src/main.rs:25:20
   |
23 |         let stream = stream.unwrap();
   |             ------ move occurs because `stream` has type `TcpStream`
24 |         handle_connection(stream);
   |                           ------ value moved here
25 |         println!("{}", stream.peer_addr().unwrap());
   |                        ^^^^^^ value borrowed here after move
```
Once you pass `stream` to `handle_connection`, it's gone. The function *owns* it now. If you need to use the peer address in `main`, extract it *before* the move:
```rust
let stream = stream.unwrap();
let addr = stream.peer_addr().unwrap();
handle_connection(stream);
println!("{addr}");
```

**Type annotation confusion with `collect()`:**
```rust
let parts = request_line.split_whitespace().collect(); // ← error!
```
```
error[E0282]: type annotations needed
```
`collect()` can produce many different collection types (`Vec`, `HashSet`, `String`, etc.), so Rust needs you to specify which one. Either annotate the variable or use turbofish syntax:
```rust
let parts: Vec<&str> = request_line.split_whitespace().collect();
// or:
let parts = request_line.split_whitespace().collect::<Vec<&str>>();
```

### Stage 3 checkpoint

Your `src/main.rs`:

```rust
use std::io::Read;
use std::net::{TcpListener, TcpStream};

fn handle_connection(mut stream: TcpStream) {
    let mut buffer = [0u8; 1024];
    let bytes_read = stream.read(&mut buffer).unwrap();
    let request = String::from_utf8_lossy(&buffer[..bytes_read]);

    let request_line = request.lines().next().unwrap_or("");
    let parts: Vec<&str> = request_line.split_whitespace().collect();

    if parts.len() >= 3 {
        let method = parts[0];
        let path = parts[1];
        let version = parts[2];
        println!("{method} {path} {version}");
    } else {
        println!("Malformed request: {request_line}");
    }
}

fn main() {
    let listener = TcpListener::bind("127.0.0.1:7878").unwrap();
    println!("Listening on port 7878");

    for stream in listener.incoming() {
        let stream = stream.unwrap();
        handle_connection(stream);
    }
}
```

**Test it:**
```bash
cargo run
# In another terminal:
curl http://localhost:7878/hello
# Server prints: GET /hello HTTP/1.1
```

---

## Stage 4 — Your First Response

*Difficulty: Easy*

We can read requests. Now let's send something back. Time to learn the HTTP response format.

### 4.1 — Anatomy of an HTTP response

An HTTP response looks like this:

```
HTTP/1.1 200 OK\r\n
Content-Type: text/html\r\n
Content-Length: 13\r\n
\r\n
Hello, world!
```

The structure mirrors the request:

1. **Status line**: `VERSION STATUS_CODE REASON_PHRASE` — e.g., `HTTP/1.1 200 OK`
2. **Headers**: `Key: Value` pairs
3. **Empty line**: `\r\n` — separates headers from body
4. **Body**: the actual content (HTML, JSON, an image, whatever)

Key headers:
- **`Content-Type`** — tells the client what kind of data the body contains. `text/html` for HTML, `application/json` for JSON, `text/plain` for plain text. Without this, the browser guesses (and often guesses wrong).
- **`Content-Length`** — the size of the body in bytes. The client uses this to know when it's received the complete response.

> **AWS connection**: When CloudFront caches a response, it stores these headers along with the body. The `Content-Type` header determines how the browser renders the response. If your Lambda function returns JSON but forgets to set `Content-Type: application/json`, the browser might try to render it as HTML — a common bug in API Gateway setups.

### 4.2 — Writing a response

Update `handle_connection` in `src/main.rs`:

```rust
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};

fn handle_connection(mut stream: TcpStream) {
    let mut buffer = [0u8; 1024];
    let bytes_read = stream.read(&mut buffer).unwrap();
    let request = String::from_utf8_lossy(&buffer[..bytes_read]);

    let request_line = request.lines().next().unwrap_or("");
    let parts: Vec<&str> = request_line.split_whitespace().collect();

    if parts.len() >= 3 {
        println!("{} {} {}", parts[0], parts[1], parts[2]);
    }

    // Build the response
    let body = "<html><body><h1>Hello from Forja!</h1></body></html>";
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\n\r\n{}",
        body.len(),
        body
    );

    stream.write_all(response.as_bytes()).unwrap();
}

fn main() {
    let listener = TcpListener::bind("127.0.0.1:7878").unwrap();
    println!("Listening on port 7878");

    for stream in listener.incoming() {
        let stream = stream.unwrap();
        handle_connection(stream);
    }
}
```

New concepts:

- **`use std::io::{Read, Write};`** — imports multiple items from the same module. Like Python's `from io import Read, Write`. We need the `Write` trait for `.write_all()`.

- **`format!(...)`** — like `println!` but returns a `String` instead of printing. Like Python's f-string or JS template literal, but as a macro. The result is a heap-allocated `String` (owned data), not a `&str` (borrowed slice).

- **`\r\n`** — CRLF line endings. HTTP requires these — `\n` alone won't work. This is a common gotcha when building HTTP by hand.

- **`body.len()`** — returns the byte length of the string. For ASCII text, this equals the character count. For UTF-8 with multi-byte characters (emoji, CJK), byte length ≠ character count. `Content-Length` must be in bytes.

- **`stream.write_all(response.as_bytes()).unwrap()`** — writes the entire response to the TCP stream.
  - `.as_bytes()` — converts a `&str` to `&[u8]` (a byte slice). TCP streams deal in bytes, not strings.
  - `.write_all()` — writes the entire buffer. The simpler `.write()` might write only *part* of the buffer (it returns how many bytes were written). `write_all` loops internally until everything is sent. Its signature:
    ```rust
    fn write_all(&mut self, buf: &[u8]) -> Result<()>
    ```

### 4.3 — Test it

```bash
cargo run
```

```bash
# Terminal 2:
curl -v http://localhost:7878
```

The `-v` flag makes curl show the full HTTP conversation:

```
> GET / HTTP/1.1
> Host: localhost:7878
> User-Agent: curl/8.7.1
> Accept: */*
>
< HTTP/1.1 200 OK
< Content-Type: text/html
< Content-Length: 52
<
<html><body><h1>Hello from Forja!</h1></body></html>
```

Lines starting with `>` are what curl sent. Lines starting with `<` are what your server sent back. You just completed a full HTTP request-response cycle.

Now open `http://localhost:7878` in your browser — you'll see **Hello from Forja!** rendered as an actual HTML page. The browser parsed your HTTP response, extracted the HTML body, and rendered it. That's the entire web in a nutshell.

### 4.4 — Try different paths

Let's make the response depend on the path:

```rust
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};

fn handle_connection(mut stream: TcpStream) {
    let mut buffer = [0u8; 1024];
    let bytes_read = stream.read(&mut buffer).unwrap();
    let request = String::from_utf8_lossy(&buffer[..bytes_read]);

    let request_line = request.lines().next().unwrap_or("");
    let parts: Vec<&str> = request_line.split_whitespace().collect();

    let (method, path) = if parts.len() >= 3 {
        (parts[0], parts[1])
    } else {
        ("GET", "/")
    };

    println!("{method} {path}");

    let body = match path {
        "/" => "<html><body><h1>Welcome to Forja!</h1></body></html>".to_string(),
        "/about" => "<html><body><h1>About Forja</h1><p>A Rust HTTP server.</p></body></html>".to_string(),
        _ => format!("<html><body><h1>You requested: {path}</h1></body></html>"),
    };

    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\n\r\n{}",
        body.len(),
        body
    );

    stream.write_all(response.as_bytes()).unwrap();
}

fn main() {
    let listener = TcpListener::bind("127.0.0.1:7878").unwrap();
    println!("Listening on port 7878");

    for stream in listener.incoming() {
        let stream = stream.unwrap();
        handle_connection(stream);
    }
}
```

New concepts:

- **`let (method, path) = ...`** — *destructuring*. Like Python's `method, path = ...` or JS's `const [method, path] = ...`. The `if/else` returns a tuple `(parts[0], parts[1])`, and we unpack it into two variables.

- **`match path { ... }`** — pattern matching. This is Rust's superpower — like a `switch` statement on steroids. Each arm is `pattern => expression`. The `_` is a wildcard that matches anything (like `default` in a switch).

- **`.to_string()`** — converts a `&str` (borrowed string slice) to a `String` (owned string). We need this because `format!()` returns a `String`, and all arms of a `match` must return the same type. The string literals are `&str`, so we convert them.

> **AWS connection**: This path-based routing is exactly what API Gateway does. When you define routes like `GET /users` and `POST /orders`, API Gateway matches the incoming request's method and path against your route definitions. You just built a tiny version of that.

### 4.5 — Test it

```bash
cargo run
```

```bash
curl http://localhost:7878/
curl http://localhost:7878/about
curl http://localhost:7878/anything-else
```

```html
<html><body><h1>Welcome to Forja!</h1></body></html>
<html><body><h1>About Forja</h1><p>A Rust HTTP server.</p></body></html>
<html><body><h1>You requested: /anything-else</h1></body></html>
```

Open each URL in your browser to see them rendered.

### Stage 4 checkpoint

Your `src/main.rs`:

```rust
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};

fn handle_connection(mut stream: TcpStream) {
    let mut buffer = [0u8; 1024];
    let bytes_read = stream.read(&mut buffer).unwrap();
    let request = String::from_utf8_lossy(&buffer[..bytes_read]);

    let request_line = request.lines().next().unwrap_or("");
    let parts: Vec<&str> = request_line.split_whitespace().collect();

    let (method, path) = if parts.len() >= 3 {
        (parts[0], parts[1])
    } else {
        ("GET", "/")
    };

    println!("{method} {path}");

    let body = match path {
        "/" => "<html><body><h1>Welcome to Forja!</h1></body></html>".to_string(),
        "/about" => "<html><body><h1>About Forja</h1><p>A Rust HTTP server.</p></body></html>".to_string(),
        _ => format!("<html><body><h1>You requested: {path}</h1></body></html>"),
    };

    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\n\r\n{}",
        body.len(),
        body
    );

    stream.write_all(response.as_bytes()).unwrap();
}

fn main() {
    let listener = TcpListener::bind("127.0.0.1:7878").unwrap();
    println!("Listening on port 7878");

    for stream in listener.incoming() {
        let stream = stream.unwrap();
        handle_connection(stream);
    }
}
```

**Test it:**
```bash
cargo run
# In another terminal:
curl -v http://localhost:7878/about
# Should see full HTTP response with 200 OK and HTML body
```

---

## Stage 5 — The Headers

*Difficulty: Medium*

We've been ignoring the request headers. Time to parse them — they contain critical information like the hostname, content type, and authentication tokens.

### 5.1 — Why headers matter

Look at a typical browser request:

```
GET /api/data HTTP/1.1
Host: localhost:7878
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)
Accept: text/html,application/xhtml+xml,application/xml;q=0.9
Accept-Language: en-US,en;q=0.5
Accept-Encoding: gzip, deflate, br
Connection: keep-alive
Cookie: session=abc123
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
```

Key headers:
- **`Host`** — which domain the request is for. A single server can host multiple domains (virtual hosting). This is how CloudFront knows which distribution to route to.
- **`User-Agent`** — identifies the client. Browsers, curl, bots all send different values.
- **`Content-Length`** — for POST/PUT requests, tells the server how many bytes of body to expect.
- **`Content-Type`** — for POST/PUT, what format the body is in (`application/json`, `application/x-www-form-urlencoded`, etc.).
- **`Authorization`** — authentication credentials. `Bearer <token>` is the most common pattern (JWTs).
- **`Accept`** — what response formats the client can handle.

> **AWS connection**: ALBs use the `Host` header for host-based routing rules. CloudFront forwards (or strips) specific headers based on your cache policy. API Gateway reads `Authorization` to invoke your Lambda authorizer. WAF inspects headers for malicious patterns. Headers are the control plane of HTTP.

### 5.2 — Parsing headers into a HashMap

Update `src/main.rs`:

```rust
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};

fn handle_connection(mut stream: TcpStream) {
    let mut buffer = [0u8; 1024];
    let bytes_read = stream.read(&mut buffer).unwrap();
    let request_str = String::from_utf8_lossy(&buffer[..bytes_read]).to_string();

    let mut lines = request_str.lines();

    // Parse request line
    let request_line = lines.next().unwrap_or("");
    let parts: Vec<&str> = request_line.split_whitespace().collect();
    let (method, path) = if parts.len() >= 3 {
        (parts[0], parts[1])
    } else {
        ("GET", "/")
    };

    // Parse headers
    let mut headers: HashMap<String, String> = HashMap::new();
    for line in lines {
        if line.is_empty() {
            break; // Empty line = end of headers
        }
        if let Some((key, value)) = line.split_once(':') {
            headers.insert(
                key.trim().to_lowercase(),
                value.trim().to_string(),
            );
        }
    }

    println!("{method} {path}");
    println!("Headers: {headers:#?}");

    let body = match path {
        "/" => "<html><body><h1>Welcome to Forja!</h1></body></html>".to_string(),
        "/about" => "<html><body><h1>About Forja</h1><p>A Rust HTTP server.</p></body></html>".to_string(),
        "/headers" => {
            let mut html = String::from("<html><body><h1>Your Headers</h1><table border='1'>");
            for (key, value) in &headers {
                html.push_str(&format!("<tr><td><b>{key}</b></td><td>{value}</td></tr>"));
            }
            html.push_str("</table></body></html>");
            html
        }
        _ => format!("<html><body><h1>You requested: {path}</h1></body></html>"),
    };

    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\n\r\n{}",
        body.len(),
        body
    );

    stream.write_all(response.as_bytes()).unwrap();
}

fn main() {
    let listener = TcpListener::bind("127.0.0.1:7878").unwrap();
    println!("Listening on port 7878");

    for stream in listener.incoming() {
        let stream = stream.unwrap();
        handle_connection(stream);
    }
}
```

New concepts:

- **`use std::collections::HashMap;`** — imports Rust's hash map. Like Python's `dict` or JS's `Map`. Unlike Python, it's not a built-in — you import it from the standard library.

- **`HashMap<String, String>`** — a map from owned strings to owned strings. We use `String` (owned) instead of `&str` (borrowed) because the header data needs to outlive the parsing loop. If we used `&str`, the references would point into `request_str`, and Rust would need to verify they don't outlive it — which gets complicated. Owned `String`s are simpler here.

- **`.to_string()`** on `request_str` — we convert the `Cow<str>` returned by `from_utf8_lossy` into an owned `String`. This is important: `lines()` returns `&str` slices that borrow from the original string. By owning the string, we ensure the borrows are valid.

- **`let mut lines = request_str.lines();`** — creates a mutable iterator. We call `.next()` to consume the first line (the request line), then iterate the rest in the `for` loop. The iterator remembers its position.

- **`if let Some((key, value)) = line.split_once(':') { ... }`** — this combines two concepts:
  - `split_once(':')` — splits the string at the first `:`, returning `Option<(&str, &str)>`. Like Python's `line.split(':', 1)`, but returns an `Option` instead of a list.
  - `if let` — pattern matching in an `if` statement. If `split_once` returns `Some((key, value))`, we enter the block with `key` and `value` bound. If it returns `None` (no `:` found), we skip the line. This is more concise than a full `match`.

- **`key.trim().to_lowercase()`** — HTTP headers are case-insensitive (`Content-Type` = `content-type`). We normalize to lowercase for consistent lookups.

- **`{headers:#?}`** — the `#?` format specifier uses "pretty debug" formatting — it prints the HashMap with nice indentation. `?` is compact debug, `#?` is pretty debug.

- **`for (key, value) in &headers`** — iterates over the HashMap by reference (`&`). Without the `&`, the loop would *consume* (move) the HashMap, and we couldn't use it afterward.

- **`String::from(...)`** and **`.push_str(...)`** — `String::from` creates a new owned string. `.push_str()` appends a `&str` to a `String`. This is how you build strings incrementally in Rust — there's no `+=` for strings (well, there is, but `push_str` is more explicit).

### 5.3 — Test it

```bash
cargo run
```

```bash
# See your headers reflected back:
curl http://localhost:7878/headers

# Send custom headers:
curl -H "X-Custom: hello" -H "Authorization: Bearer mytoken" http://localhost:7878/headers
```

Open `http://localhost:7878/headers` in your browser — you'll see a table of all the headers your browser sends. It's a lot more than curl sends.

Server terminal output:

```
GET /headers
Headers: {
    "host": "localhost:7878",
    "user-agent": "curl/8.7.1",
    "accept": "*/*",
    "x-custom": "hello",
    "authorization": "Bearer mytoken",
}
```

### 5.4 — Common mistakes at this stage

**Lifetime issues with borrowed headers:**
If you tried to use `&str` instead of `String` in the HashMap:
```rust
let mut headers: HashMap<&str, &str> = HashMap::new();
```
This might work in simple cases, but gets tricky when you try to return headers from a function or store them in a struct. The `&str` values borrow from `request_str`, so they can't outlive it. Using owned `String`s avoids this entirely — it's a common Rust pattern to "own your data" at boundaries.

**Forgetting `to_string()` on the Cow:**
```rust
let request_str = String::from_utf8_lossy(&buffer[..bytes_read]);
let mut lines = request_str.lines();
```
`from_utf8_lossy` returns a `Cow<str>` (Copy-on-Write) — a type that's *either* a borrowed `&str` or an owned `String`. If you don't call `.to_string()`, the borrow checker might complain when you try to use `lines` after `request_str` is dropped. Converting to `String` makes ownership clear.

### Stage 5 checkpoint

Your `src/main.rs`:

```rust
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};

fn handle_connection(mut stream: TcpStream) {
    let mut buffer = [0u8; 1024];
    let bytes_read = stream.read(&mut buffer).unwrap();
    let request_str = String::from_utf8_lossy(&buffer[..bytes_read]).to_string();

    let mut lines = request_str.lines();

    let request_line = lines.next().unwrap_or("");
    let parts: Vec<&str> = request_line.split_whitespace().collect();
    let (method, path) = if parts.len() >= 3 {
        (parts[0], parts[1])
    } else {
        ("GET", "/")
    };

    let mut headers: HashMap<String, String> = HashMap::new();
    for line in lines {
        if line.is_empty() {
            break;
        }
        if let Some((key, value)) = line.split_once(':') {
            headers.insert(
                key.trim().to_lowercase(),
                value.trim().to_string(),
            );
        }
    }

    println!("{method} {path}");
    println!("Headers: {headers:#?}");

    let body = match path {
        "/" => "<html><body><h1>Welcome to Forja!</h1></body></html>".to_string(),
        "/about" => "<html><body><h1>About Forja</h1><p>A Rust HTTP server.</p></body></html>".to_string(),
        "/headers" => {
            let mut html = String::from("<html><body><h1>Your Headers</h1><table border='1'>");
            for (key, value) in &headers {
                html.push_str(&format!("<tr><td><b>{key}</b></td><td>{value}</td></tr>"));
            }
            html.push_str("</table></body></html>");
            html
        }
        _ => format!("<html><body><h1>You requested: {path}</h1></body></html>"),
    };

    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\n\r\n{}",
        body.len(),
        body
    );

    stream.write_all(response.as_bytes()).unwrap();
}

fn main() {
    let listener = TcpListener::bind("127.0.0.1:7878").unwrap();
    println!("Listening on port 7878");

    for stream in listener.incoming() {
        let stream = stream.unwrap();
        handle_connection(stream);
    }
}
```

**Test it:**
```bash
cargo run
# In another terminal:
curl http://localhost:7878/headers
# Should see an HTML table of headers
```

---

## Stage 6 — Serving Files

*Difficulty: Medium*

Hardcoded HTML strings won't scale. Let's serve actual files from disk — HTML, CSS, JavaScript — like a real web server.

### 6.1 — Create some files to serve

First, create a `public/` directory in your project:

```bash
cd ~/juk/forja/forja
mkdir -p public
```

Create `public/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Forja</title>
    <link rel="stylesheet" href="/style.css">
</head>
<body>
    <h1>Welcome to Forja</h1>
    <p>This page was served by a Rust HTTP server you built from scratch.</p>
    <p>Current path: <code>/</code></p>
    <script src="/app.js"></script>
</body>
</html>
```

Create `public/style.css`:

```css
body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    max-width: 800px;
    margin: 40px auto;
    padding: 0 20px;
    background: #1a1a2e;
    color: #e0e0e0;
}
h1 { color: #e94560; }
code { background: #16213e; padding: 2px 6px; border-radius: 3px; }
```

Create `public/app.js`:

```javascript
console.log("Forja JS loaded!");
document.querySelector("h1").addEventListener("click", () => {
    document.querySelector("h1").style.color = "#0f3460";
});
```

### 6.2 — Serving files from disk

Now update `src/main.rs` to serve these files:

```rust
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::Path;

fn get_content_type(path: &str) -> &str {
    match Path::new(path).extension().and_then(|e| e.to_str()) {
        Some("html") => "text/html",
        Some("css") => "text/css",
        Some("js") => "application/javascript",
        Some("json") => "application/json",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("svg") => "image/svg+xml",
        Some("ico") => "image/x-icon",
        _ => "application/octet-stream",
    }
}

fn handle_connection(mut stream: TcpStream) {
    let mut buffer = [0u8; 1024];
    let bytes_read = stream.read(&mut buffer).unwrap();
    let request_str = String::from_utf8_lossy(&buffer[..bytes_read]).to_string();

    let mut lines = request_str.lines();

    let request_line = lines.next().unwrap_or("");
    let parts: Vec<&str> = request_line.split_whitespace().collect();
    let (method, path) = if parts.len() >= 3 {
        (parts[0], parts[1])
    } else {
        ("GET", "/")
    };

    // Parse headers (we'll use them later)
    let mut headers: HashMap<String, String> = HashMap::new();
    for line in lines {
        if line.is_empty() {
            break;
        }
        if let Some((key, value)) = line.split_once(':') {
            headers.insert(key.trim().to_lowercase(), value.trim().to_string());
        }
    }

    println!("{method} {path}");

    // Map URL path to file path
    let file_path = if path == "/" {
        "public/index.html".to_string()
    } else {
        format!("public{path}")
    };

    // Try to read the file
    match fs::read(&file_path) {
        Ok(contents) => {
            let content_type = get_content_type(&file_path);
            let response_header = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\n\r\n",
                contents.len()
            );
            stream.write_all(response_header.as_bytes()).unwrap();
            stream.write_all(&contents).unwrap();
        }
        Err(_) => {
            let body = "<html><body><h1>404 Not Found</h1></body></html>";
            let response = format!(
                "HTTP/1.1 404 Not Found\r\nContent-Type: text/html\r\nContent-Length: {}\r\n\r\n{body}",
                body.len()
            );
            stream.write_all(response.as_bytes()).unwrap();
        }
    }
}

fn main() {
    let listener = TcpListener::bind("127.0.0.1:7878").unwrap();
    println!("Listening on port 7878");
    println!("Serving files from ./public/");

    for stream in listener.incoming() {
        let stream = stream.unwrap();
        handle_connection(stream);
    }
}
```

New concepts:

- **`use std::fs;`** — the filesystem module. Like Python's `os` and `pathlib`, or Node's `fs`.

- **`use std::path::Path;`** — a type for working with file paths. Cross-platform — handles `/` on Unix and `\` on Windows.

- **`fn get_content_type(path: &str) -> &str`** — a function that takes a string slice reference and returns a string slice reference. The `-> &str` is the return type. In Python, you'd just return a string. In Rust, `&str` means "I'm returning a reference to a string that already exists" — in this case, the string literals are baked into the binary and live forever (they have `'static` lifetime).

- **`Path::new(path).extension().and_then(|e| e.to_str())`** — a chain of operations:
  - `Path::new(path)` — wraps the string in a `Path` type
  - `.extension()` — returns `Option<&OsStr>` — the file extension, or `None` if there isn't one
  - `.and_then(|e| e.to_str())` — if there's an extension, try to convert it to a `&str`. `and_then` is like `.flatMap()` in JS — it chains `Option` operations. The `|e|` is a *closure* (anonymous function), like Python's `lambda e:` or JS's `(e) =>`.

- **`Some("html") => ...`** — pattern matching on `Option`. `Some("html")` matches when the extension is present and equals `"html"`. The `|` in `Some("jpg") | Some("jpeg")` means "or" — match either pattern.

- **`fs::read(&file_path)`** — reads the entire file into a `Vec<u8>` (a vector of bytes). Returns `Result<Vec<u8>>`. Unlike `fs::read_to_string`, this works for binary files too (images, etc.). In Python, this is `open(path, 'rb').read()`.

- **`match fs::read(&file_path) { Ok(contents) => ..., Err(_) => ... }`** — we match on the `Result`. If the file exists, we serve it. If not (file not found, permission denied, etc.), we return a 404. The `_` in `Err(_)` means "I don't care about the specific error."

- **Two separate `write_all` calls** — we write the headers first (as a string), then the body (as raw bytes). This is important for binary files — we can't use `format!` to combine headers and a binary body, because `format!` works with strings, not arbitrary bytes.

### 6.3 — Security note: path traversal

Our current code has a security vulnerability. What if someone requests:

```
GET /../../../etc/passwd HTTP/1.1
```

The path `public/../../../etc/passwd` would resolve to `/etc/passwd` — the server would serve any file on the system! This is called a **path traversal attack**.

We'll fix this properly in Stage 7, but be aware: this is one of the most common web server vulnerabilities. Every production web server (nginx, Apache, S3 static hosting) has protections against this.

> **AWS connection**: S3 static website hosting handles this automatically — you can't traverse out of the bucket. CloudFront + S3 Origin Access Control adds another layer. When you build your own server, you're responsible for these protections.

### 6.4 — Test it

```bash
cargo run
```

```bash
# Serve the HTML page:
curl http://localhost:7878/

# Serve the CSS:
curl http://localhost:7878/style.css

# Serve the JS:
curl http://localhost:7878/app.js

# Check content types:
curl -v http://localhost:7878/style.css 2>&1 | grep Content-Type
# Content-Type: text/css

# Try a missing file:
curl -v http://localhost:7878/nope.html 2>&1 | grep "< HTTP"
# < HTTP/1.1 404 Not Found
```

Open `http://localhost:7878` in your browser — you should see a styled page with dark background, red heading, and the JavaScript loaded (check the browser console for "Forja JS loaded!"). Click the heading to see it change color.

The browser makes three requests: one for the HTML, one for the CSS (from the `<link>` tag), and one for the JS (from the `<script>` tag). Your server handles all three. Check the server terminal — you'll see:

```
GET /
GET /style.css
GET /app.js
```

This is how every static file server works — nginx, Apache, S3 static hosting, CloudFront. They map URL paths to files on disk and set the `Content-Type` header based on the file extension.

### Stage 6 checkpoint

Your `src/main.rs`:

```rust
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::Path;

fn get_content_type(path: &str) -> &str {
    match Path::new(path).extension().and_then(|e| e.to_str()) {
        Some("html") => "text/html",
        Some("css") => "text/css",
        Some("js") => "application/javascript",
        Some("json") => "application/json",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("svg") => "image/svg+xml",
        Some("ico") => "image/x-icon",
        _ => "application/octet-stream",
    }
}

fn handle_connection(mut stream: TcpStream) {
    let mut buffer = [0u8; 1024];
    let bytes_read = stream.read(&mut buffer).unwrap();
    let request_str = String::from_utf8_lossy(&buffer[..bytes_read]).to_string();

    let mut lines = request_str.lines();

    let request_line = lines.next().unwrap_or("");
    let parts: Vec<&str> = request_line.split_whitespace().collect();
    let (method, path) = if parts.len() >= 3 {
        (parts[0], parts[1])
    } else {
        ("GET", "/")
    };

    let mut headers: HashMap<String, String> = HashMap::new();
    for line in lines {
        if line.is_empty() {
            break;
        }
        if let Some((key, value)) = line.split_once(':') {
            headers.insert(key.trim().to_lowercase(), value.trim().to_string());
        }
    }

    println!("{method} {path}");

    let file_path = if path == "/" {
        "public/index.html".to_string()
    } else {
        format!("public{path}")
    };

    match fs::read(&file_path) {
        Ok(contents) => {
            let content_type = get_content_type(&file_path);
            let response_header = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\n\r\n",
                contents.len()
            );
            stream.write_all(response_header.as_bytes()).unwrap();
            stream.write_all(&contents).unwrap();
        }
        Err(_) => {
            let body = "<html><body><h1>404 Not Found</h1></body></html>";
            let response = format!(
                "HTTP/1.1 404 Not Found\r\nContent-Type: text/html\r\nContent-Length: {}\r\n\r\n{body}",
                body.len()
            );
            stream.write_all(response.as_bytes()).unwrap();
        }
    }
}

fn main() {
    let listener = TcpListener::bind("127.0.0.1:7878").unwrap();
    println!("Listening on port 7878");
    println!("Serving files from ./public/");

    for stream in listener.incoming() {
        let stream = stream.unwrap();
        handle_connection(stream);
    }
}
```

Your `public/` directory should contain `index.html`, `style.css`, and `app.js`.

**Test it:**
```bash
cargo run
# Open http://localhost:7878 in your browser
# You should see a styled page with working CSS and JS
```

---

## Stage 7 — 404 Not Found

*Difficulty: Easy*

We have a basic 404, but a real server needs proper error handling — different status codes, path traversal protection, and user-friendly error pages.

### 7.1 — HTTP status codes

Status codes are three-digit numbers grouped by category:

| Range | Category | Examples |
|-------|----------|----------|
| 1xx | Informational | 100 Continue |
| 2xx | Success | 200 OK, 201 Created, 204 No Content |
| 3xx | Redirection | 301 Moved Permanently, 304 Not Modified |
| 4xx | Client Error | 400 Bad Request, 403 Forbidden, 404 Not Found |
| 5xx | Server Error | 500 Internal Server Error, 502 Bad Gateway, 503 Service Unavailable |

> **AWS connection**: You see these everywhere in AWS:
> - **502 Bad Gateway** — your ALB got a bad response from the backend (Lambda timeout, ECS container crash). This is the most common ALB error.
> - **503 Service Unavailable** — no healthy targets in the target group.
> - **504 Gateway Timeout** — the backend didn't respond in time (ALB default: 60s).
> - **403 Forbidden** — S3 bucket policy denies access, or WAF blocked the request.
> - **304 Not Modified** — CloudFront cache hit, no need to re-download.

### 7.2 — Path traversal protection

Let's fix the security vulnerability from Stage 6 and add proper error handling. Update `src/main.rs`:

```rust
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};

fn get_content_type(path: &str) -> &str {
    match Path::new(path).extension().and_then(|e| e.to_str()) {
        Some("html") => "text/html",
        Some("css") => "text/css",
        Some("js") => "application/javascript",
        Some("json") => "application/json",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("svg") => "image/svg+xml",
        Some("ico") => "image/x-icon",
        _ => "application/octet-stream",
    }
}

fn send_response(stream: &mut TcpStream, status: u16, reason: &str, content_type: &str, body: &[u8]) {
    let header = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\n\r\n",
        body.len()
    );
    stream.write_all(header.as_bytes()).unwrap();
    stream.write_all(body).unwrap();
}

fn error_page(status: u16, reason: &str, message: &str) -> String {
    format!(
        "<!DOCTYPE html>\
        <html><head><title>{status} {reason}</title>\
        <style>\
        body {{ font-family: sans-serif; max-width: 600px; margin: 80px auto; text-align: center; color: #ccc; background: #1a1a2e; }}\
        h1 {{ font-size: 72px; margin: 0; color: #e94560; }}\
        p {{ color: #888; }}\
        </style></head>\
        <body><h1>{status}</h1><h2>{reason}</h2><p>{message}</p></body></html>"
    )
}

fn safe_path(requested: &str) -> Option<PathBuf> {
    // Resolve the requested path relative to public/
    let base = Path::new("public").canonicalize().ok()?;
    let file_path = if requested == "/" {
        base.join("index.html")
    } else {
        // Strip leading slash and join with base
        base.join(requested.trim_start_matches('/'))
    };

    // Canonicalize resolves .., symlinks, etc.
    let resolved = file_path.canonicalize().ok()?;

    // Ensure the resolved path is still inside public/
    if resolved.starts_with(&base) {
        Some(resolved)
    } else {
        None // Path traversal attempt!
    }
}

fn handle_connection(mut stream: TcpStream) {
    let mut buffer = [0u8; 1024];
    let bytes_read = match stream.read(&mut buffer) {
        Ok(0) => return, // Client disconnected
        Ok(n) => n,
        Err(_) => return, // Read error
    };

    let request_str = String::from_utf8_lossy(&buffer[..bytes_read]).to_string();
    let mut lines = request_str.lines();

    let request_line = lines.next().unwrap_or("");
    let parts: Vec<&str> = request_line.split_whitespace().collect();

    if parts.len() < 3 {
        let body = error_page(400, "Bad Request", "The request could not be understood.");
        send_response(&mut stream, 400, "Bad Request", "text/html", body.as_bytes());
        return;
    }

    let method = parts[0];
    let path = parts[1];
    let _version = parts[2];

    // Parse headers
    let mut headers: HashMap<String, String> = HashMap::new();
    for line in lines {
        if line.is_empty() {
            break;
        }
        if let Some((key, value)) = line.split_once(':') {
            headers.insert(key.trim().to_lowercase(), value.trim().to_string());
        }
    }

    println!("{method} {path} -> {}", headers.get("user-agent").map(|s| s.as_str()).unwrap_or("-"));

    // Only support GET for now
    if method != "GET" {
        let body = error_page(405, "Method Not Allowed", &format!("{method} is not supported."));
        send_response(&mut stream, 405, "Method Not Allowed", "text/html", body.as_bytes());
        return;
    }

    // Resolve and validate the file path
    match safe_path(path) {
        Some(file_path) => {
            match fs::read(&file_path) {
                Ok(contents) => {
                    let content_type = get_content_type(&file_path.to_string_lossy());
                    send_response(&mut stream, 200, "OK", content_type, &contents);
                }
                Err(_) => {
                    let body = error_page(500, "Internal Server Error", "Something went wrong reading the file.");
                    send_response(&mut stream, 500, "Internal Server Error", "text/html", body.as_bytes());
                }
            }
        }
        None => {
            let body = error_page(404, "Not Found", &format!("The path {path} was not found on this server."));
            send_response(&mut stream, 404, "Not Found", "text/html", body.as_bytes());
        }
    }
}

fn main() {
    let listener = TcpListener::bind("127.0.0.1:7878").unwrap();
    println!("Listening on port 7878");
    println!("Serving files from ./public/");

    for stream in listener.incoming() {
        let stream = stream.unwrap();
        handle_connection(stream);
    }
}
```

New concepts:

- **`fn send_response(stream: &mut TcpStream, ...)`** — takes a *mutable reference* to the stream (`&mut TcpStream`), not ownership. This means the caller keeps the stream — we're just borrowing it to write. Compare:
  - `stream: TcpStream` — takes ownership (caller loses it)
  - `stream: &TcpStream` — borrows read-only
  - `stream: &mut TcpStream` — borrows with write access

- **`body: &[u8]`** — a byte slice. This is a reference to a contiguous sequence of bytes — it could point into a `Vec<u8>`, a `String`, or a static byte array. It's the most flexible way to accept "some bytes."

- **`PathBuf`** — the owned version of `Path`, like `String` is the owned version of `&str`. `Path` is always borrowed (`&Path`), `PathBuf` is owned and can be returned from functions.

- **`canonicalize()`** — resolves a path to its absolute form, following symlinks and resolving `..`. Returns `Result<PathBuf>`. This is the key to preventing path traversal — after canonicalization, `public/../../../etc/passwd` becomes `/etc/passwd`, and we can check that it doesn't start with our `public/` directory.

- **`.ok()?`** — converts a `Result` to an `Option` (discarding the error) and then `?` propagates `None` early. The `?` operator is Rust's way of saying "if this is `None`/`Err`, return early from the function." It's like Python's early return pattern but built into the language.

- **`Option<PathBuf>`** as return type — the function returns `Some(path)` if the path is safe, or `None` if it's a traversal attempt or the file doesn't exist.

- **`match stream.read(&mut buffer) { Ok(0) => return, ... }`** — proper error handling for the read. `Ok(0)` means the client closed the connection without sending data (common with browser prefetch). `Err(_)` means a read error occurred.

- **`let _version = parts[2];`** — the underscore prefix tells Rust "I know I'm not using this variable." Without it, the compiler warns about unused variables.

- **`headers.get("user-agent").map(|s| s.as_str()).unwrap_or("-")`** — a chain:
  - `.get("user-agent")` — returns `Option<&String>`
  - `.map(|s| s.as_str())` — converts `Option<&String>` to `Option<&str>`
  - `.unwrap_or("-")` — returns the value or a default

### 7.3 — Test it

```bash
cargo run
```

```bash
# Normal request — should work:
curl http://localhost:7878/

# Missing file — 404:
curl -v http://localhost:7878/nope.html 2>&1 | grep "< HTTP"
# < HTTP/1.1 404 Not Found

# Path traversal attempt — 404 (blocked!):
curl -v http://localhost:7878/../../../etc/passwd 2>&1 | grep "< HTTP"
# < HTTP/1.1 404 Not Found

# Wrong method — 405:
curl -v -X POST http://localhost:7878/ 2>&1 | grep "< HTTP"
# < HTTP/1.1 405 Method Not Allowed

# Malformed request — 400:
echo "GARBAGE" | nc localhost 7878
```

Open `http://localhost:7878/nonexistent` in your browser — you'll see a styled 404 page instead of a blank error.

### Stage 7 checkpoint

Your `src/main.rs` is the full listing above. Make sure your `public/` directory still has `index.html`, `style.css`, and `app.js` from Stage 6.

**Test it:**
```bash
cargo run
# In another terminal:
curl http://localhost:7878/           # 200 OK
curl http://localhost:7878/nope       # 404 Not Found
curl -X DELETE http://localhost:7878/  # 405 Method Not Allowed
```

---

## Stage 8 — The Request Struct

*Difficulty: Medium*

Our `handle_connection` function is getting long and messy. Time to refactor — we'll create proper `Request` and `Response` types. This is where Rust's ownership system really shows up.

### 8.1 — Why structs?

Right now, the method, path, and headers are loose variables floating around in `handle_connection`. In Python, you'd naturally reach for a class:

```python
class Request:
    def __init__(self, method, path, version, headers):
        self.method = method
        self.path = path
        self.version = version
        self.headers = headers
```

In Express.js, the framework gives you a `req` object. In Rust, we'll use a **struct** — Rust's equivalent of a class (but without inheritance).

### 8.2 — Defining the Request struct

Update `src/main.rs` — we'll rebuild it with proper structure:

```rust
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};

// --- Request ---

struct Request {
    method: String,
    path: String,
    version: String,
    headers: HashMap<String, String>,
}

impl Request {
    fn from_stream(stream: &mut TcpStream) -> Option<Request> {
        let mut buffer = [0u8; 1024];
        let bytes_read = match stream.read(&mut buffer) {
            Ok(0) => return None,
            Ok(n) => n,
            Err(_) => return None,
        };

        let raw = String::from_utf8_lossy(&buffer[..bytes_read]).to_string();
        let mut lines = raw.lines();

        // Parse request line
        let request_line = lines.next()?;
        let parts: Vec<&str> = request_line.split_whitespace().collect();
        if parts.len() < 3 {
            return None;
        }

        // Parse headers
        let mut headers = HashMap::new();
        for line in lines {
            if line.is_empty() {
                break;
            }
            if let Some((key, value)) = line.split_once(':') {
                headers.insert(key.trim().to_lowercase(), value.trim().to_string());
            }
        }

        Some(Request {
            method: parts[0].to_string(),
            path: parts[1].to_string(),
            version: parts[2].to_string(),
            headers,
        })
    }

    fn header(&self, name: &str) -> Option<&str> {
        self.headers.get(name).map(|s| s.as_str())
    }
}
```

Let's break down every new concept:

- **`struct Request { ... }`** — defines a new type with named fields. Like a Python `@dataclass` or a TypeScript `interface`, but the fields are actual memory layout — Rust structs have zero overhead. Each field has a name and a type.

- **All fields are `String` (owned)** — not `&str` (borrowed). This is a deliberate choice. If we used `&str`, the `Request` would need to borrow from the buffer, and we'd need *lifetime annotations* to tell the compiler how long the borrows are valid. Using owned `String`s means the `Request` owns its data and can live as long as we want. This is the "clone at the boundary" pattern — common in Rust when you want simple ownership.

  > If you're curious what the borrowed version looks like:
  > ```rust
  > struct Request<'a> {
  >     method: &'a str,
  >     path: &'a str,
  > }
  > ```
  > That `'a` is a *lifetime parameter* — it says "this struct can't outlive the data it borrows from." We'll explore lifetimes in Act 2. For now, owned data is simpler.

- **`impl Request { ... }`** — an *implementation block*. This is where you define methods on a struct. Like putting methods inside a Python class, but separated from the struct definition. You can have multiple `impl` blocks for the same struct.

- **`fn from_stream(stream: &mut TcpStream) -> Option<Request>`** — an associated function (no `self` parameter) that acts as a constructor. By convention, Rust uses `new()` or `from_*()` for constructors — there's no special `__init__` or `constructor` keyword. It returns `Option<Request>` because parsing might fail.

- **`lines.next()?`** — the `?` operator on `Option`. If `next()` returns `None`, the function immediately returns `None`. If it returns `Some(line)`, we get the `line`. This is like Python's early return pattern but much more concise:
  ```python
  # Python equivalent:
  line = next(lines, None)
  if line is None:
      return None
  ```

- **`Some(Request { method: ..., path: ..., headers })`** — constructs a `Request` and wraps it in `Some`. The `headers` field uses *field init shorthand* — when the variable name matches the field name, you can write `headers` instead of `headers: headers`. Like ES6 object shorthand in JavaScript.

- **`fn header(&self, name: &str) -> Option<&str>`** — a method that takes `&self` (borrows the Request immutably). The `&self` is like Python's `self` parameter, but explicit about borrowing. `&self` means "I'm reading from the Request but not modifying it."

### 8.3 — Defining the Response struct

Add this after the `Request` impl block:

```rust
// --- Response ---

struct Response {
    status_code: u16,
    reason: String,
    headers: HashMap<String, String>,
    body: Vec<u8>,
}

impl Response {
    fn new(status_code: u16, reason: &str) -> Response {
        Response {
            status_code,
            reason: reason.to_string(),
            headers: HashMap::new(),
            body: Vec::new(),
        }
    }

    fn header(mut self, key: &str, value: &str) -> Response {
        self.headers.insert(key.to_string(), value.to_string());
        self
    }

    fn body_html(mut self, html: &str) -> Response {
        self.body = html.as_bytes().to_vec();
        self.headers.insert("content-type".to_string(), "text/html".to_string());
        self
    }

    fn body_bytes(mut self, bytes: Vec<u8>, content_type: &str) -> Response {
        self.body = bytes;
        self.headers.insert("content-type".to_string(), content_type.to_string());
        self
    }

    fn send(mut self, stream: &mut TcpStream) {
        // Always set Content-Length
        self.headers.insert(
            "content-length".to_string(),
            self.body.len().to_string(),
        );

        // Write status line
        let status_line = format!("HTTP/1.1 {} {}\r\n", self.status_code, self.reason);
        stream.write_all(status_line.as_bytes()).unwrap();

        // Write headers
        for (key, value) in &self.headers {
            let header_line = format!("{key}: {value}\r\n");
            stream.write_all(header_line.as_bytes()).unwrap();
        }

        // Write blank line + body
        stream.write_all(b"\r\n").unwrap();
        stream.write_all(&self.body).unwrap();
    }
}
```

New concepts:

- **`body: Vec<u8>`** — the body is stored as raw bytes, not a string. This lets us serve binary files (images) and text files with the same type.

- **`fn header(mut self, ...) -> Response`** — this method takes `self` *by value* (not `&self` or `&mut self`). It *consumes* the Response, modifies it, and returns it. This enables the **builder pattern**:
  ```rust
  Response::new(200, "OK")
      .header("X-Custom", "value")
      .body_html("<h1>Hello</h1>")
      .send(&mut stream);
  ```
  Each method takes ownership, modifies, and returns — like method chaining in jQuery or builder patterns in Java. The `mut self` means "I own this value and I'm going to modify it."

  In Python, you'd use `return self` for chaining. In Rust, you return the owned value — the compiler ensures no one else is using it.

- **`b"\r\n"`** — a byte string literal. The `b` prefix creates a `&[u8]` instead of a `&str`. Like Python's `b"\r\n"`.

- **`Vec::new()`** — creates an empty vector. Like `[]` in Python or `[]` in JS.

### 8.4 — The refactored handler

Now rewrite the handler and helper functions:

```rust
// --- Helpers ---

fn get_content_type(path: &str) -> &str {
    match Path::new(path).extension().and_then(|e| e.to_str()) {
        Some("html") => "text/html",
        Some("css") => "text/css",
        Some("js") => "application/javascript",
        Some("json") => "application/json",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("svg") => "image/svg+xml",
        Some("ico") => "image/x-icon",
        _ => "application/octet-stream",
    }
}

fn error_page(status: u16, reason: &str, message: &str) -> String {
    format!(
        "<!DOCTYPE html>\
        <html><head><title>{status} {reason}</title>\
        <style>\
        body {{ font-family: sans-serif; max-width: 600px; margin: 80px auto; text-align: center; color: #ccc; background: #1a1a2e; }}\
        h1 {{ font-size: 72px; margin: 0; color: #e94560; }}\
        p {{ color: #888; }}\
        </style></head>\
        <body><h1>{status}</h1><h2>{reason}</h2><p>{message}</p></body></html>"
    )
}

fn safe_path(requested: &str) -> Option<PathBuf> {
    let base = Path::new("public").canonicalize().ok()?;
    let file_path = if requested == "/" {
        base.join("index.html")
    } else {
        base.join(requested.trim_start_matches('/'))
    };
    let resolved = file_path.canonicalize().ok()?;
    if resolved.starts_with(&base) {
        Some(resolved)
    } else {
        None
    }
}

// --- Handler ---

fn handle_connection(mut stream: TcpStream) {
    let request = match Request::from_stream(&mut stream) {
        Some(req) => req,
        None => {
            Response::new(400, "Bad Request")
                .body_html(&error_page(400, "Bad Request", "Could not parse request."))
                .send(&mut stream);
            return;
        }
    };

    println!(
        "{} {} ({})",
        request.method,
        request.path,
        request.header("user-agent").unwrap_or("-")
    );

    if request.method != "GET" {
        Response::new(405, "Method Not Allowed")
            .body_html(&error_page(405, "Method Not Allowed", &format!("{} is not supported.", request.method)))
            .send(&mut stream);
        return;
    }

    match safe_path(&request.path) {
        Some(file_path) => {
            match fs::read(&file_path) {
                Ok(contents) => {
                    let ct = get_content_type(&file_path.to_string_lossy());
                    Response::new(200, "OK")
                        .body_bytes(contents, ct)
                        .send(&mut stream);
                }
                Err(_) => {
                    Response::new(500, "Internal Server Error")
                        .body_html(&error_page(500, "Internal Server Error", "Failed to read file."))
                        .send(&mut stream);
                }
            }
        }
        None => {
            Response::new(404, "Not Found")
                .body_html(&error_page(404, "Not Found", &format!("{} was not found.", request.path)))
                .send(&mut stream);
        }
    }
}

fn main() {
    let listener = TcpListener::bind("127.0.0.1:7878").unwrap();
    println!("Forja v0.1.0");
    println!("Listening on http://127.0.0.1:7878");
    println!("Serving files from ./public/");

    for stream in listener.incoming() {
        let stream = stream.unwrap();
        handle_connection(stream);
    }
}
```

Look how clean `handle_connection` is now. Compare it to the Stage 7 version — the logic is the same, but the code reads like a story:

1. Parse the request (or return 400)
2. Log it
3. Check the method (or return 405)
4. Resolve the file path (or return 404)
5. Read the file (or return 500)
6. Send the response

The builder pattern makes response construction readable:
```rust
Response::new(200, "OK")
    .body_bytes(contents, ct)
    .send(&mut stream);
```

Compare to the old way:
```rust
let header = format!("HTTP/1.1 200 OK\r\nContent-Type: {ct}\r\nContent-Length: {}\r\n\r\n", contents.len());
stream.write_all(header.as_bytes()).unwrap();
stream.write_all(&contents).unwrap();
```

### 8.5 — Common mistakes at this stage

**Trying to use Request after moving it:**
```rust
let request = Request::from_stream(&mut stream).unwrap();
handle_request(request);
println!("{}", request.method); // ← error! request was moved
```
```
error[E0382]: borrow of moved value: `request`
```
If `handle_request` takes `Request` by value, it consumes it. Pass by reference instead: `handle_request(&request)`.

**Forgetting that builder methods consume self:**
```rust
let response = Response::new(200, "OK");
response.header("X-Foo", "bar"); // ← error! response was moved
response.send(&mut stream);      // ← error! response was moved
```
Each builder method consumes `self` and returns a new `Response`. You must chain them or reassign:
```rust
// Chain (preferred):
Response::new(200, "OK").header("X-Foo", "bar").send(&mut stream);

// Or reassign:
let response = Response::new(200, "OK");
let response = response.header("X-Foo", "bar");
response.send(&mut stream);
```

**String vs &str confusion:**
```rust
struct Request {
    method: &str,  // ← error! missing lifetime
}
```
```
error[E0106]: missing lifetime specifier
```
Bare `&str` in a struct needs a lifetime annotation (`&'a str`). Use `String` for owned data in structs until you're comfortable with lifetimes.

### 8.6 — Test it

```bash
cargo run
```

```bash
# All previous tests should still work:
curl http://localhost:7878/
curl http://localhost:7878/style.css
curl http://localhost:7878/nonexistent
curl -X POST http://localhost:7878/

# Check the server log format:
# GET / (curl/8.7.1)
# GET /style.css (curl/8.7.1)
# GET /nonexistent (curl/8.7.1)
# POST / (curl/8.7.1)
```

Open `http://localhost:7878` in your browser — everything should work exactly as before, but the code is now clean and extensible.

### Stage 8 checkpoint — Complete final code

Your complete `src/main.rs`:

```rust
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};

// --- Request ---

struct Request {
    method: String,
    path: String,
    version: String,
    headers: HashMap<String, String>,
}

impl Request {
    fn from_stream(stream: &mut TcpStream) -> Option<Request> {
        let mut buffer = [0u8; 1024];
        let bytes_read = match stream.read(&mut buffer) {
            Ok(0) => return None,
            Ok(n) => n,
            Err(_) => return None,
        };

        let raw = String::from_utf8_lossy(&buffer[..bytes_read]).to_string();
        let mut lines = raw.lines();

        let request_line = lines.next()?;
        let parts: Vec<&str> = request_line.split_whitespace().collect();
        if parts.len() < 3 {
            return None;
        }

        let mut headers = HashMap::new();
        for line in lines {
            if line.is_empty() {
                break;
            }
            if let Some((key, value)) = line.split_once(':') {
                headers.insert(key.trim().to_lowercase(), value.trim().to_string());
            }
        }

        Some(Request {
            method: parts[0].to_string(),
            path: parts[1].to_string(),
            version: parts[2].to_string(),
            headers,
        })
    }

    fn header(&self, name: &str) -> Option<&str> {
        self.headers.get(name).map(|s| s.as_str())
    }
}

// --- Response ---

struct Response {
    status_code: u16,
    reason: String,
    headers: HashMap<String, String>,
    body: Vec<u8>,
}

impl Response {
    fn new(status_code: u16, reason: &str) -> Response {
        Response {
            status_code,
            reason: reason.to_string(),
            headers: HashMap::new(),
            body: Vec::new(),
        }
    }

    fn header(mut self, key: &str, value: &str) -> Response {
        self.headers.insert(key.to_string(), value.to_string());
        self
    }

    fn body_html(mut self, html: &str) -> Response {
        self.body = html.as_bytes().to_vec();
        self.headers.insert("content-type".to_string(), "text/html".to_string());
        self
    }

    fn body_bytes(mut self, bytes: Vec<u8>, content_type: &str) -> Response {
        self.body = bytes;
        self.headers.insert("content-type".to_string(), content_type.to_string());
        self
    }

    fn send(mut self, stream: &mut TcpStream) {
        self.headers.insert(
            "content-length".to_string(),
            self.body.len().to_string(),
        );

        let status_line = format!("HTTP/1.1 {} {}\r\n", self.status_code, self.reason);
        stream.write_all(status_line.as_bytes()).unwrap();

        for (key, value) in &self.headers {
            let header_line = format!("{key}: {value}\r\n");
            stream.write_all(header_line.as_bytes()).unwrap();
        }

        stream.write_all(b"\r\n").unwrap();
        stream.write_all(&self.body).unwrap();
    }
}

// --- Helpers ---

fn get_content_type(path: &str) -> &str {
    match Path::new(path).extension().and_then(|e| e.to_str()) {
        Some("html") => "text/html",
        Some("css") => "text/css",
        Some("js") => "application/javascript",
        Some("json") => "application/json",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("svg") => "image/svg+xml",
        Some("ico") => "image/x-icon",
        _ => "application/octet-stream",
    }
}

fn error_page(status: u16, reason: &str, message: &str) -> String {
    format!(
        "<!DOCTYPE html>\
        <html><head><title>{status} {reason}</title>\
        <style>\
        body {{ font-family: sans-serif; max-width: 600px; margin: 80px auto; text-align: center; color: #ccc; background: #1a1a2e; }}\
        h1 {{ font-size: 72px; margin: 0; color: #e94560; }}\
        p {{ color: #888; }}\
        </style></head>\
        <body><h1>{status}</h1><h2>{reason}</h2><p>{message}</p></body></html>"
    )
}

fn safe_path(requested: &str) -> Option<PathBuf> {
    let base = Path::new("public").canonicalize().ok()?;
    let file_path = if requested == "/" {
        base.join("index.html")
    } else {
        base.join(requested.trim_start_matches('/'))
    };
    let resolved = file_path.canonicalize().ok()?;
    if resolved.starts_with(&base) {
        Some(resolved)
    } else {
        None
    }
}

// --- Handler ---

fn handle_connection(mut stream: TcpStream) {
    let request = match Request::from_stream(&mut stream) {
        Some(req) => req,
        None => {
            Response::new(400, "Bad Request")
                .body_html(&error_page(400, "Bad Request", "Could not parse request."))
                .send(&mut stream);
            return;
        }
    };

    println!(
        "{} {} ({})",
        request.method,
        request.path,
        request.header("user-agent").unwrap_or("-")
    );

    if request.method != "GET" {
        Response::new(405, "Method Not Allowed")
            .body_html(&error_page(
                405,
                "Method Not Allowed",
                &format!("{} is not supported.", request.method),
            ))
            .send(&mut stream);
        return;
    }

    match safe_path(&request.path) {
        Some(file_path) => match fs::read(&file_path) {
            Ok(contents) => {
                let ct = get_content_type(&file_path.to_string_lossy());
                Response::new(200, "OK")
                    .body_bytes(contents, ct)
                    .send(&mut stream);
            }
            Err(_) => {
                Response::new(500, "Internal Server Error")
                    .body_html(&error_page(
                        500,
                        "Internal Server Error",
                        "Failed to read file.",
                    ))
                    .send(&mut stream);
            }
        },
        None => {
            Response::new(404, "Not Found")
                .body_html(&error_page(
                    404,
                    "Not Found",
                    &format!("{} was not found.", request.path),
                ))
                .send(&mut stream);
        }
    }
}

fn main() {
    let listener = TcpListener::bind("127.0.0.1:7878").unwrap();
    println!("Forja v0.1.0");
    println!("Listening on http://127.0.0.1:7878");
    println!("Serving files from ./public/");

    for stream in listener.incoming() {
        let stream = stream.unwrap();
        handle_connection(stream);
    }
}
```

**Test it:**
```bash
cargo run
# In another terminal:
curl -v http://localhost:7878/
curl -v http://localhost:7878/style.css
curl -v http://localhost:7878/nonexistent
curl -v -X POST http://localhost:7878/
# Open http://localhost:7878 in your browser
```

---

## Act 1 — Complete

You built an HTTP server from scratch. No frameworks, no dependencies — just the Rust standard library. Here's what you learned:

| Stage | What you built | Rust concepts |
|-------|---------------|---------------|
| 1 | Project setup | `cargo`, `fn`, `let`, `println!`, immutability |
| 2 | TCP listener | `TcpListener`, `Read` trait, `mut`, `&mut`, `Result`, `unwrap()` |
| 3 | Request parsing | Ownership, move semantics, `Vec`, `&str`, `collect()`, `match` |
| 4 | HTTP responses | `Write` trait, `format!`, `write_all`, `match` with routing |
| 5 | Header parsing | `HashMap`, `if let`, closures, `Option` chaining |
| 6 | File serving | `fs::read`, `Path`, closures, `Option::and_then` |
| 7 | Error handling | Status codes, `canonicalize`, `?` operator, path security |
| 8 | Structs | `struct`, `impl`, builder pattern, `&self`, ownership at boundaries |

### What's missing (and coming in Act 2)

Your server works, but it has limitations:

- **Single-threaded** — it handles one request at a time. While serving one client, all others wait. Act 2 introduces multi-threading with `std::thread` and thread pools.
- **No POST body parsing** — we read headers but ignore the request body. Act 2 adds body parsing for form data and JSON.
- **No keep-alive** — each request opens a new TCP connection. HTTP/1.1 supports persistent connections — Act 2 implements them.
- **1024-byte buffer** — large requests get truncated. Act 2 implements proper buffered reading.
- **No logging** — just `println!`. Act 2 adds structured logging.

> **AWS connection**: The single-threaded limitation is exactly why services like Lambda exist — each invocation gets its own execution environment, so concurrency is handled by the platform, not your code. When you run on EC2 or ECS, *you* are responsible for handling concurrent connections — which is what Act 2 is all about.

### What to explore next

Before moving to Act 2, try these exercises:

1. **Add a `/time` route** that returns the current time (hint: `std::time::SystemTime`)
2. **Add a `/json` route** that returns `{"status": "ok"}` with `Content-Type: application/json`
3. **Add request logging to a file** — append each request to `access.log`
4. **Serve a favicon** — create a `public/favicon.ico` and watch the browser request it automatically

See you in Act 2 — where we make this server fast.
