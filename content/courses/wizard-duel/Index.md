# Rust Wizard Duel Course

Build a turn-based 1v1 spell combat game from scratch in Rust. 30 stages, 4 acts, one continuous project.

**Project:** `~/juk/wizard-duel/`
**Design Spec:** [[Wizard Duel Engine Design Spec]]

---

## Course Map

### [[Act 1 - The Spells]] — "Ollivanders" (Stages 1-8)
Core data types and game logic. No UI yet — just tests and println.

| # | Stage | Difficulty | Est. Time | Key Concepts |
|---|-------|-----------|-----------|--------------|
| 1 | Hello Wizard | Very Easy | 15 min | cargo new, Cargo.toml, main.rs |
| 2 | The Spell | Easy | 30 min | enums, structs, String vs &str |
| 3 | The Type Triangle | Easy | 30 min | match expressions, impl blocks, tests |
| 4 | The Wizard | Easy | 30 min | structs, Display trait, constructors |
| 5 | Cast a Spell | Medium | 45 min | Result, &mut self, borrow checker |
| 6 | Damage Resolution | Medium | 60 min | rand crate, game math, type modifiers |
| 7 | Status Effects | Medium | 45 min | iterators, map/filter/collect, duration |
| 8 | The Duel Loop | Medium | 60 min | stdin, game loop, integration testing |

**Act 1 total: ~5.5 hours**

---

### [[Act 2 - The Dark Arts]] — "The Dark Arts" (Stages 9-14)
Build the AI opponent from random to strategic.

| # | Stage | Difficulty | Est. Time | Key Concepts |
|---|-------|-----------|-----------|--------------|
| 9 | The Random Opponent | Easy | 30 min | rand, iterator filtering |
| 10 | The Counter | Medium | 45 min | history tracking, weighted random |
| 11 | The Strategist | Medium | 60 min | state evaluation, spell scoring |
| 12 | The Predictor | Hard | 90 min | pattern detection, baiting, combos |
| 13 | Trait Objects | Medium | 60 min | trait, impl, Box\<dyn\>, vtable |
| 14 | Named Opponents | Easy | 30 min | composition, personality system |

**Act 2 total: ~5.5 hours**

---

### [[Act 3 - The Great Hall]] — "The Great Hall" (Stages 15-22)
Build the TUI with ratatui.

| # | Stage | Difficulty | Est. Time | Key Concepts |
|---|-------|-----------|-----------|--------------|
| 15 | ratatui Setup | Medium | 45 min | terminal init, event loop, Block |
| 16 | The Duel Screen | Medium | 60 min | Layout, Constraint, nested splits |
| 17 | HP and Mana Bars | Easy | 30 min | Gauge widget, color thresholds |
| 18 | Spell Selection | Medium | 45 min | List + ListState, keyboard nav |
| 19 | Turn Animation | Medium | 45 min | timed sequences, animation state |
| 20 | Status Effect Icons | Easy | 20 min | Unicode symbols, Span composition |
| 21 | Turn History Log | Medium | 45 min | scrollable List, color-coded entries |
| 22 | Victory/Defeat Screen | Easy | 30 min | overlay popup, stats display |

**Act 3 total: ~5.5 hours**

---

### [[Act 4 - The Triwizard Tournament]] — "The Triwizard Tournament" (Stages 23-30)
Leveling, persistence, and game feel.

| # | Stage | Difficulty | Est. Time | Key Concepts |
|---|-------|-----------|-----------|--------------|
| 23 | XP and Levels | Medium | 45 min | progression table, XP bar widget |
| 24 | Spell Unlocks | Medium | 45 min | unlock system, equip screen |
| 25 | House Selection | Easy | 30 min | character creation, passive bonuses |
| 26 | Save & Load | Medium | 60 min | serde, JSON, file I/O, error handling |
| 27 | Duel History | Easy | 30 min | record tracking, Table widget |
| 28 | Tournament Mode | Hard | 90 min | bracket system, progressive difficulty |
| 29 | Sound & Polish | Easy | 30 min | terminal bell, animations, color |
| 30 | The Leaderboard | Medium | 45 min | high scores, sorted Table display |

**Act 4 total: ~6.5 hours**

---

### [[Reference Guide]]
Standalone companion — Rust cheat sheet, game design patterns, ratatui widget reference, spell balance spreadsheet, progression table, common errors & solutions.

---

## Course Total: ~23 hours

## Tech Stack

| Component | Crate | Version | Introduced |
|-----------|-------|---------|------------|
| Random | rand | 0.9 | Stage 6 |
| Terminal UI | ratatui | 0.29+ | Stage 15 |
| Terminal backend | crossterm | 0.28+ | Stage 15 |
| Serialization | serde | 1.x | Stage 26 |
| JSON | serde_json | 1.x | Stage 26 |

## Prerequisites

- Rust installed (`rustup`)
- A terminal (Ghostty, iTerm2, etc.)
- A text editor (nvim, VS Code, etc.)
- Knows Python (comparisons throughout)
- Zero Rust experience required
