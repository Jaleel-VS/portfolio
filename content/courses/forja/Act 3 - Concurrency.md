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

---

## The Concurrency Landscape

Before we write code, let's understand what we're choosing between. In Python and Node.js, the runtime makes this choice for you. In Rust, *you* pick your concurrency model.

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

**Node.js** is single-threaded with an event loop. All I/O is async by default. `setTimeout`, `fetch`, file reads — they all go through libuv's event loop. You never think about threads. The downside: one CPU-bound function blocks everything. Worker threads exist but are rarely used.

**Rust** gives you the choice:
- `std::thread` for OS threads — true parallelism, heavier weight
- Tokio/async-std for async — lightweight tasks, cooperative scheduling
- Or both — Tokio's multi-threaded runtime runs async tasks across a thread pool

> **AWS connection:** This is why Lambda is powerful — each invocation gets its own execution environment. No shared state headaches, no thread pools to tune. The tradeoff is cold starts and per-invocation cost.

---

## Stage 16 — One at a Time

**Difficulty: Easy** · *Feel the pain of single-threaded blocking*

Right now your server handles one request, then the next. Let's make that problem visible.

### Add a Slow Endpoint

Add a `/slow` route to your server that simulates a slow operation (database query, external API call, file processing):

```rust
// In your router setup, add this handler:
router.get("/slow", |_req| {
    // Simulate a slow operation — like a database query or S3 download
    std::thread::sleep(std::time::Duration::from_secs(3));

    Response::new(200, "Slow response complete")
});

router.get("/fast", |_req| {
    Response::new(200, "Fast response!")
});
```

### Feel the Blocking

Start your server and open **two terminal tabs**. In the first:

```bash
# Terminal 1 — start a slow request
time curl http://localhost:7878/slow
```

While that's running (within 3 seconds), in the second terminal:

```bash
# Terminal 2 — try a fast request while slow is processing
time curl http://localhost:7878/fast
```

**What you'll see:** The fast request waits for the slow request to finish. Terminal 2 shows ~3 seconds even though `/fast` does no work. Your fast endpoint is being held hostage by the slow one.

### Prove It With Concurrent Requests

```bash
# Send 3 slow requests simultaneously (& runs them in background)
time curl http://localhost:7878/slow &
time curl http://localhost:7878/slow &
time curl http://localhost:7878/slow &
wait
```

**Expected output:** ~9 seconds total. Each request waits for the previous one. They execute sequentially: 3 + 3 + 3 = 9 seconds.

### Why This Happens

Look at your accept loop:

```rust
fn main() {
    let listener = TcpListener::bind("127.0.0.1:7878").unwrap();

    for stream in listener.incoming() {
        let stream = stream.unwrap();
        handle_connection(stream); // <-- blocks here until complete
    }
}
```

`handle_connection` runs to completion before the loop accepts the next connection. While one client is sleeping for 3 seconds, every other client is queued in the OS's TCP backlog, waiting.

> **AWS connection:** This is exactly the problem that auto-scaling solves. A single EC2 instance behind an ALB has the same issue if it's single-threaded — one slow request starves the rest. That's why ALB targets run multi-threaded servers, and why you scale horizontally.

### Checkpoint — Stage 16

Your server should have `/slow` and `/fast` routes, and you should have *felt* the blocking problem. The accept loop processes one connection at a time. Next, we fix it.

---

## Stage 17 — Thread Per Connection

**Difficulty: Medium** · *Spawn a thread per request*

The simplest fix: when a connection arrives, hand it to a new thread and immediately go back to accepting.

### The Fix — One Line Changes Everything

```rust
use std::net::TcpListener;
use std::thread;

fn main() {
    let listener = TcpListener::bind("127.0.0.1:7878").unwrap();
    println!("Listening on http://127.0.0.1:7878");

    for stream in listener.incoming() {
        let stream = stream.unwrap();

        // Spawn a new OS thread for each connection
        thread::spawn(|| {
            handle_connection(stream);
        });
        // Loop immediately returns to accept the next connection
    }
}
```

That's it. `thread::spawn` takes a closure, moves `stream` into it, and runs it on a new OS thread. The main thread is free to accept the next connection immediately.

### Understanding `move` and Ownership

Notice that `stream` is *moved* into the closure automatically here because `thread::spawn` requires `FnOnce() + Send + 'static`. The closure takes ownership of `stream`. This is Rust's ownership system protecting you:

- The main thread can't accidentally use `stream` after handing it off
- The spawned thread has exclusive ownership — no data races possible
- When the thread finishes, `stream` is dropped and the TCP connection closes

In Python, you'd pass the socket to a thread and *hope* nobody else touches it. In Rust, the compiler enforces it.

### Test It

```bash
# Three slow requests in parallel
time curl http://localhost:7878/slow &
time curl http://localhost:7878/slow &
time curl http://localhost:7878/slow &
wait
```

**Expected output:** ~3 seconds total (not 9!). All three requests run simultaneously on separate threads.

```bash
# Slow + fast in parallel — fast returns immediately
time curl http://localhost:7878/slow &
time curl http://localhost:7878/fast &
wait
```

The fast request returns in milliseconds while the slow one takes 3 seconds. No more hostage situations.

