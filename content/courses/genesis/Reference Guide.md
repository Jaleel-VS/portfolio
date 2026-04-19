# Reference Guide

> *Quick reference for Verlet physics, genome encoding, genetic algorithm operators, and macroquad patterns.*

---

## Verlet Integration

### Core update

```rust
let velocity = pos - old_pos;
old_pos = pos;
pos = pos + velocity + acceleration * dt * dt;
```

No velocity variable. Velocity is implicit: `pos - old_pos`.

### Ground collision

```rust
if pos.y > GROUND_Y {
    pos.y = GROUND_Y;
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

---

## Terrain

```rust
Flat:   height = 500.0
Hills:  height = 500.0 - amplitude * sin(x * frequency * 0.01)
Slope:  height = 500.0 - x * tan(angle) * 0.1
Steps:  height = 500.0 - floor(x / width) * step_height
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
├── genome.rs        ← Genome encoding, random generation
├── creature.rs      ← Genome decoder, fitness evaluation
└── evolution.rs     ← Selection, crossover, mutation
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
