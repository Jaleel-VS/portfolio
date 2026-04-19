# Reference Guide

> *Quick reference for FSRS formulas, ratatui patterns, and Runa's data model.*

---

## FSRS Formulas

### Retrievability (forgetting curve)

```
R(t) = e^(-t / (9 × S))
```

- `t` = days since last review
- `S` = stability (days)
- R = 0.9 when t = S (by definition)

### Initial stability

```
S₀ = w[grade - 1]
```

Default values: Again=0.41, Hard=1.18, Good=3.13, Easy=15.47

### Initial difficulty

```
D₀ = w4 - (grade - 3) × w5
```

Clamped to [1.0, 10.0].

### Stability update (successful review, grade ≥ 2)

```
S' = S × (1 + e^w8 × (11 - D) × S^(-w9) × (e^(w10 × (1-R)) - 1) × hard_penalty × easy_bonus)
```

- `hard_penalty` = w15 if grade=2, else 1.0
- `easy_bonus` = w16 if grade=4, else 1.0

### Stability update (failed review, grade = 1)

```
S' = w11 × D^(-w12) × ((S+1)^w13 - 1) × e^(w14 × (1-R))
```

Clamped to [0.1, S] (never higher than current).

### Difficulty update

```
D' = w6 × D₀ + (1 - w6) × (D - w5 × (grade - 3))
```

Clamped to [1.0, 10.0]. Mean-reverts toward D₀.

### Optimal interval

```
interval = -9 × S × ln(target_R)
```

With target_R = 0.9: interval ≈ 0.95 × S ≈ S.

### Default Parameters (w0–w16)

```
w = [0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651,
     0.0046, 1.5071, 0.1367, 1.0139, 1.9803, 0.0834, 0.3126,
     1.3980, 0.2553, 2.8898]
target_retention = 0.9
```

---

## Data Model

### Card

```json
{
  "id": "uuid-v4",
  "front": "question text",
  "back": "answer text",
  "tags": ["tag1", "tag2"],
  "created_at": "2026-04-19T02:40:00Z",
  "card_type": "Basic",
  "schedule": {
    "Review": {
      "stability": 15.4,
      "difficulty": 4.2,
      "due": "2026-05-04T02:40:00Z",
      "review_count": 5
    }
  }
}
```

### Schedule states

| State | Fields | Meaning |
|-------|--------|---------|
| `New` | none | Never reviewed |
| `Learning { step }` | step count | In initial acquisition |
| `Review { stability, difficulty, due, review_count }` | FSRS state | Long-term scheduling |

### Review event (JSONL)

```json
{"card_id":"uuid","timestamp":"2026-04-19T02:45:00Z","grade":3,"interval_days":3.1}
```

### Deck directory

```
~/.runa/decks/<slug>/
├── deck.toml       ← name, description, created_at
├── cards.json      ← array of Card
└── reviews.jsonl   ← append-only review log
```

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `runa new <name>` | Create a new deck |
| `runa add <deck> -f "front" -b "back" -t "tags"` | Add a card |
| `runa add <deck> --cloze "text with {{blanks}}"` | Add a cloze card |
| `runa cards <deck>` | List cards in a deck |
| `runa decks` | List all decks |
| `runa review <deck>` | Review due cards (CLI mode) |
| `runa review <deck> --tag <tag>` | Review only cards with a specific tag |
| `runa tags <deck>` | List tags with card counts |
| `runa import <deck> <file.csv>` | Import cards from CSV |
| `runa export <deck> --format csv\|archive` | Export deck |
| `runa sync <deck> <remote-path>` | Sync with another copy |
| `runa tui` | Launch the terminal UI |
| `runa stats <deck>` | Show deck statistics |

---

## ratatui Patterns

### Terminal setup/teardown

```rust
enable_raw_mode()?;
stdout().execute(EnterAlternateScreen)?;
let mut terminal = Terminal::new(CrosstermBackend::new(stdout()))?;

// ... render loop ...

disable_raw_mode()?;
stdout().execute(LeaveAlternateScreen)?;
```

### Render loop

```rust
loop {
    terminal.draw(|frame| { /* render widgets */ })?;
    if event::poll(Duration::from_millis(100))? {
        if let Event::Key(key) = event::read()? {
            // handle input
        }
    }
}
```

### Layout

```rust
let chunks = Layout::vertical([
    Constraint::Length(3),   // fixed height
    Constraint::Min(5),     // fill remaining
    Constraint::Percentage(30), // percentage
]).split(frame.area());
```

### Common widgets

```rust
// Text
Paragraph::new("text").alignment(Alignment::Center).block(block)

// Table
Table::new(rows, widths).header(header_row).block(block)

// Progress bar
Gauge::default().ratio(0.5).gauge_style(Style::default().fg(Color::Green))

// Styled text
Span::styled("bold", Style::default().bold())
Span::styled("colored", Style::default().fg(Color::Cyan))
```

---

## Cargo.toml

```toml
[package]
name = "runa"
version = "0.1.0"
edition = "2024"

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1", features = ["v4", "serde"] }
toml = "0.8"
dirs = "5"
clap = { version = "4", features = ["derive"] }
ratatui = "0.28"
crossterm = "0.28"
csv = "1"
zip = "2"
sha1 = "0.10"
```

---

## Grade Scale

| Grade | Key | Meaning | Effect |
|-------|-----|---------|--------|
| Again | 1 | Forgot completely | Reset stability, increase difficulty |
| Hard | 2 | Recalled with effort | Small stability increase, slight difficulty increase |
| Good | 3 | Normal recall | Normal stability increase, no difficulty change |
| Easy | 4 | Instant recall | Large stability increase, decrease difficulty |
