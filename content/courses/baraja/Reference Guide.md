# Reference Guide

> *Quick reference for the card system, combat mechanics, MCTS algorithm, and ratatui patterns.*

---

## Card Effect System

### Effect enum

```rust
Damage(i32)                    // deal damage to target
DamageAll(i32)                 // deal damage to ALL enemies
Block(i32)                     // gain block
DrawCards(i32)                 // draw N cards
GainEnergy(i32)                // gain N energy this turn
ApplyStatus(StatusType, i32)   // apply status to target
ApplySelfStatus(StatusType, i32) // apply status to self
Exhaust                        // remove card from deck for this combat
DamageMulti(i32, i32)          // deal damage N times
```

### Status effects

| Status | Effect | Duration |
|---|---|---|
| Vulnerable | Take 50% more damage | N turns |
| Weak | Deal 25% less damage | N turns |
| Strength | Deal +N more damage | Permanent |
| Poison | Take N damage at turn start, decreases by 1 | Until 0 |
| Ritual | Gain N Strength at end of turn | Permanent |

### Damage formula

```
final = (base + attacker.strength) × weak_modifier × vulnerable_modifier
weak_modifier = 0.75 if attacker is Weak, else 1.0
vulnerable_modifier = 1.5 if defender is Vulnerable, else 1.0
```

Block absorbs damage before HP. Block resets to 0 at start of turn.

---

## Combat Structure

### Turn phases

```
1. Start of turn: reset energy, reset block, draw 5 cards
2. Player phase: play cards (costs energy) until done
3. End of turn: discard hand, enemies act, tick statuses
4. Repeat until victory or defeat
```

### Enemy intents

```rust
Attack(i32)                      // ⚔ will deal N damage
Defend(i32)                      // 🛡 will gain N block
Buff(StatusType, i32)            // ↑ will buff itself
Debuff(StatusType, i32)          // ↓ will debuff player
AttackDebuff(i32, StatusType, i32) // ⚔↓ attack + debuff
```

---

## Card Catalog (Starter + Common)

| Card | Type | Cost | Effects |
|---|---|---|---|
| Strike | Attack | 1 | Deal 6 damage |
| Defend | Skill | 1 | Gain 5 block |
| Bash | Attack | 2 | Deal 8 damage. Apply 2 Vulnerable |
| Cleave | Attack | 1 | Deal 8 damage to ALL |
| Iron Wave | Attack | 1 | Deal 5 damage. Gain 5 block |
| Pommel Strike | Attack | 1 | Deal 9 damage. Draw 1 |
| Shrug It Off | Skill | 1 | Gain 8 block. Draw 1 |
| Inflame | Power | 1 | Gain 2 Strength |
| Carnage | Attack | 2 | Deal 20 damage |
| Bludgeon | Attack | 3 | Deal 32 damage |
| Offering | Skill | 0 | Lose 6 HP. Gain 2 energy. Draw 3. Exhaust |
| Demon Form | Power | 3 | Gain 2 Ritual (Strength per turn) |

---

## MCTS Algorithm

### Four phases

```
1. SELECTION:    Walk tree using UCB1 to find a promising leaf
2. EXPANSION:    Add one child (untried action) to the leaf
3. SIMULATION:   Random playout from the new child
4. BACKPROP:     Walk back up, updating visits and wins
```

### UCB1 formula

```
UCB1 = wins/visits + C × sqrt(ln(parent_visits) / visits)
C = sqrt(2) ≈ 1.414
```

- First term: exploitation (favor high win rate)
- Second term: exploration (favor low visit count)
- Unvisited nodes: UCB1 = infinity (always try first)

### Tree node

```rust
struct MctsNode {
    state: Combat,
    action: Option<Action>,
    parent: Option<usize>,
    children: Vec<usize>,
    visits: u32,
    wins: f64,
    untried_actions: Vec<Action>,
}
```

---

## Map Generation

```
15 floors, 2-3 nodes per floor
Floor 1: always Combat
Floor 15: always Boss
Distribution: 55% Combat, 15% Event, 12% Rest, 8% Elite, 10% Shop
Seeded RNG for reproducible maps
```

---

## ratatui Patterns

### TEA Architecture

