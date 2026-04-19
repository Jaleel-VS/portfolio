# Act 1 — Raw TCP

> *You will build an HTTP server from nothing. No frameworks, no libraries — just you, a TCP socket, and the Rust standard library. By the end of this act, you'll understand what happens between the moment a browser sends a request and the moment it renders a page.*

**Prerequisites**: A Mac with [Rust installed](https://rustup.rs/) (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`), a terminal (Ghostty), and a text editor (nvim). You should be comfortable writing Python — we'll reference it throughout.

**Project location**: `~/juk/forja/forja/`

```mermaid
flowchart LR
    S1[Stage 1\nHello Cargo] --> S2[Stage 2\nThe Listener]
    S2 --> S3[Stage 3\nParsing Requests]
    S3 --> S4[Stage 4\nFirst Response]
    S4 --> S5[Stage 5\nThe Headers]
    S5 --> S6[Stage 6\nServing Files]
    S6 --> S7[Stage 7\n404 Not Found]
    S7 --> S8[Stage 8\nThe Request Struct]

    style S1 fill:#2d6a4f,stroke:#40916c
    style S2 fill:#2d6a4f,stroke:#40916c
    style S3 fill:#2d6a4f,stroke:#40916c
    style S4 fill:#2d6a4f,stroke:#40916c
    style S5 fill:#1b4332,stroke:#40916c
    style S6 fill:#1b4332,stroke:#40916c
    style S7 fill:#2d6a4f,stroke:#40916c
    style S8 fill:#1b4332,stroke:#40916c
```

---

## Stage 1 — Hello Cargo

> *Every forge starts cold. Before you can shape metal, you need to light the fire and lay out your tools.*

*Difficulty: Very Easy — Est. time: 30 min*

This stage solves the most fundamental problem: getting a Rust project running on your machine so you have a working anvil to hammer on for the rest of the course.

Before we touch networking, let's make sure Rust is working and understand the project structure. If you've used `pip init`, Cargo is Rust's equivalent — it's the build tool, package manager, and test runner all in one.

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

Two things. That's it. Rust has no runtime dependencies by default.

### 1.2 — Cargo.toml: your pyproject.toml

Open `Cargo.toml`:

```toml
[package]
name = "forja"
version = "0.1.0"
edition = "2024"
```

This is like `pyproject.toml` in Python. It declares your project's name, version, and which Rust edition to use. Dependencies will go here later (under `[dependencies]`), but we won't need any external crates for Act 1 — the standard library has everything we need.

### 1.3 — Your first Rust program

Open `src/main.rs`:

```rust
fn main() {
    println!("Hello, world!");
}
```

Let's break this down — every single token matters in Rust:

- **`fn`** — declares a function. Like `def` in Python.
- **`main()`** — the entry point. Every Rust binary must have exactly one `main` function. Like `if __name__ == "__main__"` in Python, but enforced by the compiler.
- **`println!`** — prints text to the terminal. The `!` means it's a *macro*, not a regular function. For now, think of macros as "functions that can do extra magic at compile time." `println!` needs to be a macro because it accepts a variable number of arguments — something regular Rust functions can't do.
- **`"Hello, world!"`** — a string literal. Double quotes only — single quotes are for individual characters (`'a'`), unlike Python where they're interchangeable.
- **`;`** — semicolons are required at the end of statements. Coming from Python, this will feel annoying for a day, then you'll stop noticing.
- **`{ }`** — curly braces define blocks. No colons-and-indentation like Python.

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

**What just happened under the hood**: Rust compiled your source code into a native binary — actual machine code, not bytecode. There's no interpreter, no VM, no runtime. When you run `target/debug/forja`, it's as direct as running a C program. This is why Rust programs start instantly — no Python interpreter startup.

> [!info] AWS Connection
> This is why Lambda functions written in Rust have near-zero cold starts compared to Python. There's no runtime to initialize — the binary just runs.

### 1.5 — Let's customize it

Replace the contents of `src/main.rs`:

```rust
fn main() {
    let port = 7878;
    println!("Forja server will listen on port {port}");
}
```

New concepts:

- **`let`** — declares a variable. Like `x = 5` in Python. In Rust, variables are *immutable by default* — you can't change `port` after this line. If you wanted to change it later, you'd write `let mut port = 7878;`. This is the opposite of most languages, and it's intentional: immutability prevents entire categories of bugs.
- **`{port}`** — string interpolation inside `println!`. Like f-strings in Python (`f"port {port}"`). This only works inside macros like `println!` — you can't do this with regular strings (we'll see why later).

Run it:

```bash
cargo run
```

```
Forja server will listen on port 7878
```

> **Why port 7878?** It's "rust" typed on a phone keypad. It's the traditional example port in Rust tutorials. We'll use it throughout.

> [!warning] Common Mistake: Forgetting the semicolon
> ```rust
> fn main() {
>     println!("hello")  // ← missing semicolon
> }
> ```
> ```
> error: expected `;`
> ```
> Rust's error messages are excellent — they'll tell you exactly what's wrong and often suggest the fix.

> [!warning] Common Mistake: Using single quotes for strings
> ```rust
> let name = 'forja';  // ← wrong! Single quotes are for chars only
> ```
> ```
> error: character literal may only contain one codepoint
> ```
> Use double quotes: `let name = "forja";`

> [!warning] Common Mistake: Trying to mutate an immutable variable
> ```rust
> let port = 7878;
> port = 8080;  // ← error!
> ```
> ```
> error[E0384]: cannot assign twice to immutable variable `port`
> ```
> The fix: `let mut port = 7878;` — but we don't need mutation here.

### 1.6 — Extend it (exercise)

Before moving on, try this on your own:

1. Add a `let host = "127.0.0.1";` variable and print both host and port: `Forja server will listen on 127.0.0.1:7878`
2. Try changing `port` to a different number *without* using `mut` — use a second `let port = ...` instead. This is called *shadowing* and it's perfectly legal in Rust. What happens to the first value?
3. Try using `let port: &str = "not a number";` and then `println!("port {port}")`. Does it compile? What does this tell you about Rust's type system compared to Python?

> [!check] Checkpoint
> Your tools are laid out and the forge is lit. But a forge that only prints text is a forge with no metal — next, we feed it a TCP socket and start listening for connections from the outside world.
>
> Your `src/main.rs` should be:
>
> ```rust
> fn main() {
>     let port = 7878;
>     println!("Forja server will listen on port {port}");
> }
> ```
>
> Run `cargo run` and confirm you see: `Forja server will listen on port 7878`

---

## Stage 2 — The Listener

> *Time to open a socket and listen for connections — the foundation of every web server, load balancer, and proxy you've ever used.*

*Difficulty: Easy — Est. time: 45 min*

Right now we have a Rust project that compiles and prints text, but it can't talk to the outside world. A web server that can't accept connections is no server at all. This stage solves the foundational problem: opening a port and listening for incoming TCP connections — the raw plumbing that every web server, load balancer, and proxy is built on.

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

