# Act 1: The Grid — "I Solemnly Swear"

> *"Mr. Moony presents his compliments to the aspiring cartographer and begs them to learn the ancient art of Rust."*

Welcome to Act 1. By the end of these eight stages you will have a working terminal application that loads a multi-floor Hogwarts map from JSON and renders it in a scrollable viewport. No prior Rust experience required — we'll explain every line.

**What you'll build:**
- A tile-based map system using enums and structs
- A real terminal UI with ratatui (Rust's TUI framework)
- A camera/viewport that follows the player
- JSON map loading with serde
- Multi-floor navigation with stairs

**Project path:** `~/juk/marauders-map/`

**Stages at a glance:**

| # | Name | Concepts | Difficulty |
|---|------|----------|------------|
| 1 | Hello Hogwarts | cargo, println!, project setup | Very Easy |
| 2 | The Tile | Enums, match, Display trait | Easy |
| 3 | The Grid | Vec<Vec<T>>, nested loops, indexing | Easy |
| 4 | The Floor | Structs, methods, associated functions | Easy |
| 5 | Enter ratatui | TUI setup, Frame, Widget, event loop | Medium |
| 6 | The Viewport | Camera, scrolling, clamping | Medium |
| 7 | Map from JSON | serde, Deserialize, file I/O | Medium |
| 8 | Multiple Floors | Vec<Floor>, stairs, floor switching | Medium |

Let's begin.

---

## Stage 1: Hello Hogwarts

*Difficulty: Very Easy · Concepts: cargo, project structure, println!, main function*

Every journey starts with a single spell. Ours starts with `cargo new`.

### Creating the project

Open your terminal and run:

```bash
cd ~/juk
cargo new marauders-map
cd marauders-map
```

`cargo new` is Rust's project generator. It creates a directory with two things:

```
marauders-map/
├── Cargo.toml    # Project manifest (like package.json or pyproject.toml)
└── src/
    └── main.rs   # Your code starts here
```

**`Cargo.toml`** describes your project — its name, version, and dependencies. Open it:

```toml
[package]
name = "marauders-map"
version = "0.1.0"
edition = "2024"

[dependencies]
```

The `edition = "2024"` line tells Rust which language edition to use. Rust releases a new edition every few years with quality-of-life improvements. 2024 is the latest.

> **Python comparison:** `Cargo.toml` is like `pyproject.toml`. `cargo` is like `pip` + `python` combined — it manages dependencies *and* builds your code.

> **TypeScript comparison:** Think of `Cargo.toml` as `package.json` and `cargo` as `npm` + `tsc` rolled into one.

### Your first spell

Open `src/main.rs`. Cargo generated a hello world for you:

```rust
fn main() {
    println!("Hello, world!");
}
```

Let's break this down:

- `fn main()` — defines a function called `main`. Every Rust program starts here. In Python you'd write `if __name__ == "__main__":`. In Rust, `main` is always the entry point.
- `println!` — prints text to the terminal. The `!` means it's a **macro**, not a regular function. For now, think of macros as "functions with superpowers" — they can do things regular functions can't, like accept variable numbers of arguments.
- `"Hello, world!"` — a string literal. Rust strings use double quotes (single quotes are for single characters).
- The semicolon `;` ends the statement. Rust requires semicolons — unlike Python, whitespace doesn't matter.

Replace the contents with our Hogwarts greeting:

```rust
fn main() {
    println!("=================================");
    println!("   The Marauder's Map");
    println!("   'I solemnly swear that I");
    println!("    am up to no good.'");
    println!("=================================");
    println!();
    println!("Messrs Moony, Wormtail, Padfoot,");
    println!("and Prongs are proud to present");
    println!("the Marauder's Map.");
}
```

### Running it

```bash
cargo run
```

`cargo run` compiles your code and runs the resulting binary. The first time takes a few seconds — Rust compiles to native machine code (no interpreter, no VM). After that, it only recompiles what changed.

You should see:

```
=================================
   The Marauder's Map
   'I solemnly swear that I
    am up to no good.'
=================================

Messrs Moony, Wormtail, Padfoot,
and Prongs are proud to present
the Marauder's Map.
```

### What just happened?

`cargo run` did three things:
1. **Compiled** `src/main.rs` into a binary at `target/debug/marauders-map`
2. **Linked** it (no dependencies yet, so this is trivial)
3. **Ran** the binary

You can also build without running: `cargo build`. Or check for errors without producing a binary: `cargo check` (faster — useful during development).

> **Common mistake:** Forgetting the semicolon. If you write `println!("hello")` without `;`, Rust will complain. Every statement needs one. The exception is the last expression in a block (we'll see this later).

### Checkpoint: Stage 1

Your project should look like this:

```
marauders-map/
├── Cargo.toml
└── src/
    └── main.rs
```

**`src/main.rs`:**
```rust
fn main() {
    println!("=================================");
    println!("   The Marauder's Map");
    println!("   'I solemnly swear that I");
    println!("    am up to no good.'");
    println!("=================================");
    println!();
    println!("Messrs Moony, Wormtail, Padfoot,");
    println!("and Prongs are proud to present");
    println!("the Marauder's Map.");
}
```

Run `cargo run` and confirm the output. Stage 1 complete — you're a Rust wizard now. Well, a first-year.

---

## Stage 2: The Tile

*Difficulty: Easy · Concepts: enums, match expressions, the Display trait, impl blocks*

Hogwarts is made of stone walls, corridors, doors, and staircases. Before we can draw a map, we need to represent what each cell on the map *is*. In programming terms, we need a **Tile** type.

### Enums: the perfect fit

In Python, you might represent tile types with strings: `"wall"`, `"floor"`, `"door"`. That works, but it's fragile — typo `"wal"` and your code silently breaks. In TypeScript, you might use a union type: `type Tile = "wall" | "floor" | "door"`.

Rust has something better: **enums**. An enum defines a type that can be one of several **variants**:

```rust
/// A single cell on the Marauder's Map.
enum Tile {
    Wall,
    Floor,
    Door,
    Stairs,
    Empty,
}
```

Each variant is a distinct value. You can't accidentally create a `Tile::Wal` — the compiler catches it. This is one of Rust's superpowers: if it compiles, a whole class of bugs is already eliminated.

> **Python comparison:** Python has `enum.Enum`, but it's opt-in and rarely enforced. Rust enums are the default way to model "one of these things."

> **TypeScript comparison:** Like a discriminated union, but checked at compile time with zero runtime cost.

The `///` above the enum is a **doc comment**. It generates documentation when you run `cargo doc`.

### Displaying tiles as characters

Each tile needs a visual representation for our map. We'll use the `Display` trait — Rust's equivalent of Python's `__str__` or TypeScript's `toString()`.

A **trait** is like an interface: it defines behavior that types can implement. `Display` says "this type can be formatted as a string." Here's how we implement it:

```rust
use std::fmt;

/// A single cell on the Marauder's Map.
#[derive(Clone, Copy)]
enum Tile {
    Wall,
    Floor,
    Door,
    Stairs,
    Empty,
}

impl fmt::Display for Tile {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let ch = match self {
            Tile::Wall => '#',
            Tile::Floor => '.',
            Tile::Door => 'D',
            Tile::Stairs => 'S',
            Tile::Empty => ' ',
        };
        write!(f, "{}", ch)
    }
}
```

Let's unpack this piece by piece.

**`use std::fmt;`** — imports the `fmt` module from Rust's standard library. Like `from std import fmt` in Python or `import { fmt } from 'std'` in TS (conceptually).

**`#[derive(Clone, Copy)]`** — this is an **attribute** that auto-generates code. `Clone` means "this type can be duplicated" and `Copy` means "duplicating is cheap — just copy the bits." Simple enums like ours are always `Copy`. Without this, Rust's ownership system would prevent us from using a tile value after passing it somewhere (we'll explore ownership deeply in later acts).

**`impl fmt::Display for Tile`** — "implement the Display trait for our Tile type." The `impl` keyword starts an implementation block.

**`fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result`** — the function signature that `Display` requires. Don't worry about every detail yet:
- `&self` — a reference to the tile (we're *borrowing* it, not consuming it)
- `f: &mut fmt::Formatter<'_>` — the output buffer we write to
- `-> fmt::Result` — returns Ok or an error

**`match self { ... }`** — this is Rust's **pattern matching**, and it's incredible. It's like a `switch` statement that the compiler *guarantees* covers every case. If you add a new variant to `Tile` and forget to handle it in a `match`, the code won't compile.

> **Common mistake:** Forgetting a variant in `match`. Try commenting out the `Tile::Empty` arm — you'll get: `error[E0004]: non-exhaustive patterns: Tile::Empty not covered`. The compiler has your back.

**`write!(f, "{}", ch)`** — writes the character to the formatter. The `{}` is a placeholder, like Python's `f"{ch}"` or JavaScript's template literals.

### Testing it

Update `src/main.rs` to use our new tile:

```rust
use std::fmt;

#[derive(Clone, Copy)]
enum Tile {
    Wall,
    Floor,
    Door,
    Stairs,
    Empty,
}

impl fmt::Display for Tile {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let ch = match self {
            Tile::Wall => '#',
            Tile::Floor => '.',
            Tile::Door => 'D',
            Tile::Stairs => 'S',
            Tile::Empty => ' ',
        };
        write!(f, "{}", ch)
    }
}

fn main() {
    // Create one of each tile and print it
    let tiles = [
        Tile::Wall,
        Tile::Floor,
        Tile::Door,
        Tile::Stairs,
        Tile::Empty,
    ];

    println!("=== Tile Legend ===");
    for tile in &tiles {
        // {:?} uses Debug formatting, {} uses Display
        println!("  {} = {:?}", tile, tile);
    }
}
```

Wait — this won't compile yet! We're using `{:?}` (debug formatting) but haven't told Rust how to debug-print our enum. Add `Debug` to the derive:

```rust
#[derive(Clone, Copy, Debug)]
enum Tile {
```

`Debug` is another trait, like `Display`, but for programmer-facing output. `derive` auto-generates it — you don't have to write it by hand.

Now run it:

```bash
cargo run
```

```
=== Tile Legend ===
  # = Wall
  . = Floor
  D = Door
  S = Stairs
    = Empty
```

### What we learned

- **Enums** model "one of these things" — perfect for tile types
- **`match`** is exhaustive pattern matching — the compiler ensures you handle every variant
- **Traits** define shared behavior (`Display` for user-facing strings, `Debug` for programmer output)
- **`derive`** auto-generates common trait implementations
- **`impl`** blocks attach methods and trait implementations to types

### Checkpoint: Stage 2

**`src/main.rs`:**
```rust
use std::fmt;

#[derive(Clone, Copy, Debug)]
enum Tile {
    Wall,
    Floor,
    Door,
    Stairs,
    Empty,
}

impl fmt::Display for Tile {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let ch = match self {
            Tile::Wall => '#',
            Tile::Floor => '.',
            Tile::Door => 'D',
            Tile::Stairs => 'S',
            Tile::Empty => ' ',
        };
        write!(f, "{}", ch)
    }
}

fn main() {
    let tiles = [
        Tile::Wall,
        Tile::Floor,
        Tile::Door,
        Tile::Stairs,
        Tile::Empty,
    ];

    println!("=== Tile Legend ===");
    for tile in &tiles {
        println!("  {} = {:?}", tile, tile);
    }
}
```

Run `cargo run` and confirm the legend prints correctly. On to the grid!


---

## Stage 3: The Grid

*Difficulty: Easy · Concepts: Vec, nested vectors, indexing, for loops, closures*

A single tile is useless. We need a *grid* of tiles — a 2D array that represents a room in Hogwarts. Time to meet Rust's most important collection: `Vec`.

### Vec: Rust's dynamic array

In Python you have `list`. In TypeScript, `Array`. In Rust, it's `Vec<T>` (pronounced "vec of T"), where `T` is the type of element it holds.

```rust
let corridor: Vec<Tile> = vec![Tile::Floor; 10];
```

This creates a vector of 10 floor tiles. The `vec!` macro is shorthand for creating vectors. `[Tile::Floor; 10]` means "repeat `Tile::Floor` ten times." This only works because `Tile` implements `Copy` (from our `derive` in Stage 2).

> **Python comparison:** `corridor = [Tile.Floor] * 10`
> **TypeScript comparison:** `const corridor = Array(10).fill(Tile.Floor)`

### Building a 2D grid

A map grid is a vector of vectors: `Vec<Vec<Tile>>`. Each inner vector is a row.

Let's build a small 20×10 room — a simplified version of the Great Hall:

```rust
fn build_great_hall() -> Vec<Vec<Tile>> {
    let width = 20;
    let height = 10;

    // Start with all floors
    let mut grid: Vec<Vec<Tile>> = vec![vec![Tile::Floor; width]; height];

    // Add walls around the edges
    for x in 0..width {
        grid[0][x] = Tile::Wall;           // top wall
        grid[height - 1][x] = Tile::Wall;  // bottom wall
    }
    for y in 0..height {
        grid[y][0] = Tile::Wall;           // left wall
        grid[y][width - 1] = Tile::Wall;   // right wall
    }

    // Add a door on the right wall
    grid[5][width - 1] = Tile::Door;

    // Add stairs in the corner
    grid[8][17] = Tile::Stairs;

    grid
}
```

Let's break down the new concepts:

**`fn build_great_hall() -> Vec<Vec<Tile>>`** — a function that *returns* a 2D grid. The `->` specifies the return type. In Python, return types are optional hints. In Rust, they're mandatory and enforced.

**`let mut grid`** — the `mut` keyword makes the variable **mutable**. By default, all variables in Rust are immutable (like `const` in JavaScript or `final` in Java). You must explicitly opt into mutability. This prevents accidental changes — a common source of bugs.

> **Python comparison:** Python variables are always mutable. Rust makes you think about it.

**`vec![vec![Tile::Floor; width]; height]`** — creates `height` rows, each containing `width` floor tiles. The outer `vec!` creates the rows, the inner one creates each row's contents.

**`0..width`** — a **range**. Like Python's `range(0, width)`. It's exclusive on the upper end: `0..20` gives you 0 through 19.

**`grid[0][x]`** — indexing. `grid[0]` gets the first row (a `Vec<Tile>`), then `[x]` gets the tile at column `x`. Just like Python's `grid[0][x]`.

**`grid`** on the last line — this is the return value. In Rust, the last expression in a function (without a semicolon) is the return value. No `return` keyword needed. Adding a semicolon would make it a statement instead of an expression, and the function would return `()` (Rust's "nothing" type, like Python's `None`).

> **Common mistake:** Adding a semicolon to the last line: `grid;` — this changes the return type to `()` and you'll get a type mismatch error. If you want to be explicit, write `return grid;` with the semicolon.

### Printing the grid

Now let's render it to the terminal:

```rust
fn print_grid(grid: &Vec<Vec<Tile>>) {
    for row in grid {
        for tile in row {
            print!("{}", tile);
        }
        println!();
    }
}
```

**`grid: &Vec<Vec<Tile>>`** — the `&` means we're **borrowing** the grid, not taking ownership of it. This is your first taste of Rust's ownership system:

- Without `&`: the function *takes* the grid. The caller can't use it anymore.
- With `&`: the function *borrows* the grid. The caller keeps it.

Think of it like lending a book. `&` means "I'm lending you my book to read." Without `&`, it means "I'm giving you my book — it's yours now."

> **Python comparison:** Python passes references by default. Rust makes you choose.

**`print!`** vs **`println!`** — `print!` doesn't add a newline, `println!` does. We use `print!` for tiles within a row, then `println!()` to end the row.

### Putting it together

Update `main()`:

```rust
fn main() {
    println!("=== The Great Hall ===");
    println!();

    let grid = build_great_hall();
    print_grid(&grid);

    println!();
    println!("Legend: # = Wall, . = Floor, D = Door, S = Stairs");
}
```

Note `&grid` — we pass a reference. If we wrote `print_grid(grid)` (without `&`), the grid would be *moved* into the function and we couldn't use it afterward. Try removing the `&` and see what happens — the compiler will tell you exactly what went wrong.

### Running it

```bash
cargo run
```

```
=== The Great Hall ===

####################
#..................#
#..................#
#..................#
#..................#
#..................D
#..................#
#..................#
#.................S#
####################

Legend: # = Wall, . = Floor, D = Door, S = Stairs
```

You've got a room! It's not Hogwarts yet, but it's a start.

### Checkpoint: Stage 3

**`src/main.rs`:**
```rust
use std::fmt;

#[derive(Clone, Copy, Debug)]
enum Tile {
    Wall,
    Floor,
    Door,
    Stairs,
    Empty,
}

impl fmt::Display for Tile {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let ch = match self {
            Tile::Wall => '#',
            Tile::Floor => '.',
            Tile::Door => 'D',
            Tile::Stairs => 'S',
            Tile::Empty => ' ',
        };
        write!(f, "{}", ch)
    }
}

fn build_great_hall() -> Vec<Vec<Tile>> {
    let width = 20;
    let height = 10;

    let mut grid: Vec<Vec<Tile>> = vec![vec![Tile::Floor; width]; height];

    for x in 0..width {
        grid[0][x] = Tile::Wall;
        grid[height - 1][x] = Tile::Wall;
    }
    for y in 0..height {
        grid[y][0] = Tile::Wall;
        grid[y][width - 1] = Tile::Wall;
    }

    grid[5][width - 1] = Tile::Door;
    grid[8][17] = Tile::Stairs;

    grid
}

fn print_grid(grid: &Vec<Vec<Tile>>) {
    for row in grid {
        for tile in row {
            print!("{}", tile);
        }
        println!();
    }
}

fn main() {
    println!("=== The Great Hall ===");
    println!();

    let grid = build_great_hall();
    print_grid(&grid);

    println!();
    println!("Legend: # = Wall, . = Floor, D = Door, S = Stairs");
}
```

---

## Stage 4: The Floor

*Difficulty: Easy · Concepts: structs, methods, String vs &str, associated functions*

A grid of tiles is fine, but a floor of Hogwarts is more than just tiles. It has a name ("Ground Floor"), rooms ("Great Hall", "Filch's Office"), and metadata. Time to learn **structs**.

### Structs: bundling data together

In Python, you'd use a class or a dataclass. In TypeScript, an interface or class. In Rust, we use **structs**:

```rust
struct Room {
    id: String,
    name: String,
    x: usize,
    y: usize,
    width: usize,
    height: usize,
}

struct Floor {
    id: u8,
    name: String,
    grid: Vec<Vec<Tile>>,
    rooms: Vec<Room>,
}
```

Let's unpack the types:

- **`String`** — an owned, heap-allocated string. Like Python's `str` or JavaScript's `string`. You can modify it, grow it, pass it around.
- **`u8`** — an unsigned 8-bit integer (0–255). Rust has specific integer types: `u8`, `u16`, `u32`, `u64` (unsigned) and `i8`, `i16`, `i32`, `i64` (signed). Hogwarts has fewer than 255 floors, so `u8` is plenty.
- **`usize`** — an unsigned integer sized for your platform (64-bit on modern machines). Used for indexing into collections. Like Python's `int` but guaranteed non-negative.

> **Python comparison:** `usize` is what you'd use for list indices. Python lets you use any `int`, but negative indices mean something different. Rust's `usize` can't be negative — no accidental `list[-1]`.

> **TypeScript comparison:** TypeScript's `number` covers all of these. Rust's specific types prevent overflow bugs and make memory layout explicit.

### Adding methods with impl

Structs are just data. To add behavior, we use `impl` blocks:

```rust
impl Floor {
    /// Create a new floor with the given dimensions, filled with empty tiles.
    fn new(id: u8, name: &str, width: usize, height: usize) -> Self {
        Floor {
            id,
            name: name.to_string(),
            grid: vec![vec![Tile::Empty; width]; height],
            rooms: Vec::new(),
        }
    }

    /// Get the width of this floor.
    fn width(&self) -> usize {
        if self.grid.is_empty() { 0 } else { self.grid[0].len() }
    }

    /// Get the height of this floor.
    fn height(&self) -> usize {
        self.grid.len()
    }

    /// Set a tile at the given position.
    fn set_tile(&mut self, x: usize, y: usize, tile: Tile) {
        if y < self.height() && x < self.width() {
            self.grid[y][x] = tile;
        }
    }

    /// Add a room and carve it into the grid.
    fn add_room(&mut self, id: &str, name: &str, x: usize, y: usize, w: usize, h: usize) {
        // Walls around the room
        for rx in x..x + w {
            self.set_tile(rx, y, Tile::Wall);
            self.set_tile(rx, y + h - 1, Tile::Wall);
        }
        for ry in y..y + h {
            self.set_tile(x, ry, Tile::Wall);
            self.set_tile(x + w - 1, ry, Tile::Wall);
        }
        // Floor inside
        for ry in (y + 1)..(y + h - 1) {
            for rx in (x + 1)..(x + w - 1) {
                self.set_tile(rx, ry, Tile::Floor);
            }
        }

        self.rooms.push(Room {
            id: id.to_string(),
            name: name.to_string(),
            x, y, width: w, height: h,
        });
    }

    /// Print the floor to stdout.
    fn print(&self) {
        println!("=== {} (Floor {}) ===", self.name, self.id);
        println!();
        for row in &self.grid {
            for tile in row {
                print!("{}", tile);
            }
            println!();
        }
    }
}
```

Key concepts:

**`fn new(...) -> Self`** — an **associated function** (like a static method or constructor). `Self` refers to the type being implemented (`Floor`). There's no `self` parameter, so you call it as `Floor::new(...)`, not `floor.new(...)`. Rust doesn't have constructors — `new` is just a convention.

> **Python comparison:** `Floor.new(...)` is like `Floor(...)` — Python's `__init__` is called automatically, but in Rust you write the constructor explicitly.

**`name: &str`** — a **string slice** (a borrowed reference to string data). The difference between `String` and `&str` is crucial:
- `String` — you own it. Heap-allocated. Can modify it.
- `&str` — you're borrowing it. Could point to a `String`, a string literal, or part of a string.

We accept `&str` in function parameters (flexible — accepts both `String` and literals) and store `String` in structs (owned — the struct needs to own its data).

**`name.to_string()`** — converts a `&str` to an owned `String`. Like making a copy of the borrowed book so you can keep it.

**`&self`** vs **`&mut self`** — methods that only read data take `&self`. Methods that modify data take `&mut self`. The compiler enforces this: you can't call a `&mut self` method on an immutable reference.

**`self.grid[y][x]`** — note the order: row first (`y`), then column (`x`). This is because our grid is `Vec<Vec<Tile>>` — a vector of rows.

**`Vec::new()`** — creates an empty vector. Like `[]` in Python or `[]` in TypeScript.

**Field shorthand:** `id: id.to_string()` can be shortened to just `id` when the field name matches the variable name. We use this for `x`, `y`, etc.

### Building the Ground Floor

Let's create a simplified Ground Floor:

```rust
fn build_ground_floor() -> Floor {
    let mut floor = Floor::new(0, "Ground Floor", 40, 20);

    // Outer walls
    for x in 0..40 {
        floor.set_tile(x, 0, Tile::Wall);
        floor.set_tile(x, 19, Tile::Wall);
    }
    for y in 0..20 {
        floor.set_tile(0, y, Tile::Wall);
        floor.set_tile(39, y, Tile::Wall);
    }

    // Corridors (floor tiles connecting rooms)
    for x in 1..39 {
        floor.set_tile(x, 9, Tile::Floor);
    }
    for y in 1..19 {
        floor.set_tile(19, y, Tile::Floor);
    }

    // Rooms
    floor.add_room("great_hall", "Great Hall", 2, 2, 16, 6);
    floor.add_room("entrance_hall", "Entrance Hall", 21, 2, 17, 6);
    floor.add_room("filch_office", "Filch's Office", 2, 11, 16, 4);
    floor.add_room("courtyard", "Courtyard", 2, 16, 16, 3);
    floor.add_room("kitchen", "Kitchen", 21, 16, 17, 3);

    // Doors
    floor.set_tile(17, 5, Tile::Door);  // Great Hall exit
    floor.set_tile(21, 5, Tile::Door);  // Entrance Hall entrance
    floor.set_tile(17, 12, Tile::Door); // Filch's Office
    floor.set_tile(30, 13, Tile::Stairs); // Stairs to first floor

    floor
}
```

### Update main

```rust
fn main() {
    let floor = build_ground_floor();
    floor.print();

    println!();
    println!("Rooms on this floor:");
    for room in &floor.rooms {
        println!("  - {} ({})", room.name, room.id);
    }
}
```

### Running it

```bash
cargo run
```

You should see a 40×20 map with rooms carved out, connected by corridors, with doors and stairs marked. The room list prints below.

### Checkpoint: Stage 4

**`src/main.rs`:**
```rust
use std::fmt;

#[derive(Clone, Copy, Debug)]
enum Tile {
    Wall,
    Floor,
    Door,
    Stairs,
    Empty,
}

impl fmt::Display for Tile {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let ch = match self {
            Tile::Wall => '#',
            Tile::Floor => '.',
            Tile::Door => 'D',
            Tile::Stairs => 'S',
            Tile::Empty => ' ',
        };
        write!(f, "{}", ch)
    }
}

struct Room {
    id: String,
    name: String,
    x: usize,
    y: usize,
    width: usize,
    height: usize,
}

struct Floor {
    id: u8,
    name: String,
    grid: Vec<Vec<Tile>>,
    rooms: Vec<Room>,
}

impl Floor {
    fn new(id: u8, name: &str, width: usize, height: usize) -> Self {
        Floor {
            id,
            name: name.to_string(),
            grid: vec![vec![Tile::Empty; width]; height],
            rooms: Vec::new(),
        }
    }

    fn width(&self) -> usize {
        if self.grid.is_empty() { 0 } else { self.grid[0].len() }
    }

    fn height(&self) -> usize {
        self.grid.len()
    }

    fn set_tile(&mut self, x: usize, y: usize, tile: Tile) {
        if y < self.height() && x < self.width() {
            self.grid[y][x] = tile;
        }
    }

    fn add_room(&mut self, id: &str, name: &str, x: usize, y: usize, w: usize, h: usize) {
        for rx in x..x + w {
            self.set_tile(rx, y, Tile::Wall);
            self.set_tile(rx, y + h - 1, Tile::Wall);
        }
        for ry in y..y + h {
            self.set_tile(x, ry, Tile::Wall);
            self.set_tile(x + w - 1, ry, Tile::Wall);
        }
        for ry in (y + 1)..(y + h - 1) {
            for rx in (x + 1)..(x + w - 1) {
                self.set_tile(rx, ry, Tile::Floor);
            }
        }
        self.rooms.push(Room {
            id: id.to_string(),
            name: name.to_string(),
            x, y, width: w, height: h,
        });
    }

    fn print(&self) {
        println!("=== {} (Floor {}) ===", self.name, self.id);
        println!();
        for row in &self.grid {
            for tile in row {
                print!("{}", tile);
            }
            println!();
        }
    }
}

fn build_ground_floor() -> Floor {
    let mut floor = Floor::new(0, "Ground Floor", 40, 20);

    for x in 0..40 {
        floor.set_tile(x, 0, Tile::Wall);
        floor.set_tile(x, 19, Tile::Wall);
    }
    for y in 0..20 {
        floor.set_tile(0, y, Tile::Wall);
        floor.set_tile(39, y, Tile::Wall);
    }

    for x in 1..39 {
        floor.set_tile(x, 9, Tile::Floor);
    }
    for y in 1..19 {
        floor.set_tile(19, y, Tile::Floor);
    }

    floor.add_room("great_hall", "Great Hall", 2, 2, 16, 6);
    floor.add_room("entrance_hall", "Entrance Hall", 21, 2, 17, 6);
    floor.add_room("filch_office", "Filch's Office", 2, 11, 16, 4);
    floor.add_room("courtyard", "Courtyard", 2, 16, 16, 3);
    floor.add_room("kitchen", "Kitchen", 21, 16, 17, 3);

    floor.set_tile(17, 5, Tile::Door);
    floor.set_tile(21, 5, Tile::Door);
    floor.set_tile(17, 12, Tile::Door);
    floor.set_tile(30, 13, Tile::Stairs);

    floor
}

fn main() {
    let floor = build_ground_floor();
    floor.print();

    println!();
    println!("Rooms on this floor:");
    for room in &floor.rooms {
        println!("  - {} ({})", room.name, room.id);
    }
}
```


---

## Stage 5: Enter ratatui

*Difficulty: Medium · Concepts: external crates, terminal UI, event loops, closures, the Widget trait*

Printing to stdout is fine for debugging, but the Marauder's Map deserves a proper terminal UI. Time to bring in **ratatui** — Rust's premier TUI framework — and **crossterm** — the cross-platform terminal backend.

### Adding dependencies

Open `Cargo.toml` and add the dependencies:

```toml
[package]
name = "marauders-map"
version = "0.1.0"
edition = "2024"

[dependencies]
ratatui = "0.30"
crossterm = "0.29"
```

Run `cargo build` to download and compile them. This takes a minute the first time — ratatui and crossterm bring in several sub-crates. Subsequent builds are fast.

> **Python comparison:** This is like adding `ratatui = "^0.30"` to `pyproject.toml` and running `pip install`.
> **TypeScript comparison:** Like `npm install ratatui@0.30`.

### How terminal UIs work

Normal terminal output scrolls forever. A TUI takes over the entire terminal:

1. **Enter alternate screen** — switches to a blank canvas (your original terminal content is preserved)
2. **Enable raw mode** — keypresses are delivered immediately (no waiting for Enter)
3. **Draw loop** — render the UI, handle input, repeat
4. **Restore** — switch back to the normal terminal

ratatui 0.30 makes this easy with `ratatui::init()` and `ratatui::restore()`.

### The game loop

Every game (and every TUI app) has the same structure:

```
loop {
    draw the screen
    check for input
    update state
}
```

Let's build this. Replace your entire `src/main.rs`:

```rust
use std::fmt;
use std::time::Duration;

use crossterm::event::{self, Event, KeyCode, KeyEventKind};
use ratatui::Frame;
use ratatui::style::{Color, Style};
use ratatui::layout::Rect;
use ratatui::widgets::{Block, Paragraph};

// ── Tile ──────────────────────────────────────────────

#[derive(Clone, Copy, Debug)]
enum Tile {
    Wall,
    Floor,
    Door,
    Stairs,
    Empty,
}

impl Tile {
    fn to_char(self) -> char {
        match self {
            Tile::Wall => '#',
            Tile::Floor => '.',
            Tile::Door => 'D',
            Tile::Stairs => 'S',
            Tile::Empty => ' ',
        }
    }

    fn style(self) -> Style {
        match self {
            Tile::Wall => Style::default().fg(Color::DarkGray),
            Tile::Floor => Style::default().fg(Color::Gray),
            Tile::Door => Style::default().fg(Color::Yellow),
            Tile::Stairs => Style::default().fg(Color::Cyan),
            Tile::Empty => Style::default(),
        }
    }
}

impl fmt::Display for Tile {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.to_char())
    }
}

// ── Room & Floor ──────────────────────────────────────

struct Room {
    id: String,
    name: String,
    x: usize,
    y: usize,
    width: usize,
    height: usize,
}

struct Floor {
    id: u8,
    name: String,
    grid: Vec<Vec<Tile>>,
    rooms: Vec<Room>,
}

impl Floor {
    fn new(id: u8, name: &str, width: usize, height: usize) -> Self {
        Floor {
            id,
            name: name.to_string(),
            grid: vec![vec![Tile::Empty; width]; height],
            rooms: Vec::new(),
        }
    }

    fn width(&self) -> usize {
        if self.grid.is_empty() { 0 } else { self.grid[0].len() }
    }

    fn height(&self) -> usize {
        self.grid.len()
    }

    fn set_tile(&mut self, x: usize, y: usize, tile: Tile) {
        if y < self.height() && x < self.width() {
            self.grid[y][x] = tile;
        }
    }

    fn add_room(&mut self, id: &str, name: &str, x: usize, y: usize, w: usize, h: usize) {
        for rx in x..x + w {
            self.set_tile(rx, y, Tile::Wall);
            self.set_tile(rx, y + h - 1, Tile::Wall);
        }
        for ry in y..y + h {
            self.set_tile(x, ry, Tile::Wall);
            self.set_tile(x + w - 1, ry, Tile::Wall);
        }
        for ry in (y + 1)..(y + h - 1) {
            for rx in (x + 1)..(x + w - 1) {
                self.set_tile(rx, ry, Tile::Floor);
            }
        }
        self.rooms.push(Room {
            id: id.to_string(),
            name: name.to_string(),
            x, y, width: w, height: h,
        });
    }
}

// ── Game State ────────────────────────────────────────

struct Game {
    floor: Floor,
    player_x: usize,
    player_y: usize,
    running: bool,
}

impl Game {
    fn new(floor: Floor, start_x: usize, start_y: usize) -> Self {
        Game {
            floor,
            player_x: start_x,
            player_y: start_y,
            running: true,
        }
    }

    fn move_player(&mut self, dx: i32, dy: i32) {
        let new_x = self.player_x as i32 + dx;
        let new_y = self.player_y as i32 + dy;

        // Bounds check
        if new_x < 0 || new_y < 0 {
            return;
        }
        let new_x = new_x as usize;
        let new_y = new_y as usize;

        if new_y >= self.floor.height() || new_x >= self.floor.width() {
            return;
        }

        // Can we walk on this tile?
        match self.floor.grid[new_y][new_x] {
            Tile::Floor | Tile::Door | Tile::Stairs => {
                self.player_x = new_x;
                self.player_y = new_y;
            }
            _ => {} // Wall or Empty — can't walk there
        }
    }
}

// ── Build the map ─────────────────────────────────────

fn build_ground_floor() -> Floor {
    let mut floor = Floor::new(0, "Ground Floor", 40, 20);

    for x in 0..40 {
        floor.set_tile(x, 0, Tile::Wall);
        floor.set_tile(x, 19, Tile::Wall);
    }
    for y in 0..20 {
        floor.set_tile(0, y, Tile::Wall);
        floor.set_tile(39, y, Tile::Wall);
    }
    for x in 1..39 {
        floor.set_tile(x, 9, Tile::Floor);
    }
    for y in 1..19 {
        floor.set_tile(19, y, Tile::Floor);
    }

    floor.add_room("great_hall", "Great Hall", 2, 2, 16, 6);
    floor.add_room("entrance_hall", "Entrance Hall", 21, 2, 17, 6);
    floor.add_room("filch_office", "Filch's Office", 2, 11, 16, 4);
    floor.add_room("courtyard", "Courtyard", 2, 16, 16, 3);
    floor.add_room("kitchen", "Kitchen", 21, 16, 17, 3);

    floor.set_tile(17, 5, Tile::Door);
    floor.set_tile(21, 5, Tile::Door);
    floor.set_tile(17, 12, Tile::Door);
    floor.set_tile(30, 13, Tile::Stairs);

    floor
}

// ── Rendering ─────────────────────────────────────────

fn render(frame: &mut Frame, game: &Game) {
    let area = frame.area();

    // Title bar
    let title = format!(
        " The Marauder's Map — {} — [q]uit [arrows] move ",
        game.floor.name
    );
    let block = Block::bordered().title(title);
    let inner = block.inner(area);
    frame.render_widget(block, area);

    // Render the grid tile by tile into the inner area
    let buf = frame.buffer_mut();
    for y in 0..game.floor.height() {
        for x in 0..game.floor.width() {
            let screen_x = inner.x + x as u16;
            let screen_y = inner.y + y as u16;

            // Only draw if within the inner area
            if screen_x >= inner.x + inner.width || screen_y >= inner.y + inner.height {
                continue;
            }

            if x == game.player_x && y == game.player_y {
                // Draw the player
                buf.set_string(
                    screen_x,
                    screen_y,
                    "@",
                    Style::default().fg(Color::Green),
                );
            } else {
                let tile = game.floor.grid[y][x];
                buf.set_string(
                    screen_x,
                    screen_y,
                    tile.to_char().to_string(),
                    tile.style(),
                );
            }
        }
    }
}

fn handle_input(game: &mut Game) -> std::io::Result<()> {
    // Poll for events with a 50ms timeout (gives us ~20 FPS)
    if event::poll(Duration::from_millis(50))? {
        if let Event::Key(key) = event::read()? {
            if key.kind == KeyEventKind::Press {
                match key.code {
                    KeyCode::Char('q') | KeyCode::Esc => game.running = false,
                    KeyCode::Up | KeyCode::Char('w') => game.move_player(0, -1),
                    KeyCode::Down | KeyCode::Char('s') => game.move_player(0, 1),
                    KeyCode::Left | KeyCode::Char('a') => game.move_player(-1, 0),
                    KeyCode::Right | KeyCode::Char('d') => game.move_player(1, 0),
                    _ => {}
                }
            }
        }
    }
    Ok(())
}

// ── Main ──────────────────────────────────────────────

fn main() -> std::io::Result<()> {
    let floor = build_ground_floor();
    let mut game = Game::new(floor, 28, 7);

    // Initialize the terminal
    let mut terminal = ratatui::init();

    // Game loop
    while game.running {
        terminal.draw(|frame| render(frame, &game))?;
        handle_input(&mut game)?;
    }

    // Restore the terminal
    ratatui::restore();
    Ok(())
}
```

That's a big jump! Let's walk through the new pieces.

### The main function

```rust
fn main() -> std::io::Result<()> {
```

Our `main` now returns a `Result`. This is Rust's error handling: `Result<T, E>` is either `Ok(T)` (success) or `Err(E)` (failure). `std::io::Result<()>` means "either succeeds with nothing, or fails with an I/O error." The `?` operator propagates errors — if something fails, the function returns the error immediately.

> **Python comparison:** Like wrapping everything in `try/except IOError`, but enforced by the compiler. You *can't* forget to handle errors.

### Terminal initialization

```rust
let mut terminal = ratatui::init();
```

`ratatui::init()` does three things: enters the alternate screen, enables raw mode, and creates a `DefaultTerminal` instance. When we're done, `ratatui::restore()` undoes everything.

### The draw call

```rust
terminal.draw(|frame| render(frame, &game))?;
```

`terminal.draw()` takes a **closure** — an anonymous function. The `|frame|` part declares the closure's parameter. ratatui calls your closure with a `Frame`, you render widgets into it, and ratatui figures out what changed and updates only the diff.

> **Python comparison:** `terminal.draw(lambda frame: render(frame, game))`
> **TypeScript comparison:** `terminal.draw((frame) => render(frame, game))`

### Direct buffer access

Instead of using a high-level widget for the map, we write directly to the frame's buffer:

```rust
let buf = frame.buffer_mut();
buf.set_string(screen_x, screen_y, "@", Style::default().fg(Color::Green));
```

`frame.buffer_mut()` gives us mutable access to the underlying `Buffer` — a grid of cells. `set_string()` writes a string at a position with a style. This is the lowest-level way to render in ratatui, and it's perfect for our tile grid where we need per-character control.

### Event handling

```rust
if event::poll(Duration::from_millis(50))? {
    if let Event::Key(key) = event::read()? {
```

`event::poll()` checks if an event is available within the timeout. `event::read()` blocks until one arrives. We use `poll` with a 50ms timeout so the game loop runs at ~20 iterations per second even when no keys are pressed (important later when NPCs move on their own).

`if let` is **pattern matching in an if statement**. It says "if this event is a Key event, bind it to `key`; otherwise skip." It's like a `match` with only one arm.

`key.kind == KeyEventKind::Press` — crossterm fires events for key press, repeat, and release. We only care about presses.

### Running it

```bash
cargo run
```

You should see the map rendered in your terminal with a border, a green `@` for the player, and colored tiles. Use arrow keys or WASD to move. Press `q` to quit.

> **Common mistake:** If the terminal looks garbled after a crash, run `reset` in your terminal. This happens when the program exits without calling `ratatui::restore()`. In production code, you'd set up a panic hook — we'll do that in a later act.

### Checkpoint: Stage 5

The full code is above. Key additions:
- `Cargo.toml` now has `ratatui = "0.30"` and `crossterm = "0.29"`
- `Game` struct holds player position and running state
- `render()` draws tiles directly to the frame buffer
- `handle_input()` processes keyboard events
- `main()` runs the game loop with `ratatui::init()` / `ratatui::restore()`


---

## Stage 6: The Viewport

*Difficulty: Medium · Concepts: camera systems, clamping, usize arithmetic, saturating operations*

Our map is 40×20 — small enough to fit on screen. But Hogwarts is vast. A real floor might be 200×100 tiles. We need a **viewport** — a camera that follows the player and only renders the visible portion of the map.

### The camera concept

Imagine the map is a huge parchment and your terminal is a window placed on top of it. The viewport defines which rectangle of the parchment you can see. As the player moves, the window slides to keep them centered.

```
Full map (200x100):
┌──────────────────────────────────────────┐
│                                          │
│         ┌─────────────┐                  │
│         │  Viewport   │                  │
│         │     @       │                  │
│         │  (terminal) │                  │
│         └─────────────┘                  │
│                                          │
└──────────────────────────────────────────┘
```

### Adding a Camera struct

Add this after the `Game` struct:

```rust
struct Camera {
    x: usize,
    y: usize,
}

impl Camera {
    /// Center the camera on the player, clamped to map bounds.
    fn update(&mut self, player_x: usize, player_y: usize,
              map_width: usize, map_height: usize,
              view_width: usize, view_height: usize) {
        // Where we'd *like* the camera to be (player centered)
        let half_w = view_width / 2;
        let half_h = view_height / 2;

        // Use saturating_sub to avoid underflow on usize
        let ideal_x = player_x.saturating_sub(half_w);
        let ideal_y = player_y.saturating_sub(half_h);

        // Clamp so the camera doesn't show area beyond the map
        let max_x = map_width.saturating_sub(view_width);
        let max_y = map_height.saturating_sub(view_height);

        self.x = ideal_x.min(max_x);
        self.y = ideal_y.min(max_y);
    }
}
```

**`saturating_sub`** is critical here. `usize` is unsigned — it can't go below zero. If the player is at x=5 and half the viewport is 20, then `5 - 20` would underflow and panic (or wrap to a huge number). `saturating_sub` clamps to zero instead: `5.saturating_sub(20)` returns `0`.

> **Python comparison:** Python integers can be negative, so you'd just use `max(0, player_x - half_w)`. In Rust with `usize`, subtraction can panic, so we use `saturating_sub`.

> **Common mistake:** Writing `player_x - half_w` with `usize` values. If `player_x < half_w`, this panics in debug mode and wraps in release mode. Always use `saturating_sub` for unsigned subtraction that might go negative.

**`.min(max_x)`** — returns the smaller of the two values. This clamps the camera so it doesn't scroll past the right/bottom edge of the map.

### Updating the Game struct

Add the camera to `Game`:

```rust
struct Game {
    floor: Floor,
    player_x: usize,
    player_y: usize,
    camera: Camera,
    running: bool,
}

impl Game {
    fn new(floor: Floor, start_x: usize, start_y: usize) -> Self {
        Game {
            floor,
            player_x: start_x,
            player_y: start_y,
            camera: Camera { x: 0, y: 0 },
            running: true,
        }
    }

    fn move_player(&mut self, dx: i32, dy: i32) {
        let new_x = self.player_x as i32 + dx;
        let new_y = self.player_y as i32 + dy;

        if new_x < 0 || new_y < 0 {
            return;
        }
        let new_x = new_x as usize;
        let new_y = new_y as usize;

        if new_y >= self.floor.height() || new_x >= self.floor.width() {
            return;
        }

        match self.floor.grid[new_y][new_x] {
            Tile::Floor | Tile::Door | Tile::Stairs => {
                self.player_x = new_x;
                self.player_y = new_y;
            }
            _ => {}
        }
    }
}
```

### Updating the render function

Now the render function uses the camera to determine which tiles are visible:

```rust
fn render(frame: &mut Frame, game: &mut Game) {
    let area = frame.area();

    let title = format!(
        " The Marauder's Map — {} — [q]uit [arrows] move ",
        game.floor.name
    );
    let block = Block::bordered().title(title);
    let inner = block.inner(area);
    frame.render_widget(block, area);

    // Update camera to follow the player
    game.camera.update(
        game.player_x, game.player_y,
        game.floor.width(), game.floor.height(),
        inner.width as usize, inner.height as usize,
    );

    let buf = frame.buffer_mut();

    // Only render tiles visible through the viewport
    for screen_y in 0..inner.height {
        for screen_x in 0..inner.width {
            let map_x = game.camera.x + screen_x as usize;
            let map_y = game.camera.y + screen_y as usize;

            let draw_x = inner.x + screen_x;
            let draw_y = inner.y + screen_y;

            // Check map bounds
            if map_y >= game.floor.height() || map_x >= game.floor.width() {
                buf.set_string(draw_x, draw_y, " ", Style::default());
                continue;
            }

            if map_x == game.player_x && map_y == game.player_y {
                buf.set_string(
                    draw_x, draw_y, "@",
                    Style::default().fg(Color::Green),
                );
            } else {
                let tile = game.floor.grid[map_y][map_x];
                buf.set_string(
                    draw_x, draw_y,
                    tile.to_char().to_string(),
                    tile.style(),
                );
            }
        }
    }
}
```

The key change: instead of iterating over map coordinates and converting to screen coordinates, we iterate over **screen coordinates** and convert to map coordinates using the camera offset. This naturally handles the case where the map is larger than the screen.

**`inner.width as usize`** — `inner.width` is `u16` (ratatui uses `u16` for screen coordinates). We cast to `usize` for our map indexing. The `as` keyword does type conversion in Rust.

### Updating the draw call

Since `render` now takes `&mut Game` (to update the camera), update the draw call:

```rust
// In main():
while game.running {
    terminal.draw(|frame| render(frame, &mut game))?;
    handle_input(&mut game)?;
}
```

### Testing it

To see the viewport in action, make the map bigger than your terminal. Change `build_ground_floor` to create a larger map (or just resize your terminal to be smaller than 40 columns). The camera will follow the player and scroll at the edges.

### Checkpoint: Stage 6

The changes from Stage 5:
- Added `Camera` struct with `update()` method using `saturating_sub` and `min`
- Added `camera` field to `Game`
- `render()` now iterates screen coordinates and maps them to world coordinates via the camera
- `render()` takes `&mut Game` to update the camera each frame

The full code is the Stage 5 checkpoint with the `Camera` struct added and the `Game`/`render` functions updated as shown above.


---

## Stage 7: Map from JSON

*Difficulty: Medium · Concepts: serde, Deserialize, file I/O, Result, error handling, the ? operator*

Hardcoding the map in Rust is tedious. Real games load maps from files. We'll use **serde** (Rust's serialization framework) to load our map from JSON — the same format used by the `maps/ground_floor.json` file in our project.

### Adding serde dependencies

Update `Cargo.toml`:

```toml
[dependencies]
ratatui = "0.30"
crossterm = "0.29"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

`serde` is the core serialization library. The `derive` feature lets us auto-generate serialization code with `#[derive(Deserialize)]`. `serde_json` adds JSON support specifically.

> **Python comparison:** serde is like `json` + `dataclasses` combined. You define your struct, derive `Deserialize`, and serde figures out how to parse JSON into it.
> **TypeScript comparison:** Like `JSON.parse()` but with compile-time type checking. No `as MyType` casting needed.

### The JSON format

Create a `maps/` directory in your project and save this as `maps/ground_floor.json`:

```json
{
  "floors": [
    {
      "id": 0,
      "name": "Ground Floor",
      "width": 40,
      "height": 20,
      "grid": [
        "########################################",
        "#......................................#",
        "#.################.###################.#",
        "#.#  Great Hall  #.# Entrance Hall   #.#",
        "#.#              #.#                 #.#",
        "#.#              #.D                 #.#",
        "#.#              #.#                 #.#",
        "#.#              #.#        @        #.#",
        "#.################.#########D#########.#",
        "#..................#.........#.........#",
        "#.################.#.#######.#.######.#",
        "#.# Filch Office #.#.# Corridor     #.#",
        "#.#              D.#.#               #.#",
        "#.################.#.#    S          #.#",
        "#..................#.#######D#########.#",
        "#.################.#........#.........#",
        "#.# Courtyard    #.#.################.#",
        "#.#              #.#.# Kitchen       #.#",
        "#.#              #.#.#               #.#",
        "########################################"
      ],
      "legend": {
        "#": "Wall",
        ".": "Floor",
        " ": "Floor",
        "D": "Door",
        "@": "PlayerSpawn",
        "S": "Stairs"
      },
      "rooms": [
        { "id": "great_hall", "name": "Great Hall", "bounds": { "x": 2, "y": 2, "w": 16, "h": 6 } },
        { "id": "entrance_hall", "name": "Entrance Hall", "bounds": { "x": 20, "y": 2, "w": 18, "h": 6 } },
        { "id": "filch_office", "name": "Filch's Office", "bounds": { "x": 2, "y": 10, "w": 16, "h": 4 } },
        { "id": "courtyard", "name": "Courtyard", "bounds": { "x": 2, "y": 15, "w": 16, "h": 4 } },
        { "id": "kitchen", "name": "Kitchen", "bounds": { "x": 24, "y": 15, "w": 14, "h": 4 } }
      ],
      "stairs": [
        { "pos": [30, 13], "destination_floor": 1, "destination_pos": [5, 5] }
      ],
      "player_spawn": [28, 7]
    }
  ]
}
```

The grid is stored as an array of strings — each string is one row, each character is one tile. A legend maps characters to tile types. This is human-readable and easy to edit.

### Defining the JSON structs

We need Rust structs that mirror the JSON structure. serde will map between them automatically:

```rust
use serde::Deserialize;
use std::collections::HashMap;
use std::fs;

// ── JSON data structures ──────────────────────────────

#[derive(Deserialize)]
struct MapFile {
    floors: Vec<FloorData>,
}

#[derive(Deserialize)]
struct FloorData {
    id: u8,
    name: String,
    #[allow(dead_code)]
    width: usize,
    #[allow(dead_code)]
    height: usize,
    grid: Vec<String>,
    legend: HashMap<String, String>,
    rooms: Vec<RoomData>,
    stairs: Vec<StairData>,
    player_spawn: (usize, usize),
}

#[derive(Deserialize)]
struct RoomData {
    id: String,
    name: String,
    bounds: BoundsData,
}

#[derive(Deserialize)]
struct BoundsData {
    x: usize,
    y: usize,
    w: usize,
    h: usize,
}

#[derive(Deserialize)]
struct StairData {
    pos: (usize, usize),
    destination_floor: u8,
    destination_pos: (usize, usize),
}
```

**`#[derive(Deserialize)]`** — this is the magic. serde generates all the JSON parsing code at compile time. Field names must match the JSON keys (or you can use `#[serde(rename = "...")]` to customize).

**`HashMap<String, String>`** — Rust's hash map (like Python's `dict` or JavaScript's `Map`). We use it for the legend that maps characters to tile type names.

**`(usize, usize)`** — a **tuple**. Like Python's `tuple` or TypeScript's `[number, number]`. Fixed-size, can hold different types (though here both are `usize`). serde maps JSON arrays like `[28, 7]` to tuples.

**`#[allow(dead_code)]`** — suppresses the compiler warning about unused fields. We deserialize `width` and `height` from JSON but don't use them directly (we infer dimensions from the grid).

### Parsing the grid

Now we need a function that converts `FloorData` into our `Floor`:

```rust
fn load_floor(data: &FloorData) -> (Floor, usize, usize) {
    let height = data.grid.len();
    let width = if height > 0 { data.grid[0].len() } else { 0 };

    let mut floor = Floor::new(data.id, &data.name, width, height);
    let mut spawn_x = data.player_spawn.0;
    let mut spawn_y = data.player_spawn.1;

    // Parse the character grid using the legend
    for (y, row_str) in data.grid.iter().enumerate() {
        for (x, ch) in row_str.chars().enumerate() {
            let ch_str = ch.to_string();
            let tile_name = data.legend.get(&ch_str).map(|s| s.as_str()).unwrap_or("Floor");

            let tile = match tile_name {
                "Wall" => Tile::Wall,
                "Floor" => Tile::Floor,
                "Door" => Tile::Door,
                "Stairs" => Tile::Stairs,
                "PlayerSpawn" => {
                    spawn_x = x;
                    spawn_y = y;
                    Tile::Floor
                }
                _ => Tile::Empty,
            };
            floor.set_tile(x, y, tile);
        }
    }

    // Add rooms
    for room_data in &data.rooms {
        floor.rooms.push(Room {
            id: room_data.id.clone(),
            name: room_data.name.clone(),
            x: room_data.bounds.x,
            y: room_data.bounds.y,
            width: room_data.bounds.w,
            height: room_data.bounds.h,
        });
    }

    // Place stairs tiles from the stairs array
    for stair in &data.stairs {
        floor.set_tile(stair.pos.0, stair.pos.1, Tile::Stairs);
    }

    (floor, spawn_x, spawn_y)
}
```

New concepts:

**`.iter().enumerate()`** — iterates with an index. Like Python's `enumerate()`. Returns `(index, &item)` pairs.

**`.chars()`** — iterates over the characters of a string. Rust strings are UTF-8, so you can't index them by byte position. `.chars()` gives you actual Unicode characters.

**`.map(|s| s.as_str())`** — transforms an `Option<&String>` to `Option<&str>`. The `|s|` is a closure parameter.

**`.unwrap_or("Floor")`** — if the Option is `None` (character not in legend), default to "Floor".

**`.clone()`** — creates an owned copy of a `String`. We need this because `room_data.id` is a `&String` (borrowed from the `FloorData`), but our `Room` struct needs an owned `String`.

**`(floor, spawn_x, spawn_y)`** — returning a tuple. The function returns three values bundled together.

### Loading from file

```rust
fn load_map(path: &str) -> Result<(Vec<Floor>, usize, usize), String> {
    let contents = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read {}: {}", path, e))?;

    let map_file: MapFile = serde_json::from_str(&contents)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;

    if map_file.floors.is_empty() {
        return Err("No floors in map file".to_string());
    }

    let mut floors = Vec::new();
    let mut spawn_x = 0;
    let mut spawn_y = 0;

    for (i, floor_data) in map_file.floors.iter().enumerate() {
        let (floor, sx, sy) = load_floor(floor_data);
        if i == 0 {
            spawn_x = sx;
            spawn_y = sy;
        }
        floors.push(floor);
    }

    Ok((floors, spawn_x, spawn_y))
}
```

**`fs::read_to_string(path)`** — reads an entire file into a `String`. Returns `Result<String, io::Error>`.

**`.map_err(|e| format!(...))`** — converts one error type to another. Our function returns `Result<..., String>`, but `fs::read_to_string` returns `Result<..., io::Error>`. `map_err` bridges the gap.

**`serde_json::from_str(&contents)`** — the magic line. serde_json parses the JSON string into our `MapFile` struct. The type is inferred from the `let map_file: MapFile` annotation.

**`?`** — the error propagation operator. If the `Result` is `Err`, return it immediately. If it's `Ok`, unwrap the value. This is Rust's elegant alternative to try/catch.

> **Python comparison:** `?` is like writing `try: ... except: raise` but in a single character.

### Updating main

```rust
fn main() -> std::io::Result<()> {
    // Load map from JSON
    let map_path = "maps/ground_floor.json";
    let (floors, spawn_x, spawn_y) = load_map(map_path)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    let floor = floors.into_iter().next()
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::Other, "No floors loaded"))?;

    let mut game = Game::new(floor, spawn_x, spawn_y);

    let mut terminal = ratatui::init();

    while game.running {
        terminal.draw(|frame| render(frame, &mut game))?;
        handle_input(&mut game)?;
    }

    ratatui::restore();
    Ok(())
}
```

**`floors.into_iter().next()`** — `into_iter()` consumes the vector, turning it into an iterator. `.next()` takes the first element. This *moves* the floor out of the vector (no cloning needed). We'll use all floors in Stage 8.

### Running it

Make sure `maps/ground_floor.json` exists, then:

```bash
cargo run
```

The map now loads from JSON! Edit the JSON file, re-run, and see your changes. Try adding a new room or moving the player spawn.

> **Common mistake:** File path is relative to where you run `cargo run`, which is the project root. If you get "Failed to read maps/ground_floor.json", make sure you're running from `~/juk/marauders-map/`.

### Checkpoint: Stage 7

Key additions to `Cargo.toml`:
```toml
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

Key additions to code:
- `MapFile`, `FloorData`, `RoomData`, `BoundsData`, `StairData` structs with `#[derive(Deserialize)]`
- `load_floor()` converts JSON data to our `Floor` type
- `load_map()` reads and parses the JSON file
- `main()` loads from `maps/ground_floor.json` instead of calling `build_ground_floor()`


---

## Stage 8: Multiple Floors

*Difficulty: Medium · Concepts: Vec of structs, state machines, keyboard shortcuts, index management*

Hogwarts has seven floors (plus dungeons). Our JSON already supports multiple floors — now we need to navigate between them. When the player steps on a stair tile, they should transition to the connected floor. We'll also add `<` and `>` keys (like roguelikes) to go up and down stairs.

### Storing stair connections

First, we need to track where stairs lead. Add a `StairConnection` struct and store connections on each floor:

```rust
struct StairConnection {
    from_pos: (usize, usize),
    destination_floor: u8,
    destination_pos: (usize, usize),
}
```

Update `Floor` to hold stair connections:

```rust
struct Floor {
    id: u8,
    name: String,
    grid: Vec<Vec<Tile>>,
    rooms: Vec<Room>,
    stairs: Vec<StairConnection>,
}
```

And update `Floor::new` to initialize `stairs: Vec::new()`.

### Updating load_floor

In `load_floor`, after placing stair tiles, store the connections:

```rust
    // Inside load_floor, after the stair tile placement loop:
    for stair in &data.stairs {
        floor.stairs.push(StairConnection {
            from_pos: stair.pos,
            destination_floor: stair.destination_floor,
            destination_pos: stair.destination_pos,
        });
    }
```

### Multi-floor Game state

The `Game` struct now holds all floors and tracks which one is active:

```rust
struct Game {
    floors: Vec<Floor>,
    current_floor: usize,
    player_x: usize,
    player_y: usize,
    camera: Camera,
    running: bool,
}
```

**`current_floor: usize`** — an index into the `floors` vector. We use `usize` because that's what Rust uses for indexing.

Update the `Game` implementation:

```rust
impl Game {
    fn new(floors: Vec<Floor>, start_x: usize, start_y: usize) -> Self {
        Game {
            floors,
            current_floor: 0,
            player_x: start_x,
            player_y: start_y,
            camera: Camera { x: 0, y: 0 },
            running: true,
        }
    }

    fn floor(&self) -> &Floor {
        &self.floors[self.current_floor]
    }

    fn move_player(&mut self, dx: i32, dy: i32) {
        let new_x = self.player_x as i32 + dx;
        let new_y = self.player_y as i32 + dy;

        if new_x < 0 || new_y < 0 {
            return;
        }
        let new_x = new_x as usize;
        let new_y = new_y as usize;

        let floor = &self.floors[self.current_floor];
        if new_y >= floor.height() || new_x >= floor.width() {
            return;
        }

        match floor.grid[new_y][new_x] {
            Tile::Floor | Tile::Door | Tile::Stairs => {
                self.player_x = new_x;
                self.player_y = new_y;
            }
            _ => {}
        }
    }

    /// Try to use stairs at the player's current position.
    fn use_stairs(&mut self) {
        let floor = &self.floors[self.current_floor];

        // Find a stair connection at the player's position
        for stair in &floor.stairs {
            if stair.from_pos == (self.player_x, self.player_y) {
                // Find the destination floor index
                let dest_floor_id = stair.destination_floor;
                if let Some(idx) = self.floors.iter()
                    .position(|f| f.id == dest_floor_id)
                {
                    self.current_floor = idx;
                    self.player_x = stair.destination_pos.0;
                    self.player_y = stair.destination_pos.1;
                    return;
                }
            }
        }
    }
}
```

**`fn floor(&self) -> &Floor`** — a convenience method that returns a reference to the current floor. The `&` in the return type means we're lending the floor, not giving it away.

**`self.floors.iter().position(|f| f.id == dest_floor_id)`** — searches for a floor by its `id` field. `.position()` returns `Option<usize>` — the index if found, `None` if not. The `|f|` closure tests each floor.

**`if let Some(idx) = ...`** — pattern matching on `Option`. If the floor was found, bind its index to `idx` and execute the block. Otherwise, do nothing.

> **Python comparison:** `next((i for i, f in enumerate(floors) if f.id == dest_id), None)`

### Updating input handling

Add `<` and `>` keys for stairs:

```rust
fn handle_input(game: &mut Game) -> std::io::Result<()> {
    if event::poll(Duration::from_millis(50))? {
        if let Event::Key(key) = event::read()? {
            if key.kind == KeyEventKind::Press {
                match key.code {
                    KeyCode::Char('q') | KeyCode::Esc => game.running = false,
                    KeyCode::Up | KeyCode::Char('w') => game.move_player(0, -1),
                    KeyCode::Down | KeyCode::Char('s') => game.move_player(0, 1),
                    KeyCode::Left | KeyCode::Char('a') => game.move_player(-1, 0),
                    KeyCode::Right | KeyCode::Char('d') => game.move_player(1, 0),
                    KeyCode::Char('<') | KeyCode::Char('>') => game.use_stairs(),
                    _ => {}
                }
            }
        }
    }
    Ok(())
}
```

### Updating the render function

Update `render` to use `game.floor()` and show the floor indicator:

```rust
fn render(frame: &mut Frame, game: &mut Game) {
    let area = frame.area();

    let floor = &game.floors[game.current_floor];
    let title = format!(
        " The Marauder's Map — {} [{}/{}] — [q]uit [arrows] move [</>] stairs ",
        floor.name,
        game.current_floor + 1,
        game.floors.len(),
    );
    let block = Block::bordered().title(title);
    let inner = block.inner(area);
    frame.render_widget(block, area);

    // Update camera
    game.camera.update(
        game.player_x, game.player_y,
        floor.width(), floor.height(),
        inner.width as usize, inner.height as usize,
    );

    let buf = frame.buffer_mut();

    for screen_y in 0..inner.height {
        for screen_x in 0..inner.width {
            let map_x = game.camera.x + screen_x as usize;
            let map_y = game.camera.y + screen_y as usize;

            let draw_x = inner.x + screen_x;
            let draw_y = inner.y + screen_y;

            if map_y >= floor.height() || map_x >= floor.width() {
                buf.set_string(draw_x, draw_y, " ", Style::default());
                continue;
            }

            if map_x == game.player_x && map_y == game.player_y {
                buf.set_string(
                    draw_x, draw_y, "@",
                    Style::default().fg(Color::Green),
                );
            } else {
                let tile = floor.grid[map_y][map_x];
                buf.set_string(
                    draw_x, draw_y,
                    tile.to_char().to_string(),
                    tile.style(),
                );
            }
        }
    }
}
```

Note the floor indicator in the title: `[1/7]` shows which floor you're on and how many exist.

### Updating main

```rust
fn main() -> std::io::Result<()> {
    let map_path = "maps/ground_floor.json";
    let (floors, spawn_x, spawn_y) = load_map(map_path)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    let mut game = Game::new(floors, spawn_x, spawn_y);

    let mut terminal = ratatui::init();

    while game.running {
        terminal.draw(|frame| render(frame, &mut game))?;
        handle_input(&mut game)?;
    }

    ratatui::restore();
    Ok(())
}
```

The only change: we pass all `floors` to `Game::new` instead of extracting just the first one.

### Adding a second floor to the JSON

To test floor switching, add a second floor to your `maps/ground_floor.json`. Add another entry to the `"floors"` array:

```json
{
  "id": 1,
  "name": "First Floor",
  "width": 30,
  "height": 15,
  "grid": [
    "##############################",
    "#............................#",
    "#.##########.###############.#",
    "#.# Transfig #.# Hospital  #.#",
    "#.# Class    #.# Wing      #.#",
    "#.#     S    D.#            #.#",
    "#.##########.###############.#",
    "#............................#",
    "#.##########################.#",
    "#.# Girls Bathroom         #.#",
    "#.#                        #.#",
    "#.#                        #.#",
    "#.##########################.#",
    "#............................#",
    "##############################"
  ],
  "legend": {
    "#": "Wall",
    ".": "Floor",
    " ": "Floor",
    "D": "Door",
    "S": "Stairs"
  },
  "rooms": [
    { "id": "transfig", "name": "Transfiguration Classroom", "bounds": { "x": 2, "y": 2, "w": 11, "h": 5 } },
    { "id": "hospital", "name": "Hospital Wing", "bounds": { "x": 15, "y": 2, "w": 13, "h": 5 } },
    { "id": "bathroom", "name": "Girls' Bathroom", "bounds": { "x": 2, "y": 8, "w": 26, "h": 5 } }
  ],
  "stairs": [
    { "pos": [8, 5], "destination_floor": 0, "destination_pos": [30, 13] }
  ],
  "player_spawn": [5, 5]
}
```

Note how the stairs connect bidirectionally: Ground Floor stairs at `[30, 13]` lead to First Floor at `[5, 5]`, and First Floor stairs at `[8, 5]` lead back to Ground Floor at `[30, 13]`.

### Running it

```bash
cargo run
```

Navigate to the stairs tile (`S`) on the Ground Floor and press `<` or `>`. You'll teleport to the First Floor! The title bar updates to show the new floor name and index. Navigate to the stairs on the First Floor to go back.

> **Common mistake:** Forgetting to add stair connections in both directions. If floor A has stairs to floor B, floor B needs stairs back to floor A — otherwise you're stuck!


### Checkpoint: Stage 8 — Full Code

**`Cargo.toml`:**
```toml
[package]
name = "marauders-map"
version = "0.1.0"
edition = "2024"

[dependencies]
ratatui = "0.30"
crossterm = "0.29"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

**`src/main.rs`:**
```rust
use std::collections::HashMap;
use std::fmt;
use std::fs;
use std::time::Duration;

use crossterm::event::{self, Event, KeyCode, KeyEventKind};
use ratatui::Frame;
use ratatui::style::{Color, Style};
use ratatui::widgets::Block;
use serde::Deserialize;

// ── Tile ──────────────────────────────────────────────

#[derive(Clone, Copy, Debug)]
enum Tile {
    Wall,
    Floor,
    Door,
    Stairs,
    Empty,
}

impl Tile {
    fn to_char(self) -> char {
        match self {
            Tile::Wall => '#',
            Tile::Floor => '.',
            Tile::Door => 'D',
            Tile::Stairs => 'S',
            Tile::Empty => ' ',
        }
    }

    fn style(self) -> Style {
        match self {
            Tile::Wall => Style::default().fg(Color::DarkGray),
            Tile::Floor => Style::default().fg(Color::Gray),
            Tile::Door => Style::default().fg(Color::Yellow),
            Tile::Stairs => Style::default().fg(Color::Cyan),
            Tile::Empty => Style::default(),
        }
    }
}

impl fmt::Display for Tile {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.to_char())
    }
}

