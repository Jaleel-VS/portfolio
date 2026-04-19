# Baraja — Build a Deckbuilding Roguelike in Rust

> *You draw five cards. Three energy to spend. A slime with 12 HP stares you down. Do you play Strike twice for raw damage, or Defend once and save energy for the combo next turn? Every decision matters — and behind the scenes, the AI opponent is simulating a thousand possible futures to find the move that kills you fastest.*

*Baraja* means "deck of cards" in Spanish. You build a single-player deckbuilding roguelike — Slay the Spire in the terminal. Start with a basic deck, fight enemies, earn new cards, climb a procedurally generated map, and face a boss. The AI enemies use Monte Carlo Tree Search to play optimally against you.

**Project:** `~/juk/baraja/` (Rust 2024 edition)

**Prerequisites:** Python experience. No Rust knowledge required. Familiarity with card games (Slay the Spire, Hearthstone, MTG) helps but isn't required.

**What makes this different from your other Rust courses:** This is the first course where **data modeling is the core challenge**. Cards have types, costs, effects, targets, and conditions. Effects chain and interact. The game state is complex but must be cheaply cloneable (the AI simulates thousands of copies). Rust's type system shines here — enums with data model card effects perfectly, and ownership rules prevent the bugs that plague card game implementations in other languages.

---

## Design Decisions

### Why Slay the Spire as the model?

StS is the gold standard of deckbuilders because its design is clean:
- **No mana curve** — you get 3 energy every turn, spend it all, done. No ramping, no land screw.
- **No opponent hand** — enemies telegraph their intent ("Slime will attack for 8"). Perfect information on the enemy side.
- **Deterministic combat** — no dice rolls. Damage is exact. Block is exact. The only randomness is card draw.
- **Small deck sizes** — 10-30 cards. The entire game state fits in a small struct.

This simplicity makes it implementable in a course while still being deeply strategic.

### Card effect system

Cards don't hardcode behavior. Each card has a list of `Effect` enums:

```rust
enum Effect {
    Damage(i32),
    Block(i32),
    DrawCards(i32),
    GainEnergy(i32),
    ApplyStatus(StatusType, i32),
    DamageAll(i32),
    Conditional(Condition, Box<Effect>),
}
```

This is a mini expression language — effects compose. A card can deal damage AND draw a card AND apply a status. The `Conditional` variant enables "if you have no block, deal double damage" without special-casing. This is the same pattern used in real game engines.

### AI: Monte Carlo Tree Search

MCTS doesn't need to understand card strategy. It simulates: "if I play this card, then randomly play out the rest of the fight 100 times, how often do I win?" The move with the highest win rate is chosen. It discovers combos, sequencing, and resource management without being taught any of it.

MCTS is the same algorithm behind AlphaGo, but applied to a much simpler domain. It's the most powerful general-purpose game AI that doesn't require domain-specific knowledge.

### Why TUI last?

Acts 1-4 build the game logic and AI with a simple text interface. Act 5 adds the ratatui TUI. This separation means:
- You can test and play the game before investing in visuals
- The game logic has no rendering dependencies
- The TUI is a pure view layer — it reads game state and draws, nothing more

### ratatui conventions

- **TEA architecture** (The Elm Architecture): Model → Message → Update → View
- **Custom `CardWidget`** implementing `Widget` trait for card rendering
- **`StatefulWidget`** for the hand (tracks selected card index)
- **ratatui v0.30+** with crossterm backend

---

## Course Map

### [[Act 1 - The Cards]] — Data Model and Card System (Stages 1-7)

Define what a card is, how effects work, and how decks shuffle and draw. By the end, you can create a deck, draw a hand, and play cards that deal damage and gain block. Introduces the module system, `#[test]`, `Result<T,E>`, and ownership fundamentals.

| # | Stage | Concept | Difficulty | ~Time |
|---|---|---|---|---|
| 1 | The Deck Box | `cargo new`, Card struct, enums, module system (`mod`/`use`/`pub`) | Very Easy | 35 min |
| 2 | The Effect System | `Effect` enum with data, composable effects, `#[test]` and `cargo test` | Medium | 60 min |
| 3 | The Deck | Draw pile, hand, discard pile. Shuffle, draw, discard cycle. Ownership | Easy | 50 min |
| 4 | Playing a Card | Energy cost check, `Result<T,E>` and `?` operator, effect resolution | Medium | 55 min |
| 5 | Status Effects | Vulnerable, Weak, Strength, Poison — damage formula, shared `StatusEffects` struct | Medium | 60 min |
| 6 | The Starter Deck | 5 Strikes, 4 Defends, 1 Bash. Full draw-play-discard cycle test | Easy | 35 min |
| 7 | Card Catalog | 30+ cards defined as data (not code) — attacks, skills, powers | Medium | 55 min |

### [[Act 2 - The Battle]] — Turn-Based Combat (Stages 8-14)

Build the combat system: turns, phases, enemy AI with telegraphed intents, damage calculation with block, and win/lose conditions.