### The Problem With Thread-Per-Connection

This works, but it's dangerous in production:

```bash
# What happens with 10,000 simultaneous connections?
for i in $(seq 1 10000); do
    curl -s http://localhost:7878/fast &
done
wait
```

Each connection spawns a new OS thread. Each thread allocates ~8MB of stack. 10,000 threads = ~80GB of virtual memory. Your OS will refuse long before that — you'll hit `EAGAIN` or the process will be killed.

**Real-world numbers:**
- A typical Linux server can handle ~10,000 threads before things get ugly
- macOS is more conservative — thread creation starts failing around ~2,000
- Each thread also costs CPU time for context switching

> **AWS connection:** This is why Nginx and HAProxy don't use thread-per-connection. They use event loops (like Tokio). An ALB can handle millions of connections because it uses async I/O internally, not a thread per connection.

### Common Mistake: Forgetting `move`

If your closure captures a reference instead of taking ownership:

```rust
// This WON'T compile:
thread::spawn(|| {
    handle_connection(&stream); // borrows stream
});
// stream is still owned by main thread — but main thread moves on!
```

The compiler catches this: `closure may outlive the current function, but it borrows stream, which is owned by the current function`. The spawned thread might outlive the loop iteration where `stream` was created. Rust won't let you have a dangling reference.

### Checkpoint — Stage 17

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

Concurrent requests work. But unbounded thread creation is a ticking time bomb. Next: we build a thread pool to cap the damage.

---

## Stage 18 — The Thread Pool

**Difficulty: Hard** · *Build a fixed-size thread pool from scratch*

A thread pool pre-creates a fixed number of worker threads and feeds them jobs through a queue. No matter how many connections arrive, you never exceed your thread limit. This is what every production web server does.

### The Architecture

```
Main Thread                    Worker Threads (4)
┌──────────┐                  ┌──────────┐
│ accept() │──── Job ────────>│ Worker 0 │ (busy)
│          │     │            ├──────────┤
│ accept() │     ├───────────>│ Worker 1 │ (busy)
│          │     │            ├──────────┤
│ accept() │     ├───────────>│ Worker 2 │ (idle, waiting)
│          │     │            ├──────────┤
│          │     └───────────>│ Worker 3 │ (idle, waiting)
└──────────┘                  └──────────┘
         Channel (mpsc)
    sender ──────────> receiver (shared)
```

The main thread sends jobs (closures) through a channel. Worker threads sit in a loop, pulling jobs off the channel and executing them. When all workers are busy, new jobs queue up in the channel.

### Step 1: Define the Job Type

A "job" is any closure that can be sent to another thread and called once:

```rust
// A Job is a boxed closure that:
// - Can be called once (FnOnce)
// - Can be sent across threads (Send)
// - Lives long enough ('static — no borrowed references)
type Job = Box<dyn FnOnce() + Send + 'static>;
```

This is the same signature as `thread::spawn`'s argument, just boxed so we can send it through a channel.

### Step 2: The Worker

Each worker is an OS thread that loops forever, pulling jobs from a shared receiver:

```rust
use std::sync::{Arc, Mutex, mpsc};
use std::thread;

struct Worker {
    id: usize,
    thread: Option<thread::JoinHandle<()>>,
}

impl Worker {
    fn new(id: usize, receiver: Arc<Mutex<mpsc::Receiver<Job>>>) -> Worker {
        let thread = thread::spawn(move || loop {
            // Lock the mutex, receive a job, then immediately drop the lock
            let job = receiver.lock().unwrap().recv();

            match job {
                Ok(job) => {
                    println!("Worker {id} got a job; executing.");
                    job();
                }
                Err(_) => {
                    // Channel closed — sender was dropped. Time to exit.
                    println!("Worker {id} shutting down.");
                    break;
                }
            }
        });

        Worker {
            id,
            thread: Some(thread),
        }
    }
}
```

**Why `Arc<Mutex<Receiver>>`?** Let's break it down:

- `mpsc::Receiver` — the receiving end of a multi-producer, single-consumer channel. But we need *multiple* consumers (workers).
- `Mutex<Receiver>` — wraps the receiver so only one worker can pull a job at a time. Without this, two workers might grab the same job.
- `Arc<Mutex<Receiver>>` — `Arc` (Atomic Reference Count) lets multiple threads share ownership of the mutex. Each worker gets a clone of the `Arc`, which points to the same `Mutex<Receiver>`.

> **Python comparison:** This is like `queue.Queue` in Python's `threading` module — a thread-safe queue that multiple workers pull from. But in Rust, the type system *forces* you to use `Arc<Mutex<>>`. In Python, you just pass the queue and hope for the best.

**Critical subtlety:** Notice we call `receiver.lock().unwrap().recv()` in one expression. The `MutexGuard` (the lock) is dropped at the semicolon, *before* `job()` runs. This means other workers can grab jobs while this worker executes its job. If you wrote it differently:

```rust
// BAD — holds the lock while executing the job!
let guard = receiver.lock().unwrap();
let job = guard.recv().unwrap();
// guard is still alive here — other workers are blocked!
job();
// guard dropped here — way too late
```

This would serialize all your workers, defeating the purpose of the pool.

### Step 3: The ThreadPool

