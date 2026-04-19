# Act 2: Movement & Collision — "Up to No Good"

> *"I solemnly swear that I am up to no good."*

In Act 1, you built a static map of Hogwarts — floors, walls, doors, and a viewport that renders it all in the terminal. Beautiful, but lifeless. The Map just... sits there. Like a portrait that hasn't learned to talk yet.

In Act 2, we bring the Map to life. You'll place a player on the map, move them with arrow keys, bounce off walls, walk through doors, climb stairs between floors, and track it all in a status bar. By the end, you'll have a fully navigable Hogwarts — the foundation for everything that comes next.

This act introduces some of Rust's most important concepts: the **game loop** pattern, **mutable borrowing** across structs, and **event-driven programming**. These aren't abstract lessons — they emerge naturally from the problem of "how do I move `@` around a grid without the compiler yelling at me?"

**What you have from Act 1:**
- `Tile` enum: `Wall`, `Floor`, `Door`, `Stairs`, `SecretPassage`, `Entrance`
- `Floor` struct with `grid: Vec<Vec<Tile>>`, `rooms: Vec<Room>`, `name: String`, `id: u8`
- `HogwartsMap` struct with `floors: Vec<Floor>`
- ratatui + crossterm rendering the grid in a TUI
- Viewport/camera system that shows a portion of the map
- JSON map loading with serde
- Multiple floors with a floor indicator

Let's get moving.

---

## Stage 9: The Player (Easy)

*"Mr. Moony presents his compliments to the user and begs them to keep their nose out of other people's business."*

The map exists, but it's a ghost town — no one walks these corridors. Every adventure needs a protagonist, and every game needs a way to represent "where the player is" as data the compiler can reason about. This stage introduces the `Player` struct and teaches you how to render an entity *on top of* the existing map — the layered rendering pattern that every 2D game uses.

Every adventure needs a protagonist. Right now your map is a ghost town — corridors stretch out in silence, rooms sit empty. Time to put someone on the map. Literally.

### The Player Struct

Right now we have a beautiful map with tiles, rooms, and a viewport — but no concept of "someone standing here." We need a struct that tracks position and floor, and we need to draw it as a `@` symbol on top of the existing tiles without destroying the map underneath.

We need to track where the player is: their `x` and `y` position on the grid, and which floor they're on. In Python, you might write:

```python
class Player:
    def __init__(self, x, y, floor):
        self.x = x
        self.y = y
        self.floor = floor
```

In Rust, we use a **struct** — a custom data type that groups related values together. You've already built `Floor` and `HogwartsMap` this way. The player is no different:

```rust
// src/player.rs

/// The player character — that's you, sneaking around Hogwarts.
pub struct Player {
    pub x: usize,      // column position on the grid
    pub y: usize,      // row position on the grid
    pub floor: usize,   // index into HogwartsMap.floors
}
```

**Why `usize`?** Grid coordinates are indices into `Vec<Vec<Tile>>`. In Rust, vector indices are always `usize` — an unsigned (non-negative) integer sized to your platform (64-bit on modern machines). You can't index a `Vec` with `i32` or `u32` without converting first. Using `usize` from the start avoids constant casting.

> **Python comparison:** Python lists accept any integer index (even negative ones for reverse indexing). Rust is stricter — `usize` only, no negatives. This prevents an entire class of "index out of bounds" bugs at compile time.

Now give the player a way to be created:

```rust
impl Player {
    /// Create a new player at the given position.
    pub fn new(x: usize, y: usize, floor: usize) -> Self {
        Self { x, y, floor }
    }
}
```

`impl Player` is where we attach methods to our struct — like adding methods to a class in Python/TypeScript. `Self` (capital S) is shorthand for the type we're implementing (`Player`). The function returns a new `Player` with the given coordinates.

### Rendering the Player

The player appears as `@` on the map — a classic roguelike tradition dating back to the original Rogue (1980). To render them, we need to draw `@` at the player's position *on top of* the existing map tiles.

In your rendering function from Act 1, you iterate over visible tiles and draw them. After drawing all tiles, draw the player on top — but only if they're within the current viewport:

```rust
// In your rendering function, after drawing all tiles:

fn render_player(
    player: &Player,
    viewport_x: usize,
    viewport_y: usize,
    viewport_width: usize,
    viewport_height: usize,
    buf: &mut ratatui::buffer::Buffer,
    area: ratatui::layout::Rect,
) {
    // Is the player visible in the current viewport?
    if player.x >= viewport_x
        && player.x < viewport_x + viewport_width
        && player.y >= viewport_y
        && player.y < viewport_y + viewport_height
    {
        // Convert world coordinates to screen coordinates
        let screen_x = (player.x - viewport_x) as u16 + area.x;
        let screen_y = (player.y - viewport_y) as u16 + area.y;

        // Draw the @ symbol in bright green
        use ratatui::style::{Color, Style};
        buf[(screen_x, screen_y)]
            .set_char('@')
            .set_style(Style::new().fg(Color::Green));
    }
}
```

Let's break this down:

1. **Viewport check** — The player might be off-screen if the viewport hasn't scrolled to them yet. We check that `player.x` and `player.y` fall within the visible rectangle.

2. **World-to-screen conversion** — The player's position is in *world* coordinates (their actual grid position). The screen only shows a window into that world. Subtracting the viewport offset converts world → screen. The `as u16` cast is needed because `Rect` coordinates are `u16` in ratatui.

3. **Buffer cell access** — `buf[(x, y)]` gives us direct access to a terminal cell. We set its character to `@` and style it green. This is ratatui's `Buffer` API — each cell in the buffer represents one character on screen.

> **TypeScript comparison:** Think of the buffer like a 2D canvas context. Instead of `ctx.fillText('@', x, y)`, you're writing directly to a cell grid. Same concept, different API.

### Placing the Player on the Map

Where does the player start? The design spec says the Entrance tile marks where the player begins. Let's find the first `Entrance` tile on the starting floor:

```rust
impl Player {
    pub fn new(x: usize, y: usize, floor: usize) -> Self {
        Self { x, y, floor }
    }

    /// Find a valid starting position on the given floor.
    /// Looks for an Entrance tile, falls back to the first Floor tile.
    pub fn spawn(map: &HogwartsMap, floor: usize) -> Self {
        let grid = &map.floors[floor].grid;
        for (y, row) in grid.iter().enumerate() {
            for (x, tile) in row.iter().enumerate() {
                if matches!(tile, Tile::Entrance { .. }) {
                    return Self::new(x, y, floor);
                }
            }
        }
        // Fallback: find any walkable floor tile
        for (y, row) in grid.iter().enumerate() {
            for (x, tile) in row.iter().enumerate() {
                if matches!(tile, Tile::Floor) {
                    return Self::new(x, y, floor);
                }
            }
        }
        // Last resort: top-left corner
        Self::new(0, 0, floor)
    }
}
```

