# Act 1 — Unsealing the Crypt

> *"Before a vault can guard your secrets, it must first be built from stone and steel. Before steel, there is the foundation."*

Welcome, adventurer. You're about to build **Ironvault** — a secure CLI password manager written in Rust. By the end of this course, you'll have a tool that encrypts your credentials with AES-256-GCM, derives keys with Argon2id, checks passwords against breach databases, and generates cryptographically secure passwords — all from your terminal.

But first, we lay the foundation stones.

**Act 1** covers Stages 1–7: project setup, data modeling, file I/O, the CLI skeleton, and atomic writes. No encryption yet — that comes in Act 2 when we forge the Master Key. Think of Act 1 as building the vault's walls and shelves before we install the lock.

**What you'll build by the end of Act 1:**
- A working CLI tool (`iv`) that stores and retrieves password entries
- JSON serialization/deserialization of a vault data structure
- File I/O with proper error handling
- Atomic file writes that survive crashes
- A full CRUD interface: add, get, list, edit, delete

**Prerequisites:**
- Rust installed (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)
- A terminal (Ghostty, iTerm2, whatever you like)
- A text editor (nvim, VS Code, Zed — anything works)
- Familiarity with Python or TypeScript (we'll compare constantly)

**RPG Glossary:**

| RPG Term | Real Meaning |
|----------|-------------|
| Relic | A password entry (credentials for one service) |
| Chamber | A category (e.g., "Work", "Finance", "Social") |
| The Vault | The encrypted file on disk |
| The Master Key | Your master password |
| Forging | Generating a new password |

**Design Spec Reference:** This course implements the architecture described in the [Ironvault Design Spec](Ironvault%20Design%20Spec.md). We'll reference specific sections as we go.

---

## Stage 1 — The Foundation Stone

Before you can seal a single secret, you need a vault that compiles. This stage exists because every cryptographic guarantee, every atomic write, every secure memory wipe you'll build later depends on a working Rust toolchain. If the foundation stone is cracked, the entire fortress crumbles.

> *"Every great vault begins with a single stone. Yours begins with `cargo new`."*

**Difficulty:** Very Easy
**Concepts introduced:** Cargo, crates, `main.rs`, `println!`, `Cargo.toml`
**Time estimate:** 10 minutes

### What We're Building

A Rust project that compiles and prints a greeting. That's it. If you've never written Rust before, this is where you prove your toolchain works.

### Step 1: Create the Project

Open your terminal and run:

```bash
cargo new ironvault
cd ironvault
```

`cargo new` creates a new Rust project. It generates two things:

```
ironvault/
├── Cargo.toml    # Project manifest (like package.json or pyproject.toml)
└── src/
    └── main.rs   # Entry point (like if __name__ == "__main__" or index.ts)
```

**Python comparison:**
| Python | Rust |
|--------|------|
| `pyproject.toml` | `Cargo.toml` |
| `pip install requests` | `cargo add reqwest` |
| `python main.py` | `cargo run` |
| PyPI | crates.io |

**TypeScript comparison:**
| TypeScript | Rust |
|------------|------|
| `package.json` | `Cargo.toml` |
| `npm install` | `cargo build` |
| `npx ts-node index.ts` | `cargo run` |
| npm registry | crates.io |

### Step 2: Look at What Cargo Generated

Open `Cargo.toml`:

```toml
[package]
name = "ironvault"
version = "0.1.0"
edition = "2021"

[dependencies]
```

- `name` — your crate's name (Rust calls packages "crates")
- `version` — semver, just like npm
- `edition` — which Rust edition to use (2021 is current stable; 2024 exists but we'll stick with 2021 for broad compatibility)
- `[dependencies]` — where your external crates go (empty for now)

Open `src/main.rs`:

```rust
fn main() {
    println!("Hello, world!");
}
```

Let's break this down:

- `fn main()` — the entry point. Every Rust binary has exactly one `main` function. Like Python's `if __name__ == "__main__"` but enforced by the compiler.
- `println!` — a **macro** (note the `!`). It prints to stdout with a newline. The `!` means it's a macro, not a regular function. Macros can do things functions can't — like accept a variable number of arguments. For now, just think of it as `print()` in Python or `console.log()` in JS.
- `"Hello, world!"` — a **string literal**. In Rust, string literals are `&str` (a reference to a string slice). We'll talk about `String` vs `&str` in Stage 2.

### Step 3: Replace the Greeting

Replace the contents of `src/main.rs` with:

```rust
fn main() {
    println!("⚔️ Ironvault v0.1.0 — Your relics are safe.");
}
```

### Step 4: Run It

```bash
cargo run
```

You should see:

```
   Compiling ironvault v0.1.0 (/path/to/ironvault)
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.50s
     Running `target/debug/ironvault`
⚔️ Ironvault v0.1.0 — Your relics are safe.
```

`cargo run` does two things: compiles your code (`cargo build`) and then runs the resulting binary. The binary lives at `target/debug/ironvault`.

### Step 5: Prepare Cargo.toml for the Journey Ahead

Right now we have a bare project with no external libraries — we can't serialize data, parse CLI arguments, or encrypt anything. The Rust ecosystem solves this through crates, and we'll need quite a few before the vault is complete.

We'll need several crates throughout this course. Let's add them all now but **commented out** — we'll uncomment them as we need them. This way you can see the full dependency map upfront.

Replace your `Cargo.toml` with:

```toml
[package]
name = "ironvault"
version = "0.1.0"
edition = "2021"

[dependencies]
# Stage 2: Serialization
# serde = { version = "1", features = ["derive"] }
# serde_json = "1"

# Stage 3: Timestamps
# chrono = { version = "0.4", features = ["serde"] }

# Stage 5: CLI framework
# clap = { version = "4", features = ["derive"] }

# Act 2: Encryption & security (coming later)
# aes-gcm = "0.10"
# argon2 = "0.5"
# rand = "0.8"
# zeroize = { version = "1", features = ["derive"] }
# secrecy = "0.10"
# rpassword = "7"

# Act 3: Clipboard, TOTP, breach check (coming later)
# arboard = "3"
# totp-rs = "5"
# ureq = "2"
# sha1 = "0.10"
```

Run `cargo run` again to make sure it still compiles. Comments in TOML use `#`, same as Python.

With the toolchain proven and the dependency map laid out, you're ready to define the core data type that every vault operation revolves around — the Relic.

### Checkpoint Code

Your project should look like this:

**`Cargo.toml`:**
```toml
[package]
name = "ironvault"
version = "0.1.0"
edition = "2021"

[dependencies]
# (all commented out — we'll enable them stage by stage)
```

**`src/main.rs`:**
```rust
fn main() {
    println!("⚔️ Ironvault v0.1.0 — Your relics are safe.");
}
```

**Run:** `cargo run` → prints the greeting.

### What to Try

1. Change the version to `0.2.0` in `Cargo.toml` and run `cargo run` again. Notice it recompiles — Cargo tracks changes.
2. Try `cargo build --release` — this creates an optimized binary at `target/release/ironvault`. Run it directly: `./target/release/ironvault`.
3. Try `println!("Relics stored: {}", 42);` — the `{}` is a format placeholder, like Python's f-string `f"Relics stored: {42}"`.

### Common Mistakes

**Forgetting the `!` in `println`:**
```rust
println("oops");  // ❌ error[E0423]: expected function, found macro `println`
```
`println` is a macro, not a function. Always use `println!` with the bang.

**Missing semicolon:**
```rust
fn main() {
    println!("hello")  // ❌ error: expected `;`
}
```
Rust requires semicolons at the end of statements. Unlike JavaScript, this is not optional.

**Wrong quotes:**
```rust
println!('hello');  // ❌ error: character literal may only contain one codepoint
```
Single quotes are for single characters (`char`). Strings always use double quotes.

---

## Stage 2 — The Relic

A password manager without a data model is just a text file. This stage solves the fundamental question: *what exactly is a credential?* By defining the `Relic` struct, you give the compiler a contract — every credential must have a name, a username, a password, and metadata. Miss a field, and the code won't compile. That's the kind of guarantee Python's dictionaries will never give you.

> *"A relic is more than a name and a password. It carries the memory of where it was forged, what chamber it belongs to, and when it last saw the light."*

**Difficulty:** Easy
**Concepts introduced:** Structs, derive macros, `String` vs `&str`, `Option<T>`, serde serialization
**Time estimate:** 20 minutes
**Spec reference:** The Relic struct captures every field a credential needs — identity (name, username), the secret (password), context (URL, chamber, tags, notes), and audit trail (timestamps). Each field type is chosen deliberately: `String` for required fields, `Option<String>` for optional ones, `Vec<String>` for multi-value tags.

### What We're Building

A `Relic` struct — the core data type of Ironvault. Each relic represents one set of credentials (like a single entry in 1Password or Bitwarden). We'll define it, create one in `main`, and print it as pretty JSON.

### Step 1: Enable serde and serde_json

In `Cargo.toml`, uncomment the serialization dependencies:

```toml
[dependencies]
# Stage 2: Serialization
serde = { version = "1", features = ["derive"] }
serde_json = "1"

# Stage 3: Timestamps
# chrono = { version = "0.4", features = ["serde"] }
# ... rest stays commented
```

- `serde` is Rust's serialization framework. The `"derive"` feature enables `#[derive(Serialize, Deserialize)]` — magic that auto-generates serialization code at compile time.
- `serde_json` is the JSON format implementation for serde. It provides `to_string_pretty()` and `from_str()`.

Run `cargo build` to download and compile the new dependencies. First build with new deps takes a moment — subsequent builds are fast because Cargo caches compiled crates.

**Python comparison:**
```python
# Python: you write json.dumps() and json.loads() manually
import json
json.dumps({"name": "GitHub"}, indent=2)

# Rust: serde generates the serialization code from your struct definition
// Just add #[derive(Serialize)] and call serde_json::to_string_pretty()
```

### Step 2: Define the Relic Struct

Right now we have a project that prints a greeting but can't represent a single credential. We need a structured type that captures everything about a password entry — name, username, password, optional URL, category, tags, and timestamps — and can be serialized to JSON for storage.

Replace `src/main.rs` with:

```rust
use serde::{Deserialize, Serialize};

/// A single credential entry — an RPG "relic".
///
/// Each relic stores the credentials for one service (GitHub, AWS Console, etc.).
/// Fields like `url`, `notes`, and `tags` are optional — not every relic needs them.
#[derive(Debug, Serialize, Deserialize)]
struct Relic {
    /// Unique identifier — 8-char hex string, generated on creation
    id: String,
    /// Display name (e.g., "GitHub", "AWS Console")
    name: String,
    /// Login username or email
    username: String,
    /// The secret password
    password: String,
    /// Optional URL for the service
    url: Option<String>,
    /// Which chamber (category) this relic belongs to
    chamber: String,
    /// Freeform tags for searching
    tags: Vec<String>,
    /// Optional notes
    notes: Option<String>,
    /// When this relic was created (ISO 8601 string for now — we'll use chrono in Stage 3)
    created_at: String,
    /// When this relic was last modified
    updated_at: String,
}

fn main() {
    let relic = Relic {
        id: String::from("a1b2c3d4"),
        name: String::from("GitHub"),
        username: String::from("adventurer@example.com"),
        password: String::from("hunter2"),
        url: Some(String::from("https://github.com")),
        chamber: String::from("Armory"),
        tags: vec![String::from("dev"), String::from("git")],
        notes: Some(String::from("Personal account. 2FA enabled.")),
        created_at: String::from("2026-04-18T15:00:00Z"),
        updated_at: String::from("2026-04-18T15:00:00Z"),
    };

    // Serialize to pretty JSON and print
    let json = serde_json::to_string_pretty(&relic).unwrap();
    println!("{}", json);
}
```

That's a lot of new syntax. Let's break it all down.

### Concept: Structs

```rust
struct Relic {
    id: String,
    name: String,
    // ...
}
```

A struct is Rust's equivalent of a Python `@dataclass` or a TypeScript `interface` (but with actual data storage). Each field has a name and a type.

**Python comparison:**
```python
@dataclass
class Relic:
    id: str
    name: str
    username: str
    password: str
    url: Optional[str]
    chamber: str
    tags: list[str]
    notes: Optional[str]
    created_at: str
    updated_at: str
```

Almost identical! The key differences:
- Rust uses `String` where Python uses `str`
- Rust uses `Option<String>` where Python uses `Optional[str]`
- Rust uses `Vec<String>` where Python uses `list[str]`

### Concept: `String` vs `&str`

This is the first Rust concept that trips up every newcomer. Rust has **two** string types:

| Type | What it is | Owns the data? | Mutable? | Python equivalent |
|------|-----------|----------------|----------|-------------------|
| `String` | Heap-allocated, growable string | Yes | Yes | `str` (Python strings are always heap-allocated) |
| `&str` | Borrowed reference to string data | No | No | A read-only view into a string |

- `"hello"` is a `&str` — it's a string literal baked into the binary.
- `String::from("hello")` creates a `String` — it copies the data to the heap.
- `.to_string()` and `.to_owned()` also convert `&str` → `String`.

**Why does Rust have both?** Performance and safety. `&str` is a lightweight reference — no allocation, no copying. `String` owns its data and can be moved, stored in structs, and modified. In Python, you never think about this because the garbage collector handles it. In Rust, you choose.

**Rule of thumb for beginners:** Use `String` in struct fields. Use `&str` in function parameters when you just need to read the string.

### Concept: `Option<T>`

```rust
url: Option<String>,
```

`Option<T>` is Rust's way of saying "this value might not exist." It's an enum with two variants:

```rust
enum Option<T> {
    Some(T),    // There's a value
    None,       // There's no value
}
```

**Python comparison:** `Optional[str]` in type hints, but Python doesn't enforce it — you can still pass `None` where `str` is expected. Rust enforces it at compile time. If a field is `Option<String>`, you **must** handle the `None` case. If it's `String`, it's guaranteed to have a value.

**TypeScript comparison:** `string | undefined`, but enforced by the compiler, not just the type checker.

When creating a relic:
```rust
url: Some(String::from("https://github.com")),  // has a value
notes: None,                                       // no value
```

### Concept: `Vec<T>`

```rust
tags: Vec<String>,
```

`Vec<T>` is a growable array. Like Python's `list` or JavaScript's `Array`.

```rust
// Create with the vec! macro (like a list literal)
let tags = vec![String::from("dev"), String::from("git")];

// Or create empty and push
let mut tags = Vec::new();
tags.push(String::from("dev"));
```

### Concept: Derive Macros

```rust
#[derive(Debug, Serialize, Deserialize)]
struct Relic { ... }
```

`#[derive(...)]` tells the Rust compiler to auto-generate trait implementations. Think of traits as interfaces (TypeScript) or protocols (Python).

| Derive | What it does | Python equivalent |
|--------|-------------|-------------------|
| `Debug` | Enables `{:?}` formatting for printing | `__repr__` |
| `Serialize` | Generates code to convert struct → JSON (or any format) | `json.dumps()` support |
| `Deserialize` | Generates code to convert JSON → struct | `json.loads()` support |

Without `#[derive(Serialize)]`, you'd have to write the serialization code by hand — hundreds of lines for a struct this size. The derive macro generates it at compile time with zero runtime cost.

### Concept: `serde_json::to_string_pretty()`

```rust
let json = serde_json::to_string_pretty(&relic).unwrap();
```

- `serde_json::to_string_pretty(&relic)` — serializes the relic to a pretty-printed JSON string. The `&` means we're passing a reference (borrowing), not giving away ownership.
- Returns `Result<String, serde_json::Error>` — it can fail (e.g., if a value can't be represented in JSON).
- `.unwrap()` — extracts the `Ok` value, or panics if it's an `Err`. Fine for now; we'll handle errors properly in Stage 4.

**Python comparison:**
```python
import json
json_str = json.dumps(relic.__dict__, indent=2)
```

### Step 3: Run It

```bash
cargo run
```

Output:

```json
{
  "id": "a1b2c3d4",
  "name": "GitHub",
  "username": "adventurer@example.com",
  "password": "hunter2",
  "url": "https://github.com",
  "chamber": "Armory",
  "tags": [
    "dev",
    "git"
  ],
  "notes": "Personal account. 2FA enabled.",
  "created_at": "2026-04-18T15:00:00Z",
  "updated_at": "2026-04-18T15:00:00Z"
}
```

Notice how `Option<String>` with `Some(...)` serializes as the plain value, and `None` would serialize as `null`. Serde handles this automatically.

A single relic is useful, but a real vault needs organization — chambers to categorize relics, a top-level structure to hold them all, and proper timestamps instead of raw strings. That's what Stage 3 delivers.

### Checkpoint Code

**`Cargo.toml`** — serde and serde_json uncommented.

**`src/main.rs`:**
```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
struct Relic {
    id: String,
    name: String,
    username: String,
    password: String,
    url: Option<String>,
    chamber: String,
    tags: Vec<String>,
    notes: Option<String>,
    created_at: String,
    updated_at: String,
}

fn main() {
    let relic = Relic {
        id: String::from("a1b2c3d4"),
        name: String::from("GitHub"),
        username: String::from("adventurer@example.com"),
        password: String::from("hunter2"),
        url: Some(String::from("https://github.com")),
        chamber: String::from("Armory"),
        tags: vec![String::from("dev"), String::from("git")],
        notes: Some(String::from("Personal account. 2FA enabled.")),
        created_at: String::from("2026-04-18T15:00:00Z"),
        updated_at: String::from("2026-04-18T15:00:00Z"),
    };

    let json = serde_json::to_string_pretty(&relic).unwrap();
    println!("{}", json);
}
```

**Run:** `cargo run` → prints pretty JSON.

### What to Try

1. Set `url` to `None` and run again. See how it becomes `null` in the JSON output.
2. Try `println!("{:?}", relic);` — the `Debug` derive gives you a Rust-formatted dump (not JSON, but useful for debugging).
3. Try adding a field to the struct but not to the constructor — the compiler will tell you exactly which field is missing. This is Rust's exhaustive initialization: you can't forget a field.
4. Try deserializing: add this after the `println`:
   ```rust
   let parsed: Relic = serde_json::from_str(&json).unwrap();
   println!("Parsed relic name: {}", parsed.name);
   ```

### Common Mistakes

**Forgetting `String::from()` for string literals:**
```rust
name: "GitHub",  // ❌ error: expected `String`, found `&str`
```
String literals are `&str`. Struct fields are `String`. You need to convert: `String::from("GitHub")` or `"GitHub".to_string()`.

**Forgetting `Some()` for Option fields:**
```rust
url: "https://github.com",  // ❌ error: expected `Option<String>`, found `&str`
```
Wrap it: `url: Some(String::from("https://github.com"))`.

**Missing derive:**
```rust
struct Relic { ... }  // no #[derive(Serialize)]
serde_json::to_string_pretty(&relic);  // ❌ error: the trait `Serialize` is not implemented for `Relic`
```
The compiler error is clear — add `#[derive(Serialize)]`.

---

## Stage 3 — The Chamber

A flat list of credentials becomes unmanageable the moment you have more than a dozen. This stage introduces the organizational backbone of the vault — chambers for categorization, a top-level `Vault` struct that owns everything, and real timestamps via `chrono` so you can track when relics were created and modified. Without this structure, searching, filtering, and auditing would be impossible.

> *"A vault without chambers is just a pile. The wise adventurer sorts their relics — weapons in the Armory, gold in the Treasury, scrolls in the Library, and the darkest secrets in the Crypt."*

**Difficulty:** Easy
**Concepts introduced:** `HashMap`, nested structs, `chrono::DateTime<Utc>`, the `use` statement
**Time estimate:** 20 minutes
**Spec reference:** The vault's three-layer structure — `Vault` owns `Chamber`s and `Relic`s — mirrors how real password managers organize data. Chambers provide human-meaningful categories, while the flat `relics` Vec keeps serialization simple and search fast.

### What We're Building

The full vault data model: a `Chamber` struct for categories, a `Vault` struct that holds chambers and relics, and proper timestamps using the `chrono` crate instead of raw strings.

### Step 1: Enable chrono

In `Cargo.toml`, uncomment chrono:

```toml
[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"

# Stage 3: Timestamps
chrono = { version = "0.4", features = ["serde"] }
```

The `"serde"` feature on chrono enables automatic serialization of `DateTime<Utc>` to ISO 8601 strings (like `"2026-04-18T15:00:00Z"`). Without this feature, serde wouldn't know how to convert timestamps to/from JSON.

### Step 2: Upgrade Relic with Real Timestamps

Right now we have a single `Relic` struct with string timestamps, but no way to group relics into categories or represent the vault as a whole. We need a `Chamber` struct for organization, a `Vault` struct to hold everything together, and proper `DateTime<Utc>` timestamps instead of raw strings that can't be compared or sorted.

Replace `src/main.rs`:

```rust
use std::collections::HashMap;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Data model (Design Spec §5.1)
// ---------------------------------------------------------------------------

/// A single credential entry — an RPG "relic".
#[derive(Debug, Serialize, Deserialize)]
struct Relic {
    id: String,
    name: String,
    username: String,
    password: String,
    url: Option<String>,
    chamber: String,
    tags: Vec<String>,
    notes: Option<String>,
    created_at: DateTime<Utc>,   // was String — now a real timestamp
    updated_at: DateTime<Utc>,
}

/// A category — an RPG "chamber".
///
/// Chambers organize relics by purpose: Armory for work credentials,
/// Treasury for financial accounts, Library for email/social, Crypt for
/// recovery codes and secrets.
#[derive(Debug, Serialize, Deserialize)]
struct Chamber {
    icon: String,
    description: String,
}

/// The full decrypted vault (Design Spec §4.2).
///
/// In Act 1, this is stored as plaintext JSON. In Act 2, the JSON payload
/// will be encrypted with AES-256-GCM before writing to disk.
#[derive(Debug, Serialize, Deserialize)]
struct Vault {
    version: u8,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    chambers: HashMap<String, Chamber>,
    relics: Vec<Relic>,
}

fn main() {
    let now = Utc::now();

    // Create default chambers (Design Spec §4.2)
    let mut chambers = HashMap::new();
    chambers.insert(
        String::from("Armory"),
        Chamber {
            icon: String::from("⚔️"),
            description: String::from("Work credentials"),
        },
    );
    chambers.insert(
        String::from("Treasury"),
        Chamber {
            icon: String::from("💰"),
            description: String::from("Financial accounts"),
        },
    );
    chambers.insert(
        String::from("Library"),
        Chamber {
            icon: String::from("📜"),
            description: String::from("Email and social"),
        },
    );
    chambers.insert(
        String::from("Crypt"),
        Chamber {
            icon: String::from("💀"),
            description: String::from("Recovery codes and secrets"),
        },
    );

    // Create a vault with one relic
    let vault = Vault {
        version: 1,
        created_at: now,
        updated_at: now,
        chambers,
        relics: vec![Relic {
            id: String::from("a1b2c3d4"),
            name: String::from("GitHub"),
            username: String::from("adventurer@example.com"),
            password: String::from("hunter2"),
            url: Some(String::from("https://github.com")),
            chamber: String::from("Armory"),
            tags: vec![String::from("dev"), String::from("git")],
            notes: Some(String::from("Personal account. 2FA enabled.")),
            created_at: now,
            updated_at: now,
        }],
    };

    let json = serde_json::to_string_pretty(&vault).unwrap();
    println!("{}", json);
}
```

### Concept: `HashMap<K, V>`

```rust
use std::collections::HashMap;

let mut chambers = HashMap::new();
chambers.insert(String::from("Armory"), Chamber { ... });
```

`HashMap` is Rust's dictionary/map type. Like Python's `dict` or JavaScript's `Map`.

| Python | Rust |
|--------|------|
| `chambers = {}` | `let mut chambers = HashMap::new();` |
| `chambers["Armory"] = Chamber(...)` | `chambers.insert(String::from("Armory"), Chamber { ... });` |
| `chambers.get("Armory")` | `chambers.get("Armory")` → returns `Option<&Chamber>` |

Key differences:
- `HashMap` lives in `std::collections`, not in the prelude — you must `use` it.
- `let mut` — the `mut` keyword makes the variable mutable. In Rust, variables are **immutable by default**. If you try to call `.insert()` on a non-`mut` HashMap, the compiler stops you.

**Why immutable by default?** It prevents accidental mutation. In a large codebase, knowing that a variable can't change makes reasoning about code much easier. You opt into mutability explicitly.

### Concept: `chrono::DateTime<Utc>`

```rust
use chrono::{DateTime, Utc};

let now: DateTime<Utc> = Utc::now();
```

- `DateTime<Utc>` is a timestamp in the UTC timezone. The `<Utc>` is a generic parameter — it tells the type system which timezone this datetime uses.
- `Utc::now()` returns the current time. Like Python's `datetime.now(timezone.utc)`.
- With the `serde` feature enabled, `DateTime<Utc>` automatically serializes to ISO 8601: `"2026-04-18T15:00:00.123456789Z"`.

**Python comparison:**
```python
from datetime import datetime, timezone
now = datetime.now(timezone.utc)
now.isoformat()  # "2026-04-18T15:00:00+00:00"
```

### Concept: `use` Statements

```rust
use std::collections::HashMap;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
```

`use` brings items into scope. Like Python's `from X import Y` or TypeScript's `import { Y } from 'X'`.

- `std::collections::HashMap` — from the standard library
- `chrono::{DateTime, Utc}` — from the chrono crate (curly braces import multiple items)
- `serde::{Deserialize, Serialize}` — from the serde crate

Without `use`, you'd write `std::collections::HashMap::new()` everywhere. `use` is just a convenience.

### Concept: `u8`

```rust
version: u8,
```

Rust has explicit integer types:

| Type | Size | Range | Python equivalent |
|------|------|-------|-------------------|
| `u8` | 1 byte | 0–255 | `int` (but Python ints are arbitrary precision) |
| `u16` | 2 bytes | 0–65,535 | `int` |
| `u32` | 4 bytes | 0–4 billion | `int` |
| `u64` | 8 bytes | 0–18 quintillion | `int` |
| `i32` | 4 bytes | -2B to +2B | `int` |
| `usize` | pointer-sized | platform-dependent | `int` |

The `u` means unsigned (no negatives). The number is the bit width. For a version field that will never exceed 255, `u8` is perfect.

### Step 3: Run It

```bash
cargo run
```

Output (timestamps will differ):

```json
{
  "version": 1,
  "created_at": "2026-04-18T15:30:00.123456789Z",
  "updated_at": "2026-04-18T15:30:00.123456789Z",
  "chambers": {
    "Armory": {
      "icon": "⚔️",
      "description": "Work credentials"
    },
    "Treasury": {
      "icon": "💰",
      "description": "Financial accounts"
    },
    "Library": {
      "icon": "📜",
      "description": "Email and social"
    },
    "Crypt": {
      "icon": "💀",
      "description": "Recovery codes and secrets"
    }
  },
  "relics": [
    {
      "id": "a1b2c3d4",
      "name": "GitHub",
      "username": "adventurer@example.com",
      "password": "hunter2",
      "url": "https://github.com",
      "chamber": "Armory",
      "tags": ["dev", "git"],
      "notes": "Personal account. 2FA enabled.",
      "created_at": "2026-04-18T15:30:00.123456789Z",
      "updated_at": "2026-04-18T15:30:00.123456789Z"
    }
  ]
}
```

This matches the Design Spec §4.2 decrypted payload format exactly. The vault is taking shape.

The data model is complete, but it only lives in memory. A vault that vanishes when the process exits is no vault at all — next, we write it to disk and read it back.

### Checkpoint Code

**`Cargo.toml`** — serde, serde_json, and chrono uncommented.

**`src/main.rs`** — the full code from Step 2 above.

**Run:** `cargo run` → prints the full vault JSON with real timestamps.

### What to Try

1. Add a second relic to the `relics` vec. Notice how `Vec` works like a Python list.
2. Try `chambers.get("Armory")` — it returns `Option<&Chamber>`. Print it with `{:?}`.
3. Try accessing a chamber that doesn't exist: `chambers.get("Dungeon")` returns `None`.
4. Note that HashMap order is not guaranteed — the chambers may print in any order. This is the same as Python's `dict` before 3.7.

### Common Mistakes

**Forgetting `mut` on the HashMap:**
```rust
let chambers = HashMap::new();
chambers.insert(...);  // ❌ error: cannot borrow `chambers` as mutable, as it is not declared as mutable
```
Add `mut`: `let mut chambers = HashMap::new();`

**Using `&str` where `String` is expected in HashMap keys:**
```rust
chambers.insert("Armory", Chamber { ... });
// ❌ error: expected `String`, found `&str`
```
HashMap keys are `String` in our struct, so: `chambers.insert(String::from("Armory"), ...)`.

**Forgetting the chrono `serde` feature:**
```toml
chrono = "0.4"  # ❌ Missing serde feature
```
Without `features = ["serde"]`, you'll get: `the trait Serialize is not implemented for DateTime<Utc>`.

---

## Stage 4 — The Scroll

A vault that exists only in memory dies with the process. This stage solves persistence — writing the vault to disk and reading it back — while introducing Rust's error handling philosophy. Every file operation can fail (missing directory, permission denied, corrupted data), and Rust forces you to handle each failure explicitly. The patterns you learn here carry directly into Act 2's encrypted file I/O.

> *"A vault that exists only in memory is no vault at all. The scroll must be written to stone — and read back without corruption."*

**Difficulty:** Medium
**Concepts introduced:** `std::fs`, `Result<T, E>`, the `?` operator, `PathBuf`, `dirs::home_dir()`, error handling
**Time estimate:** 30 minutes

### What We're Building

File I/O: writing the vault JSON to `~/.ironvault/vault.json` and reading it back. We'll handle missing directories, missing files, and malformed JSON — all with proper error messages instead of panics.

**Important note:** In Act 1, the vault is stored as **plaintext JSON**. This is intentional — we need to see and debug the data while building the CRUD operations. Storing plaintext now lets us verify that serialization, file I/O, and the data model all work correctly before we add the complexity of encryption. In Act 2, we'll replace this plaintext file with AES-256-GCM encrypted binary. The file I/O patterns we learn here carry over directly.

### Step 1: Understand `Result<T, E>`

Before we write file code, we need to understand Rust's error handling. This is the biggest conceptual shift from Python.

In Python, errors are exceptions — they fly up the call stack until someone catches them:

```python
try:
    data = open("vault.json").read()
except FileNotFoundError:
    print("No vault found")
```

In Rust, errors are **values**. Functions that can fail return `Result<T, E>`:

```rust
enum Result<T, E> {
    Ok(T),    // Success — contains the value
    Err(E),   // Failure — contains the error
}
```

You must handle the result explicitly. The compiler won't let you ignore it.

```rust
// This returns Result<String, std::io::Error>
let content = std::fs::read_to_string("vault.json");

match content {
    Ok(text) => println!("Got: {}", text),
    Err(e) => println!("Error: {}", e),
}
```

**The `?` operator** is Rust's shorthand for "if this is an error, return it to the caller":

```rust
fn read_vault() -> Result<String, std::io::Error> {
    let content = std::fs::read_to_string("vault.json")?;  // ? = return Err if error
    Ok(content)
}
```

The `?` replaces this verbose pattern:

```rust
let content = match std::fs::read_to_string("vault.json") {
    Ok(text) => text,
    Err(e) => return Err(e),
};
```

**Python comparison:** `?` is like if Python automatically re-raised exceptions unless you explicitly caught them. It's the inverse of Python's default — in Python, exceptions propagate automatically; in Rust, you must opt in with `?`.

### Step 2: Write the Vault Functions

Replace `src/main.rs` with the full code. We're adding `vault_path()`, `save_vault()`, and `load_vault()` functions:

```rust
use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::PathBuf;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Data model (same as Stage 3)
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize)]
struct Relic {
    id: String,
    name: String,
    username: String,
    password: String,
    url: Option<String>,
    chamber: String,
    tags: Vec<String>,
    notes: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
struct Chamber {
    icon: String,
    description: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct Vault {
    version: u8,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    chambers: HashMap<String, Chamber>,
    relics: Vec<Relic>,
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

/// Returns the path to the vault directory: ~/.ironvault/
fn vault_dir() -> PathBuf {
    let home = std::env::var("HOME")
        .expect("HOME environment variable not set");
    PathBuf::from(home).join(".ironvault")
}

/// Returns the path to the vault file: ~/.ironvault/vault.json
fn vault_path() -> PathBuf {
    vault_dir().join("vault.json")
}

/// Save the vault to disk as pretty-printed JSON.
///
/// Creates the ~/.ironvault/ directory if it doesn't exist.
fn save_vault(vault: &Vault) -> Result<(), Box<dyn std::error::Error>> {
    // Create directory if missing (like Python's os.makedirs(exist_ok=True))
    let dir = vault_dir();
    fs::create_dir_all(&dir)?;

    // Serialize to pretty JSON
    let json = serde_json::to_string_pretty(vault)?;

    // Write to file (creates or overwrites)
    let path = vault_path();
    fs::write(&path, &json)?;

    println!("Vault saved to {}", path.display());
    Ok(())
}

/// Load the vault from disk.
///
/// Returns a clear error message if the file doesn't exist or contains
/// invalid JSON.
fn load_vault() -> Result<Vault, Box<dyn std::error::Error>> {
    let path = vault_path();

    // Read the file
    let json = fs::read_to_string(&path).map_err(|e| {
        if e.kind() == io::ErrorKind::NotFound {
            format!(
                "No vault found at {}. Run `iv init` to create one.",
                path.display()
            )
        } else {
            format!("Failed to read vault: {}", e)
        }
    })?;

    // Parse JSON into Vault struct
    let vault: Vault = serde_json::from_str(&json)
        .map_err(|e| format!("Vault file is corrupted: {}", e))?;

    Ok(vault)
}

// ---------------------------------------------------------------------------
// Vault creation helper
// ---------------------------------------------------------------------------

/// Create a new vault with default chambers.
fn create_default_vault() -> Vault {
    let now = Utc::now();
    let mut chambers = HashMap::new();

    chambers.insert(
        String::from("Armory"),
        Chamber {
            icon: String::from("⚔️"),
            description: String::from("Work credentials"),
        },
    );
    chambers.insert(
        String::from("Treasury"),
        Chamber {
            icon: String::from("💰"),
            description: String::from("Financial accounts"),
        },
    );
    chambers.insert(
        String::from("Library"),
        Chamber {
            icon: String::from("📜"),
            description: String::from("Email and social"),
        },
    );
    chambers.insert(
        String::from("Crypt"),
        Chamber {
            icon: String::from("💀"),
            description: String::from("Recovery codes and secrets"),
        },
    );

    Vault {
        version: 1,
        created_at: now,
        updated_at: now,
        chambers,
        relics: Vec::new(),
    }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

fn main() {
    // Create and save a vault
    let vault = create_default_vault();
    if let Err(e) = save_vault(&vault) {
        eprintln!("Error saving vault: {}", e);
        std::process::exit(1);
    }

    // Load it back
    match load_vault() {
        Ok(loaded) => {
            println!("\nVault loaded successfully!");
            println!("Version: {}", loaded.version);
            println!("Chambers: {}", loaded.chambers.len());
            println!("Relics: {}", loaded.relics.len());
        }
        Err(e) => {
            eprintln!("Error loading vault: {}", e);
            std::process::exit(1);
        }
    }
}
```

Let's break down the new concepts.

### Concept: `PathBuf` and Paths

```rust
use std::path::PathBuf;

let path = PathBuf::from("/Users/adventurer").join(".ironvault").join("vault.json");
// → /Users/adventurer/.ironvault/vault.json
```

`PathBuf` is Rust's owned path type. Like Python's `pathlib.Path`:

| Python | Rust |
|--------|------|
| `Path.home() / ".ironvault" / "vault.json"` | `PathBuf::from(home).join(".ironvault").join("vault.json")` |
| `path.exists()` | `path.exists()` |
| `path.parent` | `path.parent()` |
| `str(path)` | `path.display()` (for printing) |

There's also `&Path` (borrowed, like `&str` is to `String`). `PathBuf` owns the data; `&Path` borrows it.

### Concept: `std::fs` — File Operations

```rust
use std::fs;

// Create directories (like mkdir -p)
fs::create_dir_all(&dir)?;

// Write a string to a file (creates or overwrites)
fs::write(&path, &json)?;

// Read a file into a String
let content = fs::read_to_string(&path)?;
```

**Python comparison:**

| Python | Rust |
|--------|------|
| `os.makedirs(dir, exist_ok=True)` | `fs::create_dir_all(&dir)?` |
| `Path(f).write_text(data)` | `fs::write(&path, &data)?` |
| `Path(f).read_text()` | `fs::read_to_string(&path)?` |

Every `fs` function returns a `Result`. The `?` propagates errors to the caller.

### Concept: `Box<dyn std::error::Error>`

```rust
fn save_vault(vault: &Vault) -> Result<(), Box<dyn std::error::Error>> {
```

This return type means: "returns nothing on success (`()`), or any error type on failure."

- `Box<dyn std::error::Error>` is a **trait object** — a box (heap-allocated pointer) to any type that implements the `Error` trait.
- This lets us return `io::Error` from file operations AND `serde_json::Error` from serialization in the same function.
- Think of it as Python's `Exception` base class — any error can be returned.

In later stages, we'll replace this with a custom error type. For now, `Box<dyn Error>` is the quick-and-dirty approach.

### Concept: `.map_err()` — Transforming Errors

```rust
let json = fs::read_to_string(&path).map_err(|e| {
    if e.kind() == io::ErrorKind::NotFound {
        format!("No vault found at {}. Run `iv init` to create one.", path.display())
    } else {
        format!("Failed to read vault: {}", e)
    }
})?;
```

`.map_err()` transforms the error type. The closure receives the original error and returns a new one. This is how we provide user-friendly error messages instead of raw OS errors.

**Python comparison:**
```python
try:
    json_str = open(path).read()
except FileNotFoundError:
    raise SystemExit(f"No vault found at {path}. Run `iv init` to create one.")
except IOError as e:
    raise SystemExit(f"Failed to read vault: {e}")
```

### Concept: `if let` — Pattern Matching Shorthand

```rust
if let Err(e) = save_vault(&vault) {
    eprintln!("Error saving vault: {}", e);
    std::process::exit(1);
}
```

`if let` destructures a single pattern. It's shorthand for a `match` when you only care about one variant:

```rust
// These are equivalent:
if let Err(e) = save_vault(&vault) { ... }

match save_vault(&vault) {
    Ok(_) => {},
    Err(e) => { ... }
}
```

### Step 3: Run It

```bash
cargo run
```

Output:

```
Vault saved to /Users/you/.ironvault/vault.json
Vault loaded successfully!
Version: 1
Chambers: 4
Relics: 0
```

Check the file:

```bash
cat ~/.ironvault/vault.json
```

You'll see the full JSON vault. This is plaintext — anyone with access to your filesystem can read it. That's why Act 2 adds encryption.

### Why Plaintext Is Temporary

Right now, `~/.ironvault/vault.json` contains passwords in cleartext. This is fine for development but would be a security disaster in production:

- Any process on your machine can read it
- It shows up in backups, Time Machine, cloud sync
- `grep -r "password" ~/` would find it

In Act 2, we'll replace this with the encrypted binary format from Design Spec §4.1: a header with Argon2 parameters and salt, followed by AES-256-GCM ciphertext. The `save_vault` and `load_vault` functions will gain encryption/decryption steps, but the overall structure stays the same.

**AWS parallel:** This is like storing secrets in plaintext in an S3 bucket vs. using SSE-KMS encryption. The bucket (file) is the same — the encryption layer wraps the data transparently.

The vault persists to disk and survives restarts, but there's no way to interact with it except by editing `main()`. Next, we build the Gatekeeper — a real CLI that lets you create, add, and list relics from the terminal.

### Checkpoint Code

**`Cargo.toml`** — serde, serde_json, chrono uncommented.

**`src/main.rs`** — the full code from Step 2 above.

**Run:** `cargo run` → creates `~/.ironvault/vault.json`, reads it back, prints summary.

### What to Try

1. Run it twice — the second run overwrites the file. Check that the timestamps change.
2. Delete `~/.ironvault/vault.json` and change `main` to only call `load_vault()` — see the "No vault found" error message.
3. Corrupt the JSON file (open it, delete a brace) and try loading — see the "Vault file is corrupted" error.
4. Try `ls -la ~/.ironvault/` — note the file permissions. On macOS/Linux, `fs::write` creates files with `0644` by default. In Act 2, we'll set `0600` (owner-only read/write).

### Common Mistakes

**Using `unwrap()` in functions that should return `Result`:**
```rust
fn load_vault() -> Result<Vault, ...> {
    let json = fs::read_to_string(&path).unwrap();  // ❌ panics on error instead of returning Err
}
```
Use `?` instead of `.unwrap()` in functions that return `Result`. Save `.unwrap()` for cases where failure is truly impossible.

**Forgetting `&` when passing to functions:**
```rust
fs::write(path, json);  // ❌ moves `path` and `json` — can't use them after this
fs::write(&path, &json);  // ✅ borrows — path and json are still usable
```
The `&` passes a reference (borrow) instead of moving ownership. We'll cover ownership deeply in Act 2.

**Hardcoding the home directory:**
```rust
let path = PathBuf::from("/Users/adventurer/.ironvault/vault.json");  // ❌ only works on your machine
```
Use `std::env::var("HOME")` to get the home directory portably.

---

## Stage 5 — The Gatekeeper

A vault you can only interact with by recompiling `main.rs` is no tool at all. This stage transforms Ironvault from a library exercise into a real CLI application. The Gatekeeper parses commands from the terminal, dispatches them to handler functions, and gives users a proper interface — `iv init`, `iv add`, `iv list`. This is where the vault becomes something you'd actually use.

> *"The Gatekeeper stands at the entrance, interpreting the adventurer's commands. 'Init,' you say, and a new vault springs into existence. 'Add,' and a relic is forged. 'List,' and the ledger opens."*

**Difficulty:** Medium
**Concepts introduced:** clap derive API (`Parser`, `Subcommand`), enums for subcommands, `match` expressions, reading from stdin
**Time estimate:** 30 minutes
**Spec reference:** The CLI uses subcommands (not flags) because each operation is distinct — `init` creates, `add` writes, `list` reads. Subcommands make the interface discoverable via `--help` and prevent ambiguous flag combinations.

### What We're Building

A real CLI with subcommands: `iv init`, `iv add`, and `iv list`. We're replacing the hardcoded `main()` with a proper command dispatcher using the `clap` crate.

After this stage, you'll be able to:
```bash
iv init          # Create a new vault
iv add           # Add a relic interactively
iv list          # List all relics
```

### Step 1: Enable clap

In `Cargo.toml`, uncomment clap:

```toml
[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
chrono = { version = "0.4", features = ["serde"] }

# Stage 5: CLI framework
clap = { version = "4", features = ["derive"] }
```

The `"derive"` feature enables `#[derive(Parser)]` — the same derive macro pattern we used with serde, but for CLI argument parsing.

### Step 2: Define the CLI Structure

Right now we have file I/O functions but no way for a user to invoke them from the terminal. We need a command parser that turns `iv init`, `iv add`, and `iv list` into function calls — with argument validation, help text, and error messages all handled automatically.

Here's the key insight: with clap's derive API, your CLI structure is defined as Rust types. Subcommands are enum variants. Arguments are struct fields. The compiler checks everything at compile time.

**Python comparison (argparse):**
```python
parser = argparse.ArgumentParser(description="Ironvault password manager")
subparsers = parser.add_subparsers(dest="command")
subparsers.add_parser("init", help="Create a new vault")
subparsers.add_parser("list", help="List all relics")
add_parser = subparsers.add_parser("add", help="Add a new relic")
```

**Rust (clap derive):**
```rust
#[derive(Parser)]
#[command(name = "iv", about = "Ironvault — a secure password vault")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Create a new vault
    Init,
    /// List all relics
    List,
    /// Add a new relic interactively
    Add,
}
```

The doc comments (`///`) become the help text automatically. Run `iv --help` and clap generates the help output from your type definitions.

### Step 3: Full Code

Replace `src/main.rs` entirely:

```rust
use std::collections::HashMap;
use std::fs;
use std::io::{self, Write};
use std::path::PathBuf;

use chrono::{DateTime, Utc};
use clap::{Parser, Subcommand};
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize)]
struct Relic {
    id: String,
    name: String,
    username: String,
    password: String,
    url: Option<String>,
    chamber: String,
    tags: Vec<String>,
    notes: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
struct Chamber {
    icon: String,
    description: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct Vault {
    version: u8,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    chambers: HashMap<String, Chamber>,
    relics: Vec<Relic>,
}

// ---------------------------------------------------------------------------
// CLI definition (Design Spec §6)
// ---------------------------------------------------------------------------

/// Ironvault — a secure password vault.
///
/// Store your relics (credentials) in chambers (categories),
/// protected by the Master Key.
#[derive(Parser)]
#[command(name = "iv", version, about, long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Create a new vault
    Init,
    /// List all relics in the vault
    List,
    /// Add a new relic interactively
    Add,
}

// ---------------------------------------------------------------------------
// File I/O (same as Stage 4)
// ---------------------------------------------------------------------------

fn vault_dir() -> PathBuf {
    let home = std::env::var("HOME").expect("HOME environment variable not set");
    PathBuf::from(home).join(".ironvault")
}

fn vault_path() -> PathBuf {
    vault_dir().join("vault.json")
}

fn save_vault(vault: &Vault) -> Result<(), Box<dyn std::error::Error>> {
    fs::create_dir_all(vault_dir())?;
    let json = serde_json::to_string_pretty(vault)?;
    fs::write(vault_path(), &json)?;
    Ok(())
}

fn load_vault() -> Result<Vault, Box<dyn std::error::Error>> {
    let path = vault_path();
    let json = fs::read_to_string(&path).map_err(|e| {
        if e.kind() == io::ErrorKind::NotFound {
            format!("No vault found. Run `iv init` to create one.")
        } else {
            format!("Failed to read vault: {}", e)
        }
    })?;
    let vault: Vault = serde_json::from_str(&json)
        .map_err(|e| format!("Vault file is corrupted: {}", e))?;
    Ok(vault)
}

fn create_default_vault() -> Vault {
    let now = Utc::now();
    let mut chambers = HashMap::new();
    chambers.insert(
        String::from("Armory"),
        Chamber {
            icon: String::from("⚔️"),
            description: String::from("Work credentials"),
        },
    );
    chambers.insert(
        String::from("Treasury"),
        Chamber {
            icon: String::from("💰"),
            description: String::from("Financial accounts"),
        },
    );
    chambers.insert(
        String::from("Library"),
        Chamber {
            icon: String::from("📜"),
            description: String::from("Email and social"),
        },
    );
    chambers.insert(
        String::from("Crypt"),
        Chamber {
            icon: String::from("💀"),
            description: String::from("Recovery codes and secrets"),
        },
    );

    Vault {
        version: 1,
        created_at: now,
        updated_at: now,
        chambers,
        relics: Vec::new(),
    }
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

/// Generate an 8-character hex ID.
///
/// Uses the current timestamp for uniqueness. In Act 2, we'll switch to
/// a cryptographically secure random generator.
fn generate_id() -> String {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("{:08x}", timestamp as u32)
}

// ---------------------------------------------------------------------------
// Interactive input helpers
// ---------------------------------------------------------------------------

/// Prompt the user for input and return the trimmed response.
fn prompt(label: &str) -> String {
    print!("{}: ", label);
    io::stdout().flush().unwrap(); // flush so the prompt appears before input
    let mut input = String::new();
    io::stdin().read_line(&mut input).unwrap();
    input.trim().to_string()
}

/// Prompt for optional input. Returns None if the user presses Enter without typing.
fn prompt_optional(label: &str) -> Option<String> {
    let value = prompt(label);
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

fn cmd_init() -> Result<(), Box<dyn std::error::Error>> {
    let path = vault_path();
    if path.exists() {
        println!("Vault already exists at {}", path.display());
        println!("Delete it first if you want to start fresh.");
        return Ok(());
    }

    let vault = create_default_vault();
    save_vault(&vault)?;
    println!("Vault created at {}", path.display());
    println!("Default chambers: Armory, Treasury, Library, Crypt");
    Ok(())
}

fn cmd_list() -> Result<(), Box<dyn std::error::Error>> {
    let vault = load_vault()?;

    if vault.relics.is_empty() {
        println!("The vault is empty. Add relics with `iv add`.");
        return Ok(());
    }

    println!(
        "{:<20} {:<25} {:<15}",
        "NAME", "USERNAME", "CHAMBER"
    );
    println!("{}", "-".repeat(60));

    for relic in &vault.relics {
        println!(
            "{:<20} {:<25} {:<15}",
            relic.name, relic.username, relic.chamber
        );
    }

    println!("\n{} relic(s) total.", vault.relics.len());
    Ok(())
}

fn cmd_add() -> Result<(), Box<dyn std::error::Error>> {
    let mut vault = load_vault()?;
    let now = Utc::now();

    println!("Forging a new relic...\n");

    let name = prompt("Name (e.g., GitHub)");
    if name.is_empty() {
        println!("Name cannot be empty.");
        return Ok(());
    }

    let username = prompt("Username");
    let password = prompt("Password");
    let url = prompt_optional("URL (optional)");
    let chamber = {
        let input = prompt("Chamber (Armory/Treasury/Library/Crypt)");
        if input.is_empty() {
            String::from("Armory")
        } else {
            input
        }
    };
    let tags_input = prompt("Tags (comma-separated, optional)");
    let tags: Vec<String> = if tags_input.is_empty() {
        Vec::new()
    } else {
        tags_input.split(',').map(|t| t.trim().to_string()).collect()
    };
    let notes = prompt_optional("Notes (optional)");

    let relic = Relic {
        id: generate_id(),
        name: name.clone(),
        username,
        password,
        url,
        chamber,
        tags,
        notes,
        created_at: now,
        updated_at: now,
    };

    vault.relics.push(relic);
    vault.updated_at = now;
    save_vault(&vault)?;

    println!("\nRelic '{}' added to the vault.", name);
    Ok(())
}

// ---------------------------------------------------------------------------
// Main — the Gatekeeper dispatches commands
// ---------------------------------------------------------------------------

fn main() {
    let cli = Cli::parse();

    let result = match cli.command {
        Commands::Init => cmd_init(),
        Commands::List => cmd_list(),
        Commands::Add => cmd_add(),
    };

    if let Err(e) = result {
        eprintln!("Error: {}", e);
        std::process::exit(1);
    }
}
```

### Concept: Clap Derive API

```rust
#[derive(Parser)]
#[command(name = "iv", version, about, long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}
```

- `#[derive(Parser)]` — generates the argument parsing code. `Cli::parse()` reads `std::env::args()` and returns a populated `Cli` struct.
- `#[command(name = "iv")]` — sets the binary name shown in help text.
- `version` — auto-reads version from `Cargo.toml`.
- `about` — auto-reads from the doc comment above the struct.
- `long_about = None` — prevents the full doc comment from showing in `--help` (only the first line shows).

```rust
#[derive(Subcommand)]
enum Commands {
    /// Create a new vault
    Init,
    /// List all relics in the vault
    List,
    /// Add a new relic interactively
    Add,
}
```

- `#[derive(Subcommand)]` — each enum variant becomes a subcommand.
- Doc comments (`///`) become the help text for each subcommand.
- Variant names are auto-converted to lowercase: `Init` → `init`, `List` → `list`.

### Concept: `match` Expressions

```rust
let result = match cli.command {
    Commands::Init => cmd_init(),
    Commands::List => cmd_list(),
    Commands::Add => cmd_add(),
};
```

`match` is Rust's pattern matching — like a `switch` statement but exhaustive. The compiler ensures you handle every variant. If you add a new variant to `Commands` and forget to add a match arm, the code won't compile.

**Python comparison:**
```python
match command:
    case "init": cmd_init()
    case "list": cmd_list()
    case "add": cmd_add()
```

The Rust version is safer because the compiler checks exhaustiveness. Python's `match` doesn't enforce that you handle all cases.

### Concept: Reading from stdin

```rust
fn prompt(label: &str) -> String {
    print!("{}: ", label);
    io::stdout().flush().unwrap();
    let mut input = String::new();
    io::stdin().read_line(&mut input).unwrap();
    input.trim().to_string()
}
```

- `print!` (no `ln`) prints without a newline — the cursor stays on the same line.
- `io::stdout().flush()` — forces the output to appear immediately. Without this, the prompt might not show before `read_line` blocks.
- `io::stdin().read_line(&mut input)` — reads one line into the mutable `input` String. The `&mut` means we're passing a mutable reference — the function can modify `input`.
- `.trim().to_string()` — removes the trailing newline and converts back to an owned `String`.

### Step 4: Run It

First, build:

```bash
cargo build
```

Now test the commands:

```bash
# Create a vault
cargo run -- init

# Add a relic (interactive prompts)
cargo run -- add

# List relics
cargo run -- list

# See help
cargo run -- --help
cargo run -- add --help
```

The `--` separates cargo's arguments from your program's arguments. `cargo run -- init` passes `init` to your binary.

**Tip:** You can also run the binary directly:

```bash
./target/debug/ironvault init
```

Or create an alias in your shell:

```bash
alias iv='./target/debug/ironvault'
iv init
iv add
iv list
```

### Step 5: Test the Flow

```bash
$ cargo run -- init
Vault created at /Users/you/.ironvault/vault.json
Default chambers: Armory, Treasury, Library, Crypt

$ cargo run -- add
Forging a new relic...

Name (e.g., GitHub): GitHub
Username: adventurer@example.com
Password: hunter2
URL (optional): https://github.com
Chamber (Armory/Treasury/Library/Crypt): Armory
Tags (comma-separated, optional): dev, git
Notes (optional): Personal account

Relic 'GitHub' added to the vault.

$ cargo run -- list
NAME                 USERNAME                  CHAMBER
------------------------------------------------------------
GitHub               adventurer@example.com    Armory

1 relic(s) total.
```

The CLI skeleton is in place with create, add, and list. But a vault that can only add and list is incomplete — you need to retrieve individual relics, edit them, and delete them. The Ledger in Stage 6 completes the CRUD interface.

### Checkpoint Code

**`Cargo.toml`** — serde, serde_json, chrono, and clap uncommented.

**`src/main.rs`** — the full code from Step 3 above.

**Run:** `cargo run -- init`, `cargo run -- add`, `cargo run -- list`.

### What to Try

1. Run `cargo run -- --help` — see the auto-generated help text from your doc comments.
2. Run `cargo run -- add` multiple times to add several relics, then `cargo run -- list`.
3. Try running `cargo run -- delete` — clap gives you a helpful error: `error: unrecognized subcommand 'delete'`.
4. Check `~/.ironvault/vault.json` after adding relics — see the JSON grow.

### Common Mistakes

**Forgetting `#[command(subcommand)]` on the field:**
```rust
struct Cli {
    command: Commands,  // ❌ error: clap doesn't know this is a subcommand
}
```
Add `#[command(subcommand)]` above the field.

**Enum variants not matching expected subcommand names:**
```rust
enum Commands {
    InitVault,  // becomes "init-vault" (kebab-case by default)
}
```
Clap converts PascalCase to kebab-case. `InitVault` → `init-vault`. If you want just `init`, name the variant `Init`.

**Forgetting to flush stdout before reading stdin:**
```rust
print!("Name: ");
// Without flush, the prompt might not appear before read_line blocks
io::stdin().read_line(&mut input).unwrap();
```
Always call `io::stdout().flush().unwrap()` after `print!`.

---

## Stage 6 — The Ledger

A vault you can only add to is a vault you can't maintain. Passwords change, accounts get deleted, credentials need updating. This stage completes the CRUD interface — get, edit, and delete — so you can manage the full lifecycle of every relic. It also introduces the critical UX pattern of hiding passwords by default, because a password manager that displays secrets on every lookup defeats its own purpose.

> *"The Ledger knows all. It can reveal a relic's secrets, strike an entry from the record, or amend what was written. But it guards its knowledge — passwords are shown only to those who ask explicitly."*

**Difficulty:** Medium
**Concepts introduced:** Pattern matching on `Option`, iterators (`find`, `position`, `retain`), `--show-password` flag, confirmation prompts
**Time estimate:** 30 minutes
**Spec reference:** CRUD operations follow the principle of least surprise — `get` shows details, `edit` modifies in place, `delete` requires confirmation. The `--show-password` flag defaults to hidden because the most common use case (copying a password) doesn't require seeing it on screen.

### What We're Building

Three new commands:
- `iv get <name>` — show a relic's details (password masked by default, `--show-password` to reveal)
- `iv delete <name>` — delete a relic (with confirmation)
- `iv edit <name>` — edit a relic's fields interactively

### Step 1: Extend the CLI Definition

Right now we have `init`, `add`, and `list` — but we can't retrieve a specific relic's details, update a password that's changed, or remove an account we've closed. We need three new commands that complete the CRUD lifecycle.

Add the new subcommands to the `Commands` enum. Replace the existing `Commands` enum and add the new handler functions.

Update the `Commands` enum:

```rust
#[derive(Subcommand)]
enum Commands {
    /// Create a new vault
    Init,
    /// List all relics in the vault
    List,
    /// Add a new relic interactively
    Add,
    /// Show details of a relic
    Get {
        /// Name or ID of the relic to show
        name: String,
        /// Show the password in plaintext
        #[arg(long)]
        show_password: bool,
    },
    /// Delete a relic from the vault
    Delete {
        /// Name or ID of the relic to delete
        name: String,
    },
    /// Edit an existing relic
    Edit {
        /// Name or ID of the relic to edit
        name: String,
    },
}
```

Notice how `Get`, `Delete`, and `Edit` have **fields inside the enum variant**. This is a Rust feature that Python and TypeScript don't have — enum variants can carry data. Clap turns these fields into CLI arguments.

- `name: String` — a required positional argument (because it's not wrapped in `Option` and has no `#[arg(long)]`)
- `#[arg(long)]` — makes `show_password` a `--show-password` flag
- `bool` with `#[arg(long)]` — becomes a flag that defaults to `false`

### Step 2: Add a Relic Finder

We need a helper to find relics by name or ID. Add this function:

```rust
/// Find a relic by name (case-insensitive) or by ID prefix.
///
/// Returns the index of the matching relic, or None if not found.
fn find_relic(vault: &Vault, query: &str) -> Option<usize> {
    let query_lower = query.to_lowercase();
    vault.relics.iter().position(|r| {
        r.name.to_lowercase() == query_lower || r.id.starts_with(query)
    })
}
```

### Concept: Iterators

```rust
vault.relics.iter().position(|r| { ... })
```

Iterators are Rust's way of processing sequences. They're lazy (nothing happens until you consume them) and zero-cost (the compiler optimizes them to the same code as a hand-written loop).

| Python | Rust |
|--------|------|
| `for r in relics:` | `for r in &vault.relics {` or `vault.relics.iter()` |
| `next(i for i, r in enumerate(relics) if r.name == q)` | `vault.relics.iter().position(\|r\| r.name == q)` |
| `next((r for r in relics if r.name == q), None)` | `vault.relics.iter().find(\|r\| r.name == q)` |
| `[r for r in relics if r.name != q]` | `vault.relics.retain(\|r\| r.name != q)` |

Key iterator methods we'll use:
- `.iter()` — creates an iterator over references (`&Relic`)
- `.position(|r| ...)` — returns `Option<usize>` — the index of the first match, or `None`
- `.find(|r| ...)` — returns `Option<&Relic>` — a reference to the first match, or `None`
- `.retain(|r| ...)` — keeps only elements where the closure returns `true` (mutates in place)

The `|r|` syntax is a **closure** (anonymous function). Like Python's `lambda r:` or JavaScript's `(r) =>`.

### Step 3: Command Handlers

Add these three functions:

```rust
fn cmd_get(name: &str, show_password: bool) -> Result<(), Box<dyn std::error::Error>> {
    let vault = load_vault()?;

    let index = find_relic(&vault, name);
    match index {
        None => {
            println!("No relic found matching '{}'.", name);
        }
        Some(i) => {
            let relic = &vault.relics[i];
            println!("Name:       {}", relic.name);
            println!("ID:         {}", relic.id);
            println!("Username:   {}", relic.username);
            if show_password {
                println!("Password:   {}", relic.password);
            } else {
                println!("Password:   ********  (use --show-password to reveal)");
            }
            if let Some(url) = &relic.url {
                println!("URL:        {}", url);
            }
            println!("Chamber:    {}", relic.chamber);
            if !relic.tags.is_empty() {
                println!("Tags:       {}", relic.tags.join(", "));
            }
            if let Some(notes) = &relic.notes {
                println!("Notes:      {}", notes);
            }
            println!("Created:    {}", relic.created_at.format("%Y-%m-%d %H:%M:%S UTC"));
            println!("Updated:    {}", relic.updated_at.format("%Y-%m-%d %H:%M:%S UTC"));
        }
    }

    Ok(())
}

fn cmd_delete(name: &str) -> Result<(), Box<dyn std::error::Error>> {
    let mut vault = load_vault()?;

    let index = find_relic(&vault, name);
    match index {
        None => {
            println!("No relic found matching '{}'.", name);
        }
        Some(i) => {
            let relic_name = vault.relics[i].name.clone();

            // Require confirmation
            let confirm = prompt(&format!(
                "Delete relic '{}'? Type 'yes' to confirm",
                relic_name
            ));
            if confirm != "yes" {
                println!("Deletion cancelled.");
                return Ok(());
            }

            vault.relics.remove(i);
            vault.updated_at = Utc::now();
            save_vault(&vault)?;
            println!("Relic '{}' deleted.", relic_name);
        }
    }

    Ok(())
}

fn cmd_edit(name: &str) -> Result<(), Box<dyn std::error::Error>> {
    let mut vault = load_vault()?;

    let index = find_relic(&vault, name);
    match index {
        None => {
            println!("No relic found matching '{}'.", name);
        }
        Some(i) => {
            let relic = &vault.relics[i];
            println!("Editing relic '{}'. Press Enter to keep current value.\n", relic.name);

            // Show current values and prompt for new ones
            let new_name = prompt(&format!("Name [{}]", relic.name));
            let new_username = prompt(&format!("Username [{}]", relic.username));
            let new_password = prompt("New password (Enter to keep current)");
            let new_url = prompt(&format!(
                "URL [{}]",
                relic.url.as_deref().unwrap_or("none")
            ));
            let new_chamber = prompt(&format!("Chamber [{}]", relic.chamber));
            let new_tags = prompt(&format!("Tags [{}]", relic.tags.join(", ")));
            let new_notes = prompt(&format!(
                "Notes [{}]",
                relic.notes.as_deref().unwrap_or("none")
            ));

            // Apply changes — keep old value if user pressed Enter
            let relic = &mut vault.relics[i];
            if !new_name.is_empty() {
                relic.name = new_name;
            }
            if !new_username.is_empty() {
                relic.username = new_username;
            }
            if !new_password.is_empty() {
                relic.password = new_password;
            }
            if !new_url.is_empty() {
                relic.url = Some(new_url);
            }
            if !new_chamber.is_empty() {
                relic.chamber = new_chamber;
            }
            if !new_tags.is_empty() {
                relic.tags = new_tags.split(',').map(|t| t.trim().to_string()).collect();
            }
            if !new_notes.is_empty() {
                relic.notes = Some(new_notes);
            }
            relic.updated_at = Utc::now();

            save_vault(&vault)?;
            println!("\nRelic updated.");
        }
    }

    Ok(())
}
```

### Step 4: Update the Match in Main

Update the `match` in `main` to handle the new commands:

```rust
fn main() {
    let cli = Cli::parse();

    let result = match cli.command {
        Commands::Init => cmd_init(),
        Commands::List => cmd_list(),
        Commands::Add => cmd_add(),
        Commands::Get { name, show_password } => cmd_get(&name, show_password),
        Commands::Delete { name } => cmd_delete(&name),
        Commands::Edit { name } => cmd_edit(&name),
    };

    if let Err(e) = result {
        eprintln!("Error: {}", e);
        std::process::exit(1);
    }
}
```

Notice the **destructuring** in the match arms: `Commands::Get { name, show_password }` extracts the fields from the enum variant directly into local variables.

### Concept: Why Passwords Are Hidden by Default

```rust
if show_password {
    println!("Password:   {}", relic.password);
} else {
    println!("Password:   ********  (use --show-password to reveal)");
}
```

This is a **shoulder surfing** defense. If someone glances at your screen while you're looking up a credential, they see `********` instead of the actual password. You must explicitly opt in with `--show-password`.

Every major password manager does this: 1Password, Bitwarden, KeePass — all hide passwords by default. It's a simple UX pattern that significantly reduces the risk of accidental exposure.

In Act 2, we'll add `--copy` which copies the password to the clipboard without ever displaying it — even better for security.

### Concept: `as_deref()` on `Option<String>`

```rust
relic.url.as_deref().unwrap_or("none")
```

This is a common pattern with `Option<String>`:
- `relic.url` is `Option<String>`
- `.as_deref()` converts `Option<String>` → `Option<&str>` (borrows the inner string)
- `.unwrap_or("none")` returns the `&str` inside, or `"none"` if it's `None`

Without `as_deref()`, you'd need `.as_ref().map(|s| s.as_str()).unwrap_or("none")` — much more verbose.

### Step 5: Test the Full CRUD

```bash
# Setup
cargo run -- init
cargo run -- add    # Add a relic called "GitHub"
cargo run -- add    # Add another called "AWS Console"

# Read
cargo run -- list
cargo run -- get GitHub
cargo run -- get GitHub --show-password

# Update
cargo run -- edit GitHub

# Delete
cargo run -- delete "AWS Console"
cargo run -- list
```

The full CRUD interface is operational — you can create, read, update, and delete relics. But there's a silent danger: if the process crashes mid-write, your vault file could be corrupted or empty. Stage 7 introduces atomic writes to make the vault crash-proof.

### Checkpoint Code
1. Three new variants in `Commands` enum (`Get`, `Delete`, `Edit`)
2. `find_relic()` helper function
3. `cmd_get()`, `cmd_delete()`, `cmd_edit()` handler functions
4. Updated `match` in `main()`

**Run:** All six commands work: `init`, `add`, `list`, `get`, `delete`, `edit`.

### What to Try

1. Try `cargo run -- get nonexistent` — see the "No relic found" message.
2. Try `cargo run -- delete GitHub` and type something other than "yes" — deletion is cancelled.
3. Try `cargo run -- edit GitHub` and press Enter for every field — all values stay the same.
4. Try partial ID matching: `cargo run -- get a1b2` (first 4 chars of the ID).

### Common Mistakes

**Trying to modify a relic while borrowing the vault:**
```rust
let relic = &vault.relics[i];     // immutable borrow
relic.name = new_name;             // ❌ error: cannot assign to `relic.name` which is behind a `&` reference
```
You need a mutable reference: `let relic = &mut vault.relics[i];`. But you can't have an immutable borrow and a mutable borrow at the same time — this is Rust's borrow checker protecting you from data races. That's why in `cmd_edit` we first read with `&vault.relics[i]`, then later get `&mut vault.relics[i]` in a separate scope.

**Forgetting to destructure enum variants in match:**
```rust
Commands::Get => cmd_get(),  // ❌ error: this variant has fields
```
You must destructure: `Commands::Get { name, show_password } => cmd_get(&name, show_password)`.

**Using `==` to compare `Option<String>` with `&str`:**
```rust
if relic.url == "https://github.com" {  // ❌ error: can't compare Option<String> with &str
```
Use `relic.url.as_deref() == Some("https://github.com")` or pattern match.

---

## Stage 7 — The Atomic Quill

Your vault file is the single source of truth for every credential you own. If a power failure, crash, or disk error corrupts it mid-write, you lose everything. This stage replaces the naive `fs::write()` with an atomic write strategy that guarantees the vault is either fully written or completely untouched — never half-corrupted. This is the same pattern used by SQLite, Git, and every serious database.

> *"A careless scribe once lost an entire vault when lightning struck mid-sentence. The Atomic Quill writes to a shadow scroll first, then swaps it into place in a single, indivisible motion. The old scroll is never touched until the new one is complete."*

**Difficulty:** Medium
**Concepts introduced:** `File::sync_all()`, `std::fs::rename()`, atomic file operations, `#[cfg(test)]`, `#[test]`, unit testing
**Time estimate:** 30 minutes
**Spec reference:** The write-tmp-fsync-rename strategy is the industry standard for crash-safe file updates. It's used by SQLite (WAL mode), Git (loose objects), and PostgreSQL (WAL). The key insight: never modify the original file — always write a complete replacement and atomically swap it in.

### What We're Building

We're replacing our naive `fs::write()` with an **atomic write** strategy:

1. Serialize the vault to JSON
2. Write to a temporary file (`vault.json.tmp`)
3. Call `fsync` to flush to disk
4. Rename the temp file to `vault.json` (atomic on POSIX)

If the process crashes at any point during steps 1–3, the original `vault.json` is untouched. The rename in step 4 is atomic on POSIX systems — it either completes fully or doesn't happen at all.

Then we'll write our first Rust test to verify this behavior.

### Why This Matters

Consider what happens with our current `fs::write()`:

```
fs::write("vault.json", data)
```

Under the hood, this:
1. Opens the file (truncates it to zero bytes)
2. Writes the new data
3. Closes the file

If power cuts between step 1 and step 2, your vault file is **empty** — zero bytes. All your passwords are gone. If it cuts during step 2, you have a **partial write** — corrupted JSON that can't be parsed.

**AWS parallel:** This is the same problem that databases solve with write-ahead logs (WAL). DynamoDB writes to a WAL before updating the main storage — if the node crashes, it replays the WAL on recovery. S3's `PutObject` is atomic from the caller's perspective — you either get the old object or the new one, never a partial write. Our rename strategy gives us the same guarantee for a local file.

### Step 1: The Atomic Write Function

Replace the `save_vault` function with this:

```rust
use std::fs::File;
use std::io::Write;

/// Save the vault to disk using atomic write.
///
/// Strategy (Design Spec §4.3):
/// 1. Serialize to JSON
/// 2. Write to vault.json.tmp
/// 3. fsync the temp file (flush OS buffers to disk)
/// 4. Rename vault.json.tmp → vault.json (atomic on POSIX)
///
/// If we crash during steps 1-3, the original vault.json is untouched.
/// Step 4 is atomic — it either completes or doesn't happen.
fn save_vault(vault: &Vault) -> Result<(), Box<dyn std::error::Error>> {
    let dir = vault_dir();
    fs::create_dir_all(&dir)?;

    let path = vault_path();
    let tmp_path = path.with_extension("json.tmp");

    // Step 1: Serialize
    let json = serde_json::to_string_pretty(vault)?;

    // Step 2: Write to temp file
    let mut file = File::create(&tmp_path)?;
    file.write_all(json.as_bytes())?;

    // Step 3: fsync — force OS to flush buffers to physical disk
    // Without this, the data might be in the OS page cache but not on disk.
    // A power failure would lose the data even though write() returned Ok.
    file.sync_all()?;

    // Step 4: Atomic rename
    // On POSIX (macOS, Linux), rename() is atomic — the directory entry
    // is updated in a single operation. The old file is replaced instantly.
    fs::rename(&tmp_path, &path)?;

    Ok(())
}
```

Let's break down each piece.

### Concept: `File::create()` and `write_all()`

```rust
let mut file = File::create(&tmp_path)?;
file.write_all(json.as_bytes())?;
```

- `File::create()` opens a file for writing (creates it if missing, truncates if exists). Returns `Result<File, io::Error>`.
- `file.write_all(bytes)` writes the entire byte slice to the file. Unlike `write()` which might write partial data, `write_all()` loops until everything is written.
- `json.as_bytes()` converts the `String` to `&[u8]` (a byte slice). Files work with bytes, not strings.

**Python comparison:**
```python
with open(tmp_path, 'w') as f:
    f.write(json_str)
    f.flush()
    os.fsync(f.fileno())
```

Note that Python's `with open()` doesn't fsync by default — `f.flush()` only flushes Python's internal buffer to the OS, not to disk. You need `os.fsync()` for that. Most Python code doesn't bother, which is why data loss on crash is common.

### Concept: `sync_all()` — Why fsync Matters

```rust
file.sync_all()?;
```

When you call `write()`, the data goes to the **OS page cache** — a RAM buffer managed by the kernel. The OS writes it to disk later, when it feels like it (usually within 30 seconds). If power cuts before the OS flushes, the data is lost.

`sync_all()` (which calls `fsync()` on POSIX) forces the OS to write the page cache to the physical disk **right now**. It blocks until the disk confirms the write is complete.

This is slow (a few milliseconds for SSD, much more for HDD) but essential for data integrity. For a password vault that's written infrequently, the cost is negligible.

**AWS parallel:** EBS volumes have a similar concept. `fsync` ensures data reaches the EBS volume, not just the instance's memory. EBS itself replicates within the AZ for durability — but your application must fsync to get data off the instance.

### Concept: `fs::rename()` — The Atomic Swap

```rust
fs::rename(&tmp_path, &path)?;
```

On POSIX systems (macOS, Linux), `rename()` is **atomic** at the filesystem level. The directory entry for `vault.json` is updated to point to the new file's data in a single operation. There's no intermediate state where the file is missing or partially written.

This is the key insight: we never modify `vault.json` directly. We write a complete new file, then atomically swap it in. The old data is only removed after the new data is fully in place.

**What "atomic" means here:**
- Another process reading `vault.json` during the rename will see either the old content or the new content — never partial content, never an empty file.
- If the system crashes during `rename()`, the filesystem journal ensures either the old or new file survives intact.

**Caveat:** This atomicity guarantee applies to POSIX filesystems (ext4, APFS, XFS). Network filesystems (NFS, SMB) may not provide the same guarantee. Since Ironvault stores the vault locally, this is fine.

### Step 2: Write Your First Rust Test

Now let's verify the atomic write works. We'll write a test that:
1. Creates a vault and saves it
2. Verifies the temp file doesn't linger after a successful save
3. Verifies the vault file contains valid JSON

To make our functions testable, we need versions that accept a custom path instead of always using `~/.ironvault/`. Let's add path-parameterized helpers:

```rust
/// Save vault to a specific path (used by tests and the main save_vault).
fn save_vault_to(vault: &Vault, dir: &std::path::Path) -> Result<(), Box<dyn std::error::Error>> {
    fs::create_dir_all(dir)?;

    let path = dir.join("vault.json");
    let tmp_path = dir.join("vault.json.tmp");

    let json = serde_json::to_string_pretty(vault)?;

    let mut file = File::create(&tmp_path)?;
    file.write_all(json.as_bytes())?;
    file.sync_all()?;

    fs::rename(&tmp_path, &path)?;
    Ok(())
}

/// Load vault from a specific path (used by tests).
fn load_vault_from(dir: &std::path::Path) -> Result<Vault, Box<dyn std::error::Error>> {
    let path = dir.join("vault.json");
    let json = fs::read_to_string(&path)?;
    let vault: Vault = serde_json::from_str(&json)?;
    Ok(vault)
}
```

Update `save_vault` and `load_vault` to delegate:

```rust
fn save_vault(vault: &Vault) -> Result<(), Box<dyn std::error::Error>> {
    save_vault_to(vault, &vault_dir())
}

fn load_vault() -> Result<Vault, Box<dyn std::error::Error>> {
    let path = vault_path();
    let json = fs::read_to_string(&path).map_err(|e| {
        if e.kind() == io::ErrorKind::NotFound {
            format!("No vault found. Run `iv init` to create one.")
        } else {
            format!("Failed to read vault: {}", e)
        }
    })?;
    let vault: Vault = serde_json::from_str(&json)
        .map_err(|e| format!("Vault file is corrupted: {}", e))?;
    Ok(vault)
}
```

Now add the test module at the **bottom** of `src/main.rs`:

```rust
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    /// Helper: create a vault with one relic for testing.
    fn test_vault() -> Vault {
        let mut vault = create_default_vault();
        let now = Utc::now();
        vault.relics.push(Relic {
            id: String::from("test1234"),
            name: String::from("TestRelic"),
            username: String::from("tester@example.com"),
            password: String::from("s3cret!"),
            url: Some(String::from("https://example.com")),
            chamber: String::from("Armory"),
            tags: vec![String::from("test")],
            notes: None,
            created_at: now,
            updated_at: now,
        });
        vault
    }

    #[test]
    fn test_save_and_load_roundtrip() {
        // tmp_dir is automatically cleaned up when it goes out of scope
        let tmp_dir = tempfile::tempdir().unwrap();
        let vault = test_vault();

        // Save
        save_vault_to(&vault, tmp_dir.path()).unwrap();

        // Verify the vault file exists
        let vault_file = tmp_dir.path().join("vault.json");
        assert!(vault_file.exists(), "vault.json should exist after save");

        // Verify the temp file was cleaned up (renamed away)
        let tmp_file = tmp_dir.path().join("vault.json.tmp");
        assert!(!tmp_file.exists(), "vault.json.tmp should not linger after save");

        // Load and verify contents
        let loaded = load_vault_from(tmp_dir.path()).unwrap();
        assert_eq!(loaded.relics.len(), 1);
        assert_eq!(loaded.relics[0].name, "TestRelic");
        assert_eq!(loaded.relics[0].password, "s3cret!");
    }

    #[test]
    fn test_save_creates_directory() {
        let tmp_dir = tempfile::tempdir().unwrap();
        let nested = tmp_dir.path().join("deep").join("nested");

        let vault = test_vault();
        save_vault_to(&vault, &nested).unwrap();

        assert!(nested.join("vault.json").exists());
    }

    #[test]
    fn test_load_nonexistent_returns_error() {
        let tmp_dir = tempfile::tempdir().unwrap();
        let result = load_vault_from(tmp_dir.path());
        assert!(result.is_err(), "Loading from empty dir should fail");
    }

    #[test]
    fn test_corrupted_json_returns_error() {
        let tmp_dir = tempfile::tempdir().unwrap();
        let vault_file = tmp_dir.path().join("vault.json");

        // Write invalid JSON
        fs::write(&vault_file, "{ this is not valid json }").unwrap();

        let result = load_vault_from(tmp_dir.path());
        assert!(result.is_err(), "Loading corrupted JSON should fail");
    }

    #[test]
    fn test_atomic_write_preserves_original_on_simulated_failure() {
        let tmp_dir = tempfile::tempdir().unwrap();
        let dir = tmp_dir.path();

        // Save a valid vault first
        let vault = test_vault();
        save_vault_to(&vault, dir).unwrap();

        // Verify original is readable
        let original = load_vault_from(dir).unwrap();
        assert_eq!(original.relics[0].name, "TestRelic");

        // Simulate a "crash" mid-write: write a partial temp file but don't rename
        let tmp_file = dir.join("vault.json.tmp");
        fs::write(&tmp_file, "partial garbage data").unwrap();
        // (In a real crash, the rename never happens)

        // The original vault.json should still be intact
        let still_valid = load_vault_from(dir).unwrap();
        assert_eq!(still_valid.relics[0].name, "TestRelic");
        assert_eq!(still_valid.relics.len(), 1);
    }
}
```

### Step 3: Add the tempfile Dev Dependency

We need the `tempfile` crate for creating temporary directories in tests. Add it to `Cargo.toml`:

```toml
[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
chrono = { version = "0.4", features = ["serde"] }
clap = { version = "4", features = ["derive"] }

[dev-dependencies]
tempfile = "3"
```

`[dev-dependencies]` are only compiled for tests and benchmarks — they don't bloat your release binary. Like Python's `[tool.pytest.ini_options]` or npm's `devDependencies`.

### Concept: `#[cfg(test)]` and `#[test]`

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_save_and_load_roundtrip() {
        // ...
    }
}
```

- `#[cfg(test)]` — **conditional compilation**. This entire module is only compiled when running `cargo test`. It doesn't exist in your release binary. Zero overhead.
- `mod tests` — a nested module. `use super::*` imports everything from the parent module (our main code).
- `#[test]` — marks a function as a test. `cargo test` finds and runs all `#[test]` functions.
- Tests pass if they don't panic. `assert!`, `assert_eq!`, and `assert_ne!` panic on failure.

**Python comparison:**
```python
# Python: separate test files, pytest discovers them
# test_vault.py
def test_save_and_load():
    assert loaded.relics[0].name == "TestRelic"

# Rust: tests live in the same file, gated by #[cfg(test)]
#[test]
fn test_save_and_load() {
    assert_eq!(loaded.relics[0].name, "TestRelic");
}
```

Key differences:
- Rust tests are in the same file as the code they test (for unit tests). Integration tests go in a `tests/` directory.
- `#[cfg(test)]` means test code is never compiled into production. In Python, test files are just... there.
- `assert_eq!(a, b)` gives you both values on failure. `assert!(condition)` just says true/false.

### Concept: `tempfile::tempdir()`

```rust
let tmp_dir = tempfile::tempdir().unwrap();
// tmp_dir.path() returns &Path to a unique temporary directory
// When tmp_dir goes out of scope, the directory is automatically deleted
```

`tempfile::tempdir()` creates a temporary directory with a unique name (like `/tmp/ironvault_test_abc123`). When the `TempDir` value is dropped (goes out of scope), the directory and all its contents are automatically deleted.

This is Rust's **RAII** (Resource Acquisition Is Initialization) pattern — resources are cleaned up when their owner goes out of scope. No `try/finally`, no `with` statement, no cleanup code. The destructor runs automatically.

**Python comparison:**
```python
import tempfile
with tempfile.TemporaryDirectory() as tmp_dir:
    # use tmp_dir
# automatically cleaned up when exiting the with block
```

### Step 4: Run the Tests

```bash
cargo test
```

Output:

```
   Compiling ironvault v0.1.0
    Finished `test` profile [unoptimized + debuginfo] target(s) in 2.50s
     Running unittests src/main.rs

running 5 tests
test tests::test_atomic_write_preserves_original_on_simulated_failure ... ok
test tests::test_corrupted_json_returns_error ... ok
test tests::test_load_nonexistent_returns_error ... ok
test tests::test_save_and_load_roundtrip ... ok
test tests::test_save_creates_directory ... ok

test result: ok. 5 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.01s
```

All five tests pass. The atomic write strategy works:
- Save and load round-trips correctly
- Temp files don't linger
- Missing files produce errors
- Corrupted JSON produces errors
- A simulated crash (partial temp file) doesn't corrupt the original

The vault's walls are raised, its data is crash-proof, and its CRUD interface is complete. But every secret still sits in plaintext on disk — readable by anyone with filesystem access. In Act 2, you'll forge the Master Key and seal the vault with real cryptography.

### Checkpoint Code

**`Cargo.toml`:**
```toml
[package]
name = "ironvault"
version = "0.1.0"
edition = "2021"

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
chrono = { version = "0.4", features = ["serde"] }
clap = { version = "4", features = ["derive"] }

[dev-dependencies]
tempfile = "3"
```

**`src/main.rs`** — the full Stage 6 code with:
1. `save_vault_to()` and `load_vault_from()` path-parameterized helpers
2. `save_vault()` updated to use atomic write (write tmp → fsync → rename)
3. `#[cfg(test)] mod tests` with 5 test functions

**Run:** `cargo test` → 5 tests pass. `cargo run -- init/add/list/get/edit/delete` all still work.

### What to Try

1. Run `cargo test -- --nocapture` to see `println!` output from tests (normally suppressed).
2. Run a single test: `cargo test test_save_and_load_roundtrip`.
3. Add a test that saves twice and verifies the second save overwrites the first.
4. Check that `vault.json.tmp` doesn't exist after a normal `cargo run -- add` — the rename cleaned it up.
5. Try adding `#[ignore]` above a test — it's skipped unless you run `cargo test -- --ignored`.

### Common Mistakes

**Forgetting `use super::*` in the test module:**
```rust
#[cfg(test)]
mod tests {
    #[test]
    fn test_something() {
        let vault = create_default_vault();  // ❌ error: not found in this scope
    }
}
```
Add `use super::*;` to import everything from the parent module.

**Using the real vault path in tests:**
```rust
#[test]
fn test_save() {
    save_vault(&vault).unwrap();  // ❌ writes to ~/.ironvault/ — pollutes your real vault!
}
```
Always use `tempfile::tempdir()` and `save_vault_to()` in tests. Never touch the real filesystem.

**Forgetting `[dev-dependencies]`:**
```toml
[dependencies]
tempfile = "3"  # ❌ ships tempfile in your release binary
```
Test-only crates go in `[dev-dependencies]`.

---

## Act 1 Complete — The Vault Stands

> *"The walls are raised, the chambers carved, the ledger bound. Your vault can store relics, recall them by name, and survive the crash of thunder. But it has no lock — any wanderer who finds the scroll can read its secrets. In Act 2, we forge the Master Key."*

**What you've built:**
- A complete CLI password manager with 6 commands
- JSON serialization/deserialization with serde
- File I/O with proper error handling
- Atomic writes that survive crashes
- Unit tests proving the data integrity

**What's missing (Act 2 preview):**
- The vault is plaintext — anyone can read `~/.ironvault/vault.json`
- No master password — no authentication at all
- Passwords are stored as plain `String` — no secure memory handling
- No password generation, no clipboard, no breach checking

**Rust concepts mastered in Act 1:**
- `cargo`, crates, `Cargo.toml`
- Structs, enums, derive macros
- `String` vs `&str`, `Option<T>`, `Vec<T>`, `HashMap<K, V>`
- `Result<T, E>`, the `?` operator, error handling
- `std::fs` file operations, `PathBuf`
- Clap derive API for CLI parsing
- Pattern matching with `match` and `if let`
- Iterators: `find`, `position`, `retain`
- Closures (`|x| ...`)
- Unit testing with `#[test]` and `#[cfg(test)]`
- Atomic file writes

**Coming in Act 2 — Forging the Master Key:**
- AES-256-GCM encryption (Design Spec §3.1)
- Argon2id key derivation (Design Spec §3.2)
- Secure memory with `zeroize` and `secrecy` (Design Spec §3.3)
- The binary vault file format (Design Spec §4.1)
- Hidden password input with `rpassword`
- Session management and lock files (Design Spec §7)

See you in Act 2, adventurer. The real security engineering begins there.