```rust
pub struct ThreadPool {
    workers: Vec<Worker>,
    sender: Option<mpsc::Sender<Job>>,
}

impl ThreadPool {
    /// Create a new ThreadPool with `size` worker threads.
    ///
    /// # Panics
    /// Panics if size is 0.
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

    /// Send a job to the thread pool for execution.
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
        // Drop the sender first — this closes the channel
        drop(self.sender.take());

        // Now wait for all workers to finish their current job and exit
        for worker in &mut self.workers {
            println!("Shutting down worker {}", worker.id);
            if let Some(thread) = worker.thread.take() {
                thread.join().unwrap();
            }
        }
    }
}
```

**The `Drop` implementation is crucial.** When the `ThreadPool` is dropped:
1. We drop the `Sender` — this closes the channel
2. All workers' `recv()` calls return `Err` — they break out of their loops
3. We `join()` each worker thread — waiting for them to finish cleanly

Without this, worker threads would be abandoned when the main thread exits.

### Step 4: Use It

```rust
use std::net::TcpListener;

fn main() {
    let listener = TcpListener::bind("127.0.0.1:7878").unwrap();
    let pool = ThreadPool::new(4); // 4 worker threads

    println!("Listening on http://127.0.0.1:7878 (4 workers)");

    for stream in listener.incoming() {
        let stream = stream.unwrap();

        pool.execute(|| {
            handle_connection(stream);
        });
    }
}
// ThreadPool::drop runs here — workers shut down cleanly
```

### Test It

```bash
# 4 slow requests with a pool of 4 — all finish in ~3 seconds
time curl http://localhost:7878/slow &
time curl http://localhost:7878/slow &
time curl http://localhost:7878/slow &
time curl http://localhost:7878/slow &
wait
# Expected: ~3 seconds

# 8 slow requests with a pool of 4 — first 4 run, next 4 queue
time curl http://localhost:7878/slow &
time curl http://localhost:7878/slow &
time curl http://localhost:7878/slow &
time curl http://localhost:7878/slow &
time curl http://localhost:7878/slow &
time curl http://localhost:7878/slow &
time curl http://localhost:7878/slow &
time curl http://localhost:7878/slow &
wait
# Expected: ~6 seconds (two batches of 4)
```

### The Complete Thread Pool Module

Put this in `src/pool.rs`:

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
        assert!(size > 0);

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

        Worker {
            id,
            thread: Some(thread),
        }
    }
}
```

> **AWS connection:** The thread pool you just built is essentially what's inside an EC2-backed ALB target. Nginx uses a similar model (though with event loops instead of threads). When you configure `worker_processes 4` in Nginx, you're setting the pool size. When you set `maxConcurrency` on a Lambda function, you're capping the pool of execution environments.

### Checkpoint — Stage 18

You have a working thread pool with:
- Fixed number of worker threads
- Job queue via `mpsc::channel`
- Shared receiver via `Arc<Mutex<>>`
- Clean shutdown via `Drop`

This is a real, production-quality pattern. The Rust Book's final project builds exactly this. Now let's add shared state.

---

## Stage 19 — Shared State

**Difficulty: Medium** · *`Arc<Mutex<>>` for shared data across handlers*

Your todo API from Act 2 stored todos in a `Vec` inside the handler. With multiple threads, each thread gets its own copy — changes in one thread are invisible to others. We need shared, mutable state.

### The Problem

```rust
// This doesn't work with threads:
let mut todos: Vec<Todo> = vec![];

pool.execute(|| {
    // Each closure captures its own copy? No — this won't even compile.
    // `todos` can't be moved into multiple closures.
    todos.push(new_todo);
});
```

You can't move `todos` into multiple closures — Rust's ownership system prevents it. And you can't borrow it — the closures need `'static` lifetime (they outlive the scope where `todos` was created).

### The Solution: `Arc<Mutex<T>>`

```rust
use std::sync::{Arc, Mutex};

// Shared state: Arc for shared ownership, Mutex for interior mutability
let db: Arc<Mutex<Vec<Todo>>> = Arc::new(Mutex::new(vec![]));
```

**`Arc`** (Atomic Reference Count) — like `Rc` but thread-safe. Multiple threads can own the same data. When the last `Arc` is dropped, the data is freed.

**`Mutex`** (Mutual Exclusion) — only one thread can access the inner data at a time. You call `.lock()` to get access, and the lock is released when the guard is dropped.

Together: `Arc` lets multiple threads *point to* the data. `Mutex` ensures only one thread *touches* it at a time.

### Wire It Into Your Server

```rust
use std::sync::{Arc, Mutex};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Todo {
    id: usize,
    title: String,
    completed: bool,
}

fn main() {
    let listener = TcpListener::bind("127.0.0.1:7878").unwrap();
    let pool = ThreadPool::new(4);

    // Shared state — lives on the heap, owned by all threads
    let db: Arc<Mutex<Vec<Todo>>> = Arc::new(Mutex::new(vec![]));
    let next_id: Arc<Mutex<usize>> = Arc::new(Mutex::new(1));

    println!("Listening on http://127.0.0.1:7878");

    for stream in listener.incoming() {
        let stream = stream.unwrap();

        // Clone the Arc — cheap! Just increments a reference count.
        let db = Arc::clone(&db);
        let next_id = Arc::clone(&next_id);

        pool.execute(move || {
            handle_connection(stream, &db, &next_id);
        });
    }
}
```

