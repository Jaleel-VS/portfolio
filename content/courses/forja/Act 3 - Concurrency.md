# Act 3 — Concurrency

> *"Your server works. For one person at a time."*

In Acts 1 and 2 you built a real HTTP server — request parsing, routing, path parameters, JSON APIs, middleware, static files. All of it single-threaded, processing one connection at a time in a loop. That's fine for learning. It's not fine for production.

In this act, you'll feel the pain of single-threaded blocking, then fix it three different ways: threads, a thread pool, and async/await with Tokio. By the end, you'll have a production-shaped async server with shared state and graceful shutdown.

**What you'll build:**
- A thread-per-connection server
- A hand-rolled thread pool (the kind inside every web server)
- Shared mutable state with `Arc<Mutex<>>`
- A full async rewrite with Tokio
- Graceful shutdown with Ctrl+C signal handling

**Prerequisites:** Your working server from Act 2 (router, handlers, middleware, static files).

```mermaid
flowchart LR
    S16[Stage 16\nOne at a Time] --> S17[Stage 17\nThread Per Connection]
    S17 --> S18[Stage 18\nThe Thread Pool]
    S18 --> S19[Stage 19\nShared State]
    S19 --> S20[Stage 20\nTokio Awakens]
    S20 --> S21[Stage 21\nAsync Handlers]
    S21 --> S22[Stage 22\nGraceful Shutdown]

    style S16 fill:#2d6a4f,stroke:#40916c
    style S17 fill:#1b4332,stroke:#40916c
    style S18 fill:#540b0e,stroke:#9b2226
    style S19 fill:#1b4332,stroke:#40916c
    style S20 fill:#540b0e,stroke:#9b2226
    style S21 fill:#1b4332,stroke:#40916c
    style S22 fill:#1b4332,stroke:#40916c
```

---

## The Concurrency Landscape

Before we write code, let's understand what we're choosing between. In Python, the runtime makes this choice for you. In Rust, *you* pick your concurrency model.

### Threads vs Async — The Mental Model

**OS Threads** (what `std::thread::spawn` gives you):
- Each thread gets its own stack (~8MB on macOS by default)
- The OS scheduler decides which thread runs when
- Threads can run in true parallel on multiple CPU cores
- Context switching between threads is expensive (~1-10μs)
- 1,000 threads = ~8GB of stack memory alone

**Async Tasks** (what Tokio gives you):
- Tasks are lightweight "green threads" — just a state machine on the heap
- A runtime (Tokio) schedules tasks cooperatively onto a small number of OS threads
- Tasks yield at `.await` points — if you don't await, you block the runtime thread
- 100,000 tasks? No problem. Each is a few hundred bytes
- Context switching is a function call, not a syscall

### How Other Languages Do It

**Python** has the GIL (Global Interpreter Lock). Even with `threading`, only one thread executes Python bytecode at a time. CPU-bound work needs `multiprocessing` (separate processes). `asyncio` gives you cooperative concurrency on a single thread — similar to Tokio but single-threaded by default.

**Rust** gives you the choice:
- `std::thread` for OS threads — true parallelism, heavier weight
- Tokio/async-std for async — lightweight tasks, cooperative scheduling
- Or both — Tokio's multi-threaded runtime runs async tasks across a thread pool

> [!info] AWS Connection
> This is why Lambda is powerful — each invocation gets its own execution environment. No shared state headaches, no thread pools to tune. The tradeoff is cold starts and per-invocation cost.

---

## Stage 16 — One at a Time

> *Before you can fix a problem, you need to feel it.*

*Difficulty: Easy — Est. time: 30 min*

Your server handles one request at a time — while it's processing a slow request, every other client is frozen. This stage makes that pain visceral.

### Your task

Add `/slow` and `/fast` routes to your server:

```rust
router.get("/slow", |_req| {
    std::thread::sleep(std::time::Duration::from_secs(3));
    Response::new(200, "OK", "Slow response complete")
});

router.get("/fast", |_req| {
    Response::new(200, "OK", "Fast response!")
});
```

### Feel the blocking

Start your server and open **two terminal tabs**:

```bash
# Terminal 1 — start a slow request
time curl http://localhost:7878/slow

# Terminal 2 (within 3 seconds) — try a fast request
time curl http://localhost:7878/fast
```

**What you'll see:** The fast request waits ~3 seconds even though `/fast` does no work. It's held hostage by the slow one.

```bash
# Prove it: 3 slow requests take 9 seconds (sequential)
time curl http://localhost:7878/slow &
time curl http://localhost:7878/slow &
time curl http://localhost:7878/slow &
wait
```

