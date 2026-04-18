# Act 4 — NPCs Come Alive

> *"I solemnly swear that I am up to no good." The ink spreads across the parchment, and for the first time, the dots begin to move. Tiny labeled footprints pace the corridors — Argus Filch stalks the third floor, Mrs. Norris scouts two corridors ahead, and somewhere in the dungeons, Severus Snape glides between his office and the Potions classroom. The map is alive.*

**What you've built so far**: A full Hogwarts map with rendering, viewport scrolling, multiple floors, JSON loading, player movement with collision detection, doors, stairs — and three pathfinding algorithms (BFS, Dijkstra, A*) with debug visualization. Your castle exists, but it's empty. Time to populate it.

**What you'll build in Act 4**: Autonomous NPCs with distinct personalities — Filch who hunts you through corridors, Mrs. Norris who scouts ahead and reports back, Snape who follows a rigid schedule, ghosts who float through walls, and Peeves who causes chaos. You'll wire up the pathfinding algorithms from Act 3 to drive real behavior, build a state machine for AI, implement line-of-sight detection, and create a tension system that makes sneaking through Hogwarts feel genuinely nerve-wracking.

**The Rust lessons**: Enum-based state machines, trait objects vs enum dispatch for polymorphic behavior, the borrow checker's opinion on mutating a collection while reading from shared state, and interior mutability patterns when you need them.

---

## Stage 23 — The NPC Struct

*Difficulty: Easy — Estimated time: 30 minutes*

Every dot on the Marauder's Map is a person. Before we can make them move, we need to define what an NPC *is*. This stage introduces the core data structures and gets NPCs rendering on the map alongside the player.

### 23.1 — NPC types and AI states

