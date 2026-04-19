# Rust Crónica — Reference Guide

> Companion cheat sheet for the Rust Crónica course. Keep this open while building your AI-powered Discord bot. You know Python — this maps those concepts to Rust.

---

## 1. Rust Cheat Sheet

### Variables

| Syntax | Mutability | Scope | Python Equivalent |
|--------|-----------|-------|---------------------|
| `let x = 5;` | Immutable | Block | `x = 5` |
| `let mut x = 5;` | Mutable | Block | `x = 5` |
| `const MAX: u32 = 100;` | Immutable, compile-time | Global/block | `MAX = 100` |
| `static COUNT: u32 = 0;` | Global lifetime, fixed address | Global | Module-level variable |

> **Key difference**: `let` bindings are immutable by default. You must opt *in* to mutation.

### Types

| Rust | Python | Notes |
|------|--------|-------|
| `i32`, `u64`, `f64`, `bool`, `char` | `int`, `float`, `bool`, `str` | Rust has sized numeric types |
| `String` | `str` | Owned, heap-allocated, growable |
| `&str` | — | Borrowed string slice (view into a String or literal) |
| `Vec<T>` | `list` | Growable array |
| `HashMap<K, V>` | `dict` | Key-value store |
| `Option<T>` | `Optional[T]` | `Some(val)` or `None` |
| `Result<T, E>` | — | `Ok(val)` or `Err(e)` — no exceptions in Rust |
| `(i32, String)` | `tuple` | Fixed-size heterogeneous |

**String vs &str rule of thumb**: Own data → `String`. Borrow/view data → `&str`. Function params usually take `&str`, struct fields usually store `String`.

### Ownership (The Big Three Rules)

| Rule | What It Means |
|------|--------------|
| Each value has exactly one owner | Only one variable "owns" heap data at a time |
| When the owner goes out of scope, the value is dropped | Automatic cleanup — no GC, no `free()` |
| Ownership can be transferred (moved) or borrowed | Move = transfer ownership. Borrow = temporary access |

| Operation | Syntax | Effect |
|-----------|--------|--------|
| Move | `let b = a;` | `a` is invalid after this (for non-Copy types) |
| Copy | `let b = a;` | Both valid (only for `Copy` types: integers, bool, char, `&T`) |
| Immutable borrow | `let r = &a;` | Read-only reference. Many allowed simultaneously |
| Mutable borrow | `let r = &mut a;` | Read-write reference. Only ONE at a time, no other borrows |

```rust
let s1 = String::from("hello");
let s2 = s1;          // s1 is MOVED — can't use s1 anymore
let s3 = s2.clone();  // explicit deep copy — both s2 and s3 valid
```

> **Python mental model**: Everything in Python is reference-counted behind the scenes. In Rust, YOU decide: move it, clone it, or borrow it.

### Pattern Matching

```rust
// match — exhaustive, like a supercharged switch
match status {
    Status::Active => println!("active"),
    Status::Idle(duration) => println!("idle for {duration}s"),
    _ => println!("other"),
}

// if let — when you only care about one variant
if let Some(val) = maybe_value { use(val); }

// while let — loop until pattern stops matching
while let Some(item) = iter.next() { process(item); }
```

| Rust | Python |
|------|--------|
| `match x { ... }` | `match x:` (3.10+) |
| `if let Some(v) = opt` | `if (v := opt) is not None` |

### Error Handling

| Pattern | When to Use |
|---------|------------|
| `result?` | Propagate error to caller (most common) |
| `result.unwrap()` | Crash if Err — prototyping only |
| `result.expect("msg")` | Crash with message — slightly better than unwrap |
| `result.unwrap_or(default)` | Fallback value |
| `result.map(f)` | Transform Ok value |
| `result.and_then(f)` | Chain operations that return Result |

```rust
// The ? operator — returns early with Err if the result is Err
let data = std::fs::read_to_string("file.txt")?;
let parsed: Config = serde_json::from_str(&data)?;
```

> **Python equivalent**: `?` replaces `try/except` — but it's checked at compile time. You can't forget to handle an error.