**New Rust concept: `matches!` macro.** The `matches!` macro checks if a value matches a pattern and returns `bool`. It's like a one-line `match` expression. `matches!(tile, Tile::Entrance { .. })` returns `true` if `tile` is any `Entrance` variant, regardless of its inner fields. The `{ .. }` means "I don't care about the fields inside."

> **Python comparison:** This is like `isinstance(tile, Entrance)` but for enum variants. Python doesn't have algebraic types, so you'd use class hierarchies. Rust's `matches!` is more concise and checked at compile time.

### Centering the Viewport on the Player

Your viewport from Act 1 probably starts at `(0, 0)`. Now that we have a player, the viewport should follow them:

```rust
fn center_viewport_on_player(
    player: &Player,
    viewport_width: usize,
    viewport_height: usize,
    map_width: usize,
    map_height: usize,
) -> (usize, usize) {
    // Center the viewport on the player, clamping to map edges
    let vx = if player.x >= viewport_width / 2 {
        (player.x - viewport_width / 2).min(map_width.saturating_sub(viewport_width))
    } else {
        0
    };
    let vy = if player.y >= viewport_height / 2 {
        (player.y - viewport_height / 2).min(map_height.saturating_sub(viewport_height))
    } else {
        0
    };
    (vx, vy)
}
```

**`saturating_sub`** is a Rust method on integers that subtracts without underflowing. Since `usize` can't go negative, `0usize - 1` would panic in debug mode (or wrap to `usize::MAX` in release). `saturating_sub` clamps to zero instead. You'll use this *constantly* when working with grid coordinates.

### Checkpoint: Stage 9 Complete

Your project structure now looks like:

```
src/
├── main.rs          // entry point, game loop (coming next stage)
├── map.rs           // HogwartsMap, Floor, Tile, Room
├── player.rs        // Player struct — NEW
└── render.rs        // TUI rendering with viewport
```

The player exists, has a position, renders as `@`, and the viewport centers on them. But they can't move yet — that's next. In Stage 10, we build the game loop that reads keypresses and translates them into movement, bringing the `@` to life.

**Common mistake:** Trying to store a reference to the map inside `Player`:
```rust
// DON'T do this:
struct Player<'a> {
    map: &'a HogwartsMap,  // lifetime headache incoming
    x: usize,
    y: usize,
}
```
This introduces **lifetimes** — Rust's way of tracking how long references are valid. It's tempting to give the player a reference to the map so it can check tiles, but this creates a web of borrow-checker constraints. Instead, pass the map as a parameter to methods that need it (like `spawn`). Keep your structs simple; pass context through function arguments.

---

## Stage 10: Arrow Keys — The Game Loop (Medium)

*"The castle seemed to have been built by someone who was slightly mad."*

A player that can't move is a portrait, not a person. This stage is the beating heart of the entire game — the **game loop** that continuously reads input, updates state, and redraws the screen. Every real-time application, from Pong to Elden Ring, runs this same fundamental pattern. You'll also confront `&mut` for the first time in a meaningful way, learning why Rust makes you declare "I will modify this" at every level.

Your player exists but is frozen in place — a statue in the corridors of Hogwarts. To bring them to life, we need two things: a **game loop** that continuously updates the screen, and **input handling** that reads keypresses. This is the beating heart of any real-time application.

### The Game Loop Pattern

Every game — from Pong to Elden Ring — runs the same fundamental loop:

```
loop {
    1. Handle input (did the user press a key?)
    2. Update state (move the player, advance time)
    3. Render (draw the current state to screen)
}
```

In Python/JS, you might use `pygame.event.get()` or `requestAnimationFrame`. In Rust with crossterm, we use `event::poll()` and `event::read()`.

Here's the critical insight: **`poll()` checks if an event is available without blocking, while `read()` blocks until one arrives.** For a game loop, we want `poll()` with a timeout — this lets us update the screen at a fixed rate even when no keys are pressed (important later for NPC movement and animations).

### Building the Game Loop

Let's restructure `main.rs` into a proper game loop. First, the setup:

```rust
// src/main.rs

use std::io;
use std::time::{Duration, Instant};

use crossterm::event::{self, Event, KeyCode, KeyEventKind};
use ratatui::DefaultTerminal;

mod map;
mod player;
mod render;

use map::HogwartsMap;
use player::Player;

/// How often the game updates, in milliseconds.
/// 200ms = 5 updates per second. Fast enough to feel responsive,
/// slow enough that we're not burning CPU.
const TICK_RATE: Duration = Duration::from_millis(200);

fn main() -> io::Result<()> {
    // ratatui::init() sets up the terminal: enables raw mode,
    // enters the alternate screen, and returns a Terminal handle.
    let mut terminal = ratatui::init();

    // Load the map and spawn the player
    let map = HogwartsMap::load("hogwarts.json")?;
    let mut player = Player::spawn(&map, 1); // Start on ground floor

    // Run the game loop, then clean up no matter what
    let result = run(&mut terminal, &map, &mut player);

    // ratatui::restore() leaves alternate screen and disables raw mode.
    // Always call this — even if the game crashed — or your terminal
    // will be left in a broken state.
    ratatui::restore();
    result
}
```

**Why separate `run()` from `main()`?** If `run()` returns an error via `?`, we still need `ratatui::restore()` to execute. By putting the game loop in its own function, `main()` always reaches the restore call. This is a common pattern in ratatui apps.

> **TypeScript comparison:** This is like wrapping your app in a `try/finally` block where `finally` always cleans up the terminal. Rust doesn't have `finally`, but structuring the code this way achieves the same guarantee.

Now the actual loop:

```rust
fn run(
    terminal: &mut DefaultTerminal,
    map: &HogwartsMap,
    player: &mut Player,
) -> io::Result<()> {
    let mut last_tick = Instant::now();

    loop {
        // ── RENDER ──────────────────────────────────────────
        terminal.draw(|frame| {
            render::draw_map(frame, map, player);
        })?;

        // ── INPUT ───────────────────────────────────────────
        // Calculate how long until the next tick
        let timeout = TICK_RATE.saturating_sub(last_tick.elapsed());

        // poll() returns true if an event is ready within the timeout
        if event::poll(timeout)? {
            // read() won't block here because poll() said an event exists
            if let Event::Key(key) = event::read()? {
                // Only respond to key PRESS events, not release/repeat
                if key.kind == KeyEventKind::Press {
                    match key.code {
                        KeyCode::Char('q') | KeyCode::Esc => return Ok(()),
                        KeyCode::Up | KeyCode::Char('w') => {
                            player.y = player.y.saturating_sub(1);
                        }
                        KeyCode::Down | KeyCode::Char('s') => {
                            player.y += 1;
                        }
                        KeyCode::Left | KeyCode::Char('a') => {
                            player.x = player.x.saturating_sub(1);
                        }
                        KeyCode::Right | KeyCode::Char('d') => {
                            player.x += 1;
                        }
                        _ => {}
                    }
                }
            }
        }

        // ── TICK ────────────────────────────────────────────
        if last_tick.elapsed() >= TICK_RATE {
            // This is where time-based updates will go:
            // NPC movement, detection meter decay, animations
            last_tick = Instant::now();
        }
    }
}
```