**Key insight:** `Arc::clone(&db)` doesn't clone the `Vec`. It clones the *pointer* and increments an atomic counter. It's essentially free. Each thread gets its own `Arc` that points to the same `Mutex<Vec<Todo>>`.

### Using the Shared State in Handlers

```rust
fn handle_todos_get(db: &Arc<Mutex<Vec<Todo>>>) -> Response {
    // Lock the mutex — blocks if another thread holds the lock
    let todos = db.lock().unwrap();
    // `todos` is a MutexGuard<Vec<Todo>> — it derefs to &Vec<Todo>

    let json = serde_json::to_string(&*todos).unwrap();
    Response::json(200, &json)
    // MutexGuard dropped here — lock released
}

fn handle_todos_post(body: &str, db: &Arc<Mutex<Vec<Todo>>>, next_id: &Arc<Mutex<usize>>) -> Response {
    #[derive(Deserialize)]
    struct CreateTodo {
        title: String,
    }

    let input: CreateTodo = match serde_json::from_str(body) {
        Ok(t) => t,
        Err(_) => return Response::new(400, "Invalid JSON"),
    };

    // Lock both mutexes — order matters! Always lock in the same order.
    let mut todos = db.lock().unwrap();
    let mut id = next_id.lock().unwrap();

    let todo = Todo {
        id: *id,
        title: input.title,
        completed: false,
    };
    *id += 1;

    todos.push(todo.clone());
    let json = serde_json::to_string(&todo).unwrap();
    Response::json(201, &json)
    // Both locks released here
}
```

### Test It

```bash
# Create todos from multiple concurrent requests
curl -X POST http://localhost:7878/todos -d '{"title":"Buy milk"}' &
curl -X POST http://localhost:7878/todos -d '{"title":"Write Rust"}' &
curl -X POST http://localhost:7878/todos -d '{"title":"Deploy to prod"}' &
wait

# All three should be visible
curl http://localhost:7878/todos | python3 -m json.tool
```

You should see all three todos with unique IDs, regardless of which thread handled which request.

### Common Mistake: Deadlocks

A deadlock happens when two threads each hold a lock the other needs:

```rust
// Thread 1:                    // Thread 2:
let a = db.lock();              let b = next_id.lock();
let b = next_id.lock(); // 💀   let a = db.lock(); // 💀
// Thread 1 waits for next_id   // Thread 2 waits for db
// Neither can proceed — DEADLOCK
```

**The fix:** Always acquire locks in the same order. If you always lock `db` before `next_id`, deadlocks can't happen. This is a convention you enforce by code review — the compiler can't catch it.

### Common Mistake: Holding Locks Too Long

```rust
// BAD — holds the lock during an expensive operation
let mut todos = db.lock().unwrap();
let result = expensive_computation(); // Other threads blocked!
todos.push(result);

// GOOD — lock only when you need it
let result = expensive_computation(); // No lock held
let mut todos = db.lock().unwrap();
todos.push(result);
// Lock released immediately
```

### Common Mistake: Mutex Poisoning

If a thread panics while holding a lock, the `Mutex` becomes "poisoned." Subsequent `.lock()` calls return `Err`. Using `.unwrap()` will propagate the panic. In production, you might want:

```rust
// Recover from a poisoned mutex
let mut todos = db.lock().unwrap_or_else(|poisoned| {
    eprintln!("Mutex was poisoned, recovering");
    poisoned.into_inner()
});
```

> **AWS connection:** DynamoDB avoids all of this. Each request is independent — no shared in-memory state. That's the appeal of stateless architectures. But sometimes you need in-memory caches (like ElastiCache/Redis), and then you're back to shared-state problems — just at a different layer.

### Checkpoint — Stage 19

Your server now has:
- Thread pool (4 workers)
- Shared todo store via `Arc<Mutex<Vec<Todo>>>`
- Thread-safe CRUD operations
- No deadlocks (because you lock in consistent order)

This is a fully functional concurrent web server. But threads have limits. Time to go async.

---

## Stage 20 — Tokio Awakens

**Difficulty: Hard** · *Rewrite the server with async/await*

Threads work, but they're heavy. Each OS thread costs ~8MB of stack and a context switch costs microseconds. For a server handling thousands of concurrent connections (think: WebSocket connections, long-polling, SSE streams), you want something lighter.

Enter async Rust. Instead of OS threads, you get *tasks* — lightweight state machines that yield at `.await` points. Tokio's runtime multiplexes thousands of tasks onto a small number of OS threads.

### How Async Works Under the Hood

When you write:

```rust
let data = stream.read(&mut buf).await;
```

The compiler transforms this into a state machine. At the `.await`, the task says "I'm waiting for I/O — wake me up when data arrives" and *yields* control back to the runtime. The runtime can then run other tasks on the same thread.

