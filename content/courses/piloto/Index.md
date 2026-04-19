# Piloto — Teach Cars to Drive With Neural Networks in Rust

> *Generation 1: every car crashes into the first wall. Generation 50: they drift around corners. You didn't program the driving — you evolved it. The neural network learned from thousands of failures, and now it drives better than you could code by hand.*

*Piloto* means "pilot" in Spanish — the one who steers. You build a 2D driving simulation where cars have sensors (rays that detect walls), a neural network brain (that maps sensor inputs to steering/throttle), and a genetic algorithm that breeds the best drivers and mutates the rest. You watch evolution happen in real-time.

**Project:** `~/juk/piloto/` (Rust 2024 edition)

**Prerequisites:** Python experience. No Rust, game dev, or machine learning knowledge required. Every concept — neural networks, genetic algorithms, trigonometry — is introduced when you first need it.

**What makes this different from your other Rust courses:** This is the first course with **visual, real-time feedback**. Every other course produces text output. Piloto produces a window where you watch 50 cars race simultaneously, crashing, learning, and improving across generations. It's also the first course that teaches **machine learning without calculus** — genetic algorithms don't need gradients.

---

## Design Decisions

### Why genetic algorithms instead of backpropagation?

Traditional neural network training (gradient descent, backpropagation) requires calculus — partial derivatives, chain rule, loss functions. It's powerful but math-heavy.

Genetic algorithms are different: breed the best, mutate the rest. No calculus. No gradients. The "training" is:
1. Run 50 cars with random neural networks
2. Measure fitness (how far each car got before crashing)
3. Keep the best performers
4. Copy them with small random mutations
5. Repeat

This is how biological evolution works — and it's shockingly effective for problems where you can simulate many candidates in parallel. Self-driving cars are a perfect fit because you can run 50 simulations simultaneously and evaluate fitness instantly.

### Why macroquad?

Macroquad is a minimal 2D graphics library — `draw_line`, `draw_circle`, `next_frame().await`. No ECS, no scene graph, no boilerplate. You can have cars on screen in 10 lines of code. The course is about AI, not game engine architecture.

Macroquad also compiles to WebAssembly, so you can share your simulation as a browser demo.

### The simulation

- **Track:** A 2D circuit defined as inner and outer wall polygons
- **Cars:** Position, angle, velocity. Physics is simple: accelerate, brake, steer left/right
- **Sensors:** 5 rays cast from the car's front, detecting distance to the nearest wall
- **Brain:** A small feedforward neural network (5 inputs → 6 hidden → 2 outputs: steering and throttle)
- **Evolution:** Genetic algorithm — fitness-proportional selection, crossover, mutation

### Tone

Energetic and visual. Every stage produces something you can see — cars moving, crashing, improving. The excitement comes from watching dumb random behavior evolve into competent driving.

---

## Course Map

### [[Act 1 - The Track]] — Simulation Foundation (Stages 1-7)

Build the visual simulation: a track, a car with physics, and manual keyboard controls. No AI yet — just the world the AI will learn to navigate.

| # | Stage | Concept | Difficulty | ~Time |
|---|---|---|---|---|
| 1 | The Window | macroquad setup, game loop, drawing shapes | Very Easy | 30 min |
| 2 | The Track | Define a circuit as wall segments, draw it; module system (`mod`, `pub`) | Easy | 60 min |
| 3 | The Car | Position, angle, velocity. Draw a triangle. Keyboard controls; `&self` vs `&mut self` | Easy | 50 min |
| 4 | Car Physics | Acceleration, friction, turning radius at speed; separating input from physics | Medium | 60 min |
| 5 | Wall Collision | Detect when the car hits a wall; slice references `&[(Vec2, Vec2)]` | Medium | 50 min |
| 6 | The Sensors | 5 rays from the car's front, detect distance to nearest wall; `Option<f32>` | Medium | 60 min |
| 7 | The Checkpoint System | Gates along the track that measure progress; linear interpolation | Medium | 50 min |

### [[Act 2 - The Brain]] — Neural Networks From Scratch (Stages 8-14)

Build a feedforward neural network by hand — no ML libraries. Understand what a neural network actually computes: matrix multiplication + activation functions. Then connect it to the car's sensors and outputs.