This is dense. Let's unpack every piece.

### Event Polling: The Non-Blocking Read

```rust
let timeout = TICK_RATE.saturating_sub(last_tick.elapsed());
if event::poll(timeout)? {
```

`event::poll(timeout)` waits up to `timeout` for a keyboard/mouse/resize event. If an event arrives, it returns `true`. If the timeout expires with no event, it returns `false` and the loop continues — this is what makes the loop *non-blocking*.

The timeout calculation is clever: if 150ms have passed since the last tick and `TICK_RATE` is 200ms, we only wait 50ms for input. This ensures the tick fires on schedule regardless of input timing.

> **Python comparison:** This is like `pygame.event.wait(timeout)` or `select.select([], [], [], timeout)`. The key idea is the same — wait for input, but not forever.

### Key Event Filtering

```rust
if let Event::Key(key) = event::read()? {
    if key.kind == KeyEventKind::Press {
```

Two important filters here:

1. **`Event::Key(key)`** — crossterm fires events for keys, mouse, window resize, focus, and paste. We only care about keys right now. `if let` is Rust's way of saying "if this matches the pattern, bind the inner value to `key`."

2. **`KeyEventKind::Press`** — On some terminals, crossterm reports key press, release, *and* repeat events. Without this filter, pressing an arrow key once might move the player 2-3 times. Always filter for `Press` only.

### The Match Expression

```rust
match key.code {
    KeyCode::Char('q') | KeyCode::Esc => return Ok(()),
    KeyCode::Up | KeyCode::Char('w') => {
        player.y = player.y.saturating_sub(1);
    }
    // ...
    _ => {}
}
```

`match` is Rust's pattern matching — like a `switch` statement that the compiler *guarantees* handles every case. The `|` means "or" — `KeyCode::Up | KeyCode::Char('w')` matches either the up arrow or the W key.

`KeyCode::Up`, `KeyCode::Down`, `KeyCode::Left`, `KeyCode::Right` are the arrow key variants. `KeyCode::Char('w')` matches the literal character `w`. These come from crossterm's `event::KeyCode` enum — we verified the exact variant names from the docs.

The `_ => {}` arm is the catch-all: any key we don't handle gets silently ignored. Without it, the compiler would refuse to compile — `match` must be *exhaustive*.

### Why `saturating_sub` for Movement?

```rust
player.y = player.y.saturating_sub(1);
```

Moving up means decreasing `y`. But `y` is `usize` — it can't go below zero. If the player is at `y = 0` and presses up:
- `0 - 1` → **panic** in debug mode, wrap to `18446744073709551615` in release
- `0.saturating_sub(1)` → `0` (clamped, safe)

For down/right movement (`+= 1`), we don't have the underflow problem, but we'll add bounds checking in the next stage when we implement wall collision.

### Understanding `&mut` — Mutable References

Look at the function signature:

```rust
fn run(
    terminal: &mut DefaultTerminal,  // mutable reference
    map: &HogwartsMap,               // immutable reference
    player: &mut Player,             // mutable reference
) -> io::Result<()> {
```

Three parameters, two kinds of references:
- `&HogwartsMap` — an **immutable reference**. We can read the map but not change it. The map data is fixed.
- `&mut Player` — a **mutable reference**. We need to change the player's position, so we need write access.
- `&mut DefaultTerminal` — mutable because `draw()` modifies the terminal's internal buffer.

> **Python comparison:** In Python, everything is a reference and everything is mutable. You can modify any object passed to any function. Rust makes you declare your intent: "I will read this" (`&`) vs "I will modify this" (`&mut`). The compiler then enforces that no one else is reading something you're modifying — preventing data races and aliasing bugs.

**The key rule:** You can have *either* one `&mut` reference *or* any number of `&` references to the same data, but never both at the same time. This is Rust's **borrowing rule**, and it's the source of most beginner frustration. We'll see it bite us in later stages.

### Checkpoint: Stage 10 Complete

You now have:
- A game loop running at 5 ticks per second
- Arrow keys (and WASD) moving the player
- `q` or `Esc` to quit cleanly
- The viewport following the player

Try it: `cargo run`. You should see your `@` symbol moving around the map. It walks through walls, off the edge of the map, into the void — we'll fix that next. Stage 11 adds collision detection so the castle's walls actually *stop* you.

**Common mistake:** Forgetting `KeyEventKind::Press` filtering:
```rust
// BUG: responds to press AND release, double-moving the player
if let Event::Key(key) = event::read()? {
    match key.code { ... }
}
```
Always check `key.kind == KeyEventKind::Press`.

---

## Stage 11: Wall Collision (Easy)

*"Hogwarts is full of surprises... but walking through solid stone isn't one of them."*

A game where you can walk through walls isn't a game — it's a screensaver. Collision detection is what makes the map *real*: walls block you, doors let you through (if unlocked), and the castle becomes a maze to navigate rather than empty space to drift across. This stage also introduces the `i32`/`usize` dance — a pattern you'll repeat every time movement deltas meet grid coordinates in Rust.

Right now your player is a ghost — phasing through walls, drifting off the map edge, ignoring every physical law of the castle. Time to make the walls mean something.

### The Concept: Check Before You Move

Collision detection in a tile-based game is beautifully simple: before moving the player to a new position, check what tile is there. If it's a wall, don't move. If it's a floor, move. If it's a door, open it and move.

This is a **look-before-you-leap** pattern. Instead of moving first and fixing problems after, we validate the destination *before* changing position.

### Tile Walkability

First, let's define which tiles the player can walk on. Add a method to your `Tile` enum:

```rust
// src/map.rs

impl Tile {
    /// Can the player walk onto this tile?
    pub fn is_walkable(&self) -> bool {
        match self {
            Tile::Floor => true,
            Tile::Door { locked, .. } => !locked,  // open doors only
            Tile::Stairs { .. } => true,
            Tile::SecretPassage { discovered, .. } => *discovered,
            Tile::Entrance { .. } => true,
            Tile::Wall => false,
        }
    }
}
```

**Pattern matching with fields:** `Tile::Door { locked, .. }` destructures the `Door` variant, binding its `locked` field to a local variable. The `..` means "ignore the other fields." We return `!locked` — walkable only if not locked.

`Tile::SecretPassage { discovered, .. }` uses `*discovered` — the asterisk **dereferences** the value. When you destructure a reference to an enum, the bound variables are references too. `*discovered` converts `&bool` to `bool`. This is a subtlety that trips up beginners.

> **Python comparison:** In Python you'd write `if isinstance(tile, Door) and not tile.locked`. Rust's `match` does the type check and field access in one expression — more concise, and the compiler verifies you handled every variant.

### The `try_move` Method

Now add a movement method to `Player` that checks collision:

```rust
// src/player.rs

use crate::map::{HogwartsMap, Tile};

impl Player {
    /// Attempt to move the player by (dx, dy).
    /// Returns true if the move succeeded, false if blocked.
    pub fn try_move(&mut self, dx: i32, dy: i32, map: &HogwartsMap) -> bool {
        // Calculate the target position
        let new_x = self.x as i32 + dx;
        let new_y = self.y as i32 + dy;

        // Bounds check: don't walk off the map
        if new_x < 0 || new_y < 0 {
            return false;
        }

        let new_x = new_x as usize;
        let new_y = new_y as usize;

        let floor = &map.floors[self.floor];

        // Check grid bounds
        if new_y >= floor.grid.len() || new_x >= floor.grid[0].len() {
            return false;
        }

        // Check tile walkability
        if floor.grid[new_y][new_x].is_walkable() {
            self.x = new_x;
            self.y = new_y;
            true
        } else {
            false
        }
    }
}
```

**Why `i32` for dx/dy?** Movement deltas can be negative (moving left or up). We can't use `usize` for that — it's unsigned. So we accept `i32` deltas, add them to the current position (after casting to `i32`), check if the result is negative, and only then cast back to `usize`.

This dance between `i32` and `usize` is one of Rust's rough edges for game development. The compiler forces you to be explicit about every conversion, which prevents bugs but adds verbosity. You'll get used to the pattern:

```
usize → i32 (for arithmetic with negatives) → bounds check → i32 → usize (for indexing)
```

**Variable shadowing:** Notice `let new_x = new_x as usize;` — we declare a *new* variable with the same name, shadowing the previous `i32` version. This is idiomatic Rust. After the bounds check, we know the value is non-negative, so we shadow it with the `usize` version. The old `i32` variable is no longer accessible.

> **TypeScript comparison:** TypeScript would let you use `number` for everything. Rust's type system forces you to think about signedness and overflow at every step. It's annoying at first, but it catches real bugs — like the Ariane 5 rocket that exploded because of an integer overflow in a type conversion.

### Updating the Game Loop

Replace the direct position manipulation in `run()` with `try_move()`:

```rust
// In the match expression inside run():
match key.code {
    KeyCode::Char('q') | KeyCode::Esc => return Ok(()),
    KeyCode::Up    | KeyCode::Char('w') => { player.try_move( 0, -1, map); }
    KeyCode::Down  | KeyCode::Char('s') => { player.try_move( 0,  1, map); }
    KeyCode::Left  | KeyCode::Char('a') => { player.try_move(-1,  0, map); }
    KeyCode::Right | KeyCode::Char('d') => { player.try_move( 1,  0, map); }
    _ => {}
}
```

Clean. Each direction is a unit vector: up is `(0, -1)`, right is `(1, 0)`, etc. The `try_move` method handles all the messy bounds checking and collision logic.

### Door Interaction

Walking into a locked door does nothing — the player just stops. But what about unlocked doors? In many roguelikes, walking into a closed-but-unlocked door opens it. Let's add that:

```rust
// Enhanced try_move with door opening
pub fn try_move(&mut self, dx: i32, dy: i32, map: &mut HogwartsMap) -> bool {
    let new_x = self.x as i32 + dx;
    let new_y = self.y as i32 + dy;

    if new_x < 0 || new_y < 0 {
        return false;
    }

    let new_x = new_x as usize;
    let new_y = new_y as usize;

    let floor = &mut map.floors[self.floor];

    if new_y >= floor.grid.len() || new_x >= floor.grid[0].len() {
        return false;
    }

    match &floor.grid[new_y][new_x] {
        Tile::Wall => false,
        Tile::Door { locked: true, .. } => false,
        Tile::Door { locked: false, .. }
        | Tile::Floor
        | Tile::Stairs { .. }
        | Tile::Entrance { .. } => {
            self.x = new_x;
            self.y = new_y;
            true
        }
        Tile::SecretPassage { discovered: true, .. } => {
            self.x = new_x;
            self.y = new_y;
            true
        }
        Tile::SecretPassage { discovered: false, .. } => false,
    }
}
```

Notice the signature changed: `map: &mut HogwartsMap`. We need a mutable reference now because opening a door modifies the map state. This means the game loop must also pass `&mut map` — which means `map` can no longer be declared with `let` (immutable by default), it needs `let mut`:

```rust
// In main():
let mut map = HogwartsMap::load("hogwarts.json")?;
```

**This is the borrow checker teaching you something:** when you need to modify data, Rust forces you to declare that intent at every level — from the variable binding (`let mut`) to the function parameter (`&mut`). Nothing is silently mutable.

### Checkpoint: Stage 11 Complete

Run the game. Try walking into walls — you bounce off. Try walking through corridors — smooth. The castle has substance now. Hogwarts feels *solid*. But every corridor looks the same — an anonymous maze. Next, we'll label the rooms so you know whether you're in the Great Hall or Filch's Office.

**Common mistake:** Forgetting to update `map` from `&HogwartsMap` to `&mut HogwartsMap` in the `run()` signature when you add door interaction. The compiler error will say something like:

```
error[E0596]: cannot borrow `*map` as mutable, as it is behind a `&` reference
```

This means: "you're trying to modify something through an immutable reference." Change `&` to `&mut` in the function signature and at the call site.

---

## Stage 12: Rooms & Labels (Medium)

*"The Room of Requirement only appears when a person has real need of it."*

Walking through Hogwarts should feel like walking through *Hogwarts* — not an anonymous grid of dots and hashes. Room labels transform the map from abstract geometry into a place with identity. This stage also introduces `Option<&Room>`, Rust's elegant replacement for null, and the layered rendering pattern where you draw tiles first, then labels, then the player — each layer building on the last.

Your player can walk through Hogwarts, but every corridor looks the same — an anonymous maze of walls and floors. The Marauder's Map labels every room. Let's do the same.

### Room Data

From Act 1, your `Room` struct has a name and a bounding rectangle:

```rust
// src/map.rs (already exists from Act 1)

#[derive(Debug, Clone, serde::Deserialize)]
pub struct Room {
    pub id: u16,
    pub name: String,
    pub description: String,
    pub floor: u8,
    pub bounds: RoomBounds,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct RoomBounds {
    pub x: usize,
    pub y: usize,
    pub width: usize,
    pub height: usize,
}
```

Each room occupies a rectangular area on the grid. The `bounds` tell us where the room starts and how big it is.

### Rendering Room Labels

Room names should appear centered inside their bounds on the map. We'll render them as styled text overlaid on the floor tiles:

```rust
// src/render.rs

use ratatui::buffer::Buffer;
use ratatui::layout::Rect;
use ratatui::style::{Color, Style};

/// Draw room labels within the viewport.
pub fn render_room_labels(
    rooms: &[Room],
    viewport_x: usize,
    viewport_y: usize,
    viewport_width: usize,
    viewport_height: usize,
    buf: &mut Buffer,
    area: Rect,
) {
    let label_style = Style::new().fg(Color::DarkGray);

    for room in rooms {
        let bounds = &room.bounds;

        // Center the label within the room bounds
        let label = &room.name;
        let label_len = label.len();

        // Room center in world coordinates
        let center_x = bounds.x + bounds.width / 2;
        let center_y = bounds.y + bounds.height / 2;

        // Label start position (centered horizontally)
        let label_x = if center_x >= label_len / 2 {
            center_x - label_len / 2
        } else {
            bounds.x
        };
        let label_y = center_y;

        // Render each character of the label if it's in the viewport
        for (i, ch) in label.chars().enumerate() {
            let wx = label_x + i;
            let wy = label_y;

            if wx >= viewport_x
                && wx < viewport_x + viewport_width
                && wy >= viewport_y
                && wy < viewport_y + viewport_height
            {
                let sx = (wx - viewport_x) as u16 + area.x;
                let sy = (wy - viewport_y) as u16 + area.y;

                if sx < area.x + area.width && sy < area.y + area.height {
                    buf[(sx, sy)].set_char(ch).set_style(label_style);
                }
            }
        }
    }
}
```

**Iterating with index:** `label.chars().enumerate()` gives us each character with its index — `(0, 'G')`, `(1, 'r')`, `(2, 'e')`, etc. We use the index to calculate each character's world position.

**Bounds safety:** The double check — viewport bounds *and* area bounds — prevents writing outside the allocated buffer region. ratatui will panic if you write to a cell outside the `Rect`. Belt and suspenders.

> **Python comparison:** In Python with curses, you'd use `stdscr.addstr(y, x, "Great Hall")` and hope the string doesn't overflow the window. Rust makes you check explicitly, which is more verbose but prevents the random crashes that plague curses programs.

### Detecting the Current Room

The player should know which room they're in. This is useful for the status bar (Stage 14) and later for NPC behavior. Add a method to find the room at a given position:

```rust
// src/map.rs

impl Floor {
    /// Find which room contains the given position, if any.
    pub fn room_at(&self, x: usize, y: usize) -> Option<&Room> {
        self.rooms.iter().find(|room| {
            let b = &room.bounds;
            x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height
        })
    }
}
```

**`Option<&Room>`** — This returns either `Some(&Room)` if the player is inside a room, or `None` if they're in a corridor. `Option` is Rust's replacement for `null` — it forces you to handle the "nothing here" case explicitly.

The `.find()` method on iterators searches for the first element matching a predicate. The closure `|room| { ... }` checks if `(x, y)` falls within the room's bounding rectangle.

> **TypeScript comparison:** This is like `rooms.find(room => ...)` returning `Room | undefined`. Rust's `Option` is the same concept but enforced by the type system — you *cannot* forget to handle `None`.

### Using the Current Room

In your game state, you can now query the current room:

```rust
// Anywhere you need the current room:
let current_room = map.floors[player.floor]
    .room_at(player.x, player.y);

match current_room {
    Some(room) => println!("You are in: {}", room.name),
    None => println!("You are in a corridor"),
}
```

Or more concisely with `if let`:

```rust
if let Some(room) = map.floors[player.floor].room_at(player.x, player.y) {
    // Inside a room — show the name
} else {
    // In a corridor
}
```

### Rendering Order

The order you render things matters. Later draws overwrite earlier ones. The correct order is:

1. **Tiles** (walls, floors, doors) — the base layer
2. **Room labels** — text overlaid on floor tiles
3. **NPCs** (coming in Act 3) — characters on the map
4. **Player** — always on top so you can see yourself

```rust
// src/render.rs

pub fn draw_map(
    frame: &mut ratatui::Frame,
    map: &HogwartsMap,
    player: &Player,
) {
    let area = frame.area();

    // Calculate viewport centered on player
    let floor = &map.floors[player.floor];
    let map_height = floor.grid.len();
    let map_width = if map_height > 0 { floor.grid[0].len() } else { 0 };

    let vw = area.width as usize;
    let vh = area.height.saturating_sub(1) as usize; // reserve 1 row for status bar

    let (vx, vy) = center_viewport_on_player(player, vw, vh, map_width, map_height);

    // Split the screen: map area + status bar
    let layout = ratatui::layout::Layout::vertical([
        ratatui::layout::Constraint::Fill(1),    // map gets remaining space
        ratatui::layout::Constraint::Length(1),   // status bar is 1 row
    ]);
    let [map_area, status_area] = layout.areas(area);

    // 1. Render tiles
    render_tiles(floor, vx, vy, vw, vh, frame.buffer_mut(), map_area);

    // 2. Render room labels
    render_room_labels(&floor.rooms, vx, vy, vw, vh, frame.buffer_mut(), map_area);

    // 3. Render player (always last, always on top)
    render_player(player, vx, vy, vw, vh, frame.buffer_mut(), map_area);
}
```

**`Layout::vertical` and `Constraint`** — We're using ratatui's layout system to split the screen. `Layout::vertical([...])` creates a vertical split. `Constraint::Fill(1)` means "take all remaining space" and `Constraint::Length(1)` means "exactly 1 row." The `.areas(area)` method returns an array of `Rect`s — one per constraint. We destructure it into `[map_area, status_area]`.

**`frame.buffer_mut()`** — gives us mutable access to the underlying `Buffer` for direct cell manipulation. This is lower-level than `frame.render_widget()` but gives us precise control over individual cells.

### Checkpoint: Stage 12 Complete

Room names now float inside their boundaries on the map. Walk into the Great Hall and see its name. Step into a corridor and it disappears. The map is starting to feel like a real place. But you're still trapped on one floor — time to connect the staircases and let you climb through the castle.

**Common mistake:** Rendering labels *after* the player, which makes the label text overwrite the `@` symbol when the player stands in a room. Always render the player last.

---

## Stage 13: Stairs & Floor Transitions (Medium)

*"The staircases at Hogwarts were fond of changing."*

Hogwarts is a vertical castle — dungeons below, towers above, seven floors of corridors and classrooms between. A single-floor map is a hallway; connecting floors with stairs makes it a *castle*. This stage introduces `MoveResult`, an enum with data — your first taste of algebraic data types that carry payloads, not just labels. The compiler will ensure you handle every possible outcome of a move.

Hogwarts has seven floors, from the Dungeons to the Seventh Floor. Your player is trapped on one. Time to connect them with stairs.

### How Stairs Work

Right now we have multiple floors loaded from JSON and stair tiles rendered on the map, but stepping on a stair tile does nothing — the `try_move` function treats it like any other walkable tile. We need to detect when the player lands on stairs and teleport them to the destination floor and position.

From the design spec, the `Stairs` tile variant carries its destination:

```rust
Tile::Stairs {
    destination_floor: u8,
    destination_pos: (usize, usize),  // (x, y) on the target floor
}
```

When the player walks onto a `Stairs` tile, they should:
1. Change to the destination floor
2. Move to the destination position
3. The viewport snaps to the new location

This is a **teleport** — the player's position jumps discontinuously. No animation (yet), just an instant transition.

### Handling Stairs in `try_move`