**No data arrives?** The task sleeps (costs nothing — it's just a struct on the heap).
**Data arrives?** The OS notifies the runtime (via `epoll` on Linux, `kqueue` on macOS), which wakes the task and resumes it right after the `.await`.

This is the same model as Node.js's event loop, but with two key differences:
1. **Rust is multi-threaded by default** — Tokio runs a thread pool of event loops (one per CPU core). Node.js is single-threaded unless you use worker threads.
2. **You must explicitly `.await`** — in Node.js, everything is async by default. In Rust, you choose. A function is only async if you mark it `async fn`.

### Add Tokio

```bash
cd ~/juk/forja/forja
cargo add tokio --features full
```

The `full` feature enables everything: async runtime, networking, timers, signals, I/O utilities. In production you'd pick only what you need, but for learning, `full` is fine.

Your `Cargo.toml` should now have:

```toml
[dependencies]
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

### The Sync Version (What We Have)

```rust
use std::io::{Read, Write};
use std::net::TcpListener;

fn main() {
    let listener = TcpListener::bind("127.0.0.1:7878").unwrap();

    for stream in listener.incoming() {
        let stream = stream.unwrap();
        handle_connection(stream);
    }
}

fn handle_connection(mut stream: std::net::TcpStream) {
    let mut buffer = [0; 1024];
    stream.read(&mut buffer).unwrap();

    let response = "HTTP/1.1 200 OK\r\n\r\nHello!";
    stream.write_all(response.as_bytes()).unwrap();
}
```

### The Async Version (What We're Building)

```rust
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

#[tokio::main]
async fn main() {
    let listener = TcpListener::bind("127.0.0.1:7878").await.unwrap();
    println!("Listening on http://127.0.0.1:7878");

    loop {
        let (stream, addr) = listener.accept().await.unwrap();
        println!("Connection from {addr}");

        tokio::spawn(async move {
            handle_connection(stream).await;
        });
    }
}

async fn handle_connection(mut stream: tokio::net::TcpStream) {
    let mut buffer = [0; 1024];
    stream.read(&mut buffer).await.unwrap();

    let response = "HTTP/1.1 200 OK\r\n\r\nHello from async!";
    stream.write_all(response.as_bytes()).await.unwrap();
}
```

### Every Change, Explained

Let's go through each transformation:

**1. `#[tokio::main]` macro**

```rust
// Before:
fn main() {

// After:
#[tokio::main]
async fn main() {
```

This macro creates a Tokio runtime and blocks on your async main function. It expands to roughly:

```rust
fn main() {
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(async {
            // your async main body here
        })
}
```

By default, Tokio creates one worker thread per CPU core.

**2. `std::net::TcpListener` → `tokio::net::TcpListener`**

```rust
// Before (blocking):
let listener = TcpListener::bind("127.0.0.1:7878").unwrap();

// After (async):
let listener = TcpListener::bind("127.0.0.1:7878").await.unwrap();
```

`tokio::net::TcpListener::bind()` returns a `Future`. The `.await` suspends until the bind completes. Same API, just async.

**3. `for stream in listener.incoming()` → `loop { listener.accept().await }`**

```rust
// Before:
for stream in listener.incoming() {
    let stream = stream.unwrap();

// After:
loop {
    let (stream, addr) = listener.accept().await.unwrap();
```

`listener.accept().await` suspends the task until a new connection arrives. While waiting, the runtime can run other tasks. The sync version blocks the entire thread.

**4. `thread::spawn` → `tokio::spawn`**

```rust
// Before:
thread::spawn(|| {
    handle_connection(stream);
});

// After:
tokio::spawn(async move {
    handle_connection(stream).await;
});
```

`tokio::spawn` creates an async task (not an OS thread). The signature is:

```rust
pub fn spawn<F>(future: F) -> JoinHandle<F::Output>
where
    F: Future + Send + 'static,
    F::Output: Send + 'static,
```

The future must be `Send` (can be moved between threads) and `'static` (no borrowed references). Same constraints as `thread::spawn`, but for futures instead of closures.

**5. `stream.read()` → `stream.read().await`**

```rust
// Before:
stream.read(&mut buffer).unwrap();

// After:
stream.read(&mut buffer).await.unwrap();
```

`AsyncReadExt::read` returns a future. The `.await` suspends until data is available. While this task waits for network data, other tasks can run.

**6. `stream.write_all()` → `stream.write_all().await`**

```rust
// Before:
stream.write_all(response.as_bytes()).unwrap();

// After:
stream.write_all(response.as_bytes()).await.unwrap();
```

Same pattern. `AsyncWriteExt::write_all` is the async version of `Write::write_all`.

### The Slow Endpoint — Async Edition

```rust
// WRONG — this blocks the runtime thread!
async fn handle_slow(mut stream: tokio::net::TcpStream) {
    std::thread::sleep(std::time::Duration::from_secs(3)); // blocks!
    let response = "HTTP/1.1 200 OK\r\n\r\nSlow response";
    stream.write_all(response.as_bytes()).await.unwrap();
}

// RIGHT — yields to the runtime while sleeping
async fn handle_slow(mut stream: tokio::net::TcpStream) {
    tokio::time::sleep(std::time::Duration::from_secs(3)).await; // yields!
    let response = "HTTP/1.1 200 OK\r\n\r\nSlow response";
    stream.write_all(response.as_bytes()).await.unwrap();
}
```

**Critical rule:** Never use blocking operations (`std::thread::sleep`, blocking file I/O, CPU-heavy computation) inside an async task. It blocks the runtime thread, starving other tasks. Use `tokio::time::sleep`, `tokio::fs`, or `tokio::task::spawn_blocking` for CPU work.

> **Node.js comparison:** This is exactly like blocking the event loop in Node.js. If you do `while(true){}` in a Node.js handler, every other request hangs. Same thing in Tokio — `std::thread::sleep` is the Rust equivalent of blocking the event loop.

### Test It

```bash
# Concurrent slow requests — all complete in ~3 seconds
time curl http://localhost:7878/slow &
time curl http://localhost:7878/slow &
time curl http://localhost:7878/slow &
time curl http://localhost:7878/slow &
wait
# Expected: ~3 seconds (not 12!)
```

### Common Mistake: "future is not `Send`"

```rust
// This won't compile:
tokio::spawn(async {
    let rc = std::rc::Rc::new(42); // Rc is not Send!
    tokio::time::sleep(Duration::from_secs(1)).await;
    println!("{}", rc);
});
```

Error: `` `Rc<i32>` cannot be sent between threads safely ``

`tokio::spawn` requires `Send` because Tokio might move the task to a different thread at any `.await` point. `Rc` is not thread-safe — use `Arc` instead.

**The rule:** Anything held across an `.await` must be `Send`. If it's only used between `.await` points (created and dropped without an `.await` in between), it doesn't need to be `Send`.

### Checkpoint — Stage 20

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
    let n = stream.read(&mut buffer).await.unwrap();

    let request = String::from_utf8_lossy(&buffer[..n]);
    println!("Request: {}", request.lines().next().unwrap_or(""));

    let response = "HTTP/1.1 200 OK\r\nContent-Length: 14\r\n\r\nHello, async!\n";
    stream.write_all(response.as_bytes()).await.unwrap();
}
```

Your server is now async. No thread pool to manage, no `Arc<Mutex<>>` on the receiver. Tokio handles the scheduling. Next: make the handlers themselves async.

---

## Stage 21 — Async Handlers

**Difficulty: Medium** · *Async route handlers with shared state*

In Stage 20, `handle_connection` is one big async function. Now let's bring back the router pattern from Act 2, but with async handlers and shared state.

### The Goal

```rust
// Handlers become async functions
async fn get_todos(db: Arc<Mutex<Vec<Todo>>>) -> Response { ... }
async fn create_todo(body: String, db: Arc<Mutex<Vec<Todo>>>) -> Response { ... }
```

### Challenge: Async Function Traits

In sync Rust, your router stored handlers as `Box<dyn Fn(Request) -> Response>`. In async Rust, this gets harder because async functions return futures, and those futures have different types.

Here's the approach — store handlers as boxed async closures:

```rust
use std::future::Future;
use std::pin::Pin;

