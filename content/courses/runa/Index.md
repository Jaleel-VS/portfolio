# Runa — Build a Spaced Repetition Engine in Rust

> *Forgetting is inevitable. But forgetting at the right rate — that's a science. Runa is a flashcard engine that knows exactly when you're about to forget something and shows it to you just in time. You'll build it from the scheduling algorithm to the terminal interface, one card at a time.*

*Runa* means "rune" or "secret" in Old Norse — a piece of knowledge carved into memory. The project is a CLI flashcard engine powered by FSRS (Free Spaced Repetition Scheduler), the algorithm that's replacing Anki's SM-2 because it's mathematically better at predicting when you'll forget.

**Project:** `~/juk/runa/` (Rust 2024 edition)

**Prerequisites:** Python experience. No Rust knowledge required. Familiarity with flashcard apps (Anki, Quizlet) is helpful but not required.

**What makes this different from your other Rust courses:** This is the first course focused on **data modeling and user experience**. No network protocols, no binary parsing — instead you'll work with dates, statistics, file formats, and a polished terminal UI. The core challenge is implementing a real scheduling algorithm from a research paper and building an interface that makes studying feel good.

---

## Design Decisions

### Why FSRS over SM-2?

SM-2 (SuperMemo 2) is the algorithm Anki uses. It was designed in 1987 and works, but it's crude — it uses a single "ease factor" per card and doesn't model memory decay accurately. FSRS (Free Spaced Repetition Scheduler) was published in 2022 and is based on the DSR (Difficulty, Stability, Retrievability) model of memory. It's been shown to schedule 30% fewer reviews for the same retention rate.

The key insight: FSRS models three properties per card:
- **Stability (S)** — how many days until your recall probability drops to 90%
- **Difficulty (D)** — how inherently hard this card is for you (0-10 scale)
- **Retrievability (R)** — your current probability of recalling this card right now

From these three numbers, the algorithm computes the optimal next review date. Simple, elegant, and backed by research.

### Why a TUI?

A terminal UI (ratatui) is the right fit because:
- Flashcard review is a focused, keyboard-driven activity — no mouse needed
- The TUI can render rich layouts (progress bars, heatmaps, card formatting) without a browser
- It starts instantly, unlike Electron apps
- It teaches ratatui, which none of your other courses cover in a productivity context

### File format

Decks are directories. Cards are JSON. Review history is append-only JSONL. No database — files are easy to inspect, version control, and sync.

```
~/.runa/
├── config.toml
└── decks/
    └── spanish/
        ├── deck.toml          ← deck metadata
        ├── cards.json          ← card definitions
        └── reviews.jsonl       ← review log (append-only)
```

### Grading scale

FSRS uses four grades, same as Anki:

| Grade | Meaning | Effect on scheduling |
|---|---|---|
| Again (1) | Forgot completely | Reset stability, increase difficulty |
| Hard (2) | Recalled with significant effort | Small stability increase |
| Good (3) | Recalled with moderate effort | Normal stability increase |
| Easy (4) | Recalled instantly | Large stability increase, decrease difficulty |

---

## Course Map

### [[Act 1 - The First Card]] — Data Model and Basic Review (Stages 1-7)

Build the foundation: card and deck data structures, JSON persistence, and a simple review loop. By the end you can create cards, review them, and grade your recall — but the scheduling is naive (fixed intervals).

| # | Stage | Concept | Difficulty | ~Time |
|---|---|---|---|---|
| 1 | The Blank Card | `cargo new`, project setup, the `Card` struct, `serde` JSON serialization | Very Easy | 20 min |
| 2 | The Deck | `Deck` struct, loading/saving a deck directory, `deck.toml` metadata | Easy | 30 min |
| 3 | Adding Cards | CLI for creating cards — front, back, optional tags. Append to `cards.json` | Easy | 25 min |
| 4 | The First Review | Simple review loop — show front, wait for keypress, show back, ask for grade | Easy | 35 min |
| 5 | Naive Scheduling | Fixed intervals based on grade: Again=1min, Hard=1d, Good=3d, Easy=7d | Medium | 30 min |
| 6 | The Review Log | Append-only `reviews.jsonl` — timestamp, card ID, grade, interval. Never lose data | Easy | 25 min |
| 7 | Due Cards | Filter cards by due date, sort by urgency, skip cards not yet due | Medium | 35 min |

### [[Act 2 - The Algorithm]] — FSRS Implementation (Stages 8-14)

Replace the naive scheduler with FSRS. This is the intellectual core of the course — you implement a real scheduling algorithm from a research paper, understanding the math behind each step.

