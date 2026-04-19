# Reference Guide

> *Quick reference for Verlet physics, genome encoding, genetic algorithm operators, Rust module system, testing patterns, error handling, and macroquad patterns.*

---

## Verlet Integration

### Core update

```rust
let velocity = pos - old_pos;
old_pos = pos;
pos = pos + velocity + acceleration * dt * dt;
```

No velocity variable. Velocity is implicit: `pos - old_pos`.

### Set velocity

```rust
old_pos = pos - desired_velocity;
```

### Stop a point

```rust
old_pos = pos;
```

### Ground collision

```rust
if pos.y > ground_y {
    pos.y = ground_y;
    old_pos.y = pos.y + (pos.y - old_pos.y) * BOUNCE;  // dampen vertical
    old_pos.x = pos.x - (pos.x - old_pos.x) * FRICTION; // dampen horizontal
}
```

### Distance constraint (bone)

```rust
let diff = b.pos - a.pos;
let current = diff.length();
let correction = (current - rest_length) / current * 0.5;
a.pos += diff * correction;
b.pos -= diff * correction;
```

### Muscle (oscillating constraint)

```rust
let target = rest_length + amplitude * sin(frequency * time * TAU + phase);
// Same constraint solver, but with `target` instead of `rest_length`
```

### Simulation step order

```
1. Apply forces (gravity)
2. Verlet update (all points)
3. Solve constraints × 6 iterations (bones + muscles)
4. Ground collision (all points)
```

---

## Genome Encoding

### Fixed topology (5 nodes, 2 muscles)

```
[0..10]   Node positions: 5 × (x_offset, y_offset)
[10..14]  Muscle params: 2 × (frequency, phase)
Total: 14 floats
```

### Variable topology

```
[0..N*2]        Node positions: N × (x_offset, y_offset)
[N*2..N*2+M*2]  Muscle params: M × (frequency, phase)
Total: N*2 + M*2 floats (variable)
```

Minimum: 3 nodes (core triangle) = 6 floats. Maximum: 8 nodes.

Node/muscle count from genome length: `num_nodes = (genes.len() + 6) / 4`

---

## Genetic Algorithm

### Selection (fitness-proportional)

```
P(selected) = fitness_i / sum(all fitnesses)
```

### Crossover (uniform)

```
child[i] = random() < 0.5 ? parent_a[i] : parent_b[i]
```

### Parameter mutation

```
Rate: 15%
Node positions: ±10 pixels
Muscle frequency: ±0.5 Hz (clamped to [0.2, 6.0])
Muscle phase: ±0.5 radians
```

### Structural mutation

```
Rate: 5%
Add node: new position near existing node + new muscle
Remove node: remove node + associated muscle (min 3 nodes)
```

### Elitism

```
new_population[0] = best_of(old_population)  // unchanged
```

---

## Body Plan

### Core triangle (always present)

```
    0
   / \
  1---2
```

Nodes 0, 1, 2 form a rigid triangle (3 bones). Cannot be removed by structural mutation.

### Limbs (evolved)

Nodes 3+ connect to the nearest core node via a bone + cross-brace to node 0. Each limb node has a muscle connecting it to a core node.

---

## Fitness

```
fitness = max(0, average_x_position - start_x)
```

Horizontal distance traveled rightward. Measured after 10 seconds of simulation.

Optional anti-flip penalty: reduce fitness when center of mass is below the lowest ground contact point.

---

## Terrain

```rust
Flat:   height = 500.0
Hills:  height = 500.0 - amplitude * sin(x * frequency * 0.01)
Slope:  height = 500.0 - x * tan(angle) * 0.1
Steps:  height = 500.0 - floor(x / width) * step_height
```

---

## Rust Module System

### File → module connection

```
src/
├── main.rs          ← must declare: mod physics; mod simulation; ...
├── physics.rs       ← becomes the `physics` module
├── simulation.rs    ← becomes the `simulation` module
└── genome.rs        ← becomes the `genome` module
```

### Key rules

- `mod physics;` in `main.rs` tells Rust to look for `src/physics.rs`
- Items are **private by default** — add `pub` to expose them
- `use crate::physics::Point;` imports from another module
- `mod` = declaration (connects file), `use` = import (brings names into scope)