// An async handler returns a pinned, boxed future
type BoxFuture<T> = Pin<Box<dyn Future<Output = T> + Send>>;
type AsyncHandler = Box<dyn Fn(Request) -> BoxFuture<Response> + Send + Sync>;
```

**Why `Pin<Box<...>>`?** Futures in Rust can be self-referential (they hold references to their own data). `Pin` prevents them from being moved in memory, which would invalidate those references. `Box` puts the future on the heap so it has a stable address.

### Your Task: Build the Async Router

Here's the skeleton — fill in the implementation:

```rust
use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

type BoxFuture<T> = Pin<Box<dyn Future<Output = T> + Send>>;

struct AsyncRouter {
    routes: HashMap<(String, String), Arc<dyn Fn(Request) -> BoxFuture<Response> + Send + Sync>>,
}

impl AsyncRouter {
    fn new() -> Self {
        AsyncRouter {
            routes: HashMap::new(),
        }
    }

    /// Register a GET handler
    fn get<F, Fut>(&mut self, path: &str, handler: F)
    where
        F: Fn(Request) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Response> + Send + 'static,
    {
        // Hint: wrap the handler in a closure that boxes the future
        // self.routes.insert(
        //     ("GET".to_string(), path.to_string()),
        //     Arc::new(move |req| Box::pin(handler(req))),
        // );
        todo!("Register the handler — wrap it to return BoxFuture")
    }

    /// Route a request to the matching handler
    async fn route(&self, req: Request) -> Response {
        let key = (req.method.clone(), req.path.clone());
        match self.routes.get(&key) {
            Some(handler) => handler(req).await,
            None => Response::new(404, "Not Found"),
        }
    }
}
```

**Hints:**
1. The `get` method needs to wrap the user's handler in a closure that returns `BoxFuture`. Use `Box::pin(handler(req))` to convert the concrete future into a boxed one.
2. For shared state, pass `Arc<Mutex<Vec<Todo>>>` into handlers by cloning the `Arc` before each call.
3. The main loop should look like:

```rust
#[tokio::main]
async fn main() {
    let db: Arc<Mutex<Vec<Todo>>> = Arc::new(Mutex::new(vec![]));
    let router = Arc::new(build_router(db.clone()));

    let listener = TcpListener::bind("127.0.0.1:7878").await.unwrap();

    loop {
        let (stream, _) = listener.accept().await.unwrap();
        let router = Arc::clone(&router);

        tokio::spawn(async move {
            // Parse the request from the stream
            // let response = router.route(request).await;
            // Write the response back to the stream
            todo!("Parse request, route it, write response")
        });
    }
}
```

### Shared State in Async — Same Pattern, Easier

Good news: `Arc<Mutex<>>` works the same in async as in sync. The only difference is you must not hold the `MutexGuard` across an `.await`:

```rust
// BAD — MutexGuard held across .await
async fn bad_handler(db: Arc<Mutex<Vec<Todo>>>) -> Response {
    let todos = db.lock().unwrap(); // lock acquired
    tokio::time::sleep(Duration::from_secs(1)).await; // .await while locked!
    // Other tasks can't access db for a full second
    Response::json(200, &serde_json::to_string(&*todos).unwrap())
}