> [!info] AWS Connection
> This three-way handshake happens billions of times a day on AWS. When your ALB (Application Load Balancer) accepts a connection from a client, it's doing exactly what we're about to do — calling `accept()` on a TCP socket. The ALB then opens a *second* TCP connection to your backend (EC2 instance, ECS container, Lambda), making it a reverse proxy. NLBs (Network Load Balancers) operate at this TCP layer directly — they forward the raw TCP connection without understanding HTTP at all.

### Concept: Result and unwrap

Before we write the listener, you need to understand how Rust handles errors — because the very first networking call can fail.

In Python, operations that can fail raise exceptions:

```python
import socket
s = socket.socket()
s.bind(("127.0.0.1", 7878))  # raises OSError if port is in use
```

Rust has **no exceptions**. Instead, functions that can fail return a `Result` type:

```rust
enum Result<T, E> {
    Ok(T),    // success — contains the value
    Err(E),   // failure — contains the error
}
```

You *must* handle the `Result` — the compiler won't let you ignore it. The simplest way is `.unwrap()`:

- If the `Result` is `Ok(value)`, `.unwrap()` gives you the value.
- If the `Result` is `Err(error)`, `.unwrap()` **crashes the program** with a panic message.

`.unwrap()` is fine for learning and prototyping. In production code, you'd handle errors properly with `match` or the `?` operator — we'll introduce `?` in Stage 7 and use it increasingly from there.

> [!tip] What happens when `.unwrap()` panics
> ```
> thread 'main' panicked at 'called `Result::unwrap()` on an `Err` value:
> Os { code: 48, kind: AddrInUse, message: "Address already in use" }'
> ```
> The panic message tells you exactly what went wrong. But in a real server, a panic kills the whole process — every connected client loses their connection. That's why we'll replace `.unwrap()` with proper error handling as the course progresses.

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

- **`use std::net::TcpListener;`** — an import statement. Like `from socket import socket` in Python. `std` is the standard library, `net` is the networking module, and `TcpListener` is the specific type we want. Rust doesn't auto-import anything (unlike Python's builtins) — you must be explicit.

- **`TcpListener::bind("127.0.0.1:7878")`** — creates a TCP listener bound to this address. The `::` syntax calls an *associated function* (like a static method in Python). `bind` is `TcpListener`'s constructor.

- **`.unwrap()`** — extracts the `TcpListener` from the `Ok` variant, or panics if binding failed (e.g., port already in use).

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

- **`listener.incoming()`** — returns an iterator that yields new TCP connections as they arrive. Each item is a `Result<TcpStream>`. This method blocks — it waits until a client connects, yields that connection, then waits for the next one. The loop runs forever.

