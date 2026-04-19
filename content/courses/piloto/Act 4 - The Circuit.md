# Act 4 — The Circuit

> *The AI can drive an oval. But can it handle a hairpin? A chicane? A track it's never seen? This act pushes the AI further: harder tracks, a track editor, saving and loading trained brains, and the ultimate test — racing against your own creation.*

```mermaid
flowchart LR
    S22["Stage 22 - Track Editor"] --> S23["Stage 23 - Hard Tracks"]
    S23 --> S24["Stage 24 - Save/Load"]
    S24 --> S25["Stage 25 - Race Mode"]
    S25 --> S26["Stage 26 - Species"]
    S26 --> S27["Stage 27 - Complete"]
    style S22 fill:#49a,stroke:#333
    style S27 fill:#a4e,stroke:#333
```

---

## Stage 22 — Track Editor

> *Difficulty: Medium — Click to place walls, save/load tracks as JSON.*

The oval is a good starting track, but evolution needs variety. This stage builds a simple track editor: click to place outer wall points, then inner wall points, save to JSON, load at startup.

> [!tip] What You'll Learn
> - Mouse input with macroquad (`mouse_position`, `is_mouse_button_pressed`)
> - Serializing geometry to JSON with serde
> - Editor mode vs simulation mode (state machine)
> - Building tools for your own workflow

### 22.1 — Editor mode

Add an editor state that captures mouse clicks as wall points:

```rust
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize)]
pub struct TrackData {
    pub outer: Vec<[f32; 2]>,
    pub inner: Vec<[f32; 2]>,
}

enum EditorPhase {
    PlacingOuter,
    PlacingInner,
    Done,
}
```

In the editor loop: left-click adds a point, right-click finishes the current wall, `S` saves to `track.json`.

```rust
if is_mouse_button_pressed(MouseButton::Left) {
    let (mx, my) = mouse_position();
    match phase {
        EditorPhase::PlacingOuter => outer_points.push(vec2(mx, my)),
        EditorPhase::PlacingInner => inner_points.push(vec2(mx, my)),
        EditorPhase::Done => {}
    }
}

if is_mouse_button_pressed(MouseButton::Right) {
    match phase {
        EditorPhase::PlacingOuter => phase = EditorPhase::PlacingInner,
        EditorPhase::PlacingInner => phase = EditorPhase::Done,
        _ => {}
    }
}
```

### 22.2 — Save/load

```rust
fn save_track(outer: &[Vec2], inner: &[Vec2], path: &str) {
    let data = TrackData {
        outer: outer.iter().map(|v| [v.x, v.y]).collect(),
        inner: inner.iter().map(|v| [v.x, v.y]).collect(),
    };
    let json = serde_json::to_string_pretty(&data).unwrap();
    std::fs::write(path, json).unwrap();
}

fn load_track(path: &str) -> Option<Track> {
    let json = std::fs::read_to_string(path).ok()?;
    let data: TrackData = serde_json::from_str(&json).ok()?;
    Some(Track {
        outer: data.outer.iter().map(|p| vec2(p[0], p[1])).collect(),
        inner: data.inner.iter().map(|p| vec2(p[0], p[1])).collect(),
    })
}
```

Add `serde` and `serde_json` to `Cargo.toml`.

> [!check] Checkpoint
> Open the editor, click to place a track, save it, reload and verify it appears. Stage 22 complete.

---

## Stage 23 — Harder Tracks

> *Difficulty: Medium — Tight corners, chicanes, and varying width.*

The oval has gentle curves. Real tracks have hairpins, chicanes, and narrow sections. This stage creates 2-3 preset tracks of increasing difficulty and tests whether the AI can handle them.

> [!tip] What You'll Learn
> - How track geometry affects AI difficulty
> - Why sharp corners require different strategies than gentle curves
> - Generalization — can an AI trained on one track drive another?

### 23.1 — Preset tracks

Add to `Track`:

```rust
impl Track {
    pub fn figure_eight() -> Self {
        // A figure-8 with a crossing point — tests the AI's ability to handle intersections
        // ... define outer and inner points ...
    }

    pub fn hairpin() -> Self {
        // A track with two tight 180° hairpin turns
        // ... define points ...
    }
}
```

### 23.2 — Test generalization

Train on the oval, then switch to the hairpin track without retraining. The AI will likely fail — it learned oval-specific behavior. Retrain on the hairpin and watch it develop a different strategy (slower, tighter turns).