// GOOD — lock and release before .await
async fn good_handler(db: Arc<Mutex<Vec<Todo>>>) -> Response {
    let json = {
        let todos = db.lock().unwrap();
        serde_json::to_string(&*todos).unwrap()
        // lock released here (end of block)
    };
    Response::json(200, &json)
}
```

If you need to hold a lock across `.await` points, use `tokio::sync::Mutex` instead of `std::sync::Mutex`. Tokio's mutex is async-aware — it yields instead of blocking the thread. But it's slower for short critical sections, so prefer `std::sync::Mutex` when you can release before `.await`.

### Common Mistake: Async Lifetime Issues

```rust
// This won't compile:
async fn handler(data: &str) -> Response {
    Response::new(200, data)
}

// tokio::spawn requires 'static — no borrowed references
tokio::spawn(async {
    handler(&some_string).await; // `some_string` might be dropped!
});
```

**Fix:** Move owned data into the task:

```rust
let owned_string = some_string.clone();
tokio::spawn(async move {
    handler(&owned_string).await; // owned_string lives inside the task
});
```

### Test It

```bash
# Create todos concurrently
for i in $(seq 1 10); do
    curl -s -X POST http://localhost:7878/todos \
        -d "{\"title\":\"Todo $i\"}" &
done
wait

# Verify all 10 exist
curl -s http://localhost:7878/todos | python3 -m json.tool | head -30
```

### Checkpoint — Stage 21

You should have:
- An `AsyncRouter` that stores async handlers
- Shared state via `Arc<Mutex<>>` passed to handlers
- `tokio::spawn` per connection with the router behind an `Arc`
- No locks held across `.await` points

One more stage: shutting down cleanly.

---

## Stage 22 — Graceful Shutdown

**Difficulty: Medium** · *Ctrl+C handling, drain connections, clean exit*

Right now, Ctrl+C kills your server instantly. In-flight requests get dropped mid-response. Database writes might be half-complete. In production, you want graceful shutdown: stop accepting new connections, let in-flight requests finish, then exit.

### The Plan

1. Listen for Ctrl+C (SIGINT) using `tokio::signal::ctrl_c()`
2. Stop accepting new connections
3. Wait for in-flight tasks to complete (with a timeout)
4. Exit cleanly

### The Key Tool: `tokio::select!`

`tokio::select!` waits on multiple async operations and returns when the **first** one completes, cancelling the rest:

```rust
tokio::select! {
    result = listener.accept() => {
        // New connection arrived
    }
    _ = tokio::signal::ctrl_c() => {
        // Ctrl+C pressed
    }
}
```

`tokio::signal::ctrl_c()` returns a future that completes when the process receives SIGINT. Its signature (from docs.rs, tokio 1.52.1):

```rust
pub async fn ctrl_c() -> Result<()>
```

### Your Task: Implement Graceful Shutdown

Here's the skeleton with hints:

```rust
use tokio::net::TcpListener;
use tokio::signal;
use tokio::sync::watch;
use std::sync::Arc;
use std::time::Duration;