- **`for stream in listener.incoming()`** — a for loop, like Python's `for stream in listener.incoming()`. Rust's `for` loops work on anything that implements the `Iterator` trait (like Python's `__iter__`).

- **`let stream = stream.unwrap();`** — wait, we already have a `stream` variable from the `for` line! This is called *shadowing* — Rust lets you reuse a variable name, and the new binding replaces the old one. The `for` loop gives us a `Result<TcpStream>`, and we unwrap it to get the `TcpStream` inside. Shadowing is idiomatic Rust — it avoids names like `stream_result` and `stream_value`.

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

Now let's see what the browser actually sends us. But before I give you the full solution, try it yourself.

**Your task:** Modify the loop body to read bytes from the `stream` into a buffer and print them as a string. Here's what you need:

- Import `std::io::Read` (this trait gives `TcpStream` a `.read()` method)
- Make `stream` mutable with `let mut stream = ...` (reading modifies internal state)
- Create a byte buffer: `let mut buffer = [0u8; 1024];` (1024 bytes, all zeros)
- Call `stream.read(&mut buffer)` — it returns `Result<usize>` (number of bytes read)
- Convert bytes to a string with `String::from_utf8_lossy(&buffer[..bytes_read])`

<details>
<summary>Solution — click after you've tried it</summary>

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

</details>

Let's break down the key concepts in this code:

- **`use std::io::Read;`** — imports the `Read` trait. `TcpStream` implements `Read`, which gives it the `.read()` method. In Rust, you must import a trait before you can call its methods — even if the type already implements it. This is different from Python where methods are always available.

- **`let mut stream`** — the `mut` keyword makes this variable mutable. We need this because `.read()` takes `&mut self` — it modifies the stream's internal state (advancing the read position). Without `mut`, the compiler would refuse to let us call `.read()`.

- **`let mut buffer = [0u8; 1024];`** — creates a fixed-size array of 1024 bytes, all initialized to zero.
  - `[0u8; 1024]` — array syntax: `[value; count]`. `0u8` means "the number 0, as an unsigned 8-bit integer."
  - This is a *stack-allocated* buffer — no heap allocation, no garbage collector. In Python, you'd write `buffer = bytearray(1024)`.

- **`stream.read(&mut buffer)`** — reads bytes from the TCP stream into our buffer. It returns the number of bytes actually read. The `&mut buffer` passes a *mutable reference* to the buffer — the function can write into it without taking ownership.

### Concept: References and borrowing

This is your first encounter with Rust's borrowing system. There are two kinds of references:

- `&buffer` — an *immutable reference*: "borrow this, read-only." Like letting someone look at a book you're holding.
- `&mut buffer` — a *mutable reference*: "borrow this, you can modify it." Like handing someone a pen and your notebook.

The rules are simple but strict:
1. You can have **many** `&` references at the same time (many readers)
2. You can have **one** `&mut` reference at a time (one writer, no readers)
3. References must always be valid (no dangling pointers)

These rules prevent data races at compile time. We'll see them enforced more as the code gets complex.

- **`String::from_utf8_lossy(&buffer[..bytes_read])`** — converts raw bytes to a string.
  - `&buffer[..bytes_read]` — a *slice* of the buffer, from index 0 to `bytes_read`. Like Python's `buffer[:bytes_read]`. We don't want to print the trailing zeros.
  - `from_utf8_lossy` — converts bytes to a string, replacing any invalid UTF-8 with `�`.

### 2.5 — Test it

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

> [!warning] Common Mistake: "Address already in use"
> ```
> thread 'main' panicked at 'called `Result::unwrap()` on an `Err` value:
> Os { code: 48, kind: AddrInUse, message: "Address already in use" }'
> ```
> This means another process (maybe a previous run of your server that you forgot to kill) is already using port 7878. Fix it:
> ```bash
> # Find what's using the port:
> lsof -i :7878
> # Kill it:
> kill -9 <PID>
> ```
> Or just use a different port. This error is the same `EADDRINUSE` you'd get in Python.

> [!warning] Common Mistake: Forgetting `use std::io::Read;`
> ```
> error[E0599]: no method named `read` found for struct `TcpStream` in the current scope
>   = help: items from traits can only be used if the trait is in scope
>   = help: the following trait is implemented but not in scope; perhaps add a `use` for it:
>           use std::io::Read;
> ```
> Rust's error messages are incredibly helpful — it tells you exactly which `use` statement to add.

> [!warning] Common Mistake: Forgetting `mut`
> ```
> error[E0596]: cannot borrow `stream` as mutable, as it is not declared as mutable
>   --> src/main.rs:10:26
>    |
> 9  |         let stream = stream.unwrap();
>    |             ------ help: consider changing this to be mutable: `mut stream`
> ```
> The compiler tells you the fix. This is Rust's philosophy: the compiler is your pair programmer.

### 2.6 — Extend it (exercise)

1. Print the peer address (`stream.peer_addr().unwrap()`) alongside the byte count. What port does the client connect from? Run curl three times — does the port change?
2. Try increasing the buffer to `[0u8; 4096]` and hitting the server from a browser instead of curl. How many more headers does the browser send?
3. What happens if you use a buffer of `[0u8; 10]` — only 10 bytes? Does the server crash? What do you see?

> [!check] Checkpoint
> You've opened the forge door and raw bytes are flowing in. But those bytes are just a wall of text — you can't tell a GET from a POST, a path from a header. Next, we'll parse that raw stream into something meaningful.
>
> Your `src/main.rs`:
>
> ```rust
> use std::io::Read;
> use std::net::TcpListener;
>
> fn main() {
>     let listener = TcpListener::bind("127.0.0.1:7878").unwrap();
>     println!("Listening on port 7878");
>
>     for stream in listener.incoming() {
>         let mut stream = stream.unwrap();
>         println!("Connection established!");
>
>         let mut buffer = [0u8; 1024];
>         let bytes_read = stream.read(&mut buffer).unwrap();
>
>         let request = String::from_utf8_lossy(&buffer[..bytes_read]);
>         println!("Received {} bytes:\n{}", bytes_read, request);
>     }
> }
> ```
>
> **Test it:**
> ```bash
> cargo run
> # In another terminal:
> curl http://localhost:7878
> ```
> You should see the raw HTTP request printed in the server terminal.


---

## Stage 3 — What the Browser Sent

> *We can receive raw bytes from a client, but right now they're an undifferentiated blob of text. Time to extract meaning.*

*Difficulty: Easy — Est. time: 50 min*

We can see the raw HTTP request. Now let's parse it — extract the method, path, and HTTP version from the request line. This is the parsing problem: extracting structured meaning from raw text so we know what to do with each connection.

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

> [!info] AWS Connection
> API Gateway parses exactly this format. When you define a route like `GET /users/{id}`, API Gateway is matching against the method and path from the request line. CloudFront does the same thing when evaluating cache behaviors — it looks at the path pattern to decide which origin to forward to.

### 3.2 — Extracting the request line

We need to extract a `handle_connection` function and parse the request line. Here's what the function should do:

1. Read bytes from the stream (same as Stage 2)
2. Get the first line of the request
3. Split it into method, path, and version
4. Print them

**Try it yourself.** You'll need these building blocks:
- `request.lines().next()` — gets the first line (returns `Option<&str>`)
- `.unwrap_or("")` — provides a default if `None`
- `request_line.split_whitespace().collect::<Vec<&str>>()` — splits by whitespace into a vector
- `parts[0]`, `parts[1]`, `parts[2]` — index into the vector

The function signature should be: `fn handle_connection(mut stream: TcpStream)` — it takes the stream by value (ownership moves into the function).

<details>
<summary>Solution — click after you've tried it</summary>

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

</details>

Let's unpack the new concepts:

- **`fn handle_connection(mut stream: TcpStream)`** — a function that takes a `TcpStream` by value. The `mut` before `stream` means we can mutate it inside the function (needed for `.read()`).

### Concept: Ownership and move semantics

Notice: we're *moving* the stream into this function — the caller gives up ownership. After calling `handle_connection(stream)`, the `for` loop can't use `stream` anymore.

This is Rust's *ownership* system — the most important concept in the language:

- **In Python**: `handle_connection(stream)` passes a reference — both the caller and function can use it.
- **In Rust**: `handle_connection(stream)` *moves* the value — only the function owns it now.

Think of it like handing someone a physical object. Once you hand it over, you don't have it anymore. This prevents data races and use-after-free bugs at compile time.

> [!warning] Common Mistake: Trying to use `stream` after moving it
> ```rust
> for stream in listener.incoming() {
>     let stream = stream.unwrap();
>     handle_connection(stream);
>     println!("{}", stream.peer_addr().unwrap()); // ← error!
> }
> ```
> ```
> error[E0382]: borrow of moved value: `stream`
>   --> src/main.rs:25:20
>    |
> 23 |         let stream = stream.unwrap();
>    |             ------ move occurs because `stream` has type `TcpStream`
> 24 |         handle_connection(stream);
>    |                           ------ value moved here
> 25 |         println!("{}", stream.peer_addr().unwrap());
>    |                        ^^^^^^ value borrowed here after move
> ```
> Once you pass `stream` to `handle_connection`, it's gone. If you need the peer address in `main`, extract it *before* the move:
> ```rust
> let stream = stream.unwrap();
> let addr = stream.peer_addr().unwrap();
> handle_connection(stream);
> println!("{addr}");
> ```

More new concepts from the solution:

- **`request.lines()`** — returns an iterator over the lines of the string. Like Python's `request.splitlines()`.

- **`.next()`** — gets the first item from the iterator. Returns an `Option<&str>`:
  - `Some("GET / HTTP/1.1")` — there was a line
  - `None` — the string was empty

- **`.unwrap_or("")`** — like `.unwrap()`, but instead of crashing on `None`, it returns the default value `""`. Safer than `.unwrap()`.

- **`let parts: Vec<&str> = request_line.split_whitespace().collect();`** — this line does a lot:
  - `split_whitespace()` — splits the string by whitespace, returns an iterator. Like Python's `request_line.split()`.
  - `.collect()` — consumes the iterator and collects results into a collection. But what collection? Rust needs to know, so we annotate the type: `Vec<&str>`.
  - **`Vec<&str>`** — a vector (dynamic array, like Python's `list`) of string slices.
  - **`&str`** — a *string slice* — a reference to a portion of a string. It doesn't own the data, it just points to it. Think of it as a "view" into the original string. This is different from `String`, which owns its data (like Python's `str`). We'll explore this distinction more in Stage 8.

> [!warning] Common Mistake: Type annotation confusion with `collect()`
> ```rust
> let parts = request_line.split_whitespace().collect(); // ← error!
> ```
> ```
> error[E0282]: type annotations needed
> ```
> `collect()` can produce many different collection types (`Vec`, `HashSet`, `String`, etc.), so Rust needs you to specify which one. Either annotate the variable or use turbofish syntax:
> ```rust
> let parts: Vec<&str> = request_line.split_whitespace().collect();
> // or:
> let parts = request_line.split_whitespace().collect::<Vec<&str>>();
> ```

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

### 3.4 — Extend it (exercise)

1. Add a counter that tracks how many requests the server has handled. Print `"[{count}] GET /path HTTP/1.1"` for each request. You'll need `let mut count = 0;` before the loop and `count += 1;` inside it.
2. Print the method in uppercase and the path in a different color using ANSI escape codes: `println!("\x1b[32m{method}\x1b[0m {path}")` (green method). Try `\x1b[31m` for red, `\x1b[34m` for blue.

> [!check] Checkpoint
> You can now read the client's intent — method, path, version. But a forge that only listens and never speaks back is useless. Next, we'll send our first HTTP response and close the loop.
>
> Your `src/main.rs` should match the solution above.
>
> **Test it:**
> ```bash
> cargo run
> # In another terminal:
> curl http://localhost:7878/hello
> # Server prints: GET /hello HTTP/1.1
> ```

---

## Stage 4 — Your First Response

> *A conversation requires two sides. Time to make the forge speak back.*

*Difficulty: Easy — Est. time: 50 min*

Right now we have a server that listens and parses, but the client gets nothing back — curl hangs, the browser shows an error. This stage completes the HTTP request-response cycle: your server will speak back for the first time, and you'll see HTML rendered in a real browser from bytes you forged yourself.

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

> [!info] AWS Connection
> When CloudFront caches a response, it stores these headers along with the body. The `Content-Type` header determines how the browser renders the response. If your Lambda function returns JSON but forgets to set `Content-Type: application/json`, the browser might try to render it as HTML — a common bug in API Gateway setups.

### 4.2 — Writing a response

**Your task:** Update `handle_connection` to send back an HTTP response after parsing the request. You need:

1. Import `std::io::Write` (for the `.write_all()` method)
2. Build a response string with `format!()` containing the status line, headers, blank line, and body
3. Write it to the stream with `stream.write_all(response.as_bytes()).unwrap()`

The response should be a valid HTTP response with:
- Status line: `HTTP/1.1 200 OK`
- `Content-Type: text/html` header
- `Content-Length` header matching the body length
- An HTML body like `<html><body><h1>Hello from Forja!</h1></body></html>`

Remember: HTTP uses `\r\n` line endings, not just `\n`.

<details>
<summary>Solution — click after you've tried it</summary>

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

</details>

New concepts:

- **`use std::io::{Read, Write};`** — imports multiple items from the same module. Like Python's `from io import Read, Write`. We need the `Write` trait for `.write_all()`.

- **`format!(...)`** — like `println!` but returns a `String` instead of printing. Like Python's f-string, but as a macro. The result is a heap-allocated `String` (owned data), not a `&str` (borrowed slice).

- **`\r\n`** — CRLF line endings. HTTP requires these — `\n` alone won't work. This is a common gotcha when building HTTP by hand.

- **`body.len()`** — returns the byte length of the string. For ASCII text, this equals the character count. For UTF-8 with multi-byte characters (emoji, CJK), byte length ≠ character count. `Content-Length` must be in bytes.

- **`stream.write_all(response.as_bytes()).unwrap()`** — writes the entire response to the TCP stream.
  - `.as_bytes()` — converts a `&str` to `&[u8]` (a byte slice). TCP streams deal in bytes, not strings.
  - `.write_all()` — writes the entire buffer. The simpler `.write()` might write only *part* of the buffer (it returns how many bytes were written). `write_all` loops internally until everything is sent.

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

Now open `http://localhost:7878` in your browser — you'll see **Hello from Forja!** rendered as an actual HTML page.

### 4.4 — Path-based routing with match

Let's make the response depend on the path. This introduces one of Rust's most powerful features:

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

- **`let (method, path) = ...`** — *destructuring*. Like Python's `method, path = ...`. The `if/else` returns a tuple `(parts[0], parts[1])`, and we unpack it into two variables.

- **`match path { ... }`** — pattern matching. This is Rust's superpower — like a `switch` statement on steroids. Each arm is `pattern => expression`. The `_` is a wildcard that matches anything (like `default` in a switch). Unlike a switch, `match` is *exhaustive* — the compiler forces you to handle every possible case.

- **`.to_string()`** — converts a `&str` (borrowed string slice) to a `String` (owned string). We need this because `format!()` returns a `String`, and all arms of a `match` must return the same type. The string literals are `&str`, so we convert them.

> [!info] AWS Connection
> This path-based routing is exactly what API Gateway does. When you define routes like `GET /users` and `POST /orders`, API Gateway matches the incoming request's method and path against your route definitions. You just built a tiny version of that.

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

### 4.6 — Extend it (exercise)

1. Add a `/time` route that returns the current timestamp. You'll need `use std::time::SystemTime;` and `SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).unwrap().as_secs()`. Return it as plain text with `Content-Type: text/plain`.
2. Add a `/json` route that returns `{"status": "ok", "server": "forja"}` with `Content-Type: application/json`. You'll need to change the Content-Type in the response for this route — which means you can't use a single `format!` for all routes anymore. Try using a tuple `(content_type, body)` from the match.

> [!check] Checkpoint
> The forge now speaks — you've completed the full HTTP request-response cycle. But we've been ignoring half the request: the headers. They carry critical metadata like authentication tokens, content types, and the client's identity. Next, we'll parse them.
>
> Your `src/main.rs` should match the path-routing version above (section 4.4).
>
> **Test it:**
> ```bash
> cargo run
> # In another terminal:
> curl -v http://localhost:7878/about
> # Should see full HTTP response with 200 OK and HTML body
> ```


---

## Stage 5 — The Headers

> *Headers are the control plane of HTTP: they tell you who the client is, what format they expect, whether they're authenticated, and how to cache the response.*

*Difficulty: Medium — Est. time: 60 min*

We've been ignoring the request headers. Time to parse them — they contain critical information like the hostname, content type, and authentication tokens. Without parsing them, your server is flying blind.

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
- **`Host`** — which domain the request is for. A single server can host multiple domains (virtual hosting).
- **`User-Agent`** — identifies the client. Browsers, curl, bots all send different values.
- **`Content-Length`** — for POST/PUT requests, tells the server how many bytes of body to expect.
- **`Content-Type`** — for POST/PUT, what format the body is in (`application/json`, `application/x-www-form-urlencoded`, etc.).
- **`Authorization`** — authentication credentials. `Bearer <token>` is the most common pattern (JWTs).
- **`Accept`** — what response formats the client can handle.

> [!info] AWS Connection
> ALBs use the `Host` header for host-based routing rules. CloudFront forwards (or strips) specific headers based on your cache policy. API Gateway reads `Authorization` to invoke your Lambda authorizer. WAF inspects headers for malicious patterns. Headers are the control plane of HTTP.

### 5.2 — Parsing headers into a HashMap

**Your task:** Update `handle_connection` to parse the headers into a `HashMap<String, String>`. Here's the algorithm:

1. After consuming the first line (request line), iterate the remaining lines
2. Stop when you hit an empty line (that's the end of headers)
3. For each header line, split at the first `:` to get key and value
4. Normalize the key to lowercase (HTTP headers are case-insensitive)
5. Store in a `HashMap`

You'll need:
- `use std::collections::HashMap;`
- `line.split_once(':')` — splits at the first `:`, returns `Option<(&str, &str)>`
- `if let Some((key, value)) = ...` — pattern matching in an `if` statement
- `key.trim().to_lowercase()` and `value.trim().to_string()` — clean up whitespace

Also add a `/headers` route that displays the parsed headers as an HTML table.

<details>
<summary>Solution — click after you've tried it</summary>

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

</details>

Let's unpack the new concepts:

- **`use std::collections::HashMap;`** — imports Rust's hash map. Like Python's `dict`. Unlike Python, it's not a built-in — you import it from the standard library.

- **`HashMap<String, String>`** — a map from owned strings to owned strings. We use `String` (owned) instead of `&str` (borrowed) because the header data needs to outlive the parsing loop. Using owned `String`s is simpler and avoids lifetime complications.

- **`.to_string()`** on `request_str` — we convert the `Cow<str>` returned by `from_utf8_lossy` into an owned `String`. This is important: `lines()` returns `&str` slices that borrow from the original string. By owning the string, we ensure the borrows are valid.

- **`let mut lines = request_str.lines();`** — creates a mutable iterator. We call `.next()` to consume the first line (the request line), then iterate the rest in the `for` loop. The iterator remembers its position.

- **`if let Some((key, value)) = line.split_once(':') { ... }`** — this combines two concepts:
  - `split_once(':')` — splits the string at the first `:`, returning `Option<(&str, &str)>`. Like Python's `line.split(':', 1)`, but returns an `Option` instead of a list.
  - `if let` — pattern matching in an `if` statement. If `split_once` returns `Some((key, value))`, we enter the block with `key` and `value` bound. If it returns `None` (no `:` found), we skip the line.

- **`key.trim().to_lowercase()`** — HTTP headers are case-insensitive (`Content-Type` = `content-type`). We normalize to lowercase for consistent lookups.

- **`{headers:#?}`** — the `#?` format specifier uses "pretty debug" formatting — it prints the HashMap with nice indentation. `?` is compact debug, `#?` is pretty debug.

- **`for (key, value) in &headers`** — iterates over the HashMap by reference (`&`). Without the `&`, the loop would *consume* (move) the HashMap, and we couldn't use it afterward.

- **`String::from(...)`** and **`.push_str(...)`** — `String::from` creates a new owned string. `.push_str()` appends a `&str` to a `String`. This is how you build strings incrementally in Rust.

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

> [!warning] Common Mistake: Lifetime issues with borrowed headers
> If you tried to use `&str` instead of `String` in the HashMap:
> ```rust
> let mut headers: HashMap<&str, &str> = HashMap::new();
> ```
> This might work in simple cases, but gets tricky when you try to return headers from a function or store them in a struct. The `&str` values borrow from `request_str`, so they can't outlive it. Using owned `String`s avoids this entirely — it's a common Rust pattern to "own your data" at boundaries.

> [!warning] Common Mistake: Forgetting `to_string()` on the Cow
> `from_utf8_lossy` returns a `Cow<str>` (Copy-on-Write) — a type that's *either* a borrowed `&str` or an owned `String`. If you don't call `.to_string()`, the borrow checker might complain when you try to use `lines` after `request_str` is dropped. Converting to `String` makes ownership clear.

### 5.4 — Extend it (exercise)

1. Add a `/user-agent` route that returns *just* the User-Agent header value as plain text. You'll need `headers.get("user-agent")` which returns `Option<&String>`. Use `.map(|s| s.as_str()).unwrap_or("unknown")` to handle the case where the header is missing.
2. Add a check: if the `host` header is missing, return a `400 Bad Request` response. HTTP/1.1 requires the Host header — your server should enforce this.

> [!check] Checkpoint
> Your server now understands the full anatomy of an HTTP request — method, path, and every header. But we're still building HTML strings by hand inside Rust code. Real web servers serve files from disk — HTML, CSS, JavaScript. That's next.
>
> Your `src/main.rs` should match the solution above.
>
> **Test it:**
> ```bash
> cargo run
> # In another terminal:
> curl http://localhost:7878/headers
> # Should see an HTML table of headers
> ```


---

## Stage 6 — Serving Files

> *Real web servers read files from disk and send them to the browser. Time to bridge the gap between your server and the filesystem.*

*Difficulty: Medium — Est. time: 70 min*

Hardcoded HTML strings won't scale. Every time you want to change a page, you recompile the server. This stage turns Forja into something that can serve a real website with HTML, CSS, and JavaScript — just like nginx, Apache, or S3 static hosting.

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

### 6.2 — Content-Type detection

Before we serve files, we need a function that maps file extensions to MIME types. **Implement `get_content_type` yourself.** It should:

- Take a file path as `&str`
- Return the MIME type as `&str`
- Handle at least: `.html`, `.css`, `.js`, `.json`, `.png`, `.jpg`/`.jpeg`, `.svg`, `.ico`
- Return `"application/octet-stream"` for unknown extensions

Hint: `Path::new(path).extension().and_then(|e| e.to_str())` gives you `Option<&str>` with the extension. Use `match` on it.

<details>
<summary>Solution</summary>

```rust
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
```

</details>

New concepts in this function:

- **`fn get_content_type(path: &str) -> &str`** — takes a string slice reference and returns one. The returned `&str` references string literals baked into the binary — they live forever (they have `'static` lifetime).

- **`Path::new(path).extension().and_then(|e| e.to_str())`** — a chain of operations:
  - `Path::new(path)` — wraps the string in a `Path` type
  - `.extension()` — returns `Option<&OsStr>` — the file extension, or `None`
  - `.and_then(|e| e.to_str())` — if there's an extension, try to convert it to a `&str`. The `|e|` is a *closure* (anonymous function), like Python's `lambda e:`.

- **`Some("jpg") | Some("jpeg")`** — the `|` in pattern matching means "or" — match either pattern.

### 6.3 — Serving files from disk

Now update `handle_connection` to serve files. Replace the `match path` routing with file-based serving:

1. Map the URL path to a file path: `/` → `public/index.html`, `/style.css` → `public/style.css`
2. Read the file with `fs::read(&file_path)` — returns `Result<Vec<u8>>`
3. If the file exists, send it with the correct Content-Type
4. If not, send a 404

**Important:** We need two separate `write_all` calls — headers as a string, then body as raw bytes. This is because binary files (images) can't be combined with headers using `format!`.

<details>
<summary>Full solution</summary>

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

</details>

New concepts:

- **`use std::fs;`** — the filesystem module. Like Python's `os` and `pathlib`, or Node's `fs`.

- **`fs::read(&file_path)`** — reads the entire file into a `Vec<u8>` (a vector of bytes). Returns `Result<Vec<u8>>`. Unlike `fs::read_to_string`, this works for binary files too (images, etc.). In Python, this is `open(path, 'rb').read()`.

- **`match fs::read(&file_path) { Ok(contents) => ..., Err(_) => ... }`** — we match on the `Result`. If the file exists, we serve it. If not, we return a 404. The `_` in `Err(_)` means "I don't care about the specific error."

### 6.4 — Security note: path traversal

Our current code has a security vulnerability. What if someone requests:

```
GET /../../../etc/passwd HTTP/1.1
```

The path `public/../../../etc/passwd` would resolve to `/etc/passwd` — the server would serve any file on the system! This is called a **path traversal attack**.

We'll fix this in Stage 7, but be aware: this is one of the most common web server vulnerabilities.

> [!info] AWS Connection
> S3 static website hosting handles this automatically — you can't traverse out of the bucket. CloudFront + S3 Origin Access Control adds another layer. When you build your own server, you're responsible for these protections.

### 6.5 — Test it

```bash
cargo run
```

```bash
# Serve the HTML page:
curl http://localhost:7878/

# Check content types:
curl -v http://localhost:7878/style.css 2>&1 | grep Content-Type
# Content-Type: text/css

# Try a missing file:
curl -v http://localhost:7878/nope.html 2>&1 | grep "< HTTP"
# < HTTP/1.1 404 Not Found
```

Open `http://localhost:7878` in your browser — you should see a styled page with dark background, red heading, and the JavaScript loaded (check the browser console for "Forja JS loaded!"). Click the heading to see it change color.

The browser makes three requests: one for the HTML, one for the CSS (from the `<link>` tag), and one for the JS (from the `<script>` tag). Check the server terminal:

```
GET /
GET /style.css
GET /app.js
```

### 6.6 — Extend it (exercise)

1. Add a `public/404.html` page with custom styling. Update the `Err(_)` branch to serve this file instead of the hardcoded HTML string. What happens if `404.html` itself is missing? (Hint: you'll need a fallback.)
2. Add support for serving `public/favicon.ico`. Create a simple favicon (or download one) and watch the browser request it automatically when you load any page.

> [!check] Checkpoint
> Your server now reads from the filesystem and serves real web pages with CSS and JavaScript. But there's a gaping hole: no path traversal protection, and error handling is minimal. Time to harden the forge.
>
> Your `src/main.rs` should match the solution above. Your `public/` directory should contain `index.html`, `style.css`, and `app.js`.
>
> **Test it:**
> ```bash
> cargo run
> # Open http://localhost:7878 in your browser
> # You should see a styled page with working CSS and JS
> ```


---

## Stage 7 — 404 Not Found

> *A fragile server is a dangerous server. Time to temper the raw metal with proper error handling and security.*

*Difficulty: Easy — Est. time: 50 min*

Right now we have a file server, but it's fragile and dangerous. Missing files produce cryptic errors, unsupported methods silently succeed, and path traversal attacks can read any file on your system. This stage adds proper HTTP status codes, security protections, and user-friendly error pages.

### 7.1 — HTTP status codes

Status codes are three-digit numbers grouped by category:

| Range | Category | Examples |
|-------|----------|----------|
| 1xx | Informational | 100 Continue |
| 2xx | Success | 200 OK, 201 Created, 204 No Content |
| 3xx | Redirection | 301 Moved Permanently, 304 Not Modified |
| 4xx | Client Error | 400 Bad Request, 403 Forbidden, 404 Not Found |
| 5xx | Server Error | 500 Internal Server Error, 502 Bad Gateway, 503 Service Unavailable |

> [!info] AWS Connection
> You see these everywhere in AWS:
> - **502 Bad Gateway** — your ALB got a bad response from the backend (Lambda timeout, ECS container crash).
> - **503 Service Unavailable** — no healthy targets in the target group.
> - **504 Gateway Timeout** — the backend didn't respond in time (ALB default: 60s).
> - **403 Forbidden** — S3 bucket policy denies access, or WAF blocked the request.
> - **304 Not Modified** — CloudFront cache hit, no need to re-download.

### 7.2 — Path traversal protection and the `?` operator

Let's fix the security vulnerability from Stage 6 and add proper error handling. This is also where we introduce the `?` operator — Rust's elegant way to propagate errors without `.unwrap()` crashing the program.

### Concept: The `?` operator and early returns

Up to now, we've used `.unwrap()` everywhere — "give me the value or crash." That's fine for learning, but a real server can't crash every time a file is missing. The `?` operator is the production alternative:

```rust
// With unwrap — crashes on error:
let file = fs::read("path").unwrap();

// With ? — returns the error to the caller:
let file = fs::read("path")?;
```

The `?` operator works on `Result` and `Option`:
- On `Result`: if `Err`, return the error immediately. If `Ok`, unwrap the value.
- On `Option`: if `None`, return `None` immediately. If `Some`, unwrap the value.

The function must return a compatible type (`Result` or `Option`) for `?` to work. We'll use `Option` in our `safe_path` function:

**Your task:** Implement `safe_path(requested: &str) -> Option<PathBuf>` that:

1. Gets the absolute path of `public/` using `Path::new("public").canonicalize().ok()?`
2. Joins the requested path onto it
3. Canonicalizes the result (resolves `..`, symlinks, etc.)
4. Checks that the resolved path still starts with the `public/` directory
5. Returns `None` if it's a traversal attempt, `Some(path)` if safe

You'll also need helper functions:
- `send_response(stream, status, reason, content_type, body)` — to avoid duplicating response-building code
- `error_page(status, reason, message)` — to generate styled error HTML

<details>
<summary>Full solution</summary>

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

</details>

New concepts:

- **`fn send_response(stream: &mut TcpStream, ...)`** — takes a *mutable reference* to the stream (`&mut TcpStream`), not ownership. The caller keeps the stream — we're just borrowing it to write. Compare:
  - `stream: TcpStream` — takes ownership (caller loses it)
  - `stream: &TcpStream` — borrows read-only
  - `stream: &mut TcpStream` — borrows with write access

- **`body: &[u8]`** — a byte slice. A reference to a contiguous sequence of bytes — it could point into a `Vec<u8>`, a `String`, or a static byte array. It's the most flexible way to accept "some bytes."

- **`PathBuf`** — the owned version of `Path`, like `String` is the owned version of `&str`. `Path` is always borrowed (`&Path`), `PathBuf` is owned and can be returned from functions.

- **`canonicalize()`** — resolves a path to its absolute form, following symlinks and resolving `..`. Returns `Result<PathBuf>`. This is the key to preventing path traversal — after canonicalization, `public/../../../etc/passwd` becomes `/etc/passwd`, and we can check that it doesn't start with our `public/` directory.

- **`.ok()?`** — converts a `Result` to an `Option` (discarding the error) and then `?` propagates `None` early. This is the `?` operator in action — "if this failed, return `None` from the function immediately."

- **`match stream.read(&mut buffer) { Ok(0) => return, ... }`** — proper error handling for the read. `Ok(0)` means the client closed the connection without sending data. `Err(_)` means a read error occurred. No more `.unwrap()` on the read!

- **`let _version = parts[2];`** — the underscore prefix tells Rust "I know I'm not using this variable." Without it, the compiler warns about unused variables.

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

### 7.4 — Extend it (exercise)

1. Add a `403 Forbidden` response for requests to paths containing `..` (even before canonicalization). Log these attempts with a warning: `"BLOCKED path traversal attempt: {path}"`.
2. Add a `HEAD` method handler that returns the same headers as `GET` but with an empty body. This is used by monitoring tools to check if a URL is alive without downloading the content.

> [!check] Checkpoint
> Your server now handles errors gracefully and blocks path traversal attacks. But look at `handle_connection` — it's a sprawling function with parsing, routing, file serving, and error handling all tangled together. Time to forge proper structure with Rust structs.
>
> Your `src/main.rs` is the full listing above. Make sure your `public/` directory still has `index.html`, `style.css`, and `app.js` from Stage 6.
>
> **Test it:**
> ```bash
> cargo run
> # In another terminal:
> curl http://localhost:7878/           # 200 OK
> curl http://localhost:7878/nope       # 404 Not Found
> curl -X DELETE http://localhost:7878/  # 405 Method Not Allowed
> ```


---

## Stage 8 — The Request Struct

> *Loose variables scattered across a monolithic function won't scale. Time to forge proper types.*

*Difficulty: Medium — Est. time: 90 min*

Our `handle_connection` function is getting long and messy — method, path, and headers are loose variables with no connection between them. Adding a new feature means threading more variables through more code. This stage solves the structural problem: we'll create proper `Request` and `Response` types, and introduce `#[test]` to verify our parsing works.

### 8.1 — Why structs?

In Python, you'd naturally reach for a class:

```python
class Request:
    def __init__(self, method, path, version, headers):
        self.method = method
        self.path = path
        self.version = version
        self.headers = headers
```

In Flask, the framework gives you a `request` object. In Rust, we'll use a **struct** — Rust's equivalent of a class (but without inheritance).

### 8.2 — Defining the Request struct

**Your task:** Define a `Request` struct with fields for `method`, `path`, `version` (all `String`), and `headers` (`HashMap<String, String>`). Then implement:

1. `Request::from_stream(stream: &mut TcpStream) -> Option<Request>` — parses a request from a TCP stream (move the parsing logic from `handle_connection`)
2. `Request::header(&self, name: &str) -> Option<&str>` — looks up a header by name

Design decisions to make:
- All fields should be `String` (owned), not `&str` (borrowed). This avoids lifetime complexity — we'll explore the borrowed version in Act 2.
- `from_stream` returns `Option<Request>` because parsing can fail (empty request, malformed data).
- Use `?` on `Option` to propagate `None` early (e.g., `lines.next()?`).

<details>
<summary>Solution — Request struct</summary>

```rust
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

</details>

Key concepts:

- **`struct Request { ... }`** — defines a new type with named fields. Like a Python `@dataclass`, but with zero overhead — the fields are actual memory layout.

- **All fields are `String` (owned)** — not `&str` (borrowed). If we used `&str`, the `Request` would need *lifetime annotations*:
  ```rust
  struct Request<'a> {
      method: &'a str,
      path: &'a str,
  }
  ```
  That `'a` says "this struct can't outlive the data it borrows from." We'll explore lifetimes in Act 2. For now, owned data is simpler.

- **`impl Request { ... }`** — an *implementation block* where you define methods. Like putting methods inside a Python class, but separated from the struct definition.

- **`fn from_stream(...) -> Option<Request>`** — an associated function (no `self` parameter) that acts as a constructor. By convention, Rust uses `new()` or `from_*()` for constructors — there's no special `__init__`.

- **`lines.next()?`** — the `?` operator on `Option`. If `next()` returns `None`, the function immediately returns `None`. Much more concise than:
  ```python
  line = next(lines, None)
  if line is None:
      return None
  ```

- **`Some(Request { ..., headers })`** — *field init shorthand*: when the variable name matches the field name, write `headers` instead of `headers: headers`.

- **`fn header(&self, name: &str) -> Option<&str>`** — a method that borrows `self` immutably. The `&self` is like Python's `self`, but explicit about borrowing.

### 8.3 — Defining the Response struct

Now build a `Response` struct with a **builder pattern** — each method consumes `self`, modifies it, and returns it, enabling chaining:

```rust
Response::new(200, "OK")
    .header("X-Custom", "value")
    .body_html("<h1>Hello</h1>")
    .send(&mut stream);
```

**Your task:** Implement `Response` with:
- Fields: `status_code: u16`, `reason: String`, `headers: HashMap<String, String>`, `body: Vec<u8>`
- `Response::new(status_code, reason)` — constructor
- `.header(mut self, key, value) -> Response` — adds a header, returns self
- `.body_html(mut self, html) -> Response` — sets body as HTML
- `.body_bytes(mut self, bytes, content_type) -> Response` — sets body as raw bytes
- `.send(mut self, stream)` — writes the HTTP response to the stream

The key insight: builder methods take `mut self` (ownership), not `&mut self` (reference). This enables chaining.

<details>
<summary>Solution — Response struct</summary>

```rust
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
```

</details>

Key concepts:

- **`body: Vec<u8>`** — the body is stored as raw bytes, not a string. This lets us serve binary files (images) and text files with the same type.

- **`fn header(mut self, ...) -> Response`** — takes `self` *by value* (not `&self` or `&mut self`). It *consumes* the Response, modifies it, and returns it. This is the **builder pattern**. In Python, you'd use `return self` for chaining. In Rust, you return the owned value.

- **`b"\r\n"`** — a byte string literal. The `b` prefix creates a `&[u8]` instead of a `&str`. Like Python's `b"\r\n"`.

> [!warning] Common Mistake: Forgetting that builder methods consume self
> ```rust
> let response = Response::new(200, "OK");
> response.header("X-Foo", "bar"); // ← error! response was moved
> response.send(&mut stream);      // ← error! response was moved
> ```
> Each builder method consumes `self` and returns a new `Response`. You must chain them or reassign:
> ```rust
> // Chain (preferred):
> Response::new(200, "OK").header("X-Foo", "bar").send(&mut stream);
>
> // Or reassign:
> let response = Response::new(200, "OK");
> let response = response.header("X-Foo", "bar");
> response.send(&mut stream);
> ```

> [!warning] Common Mistake: String vs &str confusion in structs
> ```rust
> struct Request {
>     method: &str,  // ← error! missing lifetime
> }
> ```
> ```
> error[E0106]: missing lifetime specifier
> ```
> Bare `&str` in a struct needs a lifetime annotation (`&'a str`). Use `String` for owned data in structs until you're comfortable with lifetimes.

### 8.4 — The refactored handler

Now put it all together. The handler becomes clean and readable:

```rust
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

Look how clean this is compared to Stage 7. The logic reads like a story:

1. Parse the request (or return 400)
2. Log it
3. Check the method (or return 405)
4. Resolve the file path (or return 404)
5. Read the file (or return 500)
6. Send the response

### 8.5 — Your first tests

It's time to introduce `#[test]` and `cargo test`. We can't easily test the full TCP flow in a unit test, but we can test our helper functions. Add this at the bottom of `src/main.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_content_type_html() {
        assert_eq!(get_content_type("index.html"), "text/html");
    }

    #[test]
    fn test_content_type_css() {
        assert_eq!(get_content_type("style.css"), "text/css");
    }

    #[test]
    fn test_content_type_js() {
        assert_eq!(get_content_type("app.js"), "application/javascript");
    }

    #[test]
    fn test_content_type_unknown() {
        assert_eq!(get_content_type("file.xyz"), "application/octet-stream");
    }

    #[test]
    fn test_content_type_no_extension() {
        assert_eq!(get_content_type("Makefile"), "application/octet-stream");
    }

    #[test]
    fn test_error_page_contains_status() {
        let page = error_page(404, "Not Found", "gone");
        assert!(page.contains("404"));
        assert!(page.contains("Not Found"));
        assert!(page.contains("gone"));
    }
}
```

Run the tests:

```bash
cargo test
```

```
running 6 tests
test tests::test_content_type_html ... ok
test tests::test_content_type_css ... ok
test tests::test_content_type_js ... ok
test tests::test_content_type_unknown ... ok
test tests::test_content_type_no_extension ... ok
test tests::test_error_page_contains_status ... ok