Think about the NPCs from the books. Filch patrols corridors looking for rule-breakers. Snape moves between his office and classroom on a schedule. Peeves bounces around causing mayhem. Ghosts drift through walls. These aren't just different sprites — they have fundamentally different *behaviors*. In Rust, that's an enum:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NpcKind {
    Filch,
    MrsNorris,
    Snape,
    Peeves,
    Ghost { name: &'static str },
    Student,
    Dumbledore,
}
```

Each NPC also has a *state* — what they're currently doing. This is the core of our AI system, and it follows a simple state machine:

```
Idle → Patrol → Alert → Chase → Return → Patrol
```

```rust
#[derive(Debug, Clone, PartialEq)]
pub enum AiState {
    Idle,
    Patrol { waypoint_index: usize },
    Alert {
        last_known_pos: (usize, usize),
        investigate_ticks: u32,
    },
    Chase { target_pos: (usize, usize) },
    Return { waypoint_index: usize },
}
```

Notice that each variant carries its own data. `Patrol` tracks which waypoint the NPC is heading toward. `Alert` remembers where the disturbance was and how long to investigate. `Chase` tracks the player's last known position. This is one of Rust's superpowers — enums that carry state eliminate entire categories of bugs. In C or Python, you'd have a `state` string plus a handful of nullable fields that only matter for certain states. Here, the compiler guarantees you can't accidentally read `waypoint_index` when the NPC is chasing.

### 23.2 — The Npc struct

Now the struct itself:

```rust
pub struct Npc {
    pub kind: NpcKind,
    pub name: String,
    pub pos: (usize, usize),
    pub floor: u8,
    pub state: AiState,
    pub patrol_route: Vec<(usize, usize)>,
    pub speed: f32,          // tiles per tick (0.5 = moves every other tick)
    pub move_accumulator: f32,
    pub detection_range: u32, // how far they can "see"
    pub symbol: char,
    pub color: Color,
}
```

A few design decisions worth explaining:

**`speed` and `move_accumulator`**: Not every NPC should move at the same rate. Dumbledore strolls. Filch in chase mode sprints. Rather than a boolean "can move this tick", we accumulate fractional movement. Each tick, we add `speed` to `move_accumulator`. When it reaches 1.0, the NPC moves and we subtract 1.0. This gives us smooth, configurable speeds without complex timer systems.

**`patrol_route`**: A list of waypoints. The NPC uses Dijkstra (from Act 3!) to navigate between consecutive waypoints, then loops back to the start. We'll implement this in Stage 24.

**`symbol` and `color`**: Each NPC type gets a distinct character and color so you can tell them apart at a glance on the map — just like the real Marauder's Map where each person's name appears next to their footprints.

### 23.3 — Creating NPCs with a factory function

```rust
use ratatui::style::Color;

impl Npc {
    pub fn new(kind: NpcKind, name: &str, pos: (usize, usize), floor: u8) -> Self {
        let (symbol, color, speed, detection_range) = match kind {
            NpcKind::Filch      => ('F', Color::Red,     0.8, 8),
            NpcKind::MrsNorris  => ('N', Color::Red,     1.0, 12),
            NpcKind::Snape      => ('S', Color::Magenta, 0.6, 6),
            NpcKind::Peeves     => ('P', Color::Yellow,  1.2, 0),
            NpcKind::Ghost { .. }=> ('G', Color::Cyan,   0.4, 0),
            NpcKind::Student    => ('·', Color::White,   0.5, 0),
            NpcKind::Dumbledore => ('D', Color::White,   0.3, 0),
        };

        Self {
            kind,
            name: name.to_string(),
            pos,
            floor,
            state: AiState::Idle,
            patrol_route: Vec::new(),
            speed,
            move_accumulator: 0.0,
            detection_range,
            symbol,
            color,
        }
    }
}
```

The `match` on `NpcKind` is exhaustive — the compiler forces you to handle every variant. If you add a new NPC type later, every `match` in your codebase will fail to compile until you handle it. This is dramatically safer than a Python dictionary lookup or a chain of `if/elif` statements.

### 23.4 — Rendering NPCs on the map

You already have a render function from Act 2 that draws the map grid and the player. NPCs slot in between — draw the map tiles first, then NPCs, then the player (so the player always appears on top).

In your render function, after drawing the map tiles and before drawing the player:

```rust
use ratatui::style::{Style, Stylize};

// Inside your render function, after drawing map tiles:
for npc in &game.npcs {
    if npc.floor != game.current_floor {
        continue;
    }

    // Convert world position to screen position (relative to viewport)
    let screen_x = npc.pos.0 as i32 - game.viewport.x as i32;
    let screen_y = npc.pos.1 as i32 - game.viewport.y as i32;

    // Skip if outside the visible viewport
    if screen_x < 0 || screen_y < 0 {
        continue;
    }
    let screen_x = map_area.x + screen_x as u16;
    let screen_y = map_area.y + screen_y as u16;

    if screen_x < map_area.right() && screen_y < map_area.bottom() {
        let style = Style::new().fg(npc.color).bold();
        frame.buffer_mut().set_string(screen_x, screen_y, &npc.symbol.to_string(), style);
    }
}
```

We use `frame.buffer_mut()` to get direct access to the underlying `Buffer`, then `set_string()` to place a single styled character. This is the same approach you used for the player in Act 2 — no widget needed for single-character entities.

### 23.5 — Adding NPCs to the game state

In your `Game` struct, add the NPC collection and populate it:

```rust
pub struct Game {
    // ... existing fields from Acts 1-3 ...
    pub npcs: Vec<Npc>,
}

impl Game {
    pub fn spawn_npcs(&mut self) {
        self.npcs = vec![
            Npc::new(NpcKind::Filch, "Argus Filch", (45, 12), 0),
            Npc::new(NpcKind::MrsNorris, "Mrs. Norris", (47, 12), 0),
            Npc::new(NpcKind::Snape, "Severus Snape", (20, 30), 0), // dungeons
            Npc::new(NpcKind::Peeves, "Peeves", (30, 8), 2),
            Npc::new(
                NpcKind::Ghost { name: "Nearly Headless Nick" },
                "Nearly Headless Nick",
                (50, 15),
                6,
            ),
            Npc::new(NpcKind::Dumbledore, "Albus Dumbledore", (55, 5), 6),
        ];
    }
}
```

Call `game.spawn_npcs()` after loading the map. Adjust the positions to match your map layout — these coordinates should place each NPC in a sensible starting location (Filch near his office on the ground floor, Snape in the dungeons, etc.).

### 23.6 — The NPC status bar

The real Marauder's Map shows names next to footprints. Add an NPC status line at the bottom of your UI showing who's on the current floor:

```rust
// In your render function, in the status bar area:
let npc_names: Vec<String> = game
    .npcs
    .iter()
    .filter(|n| n.floor == game.current_floor)
    .map(|n| format!("{} ({})", n.name, n.symbol))
    .collect();

let npc_line = if npc_names.is_empty() {
    "No one nearby".to_string()
} else {
    format!("NPCs: {}", npc_names.join(", "))
};

let status = Paragraph::new(npc_line).style(Style::new().fg(Color::DarkGray));
frame.render_widget(status, status_area);
```

### 23.7 — Checkpoint

Build and run. You should see colored letters scattered across your map — `F` for Filch in red, `S` for Snape in magenta, `P` for Peeves in yellow. They don't move yet, but they're *there*. The castle finally has inhabitants.

> **Common mistake**: If you're getting a borrow error when iterating `game.npcs` inside the render closure, remember that `terminal.draw(|frame| { ... })` borrows the terminal mutably, but your game state is separate. Pass `&game` into the render function rather than trying to access it through the closure.

**Your NPC module should now have**: `NpcKind` enum, `AiState` enum, `Npc` struct with `new()`, rendering code in your draw function, and a `spawn_npcs()` method. In the next stage, we make them walk.

---

## Stage 24 — Patrol Routes

*Difficulty: Medium — Estimated time: 45 minutes*

A stationary NPC is just furniture. In this stage, Filch starts pacing the corridors and Snape glides between his office and the Potions classroom. We'll wire up the Dijkstra implementation from Act 3 to drive NPC movement along predefined waypoint routes.

### 24.1 — Defining patrol routes

A patrol route is a list of waypoints — positions the NPC visits in order, then loops. Filch's route might be: his office → third floor corridor → second floor landing → back to his office. Snape's: his office → Potions classroom → Great Hall → back.

Add routes when spawning NPCs:

```rust
let mut filch = Npc::new(NpcKind::Filch, "Argus Filch", (45, 12), 0);
filch.patrol_route = vec![
    (45, 12), // Filch's office
    (45, 25), // end of corridor
    (30, 25), // junction
    (30, 12), // loop back
];
filch.state = AiState::Patrol { waypoint_index: 0 };
```

The NPC starts at waypoint 0 and walks toward waypoint 1. When it arrives, it advances to waypoint 2, and so on. After the last waypoint, it wraps back to 0 — an endless loop.

### 24.2 — Path caching

Recomputing Dijkstra every tick would be wasteful. Instead, compute the full path once when the NPC starts heading toward a new waypoint, then follow it step by step:

```rust
pub struct Npc {
    // ... existing fields ...
    pub current_path: Vec<(usize, usize)>,
    pub path_index: usize,
}
```

When the NPC needs a new path (state transitions, reaching a waypoint), call your Dijkstra function from Act 3:

```rust
impl Npc {
    pub fn compute_path_to(&mut self, target: (usize, usize), grid: &Grid) {
        if let Some(path) = dijkstra(grid, self.pos, target) {
            self.current_path = path;
            self.path_index = 0;
        }
        // If no path found, NPC stays put — maybe the route is blocked
    }
}
```

This reuses your `dijkstra()` function directly. The pathfinding you built in Act 3 wasn't just an exercise — it's the engine that drives every NPC in the game.

### 24.3 — The movement tick

Each game tick, every NPC accumulates movement and potentially takes a step. This is the core update loop:

```rust
impl Npc {
    /// Advance one tick. Returns true if the NPC actually moved.
    pub fn tick(&mut self, grid: &Grid) -> bool {
        self.move_accumulator += self.speed;
        if self.move_accumulator < 1.0 {
            return false;
        }
        self.move_accumulator -= 1.0;

        // Follow the cached path
        if self.path_index < self.current_path.len() {
            let next = self.current_path[self.path_index];

            // Collision check — don't walk into walls
            if grid.is_walkable(next.0, next.1) {
                self.pos = next;
                self.path_index += 1;
                return true;
            }
        }
        false
    }
}
```

**Why the accumulator pattern?** If Filch has `speed: 0.8`, he accumulates 0.8 per tick. After tick 1: 0.8 (no move). Tick 2: 1.6 → moves, remainder 0.6. Tick 3: 1.4 → moves, remainder 0.4. This creates a natural, slightly irregular rhythm — Filch moves most ticks but occasionally pauses, which feels more organic than a rigid "move every N ticks" timer.

### 24.4 — Advancing waypoints

When the NPC reaches its current waypoint, it needs to compute a path to the next one:

```rust
impl Npc {
    pub fn update_patrol(&mut self, grid: &Grid) {
        match &self.state {
            AiState::Patrol { waypoint_index } => {
                let target = self.patrol_route[*waypoint_index];

                // Have we reached the current waypoint?
                if self.pos == target {
                    let next_index = (waypoint_index + 1) % self.patrol_route.len();
                    self.state = AiState::Patrol {
                        waypoint_index: next_index,
                    };
                    let next_target = self.patrol_route[next_index];
                    self.compute_path_to(next_target, grid);
                }

                // If we have no path (first tick or path was cleared), compute one
                if self.current_path.is_empty() || self.path_index >= self.current_path.len() {
                    self.compute_path_to(target, grid);
                }
            }
            _ => {}
        }
    }
}
```

Notice the pattern: `match &self.state` borrows the state immutably to read `waypoint_index`, then we reassign `self.state` with the new index. This works because the borrow of `self.state` ends before the assignment. If you tried to do this with a mutable borrow inside the match arm, the borrow checker would complain.

### 24.5 — The game update loop

In your main game loop, after handling player input, update all NPCs:

```rust
// In your main loop, each tick:
fn update_npcs(npcs: &mut Vec<Npc>, grid: &Grid) {
    for npc in npcs.iter_mut() {
        npc.update_patrol(grid);
        npc.tick(grid);
    }
}
```

**Borrow checker lesson**: Why is this a free function taking `&mut Vec<Npc>` and `&Grid` instead of a method on `Game`? If `update_npcs` were `&mut self` on `Game`, you'd be mutably borrowing `self` (for the NPCs) while also needing to immutably borrow `self.grid`. Rust won't allow that — one mutable borrow locks the entire struct.

The fix: either extract the grid reference before the loop, or use a free function that borrows the pieces separately. This is a pattern you'll encounter constantly in game development with Rust:

```rust
// This WON'T compile:
// self.update_npcs(); // borrows all of self mutably
//                     // but needs self.grid immutably inside

// This WILL compile — borrow the pieces separately:
let grid = &self.grid;
for npc in &mut self.npcs {
    npc.update_patrol(grid);
    npc.tick(grid);
}
```

### 24.6 — Visualizing patrol routes in debug mode

Remember the debug visualization from Act 3? Extend it to show NPC patrol routes and current paths:

```rust
// In debug render mode, draw each NPC's cached path
if game.debug_mode {
    for npc in &game.npcs {
        if npc.floor != game.current_floor {
            continue;
        }
        for &(px, py) in &npc.current_path[npc.path_index..] {
            let sx = px as i32 - game.viewport.x as i32;
            let sy = py as i32 - game.viewport.y as i32;
            if sx >= 0 && sy >= 0 {
                let sx = map_area.x + sx as u16;
                let sy = map_area.y + sy as u16;
                if sx < map_area.right() && sy < map_area.bottom() {
                    let style = Style::new().fg(npc.color).dim();
                    frame.buffer_mut().set_string(sx, sy, "·", style);
                }
            }
        }
    }
}
```

This draws a dim trail of dots in each NPC's color showing where they're headed. Toggle debug mode and watch Filch's red dots trace his patrol route through the corridors. It's satisfying — and useful for tuning routes.

### 24.7 — Checkpoint

Build and run. Filch should now pace back and forth along his patrol route, his red `F` moving steadily through the corridors. Snape glides between waypoints in the dungeons. Students amble between classrooms. The castle is alive.

> **Try this**: Set Filch's speed to 1.5 and watch him zip around. Set Dumbledore's to 0.2 and watch him stroll. The accumulator system makes speed tuning trivial.

> **Common mistake**: If NPCs get stuck at waypoints, check that your waypoint coordinates are actually walkable tiles. A waypoint placed on a wall means Dijkstra returns no path, and the NPC idles forever. Add a debug log: `if path.is_none() { eprintln!("{} can't reach waypoint {:?}", self.name, target); }`.

---

## Stage 25 — The Schedule

*Difficulty: Medium — Estimated time: 45 minutes*

In the books, the Marauder's Map doesn't just show where people are — it shows them going about their lives. Snape walks to the Potions classroom at 8 AM. Students flood the Great Hall at noon. Filch only patrols after curfew. This stage adds a time system that drives NPC behavior on a schedule.

### 25.1 — The game clock

Our game already has a tick-based loop from Act 2. Now we layer an in-game clock on top. From the design spec: 1 real second = 1 in-game minute, with a 200ms tick rate. That means 5 ticks = 1 in-game minute.

```rust
pub struct GameClock {
    pub hour: u8,    // 0-23
    pub minute: u8,  // 0-59
    ticks_per_minute: u32,
    tick_count: u32,
}

impl GameClock {
    pub fn new(hour: u8, minute: u8) -> Self {
        Self {
            hour,
            minute,
            ticks_per_minute: 5, // at 200ms/tick, 5 ticks = 1 second = 1 game minute
            tick_count: 0,
        }
    }

    pub fn tick(&mut self) {
        self.tick_count += 1;
        if self.tick_count >= self.ticks_per_minute {
            self.tick_count = 0;
            self.minute += 1;
            if self.minute >= 60 {
                self.minute = 0;
                self.hour = (self.hour + 1) % 24;
            }
        }
    }

    pub fn is_curfew(&self) -> bool {
        self.hour >= 21 || self.hour < 6 // 9 PM to 6 AM
    }

    /// Returns total minutes since midnight for easy range comparisons
    pub fn total_minutes(&self) -> u32 {
        self.hour as u32 * 60 + self.minute as u32
    }
}
```

Add `pub clock: GameClock` to your `Game` struct. Initialize it to something atmospheric — `GameClock::new(22, 30)` starts the game at 10:30 PM, right in the danger zone after curfew.

### 25.2 — Schedule entries

A schedule is a list of time ranges paired with locations and behaviors. Here's the data structure:

```rust
pub struct ScheduleEntry {
    pub start_minutes: u32,  // minutes since midnight
    pub end_minutes: u32,
    pub destination: (usize, usize),
    pub floor: u8,
    pub activity: Activity,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Activity {
    Idle,           // stay in one place (sleeping, working)
    Patrol,         // follow patrol route
    Wander,         // random movement within an area
}
```

Now define Snape's schedule from the design spec:

```rust
impl Npc {
    pub fn snape_schedule() -> Vec<ScheduleEntry> {
        vec![
            ScheduleEntry {
                start_minutes: 8 * 60,   // 08:00
                end_minutes: 12 * 60,     // 12:00
                destination: (20, 25),    // Potions classroom
                floor: 0,
                activity: Activity::Idle,
            },
            ScheduleEntry {
                start_minutes: 12 * 60,
                end_minutes: 13 * 60,
                destination: (50, 10),    // Great Hall
                floor: 0,
                activity: Activity::Idle,
            },
            ScheduleEntry {
                start_minutes: 13 * 60,
                end_minutes: 17 * 60,
                destination: (20, 25),    // Potions classroom
                floor: 0,
                activity: Activity::Idle,
            },
            ScheduleEntry {
                start_minutes: 17 * 60,
                end_minutes: 20 * 60,
                destination: (15, 30),    // Snape's office
                floor: 0,
                activity: Activity::Idle,
            },
            ScheduleEntry {
                start_minutes: 20 * 60,
                end_minutes: 23 * 60,
                destination: (20, 30),    // Dungeon corridors
                floor: 0,
                activity: Activity::Patrol,
            },
            // 23:00-08:00 — sleeping in office (wraps past midnight)
            ScheduleEntry {
                start_minutes: 23 * 60,
                end_minutes: 24 * 60,     // to midnight
                destination: (15, 30),
                floor: 0,
                activity: Activity::Idle,
            },
            ScheduleEntry {
                start_minutes: 0,
                end_minutes: 8 * 60,      // midnight to 8 AM
                destination: (15, 30),
                floor: 0,
                activity: Activity::Idle,
            },
        ]
    }
}
```

Add `pub schedule: Vec<ScheduleEntry>` to the `Npc` struct.

### 25.3 — Evaluating the schedule

Each tick, check if the NPC's current schedule entry has changed:

```rust
impl Npc {
    pub fn current_schedule_entry(&self, clock: &GameClock) -> Option<&ScheduleEntry> {
        let now = clock.total_minutes();
        self.schedule.iter().find(|entry| {
            now >= entry.start_minutes && now < entry.end_minutes
        })
    }

    pub fn update_schedule(&mut self, clock: &GameClock, grid: &Grid) {
        // Don't override alert/chase states — schedule is lower priority
        match self.state {
            AiState::Alert { .. } | AiState::Chase { .. } => return,
            _ => {}
        }

        if let Some(entry) = self.current_schedule_entry(clock) {
            match entry.activity {
                Activity::Idle => {
                    if self.pos != entry.destination || self.floor != entry.floor {
                        // Need to travel to the scheduled location
                        if self.floor == entry.floor {
                            self.compute_path_to(entry.destination, grid);
                        }
                        // Floor transitions handled by stairs (existing Act 2 logic)
                    } else {
                        self.state = AiState::Idle;
                    }
                }
                Activity::Patrol => {
                    if !matches!(self.state, AiState::Patrol { .. }) {
                        self.state = AiState::Patrol { waypoint_index: 0 };
                        if !self.patrol_route.is_empty() {
                            self.compute_path_to(self.patrol_route[0], grid);
                        }
                    }
                }
                Activity::Wander => {
                    // We'll implement this with Peeves in Stage 29
                }
            }
        }
    }
}
```

The key insight: **schedule is lower priority than alert/chase**. If Filch spots you at 5:59 AM, he doesn't suddenly break off the chase at 6:00 because his schedule says "go to office." The alert/chase states override the schedule until the NPC loses the player and returns to patrol.

### 25.4 — Filch's schedule: the night stalker

Filch is simple but terrifying — he patrols all night and sleeps all day:

```rust
// Filch: patrol 8 PM - 6 AM, office otherwise
let filch_schedule = vec![
    ScheduleEntry {
        start_minutes: 20 * 60,
        end_minutes: 24 * 60,
        destination: (45, 12),
        floor: 0,
        activity: Activity::Patrol,
    },
    ScheduleEntry {
        start_minutes: 0,
        end_minutes: 6 * 60,
        destination: (45, 12),
        floor: 0,
        activity: Activity::Patrol,
    },
    ScheduleEntry {
        start_minutes: 6 * 60,
        end_minutes: 20 * 60,
        destination: (45, 12), // Filch's office
        floor: 0,
        activity: Activity::Idle,
    },
];
```

This means if you start the game at 10:30 PM, Filch is actively patrolling. Start at 2 PM and the corridors are safe — but Snape might still be prowling the dungeons between classes.

### 25.5 — Displaying the clock

Add the time to your status bar. Make it atmospheric:

```rust
let time_str = format!(
    "{}:{:02} {} {}",
    if game.clock.hour == 0 { 12 }
    else if game.clock.hour > 12 { game.clock.hour - 12 }
    else { game.clock.hour },
    game.clock.minute,
    if game.clock.hour >= 12 { "PM" } else { "AM" },
    if game.clock.is_curfew() { "- AFTER CURFEW" } else { "" }
);
```

When it's after curfew, the text should feel urgent. Use `Color::Red` for the curfew warning — the player needs to know the stakes are higher.

### 25.6 — Integrating into the game loop

Update your main tick:

```rust
// In your game loop, each tick:
game.clock.tick();

let grid = &game.grid;
let clock = &game.clock;
for npc in &mut game.npcs {
    npc.update_schedule(clock, grid);
    npc.update_patrol(grid);
    npc.tick(grid);
}
```

Again, note the borrow splitting — we take `&game.grid` and `&game.clock` as separate borrows before mutably iterating `game.npcs`. The borrow checker is happy because we're not mutating `grid` or `clock`.

### 25.7 — Checkpoint

Build and run. Start the game at different times and watch the NPCs behave differently. At 10 PM, Filch patrols and Snape is in his office. At noon, students head to the Great Hall and Snape walks to lunch. Fast-forward time (add a debug key to advance the clock by an hour) and watch the castle's daily rhythm unfold.

> **Exercise for the reader**: Add schedules for students. Have groups of 3-4 students move between classrooms on the hour. The corridors should feel busy during class changes and empty at night — just like real Hogwarts.

---

## Stage 26 — Detection

*Difficulty: Medium — Estimated time: 50 minutes*

The Marauder's Map shows everyone's position, but in the game, NPCs don't have the map — they have eyes. This stage implements line-of-sight detection and the tension-building detection meter. When Filch rounds a corner and his line of sight reaches you, the meter starts climbing. Hide behind a wall and it drops. This is the mechanic that makes the game feel like sneaking through Hogwarts at midnight.

### 26.1 — Bresenham's line algorithm

To check if an NPC can see the player, we need to trace a line between them and check if any wall blocks the view. This is a classic problem solved by Bresenham's line algorithm — the same algorithm used to draw lines on pixel displays since the 1960s.

The idea: step along the line from point A to point B, one cell at a time, and check each cell. If any cell is a wall, the line of sight is blocked.

```rust
/// Returns all grid positions along a line from (x0,y0) to (x1,y1).
/// Uses Bresenham's line algorithm.
pub fn line_of_sight_cells(
    x0: i32, y0: i32,
    x1: i32, y1: i32,
) -> Vec<(i32, i32)> {
    let mut cells = Vec::new();
    let dx = (x1 - x0).abs();
    let dy = -(y1 - y0).abs();
    let sx = if x0 < x1 { 1 } else { -1 };
    let sy = if y0 < y1 { 1 } else { -1 };
    let mut err = dx + dy;
    let mut x = x0;
    let mut y = y0;

    loop {
        cells.push((x, y));
        if x == x1 && y == y1 {
            break;
        }
        let e2 = 2 * err;
        if e2 >= dy {
            err += dy;
            x += sx;
        }
        if e2 <= dx {
            err += dx;
            y += sy;
        }
    }
    cells
}
```

**How it works**: Bresenham's algorithm avoids floating-point math entirely. It tracks an error term that accumulates as we step along the major axis. When the error exceeds a threshold, we step along the minor axis too. The result is a sequence of grid cells that approximates a straight line — exactly what we need for line-of-sight.

This is a pure function — no state, no side effects, easy to test. Write a unit test:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_line_horizontal() {
        let cells = line_of_sight_cells(0, 0, 4, 0);
        assert_eq!(cells, vec![(0,0), (1,0), (2,0), (3,0), (4,0)]);
    }

    #[test]
    fn test_line_diagonal() {
        let cells = line_of_sight_cells(0, 0, 3, 3);
        assert_eq!(cells.len(), 4); // (0,0), (1,1), (2,2), (3,3)
    }
}
```

### 26.2 — Can the NPC see the player?

Now combine Bresenham's line with wall checking:

```rust
pub fn has_line_of_sight(
    grid: &Grid,
    from: (usize, usize),
    to: (usize, usize),
    max_range: u32,
) -> bool {
    let dx = to.0 as i32 - from.0 as i32;
    let dy = to.1 as i32 - from.1 as i32;
    let distance_sq = (dx * dx + dy * dy) as u32;

    // Quick range check (squared to avoid sqrt)
    if distance_sq > max_range * max_range {
        return false;
    }

    let cells = line_of_sight_cells(
        from.0 as i32, from.1 as i32,
        to.0 as i32, to.1 as i32,
    );

    // Skip the first cell (NPC's own position) and check each cell
    for &(x, y) in &cells[1..] {
        if x < 0 || y < 0 {
            return false;
        }
        let (ux, uy) = (x as usize, y as usize);

        // If we've reached the target, line of sight is clear
        if ux == to.0 && uy == to.1 {
            return true;
        }

        // If this cell is a wall, line of sight is blocked
        if !grid.is_walkable(ux, uy) {
            return false;
        }
    }
    true
}
```

The squared distance check is a common optimization — computing `sqrt` is expensive, and we don't need the actual distance, just whether it's within range. If `distance_sq > range * range`, the target is too far away.

### 26.3 — The detection meter

The detection meter is the player's heartbeat. It sits at 0 when you're safe and climbs toward 100 when danger is near. From the design spec:

- Walking in corridors: +1 per move
- Running (Shift+direction): +3 per move
- Standing still: -2 per tick
- Near Filch/Snape with line of sight: +5 per tick
- Invisibility cloak: frozen at 0

```rust
pub struct DetectionMeter {
    pub value: f32,     // 0.0 to 100.0
    pub is_cloaked: bool,
}

impl DetectionMeter {
    pub fn new() -> Self {
        Self { value: 0.0, is_cloaked: false }
    }

    pub fn add(&mut self, amount: f32) {
        if self.is_cloaked {
            return;
        }
        self.value = (self.value + amount).clamp(0.0, 100.0);
    }

    pub fn decay(&mut self, amount: f32) {
        if self.is_cloaked {
            return;
        }
        self.value = (self.value - amount).max(0.0);
    }

    pub fn is_caught(&self) -> bool {
        self.value >= 100.0
    }

    /// Returns a 0.0-1.0 ratio for rendering the meter bar
    pub fn ratio(&self) -> f32 {
        self.value / 100.0
    }
}
```

### 26.4 — NPC detection checks

Each tick, dangerous NPCs check if they can see the player:

```rust
/// Check all NPCs for player detection. Returns detection increase this tick.
pub fn check_detection(
    npcs: &[Npc],
    player_pos: (usize, usize),
    player_floor: u8,
    grid: &Grid,
) -> f32 {
    let mut detection_increase = 0.0;

    for npc in npcs {
        if npc.floor != player_floor {
            continue;
        }

        let is_dangerous = matches!(
            npc.kind,
            NpcKind::Filch | NpcKind::MrsNorris | NpcKind::Snape
        );
        if !is_dangerous {
            continue;
        }

        if has_line_of_sight(grid, npc.pos, player_pos, npc.detection_range) {
            detection_increase += match npc.kind {
                NpcKind::Filch     => 5.0,
                NpcKind::MrsNorris => 3.0,  // she alerts Filch, not catches you directly
                NpcKind::Snape     => 5.0,
                _ => 0.0,
            };
        }
    }

    detection_increase
}
```

In your game loop:

```rust
// Each tick:
let detection_bump = check_detection(
    &game.npcs, game.player.pos, game.player.floor, &game.grid,
);

if detection_bump > 0.0 {
    game.detection.add(detection_bump);
} else {
    game.detection.decay(2.0); // calm down when no one's looking
}

if game.detection.is_caught() {
    // Stage 30 handles this — for now, just print a message
    eprintln!("CAUGHT! Detection meter hit 100!");
}
```

### 26.5 — Rendering the detection meter

This is where the tension becomes visual. Render a bar that changes color as danger increases:

```rust
use ratatui::widgets::Gauge;
use ratatui::style::Stylize;

fn render_detection_meter(frame: &mut Frame, area: Rect, meter: &DetectionMeter) {
    let color = if meter.value < 30.0 {
        Color::Green
    } else if meter.value < 70.0 {
        Color::Yellow
    } else {
        Color::Red
    };

    let label = if meter.is_cloaked {
        "Invisible".to_string()
    } else {
        format!("Detection: {:.0}%", meter.value)
    };

    let gauge = Gauge::default()
        .gauge_style(Style::new().fg(color).bg(Color::DarkGray))
        .ratio(meter.ratio() as f64)
        .label(label);

    frame.render_widget(gauge, area);
}
```

Place this in your UI layout — a single-line area near the status bar works well. When the bar is green, the player feels safe. When it turns yellow, they get nervous. When it's red and climbing, their palms sweat. This is game design through UI.

### 26.6 — Visualizing line of sight in debug mode

In debug mode, draw the line-of-sight rays from dangerous NPCs:

```rust
if game.debug_mode {
    for npc in &game.npcs {
        if npc.floor != game.current_floor || npc.detection_range == 0 {
            continue;
        }
        let cells = line_of_sight_cells(
            npc.pos.0 as i32, npc.pos.1 as i32,
            game.player.pos.0 as i32, game.player.pos.1 as i32,
        );
        for &(cx, cy) in &cells {
            // ... convert to screen coords and draw with dim NPC color ...
            // Use '·' for clear cells, '×' where the ray hits a wall
        }
    }
}
```

This lets you *see* what the NPCs see. Toggle debug mode and watch Filch's red line-of-sight ray sweep down corridors. When it hits a wall, it stops. When it reaches you — the detection meter spikes.

### 26.7 — Checkpoint

Build and run. Walk near Filch and watch the detection meter climb. Duck behind a wall and watch it decay. The game now has *tension* — you're not just walking through a map, you're sneaking through a castle where getting seen has consequences.

> **Common mistake**: If detection seems to spike instantly to 100, check your tick rate. At 200ms per tick with +5 per tick from Filch, it takes 20 ticks (4 seconds) to go from 0 to 100. If your tick rate is faster (say 50ms), detection climbs 4x faster. Tune the numbers to feel right.

> **Exercise**: Add a "heartbeat" effect — when detection is above 70, flash the meter bar between red and dark red every few frames. The visual pulse creates anxiety even before the player is caught.

---

## Stage 27 — Alert & Chase

*Difficulty: Hard — Estimated time: 60 minutes*

This is the stage where Filch becomes terrifying. Until now, NPCs patrol and detect — but they don't *react*. In this stage, when Filch spots you, he breaks from his patrol, switches to A* pathfinding, and hunts you through the corridors. Lose him around a corner and he investigates your last known position before eventually giving up and returning to patrol.

This is the full AI state machine in action: `Patrol → Alert → Chase → Return → Patrol`.

### 27.1 — State transitions

The state machine has clear rules:

| From | To | Trigger |
|------|----|---------|
| Patrol | Alert | Line of sight to player |
| Alert | Chase | Player still visible after investigation starts |
| Chase | Alert | Lost line of sight for 3+ seconds |
| Alert | Return | Investigated last known position, found nothing |
| Return | Patrol | Reached nearest patrol waypoint |

Implement the transition logic:

```rust
const ALERT_INVESTIGATE_TICKS: u32 = 30;  // ~6 seconds at 200ms/tick
const CHASE_LOSE_TICKS: u32 = 15;         // ~3 seconds before giving up chase

impl Npc {
    pub fn update_ai(
        &mut self,
        player_pos: (usize, usize),
        player_floor: u8,
        grid: &Grid,
    ) {
        let can_see_player = self.floor == player_floor
            && self.detection_range > 0
            && has_line_of_sight(grid, self.pos, player_pos, self.detection_range);

        match &self.state {
            AiState::Patrol { .. } => {
                if can_see_player {
                    self.state = AiState::Alert {
                        last_known_pos: player_pos,
                        investigate_ticks: ALERT_INVESTIGATE_TICKS,
                    };
                    self.compute_path_to(player_pos, grid);
                }
            }

            AiState::Alert { last_known_pos, investigate_ticks } => {
                if can_see_player {
                    // Escalate to chase — we have eyes on the target
                    self.state = AiState::Chase { target_pos: player_pos };
                    self.compute_path_to(player_pos, grid);
                } else if self.pos == *last_known_pos || *investigate_ticks == 0 {
                    // Reached the spot or timed out — nothing here, return to patrol
                    self.transition_to_return(grid);
                } else {
                    // Still investigating — count down
                    self.state = AiState::Alert {
                        last_known_pos: *last_known_pos,
                        investigate_ticks: investigate_ticks - 1,
                    };
                }
            }

            AiState::Chase { target_pos } => {
                if can_see_player {
                    // Update target to player's current position — A* recalculates
                    if player_pos != *target_pos {
                        self.state = AiState::Chase { target_pos: player_pos };
                        self.compute_path_to(player_pos, grid);
                    }
                } else {
                    // Lost sight — drop to alert at last known position
                    self.state = AiState::Alert {
                        last_known_pos: *target_pos,
                        investigate_ticks: ALERT_INVESTIGATE_TICKS,
                    };
                }
            }

            AiState::Return { waypoint_index } => {
                let target = self.patrol_route[*waypoint_index];
                if self.pos == target {
                    self.state = AiState::Patrol {
                        waypoint_index: *waypoint_index,
                    };
                }
                // Can still spot the player while returning
                if can_see_player {
                    self.state = AiState::Alert {
                        last_known_pos: player_pos,
                        investigate_ticks: ALERT_INVESTIGATE_TICKS,
                    };
                    self.compute_path_to(player_pos, grid);
                }
            }

            AiState::Idle => {
                // Even idle NPCs can spot you (Snape in his office doorway)
                if can_see_player {
                    self.state = AiState::Alert {
                        last_known_pos: player_pos,
                        investigate_ticks: ALERT_INVESTIGATE_TICKS,
                    };
                    self.compute_path_to(player_pos, grid);
                }
            }
        }
    }

    fn transition_to_return(&mut self, grid: &Grid) {
        if self.patrol_route.is_empty() {
            self.state = AiState::Idle;
            return;
        }

        // Find the nearest patrol waypoint to return to
        let nearest_idx = self
            .patrol_route
            .iter()
            .enumerate()
            .min_by_key(|(_, wp)| {
                let dx = wp.0 as i32 - self.pos.0 as i32;
                let dy = wp.1 as i32 - self.pos.1 as i32;
                (dx * dx + dy * dy) as u32
            })
            .map(|(i, _)| i)
            .unwrap_or(0);

        self.state = AiState::Return {
            waypoint_index: nearest_idx,
        };
        self.compute_path_to(self.patrol_route[nearest_idx], grid);
    }
}
```

### 27.2 — A* for chase mode

In Act 3, you implemented A* with Manhattan distance as the heuristic. Now it earns its keep. During `Chase`, the NPC uses A* instead of Dijkstra because it needs to reach a *specific moving target* as fast as possible — exactly what A* is optimized for.

The key difference from patrol: **the path is recomputed frequently**. During patrol, we compute once per waypoint. During chase, we recompute whenever the player moves to a new position. This is where A*'s efficiency matters — it explores far fewer nodes than Dijkstra for targeted searches.

Swap the pathfinding function based on state:

```rust
impl Npc {
    pub fn compute_path_to(&mut self, target: (usize, usize), grid: &Grid) {
        let path = match self.state {
            AiState::Chase { .. } => a_star(grid, self.pos, target),
            _ => dijkstra(grid, self.pos, target),
        };

        if let Some(p) = path {
            self.current_path = p;
            self.path_index = 0;
        }
    }
}
```

This is a satisfying design moment — the algorithm choice is driven by the NPC's emotional state. Patrolling Filch uses Dijkstra (efficient shortest path, no rush). Chasing Filch uses A* (heuristic-guided, beeline toward you). The player can *feel* the difference — patrol movement is steady and predictable, chase movement is direct and aggressive.

### 27.3 — Speed boost during chase

Filch should move faster when chasing. Modify the tick function:

```rust
impl Npc {
    pub fn effective_speed(&self) -> f32 {
        match self.state {
            AiState::Chase { .. } => self.speed * 1.5,
            AiState::Alert { .. } => self.speed * 1.2,
            _ => self.speed,
        }
    }

    pub fn tick(&mut self, grid: &Grid) -> bool {
        self.move_accumulator += self.effective_speed();
        // ... rest of tick logic unchanged ...
    }
}
```

At base speed 0.8, chasing Filch moves at 1.2 — faster than the player's default 1.0. You *cannot* outrun Filch in a straight corridor. You have to break line of sight, use shortcuts, or use items. This is intentional — the game should feel like the books, where Harry's survival depends on the map and the cloak, not raw speed.

### 27.4 — Visual feedback for NPC states

The player needs to know when an NPC is alerted. Change the NPC's rendered appearance based on state:

```rust
impl Npc {
    pub fn render_symbol(&self) -> &str {
        match self.state {
            AiState::Chase { .. } => "!",   // Exclamation mark — they're coming!
            AiState::Alert { .. } => "?",   // Question mark — they're suspicious
            _ => &self.symbol.to_string(),   // Normal symbol
        }
    }

    pub fn render_style(&self) -> Style {
        match self.state {
            AiState::Chase { .. } => Style::new().fg(self.color).bold().rapid_blink(),
            AiState::Alert { .. } => Style::new().fg(self.color).bold(),
            _ => Style::new().fg(self.color),
        }
    }
}
```

Wait — `rapid_blink()` might not work in all terminals. Let's be more portable. Instead, alternate the symbol every few frames:

```rust
pub fn render_symbol(&self, frame_count: usize) -> String {
    match self.state {
        AiState::Chase { .. } => {
            if frame_count % 4 < 2 { "!".to_string() } else { self.symbol.to_string() }
        }
        AiState::Alert { .. } => "?".to_string(),
        _ => self.symbol.to_string(),
    }
}
```

The flashing `!` / `F` creates urgency. The player sees it and *knows* — Filch is hunting them.

### 27.5 — Integrating the full AI update

Your game loop now calls the AI update before movement:

```rust
// Each tick:
let player_pos = game.player.pos;
let player_floor = game.player.floor;
let grid = &game.grid;

for npc in &mut game.npcs {
    npc.update_schedule(&game.clock, grid);
    npc.update_ai(player_pos, player_floor, grid);
    npc.update_patrol(grid);
    npc.tick(grid);
}
```

The order matters: schedule sets the baseline behavior, AI overrides it if the player is detected, patrol advances waypoints, and tick moves the NPC along its path.

### 27.6 — Checkpoint

Build and run. Deliberately get spotted by Filch and test the full state machine cycle. Verify that:
- He switches from `F` to `?` to flashing `!`
- He speeds up during chase
- He goes to your last known position when you break line of sight
- He eventually gives up and returns to patrol
- The detection meter spikes during the encounter

> **Common mistake**: If Filch seems to "teleport" during chase, you're probably recomputing the path every tick without checking if the target moved. Only recompute when `player_pos != target_pos` — otherwise the NPC follows the existing cached path.

> **Debugging tip**: In debug mode, render the NPC's current state as text next to their symbol: `F[Chase]` or `S[Patrol:2]`. This makes state machine bugs immediately visible.

---

## Stage 28 — Mrs. Norris

*Difficulty: Medium — Estimated time: 40 minutes*

> *"It was Mrs. Norris, the skeletal gray cat who was used by the caretaker, Argus Filch, as a sort of deputy in his endless battle against students."*

Mrs. Norris is Filch's force multiplier. She doesn't catch you herself — she scouts ahead with a wider detection range, and when she spots you, she runs back to Filch and leads him to your last known position. This creates a two-entity threat: you might dodge Filch, but Mrs. Norris is faster, quieter, and sees further.

From the design spec: Mrs. Norris uses **BFS exploration** (she's scouting, not targeting) and has a detection range of 12 (vs Filch's 8). When she spots the player, she alerts Filch to the player's last known position.

### 28.1 — The alert relay

Mrs. Norris needs a way to communicate with Filch. In a language with shared mutable state, you'd just set a flag on Filch's object. In Rust, we can't mutate Filch while iterating over the NPC list. Instead, we collect alerts and apply them after the loop:

```rust
pub struct NpcAlert {
    pub target_npc_name: String,
    pub player_last_seen: (usize, usize),
    pub player_floor: u8,
}

pub fn collect_alerts(
    npcs: &[Npc],
    player_pos: (usize, usize),
    player_floor: u8,
    grid: &Grid,
) -> Vec<NpcAlert> {
    let mut alerts = Vec::new();

    for npc in npcs {
        if npc.kind != NpcKind::MrsNorris {
            continue;
        }
        if npc.floor != player_floor {
            continue;
        }

        let can_see = has_line_of_sight(grid, npc.pos, player_pos, npc.detection_range);
        if can_see {
            alerts.push(NpcAlert {
                target_npc_name: "Argus Filch".to_string(),
                player_last_seen: player_pos,
                player_floor,
            });
        }
    }

    alerts
}

pub fn apply_alerts(npcs: &mut [Npc], alerts: &[NpcAlert], grid: &Grid) {
    for alert in alerts {
        for npc in npcs.iter_mut() {
            if npc.name == alert.target_npc_name {
                // Only alert if Filch isn't already chasing
                if !matches!(npc.state, AiState::Chase { .. }) {
                    npc.state = AiState::Alert {
                        last_known_pos: alert.player_last_seen,
                        investigate_ticks: ALERT_INVESTIGATE_TICKS,
                    };
                    npc.compute_path_to(alert.player_last_seen, grid);
                }
            }
        }
    }
}
```

**The Rust pattern here**: collect-then-apply. We iterate immutably to gather information, then iterate mutably to apply changes. This two-pass approach satisfies the borrow checker and is actually cleaner than the mutable-everything approach — the alert system is explicit and debuggable.

### 28.2 — Mrs. Norris's scouting behavior

Mrs. Norris doesn't follow Filch's patrol route. She scouts — exploring corridors using BFS to cover the most ground. When she's not alerted, she picks a random unexplored direction and wanders.

```rust
use rand::Rng;

impl Npc {
    pub fn update_scout(&mut self, grid: &Grid) {
        if self.kind != NpcKind::MrsNorris {
            return;
        }

        // Only scout during patrol state
        if !matches!(self.state, AiState::Patrol { .. }) {
            return;
        }

        // If we've reached the end of our current path, pick a new direction
        if self.path_index >= self.current_path.len() {
            let target = self.pick_scout_target(grid);
            if let Some(t) = target {
                // Use BFS — Mrs. Norris explores, she doesn't optimize
                if let Some(path) = bfs_path(grid, self.pos, t) {
                    self.current_path = path;
                    self.path_index = 0;
                }
            }
        }
    }

    fn pick_scout_target(&self, grid: &Grid) -> Option<(usize, usize)> {
        let mut rng = rand::rng();

        // Pick a random walkable tile within 15 steps
        // Try a few times to find a valid target
        for _ in 0..10 {
            let dx = rng.random_range(-15i32..=15);
            let dy = rng.random_range(-15i32..=15);
            let tx = (self.pos.0 as i32 + dx).max(0) as usize;
            let ty = (self.pos.1 as i32 + dy).max(0) as usize;

            if grid.is_walkable(tx, ty) {
                return Some((tx, ty));
            }
        }
        None
    }
}
```

**Why BFS for Mrs. Norris?** From the design spec, Mrs. Norris uses BFS exploration — she's covering ground, not optimizing a route. BFS explores outward in all directions equally, which models a cat sniffing around corridors. Dijkstra would find the shortest path (too efficient for a wandering cat), and A* would beeline to a target (she doesn't have one until she spots you).

This is the educational payoff — each algorithm maps to a *personality*. BFS = curious explorer. Dijkstra = efficient traveler. A* = determined pursuer.

### 28.3 — The alert animation

When Mrs. Norris spots the player, show a brief visual cue before she runs to Filch:

```rust
// In your render function, when Mrs. Norris is in Alert state:
// Draw a faint line from Mrs. Norris toward Filch's position
// to show the "alert relay" happening
if npc.kind == NpcKind::MrsNorris && matches!(npc.state, AiState::Alert { .. }) {
    // Find Filch's position
    if let Some(filch) = game.npcs.iter().find(|n| n.kind == NpcKind::Filch) {
        if filch.floor == npc.floor {
            // Draw a dim dotted line from Mrs. Norris to Filch
            let cells = line_of_sight_cells(
                npc.pos.0 as i32, npc.pos.1 as i32,
                filch.pos.0 as i32, filch.pos.1 as i32,
            );
            for (i, &(cx, cy)) in cells.iter().enumerate() {
                if i % 3 != 0 { continue; } // dotted, not solid
                // ... convert to screen coords and draw '·' in dim red ...
            }
        }
    }
}
```

This dotted line between Mrs. Norris and Filch tells the player "she's reporting your position." It's a moment of dread — you see the relay happening and know Filch is about to change course toward you.

### 28.4 — Mrs. Norris returns to scouting

After alerting Filch, Mrs. Norris doesn't chase — she goes back to scouting. Her alert state is brief:

```rust
// In Mrs. Norris's AI update:
if self.kind == NpcKind::MrsNorris {
    match &self.state {
        AiState::Alert { investigate_ticks, .. } => {
            if *investigate_ticks == 0 {
                // Don't investigate — just go back to scouting
                self.state = AiState::Patrol { waypoint_index: 0 };
            }
        }
        AiState::Chase { .. } => {
            // Mrs. Norris never chases — downgrade to patrol immediately
            self.state = AiState::Patrol { waypoint_index: 0 };
        }
        _ => {}
    }
}
```

### 28.5 — Integrating into the game loop

```rust
// Each tick:
let alerts = collect_alerts(&game.npcs, player_pos, player_floor, &game.grid);
apply_alerts(&mut game.npcs, &alerts, &game.grid);

for npc in &mut game.npcs {
    npc.update_schedule(&game.clock, &game.grid);
    npc.update_ai(player_pos, player_floor, &game.grid);
    npc.update_scout(&game.grid);
    npc.update_patrol(&game.grid);
    npc.tick(&game.grid);
}
```

### 28.6 — Checkpoint

Build and run. Position yourself where Mrs. Norris can see you but Filch can't. Watch her spot you (her symbol changes to `?`), then watch Filch suddenly change direction and head toward your position — even though *he* never saw you. The relay system works.

> **The tactical implication**: Mrs. Norris has a detection range of 12 vs Filch's 8. She can see you from further away. The smart play is to watch for Mrs. Norris *first* — if you see the `N` symbol nearby, Filch isn't far behind. Avoid the cat and you avoid the caretaker.

> **Exercise**: Add a cooldown to Mrs. Norris's alerts — she can only alert Filch once every 30 ticks. This prevents the player from being permanently tracked and gives them a window to escape after being spotted.

---

## Stage 29 — Ghosts & Peeves

*Difficulty: Easy — Estimated time: 30 minutes*

Not every NPC is a threat. Ghosts drift through the castle as atmospheric flavor — Nearly Headless Nick floats through walls on his nightly rounds, the Bloody Baron haunts the dungeons. Peeves is a different beast entirely: a poltergeist who moves chaotically, blocks corridors, and exists purely to make your life difficult without actually catching you.

This stage introduces the concept of **behavior polymorphism** — different NPC types that share the same struct but move in fundamentally different ways.

### 29.1 — Ghosts ignore walls

Ghosts are the simplest NPC to implement because they break the rules. They don't use pathfinding at all — they move in a straight line toward their destination, passing through walls as if they weren't there.

```rust
impl Npc {
    pub fn update_ghost(&mut self) {
        if !matches!(self.kind, NpcKind::Ghost { .. }) {
            return;
        }

        // Ghosts don't need pathfinding — they move in a direct line
        if self.path_index >= self.current_path.len() {
            // Pick the next waypoint in the patrol route
            if let AiState::Patrol { waypoint_index } = &self.state {
                let target = self.patrol_route[*waypoint_index];
                // Direct line — no wall checking
                self.current_path = direct_line(self.pos, target);
                self.path_index = 0;

                let next = (*waypoint_index + 1) % self.patrol_route.len();
                self.state = AiState::Patrol { waypoint_index: next };
            }
        }
    }

    /// Move along the cached path WITHOUT collision checking.
    pub fn tick_ghost(&mut self) -> bool {
        self.move_accumulator += self.speed;
        if self.move_accumulator < 1.0 {
            return false;
        }
        self.move_accumulator -= 1.0;

        if self.path_index < self.current_path.len() {
            self.pos = self.current_path[self.path_index];
            self.path_index += 1;
            return true;
        }
        false
    }
}

/// Generate a direct line of positions from start to end (no wall checking).
fn direct_line(from: (usize, usize), to: (usize, usize)) -> Vec<(usize, usize)> {
    line_of_sight_cells(from.0 as i32, from.1 as i32, to.0 as i32, to.1 as i32)
        .into_iter()
        .map(|(x, y)| (x as usize, y as usize))
        .collect()
}
```

We reuse `line_of_sight_cells` from Stage 26 — the same Bresenham's algorithm that checks for walls now generates the ghost's path *through* walls. The ghost has a separate `tick_ghost()` that skips collision detection entirely.

### 29.2 — Ghost rendering

Ghosts should look ethereal. Render them with a dim, cyan style that suggests transparency:

```rust
// In your render function, special handling for ghosts:
let style = if matches!(npc.kind, NpcKind::Ghost { .. }) {
    Style::new().fg(Color::Cyan).dim()
} else {
    npc.render_style()
};
```

When a ghost passes through a wall, the player sees the `G` symbol appear on a wall tile for a moment, then continue on the other side. It's a small detail that sells the fantasy.

### 29.3 — Ghost patrol routes

Give each ghost a route that passes through walls — this is the whole point:

```rust
let mut nick = Npc::new(
    NpcKind::Ghost { name: "Nearly Headless Nick" },
    "Nearly Headless Nick",
    (50, 15),
    6, // 7th floor
);
nick.patrol_route = vec![
    (50, 15), // Gryffindor tower
    (30, 15), // through several walls to the staircase
    (30, 5),  // up through the ceiling (conceptually)
    (50, 15), // back to start
];
nick.state = AiState::Patrol { waypoint_index: 0 };
```

### 29.4 — Peeves: chaos incarnate

Peeves is the opposite of a ghost — he respects walls (he's a poltergeist, not a ghost) but moves unpredictably. His behavior:

1. Pick a random nearby corridor intersection
2. Move there
3. "Block" the corridor for a few ticks (the player can't pass through Peeves)
4. Get bored, pick a new random destination
5. Repeat

```rust
const PEEVES_BLOCK_TICKS: u32 = 20;
const PEEVES_WANDER_RADIUS: i32 = 20;

impl Npc {
    pub fn update_peeves(&mut self, grid: &Grid) {
        if self.kind != NpcKind::Peeves {
            return;
        }

        match &self.state {
            AiState::Idle => {
                // Blocking a corridor — count down
                // (We repurpose Idle for Peeves's blocking behavior)
                // After blocking, pick a new destination
                self.state = AiState::Patrol { waypoint_index: 0 };
                let target = self.pick_random_corridor(grid);
                if let Some(t) = target {
                    if let Some(path) = a_star(grid, self.pos, t) {
                        self.current_path = path;
                        self.path_index = 0;
                    }
                }
            }

            AiState::Patrol { .. } => {
                // Reached destination? Start blocking
                if self.path_index >= self.current_path.len() {
                    self.state = AiState::Idle;
                }
            }

            _ => {
                // Peeves doesn't chase or alert — reset to patrol
                self.state = AiState::Patrol { waypoint_index: 0 };
            }
        }
    }

    fn pick_random_corridor(&self, grid: &Grid) -> Option<(usize, usize)> {
        let mut rng = rand::rng();
        for _ in 0..20 {
            let dx = rng.random_range(-PEEVES_WANDER_RADIUS..=PEEVES_WANDER_RADIUS);
            let dy = rng.random_range(-PEEVES_WANDER_RADIUS..=PEEVES_WANDER_RADIUS);
            let tx = (self.pos.0 as i32 + dx).max(0) as usize;
            let ty = (self.pos.1 as i32 + dy).max(0) as usize;

            // Prefer corridor tiles (walkable with walls on at least 2 sides)
            if grid.is_walkable(tx, ty) && is_corridor(grid, tx, ty) {
                return Some((tx, ty));
            }
        }
        None
    }
}

fn is_corridor(grid: &Grid, x: usize, y: usize) -> bool {
    let neighbors = [(0i32, 1i32), (0, -1), (1, 0), (-1, 0)];
    let wall_count = neighbors
        .iter()
        .filter(|&&(dx, dy)| {
            let nx = x as i32 + dx;
            let ny = y as i32 + dy;
            nx < 0 || ny < 0 || !grid.is_walkable(nx as usize, ny as usize)
        })
        .count();
    wall_count >= 2 // at least 2 walls = corridor-like
}
```

### 29.5 — Peeves blocks the player

When Peeves is idle (blocking), the player can't walk through him. Add a collision check in your player movement:

```rust
fn is_blocked_by_npc(npcs: &[Npc], pos: (usize, usize), floor: u8) -> bool {
    npcs.iter().any(|npc| {
        npc.kind == NpcKind::Peeves
            && npc.floor == floor
            && npc.pos == pos
            && matches!(npc.state, AiState::Idle)
    })
}

// In player movement:
let new_pos = (player.pos.0 + dx, player.pos.1 + dy);
if grid.is_walkable(new_pos.0, new_pos.1)
    && !is_blocked_by_npc(&game.npcs, new_pos, game.player.floor)
{
    game.player.pos = new_pos;
}
```

Peeves doesn't catch you — he just forces you to find another route. This is annoying in exactly the right way. If Filch is chasing you and Peeves is blocking the corridor ahead, you're in real trouble.

### 29.6 — Peeves's personality in rendering

Peeves should look chaotic. Alternate his symbol randomly:

```rust
pub fn peeves_symbol(frame_count: usize) -> &'static str {
    match frame_count % 6 {
        0 => "P",
        1 => "p",
        2 => "!",
        3 => "~",
        4 => "P",
        _ => "*",
    }
}
```

This jittering symbol makes Peeves feel restless and unpredictable — even when he's standing still blocking a corridor, his character twitches.

### 29.7 — Dispatching behavior by NPC type

You now have four different movement patterns: patrol (Filch/Snape), scout (Mrs. Norris), ghost (Nearly Headless Nick), and chaos (Peeves). Rather than a chain of `if` statements, use a match in your update loop:

```rust
for npc in &mut game.npcs {
    npc.update_schedule(&game.clock, &game.grid);

    match npc.kind {
        NpcKind::Ghost { .. } => {
            npc.update_ghost();
            npc.tick_ghost();
        }
        NpcKind::Peeves => {
            npc.update_peeves(&game.grid);
            npc.tick(&game.grid);
        }
        NpcKind::MrsNorris => {
            npc.update_ai(player_pos, player_floor, &game.grid);
            npc.update_scout(&game.grid);
            npc.tick(&game.grid);
        }
        _ => {
            npc.update_ai(player_pos, player_floor, &game.grid);
            npc.update_patrol(&game.grid);
            npc.tick(&game.grid);
        }
    }
}
```

**Design note**: You could also model this with a trait — `trait NpcBehavior { fn update(&mut self, ...); fn tick(&mut self, ...); }` — and store `Box<dyn NpcBehavior>` in each NPC. That's the trait object approach. For this game, the enum match is simpler and avoids heap allocation. Use trait objects when you need open-ended extensibility (plugins, user-defined NPC types). Use enums when the set of variants is known at compile time. Both are valid Rust patterns — pick the one that fits.

### 29.8 — Checkpoint

Build and run. You should see:
- Ghosts drifting through walls in cyan, following their routes regardless of obstacles
- Peeves bouncing between corridors in yellow, occasionally blocking your path
- Filch and Snape patrolling with full AI (alert, chase, return)
- Mrs. Norris scouting ahead and alerting Filch

The castle now has a full ecosystem of characters, each with distinct behavior driven by the pathfinding algorithms you built in Act 3.

---

## Stage 30 — Getting Caught

*Difficulty: Medium — Estimated time: 40 minutes*

The detection meter has been climbing. Filch is three tiles away. Mrs. Norris spotted you two corridors back. The meter hits 100 and — what happens? This stage closes the loop: getting caught triggers an animation sequence, deducts house points, and respawns the player at their common room. It transforms the detection meter from a number into a consequence.

### 30.1 — The caught state

Add a game state enum to handle the transition:

```rust
#[derive(Debug, Clone, PartialEq)]
pub enum GamePhase {
    Playing,
    Caught {
        by_whom: String,
        animation_ticks: u32,
    },
    Respawning {
        countdown: u32,
    },
}
```

When detection hits 100, transition to `Caught`:

```rust
// In your game loop, after updating detection:
if game.detection.is_caught() && game.phase == GamePhase::Playing {
    // Find which NPC caught the player (closest dangerous NPC with line of sight)
    let catcher = game
        .npcs
        .iter()
        .filter(|n| {
            n.floor == game.player.floor
                && matches!(n.kind, NpcKind::Filch | NpcKind::Snape)
                && has_line_of_sight(
                    &game.grid,
                    n.pos,
                    game.player.pos,
                    n.detection_range,
                )
        })
        .min_by_key(|n| {
            let dx = n.pos.0 as i32 - game.player.pos.0 as i32;
            let dy = n.pos.1 as i32 - game.player.pos.1 as i32;
            (dx * dx + dy * dy) as u32
        });

    let name = catcher
        .map(|n| n.name.clone())
        .unwrap_or_else(|| "a prefect".to_string());

    game.phase = GamePhase::Caught {
        by_whom: name,
        animation_ticks: 30, // ~6 seconds
    };
}
```

### 30.2 — The caught animation

When caught, freeze the game and show a dramatic overlay. This is where ratatui's layered rendering shines — draw the map normally, then draw a semi-transparent overlay on top:

```rust
use ratatui::widgets::{Block, Paragraph, Wrap};
use ratatui::layout::{Alignment, Constraint, Layout, Flex};

fn render_caught_overlay(
    frame: &mut Frame,
    area: Rect,
    by_whom: &str,
    ticks_remaining: u32,
) {
    // Dim the entire map area
    let dim_style = Style::new().fg(Color::DarkGray).bg(Color::Black);
    frame.buffer_mut().set_style(area, dim_style);

    // Center a "CAUGHT" message
    let popup_width = 40u16.min(area.width.saturating_sub(4));
    let popup_height = 7u16.min(area.height.saturating_sub(4));

    let [popup_area] = Layout::horizontal([Constraint::Length(popup_width)])
        .flex(Flex::Center)
        .areas(area);
    let [popup_area] = Layout::vertical([Constraint::Length(popup_height)])
        .flex(Flex::Center)
        .areas(popup_area);

    let caught_text = format!(
        "\n\"CAUGHT!\"\n\n{} has found you!\n-75 house points",
        by_whom
    );

    let block = Block::bordered()
        .title(" Detention! ")
        .title_alignment(Alignment::Center)
        .style(Style::new().fg(Color::Red).bg(Color::Black));

    let paragraph = Paragraph::new(caught_text)
        .block(block)
        .alignment(Alignment::Center)
        .wrap(Wrap { trim: true });

    frame.render_widget(paragraph, popup_area);

    // Flashing effect — alternate border color
    if ticks_remaining % 6 < 3 {
        frame.buffer_mut().set_style(
            popup_area,
            Style::new().fg(Color::Red).bg(Color::Black),
        );
    }
}
```

Key API usage: `Buffer::set_style(area, style)` applies a style to an entire rectangular region — we use it to dim the background map. Then we render a `Paragraph` inside a `Block::bordered()` on top. `Layout::horizontal/vertical` with `Flex::Center` centers the popup.

### 30.3 — The caught game loop

During the `Caught` phase, ignore player input and count down the animation:

```rust
// In your main loop:
match &mut game.phase {
    GamePhase::Playing => {
        // Normal game loop — handle input, update NPCs, check detection
        // ... everything from previous stages ...
    }

    GamePhase::Caught { by_whom, animation_ticks } => {
        // Freeze gameplay, show animation
        if *animation_ticks > 0 {
            *animation_ticks -= 1;
        } else {
            // Animation done — deduct points and start respawn
            game.score -= 75;
            game.phase = GamePhase::Respawning { countdown: 15 };
        }

        // Still render the map (frozen) with the overlay
        terminal.draw(|frame| {
            render_map(frame, &game); // normal map render
            if let GamePhase::Caught { by_whom, animation_ticks } = &game.phase {
                render_caught_overlay(frame, frame.area(), by_whom, *animation_ticks);
            }
        })?;
    }

    GamePhase::Respawning { countdown } => {
        if *countdown > 0 {
            *countdown -= 1;
        } else {
            // Respawn at common room
            game.player.pos = game.common_room_pos; // e.g., (55, 10) for Gryffindor
            game.player.floor = 6;                   // 7th floor
            game.detection = DetectionMeter::new();   // reset meter

            // Reset all NPCs to patrol
            for npc in &mut game.npcs {
                if matches!(npc.state, AiState::Chase { .. } | AiState::Alert { .. }) {
                    npc.state = AiState::Patrol { waypoint_index: 0 };
                }
            }

            game.phase = GamePhase::Playing;
        }
    }
}
```

### 30.4 — Flavor text by catcher

Different NPCs should have different caught messages — it's a Harry Potter game, personality matters:

```rust
fn caught_message(npc_name: &str) -> &str {
    match npc_name {
        "Argus Filch" => {
            "\"Students out of bed! Students in the corridors!\n\
             Filch's eyes gleam with malicious delight."
        }
        "Severus Snape" => {
            "\"Well, well, well... what do we have here?\"\n\
             Snape's voice is barely above a whisper."
        }
        _ => "You've been caught out of bed after hours!",
    }
}
```

### 30.5 — The score display

Add a persistent score to the status bar. The score should feel like it matters:

```rust
let score_style = if game.score < 0 {
    Style::new().fg(Color::Red)
} else {
    Style::new().fg(Color::Yellow)
};

let score_text = format!("House Points: {}", game.score);
let score_widget = Paragraph::new(score_text).style(score_style);
frame.render_widget(score_widget, score_area);
```

Negative house points in red — the shame of losing points for Gryffindor is its own punishment.

### 30.6 — Near-miss scoring

From the design spec: avoiding Filch at close range earns +25 points. Implement this as a "close call" bonus:

```rust
pub fn check_close_calls(
    npcs: &[Npc],
    player_pos: (usize, usize),
    player_floor: u8,
    close_call_cooldown: &mut u32,
) -> i32 {
    if *close_call_cooldown > 0 {
        *close_call_cooldown -= 1;
        return 0;
    }

    for npc in npcs {
        if npc.floor != player_floor {
            continue;
        }
        if !matches!(npc.kind, NpcKind::Filch | NpcKind::Snape) {
            continue;
        }

        let dx = npc.pos.0 as i32 - player_pos.0 as i32;
        let dy = npc.pos.1 as i32 - player_pos.1 as i32;
        let dist_sq = (dx * dx + dy * dy) as u32;

        // Within 3 tiles but NPC is in Return state (just lost you)
        if dist_sq <= 9 && matches!(npc.state, AiState::Return { .. }) {
            *close_call_cooldown = 50; // prevent spam
            return 25;
        }
    }
    0
}
```

When the player earns a close call bonus, flash a brief message: `"+25 — Close call!"` in green. These moments — barely escaping Filch, ducking behind a tapestry as he rounds the corner — are what make the game memorable.

### 30.7 — The full game loop, assembled

All the systems from Act 4 now run in sequence each tick. The order matters:

```rust
fn game_tick(game: &mut Game) {
    game.clock.tick();

    let player_pos = game.player.pos;
    let player_floor = game.player.floor;

    // 1. Mrs. Norris alerts (immutable borrow → mutable apply)
    let alerts = collect_alerts(&game.npcs, player_pos, player_floor, &game.grid);
    apply_alerts(&mut game.npcs, &alerts, &game.grid);

    // 2. Update each NPC (schedule → AI → movement, dispatched by kind)
    let grid = &game.grid;
    let clock = &game.clock;
    for npc in &mut game.npcs {
        npc.update_schedule(clock, grid);
        match npc.kind {
            NpcKind::Ghost { .. } => { npc.update_ghost(); npc.tick_ghost(); }
            NpcKind::Peeves      => { npc.update_peeves(grid); npc.tick(grid); }
            NpcKind::MrsNorris   => {
                npc.update_ai(player_pos, player_floor, grid);
                npc.update_scout(grid); npc.tick(grid);
            }
            _ => {
                npc.update_ai(player_pos, player_floor, grid);
                npc.update_patrol(grid); npc.tick(grid);
            }
        }
    }

    // 3. Detection → close calls → caught check
    let bump = check_detection(&game.npcs, player_pos, player_floor, grid);
    if bump > 0.0 { game.detection.add(bump); } else { game.detection.decay(2.0); }
    game.score += check_close_calls(&game.npcs, player_pos, player_floor, &mut game.close_call_cooldown);
}
```

Alerts before NPC updates, detection after movement, caught check last. Each system feeds the next.

### 30.8 — Checkpoint

Build and run. Walk into Filch's line of sight and let the detection meter climb to 100. You should see:

1. The map freezes
2. A red-bordered "CAUGHT" popup appears with flavor text
3. House points deducted (-75)
4. After the animation, you respawn at the common room
5. All NPCs reset to patrol — the slate is clean

Then try the opposite: sneak past Filch at close range, break his line of sight, and earn the +25 close call bonus. The game now has stakes, consequences, and rewards.

---

## Act 4 — Summary

You've built a living castle. Here's what each stage added:

| Stage | What | Rust Concept | Algorithm |
|-------|------|-------------|-----------|
| 23 | NPC struct & rendering | Enums with data, exhaustive matching | — |
| 24 | Patrol routes | Borrow splitting, accumulator pattern | Dijkstra |
| 25 | Time-based schedules | State priority, `matches!` macro | — |
| 26 | Line-of-sight detection | Pure functions, squared distance | Bresenham's line |
| 27 | Alert & chase AI | State machines, enum transitions | A* |
| 28 | Mrs. Norris relay | Collect-then-apply pattern | BFS |
| 29 | Ghosts & Peeves | Enum dispatch vs trait objects | Direct line, random walk |
| 30 | Getting caught | Game phases, overlay rendering | — |

**The pathfinding payoff**: Every algorithm from Act 3 now drives real behavior. BFS powers Mrs. Norris's exploration. Dijkstra routes NPCs between waypoints. A* drives Filch's chase. Bresenham's line handles detection. The algorithms aren't abstract exercises — they're the nervous system of a living world.

**The Rust payoff**: The borrow checker forced you into clean patterns — borrow splitting, collect-then-apply, enum state machines. These aren't workarounds; they're better designs. The state machine can't have invalid states. The alert system is explicit and debuggable. The NPC update loop can't accidentally corrupt shared state.

> *"Mischief managed." The dots on the map continue their endless dance — Filch patrolling, Mrs. Norris scouting, Snape gliding through the dungeons, ghosts drifting through walls. The castle never sleeps. And somewhere in the corridors, a single `@` symbol creeps toward the restricted section of the library, watching the detection meter and praying it stays green.*

**Next up — Act 5: The Secrets** — Secret passages, the invisibility cloak, dungbombs, and the missions that tie everything together.
