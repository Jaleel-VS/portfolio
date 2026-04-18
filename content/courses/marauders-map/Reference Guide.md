# Marauder's Map — Reference Guide

> *Bookmark this. You'll come back to it.*

---

## 1. Rust Cheat Sheet

All examples use code from the Marauder's Map project.

### Ownership

Every value in Rust has exactly one owner. When the owner goes out of scope, the value is dropped.

```rust
fn main() {
    let map = load_map("hogwarts.json"); // map owns the data
    let floor = map.floors[0].clone();   // clone — floor owns its own copy
    render_floor(&floor);                // borrow — floor is still valid after this
}   // map and floor are dropped here
```

**Move semantics** — assignment transfers ownership:

```rust
let cloak = Item::InvisibilityCloak;
let used = cloak;       // cloak is MOVED into used
// println!("{:?}", cloak); // ERROR: cloak was moved
println!("{:?}", used);    // OK
```

### Borrowing

References let you use a value without taking ownership.

```rust
// Immutable borrow — can have many at once
fn count_npcs(npcs: &[Npc]) -> usize {
    npcs.iter().filter(|n| n.is_active()).count()
}

// Mutable borrow — only one at a time
fn damage_player(player: &mut Player, amount: i32) {
    player.detection += amount;
}

// The borrow checker prevents data races at compile time:
let mut game = GameState::new();
let player = &game.player;       // immutable borrow
// game.tick();                   // ERROR: can't mutate while borrowed
println!("{}", player.x);        // still using the borrow
// After this line, the borrow ends — mutation is OK again
game.tick();
```

### Lifetimes

Lifetimes ensure references don't outlive the data they point to. Usually inferred, sometimes explicit:

```rust
// The compiler infers: the returned &str lives as long as the input Tile
fn tile_char(tile: &Tile) -> &str {
    match tile {
        Tile::Wall => "█",
        Tile::Floor => " ",
        _ => "?",
    }
}

// Explicit lifetime — the struct holds a reference, so we must declare how long it lives
struct FloorView<'a> {
    grid: &'a Vec<Vec<Tile>>,
    name: &'a str,
}
```

### Pattern Matching

Rust's `match` is exhaustive — you must handle every case.

```rust
// Simple enum matching
match npc.state {
    NpcState::Idle => { /* wait */ }
    NpcState::Patrol { waypoint_index } => {
        move_to_waypoint(npc, waypoint_index);
    }
    NpcState::Alert { target_x, target_y } => {
        let path = astar(npc.pos(), (target_x, target_y), &grid);
        follow_path(npc, &path);
    }
    NpcState::Chase => {
        let path = astar(npc.pos(), player.pos(), &grid);
        follow_path(npc, &path);
    }
    NpcState::Return => {
        npc.state = NpcState::Patrol { waypoint_index: 0 };
    }
}

// Destructuring with guards
match tile {
    Tile::Door { locked: true, .. } => "Locked!",
    Tile::Door { locked: false, room_id: Some(id) } => {
        &format!("Enter room {}", id)
    }
    Tile::SecretPassage { discovered: false, .. } => "█", // Looks like a wall
    _ => " ",
}

// if let — when you only care about one variant
if let Event::Key(KeyEvent { code: KeyCode::Char(c), .. }) = event {
    handle_char(c);
}
```

### Error Handling

```rust
// Result for recoverable errors
fn load_map(path: &str) -> Result<MapFile, Box<dyn std::error::Error>> {
    let json = std::fs::read_to_string(path)?;  // ? propagates errors
    let map: MapFile = serde_json::from_str(&json)?;
    Ok(map)
}

// Option for values that might not exist
fn find_npc(npcs: &[Npc], name: &str) -> Option<&Npc> {
    npcs.iter().find(|n| n.name == name)
}

// Combining with map, unwrap_or, and_then
let filch_floor = find_npc(&npcs, "Filch")
    .map(|n| n.floor)
    .unwrap_or(0);
```

### Traits

Traits define shared behavior — like interfaces with default implementations.

```rust
trait Pathfinder {
    fn find_path(&self, start: (usize, usize), goal: (usize, usize), grid: &Grid) -> Vec<(usize, usize)>;

    // Default implementation
    fn distance(&self, a: (usize, usize), b: (usize, usize)) -> usize {
        a.0.abs_diff(b.0) + a.1.abs_diff(b.1) // Manhattan distance
    }
}

struct AStarPathfinder;
impl Pathfinder for AStarPathfinder {
    fn find_path(&self, start: (usize, usize), goal: (usize, usize), grid: &Grid) -> Vec<(usize, usize)> {
        // A* implementation...
        vec![]
    }
}

// Use trait objects for dynamic dispatch
fn assign_pathfinder(npc_type: &str) -> Box<dyn Pathfinder> {
    match npc_type {
        "Patrol" => Box::new(AStarPathfinder),
        "Scout" => Box::new(BfsPathfinder),
        _ => Box::new(DijkstraPathfinder),
    }
}
```