### Why this happens

```rust
for stream in listener.incoming() {
    let stream = stream.unwrap();
    handle_connection(stream); // blocks here until complete
}
```

`handle_connection` runs to completion before the loop accepts the next connection.

> [!info] AWS Connection
> This is exactly the problem that auto-scaling solves. A single EC2 instance behind an ALB has the same issue if it's single-threaded. That's why you scale horizontally.

### Extend it (exercise)

1. Add a `/sleep/:seconds` route that sleeps for a variable number of seconds (use `param_as::<u64>`). Test with `curl http://localhost:7878/sleep/5`.
2. Open `http://localhost:7878/slow` in two browser tabs simultaneously. Watch the second tab wait for the first. The browser's loading spinner makes the blocking visceral.

> [!check] Checkpoint
> You've felt the pain. One slow request melts the entire server. Next, we fix it with threads.

---

## Stage 17 — Thread Per Connection

> *The simplest fix: hand each connection to its own OS thread.*

*Difficulty: Medium — Est. time: 70 min*

The most intuitive fix is also the simplest — hand each connection to its own OS thread. This stage solves the blocking problem with one line of code, but reveals a new problem: unbounded resource consumption.

### Your task

Modify the accept loop to spawn a thread per connection. You need:
- `use std::thread;`
- `thread::spawn(|| { handle_connection(stream); });`

The closure automatically takes ownership of `stream` because `thread::spawn` requires `FnOnce() + Send + 'static`.

<details>
<summary>Solution</summary>

```rust
use std::net::TcpListener;
use std::thread;

fn main() {
    let listener = TcpListener::bind("127.0.0.1:7878").unwrap();
    println!("Listening on http://127.0.0.1:7878");

    for stream in listener.incoming() {
        let stream = stream.unwrap();
        thread::spawn(|| {
            handle_connection(stream);
        });
    }
}
```

</details>

### Understanding ownership across threads

`stream` is *moved* into the closure. The main thread can't use it after handing it off. This is Rust's ownership system protecting you:

- The main thread can't accidentally use `stream` after handing it off
- The spawned thread has exclusive ownership — no data races possible
- When the thread finishes, `stream` is dropped and the TCP connection closes

In Python, you'd pass the socket to a thread and *hope* nobody else touches it. In Rust, the compiler enforces it.

### Test it

```bash
# Three slow requests in parallel — ~3 seconds (not 9!)
time curl http://localhost:7878/slow &
time curl http://localhost:7878/slow &
time curl http://localhost:7878/slow &
wait
```

### The problem with thread-per-connection

Each connection spawns a new OS thread. Each thread allocates ~8MB of stack. 10,000 threads = ~80GB of virtual memory. Your OS will refuse long before that.

> [!info] AWS Connection
> This is why Nginx and HAProxy don't use thread-per-connection. They use event loops (like Tokio). An ALB can handle millions of connections because it uses async I/O internally.

> [!warning] Common Mistake: Forgetting `move`
> ```rust
> thread::spawn(|| {
>     handle_connection(&stream); // borrows stream
> });
> ```
> ```
> error: closure may outlive the current function, but it borrows `stream`
> ```
> The spawned thread might outlive the loop iteration. Rust won't let you have a dangling reference. The fix: `thread::spawn(move || { ... })` — but in this case, the closure already moves `stream` by value.

### Extend it (exercise)

1. Add a counter that tracks how many threads have been spawned. Use `Arc<AtomicUsize>` and print the count for each new connection. (Hint: `use std::sync::atomic::{AtomicUsize, Ordering};`)
2. Try spawning 1000 concurrent requests with `for i in $(seq 1 1000); do curl -s http://localhost:7878/fast & done; wait`. Does the server handle it? Check memory usage with `ps aux | grep forja`.

> [!check] Checkpoint
> Concurrent requests work. But unbounded thread creation is a ticking time bomb. Next: a thread pool to cap the damage.


---

## Stage 18 — The Thread Pool

> *Pre-create workers, feed them jobs through a channel. No matter how many connections arrive, you never exceed your thread limit.*

*Difficulty: Hard — Est. time: 120 min*

Thread-per-connection works but doesn't scale. This stage solves the resource management problem: a fixed number of worker threads pulling jobs from a queue. This is the architecture inside Nginx, Tomcat, and every production web server.

### The Architecture