### Structs and Enums

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
struct Character {
    name: String,
    hp: i32,
    class: CharClass,
}

#[derive(Debug, Clone)]
enum CharClass {
    Warrior,
    Mage { school: String },  // variant with named fields
    Rogue(i32),               // variant with positional data
}

impl Character {
    fn new(name: &str) -> Self { Self { name: name.into(), hp: 100, class: CharClass::Warrior } }
    fn is_alive(&self) -> bool { self.hp > 0 }
    fn take_damage(&mut self, dmg: i32) { self.hp -= dmg; }
}
```

| Rust | Python |
|------|--------|
| `struct` | `@dataclass` |
| `enum` (with data) | `Enum` + union types |
| `impl` block | methods in class body |
| `#[derive(...)]` | `@dataclass` decorators |

### Traits

```rust
trait Rollable {
    fn roll(&self) -> i32;
    fn describe(&self) -> String { format!("a rollable thing") } // default impl
}
impl Rollable for Dice { fn roll(&self) -> i32 { /* ... */ } }
```

| Common Trait | Purpose | Python Equivalent |
|-------------|---------|---------------------|
| `Debug` | `{:?}` formatting | `__repr__` |
| `Display` | `{}` formatting | `__str__` |
| `Clone` | Explicit deep copy | `copy.deepcopy()` |
| `Copy` | Implicit bitwise copy | Value types (int, bool) |
| `Serialize` / `Deserialize` | serde JSON/etc | `json.dumps` / `json.loads` |
| `Default` | Zero/empty value | Default constructor |
| `From<T>` / `Into<T>` | Type conversion | `__init__` overloads |

### Closures and Iterators

```rust
let names: Vec<String> = characters.iter()
    .filter(|c| c.is_alive())
    .map(|c| c.name.clone())
    .collect();
```

| Rust | Python |
|------|--------|
| `.iter().map(f)` | `map(f, list)` |
| `.filter(f)` | `filter(f, list)` |
| `.collect::<Vec<_>>()` | `list(...)` |
| `.for_each(f)` | `for x in list` |
| `.find(f)` | `next(x for x in ...)` |
| `.any(f)` / `.all(f)` | `any()` / `all()` |
| `\|x\| x + 1` | `lambda x: x + 1` |

### Async/Await

```rust
// Tokio is the runtime — Rust has no built-in async runtime
#[tokio::main]
async fn main() { let result = fetch_data().await; }

// Spawn concurrent tasks
let handle = tokio::spawn(async { do_work().await });

// Select first to complete
tokio::select! {
    val = future_a => println!("a finished: {val:?}"),
    val = future_b => println!("b finished: {val:?}"),
}
```

| Rust | Python |
|------|--------|
| `async fn` / `.await` | `async def` / `await` |
| `tokio::spawn()` | `asyncio.create_task()` |
| `tokio::select!` | `asyncio.wait(FIRST_COMPLETED)` |
| `tokio::join!` | `asyncio.gather()` |

> **Key difference**: Rust futures are lazy — they do nothing until `.await`ed. Python futures start immediately.

### Lifetimes

Lifetimes tell the compiler how long references are valid. Most of the time, elision rules handle it automatically.

**When you need explicit lifetimes:**
- Function returns a reference derived from an input
- Struct stores a reference

```rust
// "The returned &str lives as long as input s"
fn first_word<'a>(s: &'a str) -> &'a str { &s[..s.find(' ').unwrap_or(s.len())] }

// Struct holding a reference
struct Quest<'a> { description: &'a str }
```

**Elision rules** (compiler infers these automatically):
1. Each input reference gets its own lifetime
2. If there's exactly one input lifetime, output gets that lifetime
3. If one input is `&self` or `&mut self`, output gets `self`'s lifetime

> **Rule of thumb**: If the compiler asks for lifetimes, add `'a`. If your struct owns its data (uses `String` not `&str`), you don't need lifetimes.

### Smart Pointers

