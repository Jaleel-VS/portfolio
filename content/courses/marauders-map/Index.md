# The Marauder's Map — A Rust Course

> *"I solemnly swear that I am up to no good."*

Build a real-time terminal Hogwarts explorer from scratch in Rust. Learn pathfinding algorithms (BFS, Dijkstra, A*) through NPC AI. No Rust experience required — just Python/TypeScript and curiosity.

**Project:** `~/juk/marauders-map/`
**Starter map:** `maps/ground_floor.json`

---

## Course Map

| # | Stage | Act | Difficulty | Est. Time |
|---|-------|-----|-----------|-----------|
| 1 | Hello Hogwarts | [[Act 1 - The Grid]] | ⚡ Very Easy | 15 min |
| 2 | The Tile | [[Act 1 - The Grid]] | 🟢 Easy | 20 min |
| 3 | The Grid | [[Act 1 - The Grid]] | 🟢 Easy | 25 min |
| 4 | The Floor | [[Act 1 - The Grid]] | 🟢 Easy | 25 min |
| 5 | Enter ratatui | [[Act 1 - The Grid]] | 🟡 Medium | 40 min |
| 6 | The Viewport | [[Act 1 - The Grid]] | 🟡 Medium | 35 min |
| 7 | Map from JSON | [[Act 1 - The Grid]] | 🟡 Medium | 35 min |
| 8 | Multiple Floors | [[Act 1 - The Grid]] | 🟡 Medium | 35 min |
| 9 | The Player | [[Act 2 - Movement and Collision]] | 🟢 Easy | 20 min |
| 10 | Arrow Keys | [[Act 2 - Movement and Collision]] | 🟡 Medium | 40 min |
| 11 | Wall Collision | [[Act 2 - Movement and Collision]] | 🟢 Easy | 20 min |
| 12 | Rooms & Labels | [[Act 2 - Movement and Collision]] | 🟡 Medium | 30 min |
| 13 | Stairs & Floor Transitions | [[Act 2 - Movement and Collision]] | 🟡 Medium | 35 min |
| 14 | The Status Bar | [[Act 2 - Movement and Collision]] | 🟢 Easy | 25 min |
| 15 | The Graph | [[Act 3 - The Algorithms]] | 🟡 Medium | 30 min |
| 16 | BFS | [[Act 3 - The Algorithms]] | 🔴 Hard | 60 min |
| 17 | BFS Visualization | [[Act 3 - The Algorithms]] | 🟡 Medium | 35 min |
| 18 | Dijkstra | [[Act 3 - The Algorithms]] | 🔴 Hard | 60 min |
| 19 | Dijkstra vs BFS | [[Act 3 - The Algorithms]] | 🟡 Medium | 30 min |
| 20 | A* | [[Act 3 - The Algorithms]] | 🔴 Hard | 60 min |
| 21 | A* Visualization | [[Act 3 - The Algorithms]] | 🟡 Medium | 35 min |
| 22 | The Algorithm Showdown | [[Act 3 - The Algorithms]] | 🟡 Medium | 40 min |
| 23 | The NPC Struct | [[Act 4 - NPCs Come Alive]] | 🟢 Easy | 20 min |
| 24 | Patrol Routes | [[Act 4 - NPCs Come Alive]] | 🟡 Medium | 35 min |
| 25 | The Schedule | [[Act 4 - NPCs Come Alive]] | 🟡 Medium | 35 min |
| 26 | Detection | [[Act 4 - NPCs Come Alive]] | 🟡 Medium | 40 min |
| 27 | Alert & Chase | [[Act 4 - NPCs Come Alive]] | 🔴 Hard | 50 min |
| 28 | Mrs. Norris | [[Act 4 - NPCs Come Alive]] | 🟡 Medium | 35 min |
| 29 | Ghosts & Peeves | [[Act 4 - NPCs Come Alive]] | 🟢 Easy | 25 min |
| 30 | Getting Caught | [[Act 4 - NPCs Come Alive]] | 🟡 Medium | 35 min |
| 31 | Secret Passages | [[Act 5 - Secrets and Polish]] | 🟡 Medium | 35 min |
| 32 | Items | [[Act 5 - Secrets and Polish]] | 🟡 Medium | 40 min |
| 33 | Missions | [[Act 5 - Secrets and Polish]] | 🟡 Medium | 35 min |
| 34 | Save & Load | [[Act 5 - Secrets and Polish]] | 🟢 Easy | 25 min |
| 35 | Sound & Polish | [[Act 5 - Secrets and Polish]] | 🟢 Easy | 20 min |
| 36 | Custom Maps | [[Act 5 - Secrets and Polish]] | 🟡 Medium | 30 min |

**Total estimated time: ~20 hours**

---

## Acts

### Act 1: The Grid — "I Solemnly Swear" (Stages 1-8)
Build the map data structures and basic rendering. You'll learn enums, structs, Vec, serde, and get ratatui rendering a real TUI.
→ [[Act 1 - The Grid]]

### Act 2: Movement & Collision — "Up to No Good" (Stages 9-14)
The player moves through Hogwarts. Game loop, key events, collision detection, floor transitions.
→ [[Act 2 - Movement and Collision]]

### Act 3: The Algorithms — "The Educational Core" (Stages 15-22)
Implement BFS, Dijkstra, and A* from scratch. Visualize them running. Understand when to use which.
→ [[Act 3 - The Algorithms]]

### Act 4: NPCs Come Alive — "Mischief Managed" (Stages 23-30)
NPCs move autonomously. Filch chases with A*, Mrs. Norris scouts with BFS, Snape patrols with Dijkstra.
→ [[Act 4 - NPCs Come Alive]]

### Act 5: Secrets & Polish — "The Map Never Lies" (Stages 31-36)
Secret passages, items, missions, save/load, and custom map support.
→ [[Act 5 - Secrets and Polish]]

### Reference
Rust cheat sheet, algorithm comparison tables, ratatui/crossterm quick reference.
→ [[Reference Guide]]

---

## Tech Stack

| Crate | Version | Purpose |
|-------|---------|---------|
| ratatui | 0.30 | TUI framework |
| crossterm | 0.29 | Terminal backend |
| tokio | 1 | Async runtime |
| serde | 1.0 | Serialization |
| serde_json | 1.0 | JSON parsing |
| rand | 0.9 | NPC randomness |

---

## Rust Concepts by Stage

| Concept | First Introduced |
|---------|-----------------|
| Enums & match | Stage 2 |
| Vec & iteration | Stage 3 |
| Structs & impl | Stage 4 |
| External crates | Stage 5 |
| Borrowing & references | Stage 6 |
| Serde & JSON | Stage 7 |
| Ownership & moves | Stage 9 |
| Mutable references | Stage 10 |
| Option & pattern matching | Stage 11 |
| Closures | Stage 12 |
| VecDeque | Stage 16 |
| BinaryHeap & Ord | Stage 18 |
| Generics | Stage 20 |
| State machines | Stage 23 |
| Trait objects vs enums | Stage 29 |
| File I/O & error handling | Stage 34 |

> *"Mischief managed."*