| # | Stage | Concept | Difficulty | ~Time |
|---|---|---|---|---|
| 8 | The Enemy | Enemy struct — HP, intent, move pattern. Borrow checker: clone to avoid conflicts | Easy | 45 min |
| 9 | The Turn | Draw phase → player plays cards → enemy acts → end turn. Field-level borrowing | Medium | 60 min |
| 10 | Damage and Block | Full damage pipeline end-to-end. Edge cases: overkill, block overflow | Easy | 35 min |
| 11 | Enemy Intents | Enemies telegraph next action. Patterns: cycle, conditional | Medium | 50 min |
| 12 | The Combat Loop | Full text-based fight. User input with `stdin`, `Result` error display | Medium | 55 min |
| 13 | Multi-Enemy Fights | 2-3 enemies at once. Target selection. AoE. Index invalidation | Medium | 55 min |
| 14 | Elite Enemies | Harder enemies with unique mechanics — Nob, Lagavulin, Sentries | Medium | 50 min |

### [[Act 3 - The Spire]] — Procedural Map and Progression (Stages 15-20)

Build the roguelike layer: a branching map of encounters, card rewards after combat, rest sites for healing, shops, and a boss fight.

| # | Stage | Concept | Difficulty | ~Time |
|---|---|---|---|---|
| 15 | The Map | Procedural branching path — seeded RNG, 15 floors, boss at top | Medium | 65 min |
| 16 | Card Rewards | After combat: choose 1 of 3 random cards to add to your deck | Easy | 35 min |
| 17 | Rest Sites | Heal 30% HP or upgrade a card. Mutable references into enum variants | Easy | 30 min |
| 18 | Relics | Passive bonuses with trigger events — modeling game events as enums | Medium | 55 min |
| 19 | The Shop | Spend gold to buy cards, remove cards, or buy relics | Medium | 50 min |
| 20 | The Boss | Boss fight + full run loop wiring all modules together | Hard | 70 min |

### [[Act 4 - The Mind]] — AI with Monte Carlo Tree Search (Stages 21-25)

Build an AI that plays the game optimally using MCTS. It simulates thousands of random playouts to evaluate each possible move, discovering combos and sequencing without being taught strategy.

| # | Stage | Concept | Difficulty | ~Time |
|---|---|---|---|---|
| 21 | Cloneable Game State | `#[derive(Clone)]`, legal action enumeration, state independence | Medium | 50 min |
| 22 | Random Playout | Play randomly until combat ends. Evaluate positions by win rate | Medium | 55 min |
| 23 | The MCTS Tree | Arena allocation, 4 phases: selection, expansion, simulation, backpropagation | Hard | 75 min |
| 24 | UCB1 Selection | Upper Confidence Bound — `f64` math, exploration vs exploitation | Medium | 50 min |
| 25 | The AI Player | Wire MCTS into the game loop. Benchmark AI vs random play | Medium | 55 min |

### [[Act 5 - The Table]] — Terminal UI with ratatui (Stages 26-31)

Replace the text interface with a polished TUI. Cards rendered as bordered boxes, the hand as a selectable row, the battle screen with enemy intents and HP bars, and the map as an ASCII graph.

| # | Stage | Concept | Difficulty | ~Time |
|---|---|---|---|---|
| 26 | ratatui Setup | Terminal setup, TEA architecture, panic-safe cleanup | Easy | 45 min |
| 27 | The Card Widget | Custom `Widget` trait, `Buffer` cell drawing, lifetime `<'a>` | Medium | 60 min |
| 28 | The Hand | Horizontal layout, keyboard navigation, dynamic hand sizing | Medium | 55 min |
| 29 | The Battle Screen | Multi-region layout, enemy display, player stats, HP color coding | Medium | 60 min |
| 30 | The Map Screen | ASCII graph rendering, color-coded nodes, navigation | Medium | 55 min |
| 31 | The Complete Baraja | All screens connected, AI auto-play, full run playable | Hard | 70 min |

### [[Reference Guide]]

Card effect system reference, all 30+ cards, enemy patterns, MCTS algorithm, ratatui widget patterns, TEA architecture, game state structure.

---

## Totals

| Act | Stages | Est. Time |
|---|---|---|
| The Cards | 7 | ~5.8 hrs |
| The Battle | 7 | ~5.8 hrs |
| The Spire | 6 | ~5.1 hrs |
| The Mind | 5 | ~4.8 hrs |
| The Table | 6 | ~5.8 hrs |
| **Total** | **31** | **~27 hrs** |

## Tech Stack

| Crate | Version | Introduced |
|---|---|---|
| serde + serde_json | 1 | Stage 1 |
| rand | 0.8 | Stage 3 |
| ratatui | 0.30 | Stage 26 |
| crossterm | 0.28 | Stage 26 |

Four crates. The card system, combat engine, map generator, and MCTS AI are all from scratch.

## What You'll Understand After This Course

- How to model complex game state with Rust enums (card effects as a mini expression language)
- How state machines drive turn-based games (phases, transitions, triggers)
- How procedural generation creates replayable content (seeded random maps)
- How Monte Carlo Tree Search works (the algorithm behind AlphaGo, applied to cards)
- Why cloneable game state matters for AI (simulate without mutating the real game)
- How to build custom ratatui widgets (the CardWidget pattern)
- How TEA architecture separates game logic from rendering
- Why deckbuilders are strategically deep (deck thinning, combo building, energy management)