```rust
// Model
struct App { screen: Screen, game: GameRun, combat: Option<Combat> }

// Message
enum Message { SelectCard(usize), PlayCard, EndTurn, NavigateMap(usize), Quit }

// Update
fn update(app: &mut App, msg: Message) { /* modify state */ }

// View
fn view(frame: &mut Frame, app: &App) { /* render widgets */ }
```

### Custom Widget

```rust
impl Widget for CardWidget<'_> {
    fn render(self, area: Rect, buf: &mut Buffer) {
        // Draw border, cost, name, description, type badge
    }
}
```

### Card dimensions

```
Width: 11 chars (13 with padding)
Height: 7 lines
Border: colored by type (red=Attack, blue=Skill, yellow=Power)
```

---

## Cargo.toml

```toml
[package]
name = "baraja"
version = "0.1.0"
edition = "2024"

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rand = "0.8"
ratatui = "0.30"
crossterm = "0.28"
```

---

## Module Structure

```
src/
├── main.rs        ← Entry point, TUI setup, TEA loop
├── card.rs        ← Card, CardType, Rarity, Target
├── cards.rs       ← Card catalog (30+ card definitions)
├── effect.rs      ← Effect enum, StatusType, StatusEffects, calc_damage
├── deck.rs        ← Draw/hand/discard piles, shuffle
├── player.rs      ← Player HP, block, energy, statuses
├── enemy.rs       ← Enemy HP, intents, move patterns
├── combat.rs      ← Combat state, turn phases, play logic, text combat loop
├── map.rs         ← Procedural map generation
├── relic.rs       ← Relic definitions and triggers
├── run.rs         ← GameRun struct, full run loop
├── shop.rs        ← Shop logic
├── ai.rs          ← MCTS tree, random playout, UCB1
├── tui/
│   ├── mod.rs     ← TUI module root
│   ├── app.rs     ← App state, Message, Screen, update/view/input
│   ├── card_widget.rs  ← Custom CardWidget
│   ├── battle.rs  ← Battle screen rendering
│   ├── hand.rs    ← Hand rendering and navigation
│   └── map_screen.rs  ← Map screen rendering
```

---

## Module System Quick Reference

```rust
// In main.rs — declare modules:
mod card;       // loads src/card.rs
mod effect;     // loads src/effect.rs
mod tui;        // loads src/tui/mod.rs

// In any file — import from other modules:
use crate::card::Card;           // absolute path from crate root
use crate::effect::{Effect, StatusType};  // multiple items

// In src/tui/mod.rs — declare submodules:
pub mod app;
pub mod card_widget;
pub mod battle;
```

Key rules:
- `mod name;` declares a module (connects the file). Required in the parent.
- `use path::Item;` imports an item. Optional but convenient.
- `pub` makes items visible outside their module. Without it, items are private.
- `crate::` is the absolute path to the crate root.

---

## Testing Patterns

```rust
// In any source file — tests go at the bottom:
#[cfg(test)]
mod tests {
    use super::*;  // import everything from the parent module

    #[test]
    fn test_something() {
        assert_eq!(1 + 1, 2);
    }

    #[test]
    fn test_result_is_ok() {
        let result: Result<i32, String> = Ok(42);
        assert!(result.is_ok());
    }

    #[test]
    fn test_pattern_matching() {
        let intent = Intent::Attack(11);
        assert!(matches!(intent, Intent::Attack(11)));
    }
}
```

Commands:
```bash
cargo test                    # run all tests
cargo test deck               # run tests with "deck" in the name
cargo test effect::tests      # run tests in a specific module
cargo test -- --nocapture     # show println! output during tests
```

---

## Error Handling Patterns

```rust
// Define error types:
#[derive(Debug)]
pub enum PlayError {
    NotEnoughEnergy { cost: i32, available: i32 },
    InvalidTarget,
}

// Return Result from functions that can fail:
pub fn play_card(card: &Card, player: &mut Player) -> Result<(), PlayError> {
    if player.energy < card.cost {
        return Err(PlayError::NotEnoughEnergy {
            cost: card.cost, available: player.energy,
        });
    }
    // ... success path ...
    Ok(())
}

// Use ? to propagate errors:
let result = play_card(&card, &mut player)?;

// Use .unwrap() only in tests or with a TODO comment:
let json = serde_json::to_string(&card).unwrap(); // OK in tests
let json = serde_json::to_string(&card).unwrap(); // TODO: replace with ? in Stage N
```