| # | Stage | Concept | Difficulty | ~Time |
|---|---|---|---|---|
| 8 | What Is a Neural Network? | Neurons, weights, biases — the conceptual model. No code yet | Easy | 35 min |
| 9 | Matrix Math | Vectors and matrices in Rust. Dot products; `#[test]` and `cargo test` | Medium | 60 min |
| 10 | The Forward Pass | Input → hidden → output. Multiply by weights, add bias, apply activation | Medium | 60 min |
| 11 | Activation Functions | tanh for hidden layers, sigmoid for output; testing output ranges | Easy | 35 min |
| 12 | Random Brains | Initialize with random weights; `Option<NeuralNetwork>`, borrowing vs moving | Medium | 50 min |
| 13 | 50 Cars at Once | Spawn 50 cars with random brains, run simultaneously; `&mut` iteration | Medium | 50 min |
| 14 | Visualizing the Brain | Draw the neural network alongside the car — show activations in real-time | Medium | 50 min |

### [[Act 3 - The Evolution]] — Genetic Algorithm (Stages 15-21)

The core of the course. Build the genetic algorithm that breeds better drivers across generations. Watch fitness climb from "crashes immediately" to "completes the track."

| # | Stage | Concept | Difficulty | ~Time |
|---|---|---|---|---|
| 15 | Fitness | Measuring how good a car is — checkpoints passed, time alive; testing fitness ordering | Easy | 40 min |
| 16 | Selection | Fitness-proportional selection — better cars are more likely to be parents | Medium | 45 min |
| 17 | Crossover | Combine two parent networks — take some weights from each; `get_params`/`from_params` | Medium | 45 min |
| 18 | Mutation | Randomly perturb weights; `&mut` parameters, mutation rate and magnitude | Medium | 40 min |
| 19 | The Generation Loop | Select → crossover → mutate → run → repeat; `.clone()` and ownership | Medium | 60 min |
| 20 | Elitism | Always keep the best performer unchanged; `partial_cmp` for floats | Easy | 30 min |
| 21 | The First Lap | Tune parameters until a car completes the full track; fitness graph | Hard | 75 min |

### [[Act 4 - The Circuit]] — Advanced Tracks and Features (Stages 22-27)

The cars can drive one track. Now make them generalize: harder tracks, track editor, save/load brains, and a head-to-head mode where you race against your AI.

| # | Stage | Concept | Difficulty | ~Time |
|---|---|---|---|---|
| 22 | Track Editor | Click to place wall points, save/load tracks as JSON; `Result<T,E>` and `?` | Medium | 60 min |
| 23 | Harder Tracks | Tight corners, chicanes, varying width; generalization and transfer learning | Medium | 45 min |
| 24 | Save and Load Brains | Serialize the best neural network to JSON; serde derives | Easy | 35 min |
| 25 | Race Mode | You drive with keyboard, the AI drives alongside; enum state machines | Medium | 50 min |
| 26 | Species and Niches | Group similar networks, protect innovation, prevent premature convergence; `HashMap` | Hard | 75 min |
| 27 | The Complete Piloto | Multiple tracks, generation counter, fitness graph, best-of-all-time replay | Medium | 60 min |

### [[Reference Guide]]

Neural network math (forward pass, matrix multiplication), genetic algorithm operators (selection, crossover, mutation), macroquad drawing API, ray-line intersection formula, 2D physics formulas, trigonometry cheat sheet, module system reference, testing patterns, error handling patterns.

---

## Totals

| Act | Stages | Est. Time |
|---|---|---|
| The Track | 7 | ~6 hrs |
| The Brain | 7 | ~5.5 hrs |
| The Evolution | 7 | ~5.5 hrs |
| The Circuit | 6 | ~5.5 hrs |
| **Total** | **27** | **~22.5 hrs** |

## Tech Stack

| Crate | Version | Introduced |
|---|---|---|
| macroquad | 0.4 | Stage 1 |
| serde + serde_json | 1 | Stage 22 |

Two crates. The neural network and genetic algorithm are implemented from scratch. macroquad handles the window and drawing. That's it.

## What You'll Understand After This Course

- What a neural network actually computes (matrix multiplication + activation, demystified)
- How genetic algorithms work (selection, crossover, mutation — evolution in code)
- Why you don't need calculus for some ML problems (genetic algorithms bypass gradients entirely)
- How self-driving car sensors work (ray casting, distance measurement)
- Basic 2D physics (acceleration, friction, angular velocity)
- Ray-line intersection (the math behind collision detection and sensors)
- Why evolution works (small random changes + selection pressure = emergent intelligence)
- How to watch a population of random idiots become competent drivers in 50 generations
