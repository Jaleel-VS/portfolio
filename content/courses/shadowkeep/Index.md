# Rust Shadowkeep Course

> *Build a multiplayer horror text adventure server from scratch — learn Rust, networking, and async programming by building a MUD.*

**Project:** `~/juk/shadowkeep/` (Rust 2024 edition)
**Play:** `nc localhost 7878` after Stage 10

---

## Course Files

| File | Stages | Focus |
|------|--------|-------|
| [[Act 1 - The Foundation]] | 1–10 | Rust basics → first TCP server |
| [[Act 2 - The Network]] | 11–18 | Threads, shared state, multiplayer |
| [[Act 3 - The Async Realm]] | 19–24 | Tokio, channels, async I/O |
| [[Act 4 - The Deep]] | 25–30 | Combat, scripting, deployment |
| [[Reference Guide]] | — | Cheat sheet, error decoder, glossary |

---

## Full Stage List

### Act 1 — The Foundation: "Entering the Castle"

| # | Stage | Concept | Difficulty | Time |
|---|-------|---------|------------|------|
| 1 | Hello Shadowkeep | cargo new, println! | Very Easy | <5 min |
| 2 | The Map | Variables, strings, mutability | Very Easy | <5 min |
| 3 | Rooms and Doors | Structs, String vs &str | Easy | 5–10 min |
| 4 | The Hallway | Vec, iteration | Easy | 5–10 min |
| 5 | Choose Your Path | Enums, match, stdin | Easy | 5–10 min |
| 6 | The Inventory | Ownership and borrowing | Medium | 30–60 min |
| 7 | Creatures in the Dark | Traits, dynamic dispatch | Medium | 30–60 min |
| 8 | The Locked Door | Result, Option, ? operator | Easy | 5–10 min |
| 9 | The Journal | serde, file I/O, JSON | Medium | 30–60 min |
| 10 | Echoes in the Hall | TcpListener, sockets, ports | Medium | 30–60 min |

### Act 2 — The Network: "Others Are Here"

| # | Stage | Concept | Difficulty | Time |
|---|-------|---------|------------|------|
| 11 | A Second Voice | thread::spawn, move closures | Medium | 30–60 min |
| 12 | The Shared World | Arc\<Mutex\<T\>\> | Medium | 30–60 min |
| 13 | Whispers | Broadcasting to all players | Medium | 30–60 min |
| 14 | Who Goes There | Login flow, player tracking | Easy | 5–10 min |
| 15 | The Chat | Room-scoped messaging | Medium | 30–60 min |
| 16 | Moving Together | Movement broadcasts | Medium | 30–60 min |
| 17 | The Command Parser | Parsing input into enums | Medium | 30–60 min |
| 18 | The Game Loop | Tick-based loop, timed events | Hard | >1 hr |

### Act 3 — The Async Realm: "The Castle Shifts"

| # | Stage | Concept | Difficulty | Time |
|---|-------|---------|------------|------|
| 19 | Tokio Awakens | async/await migration | Hard | >1 hr |
| 20 | Select Your Fate | tokio::select! | Medium | 30–60 min |
| 21 | Channels of the Dead | mpsc channels | Medium | 30–60 min |
| 22 | The Broadcast | tokio::broadcast | Medium | 30–60 min |
| 23 | Graceful Shutdown | Signal handling, clean exit | Medium | 30–60 min |
| 24 | The Heartbeat | Keepalive, timeouts | Medium | 30–60 min |

### Act 4 — The Deep: "Escape or Perish"

| # | Stage | Concept | Difficulty | Time |
|---|-------|---------|------------|------|
| 25 | The Combat System | Turn-based combat, state machines | Hard | >1 hr |
| 26 | Room Scripts | YAML DSL, serde tagged enums | Hard | >1 hr |
| 27 | The Leaderboard | chrono, persistent rankings | Medium | 30–60 min |
| 28 | ANSI Colors | crossterm, terminal styling | Easy | 5–10 min |
| 29 | The Protocol | Binary framing, length-prefixed messages | Hard | >1 hr |
| 30 | Release Day | Cross-compile, EC2 deploy, systemd | Hard | >1 hr |

---

## Time Estimate

| Difficulty | Stages | Est. Total |
|------------|--------|------------|
| Very Easy | 2 | ~10 min |
| Easy | 5 | ~40 min |
| Medium | 16 | ~12 hrs |
| Hard | 7 | ~10 hrs |
| **Total** | **30** | **~23 hrs** |

---

## Dependencies (uncomment in Cargo.toml as you progress)

| Stage | Crate | Purpose |
|-------|-------|---------|
| 9 | serde, serde_json | JSON serialization |
| 19 | tokio | Async runtime |
| 27 | chrono | Timestamps |
| 28 | crossterm | ANSI terminal colors |
| 29 | bincode | Binary serialization |

---

## Quick Start

```bash
cd ~/juk/shadowkeep
cargo run
# In another terminal:
nc localhost 7878
```