// ── Room & Floor ──────────────────────────────────────

struct Room {
    id: String,
    name: String,
    x: usize,
    y: usize,
    width: usize,
    height: usize,
}

struct StairConnection {
    from_pos: (usize, usize),
    destination_floor: u8,
    destination_pos: (usize, usize),
}

struct Floor {
    id: u8,
    name: String,
    grid: Vec<Vec<Tile>>,
    rooms: Vec<Room>,
    stairs: Vec<StairConnection>,
}

impl Floor {
    fn new(id: u8, name: &str, width: usize, height: usize) -> Self {
        Floor {
            id,
            name: name.to_string(),
            grid: vec![vec![Tile::Empty; width]; height],
            rooms: Vec::new(),
            stairs: Vec::new(),
        }
    }

    fn width(&self) -> usize {
        if self.grid.is_empty() { 0 } else { self.grid[0].len() }
    }

    fn height(&self) -> usize {
        self.grid.len()
    }

    fn set_tile(&mut self, x: usize, y: usize, tile: Tile) {
        if y < self.height() && x < self.width() {
            self.grid[y][x] = tile;
        }
    }
}

// ── Camera ────────────────────────────────────────────

struct Camera {
    x: usize,
    y: usize,
}

impl Camera {
    fn update(&mut self, player_x: usize, player_y: usize,
              map_width: usize, map_height: usize,
              view_width: usize, view_height: usize) {
        let half_w = view_width / 2;
        let half_h = view_height / 2;

        let ideal_x = player_x.saturating_sub(half_w);
        let ideal_y = player_y.saturating_sub(half_h);

        let max_x = map_width.saturating_sub(view_width);
        let max_y = map_height.saturating_sub(view_height);

        self.x = ideal_x.min(max_x);
        self.y = ideal_y.min(max_y);
    }
}