| # | Stage | Concept | Difficulty | ~Time |
|---|---|---|---|---|
| 8 | The Memory Model | Stability, Difficulty, Retrievability — the three numbers that describe your memory of a card | Medium | 40 min |
| 9 | Initial Stability | First review: computing S₀ from the grade. The FSRS parameter table | Medium | 35 min |
| 10 | The Forgetting Curve | R = e^(-t/S) — retrievability decays exponentially. Plotting it in the terminal | Medium | 40 min |
| 11 | Updating Stability | Subsequent reviews: S' = S × f(D, R, grade). The core FSRS formula | Hard | 50 min |
| 12 | Updating Difficulty | D' = D + w₅ × (grade - 3). Mean reversion toward default difficulty | Medium | 35 min |
| 13 | Optimal Intervals | Computing the next review date from target retrievability (default 0.9) | Medium | 40 min |
| 14 | Replacing the Naive Scheduler | Wire FSRS into the review loop, migrate existing cards to FSRS state | Medium | 40 min |

### [[Act 3 - The Interface]] — Terminal UI with ratatui (Stages 15-21)

Replace the basic CLI with a polished terminal interface. Review cards in a focused full-screen mode, browse decks, see your progress, and track streaks.

| # | Stage | Concept | Difficulty | ~Time |
|---|---|---|---|---|
| 15 | Hello ratatui | ratatui setup, the render loop, drawing a box with text | Easy | 30 min |
| 16 | The Review Screen | Full-screen card display — front side, flip animation, back side, grade buttons | Medium | 50 min |
| 17 | Session Flow | Review queue, progress bar, cards remaining, session timer | Medium | 40 min |
| 18 | The Dashboard | Deck list, cards due per deck, total reviews today, current streak | Medium | 45 min |
| 19 | The Heatmap | GitHub-style contribution heatmap showing review activity over the past year | Medium | 45 min |
| 20 | Deck Statistics | Retention rate, card maturity distribution, average interval, forecast (cards due next 30 days) | Medium | 40 min |
| 21 | Card Browser | Searchable card list, sort by due date/difficulty/stability, edit cards inline | Hard | 50 min |

### [[Act 4 - The Collection]] — Import, Export, and Card Types (Stages 22-26)

Make Runa practical: import cards from CSV, support cloze deletion cards, tag-based filtering, and deck export.

| # | Stage | Concept | Difficulty | ~Time |
|---|---|---|---|---|
| 22 | CSV Import | Parse CSV files into cards — configurable column mapping, duplicate detection | Medium | 40 min |
| 23 | Cloze Deletion | Cards with blanks: "The capital of France is {{Paris}}" → "The capital of France is ___" | Medium | 35 min |
| 24 | Tags and Filters | Tag cards, filter review sessions by tag, tag-based statistics | Medium | 35 min |
| 25 | Markdown Cards | Render markdown in card content — bold, code, lists — using ratatui styled text | Medium | 40 min |
| 26 | Export | Export decks to CSV, JSON, or a portable `.runa` archive (ZIP of the deck directory) | Easy | 30 min |

### [[Act 5 - The Sync]] — Merging Knowledge Across Devices (Stages 27-29)

Study on your laptop, continue on your work machine. Runa's sync merges review history and card edits between two copies of a deck, handling conflicts gracefully.

| # | Stage | Concept | Difficulty | ~Time |
|---|---|---|---|---|
| 27 | The Snapshot | Content-hash each card and the review log. Detect what changed since last sync | Medium | 40 min |
| 28 | The Merge | Merge two copies: new cards from both sides, review history union, last-write-wins for edits | Hard | 55 min |
| 29 | Conflict Resolution | Both sides edited the same card differently — present both versions, let the user choose | Medium | 40 min |

### [[Reference Guide]]

FSRS formulas and parameters, ratatui layout patterns, serde JSON/TOML/CSV patterns, date math with chrono, card data model reference, CLI command reference.

---

## Totals

| Act | Stages | Est. Time |
|---|---|---|
| The First Card | 7 | ~3.5 hrs |
| The Algorithm | 7 | ~4.5 hrs |
| The Interface | 7 | ~5 hrs |
| The Collection | 5 | ~3 hrs |
| The Sync | 3 | ~2.5 hrs |
| **Total** | **29** | **~18.5 hrs** |

## Tech Stack

| Crate | Version | Introduced |
|---|---|---|
| serde + serde_json | 1 | Stage 1 |
| toml | 0.8 | Stage 2 |
| clap | 4 | Stage 3 |
| chrono | 0.4 | Stage 5 |
| ratatui | 0.28 | Stage 15 |
| crossterm | 0.28 | Stage 15 |
| csv | 1 | Stage 22 |
| zip | 2 | Stage 26 |

No spaced repetition libraries. The FSRS algorithm is implemented from the paper.

## What You'll Understand After This Course

- How spaced repetition actually works (the math, not just "it shows cards at intervals")
- Why FSRS is better than SM-2 (stability vs ease factor, retrievability modeling)
- How to build a polished TUI with ratatui (layouts, widgets, event handling, animations)
- How to model real-world data (cards, reviews, schedules, statistics)
- How to merge data from multiple sources without a central server
- How to work with dates, durations, and time zones in Rust
- How to parse and generate multiple file formats (JSON, TOML, CSV, ZIP)