```
Main Thread                    Worker Threads (4)
┌──────────┐                  ┌──────────┐
│ accept() │──── Job ────────>│ Worker 0 │ (busy)
│          │     │            ├──────────┤
│ accept() │     ├───────────>│ Worker 1 │ (busy)
│          │     │            ├──────────┤
│ accept() │     ├───────────>│ Worker 2 │ (idle)
│          │     │            ├──────────┤
│          │     └───────────>│ Worker 3 │ (idle)
└──────────┘                  └──────────┘
         Channel (mpsc)
    sender ──────────> receiver (shared)
```

### Your task: Build the ThreadPool

Build it in three steps:

**Step 1: Define the Job type**

```rust
type Job = Box<dyn FnOnce() + Send + 'static>;
```

A Job is any closure that can be sent to another thread and called once.

**Step 2: Build the Worker**

Each worker is an OS thread looping forever, pulling jobs from a shared receiver. You need:
- `Arc<Mutex<mpsc::Receiver<Job>>>` — shared receiver (multiple workers, one channel)
- A `loop` that calls `receiver.lock().unwrap().recv()`
- Break on `Err` (channel closed = shutdown)

**Step 3: Build the ThreadPool**

- `new(size)` — create `size` workers sharing one receiver
- `execute(f)` — send a job through the channel
- `Drop` — drop the sender (closes channel), then `join()` all workers

**Critical subtlety:** In the worker loop, `receiver.lock().unwrap().recv()` must be one expression. The `MutexGuard` is dropped at the semicolon, *before* `job()` runs. If you hold the lock during `job()`, you serialize all workers.

<details>
<summary>Solution — complete ThreadPool</summary>

```rust
use std::sync::{Arc, Mutex, mpsc};
use std::thread;

type Job = Box<dyn FnOnce() + Send + 'static>;

pub struct ThreadPool {
    workers: Vec<Worker>,
    sender: Option<mpsc::Sender<Job>>,
}

impl ThreadPool {
    pub fn new(size: usize) -> ThreadPool {
        assert!(size > 0, "Thread pool size must be at least 1");

        let (sender, receiver) = mpsc::channel();
        let receiver = Arc::new(Mutex::new(receiver));

        let mut workers = Vec::with_capacity(size);
        for id in 0..size {
            workers.push(Worker::new(id, Arc::clone(&receiver)));
        }

        ThreadPool {
            workers,
            sender: Some(sender),
        }
    }

    pub fn execute<F>(&self, f: F)
    where
        F: FnOnce() + Send + 'static,
    {
        let job = Box::new(f);
        self.sender.as_ref().unwrap().send(job).unwrap();
    }
}

impl Drop for ThreadPool {
    fn drop(&mut self) {
        drop(self.sender.take());
        for worker in &mut self.workers {
            println!("Shutting down worker {}", worker.id);
            if let Some(thread) = worker.thread.take() {
                thread.join().unwrap();
            }
        }
    }
}

struct Worker {
    id: usize,
    thread: Option<thread::JoinHandle<()>>,
}

impl Worker {
    fn new(id: usize, receiver: Arc<Mutex<mpsc::Receiver<Job>>>) -> Worker {
        let thread = thread::spawn(move || loop {
            let job = receiver.lock().unwrap().recv();
            match job {
                Ok(job) => {
                    println!("Worker {id} got a job; executing.");
                    job();
                }
                Err(_) => {
                    println!("Worker {id} shutting down.");
                    break;
                }
            }
        });
        Worker { id, thread: Some(thread) }
    }
}
```

</details>

Key concepts:

- **`mpsc::channel()`** — multi-producer, single-consumer channel. But we need *multiple* consumers (workers), so we wrap the receiver in `Arc<Mutex<>>`.

- **`Arc<Mutex<Receiver>>`** — `Arc` lets multiple threads share ownership. `Mutex` ensures only one worker pulls a job at a time.

- **`Drop` implementation** — when the pool is dropped: (1) drop the sender → closes the channel, (2) workers' `recv()` returns `Err` → they break, (3) `join()` each worker → wait for clean exit.

> [!info] AWS Connection
> This is essentially what's inside an EC2-backed ALB target. When you configure `worker_processes 4` in Nginx, you're setting the pool size.

### 18.1 — Use it

```rust
fn main() {
    let listener = TcpListener::bind("127.0.0.1:7878").unwrap();
    let pool = ThreadPool::new(4);
    println!("Listening on http://127.0.0.1:7878 (4 workers)");

    for stream in listener.incoming() {
        let stream = stream.unwrap();
        pool.execute(|| {
            handle_connection(stream);
        });
    }
}
```