// ── Game State ────────────────────────────────────────

struct Game {
    floors: Vec<Floor>,
    current_floor: usize,
    player_x: usize,
    player_y: usize,
    camera: Camera,
    running: bool,
}

impl Game {
    fn new(floors: Vec<Floor>, start_x: usize, start_y: usize) -> Self {
        Game {
            floors,
            current_floor: 0,
            player_x: start_x,
            player_y: start_y,
            camera: Camera { x: 0, y: 0 },
            running: true,
        }
    }

    fn move_player(&mut self, dx: i32, dy: i32) {
        let new_x = self.player_x as i32 + dx;
        let new_y = self.player_y as i32 + dy;

        if new_x < 0 || new_y < 0 {
            return;
        }
        let new_x = new_x as usize;
        let new_y = new_y as usize;

        let floor = &self.floors[self.current_floor];
        if new_y >= floor.height() || new_x >= floor.width() {
            return;
        }

        match floor.grid[new_y][new_x] {
            Tile::Floor | Tile::Door | Tile::Stairs => {
                self.player_x = new_x;
                self.player_y = new_y;
            }
            _ => {}
        }
    }

    fn use_stairs(&mut self) {
        let floor = &self.floors[self.current_floor];
        for stair in &floor.stairs {
            if stair.from_pos == (self.player_x, self.player_y) {
                let dest_floor_id = stair.destination_floor;
                if let Some(idx) = self.floors.iter()
                    .position(|f| f.id == dest_floor_id)
                {
                    self.current_floor = idx;
                    self.player_x = stair.destination_pos.0;
                    self.player_y = stair.destination_pos.1;
                    return;
                }
            }
        }
    }
}
```

```rust
// ── JSON Data Structures ──────────────────────────────