| Type | Purpose | Thread-safe? | Python Equivalent |
|------|---------|-------------|---------------------|
| `Box<T>` | Heap allocation, single owner | N/A (single owner) | Default in Python (everything is heap) |
| `Rc<T>` | Reference counting, multiple owners | No | Python's default ref counting |
| `Arc<T>` | Atomic ref counting | Yes | Shared references across workers |
| `RefCell<T>` | Interior mutability (runtime borrow check) | No | Mutable object behind immutable ref |
| `Mutex<T>` | Mutual exclusion lock | Yes | `threading.Lock` |
| `RwLock<T>` | Read-write lock (many readers OR one writer) | Yes | `ReadWriteLock` pattern |

**Common combo**: `Arc<Mutex<T>>` — shared mutable state across async tasks (like your bot's game state).

```rust
let state = Arc::new(Mutex::new(GameState::new()));
let state_clone = Arc::clone(&state);
tokio::spawn(async move { state_clone.lock().await.update(); });
```

---

## 2. Poise / Serenity Quick Reference

### Framework Setup

```rust
type Error = Box<dyn std::error::Error + Send + Sync>;
type Context<'a> = poise::Context<'a, Data, Error>;
struct Data { db: SqlitePool, bedrock: BedrockClient }

#[tokio::main]
async fn main() {
    let framework = poise::Framework::builder()
        .options(poise::FrameworkOptions {
            commands: vec![quest(), roll(), character()],
            ..Default::default()
        })
        .setup(|ctx, _ready, framework| Box::pin(async move {
            poise::builtins::register_globally(ctx, &framework.options().commands).await?;
            Ok(Data { db: init_db().await?, bedrock: init_bedrock()? })
        }))
        .build();
    // ... client.start().await
}
```

### Slash Commands

```rust
/// Start a new quest adventure
#[poise::command(slash_command)]
async fn quest(
    ctx: Context<'_>,
    #[description = "Quest theme"] theme: Option<String>,
) -> Result<(), Error> {
    ctx.defer().await?;  // for long operations (>3s)
    ctx.say("Quest started!").await?;
    Ok(())
}
```

### Embeds, Buttons, and Components

```rust
// Embed
let embed = CreateEmbed::new()
    .title("Quest Log").description("Your adventure begins...")
    .color(0x00ff00).field("HP", "100/100", true);

// Buttons
let buttons = CreateActionRow::Buttons(vec![
    CreateButton::new("attack").label("⚔️ Attack").style(ButtonStyle::Primary),
    CreateButton::new("defend").label("🛡️ Defend").style(ButtonStyle::Secondary),
]);
let reply = CreateReply::default().embed(embed).components(vec![buttons]);
ctx.send(reply).await?;
```

### Collecting Component Interactions

```rust
let msg = ctx.send(reply).await?.into_message().await?;
let interaction = msg.await_component_interaction(ctx.serenity_context().shard.clone())
    .timeout(Duration::from_secs(60))
    .author_id(ctx.author().id)
    .await;
match interaction {
    Some(press) => {
        press.create_response(ctx, CreateInteractionResponse::UpdateMessage(
            CreateInteractionResponseMessage::new().content("You attacked!")
        )).await?;
    }
    None => { msg.edit(ctx, EditMessage::new().content("Timed out")).await?; }
}
```

### Common Patterns

| Pattern | Code |
|---------|------|
| Defer (thinking...) | `ctx.defer().await?;` |
| Ephemeral response | `ctx.send(CreateReply::default().content("secret").ephemeral(true)).await?;` |
| Edit original | `ctx.send(CreateReply::default().content("updated")).await?;` |
| Get user data | `ctx.data()` returns `&Data` |
| Author info | `ctx.author().name`, `ctx.author().id` |

---

## 3. AWS Bedrock API Patterns

### Converse API (via aws-sdk-bedrockruntime)

```rust
let client = aws_sdk_bedrockruntime::Client::new(&aws_config::load_defaults(BehaviorVersion::latest()).await);
let resp = client.converse()
    .model_id("us.anthropic.claude-3-5-haiku-20241022-v1:0")
    .system(SystemContentBlock::Text("You are a quest narrator.".into()))
    .messages(Message::builder()
        .role(ConversationRole::User)
        .content(ContentBlock::Text("Begin the quest".into()))
        .build()?)
    .send().await?;
let text = resp.output().as_message().unwrap().content()[0].as_text().unwrap();
```

### Model Selection

| Model | ID | Input/1M | Output/1M | Best For |
|-------|----|----------|-----------|----------|
| Haiku 3.5 | `us.anthropic.claude-3-5-haiku-20241022-v1:0` | $0.80 | $4.00 | Narration, quick responses |
| Sonnet 3.5 v2 | `us.anthropic.claude-3-5-sonnet-20241022-v2:0` | $3.00 | $15.00 | Complex reasoning, structured output |

**Cost estimate per quest session** (~20 exchanges, ~800 tokens/exchange avg):
- Haiku: ~$0.01–0.03 per session
- Sonnet: ~$0.05–0.12 per session

### Structured JSON Output

```rust
// In system prompt: "Respond with JSON: {\"action\": string, \"damage\": number, \"narrative\": string}"
// Then parse:
let action: QuestAction = serde_json::from_str(text)?;
```

### Error Handling

| Error | Cause | Handling |
|-------|-------|---------|
| `ThrottlingException` | Rate limit | Retry with exponential backoff |
| `ModelTimeoutException` | Slow response | Retry once, then fallback message |
| `ValidationException` | Bad input format | Log and return user-friendly error |
| `AccessDeniedException` | Missing IAM permissions | Check IAM policy, model access |

---

## 4. Dice Math Reference

### d20 Probability Table (Success % = (21 − DC + modifier) × 5)

| DC | Mod −1 | Mod +0 | Mod +1 | Mod +2 | Mod +3 | Mod +4 |
|----|--------|--------|--------|--------|--------|--------|
| 8 | 60% | 65% | 70% | 75% | 80% | 85% |
| 10 | 50% | 55% | 60% | 65% | 70% | 75% |
| 12 | 40% | 45% | 50% | 55% | 60% | 65% |
| 14 | 30% | 35% | 40% | 45% | 50% | 55% |
| 16 | 20% | 25% | 30% | 35% | 40% | 45% |
| 18 | 10% | 15% | 20% | 25% | 30% | 35% |

### Combat Margin Bands

Margin = (attacker roll + mod) − (defender roll + mod)

| Margin | Result | Probability (equal mods) |
|--------|--------|------------------------|
| ≥ 10 | Crushing hit (2× damage) | ~10% |
| 5–9 | Clean hit (full damage) | ~22% |
| 1–4 | Mixed (half damage each) | ~20% |
| 0 | Clash (no damage) | ~5% |
| −1 to −4 | Mixed (half damage each) | ~20% |
| ≤ −5 | Defender wins | ~23% |

### Expected Damage Per Exchange

| Weapon Die | Avg Roll | Expected Damage (clean hit) | Expected per Exchange (all outcomes) |
|-----------|----------|---------------------------|-------------------------------------|
| d4 | 2.5 | 2.5 | ~1.1 |
| d6 | 3.5 | 3.5 | ~1.5 |
| d8 | 4.5 | 4.5 | ~2.0 |
| d10 | 5.5 | 5.5 | ~2.4 |
| d12 | 6.5 | 6.5 | ~2.9 |

### Fortune Token Value

| Use | Expected Value |
|-----|---------------|
| Reroll a failed d20 | +25% success chance on that check (avg) |
| Turn the Tide (auto-succeed) | Guaranteed success — save for DC 16+ checks |
| Reroll damage | +~30% damage increase (diminishing on larger dice) |

**Rule of thumb**: Turn the Tide on DC 16+ saves. Reroll on DC 12–15 failures. Don't spend on DC ≤ 10.

### Stat Allocation Optimizer (10 points across 4 stats, 0–4 each)

| Build | Stats | Talents Covered Well (≥+2) | Best For |
|-------|-------|---------------------------|----------|
| Specialist | 4/3/2/1 | 2 strong, 1 decent | Min-max, one role |
| Balanced | 3/3/2/2 | 2 strong, 2 decent | Versatile |
| Generalist | 3/2/3/2 | All decent, none dominant | Jack of all trades |
| Dual-focus | 4/4/1/1 | 2 dominant | Two-pillar builds |

---

## 5. Cargo Commands

### Essential Commands

| Command | Purpose | Frequency |
|---------|---------|-----------|
| `cargo new project_name` | Create new project | Once |
| `cargo build` | Compile (debug) | Often |
| `cargo build --release` | Compile (optimized) | Deploy |
| `cargo run` | Build + run | Development |
| `cargo test` | Run all tests | Before commit |
| `cargo check` | Type-check without building (fast) | Constantly |
| `cargo clippy` | Lint (catches common mistakes) | Before commit |
| `cargo fmt` | Auto-format code | Before commit |
| `cargo doc --open` | Generate + open docs | Reference |

### Dependencies

```toml
# cargo add serde --features derive
# cargo add tokio --features full
[dependencies]
serde = { version = "1", features = ["derive"] }
tokio = { version = "1", features = ["full"] }
```

### Feature Flags

```toml
[features]
default = ["sqlite"]
sqlite = ["dep:rusqlite"]
postgres = ["dep:sqlx"]
```

```bash
cargo build --features "sqlite"
cargo build --no-default-features --features "postgres"
```

### Useful Plugins

| Plugin | Install | Purpose |
|--------|---------|---------|
| `cargo-watch` | `cargo install cargo-watch` | Auto-rebuild on save: `cargo watch -x run` |
| `cargo-expand` | `cargo install cargo-expand` | See macro expansion |
| `cargo-edit` | (built-in now) | `cargo add/rm` dependencies |
| `cargo-nextest` | `cargo install cargo-nextest` | Faster test runner |

---

## 6. SQLite with rusqlite Patterns

### Connection Setup

```rust
use rusqlite::Connection;
let conn = Connection::open("game.db")?;
conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
```

### Queries

```rust
// Execute (INSERT/UPDATE/DELETE) — returns rows affected
conn.execute("INSERT INTO characters (name, hp) VALUES (?1, ?2)", params!["Aria", 100])?;

// Named parameters
conn.execute("UPDATE characters SET hp = :hp WHERE name = :name",
    named_params! { ":hp": 80, ":name": "Aria" })?;

// Query single row
let hp: i32 = conn.query_row(
    "SELECT hp FROM characters WHERE name = ?1", params!["Aria"], |row| row.get(0))?;

// Query multiple rows
let mut stmt = conn.prepare("SELECT name, hp FROM characters WHERE hp > ?1")?;
let chars: Vec<(String, i32)> = stmt.query_map(params![0], |row| {
    Ok((row.get(0)?, row.get(1)?))
})?.collect::<Result<_, _>>()?;
```

### Transactions

```rust
let tx = conn.transaction()?;
tx.execute("UPDATE characters SET hp = hp - 10 WHERE name = ?1", params!["Aria"])?;
tx.execute("INSERT INTO combat_log (event) VALUES (?1)", params!["Aria took damage"])?;
tx.commit()?;  // or tx.rollback() — also auto-rollbacks on drop
```

### Type Mappings

| Rust Type | SQLite Type | Notes |
|-----------|------------|-------|
| `i32`, `i64` | INTEGER | |
| `f64` | REAL | |
| `String`, `&str` | TEXT | |
| `Vec<u8>` | BLOB | Binary data |
| `bool` | INTEGER | 0/1 |
| `Option<T>` | nullable | `None` ↔ `NULL` |
| `serde_json::Value` | TEXT | Store as JSON string |

---

> **Quick debug checklist**: Won't compile? → Read the error message carefully, Rust errors are excellent. Borrow checker angry? → Try `.clone()` first, optimize later. Async issue? → Make sure you're `.await`ing. Type mismatch? → Check `String` vs `&str`, `Vec` vs slice.