### 18.2 — Tests for the thread pool

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[test]
    fn test_pool_executes_jobs() {
        let counter = Arc::new(AtomicUsize::new(0));
        {
            let pool = ThreadPool::new(2);
            for _ in 0..10 {
                let counter = Arc::clone(&counter);
                pool.execute(move || {
                    counter.fetch_add(1, Ordering::Relaxed);
                });
            }
            // Pool dropped here — waits for all jobs to finish
        }
        assert_eq!(counter.load(Ordering::Relaxed), 10);
    }

    #[test]
    #[should_panic]
    fn test_pool_zero_size_panics() {
        ThreadPool::new(0);
    }

    #[test]
    fn test_pool_concurrent_execution() {
        let start = std::time::Instant::now();
        {
            let pool = ThreadPool::new(4);
            for _ in 0..4 {
                pool.execute(|| {
                    std::thread::sleep(std::time::Duration::from_millis(100));
                });
            }
        }
        // 4 jobs × 100ms on 4 threads ≈ 100ms, not 400ms
        assert!(start.elapsed().as_millis() < 300);
    }
}
```

### 18.3 — Test the server

```bash
# 4 slow requests with pool of 4 — all finish in ~3 seconds
time curl http://localhost:7878/slow &
time curl http://localhost:7878/slow &
time curl http://localhost:7878/slow &
time curl http://localhost:7878/slow &
wait

# 8 slow requests — two batches of 4 → ~6 seconds
time curl http://localhost:7878/slow &
time curl http://localhost:7878/slow &
time curl http://localhost:7878/slow &
time curl http://localhost:7878/slow &
time curl http://localhost:7878/slow &
time curl http://localhost:7878/slow &
time curl http://localhost:7878/slow &
time curl http://localhost:7878/slow &
wait
```

### 18.4 — Extend it (exercise)

1. Add a `pool.active_count()` method that returns how many workers are currently executing a job. (Hint: use an `Arc<AtomicUsize>` that workers increment before `job()` and decrement after.)
2. Add a `/pool-status` route that returns the active worker count as JSON.

> [!check] Checkpoint
> You've forged a real thread pool — fixed workers, a job queue, and clean shutdown. This is the same architecture inside every production web server. But with multiple threads comes a new challenge: how do they share data?


---

## Stage 19 — Shared State

> *Multiple threads, one todo list. The central challenge of concurrent programming.*

*Difficulty: Medium — Est. time: 70 min*

Your thread pool can handle concurrent requests, but each thread is isolated. Your todo API needs a single list that all handlers can read and write. This is the reason Rust's ownership system exists.

### The Problem

You can't move `todos` into multiple closures — Rust's ownership system prevents it. And you can't borrow it — the closures need `'static` lifetime.

### The Solution: `Arc<Mutex<T>>`

- **`Arc`** (Atomic Reference Count) — multiple threads share ownership. `Arc::clone()` is cheap (just increments a counter).
- **`Mutex`** (Mutual Exclusion) — only one thread accesses the data at a time. `.lock()` returns a guard that auto-unlocks when dropped.

### Your task

Wire `Arc<Mutex<Vec<Todo>>>` into your server:

1. Create shared state in `main`: `let db: Arc<Mutex<Vec<Todo>>> = Arc::new(Mutex::new(vec![]));`
2. Clone the `Arc` before each `pool.execute()` call
3. Pass the cloned `Arc` into the handler
4. Lock, read/write, unlock (lock is released when the `MutexGuard` goes out of scope)

**Critical rule:** Always lock in the same order to prevent deadlocks. If you lock `db` before `next_id` in one handler, do the same in every handler.

<details>
<summary>Solution — shared state handlers</summary>

```rust
fn main() {
    let listener = TcpListener::bind("127.0.0.1:7878").unwrap();
    let pool = ThreadPool::new(4);

    let db: Arc<Mutex<Vec<Todo>>> = Arc::new(Mutex::new(vec![]));
    let next_id: Arc<Mutex<usize>> = Arc::new(Mutex::new(1));

    for stream in listener.incoming() {
        let stream = stream.unwrap();
        let db = Arc::clone(&db);
        let next_id = Arc::clone(&next_id);

        pool.execute(move || {
            handle_connection(stream, &db, &next_id);
        });
    }
}

fn handle_todos_get(db: &Arc<Mutex<Vec<Todo>>>) -> Response {
    let todos = db.lock().unwrap();
    Response::json(200, "OK", &*todos)
}

fn handle_todos_post(body: &str, db: &Arc<Mutex<Vec<Todo>>>, next_id: &Arc<Mutex<usize>>) -> Response {
    let input: CreateTodo = match serde_json::from_str(body) {
        Ok(t) => t,
        Err(e) => return Response::new(400, "Bad Request", &format!("Invalid JSON: {e}")),
    };

    let mut id = next_id.lock().unwrap();
    let todo = Todo { id: *id, title: input.title, completed: false };
    *id += 1;
    drop(id); // release next_id lock before locking db

    let mut todos = db.lock().unwrap();
    todos.push(todo.clone());

    Response::json(201, "Created", &todo)
}
```

