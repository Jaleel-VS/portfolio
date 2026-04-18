# Rust Crónica Course

> Build an AI-powered multiplayer choose-your-adventure Discord bot in Rust — from `cargo new` to production.

**Project:** [~/juk/cronica/](file:///Users/jdvans/juk/cronica/) | **Spec:** [[Crónica Game Design Spec]]

---

## Course Map

### [[Act 1 - The Forge]] — Rust Foundations (Stages 1-8)
Build the game engine with zero networking — pure Rust fundamentals.

| # | Stage | Concept | Difficulty | ~Time |
|---|-------|---------|-----------|-------|
| 1 | Hello Crónica | cargo new, println!, project anatomy | Very Easy | 15 min |
| 2 | The Character | Structs, derived stats, methods | Easy | 30 min |
| 3 | The Realms | Enums, Display trait, match | Easy | 25 min |
| 4 | Rolling the Dice | Functions, rand crate, d20 rolls | Easy | 30 min |
| 5 | The Stat Check | DC system: primary/secondary/off-stat | Medium | 45 min |
| 6 | The Inventory | Vec, ownership, borrowing, &mut | Medium | 45 min |
| 7 | Saving the World | serde, JSON serialization, file I/O | Medium | 40 min |
| 8 | The Quest Engine | State machines, tension-driven 5-beat arc | Medium | 60 min |

### [[Act 2 - The Voice]] — The AI Narrator (Stages 9-14)
Integrate AWS Bedrock to generate the narrative.

| # | Stage | Concept | Difficulty | ~Time |
|---|-------|---------|-----------|-------|
| 9 | Calling Bedrock | async/await, tokio, reqwest, HTTP | Medium | 60 min |
| 10 | The Prompt | Prompt engineering, string building | Medium | 40 min |
| 11 | Structured Responses | JSON parsing into typed structs | Medium | 45 min |
| 12 | The Game Loop | CLI game: AI → choice → roll → narrate | Hard | 90 min |
| 13 | Combat | Narrative exchanges, 4-tier margin band | Hard | 90 min |
| 14 | The Chronicle Compiler | Multi-model AI, story compilation | Medium | 45 min |

### [[Act 3 - The Gateway]] — Discord Integration (Stages 15-22)
Wire the game engine into Discord using poise.

| # | Stage | Concept | Difficulty | ~Time |
|---|-------|---------|-----------|-------|
| 15 | The Bot Awakens | poise setup, slash commands, intents | Medium | 60 min |
| 16 | Character Creation | Multi-step button flows, stat allocation | Hard | 90 min |
| 17 | The Play Command | Scene embeds, choice buttons, Fortune UI | Hard | 90 min |
| 18 | Button Interactions | Component handlers, modals, Fortune spend | Medium | 60 min |
| 19 | Combat UI | HP bars, stat buttons, exchange display | Hard | 90 min |
| 20 | Stats and Inventory | Rich embeds, select menus | Medium | 45 min |
| 21 | The Chronicle Channel | Cross-channel posting, formatted embeds | Medium | 40 min |
| 22 | Leaderboard | Queries, ranking display | Easy | 30 min |

### [[Act 4 - The Archive]] — Persistence & Polish (Stages 23-28)
Database, error handling, and production readiness.

| # | Stage | Concept | Difficulty | ~Time |
|---|-------|---------|-----------|-------|
| 23 | SQLite Setup | rusqlite, schema design, WAL mode | Medium | 60 min |
| 24 | CRUD Operations | Parameterized queries, transactions | Medium | 60 min |
| 25 | Error Handling | thiserror, anyhow, Result propagation | Medium | 45 min |
| 26 | Graceful Everything | Signal handlers, timeouts, cleanup | Medium | 50 min |
| 27 | Level Up & Talents | XP, 10 talents (4 shapes), TalentState | Medium | 75 min |
| 28 | Language System | Vocab highlighting, difficulty levels | Medium | 45 min |

### [[Act 5 - The Chronicle]] — Multiplayer & Deploy (Stages 29-34)
Social features and going live.

| # | Stage | Concept | Difficulty | ~Time |
|---|-------|---------|-----------|-------|
| 29 | Shared World State | Arc, RwLock, Send+Sync | Medium | 60 min |
| 30 | Party Quests | Multi-player sessions, turn order | Hard | 90 min |
| 31 | The Rival System | Dead characters as NPCs, DB queries | Medium | 45 min |
| 32 | ANSI & Embeds Polish | Colored text, atmospheric formatting | Easy | 30 min |
| 33 | Deploy to EC2 | Cross-compile, systemd, tracing | Hard | 90 min |
| 34 | Launch Day | Monitoring, invite flow, first session | Medium | 45 min |

### [[Reference Guide]]
Rust cheat sheet, poise/serenity API, Bedrock patterns, dice math, cargo commands, rusqlite patterns.

---

## Totals

| Act | Stages | Est. Time |
|-----|--------|-----------|
| The Forge | 8 | ~5 hrs |
| The Voice | 6 | ~6 hrs |
| The Gateway | 8 | ~8.5 hrs |
| The Archive | 6 | ~5.5 hrs |
| The Chronicle | 6 | ~6 hrs |
| **Total** | **34** | **~31 hrs** |

## Tech Stack

| Crate | Version | Introduced |
|-------|---------|-----------|
| rand | 0.8 | Stage 4 |
| serde + serde_json | 1 | Stage 7 |
| tokio | 1 | Stage 9 |
| reqwest | 0.12 | Stage 9 |
| poise | 0.6.2 | Stage 15 |
| rusqlite | 0.31 | Stage 23 |
| thiserror + anyhow | 1 | Stage 25 |
| tracing | 0.1 | Stage 33 |