### Generics

Write code that works with multiple types:

```rust
// Generic priority queue used by Dijkstra and A*
use std::collections::BinaryHeap;
use std::cmp::Reverse;

fn shortest_path<F>(start: (usize, usize), goal: (usize, usize), heuristic: F) -> Vec<(usize, usize)>
where
    F: Fn((usize, usize), (usize, usize)) -> usize,
{
    let mut heap: BinaryHeap<Reverse<(usize, (usize, usize))>> = BinaryHeap::new();
    heap.push(Reverse((heuristic(start, goal), start)));
    // ...
    vec![]
}

// Call with different heuristics:
// Dijkstra: heuristic always returns 0
shortest_path(start, goal, |_, _| 0);
// A*: Manhattan distance heuristic
shortest_path(start, goal, |a, b| a.0.abs_diff(b.0) + a.1.abs_diff(b.1));
```

### Common Iterator Patterns

```rust
// Filter NPCs on current floor
let nearby: Vec<&Npc> = npcs.iter()
    .filter(|n| n.floor == current_floor)
    .collect();

// Transform tiles to characters
let row_str: String = row.iter()
    .map(|tile| tile_to_char(tile))
    .collect();

// Find closest NPC
let closest = npcs.iter()
    .filter(|n| n.floor == current_floor)
    .min_by_key(|n| manhattan_distance(n.x, n.y, player.x, player.y));

// Count discovered passages
let found = floors.iter()
    .flat_map(|f| f.grid.iter().flatten())
    .filter(|t| matches!(t, Tile::SecretPassage { discovered: true, .. }))
    .count();
```

---

## 2. Pathfinding Algorithm Comparison

| | BFS | Dijkstra | A* |
|---|---|---|---|
| **Introduced with** | Mrs. Norris (exploration) | Snape (shortest path) | Filch (chase) |
| **Time complexity** | O(V + E) | O((V + E) log V) | O((V + E) log V) |
| **Space complexity** | O(V) | O(V) | O(V) |
| **Guarantees shortest path?** | Yes (unweighted) | Yes (weighted) | Yes (with admissible heuristic) |
| **Handles weighted edges?** | No | Yes | Yes |
| **Uses heuristic?** | No | No | Yes |
| **Data structure** | Queue (VecDeque) | Priority queue (BinaryHeap) | Priority queue (BinaryHeap) |
| **Best for** | Exploration, flood fill, "what's reachable?" | Shortest path with varying costs | Targeted search toward a known goal |
| **Nodes explored** | All reachable | Many (expands in all directions) | Fewer (guided by heuristic) |
| **When to use in game** | Mrs. Norris scouting nearby tiles | Snape finding shortest route between rooms | Filch chasing the player |

### Visual Comparison

Imagine finding a path from `S` to `G` on a 20x20 grid:

```
BFS explores:        Dijkstra explores:    A* explores:
████████████████     ████████████████      ████████████████
█··············█     █··············█      █          ····█
█·S···········G█     █·S···········G█      █ S·······G    █
█··············█     █··············█      █    ·····     █
████████████████     ████████████████      ████████████████

~200 nodes            ~180 nodes            ~45 nodes
```

BFS and Dijkstra expand outward like ripples. A* beelines toward the goal.

### Real-World Applications

| Algorithm | Game use | Real-world use |
|-----------|----------|----------------|
| BFS | Fog of war reveal, area detection | Social network "degrees of separation", web crawling |
| Dijkstra | NPC route planning with terrain costs | GPS navigation, network routing (OSPF) |
| A* | Real-time enemy pursuit | Video game AI (industry standard), robotics path planning |

---

## 3. Big-O Reference

### Common Complexities

| Notation | Name | Example from course | Growth |
|----------|------|---------------------|--------|
| O(1) | Constant | HashMap lookup for room by ID | Flat |
| O(log n) | Logarithmic | BinaryHeap push/pop in Dijkstra | Barely grows |
| O(n) | Linear | Iterating all NPCs to check detection | Proportional |
| O(n log n) | Linearithmic | Sorting high scores | Slightly above linear |
| O(n²) | Quadratic | Checking all NPC pairs for collision | Gets painful |
| O(V + E) | Linear (graph) | BFS traversal of the map grid | Depends on graph size |
| O((V+E) log V) | Graph + heap | Dijkstra / A* pathfinding | Efficient for sparse graphs |