</details>

> [!warning] Common Mistake: Holding Locks Too Long
> ```rust
> // BAD — holds the lock during expensive work
> let mut todos = db.lock().unwrap();
> let result = expensive_computation(); // Other threads blocked!
> todos.push(result);
>
> // GOOD — compute first, lock briefly
> let result = expensive_computation();
> let mut todos = db.lock().unwrap();
> todos.push(result);
> ```

> [!warning] Common Mistake: Deadlocks
> ```rust
> // Thread 1: locks db, then next_id
> // Thread 2: locks next_id, then db
> // → DEADLOCK
> ```
> **Fix:** Always acquire locks in the same order across all handlers.

### 19.1 — Test it

```bash
# Create todos from multiple concurrent requests
curl -X POST http://localhost:7878/api/todos -d '{"title":"Buy milk"}' &
curl -X POST http://localhost:7878/api/todos -d '{"title":"Write Rust"}' &
curl -X POST http://localhost:7878/api/todos -d '{"title":"Deploy"}' &
wait

# All three should be visible with unique IDs
curl -s http://localhost:7878/api/todos
```

### 19.2 — Extend it (exercise)

1. Add a `GET /api/stats` route that returns `{"total": N, "completed": M}` by reading the shared state. This exercises read-only locking.
2. What happens if a handler panics while holding a lock? Test it: add a route that panics inside a `db.lock()` block, then try to access `/api/todos` from another request. (Hint: the mutex becomes "poisoned.")

> [!check] Checkpoint
> Your server safely shares data across threads. But OS threads are heavy. For I/O-bound servers handling thousands of connections, we need something lighter. Next: async with Tokio.

---

## Stage 20 — Tokio Awakens

> *Replace heavy OS threads with lightweight async tasks.*

*Difficulty: Hard — Est. time: 120 min*

> [!warning] Difficulty Spike
> This is the biggest refactor in the course. You'll rewrite the server from synchronous threads to async/await with Tokio. Take it in sections: first the listener, then the handler, then the shared state.

OS threads solved concurrency but at a steep cost: ~8MB per thread, expensive context switches, and a ceiling around 10,000 connections. This stage rewrites your server with async/await and Tokio, replacing heavy OS threads with lightweight tasks that cost only a few hundred bytes each.

### How async works under the hood

When you write `stream.read(&mut buf).await`, the compiler transforms this into a state machine. At the `.await`, the task says "I'm waiting for I/O — wake me up when data arrives" and *yields* control. The runtime runs other tasks on the same thread.

This is the same model as Python's `asyncio`, but Rust is multi-threaded by default — Tokio runs a thread pool of event loops.

### Add Tokio

```bash
cargo add tokio --features full
```

### The transformation

Every change follows a pattern:

| Sync | Async |
|------|-------|
| `fn main()` | `#[tokio::main] async fn main()` |
| `std::net::TcpListener` | `tokio::net::TcpListener` |
| `listener.incoming()` | `loop { listener.accept().await }` |
| `thread::spawn(\|\| { ... })` | `tokio::spawn(async move { ... })` |
| `stream.read(&mut buf)` | `stream.read(&mut buf).await` |
| `stream.write_all(bytes)` | `stream.write_all(bytes).await` |
| `std::thread::sleep(dur)` | `tokio::time::sleep(dur).await` |

### Your task

Rewrite your server using the table above. The structure is the same — just add `async`, `.await`, and swap `std::net` for `tokio::net`.

**Critical rule:** Never use `std::thread::sleep` in async code — it blocks the runtime thread. Use `tokio::time::sleep(...).await` instead.

<details>
<summary>Solution — async server</summary>