> [!note] Generalization is hard
> An AI trained on one track memorizes that track's geometry through its sensor patterns. It doesn't learn "driving" in general — it learns "this specific sequence of sensor readings." True generalization would require training on many tracks simultaneously, which is possible but slower.

> [!check] Checkpoint
> Create a harder track. Verify the oval-trained AI fails on it. Retrain on the new track and verify it adapts. Stage 23 complete.

---

## Stage 24 — Save and Load Brains

> *Difficulty: Easy — Serialize the best neural network to JSON.*

Training takes time. You don't want to retrain every time you run the program. This stage saves the best brain to a JSON file and loads it at startup, so you can resume evolution or deploy a trained driver.

> [!tip] What You'll Learn
> - Serializing neural network weights with serde
> - Saving/loading trained models
> - The concept of a "checkpoint" in ML training

### 24.1 — Serialize the network

Add `Serialize, Deserialize` derives to `Matrix` and `NeuralNetwork`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Matrix { /* ... */ }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NeuralNetwork { /* ... */ }
```

Save/load:

```rust
fn save_brain(nn: &NeuralNetwork, path: &str) {
    let json = serde_json::to_string_pretty(nn).unwrap();
    std::fs::write(path, json).unwrap();
}

fn load_brain(path: &str) -> Option<NeuralNetwork> {
    let json = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&json).ok()
}
```

Auto-save the best brain every 10 generations. Load on startup if the file exists.

> [!check] Checkpoint
> Train for 50 generations, quit, restart. Verify the best brain is loaded and drives immediately without retraining. Stage 24 complete.

---

## Stage 25 — Race Mode

> *Difficulty: Medium — You vs your AI, head to head.*

The ultimate test: you drive with WASD, the AI drives with its neural network, same track, same start. Who's faster? This stage adds a split-screen race mode.

> [!tip] What You'll Learn
> - Running two cars with different control sources simultaneously
> - Split-screen or shared-screen rendering
> - Comparing human vs AI performance
> - The humbling moment when your AI beats you

### 25.1 — Race mode

```rust
enum GameMode {
    Evolution,
    Race,
    Editor,
}
```

In race mode, spawn two cars: one keyboard-controlled (yellow), one brain-controlled (cyan). Both start at the same position. Track checkpoints for both. Display a lap timer.

```rust
// In the race loop:
let human_input = Car::keyboard_input();
human_car.update(&human_input, dt);

let ai_input = ai_car.brain_input(&walls);
ai_car.update(&ai_input, dt);
```

### 25.2 — Test it

```bash
cargo run -- race
```

You and the AI start side by side. The AI takes the racing line perfectly (it evolved for this). You try to keep up. The checkpoint counter shows who's ahead.

> [!check] Checkpoint
> Race against your trained AI. Note who completes the track first. Stage 25 complete.

---

## Stage 26 — Species and Niches

> *Difficulty: Hard — Protecting innovation with speciation.*

Sometimes evolution gets stuck: the entire population converges to one mediocre strategy, and mutations can't escape the local optimum. **Speciation** groups similar networks into species and ensures each species gets a fair share of offspring. This protects innovative (but currently weak) strategies from being outcompeted before they mature.

> [!tip] What You'll Learn
> - Network distance metric (how different are two networks?)
> - Speciation — grouping similar networks
> - Adjusted fitness — fitness divided by species size
> - Why diversity preservation prevents premature convergence

### 26.1 — Network distance

```rust
/// Compute the distance between two networks (sum of absolute weight differences).
pub fn network_distance(a: &NeuralNetwork, b: &NeuralNetwork) -> f32 {
    let pa = a.get_params();
    let pb = b.get_params();
    pa.iter().zip(pb.iter())
        .map(|(a, b)| (a - b).abs())
        .sum::<f32>() / pa.len() as f32
}
```

### 26.2 — Species assignment

```rust
const SPECIES_THRESHOLD: f32 = 0.5;

