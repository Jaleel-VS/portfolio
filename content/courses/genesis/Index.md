# Génesis — Evolve Virtual Creatures in Rust

> *A blob of connected segments sits on the ground. It twitches. It flops. It goes nowhere. Fifty generations later, its descendant gallops across the screen. You didn't program the gallop — evolution found it. From random shapes and random muscle patterns, natural selection discovered locomotion.*

Inspired by Karl Sims' 1994 paper "Evolved Virtual Creatures" — one of the most beautiful experiments in artificial life. You build a 2D physics simulation where creatures are graphs of body segments connected by bones and muscles. A genetic algorithm evolves their body shape and muscle timing until they learn to walk, crawl, hop, or invent movements you never imagined.

**Project:** `~/juk/genesis/` (Rust 2024 edition)

**Prerequisites:** Python experience. No Rust, physics, or AI knowledge required. Every concept is introduced when you first need it.

**What makes this different from Piloto:** Piloto evolved a fixed brain (neural network weights) for a fixed body (car). Génesis evolves the *body itself* — the number of segments, where they connect, which joints are muscles, and how those muscles contract. The creature's morphology and behavior co-evolve.

> [!warning] This is a learning project
> The physics simulation and genetic algorithm are simplified for teaching. For real-world evolutionary robotics, use established frameworks like [DEAP](https://github.com/DEAP/deap) (Python) or [evosax](https://github.com/RobertTLange/evosax) (JAX). Rolling your own evolutionary algorithm for production use requires careful benchmarking and validation.

---

## Design Decisions

### Why Verlet integration?

Traditional physics uses velocity: `pos += velocity * dt`. Verlet integration uses position history: `new_pos = pos + (pos - old_pos)`. No velocity variable at all. Why?

- **Stability** — Verlet handles constraints (rigid bones, joints) gracefully. Velocity-based physics explodes when constraints fight each other.
- **Simplicity** — the core update is one line. Constraints are solved by moving points directly.
- **Perfect for creatures** — connected segments with distance constraints are exactly what Verlet was designed for.

### Why no neural network?

Piloto used a neural network to map sensors to controls. Creatures don't need that — their "brain" is much simpler: each muscle oscillates on a sine wave with an evolved frequency, amplitude, and phase. The creature's behavior emerges from the interaction of multiple oscillating muscles with physics. This is closer to how simple organisms actually move (central pattern generators).

### Creature representation

A creature is a **genome** that encodes:
- **Nodes** — body segments with position and mass
- **Bones** — rigid connections between nodes (fixed length)
- **Muscles** — connections that oscillate (expand and contract rhythmically)
- **Muscle parameters** — frequency, amplitude, phase offset per muscle

The genome is a flat `Vec<f32>` — easy to crossover and mutate.

### Fitness

Fitness = horizontal distance traveled in 10 seconds. Simple, unambiguous, and directly rewards locomotion. Creatures that flop in place score 0. Creatures that move right score high.

### Tone

Wonder and awe. You're watching life emerge from nothing. The tone is curious, patient, and occasionally amazed — like watching a nature documentary about creatures that don't exist yet.

---

## Course Map

### [[Act 1 - The Primordial Soup]] — Physics Foundation (Stages 1-7)

Build the physics engine: points, constraints, Verlet integration, ground collision. By the end, you can drop a ragdoll-like structure and watch it flop realistically.

| # | Stage | Concept | Difficulty | ~Time |
|---|---|---|---|---|
| 1 | The Void | macroquad setup, a single point falling under gravity | Very Easy | 25 min |
| 2 | Verlet Integration | Position-based physics, `Point` struct, module system | Easy | 50 min |
| 3 | The Ground | Floor collision, bounce, friction | Easy | 40 min |
| 4 | The Bone | Distance constraint, index-based references, borrow checker | Medium | 60 min |
| 5 | Constraint Solving | Iterative relaxation, `Simulation` struct | Medium | 50 min |
| 6 | The Body | Multiple nodes + bones = a connected structure | Medium | 60 min |
| 7 | The Muscle | Oscillating constraints, sine waves, `#[test]` introduction | Medium | 60 min |

### [[Act 2 - The Creature]] — Morphology and Genome (Stages 8-13)

Define what a creature *is*: a genome that encodes body shape and muscle parameters. Build the creature struct, random generation, and the simulation loop that runs a creature for 10 seconds and measures fitness.

| # | Stage | Concept | Difficulty | ~Time |
|---|---|---|---|---|
| 8 | The Genome | Flat `Vec<f32>` encoding, `#[derive]`, `Result` and error handling | Medium | 60 min |
| 9 | Decoding a Creature | Genome → nodes + bones + muscles, `?` operator | Medium | 70 min |
| 10 | Random Creatures | Generate random genomes, `filter_map`, see what shapes emerge | Easy | 40 min |
| 11 | The Simulation | Run a creature for 10 seconds, measure distance, headless eval | Medium | 60 min |
| 12 | 20 Creatures at Once | Population, fitness coloring, `partial_cmp` for float sorting | Medium | 50 min |
| 13 | The Camera | Side-scrolling camera, smooth follow, zoom controls | Easy | 35 min |

### [[Act 3 - The Evolution]] — Genetic Algorithm (Stages 14-20)

The same evolutionary loop as Piloto — but now it's evolving body shapes, not neural network weights. Watch blobs become walkers.

| # | Stage | Concept | Difficulty | ~Time |
|---|---|---|---|---|
| 14 | Fitness Evaluation | Batch evaluation, fitness distribution, turbofish `::<f32>` | Easy | 40 min |
| 15 | Selection and Crossover | Roulette wheel selection, uniform crossover | Medium | 50 min |
| 16 | Mutation | Parameter-specific mutation, `iter_mut()`, clamping | Medium | 50 min |
| 17 | Structural Mutation | Add/remove nodes, variable-length genomes, updated decoder | Hard | 75 min |
| 18 | The Generation Loop | Select → crossover → mutate → simulate → repeat | Medium | 50 min |
| 19 | Elitism and Diversity | Preserve best, protect novel body plans, iterator chains | Medium | 50 min |
| 20 | The First Walker | Hyperparameter tuning, anti-flip penalty, the moment of emergence | Hard | 75 min |

### [[Act 4 - The Ecosystem]] — Visualization and Experiments (Stages 21-25)

Polish the simulation: beautiful rendering, creature replay, different environments, and the hall of fame.

| # | Stage | Concept | Difficulty | ~Time |
|---|---|---|---|---|
| 21 | Beautiful Creatures | Colored segments, muscle contraction glow, motion trails | Medium | 50 min |
| 22 | Replay Mode | Save/load with serde, JSON persistence, `.map_err()` | Easy | 45 min |
| 23 | Different Terrains | Enums with data, `match` exhaustiveness, terrain height functions | Medium | 60 min |
| 24 | Hall of Fame | Evolutionary history, `if let` pattern matching, browse mode | Medium | 50 min |
| 25 | The Complete Génesis | Mode switching, HUD, terrain selector, speed controls | Medium | 50 min |

### [[Reference Guide]]

Verlet integration formulas, constraint solving algorithm, genome encoding format, muscle oscillation math, macroquad drawing API, genetic algorithm operators, module system reference, testing patterns, error handling patterns.

---

## Totals

| Act | Stages | Est. Time |
|---|---|---|
| The Primordial Soup | 7 | ~5.5 hrs |
| The Creature | 6 | ~5.5 hrs |
| The Evolution | 7 | ~6.5 hrs |
| The Ecosystem | 5 | ~4.5 hrs |
| **Total** | **25** | **~22 hrs** |

## Tech Stack

| Crate | Version | Introduced |
|---|---|---|
| macroquad | 0.4 | Stage 1 |
| serde + serde_json | 1 | Stage 22 |

Two crates. Physics, evolution, and creature encoding are all from scratch.

## What You'll Understand After This Course

- How physics simulations work (Verlet integration, constraint solving)
- Why constraints need iterative solving (one pass isn't enough)
- How body morphology and behavior can co-evolve
- Why simple oscillating muscles can produce complex locomotion
- How genetic algorithms handle variable-length genomes (structural mutation)
- Why fitness function design determines what evolution discovers
- What emergence means — complex behavior from simple rules
- How Karl Sims' 1994 experiment worked (and why it's still impressive 30 years later)
- Rust ownership, borrowing, and the borrow checker (through practical encounters)
- Error handling with `Result`, `?`, and `.map_err()`
- The module system (`mod`, `pub`, `use`)
- Testing with `#[test]` and `cargo test`
- Serialization with serde
- Enums with data and exhaustive `match`