```rust
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

#[tokio::main]
async fn main() {
    let listener = TcpListener::bind("127.0.0.1:7878").await.unwrap();
    println!("Listening on http://127.0.0.1:7878 (async)");

    loop {
        let (stream, addr) = listener.accept().await.unwrap();
        println!("Connection from {addr}");

        tokio::spawn(async move {
            handle_connection(stream).await;
        });
    }
}

async fn handle_connection(mut stream: tokio::net::TcpStream) {
    let mut buffer = vec![0u8; 4096];
    let n = match stream.read(&mut buffer).await {
        Ok(0) => return,
        Ok(n) => n,
        Err(_) => return,
    };

    let request = String::from_utf8_lossy(&buffer[..n]);
    let request_line = request.lines().next().unwrap_or("");
    println!("{request_line}");

    // Route based on path (simplified — you'd use your async router here)
    let response = if request_line.contains("/slow") {
        tokio::time::sleep(std::time::Duration::from_secs(3)).await;
        "HTTP/1.1 200 OK\r\nContent-Length: 21\r\n\r\nSlow response (async)"
    } else {
        "HTTP/1.1 200 OK\r\nContent-Length: 14\r\n\r\nHello, async!\n"
    };

    let _ = stream.write_all(response.as_bytes()).await;
}
```

</details>

> [!warning] Common Mistake: "future is not `Send`"
> ```rust
> tokio::spawn(async {
>     let rc = std::rc::Rc::new(42); // Rc is not Send!
>     tokio::time::sleep(Duration::from_secs(1)).await;
>     println!("{}", rc);
> });
> ```
> Error: `` `Rc<i32>` cannot be sent between threads safely ``
>
> `tokio::spawn` requires `Send` because Tokio might move the task to a different thread at any `.await` point. Use `Arc` instead of `Rc`.

> [!warning] Common Mistake: Blocking the runtime
> ```rust
> // BAD — blocks the runtime thread for 3 seconds
> async fn handler() {
>     std::thread::sleep(Duration::from_secs(3));
> }
>
> // GOOD — yields to the runtime
> async fn handler() {
>     tokio::time::sleep(Duration::from_secs(3)).await;
> }
> ```

### 20.1 — Test it

```bash
# 4 slow requests — all complete in ~3 seconds
time curl http://localhost:7878/slow &
time curl http://localhost:7878/slow &
time curl http://localhost:7878/slow &
time curl http://localhost:7878/slow &
wait
```

### 20.2 — Extend it (exercise)

