# Reference Guide

> *Quick reference for neural network math, genetic algorithm operators, macroquad API, geometry formulas, module system, testing, and error handling.*

---

## Neural Network

### Architecture

```
5 inputs (sensors) → 6 hidden (tanh) → 2 outputs (steering: tanh, throttle: sigmoid)
Total parameters: 50 (30 + 6 + 12 + 2)
```

### Forward pass

```
hidden = tanh(W_ih × inputs + b_h)
output[0] = tanh(W_ho × hidden + b_o)[0]     ← steering (-1 to 1)
output[1] = sigmoid(W_ho × hidden + b_o)[1]   ← throttle (0 to 1)
```

### Activation functions

```
tanh(x) = (e^x - e^(-x)) / (e^x + e^(-x))    range: (-1, 1)
sigmoid(x) = 1 / (1 + e^(-x))                  range: (0, 1)
```

---

## Genetic Algorithm

### Pipeline

```
Evaluate fitness → Select parents → Crossover → Mutate → Replace population → Repeat
```

### Selection (fitness-proportional)

```
P(selected) = fitness_i / sum(all fitnesses)
```

### Crossover (uniform)

```
For each weight:
    child[i] = random() < 0.5 ? parent_a[i] : parent_b[i]
```

### Mutation

```
For each weight:
    if random() < MUTATION_RATE:
        weight += random(-MAGNITUDE, +MAGNITUDE)

Default: RATE = 0.1, MAGNITUDE = 0.3
```

### Elitism

```
new_population[0] = best_of(old_population)  // unchanged
new_population[1..N] = breed(old_population)  // crossover + mutation
```

### Speciation

```
distance(A, B) = mean(|A_weights - B_weights|)
Same species if distance < THRESHOLD (default 0.5)
Adjusted fitness = fitness / species_size
```

---

## Geometry

### Ray-segment intersection

```rust
pub fn ray_segment_intersection(origin: Vec2, dir: Vec2, p1: Vec2, p2: Vec2) -> Option<f32> {
    let v1 = origin - p1;
    let v2 = p2 - p1;
    let v3 = vec2(-dir.y, dir.x);
    let dot = v2.dot(v3);
    if dot.abs() < 0.0001 { return None; }
    let t1 = (v2.x * v1.y - v2.y * v1.x) / dot;
    let t2 = v1.dot(v3) / dot;
    if t1 >= 0.0 && t2 >= 0.0 && t2 <= 1.0 { Some(t1) } else { None }
}
```

### Line-segment intersection

```rust
pub fn segments_intersect(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2) -> bool {
    let d1 = cross_2d(p3, p4, p1);
    let d2 = cross_2d(p3, p4, p2);
    let d3 = cross_2d(p1, p2, p3);
    let d4 = cross_2d(p1, p2, p4);
    ((d1 > 0.0 && d2 < 0.0) || (d1 < 0.0 && d2 > 0.0))
        && ((d3 > 0.0 && d4 < 0.0) || (d3 < 0.0 && d4 > 0.0))
}

fn cross_2d(a: Vec2, b: Vec2, c: Vec2) -> f32 {
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}
```

### Direction from angle

```rust
let dir = vec2(angle.cos(), angle.sin());
let perpendicular = vec2(-dir.y, dir.x);
```

---

## Module System

### File → Module mapping

```
src/
├── main.rs          ← declares: mod track; mod car; mod geometry; mod nn; mod evolution;
├── track.rs         ← module `track`
├── car.rs           ← module `car`
├── geometry.rs      ← module `geometry`
├── nn.rs            ← module `nn`
└── evolution.rs     ← module `evolution`
```

### Rules

| Rule | Example |
|------|---------|
| Declare module in parent | `mod track;` in `main.rs` |
| Import specific items | `use track::Track;` |
| Cross-module import | `use crate::geometry;` in `car.rs` |
| Make items visible | `pub struct`, `pub fn`, `pub field` |
| Everything private by default | Forget `pub` → compiler error |

### Common errors

```
error[E0432]: unresolved import `track`     → forgot `mod track;` in main.rs
error[E0603]: struct `Track` is private     → forgot `pub` on the struct
error[E0603]: function `segments_intersect` is private → forgot `pub` on the function
```

---

## Testing Patterns