We need to extend `try_move` to detect when the player steps onto stairs and handle the floor change:

```rust
// src/player.rs

impl Player {
    pub fn try_move(&mut self, dx: i32, dy: i32, map: &mut HogwartsMap) -> MoveResult {
        let new_x = self.x as i32 + dx;
        let new_y = self.y as i32 + dy;

        if new_x < 0 || new_y < 0 {
            return MoveResult::Blocked;
        }

        let new_x = new_x as usize;
        let new_y = new_y as usize;

        let floor = &map.floors[self.floor];

        if new_y >= floor.grid.len() || new_x >= floor.grid[0].len() {
            return MoveResult::Blocked;
        }

        match &floor.grid[new_y][new_x] {
            Tile::Wall => MoveResult::Blocked,
            Tile::Door { locked: true, .. } => MoveResult::Blocked,
            Tile::SecretPassage { discovered: false, .. } => MoveResult::Blocked,

            Tile::Stairs { destination_floor, destination_pos } => {
                let dest_floor = *destination_floor as usize;
                let (dest_x, dest_y) = *destination_pos;

                // Validate the destination exists
                if dest_floor < map.floors.len() {
                    let target = &map.floors[dest_floor];
                    if dest_y < target.grid.len() && dest_x < target.grid[0].len() {
                        self.floor = dest_floor;
                        self.x = dest_x;
                        self.y = dest_y;
                        return MoveResult::ChangedFloor(dest_floor);
                    }
                }
                MoveResult::Blocked // invalid destination
            }

            Tile::SecretPassage {
                discovered: true,
                destination_floor,
                destination_pos,
            } => {
                let dest_floor = *destination_floor as usize;
                let (dest_x, dest_y) = *destination_pos;

                if dest_floor < map.floors.len() {
                    let target = &map.floors[dest_floor];
                    if dest_y < target.grid.len() && dest_x < target.grid[0].len() {
                        self.floor = dest_floor;
                        self.x = dest_x;
                        self.y = dest_y;
                        return MoveResult::ChangedFloor(dest_floor);
                    }
                }
                MoveResult::Blocked
            }

            // All other walkable tiles: Floor, open Door, Entrance
            _ => {
                self.x = new_x;
                self.y = new_y;
                MoveResult::Moved
            }
        }
    }
}
```

### The `MoveResult` Enum

We changed the return type from `bool` to a custom enum. Why? Because "moved" and "didn't move" aren't enough anymore — we need to distinguish "moved on the same floor" from "changed floors" so the game loop can react differently (play a transition effect, update the floor indicator, etc.):

```rust
// src/player.rs

/// What happened when the player tried to move.
#[derive(Debug, PartialEq)]
pub enum MoveResult {
    /// Player moved to a new position on the same floor.
    Moved,
    /// Player was blocked by a wall, locked door, etc.
    Blocked,
    /// Player moved to a different floor.
    ChangedFloor(usize),
}
```

**Enums with data:** `ChangedFloor(usize)` carries the destination floor index inside the variant. This is an **algebraic data type** — the enum variant *is* the data. No separate fields, no nullable properties, just the variant and its payload.

> **TypeScript comparison:** This is like a discriminated union:
> ```typescript
> type MoveResult =
>   | { kind: 'moved' }
>   | { kind: 'blocked' }
>   | { kind: 'changedFloor'; floor: number };
> ```
> Rust's version is more concise and the compiler enforces exhaustive matching.

### Updating the Game Loop

The game loop now handles the result:

```rust
// In run(), the input handling section:
let result = match key.code {
    KeyCode::Char('q') | KeyCode::Esc => return Ok(()),
    KeyCode::Up    | KeyCode::Char('w') => player.try_move( 0, -1, &mut map),
    KeyCode::Down  | KeyCode::Char('s') => player.try_move( 0,  1, &mut map),
    KeyCode::Left  | KeyCode::Char('a') => player.try_move(-1,  0, &mut map),
    KeyCode::Right | KeyCode::Char('d') => player.try_move( 1,  0, &mut map),
    _ => MoveResult::Blocked,
};

if let MoveResult::ChangedFloor(new_floor) = result {
    // Floor changed! You could play a transition animation here.
    // For now, just log it (the viewport will auto-center on the player).
    let floor_name = &map.floors[new_floor].name;
    // We'll display this in the status bar (Stage 14)
}
```

**`if let` for single-variant matching:** When you only care about one variant of an enum, `if let` is cleaner than a full `match`. It says "if this is a `ChangedFloor`, bind the inner value to `new_floor` and run this block."

### A Smooth Transition (Optional Enhancement)

The instant snap between floors works but feels abrupt. A simple enhancement: briefly flash a message like "Climbing to Floor 3..." before rendering the new floor. Here's a minimal approach:

```rust
if let MoveResult::ChangedFloor(new_floor) = result {
    let floor_name = &map.floors[new_floor].name;

    // Flash a transition message for one frame
    terminal.draw(|frame| {
        let area = frame.area();
        let msg = format!("  Climbing to {}...  ", floor_name);
        let paragraph = ratatui::widgets::Paragraph::new(msg)
            .style(ratatui::style::Style::new()
                .fg(ratatui::style::Color::Yellow)
                .add_modifier(ratatui::style::Modifier::BOLD))
            .alignment(ratatui::layout::Alignment::Center);
        // Render centered vertically
        let vertical = ratatui::layout::Layout::vertical([
            ratatui::layout::Constraint::Fill(1),
            ratatui::layout::Constraint::Length(1),
            ratatui::layout::Constraint::Fill(1),
        ]);
        let [_, center, _] = vertical.areas(area);
        frame.render_widget(paragraph, center);
    })?;

    // Pause briefly so the player sees the message
    std::thread::sleep(Duration::from_millis(400));
}
```

**`Paragraph` widget:** ratatui's `Paragraph` renders a block of text. We create one with our message, style it yellow and bold, and center it. `frame.render_widget(paragraph, center)` draws it into the center row of the screen.

**`Alignment::Center`** — horizontally centers the text within the `Rect`. Combined with the vertical layout that puts the text in the middle row, we get a centered message.

### Stair Rendering

Stairs should look different from regular floor tiles so the player can find them. In your tile rendering function, give stairs a distinct character and color:

```rust
// In render_tiles(), the tile-to-character mapping:
match tile {
    Tile::Wall => ('█', Style::new().fg(Color::DarkGray)),
    Tile::Floor => ('·', Style::new().fg(Color::Rgb(60, 60, 60))),
    Tile::Door { locked: true, .. } => ('+', Style::new().fg(Color::Red)),
    Tile::Door { locked: false, .. } => ('/', Style::new().fg(Color::Yellow)),
    Tile::Stairs { .. } => ('≡', Style::new().fg(Color::Cyan)),
    Tile::SecretPassage { discovered: true, .. } => ('◊', Style::new().fg(Color::Magenta)),
    Tile::SecretPassage { discovered: false, .. } => ('█', Style::new().fg(Color::DarkGray)),
    Tile::Entrance { .. } => ('▫', Style::new().fg(Color::White)),
}
```