pub fn assign_species(population: &[NeuralNetwork]) -> Vec<usize> {
    let mut species: Vec<Vec<usize>> = Vec::new();
    let mut assignments = vec![0usize; population.len()];

    for (i, nn) in population.iter().enumerate() {
        let mut found = false;
        for (s, members) in species.iter().enumerate() {
            let representative = &population[members[0]];
            if network_distance(nn, representative) < SPECIES_THRESHOLD {
                species[s].push(i);
                assignments[i] = s;
                found = true;
                break;
            }
        }
        if !found {
            assignments[i] = species.len();
            species.push(vec![i]);
        }
    }

    assignments
}
```

### 26.3 — Adjusted fitness

Divide each car's fitness by the size of its species. This prevents a large species from dominating — small species with novel strategies get proportionally more offspring.

```rust
pub fn adjusted_fitnesses(fitnesses: &[f32], species: &[usize]) -> Vec<f32> {
    let mut species_sizes: std::collections::HashMap<usize, usize> = std::collections::HashMap::new();
    for &s in species {
        *species_sizes.entry(s).or_insert(0) += 1;
    }

    fitnesses.iter().enumerate()
        .map(|(i, &f)| f / species_sizes[&species[i]] as f32)
        .collect()
}
```

> [!check] Checkpoint
> Enable speciation. Verify multiple species coexist. Verify fitness continues to improve (possibly faster than without speciation). Stage 26 complete.

---

## Stage 27 — The Complete Piloto

> *Difficulty: Medium — Everything together.*

The final stage: multiple tracks, generation counter, fitness graph, best-of-all-time replay, mode switching (evolution / race / editor). The complete Piloto.

> [!tip] What You'll Learn
> - Mode switching in a game loop
> - Persisting state across modes
> - The complete evolutionary AI pipeline

### 27.1 — Mode switching

```rust
// Press 1 for evolution, 2 for race, 3 for editor
match key.code {
    KeyCode::Key1 => mode = GameMode::Evolution,
    KeyCode::Key2 => mode = GameMode::Race,
    KeyCode::Key3 => mode = GameMode::Editor,
    _ => {}
}
```

### 27.2 — The complete HUD

```
┌─────────────────────────────────────────────┐
│ Piloto — Generation 47                      │
│ Alive: 23/50  Best: 1840  Best Ever: 2100   │
│ Species: 4    Time: 8.3s / 15.0s            │
│                                              │
│ [1] Evolution  [2] Race  [3] Editor          │
│                                              │
│ ┌──────────────────────────────┐             │
│ │ Fitness Graph ████▓▓▒▒░░    │             │
│ └──────────────────────────────┘             │
│                                              │
│ ┌──────────┐                                │
│ │ Neural   │  ● ── ● ── ●                  │
│ │ Network  │  ● ── ● ── ●                  │
│ └──────────┘                                │
└─────────────────────────────────────────────┘
```

> [!check] Checkpoint
> Switch between all three modes. Verify evolution runs, race mode works, and the editor saves/loads tracks. Stage 27 complete.

---

## Act 4 Complete — The Circuit

| Feature | What it does |
|---------|-------------|
| Track editor | Click to design custom tracks, save/load as JSON |
| Hard tracks | Hairpins, chicanes — test AI generalization |
| Save/load brains | Persist trained networks, resume training |
| Race mode | Human vs AI head-to-head |
| Speciation | Protect innovation, prevent premature convergence |
| Complete app | Mode switching, fitness graph, neural network visualization |

---

## Course Complete — Piloto

You taught cars to drive. Not by programming rules — by evolving neural networks through thousands of generations of simulated natural selection. The 50 numbers in the best network encode a driving strategy that emerged from random noise.

| Component | What it does |
|-----------|-------------|
| Track | 2D circuit with inner/outer walls, checkpoints |
| Car | Position, angle, speed, 5 ray-cast sensors |
| Physics | Speed-dependent turning, friction, collision |
| Neural network | 5→6→2 feedforward, tanh/sigmoid activations |
| Genetic algorithm | Selection, crossover, mutation, elitism, speciation |
| Visualization | Cars, sensors, neural network activations, fitness graph |
| Tools | Track editor, brain save/load, race mode |

| Rust Concept | Where You Used It |
|-------------|-------------------|
| macroquad | Window, drawing, input, game loop |
| Structs and enums | `Car`, `Track`, `NeuralNetwork`, `Matrix`, `GameMode` |
| `Vec<f32>` math | Matrix multiplication, parameter vectors |
| Trigonometry | Direction vectors, sensor angles, ray casting |
| Closures | `map`, `filter`, `max_by`, fitness evaluation |
| Serde | Track and brain serialization |
| State machines | Editor phases, game modes |

The next time someone says "AI" or "neural network," you'll know exactly what's inside: matrix multiplication, activation functions, and — in this case — evolution. No magic. Just math and selection pressure.