#[derive(Deserialize)]
struct MapFile {
    floors: Vec<FloorData>,
}

#[derive(Deserialize)]
struct FloorData {
    id: u8,
    name: String,
    #[allow(dead_code)]
    width: usize,
    #[allow(dead_code)]
    height: usize,
    grid: Vec<String>,
    legend: HashMap<String, String>,
    rooms: Vec<RoomData>,
    stairs: Vec<StairDataJson>,
    player_spawn: (usize, usize),
}

#[derive(Deserialize)]
struct RoomData {
    id: String,
    name: String,
    bounds: BoundsData,
}

#[derive(Deserialize)]
struct BoundsData {
    x: usize,
    y: usize,
    w: usize,
    h: usize,
}

#[derive(Deserialize)]
struct StairDataJson {
    pos: (usize, usize),
    destination_floor: u8,
    destination_pos: (usize, usize),
}

// ── Map Loading ───────────────────────────────────────

fn load_floor(data: &FloorData) -> (Floor, usize, usize) {
    let height = data.grid.len();
    let width = if height > 0 { data.grid[0].len() } else { 0 };

    let mut floor = Floor::new(data.id, &data.name, width, height);
    let mut spawn_x = data.player_spawn.0;
    let mut spawn_y = data.player_spawn.1;

    for (y, row_str) in data.grid.iter().enumerate() {
        for (x, ch) in row_str.chars().enumerate() {
            let ch_str = ch.to_string();
            let tile_name = data.legend.get(&ch_str)
                .map(|s| s.as_str())
                .unwrap_or("Floor");

            let tile = match tile_name {
                "Wall" => Tile::Wall,
                "Floor" => Tile::Floor,
                "Door" => Tile::Door,
                "Stairs" => Tile::Stairs,
                "PlayerSpawn" => {
                    spawn_x = x;
                    spawn_y = y;
                    Tile::Floor
                }
                _ => Tile::Empty,
            };
            floor.set_tile(x, y, tile);
        }
    }

    for room_data in &data.rooms {
        floor.rooms.push(Room {
            id: room_data.id.clone(),
            name: room_data.name.clone(),
            x: room_data.bounds.x,
            y: room_data.bounds.y,
            width: room_data.bounds.w,
            height: room_data.bounds.h,
        });
    }

    for stair in &data.stairs {
        floor.set_tile(stair.pos.0, stair.pos.1, Tile::Stairs);
        floor.stairs.push(StairConnection {
            from_pos: stair.pos,
            destination_floor: stair.destination_floor,
            destination_pos: stair.destination_pos,
        });
    }

    (floor, spawn_x, spawn_y)
}