#[tokio::main]
async fn main() {
    let listener = TcpListener::bind("127.0.0.1:7878").await.unwrap();
    println!("Listening on http://127.0.0.1:7878");

    // Shutdown signal — a watch channel that starts as `false`
    // When we set it to `true`, all tasks know it's time to wrap up.
    let (shutdown_tx, shutdown_rx) = watch::channel(false);

    // Track in-flight connections
    let active_connections = Arc::new(std::sync::atomic::AtomicUsize::new(0));

    loop {
        tokio::select! {
            // Branch 1: Accept new connections
            result = listener.accept() => {
                let (stream, addr) = result.unwrap();
                println!("Connection from {addr}");

                let active = Arc::clone(&active_connections);
                active.fetch_add(1, std::sync::atomic::Ordering::Relaxed);

                let mut shutdown = shutdown_rx.clone();

                tokio::spawn(async move {
                    // Handle the connection...
                    // Hint: you can use select! here too, to abort
                    // if shutdown is signaled mid-request

                    handle_connection(stream).await;

                    active.fetch_sub(1, std::sync::atomic::Ordering::Relaxed);
                    println!("Connection from {addr} closed");
                });
            }

            // Branch 2: Ctrl+C received
            _ = signal::ctrl_c() => {
                println!("\nShutdown signal received. Draining connections...");

                // Signal all tasks that we're shutting down
                let _ = shutdown_tx.send(true);

                // Wait for in-flight connections to finish (with timeout)
                let drain_timeout = Duration::from_secs(10);
                let start = std::time::Instant::now();

                while active_connections.load(std::sync::atomic::Ordering::Relaxed) > 0 {
                    if start.elapsed() > drain_timeout {
                        let remaining = active_connections
                            .load(std::sync::atomic::Ordering::Relaxed);
                        eprintln!(
                            "Timeout! Force-closing {remaining} connections."
                        );
                        break;
                    }
                    tokio::time::sleep(Duration::from_millis(100)).await;
                }

                println!("Shutdown complete.");
                break; // Exit the accept loop
            }
        }
    }
}
```

**How `tokio::select!` works here:**
- Both branches run concurrently on the same task
- If a new connection arrives first, we handle it and loop back
- If Ctrl+C arrives first, we enter the shutdown sequence
- `listener.accept()` is cancel-safe (per Tokio docs) — cancelling it doesn't lose connections

### Hints for the Connection Handler

Inside each spawned task, you can also watch for shutdown:

```rust
tokio::spawn(async move {
    tokio::select! {
        _ = handle_connection(stream) => {
            // Request completed normally
        }
        _ = shutdown.changed() => {
            // Shutdown signaled — you could:
            // 1. Let the current request finish (do nothing extra)
            // 2. Send a "503 Service Unavailable" for new requests
            // 3. Close the connection after a grace period
            println!("Shutdown signaled, finishing up...");
        }
    }
    active.fetch_sub(1, std::sync::atomic::Ordering::Relaxed);
});
```

### Test It

```bash
# Start the server
cargo run

# In another terminal, start a slow request
curl http://localhost:7878/slow &

# Immediately press Ctrl+C in the server terminal
# Expected: server waits for the slow request to finish, then exits
```

```bash
# Test the timeout: start many slow requests, then Ctrl+C
for i in $(seq 1 20); do
    curl -s http://localhost:7878/slow &
done
# Press Ctrl+C — server should drain for 10 seconds, then force-close
```

### The Production Pattern

Real servers (like Axum, Actix-web, Hyper) use this exact pattern:

```rust
// This is essentially what axum::serve does:
let server = axum::serve(listener, app)
    .with_graceful_shutdown(async {
        signal::ctrl_c().await.unwrap();
    });
server.await.unwrap();
```

You just built the mechanism that production frameworks provide out of the box.

> **AWS connection:** Graceful shutdown is critical for ECS tasks and Lambda extensions. When ECS sends SIGTERM before stopping a task, your server needs to drain connections — exactly what you just built. Lambda extensions use the same pattern: the runtime sends a shutdown event, and your extension has a few seconds to flush logs and close connections.

### Common Mistake: Forgetting Cancel Safety

Not all async operations are cancel-safe. If `select!` cancels a branch, any work done by that branch's future is lost. From the Tokio docs:

**Cancel-safe** (safe to use in `select!`):
- `TcpListener::accept()`
- `mpsc::Receiver::recv()`
- `AsyncReadExt::read()`

**Not cancel-safe** (data can be lost):
- `AsyncReadExt::read_exact()` — partial reads are lost
- `AsyncReadExt::read_to_end()` — accumulated data is lost
- `AsyncWriteExt::write_all()` — partial writes are lost

If you're reading a request body with `read_to_end` inside a `select!`, and the other branch fires, you lose the partially-read body. Use cancel-safe alternatives or restructure your code.

### Checkpoint — Stage 22

Your server now:
- Catches Ctrl+C via `tokio::signal::ctrl_c()`
- Stops accepting new connections
- Waits for in-flight requests to complete (up to 10 seconds)
- Force-closes remaining connections after timeout
- Exits cleanly

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

### The Concurrency Mental Model

```
                    ┌─────────────────────────────────────────┐
                    │           Your Concurrency Toolbox       │
                    ├─────────────────────────────────────────┤
                    │                                         │
                    │  std::thread    Tokio async    Both     │
                    │  ───────────    ───────────    ────     │
                    │  OS threads     Green tasks    Tokio's  │
                    │  ~8MB each      ~few KB each   runtime  │
                    │  True parallel  Cooperative    runs     │
                    │  OS schedules   Runtime        tasks on │
                    │  Heavy context  schedules      a thread │
                    │  switching      Cheap yield    pool     │
                    │                                         │
                    │  Good for:      Good for:              │
                    │  CPU-bound      I/O-bound              │
                    │  work           work (web              │
                    │  (< 100 tasks)  servers, DBs)          │
                    │                 (1000s of tasks)       │
                    └─────────────────────────────────────────┘
```

### What's Next

In Act 4, you'll add the features that turn this into a real framework:
- Error handling with custom error types
- Middleware chains (auth, CORS, rate limiting)
- Structured logging with `tracing`
- Configuration management
- Testing your async server

You've gone from "what's a TCP socket?" to a concurrent async web server. The thread pool you built is inside Nginx. The async pattern you wrote is inside Axum. The graceful shutdown is inside every ECS task. You didn't just learn Rust — you learned how the internet works.

> *"Any sufficiently advanced Rust program is indistinguishable from a production web framework."*