The `≡` character (triple horizontal bar) suggests "stairs" visually. Cyan makes it stand out from the gray corridors. Discovered secret passages get `◊` in magenta — mysterious and inviting.

### Checkpoint: Stage 13 Complete

Walk to a staircase, step onto it, and — whoosh — you're on a different floor. The floor name flashes briefly, then you're exploring new corridors. Try finding the stairs from the Ground Floor up to the First Floor, then keep climbing. The castle is now fully navigable vertically. One thing is missing: a status bar that tells you where you are, what time it is, and how close you are to getting caught.

Your project structure:

```
src/
├── main.rs          // game loop with floor transition handling
├── map.rs           // HogwartsMap, Floor, Tile, Room, RoomBounds
├── player.rs        // Player, MoveResult, try_move with stairs
└── render.rs        // tiles, labels, player, transition message
```

**Common mistake:** Borrowing `map.floors[self.floor]` and then trying to modify `self.floor`:
```rust
let floor = &map.floors[self.floor];  // immutable borrow of map
self.floor = dest_floor;               // modifying self is fine
self.x = dest_x;                       // this is fine too
// floor is still valid — we borrowed map, not self
```
This actually works because `floor` borrows from `map` and we're modifying `self` — they're different data. But if you tried to modify `map` while `floor` exists, the borrow checker would stop you. Understanding *what* is borrowed and *from where* is the key to working with the borrow checker.

---

## Stage 14: The Status Bar (Easy)

*"The Map never lies."*

A game without a HUD is like a map without a legend — you're wandering blind. The status bar transforms raw game state into information the player can *act on*: which floor am I on? What room is this? How close am I to getting caught? This stage teaches ratatui's `Span` and `Line` types for building rich, multi-styled text — the same pattern used in every professional TUI application.

Every good game has a HUD — a heads-up display showing vital information. The Marauder's Map needs a status bar at the bottom of the screen showing the current floor, position, time, score, and detection meter. We already reserved space for it in Stage 12's layout. Now let's fill it in.

### Game State

Right now we track the player's position and the map, but we have no concept of score, detection level, or elapsed time. We need a `GameState` struct to hold the mutable game-wide data that the status bar will display — and that future systems (NPCs, missions) will modify.

First, we need somewhere to track score, time, and detection. Let's create a `GameState` struct:

```rust
// src/game.rs

use std::time::Instant;

/// Tracks all mutable game state beyond the player and map.
pub struct GameState {
    pub score: i32,
    pub detection: u8,       // 0-100, caught at 100
    pub start_time: Instant, // when the game started
    pub moves: u32,          // total moves made
}

impl GameState {
    pub fn new() -> Self {
        Self {
            score: 0,
            detection: 0,
            start_time: Instant::now(),
            moves: 0,
        }
    }

    /// Format elapsed time as HH:MM in-game time.
    /// 1 real second = 1 in-game minute, starting at 11:00 PM.
    pub fn game_time(&self) -> String {
        let elapsed_secs = self.start_time.elapsed().as_secs();
        // Start at 23:00 (11 PM), each real second = 1 game minute
        let total_minutes = 23 * 60 + elapsed_secs;
        let hours = (total_minutes / 60) % 24;
        let minutes = total_minutes % 60;
        format!("{:02}:{:02}", hours, minutes)
    }

    /// Update detection meter: decay when standing still.
    pub fn tick_detection(&mut self) {
        self.detection = self.detection.saturating_sub(2);
    }

    /// Increase detection from movement.
    pub fn on_move(&mut self) {
        self.moves += 1;
        self.detection = self.detection.saturating_add(1).min(100);
    }
}
```

**`saturating_add` and `min`:** Just like `saturating_sub` prevents underflow, `saturating_add` prevents overflow (though `u8` maxes at 255, not 100). We chain `.min(100)` to clamp the detection meter to our game's maximum. This is a common pattern for bounded values.

**`Instant::now()` and `.elapsed()`:** `Instant` is Rust's monotonic clock — it only moves forward, never backwards (unlike wall-clock time which can jump during daylight saving or NTP adjustments). `.elapsed()` returns a `Duration` representing how much time has passed since the instant was created.

> **Python comparison:** `Instant::now()` is like `time.monotonic()`. The `Duration` type is like `timedelta`. Rust's type system prevents you from accidentally mixing wall-clock and monotonic times.

### Rendering the Status Bar

The status bar is a single row at the bottom of the screen. We'll use ratatui's `Line` and `Span` types to build a styled, multi-segment bar:

```rust
// src/render.rs

use ratatui::style::{Color, Modifier, Style, Stylize};
use ratatui::text::{Line, Span};

pub fn render_status_bar(
    frame: &mut ratatui::Frame,
    area: ratatui::layout::Rect,
    player: &Player,
    map: &HogwartsMap,
    state: &GameState,
) {
    let floor = &map.floors[player.floor];

    // Current room name, or "Corridor"
    let location = floor
        .room_at(player.x, player.y)
        .map(|r| r.name.as_str())
        .unwrap_or("Corridor");

    // Detection meter: color changes with danger level
    let det_color = match state.detection {
        0..=30 => Color::Green,
        31..=60 => Color::Yellow,
        61..=99 => Color::Red,
        100 => Color::LightRed,
        _ => Color::White,
    };

    let det_bar = "█".repeat((state.detection as usize) / 5); // 20 chars max
    let det_empty = "░".repeat(20 - (state.detection as usize) / 5);

    // Build the status line from spans
    let status = Line::from(vec![
        Span::styled(
            format!(" {} ", floor.name),
            Style::new().fg(Color::Black).bg(Color::Cyan).bold(),
        ),
        Span::raw(" "),
        Span::styled(
            format!("({},{})", player.x, player.y),
            Style::new().fg(Color::DarkGray),
        ),
        Span::raw(" │ "),
        Span::styled(location, Style::new().fg(Color::White)),
        Span::raw(" │ "),
        Span::styled(
            format!("⏰ {}", state.game_time()),
            Style::new().fg(Color::Yellow),
        ),
        Span::raw(" │ "),
        Span::styled(
            format!("★ {}", state.score),
            Style::new().fg(Color::Magenta),
        ),
        Span::raw(" │ "),
        Span::styled("Detection ", Style::new().fg(Color::DarkGray)),
        Span::styled(det_bar, Style::new().fg(det_color)),
        Span::styled(det_empty, Style::new().fg(Color::DarkGray)),
    ]);

    frame.render_widget(status, area);
}
```

Let's break down the key concepts:

### Spans and Lines

ratatui builds text from three layers:
- **`Span`** — a string with a single style. Like a `<span>` in HTML.
- **`Line`** — a horizontal sequence of `Span`s. Like a `<div>` with inline elements.
- **`Text`** — multiple `Line`s stacked vertically. Like a `<p>`.