fn load_map(path: &str) -> Result<(Vec<Floor>, usize, usize), String> {
    let contents = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read {}: {}", path, e))?;

    let map_file: MapFile = serde_json::from_str(&contents)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;

    if map_file.floors.is_empty() {
        return Err("No floors in map file".to_string());
    }

    let mut floors = Vec::new();
    let mut spawn_x = 0;
    let mut spawn_y = 0;

    for (i, floor_data) in map_file.floors.iter().enumerate() {
        let (floor, sx, sy) = load_floor(floor_data);
        if i == 0 {
            spawn_x = sx;
            spawn_y = sy;
        }
        floors.push(floor);
    }

    Ok((floors, spawn_x, spawn_y))
}

// ── Rendering ─────────────────────────────────────────

fn render(frame: &mut Frame, game: &mut Game) {
    let area = frame.area();

    let floor = &game.floors[game.current_floor];
    let title = format!(
        " The Marauder's Map — {} [{}/{}] — [q]uit [arrows] move [</>] stairs ",
        floor.name,
        game.current_floor + 1,
        game.floors.len(),
    );
    let block = Block::bordered().title(title);
    let inner = block.inner(area);
    frame.render_widget(block, area);

    game.camera.update(
        game.player_x, game.player_y,
        floor.width(), floor.height(),
        inner.width as usize, inner.height as usize,
    );

    let buf = frame.buffer_mut();

    for screen_y in 0..inner.height {
        for screen_x in 0..inner.width {
            let map_x = game.camera.x + screen_x as usize;
            let map_y = game.camera.y + screen_y as usize;

            let draw_x = inner.x + screen_x;
            let draw_y = inner.y + screen_y;

            if map_y >= floor.height() || map_x >= floor.width() {
                buf.set_string(draw_x, draw_y, " ", Style::default());
                continue;
            }

            if map_x == game.player_x && map_y == game.player_y {
                buf.set_string(
                    draw_x, draw_y, "@",
                    Style::default().fg(Color::Green),
                );
            } else {
                let tile = floor.grid[map_y][map_x];
                buf.set_string(
                    draw_x, draw_y,
                    tile.to_char().to_string(),
                    tile.style(),
                );
            }
        }
    }
}