### Visualized

```
Operations for n items:

n=10    n=100    n=1000   n=10000
─────   ──────   ───────  ────────
O(1)        1        1         1         1
O(log n)    3        7        10        13
O(n)       10      100     1,000    10,000
O(n log n) 33      664     9,966   132,877
O(n²)     100   10,000 1,000,000  too many
```

### Rules of Thumb

- **HashMap** over **Vec** for lookups by key (O(1) vs O(n))
- **BinaryHeap** for "give me the smallest/largest" (O(log n) push/pop)
- **VecDeque** for BFS queues (O(1) push_back/pop_front)
- Avoid nested loops over the same collection when possible (O(n²))
- For our map grid (60x30 = 1800 tiles), even O(n²) is fine — but it matters for larger maps

---

## 4. ratatui Widget Quick Reference

Based on ratatui 0.30.0 — [docs.rs/ratatui](https://docs.rs/ratatui/latest)

### Widgets Used in This Course

#### Block — Container with borders and titles

```rust
use ratatui::widgets::Block;

// Minimal bordered block
let block = Block::bordered().title("Map");

// Customized block
use ratatui::widgets::BorderType;
use ratatui::style::{Style, Stylize};

let block = Block::bordered()
    .title("Marauder's Map")
    .title_bottom("Floor 3")
    .border_type(BorderType::Rounded)
    .border_style(Style::new().cyan())
    .style(Style::new().on_black());
```

Key methods: `Block::new()`, `Block::bordered()`, `.title()`, `.title_top()`, `.title_bottom()`, `.border_type()`, `.border_style()`, `.style()`, `.padding()`, `.inner(area) -> Rect`

#### Paragraph — Text display

```rust
use ratatui::widgets::{Block, Paragraph, Wrap};
use ratatui::style::{Style, Stylize};
use ratatui::text::{Line, Span};

// Simple
let p = Paragraph::new("Hello, Hogwarts!");

// Styled with wrapping
let p = Paragraph::new("Long atmospheric text...")
    .block(Block::bordered().title("Message"))
    .style(Style::new().italic())
    .wrap(Wrap { trim: true })
    .centered();

// Multi-line with spans
let lines = vec![
    Line::from(vec![
        Span::raw("Score: "),
        Span::styled("425", Style::new().yellow().bold()),
    ]),
];
let p = Paragraph::new(lines).scroll((0, 0));
```

Key methods: `Paragraph::new(text)`, `.block()`, `.style()`, `.wrap(Wrap { trim })`, `.alignment()`, `.centered()`, `.left_aligned()`, `.right_aligned()`, `.scroll((y, x))`

#### List — Selectable item list

```rust
use ratatui::widgets::{Block, List, ListItem, ListState};
use ratatui::style::{Style, Stylize};

let items = vec![
    ListItem::new("Invisibility Cloak"),
    ListItem::new("Dungbomb"),
    ListItem::new("Decoy Detonator"),
];

let list = List::new(items)
    .block(Block::bordered().title("Inventory"))
    .highlight_style(Style::new().reversed())
    .highlight_symbol(">> ");

// Stateful rendering (tracks selection)
let mut state = ListState::default();
state.select(Some(0));
frame.render_stateful_widget(list, area, &mut state);
```

Key methods: `List::new(items)`, `.block()`, `.style()`, `.highlight_style()`, `.highlight_symbol()`, `.direction()`, `.scroll_padding()`

State: `ListState::default()`, `.select(Some(index))`, `.selected() -> Option<usize>`

#### Gauge — Progress bar (detection meter)

```rust
use ratatui::widgets::{Block, Gauge};
use ratatui::style::{Style, Color};

let gauge = Gauge::default()
    .block(Block::bordered().title("Detection"))
    .gauge_style(Style::new().fg(Color::Red))
    .ratio(0.75)  // 0.0 to 1.0
    .label("DANGER!");
```

Key methods: `Gauge::default()`, `.block()`, `.gauge_style()`, `.ratio(f64)`, `.percent(u16)`, `.label()`

#### Tabs — Tab bar (mission/floor selection)

```rust
use ratatui::widgets::{Block, Tabs};
use ratatui::style::{Style, Stylize};

let tabs = Tabs::new(vec!["Dungeons", "Ground", "First", "Second"])
    .block(Block::bordered().title("Floors"))
    .highlight_style(Style::new().yellow().bold())
    .select(2);
```

Key methods: `Tabs::new(titles)`, `.block()`, `.highlight_style()`, `.select(index)`, `.style()`

#### Table — Data grid (high scores, NPC list)

```rust
use ratatui::widgets::{Block, Cell, Row, Table};
use ratatui::style::{Style, Stylize};

let rows = vec![
    Row::new(vec![Cell::from("Filch"), Cell::from("Floor 3"), Cell::from("Patrol")]),
    Row::new(vec![Cell::from("Snape"), Cell::from("Dungeons"), Cell::from("Idle")]),
];

let table = Table::new(rows, [15, 12, 10]) // column widths
    .block(Block::bordered().title("NPCs"))
    .header(Row::new(vec!["Name", "Location", "State"]).bold());
```

Key methods: `Table::new(rows, widths)`, `.block()`, `.header()`, `.highlight_style()`, `.style()`

### Layout

```rust
use ratatui::layout::{Layout, Constraint, Direction};

let chunks = Layout::default()
    .direction(Direction::Vertical)
    .constraints([
        Constraint::Length(3),      // Fixed 3 rows (title bar)
        Constraint::Min(10),        // At least 10 rows (map area)
        Constraint::Length(1),      // Fixed 1 row (status bar)
    ])
    .split(frame.area());

// chunks[0] = title area
// chunks[1] = map area
// chunks[2] = status bar
```

Constraint types: `Length(u16)`, `Min(u16)`, `Max(u16)`, `Percentage(u16)`, `Ratio(u32, u32)`, `Fill(u16)`

---

## 5. crossterm Key Event Reference

Based on crossterm 0.29.0 — [docs.rs/crossterm](https://docs.rs/crossterm/latest)

### Event Loop Pattern

```rust
use std::time::Duration;
use crossterm::event::{self, Event, KeyCode, KeyEvent, KeyModifiers, KeyEventKind};

fn handle_input(game: &mut GameState) -> bool {
    // Non-blocking poll
    if event::poll(Duration::from_millis(50)).unwrap() {
        if let Event::Key(key) = event::read().unwrap() {
            // Only handle key press events (not release/repeat)
            if key.kind != KeyEventKind::Press {
                return false;
            }
            match key.code {
                KeyCode::Char('q') => return true,  // quit
                KeyCode::Up    | KeyCode::Char('w') => move_player(game, 0, -1),
                KeyCode::Down  | KeyCode::Char('s') => move_player(game, 0, 1),
                KeyCode::Left  | KeyCode::Char('a') => move_player(game, -1, 0),
                KeyCode::Right | KeyCode::Char('d') => move_player(game, 1, 0),
                KeyCode::Char('i') => game.toggle_inventory(),
                KeyCode::Char('m') => game.toggle_missions(),
                KeyCode::Esc => game.close_overlay(),
                KeyCode::Enter => game.confirm_selection(),
                _ => {}
            }

            // Modifier check (Ctrl+S to save)
            if key.modifiers.contains(KeyModifiers::CONTROL) {
                if let KeyCode::Char('s') = key.code {
                    save_game(game).ok();
                }
            }
        }
    }
    false
}
```

### KeyCode Variants (commonly used)

| Variant | Description | Usage in game |
|---------|-------------|---------------|
| `KeyCode::Char(c)` | Any character key | WASD movement, hotkeys |
| `KeyCode::Up/Down/Left/Right` | Arrow keys | Movement |
| `KeyCode::Enter` | Enter/Return | Confirm selection |
| `KeyCode::Esc` | Escape | Close overlay, quit menu |
| `KeyCode::Tab` | Tab | Cycle floors |
| `KeyCode::BackTab` | Shift+Tab | Cycle floors reverse |
| `KeyCode::F(n)` | Function keys F1-F12 | Debug views |
| `KeyCode::Backspace` | Backspace/Delete | Clear input |

### KeyModifiers

```rust
use crossterm::event::KeyModifiers;

// Check for modifier combinations
if key.modifiers.contains(KeyModifiers::SHIFT) { /* running */ }
if key.modifiers.contains(KeyModifiers::CONTROL) { /* ctrl commands */ }
if key.modifiers == KeyModifiers::NONE { /* no modifiers */ }
```

### Terminal Setup/Teardown

```rust
use std::io;
use crossterm::{
    execute,
    terminal::{enable_raw_mode, disable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::Terminal;
use ratatui::backend::CrosstermBackend;

fn setup_terminal() -> io::Result<Terminal<CrosstermBackend<io::Stdout>>> {
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen)?;
    let backend = CrosstermBackend::new(stdout);
    Terminal::new(backend)
}

fn restore_terminal(mut terminal: Terminal<CrosstermBackend<io::Stdout>>) -> io::Result<()> {
    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
    terminal.show_cursor()?;
    Ok(())
}
```

---

## 6. Project Structure

Final file layout of the completed Marauder's Map project:

```
marauders-map/
├── Cargo.toml
├── Cargo.lock
├── README.md
├── maps/
│   ├── hogwarts.json          # Default map
│   └── sample_custom.json     # Example custom map
├── src/
│   ├── main.rs                # Entry point, terminal setup, game loop
│   ├── game.rs                # GameState, tick logic, core game loop
│   ├── map.rs                 # Map, Floor, Tile, Room data structures
│   ├── map_loader.rs          # JSON map loading and validation
│   ├── player.rs              # Player state, movement, detection
│   ├── npc.rs                 # NPC types, AI states, schedule system
│   ├── pathfinding/
│   │   ├── mod.rs             # Pathfinder trait, shared types
│   │   ├── bfs.rs             # Breadth-first search
│   │   ├── dijkstra.rs        # Dijkstra's algorithm
│   │   └── astar.rs           # A* with Manhattan heuristic
│   ├── items.rs               # Item enum, Inventory, ActiveEffect
│   ├── missions.rs            # Mission, Objective, MissionStatus
│   ├── save.rs                # SaveData, save/load, high scores
│   ├── time.rs                # Game clock, curfew, schedules
│   ├── ui/
│   │   ├── mod.rs             # Top-level render function
│   │   ├── map_view.rs        # Map grid rendering, tile colors
│   │   ├── hud.rs             # Detection meter, status bar, messages
│   │   ├── inventory_ui.rs    # Inventory overlay
│   │   ├── mission_ui.rs      # Mission panel
│   │   ├── debug_view.rs      # Pathfinding visualization
│   │   └── atmosphere.rs      # Time-of-day colors, flavor text
│   └── input.rs               # Key event handling, input mapping
└── tests/
    ├── pathfinding_tests.rs   # Algorithm correctness tests
    ├── map_loader_tests.rs    # JSON parsing tests
    ├── game_logic_tests.rs    # Movement, detection, items
    └── save_tests.rs          # Serialization round-trip tests
```

### Module Dependency Graph

```
main.rs
  └── game.rs
        ├── map.rs ← map_loader.rs
        ├── player.rs
        ├── npc.rs ← pathfinding/{bfs, dijkstra, astar}
        ├── items.rs
        ├── missions.rs
        ├── save.rs
        ├── time.rs
        └── ui/{map_view, hud, inventory_ui, mission_ui, debug_view, atmosphere}
              └── input.rs
```

---

## 7. Cargo.toml

Final dependencies with pinned versions:

```toml
[package]
name = "marauders-map"
version = "1.0.0"
edition = "2024"
description = "A terminal-based Hogwarts explorer with pathfinding"
license = "MIT"

[dependencies]
# Terminal UI framework
ratatui = "0.30.0"

# Terminal backend (raw mode, key events, alternate screen)
crossterm = "0.29.0"

# Serialization (map loading, save/load)
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# Random NPC behavior
rand = "0.9"

# Platform-specific data directories (save file location)
dirs = "6.0"

[dev-dependencies]
# For testing
assert_cmd = "2.0"
tempfile = "3.15"
```

### What Each Dependency Does

| Crate | Version | Purpose | Used in |
|-------|---------|---------|---------|
| `ratatui` | 0.30.0 | TUI framework — widgets, layout, rendering | `ui/` modules |
| `crossterm` | 0.29.0 | Terminal backend — raw mode, key events, colors | `main.rs`, `input.rs` |
| `serde` | 1.0 | Serialization framework — `#[derive(Serialize, Deserialize)]` | All data structs |
| `serde_json` | 1.0 | JSON parsing and generation | `map_loader.rs`, `save.rs` |
| `rand` | 0.9 | Random number generation | `npc.rs` (Peeves, patrol variation) |
| `dirs` | 6.0 | Platform-specific directories (`~/.local/share/` etc.) | `save.rs` |

### Build and Run

```bash
# Build
cargo build --release

# Run with default map
cargo run --release

# Run with custom map
cargo run --release -- maps/my_castle.json

# Run tests
cargo test

# Check for warnings
cargo clippy
```

---

*"The Map never lies."*

*— Remus Lupin, probably*