`Line::from(vec![...])` takes a vector of `Span`s and concatenates them horizontally. Each span can have its own foreground color, background color, and modifiers (bold, italic, etc.).

**`Span::styled(text, style)`** creates a span with explicit styling. **`Span::raw(text)`** creates an unstyled span (inherits the default terminal colors).

**`Style::new().fg(Color::Cyan).bold()`** — styles are built with a builder pattern. `.fg()` sets foreground color, `.bg()` sets background, `.bold()` adds the bold modifier. `Color::Cyan`, `Color::Yellow`, `Color::Rgb(60, 60, 60)` — ratatui supports named ANSI colors and 24-bit RGB.

> **TypeScript comparison:** This is like building a React component from styled spans:
> ```tsx
> <span style={{color: 'cyan', fontWeight: 'bold'}}> Floor 3 </span>
> <span style={{color: 'gray'}}>(12,5)</span>
> ```
> Same concept, different syntax.

### The Detection Meter

The detection meter is a visual bar made of Unicode block characters:

```
Detection ████████░░░░░░░░░░░░  (40/100)
```

`"█".repeat(n)` creates a string of `n` filled blocks. `"░".repeat(m)` creates empty blocks. The filled portion is colored based on danger level — green when safe, red when about to be caught.

**Range patterns in `match`:** `0..=30` matches any value from 0 to 30 inclusive. This is Rust's range pattern syntax. The `..=` means "inclusive end." Without the `=`, `0..30` would exclude 30.

### Wiring It All Together

Update `draw_map` to pass the game state to the status bar:

```rust
pub fn draw_map(
    frame: &mut ratatui::Frame,
    map: &HogwartsMap,
    player: &Player,
    state: &GameState,
) {
    let area = frame.area();
    let floor = &map.floors[player.floor];
    let map_height = floor.grid.len();
    let map_width = if map_height > 0 { floor.grid[0].len() } else { 0 };

    let layout = ratatui::layout::Layout::vertical([
        ratatui::layout::Constraint::Fill(1),
        ratatui::layout::Constraint::Length(1),
    ]);
    let [map_area, status_area] = layout.areas(area);

    let vw = map_area.width as usize;
    let vh = map_area.height as usize;
    let (vx, vy) = center_viewport_on_player(player, vw, vh, map_width, map_height);

    // Render layers in order
    render_tiles(floor, vx, vy, vw, vh, frame.buffer_mut(), map_area);
    render_room_labels(&floor.rooms, vx, vy, vw, vh, frame.buffer_mut(), map_area);
    render_player(player, vx, vy, vw, vh, frame.buffer_mut(), map_area);

    // Status bar
    render_status_bar(frame, status_area, player, map, state);
}
```

And update the game loop to maintain `GameState`:

```rust
fn run(
    terminal: &mut DefaultTerminal,
    map: &mut HogwartsMap,
    player: &mut Player,
) -> io::Result<()> {
    let mut state = GameState::new();
    let mut last_tick = Instant::now();

    loop {
        // ── RENDER ──
        terminal.draw(|frame| {
            render::draw_map(frame, map, player, &state);
        })?;

        // ── INPUT ──
        let timeout = TICK_RATE.saturating_sub(last_tick.elapsed());
        if event::poll(timeout)? {
            if let Event::Key(key) = event::read()? {
                if key.kind == KeyEventKind::Press {
                    let result = match key.code {
                        KeyCode::Char('q') | KeyCode::Esc => return Ok(()),
                        KeyCode::Up    | KeyCode::Char('w') => player.try_move( 0, -1, map),
                        KeyCode::Down  | KeyCode::Char('s') => player.try_move( 0,  1, map),
                        KeyCode::Left  | KeyCode::Char('a') => player.try_move(-1,  0, map),
                        KeyCode::Right | KeyCode::Char('d') => player.try_move( 1,  0, map),
                        _ => MoveResult::Blocked,
                    };

                    match result {
                        MoveResult::Moved => {
                            state.on_move();
                        }
                        MoveResult::ChangedFloor(new_floor) => {
                            state.on_move();
                            state.score += 10; // bonus for exploring new floors
                        }
                        MoveResult::Blocked => {}
                    }
                }
            }
        }

        // ── TICK ──
        if last_tick.elapsed() >= TICK_RATE {
            state.tick_detection(); // detection decays over time
            last_tick = Instant::now();
        }
    }
}
```

### Checkpoint: Stage 14 Complete

The bottom of your screen now shows:

```
 Ground Floor  (23,15) │ Great Hall │ ⏰ 23:07 │ ★ 30 │ Detection ████░░░░░░░░░░░░░░░░
```

Floor name in a cyan badge. Coordinates in gray. Current room in white. Game time ticking. Score accumulating. Detection meter pulsing green-to-red as you move. Act 2 is complete — you have a fully interactive Hogwarts explorer. In Act 3, the corridors won't be empty much longer: pathfinding algorithms will give NPCs the intelligence to patrol, scout, and chase you through the castle.

### Final Project Structure

```
src/
├── main.rs          // entry point, game loop, tick rate
├── map.rs           // HogwartsMap, Floor, Tile, Room, RoomBounds
├── player.rs        // Player, MoveResult, try_move, spawn
├── game.rs          // GameState: score, detection, time — NEW
└── render.rs        // tiles, labels, player, status bar
```

---

## Act 2 Recap: What You've Learned

You started with a static map and ended with a fully interactive Hogwarts explorer. Along the way, you learned:

**Rust concepts:**
- **Structs and methods** (`impl Player`, `impl GameState`) — attaching behavior to data
- **Enums with data** (`MoveResult::ChangedFloor(usize)`) — algebraic data types that carry payloads
- **Pattern matching** (`match`, `if let`, `matches!`) — the Swiss Army knife of Rust control flow
- **Mutable vs immutable references** (`&` vs `&mut`) — declaring intent, enforced by the compiler
- **The borrow checker** — why you can't store `&map` inside `Player`, and how to work with it instead of against it
- **Integer types** (`usize`, `i32`, `u8`) — explicit conversions, `saturating_sub`, `saturating_add`
- **Variable shadowing** — reusing names after type conversion
- **`Option<T>`** — Rust's null replacement, forcing you to handle the "nothing" case

**Game development patterns:**
- **The game loop** — input → update → render, with tick-rate timing
- **Non-blocking input** — `poll()` with timeout for responsive real-time updates
- **Tile-based collision** — check-before-move with walkability queries
- **Viewport centering** — camera follows the player with edge clamping
- **Layered rendering** — tiles → labels → NPCs → player, later draws on top
- **Status bar HUD** — multi-segment styled text with `Span` and `Line`

**What's coming in Act 3:** The corridors are quiet. Too quiet. In *"Mischief Managed"*, NPCs will populate the map — Filch patrolling with Mrs. Norris, Snape lurking in the dungeons, Peeves causing chaos. You'll implement BFS, Dijkstra, and A* pathfinding to give them intelligence. The detection meter will actually matter. The game begins.

> *"Mischief managed."*
