# Act 5: Secrets & Polish — *'The Map Never Lies'*

> *"I solemnly swear that I am up to no good."*
>
> The Map is alive. NPCs patrol, pathfinding hums beneath the surface, and Filch is always one corridor behind. But a true Marauder knows that Hogwarts has more secrets than any map can show — hidden passages behind tapestries, items stashed in unlikely places, and missions that test your nerve after curfew.
>
> In this final act, we add the layers that transform a tech demo into a *game*: secret passages, an inventory system, missions with objectives, persistent save/load, atmospheric polish, and a custom map format so others can build their own Hogwarts.

---

## Stage 31: Secret Passages — *'Tap the Right Brick'*

**Difficulty:** Medium · **New concepts:** Enum variants with data, conditional tile mutation, discovery state

### The Idea

In the books, Hogwarts is riddled with secret passages — the one-eyed witch passage to Honeydukes, the tunnel behind the mirror on the fourth floor, the passage from the Room of Requirement. Our map already has a `SecretPassage` tile variant. Now we make it *work*.

The key insight: a secret passage looks like a `Wall` until the player walks into it. Then it reveals itself, and stays revealed forever (persisted in save data — we'll wire that up in Stage 34).

### Design

```
Player walks into wall at (x, y)
  → Check: is this position a SecretPassage { discovered: false, ... }?
    → Yes: set discovered = true, teleport player to destination
    → No: normal wall collision, nothing happens
```

The player doesn't know which walls are secret. They have to *explore* — bump into walls and see what happens. Just like Harry with the Room of Requirement.

### Step 1: Ensure the Tile Enum Supports It

You should already have this from the map data structure (Act 1). Verify it looks like:

```rust
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum Tile {
    Wall,
    Floor,
    Door { locked: bool, room_id: Option<u32> },
    Stairs {
        destination_floor: u8,
        destination_pos: (usize, usize),
    },
    SecretPassage {
        discovered: bool,
        destination_floor: u8,
        destination_pos: (usize, usize),
    },
}
```

### Step 2: Handle Discovery in the Movement System

In your player movement handler, you currently reject moves into `Wall` tiles. Now add a check *before* that rejection:

```rust
fn try_move_player(game: &mut GameState, dx: i32, dy: i32) -> MoveResult {
    let new_x = (game.player.x as i32 + dx) as usize;
    let new_y = (game.player.y as i32 + dy) as usize;

    let tile = &mut game.map.floors[game.current_floor].grid[new_y][new_x];

    match tile {
        Tile::SecretPassage {
            discovered,
            destination_floor,
            destination_pos,
        } => {
            let dest_floor = *destination_floor;
            let dest_pos = *destination_pos;

            if !*discovered {
                *discovered = true;
                game.discovery_log.push(format!(
                    "Secret passage found at floor {}, ({}, {})!",
                    game.current_floor, new_x, new_y
                ));
                game.score += 50; // +50 for discovery
            }

            // Teleport
            game.player.x = dest_pos.0;
            game.player.y = dest_pos.1;
            game.current_floor = dest_floor as usize;
            MoveResult::Teleported
        }
        Tile::Wall => MoveResult::Blocked,
        Tile::Floor | Tile::Door { locked: false, .. } => {
            game.player.x = new_x;
            game.player.y = new_y;
            MoveResult::Moved
        }
        // ... handle other tiles
        _ => MoveResult::Blocked,
    }
}
```

**Rust concept spotlight — mutable pattern matching:** Notice `&mut game.map...` and `*discovered = true`. We're pattern-matching on a mutable reference to the tile, which lets us modify the `discovered` field in place. This is one of Rust's superpowers — you can destructure *and* mutate in a single match arm.

### Step 3: Render Discovered Passages Differently

In your rendering code, discovered passages should look different from walls:

```rust
fn tile_to_char(tile: &Tile) -> &str {
    match tile {
        Tile::Wall => "█",
        Tile::Floor => " ",
        Tile::Door { locked: true, .. } => "▒",
        Tile::Door { locked: false, .. } => "░",
        Tile::Stairs { .. } => "≡",
        Tile::SecretPassage { discovered: true, .. } => "◊",
        Tile::SecretPassage { discovered: false, .. } => "█", // Looks like a wall!
        // Undiscovered passages are indistinguishable from walls
    }
}
```

### Step 4: Place Secret Passages in Your Map Data

Add a few passages to your map JSON. Here are canonical ones from the books:

```json
{
  "floor": 2,
  "x": 15, "y": 8,
  "tile": {
    "SecretPassage": {
      "discovered": false,
      "destination_floor": 0,
      "destination_pos": [42, 3]
    }
  },
  "description": "One-eyed witch passage to Honeydukes cellar"
}
```

### Step 5: Discovery Log UI

Add a small panel that shows recent discoveries. Use a `List` widget:

```rust
use ratatui::widgets::{Block, List, ListItem};
use ratatui::style::{Style, Stylize};

let discoveries: Vec<ListItem> = game
    .discovery_log
    .iter()
    .rev()
    .take(5)
    .map(|d| ListItem::new(d.as_str()))
    .collect();

let discovery_list = List::new(discoveries)
    .block(Block::bordered().title("Discoveries"))
    .style(Style::new().yellow());

frame.render_widget(discovery_list, discovery_area);
```

### Your Turn

1. Add at least 5 secret passages across different floors
2. Add a discovery counter to the HUD: `"Passages: 3/7 discovered"`
3. Play a terminal bell (`print!("\x07")`) when a passage is discovered
4. **Challenge:** Add a "passage hint" system — when the player is within 3 tiles of an undiscovered passage, show a subtle `~` shimmer on nearby walls

### Checkpoint

After this stage, you should be able to:
- Walk into specific walls and get teleported
- See discovered passages rendered as `◊`
- See a discovery log updating in real-time
- Undiscovered passages remain invisible (rendered as walls)

---

## Stage 32: Items — *'The Weasley Twins' Legacy'*

**Difficulty:** Medium · **New concepts:** Enums with behavior, inventory management, game effect system

### The Idea

Fred and George didn't just make the Map — they left behind a whole arsenal. Items give the player tactical options: sneak past Filch with the Invisibility Cloak, distract Snape with a Dungbomb, or send Mrs. Norris chasing phantom footsteps with a Decoy Detonator.

Each item modifies existing game state in a specific way. No new systems needed — just clever use of what we've already built.

### Step 1: Define the Item Types

```rust
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum Item {
    InvisibilityCloak,
    MaraudersMapReveal,
    Dungbomb,
    DecoyDetonator,
    PeruvianDarknessPowder,
}

impl Item {
    pub fn name(&self) -> &str {
        match self {
            Item::InvisibilityCloak => "Invisibility Cloak",
            Item::MaraudersMapReveal => "Marauder's Map (reveal)",
            Item::Dungbomb => "Dungbomb",
            Item::DecoyDetonator => "Decoy Detonator",
            Item::PeruvianDarknessPowder => "Peruvian Darkness Powder",
        }
    }

    pub fn description(&self) -> &str {
        match self {
            Item::InvisibilityCloak => "Detection frozen at 0 for 60 ticks",
            Item::MaraudersMapReveal => "Reveals all NPCs on all floors for 120 ticks",
            Item::Dungbomb => "Distracts nearby NPCs to this location",
            Item::DecoyDetonator => "Creates fake footsteps at target location",
            Item::PeruvianDarknessPowder => "NPCs in radius can't detect you for 30 ticks",
        }
    }
}
```

### Step 2: Inventory System

Keep it simple — a `Vec<Item>` with a max capacity:

```rust
pub struct Inventory {
    pub items: Vec<Item>,
    pub max_capacity: usize,
}

impl Inventory {
    pub fn new() -> Self {
        Self {
            items: Vec::new(),
            max_capacity: 8,
        }
    }

    pub fn add(&mut self, item: Item) -> bool {
        if self.items.len() < self.max_capacity {
            self.items.push(item);
            true
        } else {
            false // Inventory full!
        }
    }

    pub fn use_item(&mut self, index: usize) -> Option<Item> {
        if index < self.items.len() {
            Some(self.items.remove(index))
        } else {
            None
        }
    }
}
```

### Step 3: Active Effects

Items don't just disappear — they create *timed effects*. Track these in your game state:

```rust
#[derive(Clone, Debug)]
pub struct ActiveEffect {
    pub kind: EffectKind,
    pub ticks_remaining: u32,
}

#[derive(Clone, Debug, PartialEq)]
pub enum EffectKind {
    Invisible,          // Detection frozen at 0
    MapReveal,          // All NPCs visible on all floors
    DarknessCloud {     // NPCs in radius blinded
        x: usize,
        y: usize,
        floor: usize,
        radius: usize,
    },
}
```

In your game loop's tick function, decrement and remove expired effects:

```rust
fn tick_effects(game: &mut GameState) {
    game.active_effects.retain_mut(|effect| {
        effect.ticks_remaining = effect.ticks_remaining.saturating_sub(1);
        effect.ticks_remaining > 0
    });
}
```

### Step 4: Apply Item Effects

When the player uses an item, create the corresponding effect:

```rust
fn apply_item(game: &mut GameState, item: Item) {
    match item {
        Item::InvisibilityCloak => {
            game.active_effects.push(ActiveEffect {
                kind: EffectKind::Invisible,
                ticks_remaining: 60,
            });
        }
        Item::MaraudersMapReveal => {
            game.active_effects.push(ActiveEffect {
                kind: EffectKind::MapReveal,
                ticks_remaining: 120,
            });
        }
        Item::Dungbomb => {
            // Alert all NPCs within 10 tiles to investigate player's position
            let (px, py) = (game.player.x, game.player.y);
            for npc in &mut game.npcs {
                let dist = manhattan_distance(npc.x, npc.y, px, py);
                if dist <= 10 && npc.floor == game.current_floor {
                    npc.state = NpcState::Alert {
                        target_x: px,
                        target_y: py,
                    };
                }
            }
        }
        Item::DecoyDetonator => {
            // Create fake footsteps 15 tiles ahead in player's facing direction
            let (dx, dy) = game.player.facing.as_delta();
            let decoy_x = (game.player.x as i32 + dx * 15).max(0) as usize;
            let decoy_y = (game.player.y as i32 + dy * 15).max(0) as usize;
            for npc in &mut game.npcs {
                if npc.floor == game.current_floor {
                    npc.state = NpcState::Alert {
                        target_x: decoy_x,
                        target_y: decoy_y,
                    };
                }
            }
        }
        Item::PeruvianDarknessPowder => {
            game.active_effects.push(ActiveEffect {
                kind: EffectKind::DarknessCloud {
                    x: game.player.x,
                    y: game.player.y,
                    floor: game.current_floor,
                    radius: 5,
                },
                ticks_remaining: 30,
            });
        }
    }
}
```

### Step 5: Wire Effects into Existing Systems

The beauty of this design: effects modify *existing* behavior, not new systems.

**Detection system** — check for Invisible effect:

```rust
fn calculate_detection(game: &GameState) -> i32 {
    if game.active_effects.iter().any(|e| e.kind == EffectKind::Invisible) {
        return 0; // Cloak active — undetectable
    }
    // ... normal detection calculation
}
```

**NPC vision** — check for DarknessCloud:

```rust
fn npc_can_see_player(game: &GameState, npc: &Npc) -> bool {
    // Check if NPC is inside a darkness cloud
    for effect in &game.active_effects {
        if let EffectKind::DarknessCloud { x, y, floor, radius } = &effect.kind {
            if npc.floor == *floor
                && manhattan_distance(npc.x, npc.y, *x, *y) <= *radius
            {
                return false; // Blinded!
            }
        }
    }
    // ... normal line-of-sight check
}
```

### Step 6: Inventory UI

Press `[i]` to toggle the inventory overlay. Render it as a `List` with selection:

```rust
use ratatui::widgets::{Block, List, ListItem, ListState};
use ratatui::style::{Style, Stylize};

let items: Vec<ListItem> = game
    .inventory
    .items
    .iter()
    .enumerate()
    .map(|(i, item)| {
        let content = format!("{}. {} — {}", i + 1, item.name(), item.description());
        ListItem::new(content)
    })
    .collect();

let inventory_list = List::new(items)
    .block(Block::bordered().title("Inventory [Enter to use, Esc to close]"))
    .highlight_style(Style::new().reversed())
    .highlight_symbol(">> ");

frame.render_stateful_widget(inventory_list, popup_area, &mut game.inventory_state);
```

### Step 7: Item Pickups on the Map

Place items as special floor tiles or entities. When the player walks over one:

```rust
// In your movement handler, after moving:
if let Some(pickup) = game.item_spawns.remove(&(game.current_floor, new_x, new_y)) {
    if game.inventory.add(pickup.clone()) {
        game.messages.push(format!("Picked up: {}", pickup.name()));
    } else {
        game.messages.push("Inventory full!".to_string());
        game.item_spawns.insert((game.current_floor, new_x, new_y), pickup);
    }
}
```

### Your Turn

1. Place items in thematic locations (Cloak in Room of Requirement, Dungbombs in corridors)
2. Add number keys `[1]`-`[8]` as quick-use shortcuts for inventory slots
3. Add a visual indicator when an effect is active (e.g., `[INVISIBLE 45t]` in the HUD)
4. **Challenge:** Make the Dungbomb leave a visible smoke cloud (`░`) on the map for its duration

### Checkpoint

After this stage:
- Player can pick up items from the map
- `[i]` opens inventory, Enter uses selected item
- Invisibility Cloak freezes detection at 0
- Dungbombs and Decoy Detonators redirect NPC pathfinding
- Active effects tick down and expire
- HUD shows active effect timers

---

## Stage 33: Missions — *'Mischief Managed'*

**Difficulty:** Medium · **New concepts:** State machines for objectives, trigger zones, completion tracking

### The Idea

Free roam is fun, but *missions* give purpose. Each mission is a simple objective: get from A to B without being caught, find a specific room, or discover a passage. They're position-based triggers — no complex quest scripting needed.

### Step 1: Mission Data Model

```rust
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Mission {
    pub id: u32,
    pub name: String,
    pub description: String,
    pub status: MissionStatus,
    pub objectives: Vec<Objective>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum MissionStatus {
    Locked,     // Not yet available
    Available,  // Can be started
    Active,     // In progress
    Completed,  // Done!
    Failed,     // Caught during mission
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Objective {
    pub description: String,
    pub condition: ObjectiveCondition,
    pub completed: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum ObjectiveCondition {
    ReachPosition {
        floor: usize,
        x: usize,
        y: usize,
        radius: usize, // How close counts as "reached"
    },
    EnterRoom {
        room_id: u32,
    },
    DiscoverPassage {
        floor: usize,
        x: usize,
        y: usize,
    },
    ReturnToStart {
        floor: usize,
        x: usize,
        y: usize,
        radius: usize,
    },
    AvoidDetection, // Don't let detection hit 100 during mission
}
```

### Step 2: Define the Missions

```rust
fn create_missions() -> Vec<Mission> {
    vec![
        Mission {
            id: 1,
            name: "The Midnight Snack".to_string(),
            description: "Sneak from Gryffindor Tower to the kitchen and back.".to_string(),
            status: MissionStatus::Available,
            objectives: vec![
                Objective {
                    description: "Reach the kitchen in the dungeons".to_string(),
                    condition: ObjectiveCondition::EnterRoom { room_id: 101 },
                    completed: false,
                },
                Objective {
                    description: "Return to Gryffindor common room".to_string(),
                    condition: ObjectiveCondition::EnterRoom { room_id: 701 },
                    completed: false,
                },
                Objective {
                    description: "Don't get caught!".to_string(),
                    condition: ObjectiveCondition::AvoidDetection,
                    completed: false,
                },
            ],
        },
        Mission {
            id: 2,
            name: "The Restricted Section".to_string(),
            description: "Reach the restricted section of the library after hours.".to_string(),
            status: MissionStatus::Locked,
            objectives: vec![
                Objective {
                    description: "Enter the restricted section".to_string(),
                    condition: ObjectiveCondition::EnterRoom { room_id: 402 },
                    completed: false,
                },
            ],
        },
        Mission {
            id: 3,
            name: "Fluffy's Secret".to_string(),
            description: "Reach the forbidden corridor on the third floor.".to_string(),
            status: MissionStatus::Locked,
            objectives: vec![
                Objective {
                    description: "Reach the forbidden corridor".to_string(),
                    condition: ObjectiveCondition::ReachPosition {
                        floor: 3, x: 25, y: 10, radius: 2,
                    },
                    completed: false,
                },
            ],
        },
        Mission {
            id: 4,
            name: "The Room of Requirement".to_string(),
            description: "Find and enter the Room of Requirement.".to_string(),
            status: MissionStatus::Locked,
            objectives: vec![
                Objective {
                    description: "Discover the entrance".to_string(),
                    condition: ObjectiveCondition::DiscoverPassage {
                        floor: 7, x: 30, y: 5,
                    },
                    completed: false,
                },
            ],
        },
        Mission {
            id: 5,
            name: "The Full Map".to_string(),
            description: "Discover every secret passage in Hogwarts.".to_string(),
            status: MissionStatus::Locked,
            // This one is special — objectives generated from passage count
            objectives: vec![],
        },
    ]
}
```

### Step 3: Mission Tick — Check Objectives Each Frame

```rust
fn tick_missions(game: &mut GameState) {
    for mission in &mut game.missions {
        if mission.status != MissionStatus::Active {
            continue;
        }

        let mut all_complete = true;

        for objective in &mut mission.objectives {
            if objective.completed {
                continue;
            }

            let met = match &objective.condition {
                ObjectiveCondition::ReachPosition { floor, x, y, radius } => {
                    game.current_floor == *floor
                        && manhattan_distance(game.player.x, game.player.y, *x, *y)
                            <= *radius
                }
                ObjectiveCondition::EnterRoom { room_id } => {
                    game.player_in_room(*room_id)
                }
                ObjectiveCondition::DiscoverPassage { floor, x, y } => {
                    game.is_passage_discovered(*floor, *x, *y)
                }
                ObjectiveCondition::ReturnToStart { floor, x, y, radius } => {
                    game.current_floor == *floor
                        && manhattan_distance(game.player.x, game.player.y, *x, *y)
                            <= *radius
                }
                ObjectiveCondition::AvoidDetection => {
                    game.detection < 100 // Stays true until you're caught
                }
            };

            if met {
                objective.completed = true;
                game.messages.push(format!("Objective complete: {}", objective.description));
            } else {
                all_complete = false;
            }
        }

        if all_complete {
            mission.status = MissionStatus::Completed;
            game.score += 100;
            game.messages.push(format!("Mission complete: {}! +100 points", mission.name));
            // Unlock next mission
            unlock_next_mission(game);
        }
    }
}

fn unlock_next_mission(game: &mut GameState) {
    if let Some(next) = game.missions.iter_mut().find(|m| m.status == MissionStatus::Locked) {
        next.status = MissionStatus::Available;
    }
}
```

### Step 4: Mission Selection UI

Press `[m]` to open the mission panel:

```rust
use ratatui::widgets::{Block, Paragraph, Tabs};
use ratatui::style::{Style, Stylize};
use ratatui::text::Line;

let mission_titles: Vec<Line> = game
    .missions
    .iter()
    .map(|m| {
        let status_icon = match m.status {
            MissionStatus::Completed => "[x]",
            MissionStatus::Active => "[>]",
            MissionStatus::Available => "[ ]",
            MissionStatus::Locked => "[?]",
            MissionStatus::Failed => "[!]",
        };
        Line::from(format!("{} {}", status_icon, m.name))
    })
    .collect();

let tabs = Tabs::new(mission_titles)
    .block(Block::bordered().title("Missions"))
    .highlight_style(Style::new().yellow().bold())
    .select(game.selected_mission);

frame.render_widget(tabs, mission_area);

// Show selected mission details below
if let Some(mission) = game.missions.get(game.selected_mission) {
    let details = format!(
        "{}\n\nObjectives:\n{}",
        mission.description,
        mission
            .objectives
            .iter()
            .map(|o| {
                let check = if o.completed { "x" } else { " " };
                format!("  [{}] {}", check, o.description)
            })
            .collect::<Vec<_>>()
            .join("\n")
    );
    let detail_para = Paragraph::new(details)
        .block(Block::bordered().title("Details"))
        .wrap(ratatui::widgets::Wrap { trim: true });
    frame.render_widget(detail_para, detail_area);
}
```

### Step 5: Handle Mission Failure

If the player gets caught during an active mission:

```rust
fn on_player_caught(game: &mut GameState) {
    game.score -= 75;
    game.detection = 0;

    // Fail active missions that require stealth
    for mission in &mut game.missions {
        if mission.status == MissionStatus::Active {
            let has_stealth_objective = mission.objectives.iter().any(|o| {
                matches!(o.condition, ObjectiveCondition::AvoidDetection)
            });
            if has_stealth_objective {
                mission.status = MissionStatus::Failed;
                game.messages.push(format!("Mission failed: {}", mission.name));
            }
        }
    }

    // Teleport back to common room
    game.player.x = COMMON_ROOM_X;
    game.player.y = COMMON_ROOM_Y;
    game.current_floor = COMMON_ROOM_FLOOR;
}
```

### Your Turn

1. Implement mission start — pressing Enter on an Available mission sets it to Active
2. Add a HUD indicator showing the current active mission and next objective
3. Allow retrying failed missions (reset objectives, set back to Available)
4. **Challenge:** Add a timer to "The Midnight Snack" — complete it within 300 ticks for a bonus

### Checkpoint

After this stage:
- `[m]` opens mission panel with status icons
- Missions unlock progressively
- Objectives auto-complete when conditions are met
- Getting caught fails stealth missions
- Score increases on mission completion

---

## Stage 34: Save & Load — *'Your Progress Persists!'*

**Difficulty:** Easy · **New concepts:** serde serialization, file I/O, JSON persistence

### The Idea

This is the reward stage. Everything you've built — discovered passages, inventory, score, mission progress — now persists between sessions. Close the game, come back tomorrow, and your Marauder's Map remembers.

Rust's `serde` ecosystem makes this almost trivially easy. If your structs derive `Serialize` and `Deserialize`, you're 90% done.

### Step 1: Define the Save Data

Don't save *everything* — just the player-specific state. The map layout, NPC definitions, and room data are loaded from the map file. Save only what changes:

```rust
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize)]
pub struct SaveData {
    pub player_x: usize,
    pub player_y: usize,
    pub current_floor: usize,
    pub score: i32,
    pub detection: i32,
    pub inventory: Vec<Item>,
    pub discovered_passages: Vec<(usize, usize, usize)>, // (floor, x, y)
    pub mission_states: Vec<MissionSaveState>,
    pub discovery_log: Vec<String>,
    pub rooms_visited: Vec<u32>,
    pub play_time_ticks: u64,
}

#[derive(Serialize, Deserialize)]
pub struct MissionSaveState {
    pub id: u32,
    pub status: MissionStatus,
    pub objectives_completed: Vec<bool>,
}
```

### Step 2: Save to JSON

```rust
use std::fs;
use std::path::PathBuf;

fn save_dir() -> PathBuf {
    let mut dir = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    dir.push("marauders-map");
    fs::create_dir_all(&dir).ok();
    dir
}

fn save_game(game: &GameState) -> Result<(), Box<dyn std::error::Error>> {
    let save = SaveData {
        player_x: game.player.x,
        player_y: game.player.y,
        current_floor: game.current_floor,
        score: game.score,
        detection: game.detection,
        inventory: game.inventory.items.clone(),
        discovered_passages: game.get_discovered_passages(),
        mission_states: game
            .missions
            .iter()
            .map(|m| MissionSaveState {
                id: m.id,
                status: m.status.clone(),
                objectives_completed: m.objectives.iter().map(|o| o.completed).collect(),
            })
            .collect(),
        discovery_log: game.discovery_log.clone(),
        rooms_visited: game.rooms_visited.clone(),
        play_time_ticks: game.play_time_ticks,
    };

    let json = serde_json::to_string_pretty(&save)?;
    let path = save_dir().join("save.json");
    fs::write(&path, json)?;

    Ok(())
}
```

### Step 3: Load from JSON

```rust
fn load_game(game: &mut GameState) -> Result<bool, Box<dyn std::error::Error>> {
    let path = save_dir().join("save.json");

    if !path.exists() {
        return Ok(false); // No save file — start fresh
    }

    let json = fs::read_to_string(&path)?;
    let save: SaveData = serde_json::from_str(&json)?;

    game.player.x = save.player_x;
    game.player.y = save.player_y;
    game.current_floor = save.current_floor;
    game.score = save.score;
    game.detection = save.detection;
    game.inventory.items = save.inventory;
    game.discovery_log = save.discovery_log;
    game.rooms_visited = save.rooms_visited;
    game.play_time_ticks = save.play_time_ticks;

    // Restore discovered passages on the map
    for (floor, x, y) in &save.discovered_passages {
        if let Some(tile) = game.map.get_tile_mut(*floor, *x, *y) {
            if let Tile::SecretPassage { discovered, .. } = tile {
                *discovered = true;
            }
        }
    }

    // Restore mission states
    for ms in &save.mission_states {
        if let Some(mission) = game.missions.iter_mut().find(|m| m.id == ms.id) {
            mission.status = ms.status.clone();
            for (i, completed) in ms.objectives_completed.iter().enumerate() {
                if let Some(obj) = mission.objectives.get_mut(i) {
                    obj.completed = *completed;
                }
            }
        }
    }

    Ok(true)
}
```

### Step 4: Auto-Save and Manual Save

```rust
// In your game loop:
fn game_loop(game: &mut GameState) {
    let mut ticks_since_save: u32 = 0;

    loop {
        // ... handle input, tick game ...

        ticks_since_save += 1;

        // Auto-save every 300 ticks (~1 minute at 200ms tick rate)
        if ticks_since_save >= 300 {
            if let Err(e) = save_game(game) {
                game.messages.push(format!("Auto-save failed: {}", e));
            }
            ticks_since_save = 0;
        }

        // Manual save on Ctrl+S
        if key_pressed(KeyCode::Char('s'), KeyModifiers::CONTROL) {
            match save_game(game) {
                Ok(()) => game.messages.push("Game saved!".to_string()),
                Err(e) => game.messages.push(format!("Save failed: {}", e)),
            }
        }
    }
}
```

### Step 5: High Scores

```rust
#[derive(Serialize, Deserialize, Default)]
pub struct HighScores {
    pub entries: Vec<HighScoreEntry>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct HighScoreEntry {
    pub name: String,
    pub score: i32,
    pub passages_found: usize,
    pub missions_completed: usize,
}

impl HighScores {
    pub fn load() -> Self {
        let path = save_dir().join("highscores.json");
        fs::read_to_string(&path)
            .ok()
            .and_then(|json| serde_json::from_str(&json).ok())
            .unwrap_or_default()
    }

    pub fn add(&mut self, entry: HighScoreEntry) {
        self.entries.push(entry);
        self.entries.sort_by(|a, b| b.score.cmp(&a.score));
        self.entries.truncate(10); // Keep top 10
        let json = serde_json::to_string_pretty(self).unwrap();
        let path = save_dir().join("highscores.json");
        fs::write(path, json).ok();
    }
}
```

### What the Save File Looks Like

```json
{
  "player_x": 15,
  "player_y": 22,
  "current_floor": 3,
  "score": 425,
  "detection": 12,
  "inventory": ["InvisibilityCloak", "Dungbomb"],
  "discovered_passages": [[2, 15, 8], [4, 30, 12], [7, 30, 5]],
  "mission_states": [
    { "id": 1, "status": "Completed", "objectives_completed": [true, true, true] },
    { "id": 2, "status": "Active", "objectives_completed": [false] }
  ],
  "discovery_log": [
    "Secret passage found at floor 2, (15, 8)!",
    "Secret passage found at floor 4, (30, 12)!"
  ],
  "rooms_visited": [101, 201, 301, 701],
  "play_time_ticks": 4520
}
```

Human-readable, editable, debuggable. That's the beauty of JSON.

### Your Turn

1. Add a "New Game" option that deletes the save file and starts fresh
2. Add save slot support (save1.json, save2.json, save3.json)
3. Show "Last saved: 2 minutes ago" in the HUD
4. **Challenge:** Add save file versioning — if the format changes, migrate old saves gracefully

### Checkpoint

After this stage:
- `Ctrl+S` saves the game
- Game auto-saves every ~1 minute
- On startup, the game loads the save file if it exists
- Discovered passages, inventory, score, and missions all persist
- High scores are tracked locally

---

## Stage 35: Sound & Polish — *'The Castle Breathes'*

**Difficulty:** Easy · **New concepts:** Terminal escape codes, atmospheric UI, timing-based events

### The Idea

A game isn't just mechanics — it's *atmosphere*. We can't play music in a terminal (well, not easily), but we can use terminal bells, timed messages, color shifts, and atmospheric text to make Hogwarts feel alive.

### Terminal Bell

The simplest "sound" in a terminal: the ASCII bell character `\x07`. Most terminals will beep or flash.

```rust
fn play_bell() {
    print!("\x07");
}
```

Use it sparingly for maximum impact:
- Player detected by Filch → bell
- Secret passage discovered → bell
- Mission complete → bell
- Caught! → double bell

```rust
fn on_detection_alert(game: &GameState) {
    if game.detection >= 80 {
        play_bell(); // Warning!
    }
}

fn on_caught() {
    play_bell();
    std::thread::sleep(std::time::Duration::from_millis(200));
    play_bell(); // Double bell = caught
}
```

### Curfew Warnings

The time system from Act 3 drives atmospheric messages:

```rust
fn curfew_message(game_hour: u8, game_minute: u8) -> Option<&'static str> {
    match (game_hour, game_minute) {
        (20, 45) => Some("Curfew in 15 minutes. Students should return to dormitories."),
        (20, 55) => Some("Curfew in 5 minutes!"),
        (21, 0) => Some("CURFEW. Filch begins his patrol..."),
        (23, 0) => Some("The castle grows quiet. Only ghosts walk these halls now."),
        (2, 0) => Some("The witching hour. Even Peeves is silent."),
        (5, 0) => Some("Dawn approaches. The portraits begin to stir."),
        _ => None,
    }
}
```

Render these as fading messages in a dedicated area:

```rust
use ratatui::widgets::{Block, Paragraph};
use ratatui::style::{Style, Color};

fn render_atmosphere(frame: &mut Frame, game: &GameState, area: ratatui::layout::Rect) {
    if let Some(msg) = &game.atmosphere_message {
        let fade = if msg.ticks_remaining > 20 {
            Color::White
        } else if msg.ticks_remaining > 10 {
            Color::Gray
        } else {
            Color::DarkGray
        };

        let para = Paragraph::new(msg.text.as_str())
            .style(Style::new().fg(fade).italic())
            .centered();
        frame.render_widget(para, area);
    }
}
```

### Color Shifts for Time of Day

Change the map's color palette based on in-game time:

```rust
fn time_palette(hour: u8) -> MapPalette {
    match hour {
        6..=8 => MapPalette {
            wall: Color::Rgb(80, 70, 60),    // Warm morning stone
            floor: Color::Rgb(50, 45, 40),
            text: Color::Rgb(200, 180, 140),
        },
        9..=17 => MapPalette {
            wall: Color::Rgb(100, 95, 85),   // Bright daylight
            floor: Color::Rgb(60, 55, 50),
            text: Color::White,
        },
        18..=20 => MapPalette {
            wall: Color::Rgb(70, 60, 55),    // Dusk
            floor: Color::Rgb(40, 35, 30),
            text: Color::Rgb(180, 160, 120),
        },
        _ => MapPalette {
            wall: Color::Rgb(30, 25, 35),    // Night — dark and moody
            floor: Color::Rgb(15, 12, 20),
            text: Color::Rgb(120, 110, 140),
        },
    }
}
```

### Footstep Flavor Text

Add subtle messages as the player moves through different areas:

```rust
fn area_flavor(room_name: &str) -> Option<&str> {
    match room_name {
        "Forbidden Corridor" => Some("A low growl echoes from behind the door..."),
        "Library" => Some("Dust motes dance in the candlelight."),
        "Dungeons Corridor" => Some("Water drips from the ceiling. It's cold down here."),
        "Great Hall" => Some("The enchanted ceiling shows a starry sky."),
        "Hospital Wing" => Some("The smell of healing potions fills the air."),
        _ => None,
    }
}
```

### Detection Meter Polish

Make the detection meter feel urgent as it rises:

```rust
use ratatui::widgets::Gauge;
use ratatui::style::{Style, Color};

fn render_detection_meter(frame: &mut Frame, detection: i32, area: ratatui::layout::Rect) {
    let ratio = (detection as f64 / 100.0).clamp(0.0, 1.0);

    let color = if detection < 30 {
        Color::Green
    } else if detection < 60 {
        Color::Yellow
    } else if detection < 80 {
        Color::Rgb(255, 165, 0) // Orange
    } else {
        Color::Red
    };

    let label = if detection >= 90 {
        "DANGER!"
    } else if detection >= 60 {
        "Suspicious..."
    } else if detection >= 30 {
        "Careful..."
    } else {
        "Hidden"
    };

    let gauge = Gauge::default()
        .block(Block::bordered().title("Detection"))
        .gauge_style(Style::new().fg(color))
        .ratio(ratio)
        .label(label);

    frame.render_widget(gauge, area);
}
```

### Status Bar Polish

A clean, informative status bar at the bottom:

```rust
use ratatui::widgets::Paragraph;
use ratatui::text::{Line, Span};
use ratatui::style::{Style, Stylize};

fn render_status_bar(frame: &mut Frame, game: &GameState, area: ratatui::layout::Rect) {
    let floor_name = &game.map.floors[game.current_floor].name;
    let time_str = format!("{:02}:{:02}", game.game_hour, game.game_minute);

    let status = Line::from(vec![
        Span::styled(format!(" Floor: {} ", floor_name), Style::new().bold()),
        Span::raw(" | "),
        Span::styled(format!("Time: {} ", time_str), Style::new().cyan()),
        Span::raw(" | "),
        Span::styled(format!("Score: {} ", game.score), Style::new().yellow()),
        Span::raw(" | "),
        Span::styled(
            format!("Passages: {}/{} ", game.passages_found(), game.total_passages()),
            Style::new().green(),
        ),
    ]);

    let bar = Paragraph::new(status).style(Style::new().on_dark_gray());
    frame.render_widget(bar, area);
}
```

### Your Turn

1. Add all the atmospheric messages for different times and locations
2. Make the bell configurable (some people hate terminal beeps) — add a `sound_enabled: bool` to config
3. Add a "caught" animation — flash the screen red briefly before resetting
4. **Challenge:** Add ghost trail effects — when a ghost passes through a tile, leave a faint `·` that fades over 5 ticks

### Checkpoint

After this stage:
- Terminal bell sounds on key events
- Curfew warnings appear at appropriate times
- Map colors shift with time of day
- Detection meter changes color as danger increases
- Atmospheric text appears when entering notable areas
- Status bar shows all key info at a glance

---

## Stage 36: Custom Maps — *'I Open at the Close'*

**Difficulty:** Medium · **New concepts:** JSON schema documentation, data-driven design, modding support

### The Idea

The ultimate gift to your players: let them create their own Hogwarts. By documenting the JSON map format thoroughly, anyone can design custom floors, place NPCs, hide secret passages, and create missions — without touching Rust code.

This is also a capstone lesson in *data-driven design*: the game engine is generic, the content is data.

### The Map Format

Your game loads maps from JSON. Here's the complete specification:

#### Top-Level Structure

```json
{
  "name": "Hogwarts School of Witchcraft and Wizardry",
  "author": "The Marauders",
  "version": "1.0.0",
  "tick_rate_ms": 200,
  "curfew_hour": 21,
  "starting_position": {
    "floor": 6,
    "x": 10,
    "y": 5
  },
  "floors": [ ... ],
  "npcs": [ ... ],
  "items": [ ... ],
  "missions": [ ... ]
}
```

#### Floor Definition

```json
{
  "id": 0,
  "name": "Dungeons",
  "width": 60,
  "height": 30,
  "grid": "see below",
  "rooms": [ ... ]
}
```

**Grid encoding** — two options:

**Option A: String grid** (human-readable, good for small maps)

```json
{
  "grid_format": "string",
  "grid": [
    "████████████████████████████",
    "█          █    ███████████",
    "█  KITCHEN █    █ POTIONS █",
    "█          ░    ░         █",
    "████████░███    ███████████",
    "█                         █",
    "█   CORRIDOR              █",
    "████████████████████████████"
  ],
  "legend": {
    "█": "Wall",
    " ": "Floor",
    "░": { "Door": { "locked": false, "room_id": null } },
    "▒": { "Door": { "locked": true, "room_id": null } },
    "≡": { "Stairs": { "destination_floor": 1, "destination_pos": [10, 5] } }
  }
}
```

**Option B: Tile array** (precise, good for generated maps)

```json
{
  "grid_format": "tiles",
  "grid": [
    [
      "Wall", "Wall", "Wall", "Wall",
      { "Door": { "locked": false, "room_id": 101 } },
      "Wall", "Floor", "Floor"
    ]
  ]
}
```

#### Room Definition

```json
{
  "id": 101,
  "name": "Kitchen",
  "description": "House-elves bustle about preparing feasts.",
  "floor": 0,
  "bounds": { "x": 1, "y": 1, "width": 10, "height": 3 }
}
```

#### Secret Passage Definition

Secret passages are placed directly in the grid:

```json
{
  "SecretPassage": {
    "discovered": false,
    "destination_floor": 6,
    "destination_pos": [10, 5],
    "hint": "The wall feels warm to the touch..."
  }
}
```

#### NPC Definition

```json
{
  "id": "filch",
  "name": "Argus Filch",
  "character": "F",
  "npc_type": "Patrol",
  "danger_level": "High",
  "starting_floor": 1,
  "starting_pos": [30, 15],
  "detection_range": 8,
  "patrol_waypoints": [
    { "floor": 1, "x": 30, "y": 15 },
    { "floor": 1, "x": 10, "y": 15 },
    { "floor": 2, "x": 10, "y": 20 }
  ],
  "schedule": [
    { "start": "20:00", "end": "06:00", "behavior": "Patrol" },
    { "start": "06:00", "end": "20:00", "behavior": "Idle", "location": { "room_id": 102 } }
  ],
  "pathfinding": "AStar"
}
```

**NPC types and their pathfinding:**

| `npc_type` | `pathfinding` | Behavior |
|------------|---------------|----------|
| `Patrol` | `AStar` or `Dijkstra` | Follows waypoints, chases player |
| `Scout` | `BFS` | Explores area, alerts patrol NPCs |
| `Chaotic` | `Random` | Random movement, blocks corridors |
| `Ghost` | `Direct` | Ignores walls, follows set route |
| `Passive` | `AStar` | Moves on schedule, ignores player |

#### Item Spawn Definition

```json
{
  "item": "Dungbomb",
  "floor": 1,
  "x": 25,
  "y": 12,
  "respawn": false
}
```

Valid item types: `InvisibilityCloak`, `MaraudersMapReveal`, `Dungbomb`, `DecoyDetonator`, `PeruvianDarknessPowder`

#### Mission Definition

```json
{
  "id": 1,
  "name": "The Midnight Snack",
  "description": "Sneak to the kitchen and back without being caught.",
  "unlock_after": null,
  "objectives": [
    {
      "description": "Reach the kitchen",
      "condition": { "EnterRoom": { "room_id": 101 } }
    },
    {
      "description": "Return to common room",
      "condition": { "EnterRoom": { "room_id": 701 } }
    },
    {
      "description": "Don't get caught",
      "condition": "AvoidDetection"
    }
  ]
}
```

**Objective condition types:**

| Condition | Fields | Description |
|-----------|--------|-------------|
| `ReachPosition` | `floor`, `x`, `y`, `radius` | Player within radius of position |
| `EnterRoom` | `room_id` | Player enters specified room |
| `DiscoverPassage` | `floor`, `x`, `y` | Specific passage discovered |
| `ReturnToStart` | `floor`, `x`, `y`, `radius` | Return to starting area |
| `AvoidDetection` | — | Detection never hits 100 |

### Map Loader Implementation

```rust
use std::fs;
use serde::Deserialize;

#[derive(Deserialize)]
pub struct MapFile {
    pub name: String,
    pub author: String,
    pub version: String,
    pub tick_rate_ms: u64,
    pub curfew_hour: u8,
    pub starting_position: StartPos,
    pub floors: Vec<FloorDef>,
    pub npcs: Vec<NpcDef>,
    pub items: Vec<ItemSpawnDef>,
    pub missions: Vec<MissionDef>,
}

pub fn load_map(path: &str) -> Result<MapFile, Box<dyn std::error::Error>> {
    let json = fs::read_to_string(path)?;
    let map: MapFile = serde_json::from_str(&json)?;
    validate_map(&map)?;
    Ok(map)
}

fn validate_map(map: &MapFile) -> Result<(), String> {
    // Check starting position is valid
    let start = &map.starting_position;
    if start.floor >= map.floors.len() {
        return Err(format!("Starting floor {} doesn't exist", start.floor));
    }

    // Check all NPC starting positions are on valid floors
    for npc in &map.npcs {
        if npc.starting_floor >= map.floors.len() {
            return Err(format!("NPC '{}' starts on invalid floor {}", npc.name, npc.starting_floor));
        }
    }

    // Check stair/passage destinations point to valid floors
    for floor in &map.floors {
        // ... validate each tile's destinations
    }

    Ok(())
}
```

### Command-Line Map Selection

```rust
use std::env;

fn main() {
    let args: Vec<String> = env::args().collect();

    let map_path = if args.len() > 1 {
        args[1].clone()
    } else {
        "maps/hogwarts.json".to_string()
    };

    let map = load_map(&map_path).unwrap_or_else(|e| {
        eprintln!("Failed to load map '{}': {}", map_path, e);
        std::process::exit(1);
    });

    run_game(map);
}
```

```bash
# Play the default Hogwarts map
cargo run

# Play a custom map
cargo run -- maps/my_custom_castle.json
```

### Your Turn

1. Create a minimal test map (one floor, 20x10, two rooms, one NPC, one passage)
2. Add map validation that checks all room IDs referenced in missions actually exist
3. Create a `maps/` directory with the default Hogwarts map and a sample custom map
4. **Challenge:** Add a `--validate` CLI flag that checks a map file for errors without running the game

### Checkpoint

After this stage:
- Maps load from JSON files
- Custom maps can be passed via command line
- Map format is fully documented (this stage *is* the documentation)
- Validation catches common errors before the game starts
- Players can create and share their own Hogwarts layouts

---

## Act 5 Complete — *'Mischief Managed'*

You've done it. What started as a blank terminal and a `cargo new` is now a full game:

- **Secret passages** that reward exploration
- **Items** that give tactical depth
- **Missions** that give purpose
- **Persistent saves** that respect the player's time
- **Atmospheric polish** that makes Hogwarts feel alive
- **Custom maps** that let others build on your work

And along the way, you've learned:
- Rust ownership, borrowing, and lifetimes — in practice, not theory
- Three pathfinding algorithms and when to use each
- Real-time game loops with terminal rendering
- Data-driven design with serde and JSON
- State machines for NPC AI and mission tracking

The Map never lies. And neither does your code.

> *"Mischief managed."*