### Common error

Forgetting `mod physics;`:
```
error[E0432]: unresolved import `crate::physics`
```

Forgetting `pub`:
```
error[E0603]: struct `Point` is private
```

---

## Testing Patterns

### Basic test

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn my_test() {
        assert_eq!(1 + 1, 2);
    }
}
```

### Running tests

```bash
cargo test                    # all tests
cargo test test_name          # specific test
cargo test module::tests      # tests in a module
```

### Assertions

```rust
assert!(condition);                          // bool check
assert_eq!(left, right);                     // equality
assert_ne!(left, right);                     // inequality
assert!((a - b).abs() < 0.01, "message");   // float comparison with tolerance
```

### Key points

- `#[cfg(test)]` — module only compiles during testing
- `#[test]` — marks a function as a test case
- Tests panic on failure (via `assert!` macros)
- No external test framework needed — built into Rust

---

## Error Handling Patterns

### Return Result from functions that can fail

```rust
fn load_file(path: &str) -> Result<String, String> {
    std::fs::read_to_string(path)
        .map_err(|e| format!("read error: {e}"))
}
```

### Propagate with `?`

```rust
fn process(path: &str) -> Result<Data, String> {
    let content = load_file(path)?;  // returns early on error
    let data = parse(content)?;
    Ok(data)
}
```

### Convert error types with `.map_err()`

```rust
std::fs::write(path, data)
    .map_err(|e| format!("write error: {e}"))?;
```

### Handle only success with `if let`

```rust
if let Ok(creature) = Creature::from_genome(genome, 0.0, 400.0) {
    creature.draw();
}
```

### When to use what

| Situation | Pattern |
|-----------|---------|
| Function can fail | Return `Result<T, String>` |
| Calling a fallible function | Use `?` to propagate |
| Different error types | `.map_err()` to convert |
| Only care about success | `if let Ok(x) = ...` |
| Tests | `.unwrap()` is fine (panics = test failure) |
| Production code | Never `.unwrap()` — use `?` or `match` |

---

## Ownership Quick Reference

| Concept | Syntax | Meaning |
|---------|--------|---------|
| Ownership | `let x = val;` | `x` owns `val` |
| Move | `let y = x;` | `y` now owns it, `x` is invalid |
| Immutable borrow | `&x` | Read-only reference |
| Mutable borrow | `&mut x` | Read-write reference (exclusive) |
| Clone | `x.clone()` | Deep copy, both valid |

### Rules

1. Each value has exactly one owner
2. You can have **either** one `&mut` reference **or** any number of `&` references (not both)
3. References must not outlive the owner

### Common patterns in this course

```rust
// Index-based references (bones/muscles → points)
struct Bone { a: usize, b: usize }  // indices, not references

// Iterating without consuming
for p in &points { ... }       // immutable borrow
for p in &mut points { ... }   // mutable borrow
for p in points { ... }        // MOVES — consumes the Vec!

// Mutable reference to slice element
fn solve(&self, points: &mut [Point]) {
    points[self.a].pos += offset;  // OK: indexing borrows one element
}
```

---

## Cargo.toml

```toml
[package]
name = "genesis"
version = "0.1.0"
edition = "2024"

[dependencies]
macroquad = "0.4"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

---

## Module Structure

```
src/
├── main.rs          ← Game loop, mode switching, HUD
├── physics.rs       ← Point, Bone, Muscle (Verlet integration)
├── simulation.rs    ← Simulation step, constraint solving
├── genome.rs        ← Genome encoding, random generation, validation
├── creature.rs      ← Genome decoder, fitness evaluation
├── evolution.rs     ← Selection, crossover, mutation, structural mutation
├── terrain.rs       ← Terrain types and height functions
└── replay.rs        ← Replay recording, save/load
```

---

## Controls

| Key | Action |
|---|---|
| Space | Pause/resume |
| F | Fast mode (headless) |
| V | Visual mode |
| T | Cycle terrain |
| H | Hall of fame |
| R | Replay best |
| +/- | Zoom |
| Q | Quit |