1. Add a `/spawn-count` route that returns how many tasks have been spawned. Use `Arc<AtomicUsize>` (same as with threads — `Arc` works in async too).
2. Try using `std::thread::sleep` instead of `tokio::time::sleep` in the `/slow` handler. Run 4 concurrent slow requests. What happens? (Hint: Tokio's default thread pool has one thread per CPU core.)

> [!check] Checkpoint
> Your server is async — lightweight tasks instead of heavy threads. But `handle_connection` is one monolithic function. Next, we bring back the router pattern with async handlers.


---

## Stage 21 — Async Handlers

> *Bring back clean architecture: an async router dispatching to async handler functions.*

*Difficulty: Medium — Est. time: 70 min*

Your async server works, but all the logic is crammed into one function. This stage brings back the router pattern from Act 2, but with async handlers and shared state. This is the pattern that Axum and Actix-web are built on.

### The challenge: Async function traits

In sync Rust, handlers were `Box<dyn Fn(Request) -> Response>`. In async Rust, each async function returns a different future type. We need type erasure:

```rust
use std::future::Future;
use std::pin::Pin;

type BoxFuture<T> = Pin<Box<dyn Future<Output = T> + Send>>;
```

**Why `Pin<Box<...>>`?** Futures can be self-referential. `Pin` prevents them from being moved in memory (which would invalidate internal references). `Box` puts the future on the heap for a stable address.

### Your task

Build an `AsyncRouter` that:
1. Stores handlers as `Arc<dyn Fn(Request) -> BoxFuture<Response> + Send + Sync>`
2. Has `get()` / `post()` / `delete()` methods that wrap user handlers with `Box::pin()`
3. Has an `async fn route(&self, req: Request) -> Response` method
4. Uses `HashMap<(String, String), Handler>` for O(1) lookup instead of linear search

**Key insight:** The `get` method wraps the user's handler:

```rust
fn get<F, Fut>(&mut self, path: &str, handler: F)
where
    F: Fn(Request) -> Fut + Send + Sync + 'static,
    Fut: Future<Output = Response> + Send + 'static,
{
    self.routes.insert(
        ("GET".to_string(), path.to_string()),
        Arc::new(move |req| Box::pin(handler(req))),
    );
}
```

<details>
<summary>Solution — AsyncRouter</summary>

```rust
use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

type BoxFuture<T> = Pin<Box<dyn Future<Output = T> + Send>>;
type Handler = Arc<dyn Fn(Request) -> BoxFuture<Response> + Send + Sync>;

struct AsyncRouter {
    routes: HashMap<(String, String), Handler>,
}

impl AsyncRouter {
    fn new() -> Self {
        AsyncRouter { routes: HashMap::new() }
    }

    fn add_route<F, Fut>(&mut self, method: &str, path: &str, handler: F)
    where
        F: Fn(Request) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Response> + Send + 'static,
    {
        self.routes.insert(
            (method.to_string(), path.to_string()),
            Arc::new(move |req| Box::pin(handler(req))),
        );
    }

    fn get<F, Fut>(&mut self, path: &str, handler: F)
    where
        F: Fn(Request) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Response> + Send + 'static,
    {
        self.add_route("GET", path, handler);
    }

    fn post<F, Fut>(&mut self, path: &str, handler: F)
    where
        F: Fn(Request) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Response> + Send + 'static,
    {
        self.add_route("POST", path, handler);
    }

    async fn route(&self, req: Request) -> Response {
        let key = (req.method.clone(), req.path.clone());
        match self.routes.get(&key) {
            Some(handler) => handler(req).await,
            None => Response::new(404, "Not Found", "404 Not Found"),
        }
    }
}
```

</details>

### Shared state in async — same pattern

`Arc<Mutex<>>` works the same in async. The only rule: **don't hold the `MutexGuard` across an `.await`**:

```rust
// BAD — lock held across .await
let todos = db.lock().unwrap();
tokio::time::sleep(Duration::from_secs(1)).await; // blocked!

// GOOD — lock and release before .await
let json = {
    let todos = db.lock().unwrap();
    serde_json::to_string(&*todos).unwrap()
}; // lock released
```

If you need to hold a lock across `.await`, use `tokio::sync::Mutex` instead of `std::sync::Mutex`.

### 21.1 — Wire it up

```rust
#[tokio::main]
async fn main() {
    let db: Arc<Mutex<Vec<Todo>>> = Arc::new(Mutex::new(vec![]));
    let mut router = AsyncRouter::new();

    let db_clone = Arc::clone(&db);
    router.get("/api/todos", move |_req| {
        let db = Arc::clone(&db_clone);
        async move {
            let todos = db.lock().unwrap();
            Response::json(200, "OK", &*todos)
        }
    });

    let router = Arc::new(router);
    let listener = TcpListener::bind("127.0.0.1:7878").await.unwrap();

    loop {
        let (stream, _) = listener.accept().await.unwrap();
        let router = Arc::clone(&router);
        tokio::spawn(async move {
            // parse request from stream, then:
            // let response = router.route(request).await;
            // write response to stream
        });
    }
}
```

### 21.2 — Test it

```bash
# Create todos concurrently
for i in $(seq 1 10); do
    curl -s -X POST http://localhost:7878/api/todos \
        -d "{\"title\":\"Todo $i\"}" &
done
wait

curl -s http://localhost:7878/api/todos | python3 -m json.tool | head -20
```

### 21.3 — Extend it (exercise)

1. Add path parameter support to the async router (port `match_path` from Act 2).
2. Add a `DELETE /api/todos/:id` async handler. Verify concurrent deletes don't corrupt the list.

> [!check] Checkpoint
> Your async server has clean architecture — an async router dispatching to async handlers with shared state. One critical piece remains: graceful shutdown.

---

## Stage 22 — Graceful Shutdown

> *What happens when you press Ctrl+C? Right now, in-flight requests get killed mid-response.*

*Difficulty: Medium — Est. time: 70 min*

Your server runs forever until you kill it — and when you do, in-flight requests are severed mid-response. This stage catches the termination signal, stops new connections, lets active requests finish, and exits cleanly. This is what ECS expects when it sends SIGTERM.

### The key tools

- **`tokio::signal::ctrl_c()`** — a future that completes when Ctrl+C is pressed
- **`tokio::select!`** — waits on multiple futures, returns when the first completes

```rust
tokio::select! {
    result = listener.accept() => { /* new connection */ }
    _ = tokio::signal::ctrl_c() => { /* shutdown */ }
}
```

### Your task

Implement graceful shutdown:

1. Use `tokio::select!` in the accept loop to race between new connections and Ctrl+C
2. Track active connections with `Arc<AtomicUsize>`
3. On Ctrl+C: stop accepting, wait for in-flight requests (with a 10-second timeout)
4. Force-close remaining connections after timeout

<details>
<summary>Solution — graceful shutdown</summary>

```rust
use tokio::net::TcpListener;
use tokio::signal;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{Duration, Instant};

#[tokio::main]
async fn main() {
    let listener = TcpListener::bind("127.0.0.1:7878").await.unwrap();
    let router = Arc::new(build_router());
    let active = Arc::new(AtomicUsize::new(0));

    println!("Listening on http://127.0.0.1:7878");

    loop {
        tokio::select! {
            result = listener.accept() => {
                let (stream, addr) = result.unwrap();
                let router = Arc::clone(&router);
                let active = Arc::clone(&active);
                active.fetch_add(1, Ordering::Relaxed);

                tokio::spawn(async move {
                    handle_connection(stream, &router).await;
                    active.fetch_sub(1, Ordering::Relaxed);
                });
            }
            _ = signal::ctrl_c() => {
                println!("\nShutdown signal received. Draining connections...");

                let start = Instant::now();
                let timeout = Duration::from_secs(10);

                while active.load(Ordering::Relaxed) > 0 {
                    if start.elapsed() > timeout {
                        let remaining = active.load(Ordering::Relaxed);
                        eprintln!("Timeout! Force-closing {remaining} connections.");
                        break;
                    }
                    tokio::time::sleep(Duration::from_millis(100)).await;
                }

                println!("Shutdown complete.");
                break;
            }
        }
    }
}
```

</details>

> [!info] AWS Connection
> Graceful shutdown is critical for ECS tasks and Lambda extensions. When ECS sends SIGTERM before stopping a task, your server needs to drain connections — exactly what you just built.

> [!warning] Common Mistake: Cancel Safety
> Not all async operations are cancel-safe in `select!`. If a branch is cancelled, partial work is lost.
>
> **Cancel-safe:** `TcpListener::accept()`, `mpsc::Receiver::recv()`, `AsyncReadExt::read()`
>
> **Not cancel-safe:** `read_exact()`, `read_to_end()`, `write_all()` — partial reads/writes are lost

### 22.1 — Test it

```bash
cargo run

# In another terminal, start a slow request
curl http://localhost:7878/slow &

# Press Ctrl+C in the server terminal
# Expected: server waits for the slow request, then exits
```

### 22.2 — Extend it (exercise)

1. Add a `GET /api/connections` route that returns the current active connection count.
2. Add a `SIGTERM` handler alongside `ctrl_c()` using `tokio::signal::unix::signal(SignalKind::terminate())`. This is what ECS sends.

> [!check] Checkpoint
> Your server shuts down like a production service — draining connections, respecting timeouts, exiting cleanly. This completes the concurrency story.

---

## Act 3 — Complete

You started with a server that could handle one request at a time. Now you have:

| Stage | What You Built | Key Concept |
|-------|---------------|-------------|
| 16 | Demonstrated blocking | Single-threaded limitations |
| 17 | Thread per connection | `std::thread::spawn`, `move` closures |
| 18 | Thread pool | `mpsc::channel`, `Arc<Mutex<Receiver>>`, `Drop` |
| 19 | Shared state | `Arc<Mutex<T>>`, deadlock prevention |
| 20 | Async rewrite | Tokio, `async`/`.await`, `AsyncReadExt`/`AsyncWriteExt` |
| 21 | Async handlers | `BoxFuture`, async router, `tokio::spawn` |
| 22 | Graceful shutdown | `tokio::signal`, `tokio::select!`, connection draining |

### New Rust Concepts

| Concept | Python Equivalent | Stage |
|---------|------------------|-------|
| `std::thread::spawn` | `threading.Thread` | 17 |
| `mpsc::channel` | `queue.Queue` | 18 |
| `Arc<Mutex<T>>` | `threading.Lock` + shared ref | 18-19 |
| `Drop` trait | `__del__` / context manager | 18 |
| `async fn` / `.await` | `async def` / `await` | 20 |
| `tokio::spawn` | `asyncio.create_task` | 20 |
| `Pin<Box<dyn Future>>` | (no equivalent) | 21 |
| `tokio::select!` | `asyncio.wait(FIRST_COMPLETED)` | 22 |

### What's Next

In Act 4, you'll add production features: keep-alive, compression, TLS, rate limiting, and deployment to EC2. You've gone from "what's a TCP socket?" to a concurrent async web server. The thread pool you built is inside Nginx. The async pattern you wrote is inside Axum. The graceful shutdown is inside every ECS task.

See you in [[Act 4 - Production Features]] — where we make this server survive the internet.
