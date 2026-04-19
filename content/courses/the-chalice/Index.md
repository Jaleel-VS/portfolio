# The Chalice — A Rust Roguelike Course

> *"A hunter is never alone."*

Build a procedurally generated roguelike dungeon crawler from scratch in Rust. Bloodborne-inspired. 36 stages across 5 acts.

**Project:** `~/juk/the-chalice/`
**Design Spec:** [[The Chalice Design Spec]]

---

## Course Map

### [[Act 1 - The Ritual]] — Dungeon Generation
*From nothing, a labyrinth is born.*

| # | Stage | Difficulty | Est. Time |
|---|-------|-----------|-----------|
| 1 | Hello Hunter — cargo new, project setup | Very Easy | 15 min |
| 2 | The Tile — enums, Display trait | Easy | 30 min |
| 3 | The Empty Grid — 2D Vec, carve a room | Easy | 30 min |
| 4 | Binary Space Partitioning — recursive splitting | Medium | 60 min |
| 5 | Rooms from Partitions — BSP leaf rooms | Medium | 45 min |
| 6 | Corridors — L-shaped paths, doors | Medium | 45 min |
| 7 | The Seed — rand_chacha, deterministic RNG | Easy | 30 min |
| 8 | Populate — enemies, traps, loot | Medium | 45 min |
| 9 | Multiple Floors — 5 floors, scaling difficulty | Medium | 45 min |
| 10 | The Minimap — fog of war, room reveal | Medium | 45 min |

**Act 1 total: ~6.5 hours**

---

### [[Act 2 - The Dream]] — The Hunter
*You awaken in the dream. The hunt begins.*

| # | Stage | Difficulty | Est. Time |
|---|-------|-----------|-----------|
| 11 | The Hunter Struct — HP, stamina, weapon | Easy | 30 min |
| 12 | Movement & Collision — WASD, doors, fog reveal | Medium | 60 min |
| 13 | Stamina — action costs, regen, exhaustion | Easy | 30 min |
| 14 | Light Attack — combat basics, rally mechanic | Medium | 45 min |
| 15 | Heavy Attack & Dodge — stagger, invulnerability, cooldown | Medium | 45 min |
| 16 | Blood Vials & Items — healing, loot, inventory | Medium | 45 min |

**Act 2 total: ~4 hours**

---

### [[Act 3 - The Hunt]] — The Beasts
*The night is long. The beasts are many.*

| # | Stage | Difficulty | Est. Time |
|---|-------|-----------|-----------|
| 17 | The Enemy — struct, AI states, 9 enemy types | Easy | 30 min |
| 18 | Enemy AI — BFS pathfinding, charge, patrol | Medium | 60 min |
| 19 | The Bell Maiden — summoner AI, priority targeting | Medium | 45 min |
| 20 | Combat Flow — full turn resolution | Hard | 90 min |
| 21 | Traps — 5 trap types, insight visibility | Medium | 45 min |
| 22 | The Insight Mechanic — thresholds, altars, mutations | Medium | 60 min |

**Act 3 total: ~5.5 hours**

---

### [[Act 4 - The Nightmare]] — The Bosses
*Grant us eyes. Grant us eyes.*

| # | Stage | Difficulty | Est. Time |
|---|-------|-----------|-----------|
| 23 | The Boss Struct — phases, patterns, cooldowns | Easy | 30 min |
| 24 | Phase 1 — telegraph/respond/punish cycle | Medium | 60 min |
| 25 | Phase Transition — dramatic shifts at 60% HP | Medium | 45 min |
| 26 | Enraged — 30% HP, desperation, stamina drain | Medium | 45 min |
| 27 | The Boss Pool — tiered selection, attack library | Hard | 90 min |
| 28 | Victory — rewards, stairs, dramatic text | Easy | 30 min |

**Act 4 total: ~5 hours**

---

### [[Act 5 - Paleblood]] — The Chalice
*The night, and the dream, were long.*

| # | Stage | Difficulty | Est. Time |
|---|-------|-----------|-----------|
| 29 | ratatui Layout — viewport, status bar, message log | Medium | 60 min |
| 30 | HP & Stamina Bars — gauges, flash, pulse | Easy | 30 min |
| 31 | Combat Animations — text sequences, damage numbers | Medium | 45 min |
| 32 | Boss Fight UI — boss bar, phase indicator, telegraphs | Medium | 45 min |
| 33 | Death & Echoes — permadeath, echo recovery | Medium | 60 min |
| 34 | Save & Stats — serde, Hunter's Dream upgrades | Medium | 60 min |
| 35 | Weapon Variety — 6 weapons, blood gems, runes | Medium | 60 min |
| 36 | The Daily Chalice — date seed, leaderboard | Easy | 30 min |

**Act 5 total: ~6.5 hours**

---

### [[Reference Guide]]
Companion reference for the entire course — Rust cheat sheet, procedural generation glossary, state machine patterns, roguelike design principles, ratatui widget reference, combat math breakdown, and a complete game data quick reference.

---

## Course Summary

| | Acts | Stages | Est. Total |
|---|------|--------|-----------|
| The Ritual | 1 | 10 | 6.5 hrs |
| The Dream | 2 | 6 | 4 hrs |
| The Hunt | 3 | 6 | 5.5 hrs |
| The Nightmare | 4 | 6 | 5 hrs |
| Paleblood | 5 | 8 | 6.5 hrs |
| **Total** | **5** | **36** | **~27.5 hrs** |

## Tech Stack

| Component | Crate | Version |
|-----------|-------|---------|
| Terminal UI | ratatui + crossterm | 0.30 / 0.29 |
| Async | tokio | 1.x |
| Serialization | serde + serde_json | 1.x |
| Random | rand + rand_chacha | 0.9 |

---

> *"Tonight, Gehrman joins the hunt."*