### Basic test structure

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_something() {
        assert_eq!(actual, expected);
    }
}
```

### Running tests

```bash
cargo test                    # all tests
cargo test test_name          # specific test
cargo test nn::tests          # all tests in a module
```

### Assertions

```rust
assert_eq!(a, b);                           // equality
assert_ne!(a, b);                           // inequality
assert!(condition);                          // boolean
assert!(condition, "msg: {}", val);          // with message
assert!((a - b).abs() < 0.0001);            // float comparison (avoid assert_eq! with floats)
```

### Testing randomness

```rust
// Run many trials, check statistical properties
let mut count = 0;
for _ in 0..1000 {
    if some_random_function() { count += 1; }
}
assert!(count > 800, "Expected >80%, got {}", count);
```

---

## Error Handling

### The `Result` pattern

```rust
fn load_file(path: &str) -> Result<Data, String> {
    let text = std::fs::read_to_string(path)
        .map_err(|e| format!("Can't read {path}: {e}"))?;
    let data: Data = serde_json::from_str(&text)
        .map_err(|e| format!("Bad JSON: {e}"))?;
    Ok(data)
}
```

### Handling results

```rust
// Pattern 1: match
match load_file("data.json") {
    Ok(data) => { /* use data */ }
    Err(e) => eprintln!("Error: {e}"),
}

// Pattern 2: if let (when you only care about success)
if let Ok(data) = load_file("data.json") {
    /* use data */
}

// Pattern 3: unwrap (prototyping only — panics on error)
let data = load_file("data.json").unwrap();
```

### When to use what

| Situation | Use |
|-----------|-----|
| File I/O, network, parsing | `Result<T, E>` with `?` |
| Value might not exist | `Option<T>` with `if let` or `match` |
| Prototyping, tests | `.unwrap()` (acceptable) |
| Production code | Never `.unwrap()` on user-facing operations |

---

## Ownership Quick Reference

| Pattern | Meaning |
|---------|---------|
| `fn f(x: T)` | Takes ownership — caller can't use `x` after |
| `fn f(x: &T)` | Borrows read-only — caller keeps ownership |
| `fn f(x: &mut T)` | Borrows mutably — caller keeps ownership, `f` can modify |
| `x.clone()` | Creates a deep copy — both original and clone are independent |
| `for item in &vec` | Borrows each item — vec still usable after loop |
| `for item in &mut vec` | Mutably borrows each item — can modify in place |
| `for item in vec` | Consumes the vec — can't use it after the loop |

---

## macroquad Cheat Sheet

### Window and loop

```rust
#[macroquad::main("Title")]
async fn main() {
    loop {
        clear_background(BLACK);
        // draw stuff
        next_frame().await;
    }
}
```

### Drawing

```rust
draw_line(x1, y1, x2, y2, thickness, color);
draw_circle(x, y, radius, color);
draw_triangle(v1, v2, v3, color);
draw_rectangle(x, y, w, h, color);
draw_text("text", x, y, font_size, color);
```

### Input

```rust
is_key_down(KeyCode::W)              // held
is_key_pressed(KeyCode::Space)       // just pressed this frame
is_mouse_button_pressed(MouseButton::Left)
let (mx, my) = mouse_position();
```

### Timing

```rust
let dt = get_frame_time();           // seconds since last frame
let fps = get_fps();
```

### Colors

```rust
Color::from_rgba(r, g, b, a)        // 0-255 each
WHITE, BLACK, RED, GREEN, BLUE, YELLOW, GRAY
```

### Random

```rust
use macroquad::rand::gen_range;
let x: f32 = gen_range(-1.0, 1.0);
let i: usize = gen_range(0, 50);
```

---

## Sensor Layout

```
        2   1   0          Angles (radians):
         \  |  /           0: +0.7854 (45° right)
          \ | /            1:  0.0    (straight)
    3 ---- CAR ---- 4      2: -0.7854 (45° left)
                           3: -1.5708 (90° left)
                           4: +1.5708 (90° right)
```

Sensor values: 0.0 (wall touching) to 1.0 (max range, no wall).

---

## Car Physics

```
Acceleration: speed += accel × throttle × (1 - speed/max_speed) × dt
Friction:     speed *= 1 - friction × dt
Turning:      angle += steering × turn_rate × (1 - speed/max_speed × 0.6) × dt
Movement:     pos += direction × speed × dt
```

Default constants: `accel=250`, `max_speed=300`, `turn_rate=3.5`, `friction=1.5`

---

## Cargo.toml

```toml
[package]
name = "piloto"
version = "0.1.0"
edition = "2024"

[dependencies]
macroquad = "0.4"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

Three crates. Everything else is built from scratch.

---

## Module Structure

```
src/
├── main.rs          ← Game loop, mode switching, HUD
├── track.rs         ← Track geometry, drawing, checkpoints, save/load
├── car.rs           ← Car physics, sensors, collision, brain interface
├── nn.rs            ← Matrix, NeuralNetwork, forward pass, visualization
├── evolution.rs     ← Selection, crossover, mutation, speciation
└── geometry.rs      ← Ray-segment intersection, line intersection, cross product
```