fn handle_input(game: &mut Game) -> std::io::Result<()> {
    if event::poll(Duration::from_millis(50))? {
        if let Event::Key(key) = event::read()? {
            if key.kind == KeyEventKind::Press {
                match key.code {
                    KeyCode::Char('q') | KeyCode::Esc => game.running = false,
                    KeyCode::Up | KeyCode::Char('w') => game.move_player(0, -1),
                    KeyCode::Down | KeyCode::Char('s') => game.move_player(0, 1),
                    KeyCode::Left | KeyCode::Char('a') => game.move_player(-1, 0),
                    KeyCode::Right | KeyCode::Char('d') => game.move_player(1, 0),
                    KeyCode::Char('<') | KeyCode::Char('>') => game.use_stairs(),
                    _ => {}
                }
            }
        }
    }
    Ok(())
}

// ── Main ──────────────────────────────────────────────

fn main() -> std::io::Result<()> {
    let map_path = "maps/ground_floor.json";
    let (floors, spawn_x, spawn_y) = load_map(map_path)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    let mut game = Game::new(floors, spawn_x, spawn_y);

    let mut terminal = ratatui::init();

    while game.running {
        terminal.draw(|frame| render(frame, &mut game))?;
        handle_input(&mut game)?;
    }

    ratatui::restore();
    Ok(())
}
```


---

## Act 1 Complete: "Mischief Managed"

You've built a working Marauder's Map from scratch. Let's review what you learned:

| Stage | Rust Concepts |
|-------|--------------|
| 1. Hello Hogwarts | `cargo`, `fn main()`, `println!`, project structure |
| 2. The Tile | Enums, `match`, `Display` trait, `derive`, `impl` blocks |
| 3. The Grid | `Vec<Vec<T>>`, `mut`, ranges, borrowing with `&` |
| 4. The Floor | Structs, methods, `String` vs `&str`, associated functions |
| 5. Enter ratatui | External crates, terminal UI, closures, `Result`, `?` operator |
| 6. The Viewport | `saturating_sub`, `usize` arithmetic, camera systems |
| 7. Map from JSON | serde, `Deserialize`, `HashMap`, file I/O, error handling |
| 8. Multiple Floors | Index management, `Option`, `position()`, state transitions |

**What you have now:**
- A multi-floor Hogwarts map loaded from JSON
- A player (`@`) that moves with arrow keys / WASD
- A viewport camera that follows the player
- Stair transitions between floors with `<` / `>`
- Colored tile rendering in a real terminal UI

**What's coming in Act 2: "The Marauders"**
- A player struct with position, inventory, and stealth
- NPCs that appear on the map (Filch, Snape, Peeves, ghosts)
- The game tick system — real-time updates
- Collision detection and room awareness
- The detection meter — stay hidden or get caught!

> *"The Map never lies."* — Remus Lupin

The parchment is drawn. Now it needs inhabitants.