test result: ok. 6 passed; 0 failed; 0 ignored
```

Key concepts:

- **`#[cfg(test)]`** — a conditional compilation attribute. This module is only compiled when running `cargo test`, not in the final binary. No test code bloats your production build.

- **`mod tests { ... }`** — a module (we'll explain modules fully in Act 2 when we split into multiple files).

- **`use super::*;`** — imports everything from the parent module (our `main.rs` functions). `super` means "one level up."

- **`#[test]`** — marks a function as a test. `cargo test` finds and runs all functions with this attribute.

- **`assert_eq!(a, b)`** — panics if `a != b`, printing both values. Like Python's `assert a == b` but with better error messages.

- **`assert!(condition)`** — panics if the condition is false.

From now on, every stage that builds a pure function should include at least one test. Tests are your safety net — "if this test passes, your implementation is correct."

> [!tip] Running specific tests
> ```bash
> cargo test                          # run all tests
> cargo test test_content_type        # run tests matching this name
> cargo test tests::test_error_page   # run a specific test
> ```

### 8.6 — Test the server

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

### 8.7 — Extend it (exercise)

1. Add a `Request::method_is(&self, method: &str) -> bool` helper method. Write a test for it: `assert!(request.method_is("GET"))` and `assert!(!request.method_is("POST"))`. You'll need to construct a `Request` manually in the test (no TCP stream needed — just fill in the fields directly).
2. Add a `Response::body_json(mut self, json: &str) -> Response` method that sets the body and `Content-Type: application/json`. Write a test that constructs a Response, calls `.body_json()`, and checks that the content-type header was set correctly.

> [!check] Checkpoint
> You've forged the raw metal of Act 1 into clean, structured types. Your server has proper `Request` and `Response` abstractions — the building blocks every web framework is made of. You've also introduced `cargo test` as your safety net.
>
> **Run the full test suite:**
> ```bash
> cargo test
> # All 6 tests should pass
> ```
>
> **Run the server:**
> ```bash
> cargo run
> # Open http://localhost:7878 in your browser
> ```


---

## Act 1 — Complete

You built an HTTP server from scratch. No frameworks, no dependencies — just the Rust standard library. Here's what you learned:

| Stage | What you built | Rust concepts |
|-------|---------------|---------------|
| 1 | Project setup | `cargo`, `fn`, `let`, `println!`, immutability |
| 2 | TCP listener | `TcpListener`, `Read` trait, `mut`, `&mut`, `Result`, `unwrap()`, references |
| 3 | Request parsing | Ownership, move semantics, `Vec`, `&str`, `collect()`, `match` |
| 4 | HTTP responses | `Write` trait, `format!`, `write_all`, `match` with routing, destructuring |
| 5 | Header parsing | `HashMap`, `if let`, closures, `Option` chaining |
| 6 | File serving | `fs::read`, `Path`, closures, `Option::and_then`, content types |
| 7 | Error handling | Status codes, `canonicalize`, `?` operator, path security, `PathBuf` |
| 8 | Structs & tests | `struct`, `impl`, builder pattern, `&self`, `#[test]`, `assert_eq!` |

### Error handling progress

We started with `.unwrap()` everywhere and introduced better patterns as we went:

| Stage | Pattern | Used for |
|-------|---------|----------|
| 1-4 | `.unwrap()` | Quick prototyping — crashes on error |
| 5 | `.unwrap_or(default)` | Providing fallback values |
| 7 | `?` operator | Early returns in `safe_path()` |
| 7 | `match` on `Result` | Handling read errors gracefully |
| 8 | `Option<Request>` | Representing parse failure without crashing |

In Act 2, we'll introduce custom error types and use `Result<T, E>` with `?` throughout.

### What's missing (and coming next)

Your server works, but it has limitations:

- **No routing system** — paths are matched with `if/else` or `match`. Act 2 builds a real router with path parameters (`/users/:id`).
- **No POST body parsing** — we read headers but ignore the request body. Act 2 adds body parsing for form data and JSON.
- **Single-threaded** — it handles one request at a time. While serving one client, all others wait. Act 3 introduces multi-threading and async.
- **1024-byte buffer** — large requests get truncated. Act 2 implements proper buffered reading.
- **No module system** — everything is in one file. Act 2 splits into `request.rs`, `response.rs`, `router.rs`.

> [!info] AWS Connection
> The single-threaded limitation is exactly why services like Lambda exist — each invocation gets its own execution environment, so concurrency is handled by the platform, not your code. When you run on EC2 or ECS, *you* are responsible for handling concurrent connections — which is what Act 3 is all about.

### Exercises before Act 2

Before moving on, try these to solidify what you've learned:

1. **Add a `/time` route** that returns the current time (hint: `std::time::SystemTime`). Write a test for the time formatting function.
2. **Add a `/json` route** that returns `{"status": "ok"}` with `Content-Type: application/json`. Use the `Response` builder.
3. **Add request logging to a file** — append each request to `access.log` using `std::fs::OpenOptions`. Look up `OpenOptions::new().append(true).create(true).open("access.log")`.
4. **Serve a favicon** — create a `public/favicon.ico` and watch the browser request it automatically.

See you in [[Act 2 - The Router]] — where we build a real routing system and split into modules.
