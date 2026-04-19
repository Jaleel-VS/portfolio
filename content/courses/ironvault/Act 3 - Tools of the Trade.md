# Act 3 — Tools of the Trade

> *The vault stands strong, its walls impenetrable. But a vault is only as useful as the tools within it. In this act, you forge the instruments that transform Ironvault from a locked chest into a master craftsman's workshop — a password forge, a time-bound oracle, a swift courier, and the tools to search, shape, and organize your growing collection of relics.*

**What you'll build in this act:**

| Stage | Name | What It Does |
|-------|------|-------------|
| 14 | The Forge | Password generator with configurable character classes |
| 15 | The Courier | Clipboard copy with auto-clear |
| 16 | The Time Rune | TOTP two-factor authentication codes |
| 17 | The Seeker | Search and filter across relics |
| 18 | The Scribe | Edit existing relics interactively |
| 19 | The Chamber Architect | Chamber (category) management |

**New dependencies for this act** — add these to your `Cargo.toml`:

```toml
[dependencies]
# ... existing deps from Acts 1-2 ...
rand = "0.10"
rand_chacha = "0.10"
arboard = "3.6"
totp-rs = { version = "5.7", features = ["otpauth"] }
```

> **Why these specific crates?** `rand` + `rand_chacha` give us cryptographically secure random number generation with a portable, audited algorithm. `arboard` (maintained by 1Password) handles cross-platform clipboard access. `totp-rs` implements RFC 6238 TOTP — the same standard behind every authenticator app and AWS IAM MFA device.

---

## Stage 14 — The Forge

Human-chosen passwords are predictable — pet names, birthdays, keyboard patterns. Even "clever" substitutions like `p@ssw0rd` appear in every breach database. This stage builds a cryptographically secure password generator that draws from true OS entropy, ensuring every generated password is as random as physics allows. Without this, users will store weak passwords in a strong vault — like putting a paper lock on a steel door.

> *Every great vault needs a forge — a place where new relics are born, not from memory or habit, but from pure, unpredictable entropy. The Forge doesn't care about your pet's name or your birthday. It draws from the deepest well of randomness your operating system can provide, and hammers that chaos into passwords that would take civilizations to crack.*

> [!tip] What You'll Learn
> - **Rust concepts:** the `rand` ecosystem (`Rng` trait, `IndexedRandom`, `SeedableRng`), iterator chains with `filter` and `map`, `char` handling, the builder pattern
> - **Security concepts:** CSPRNG vs PRNG, entropy, why `OsRng` seeds ChaCha
> - **AWS parallel:** Secrets Manager `GetRandomPassword` API, KMS hardware entropy from HSMs

### The Security Foundation: Why Random Matters

Before we write a single line, let's understand *why* password generation is a security-critical operation.

**PRNG vs CSPRNG:**

A regular pseudorandom number generator (PRNG) like Python's `random` module uses a mathematical formula to produce numbers that *look* random. But if an attacker learns the internal state, they can predict every future output. Python's `random` docs literally say: *"not suitable for security purposes."*

A **cryptographically secure** PRNG (CSPRNG) has a stronger guarantee: even if an attacker sees millions of outputs, they cannot predict the next one. This is what we need for passwords.

**Our approach — two layers of security:**

```
OS entropy (hardware noise, interrupts, etc.)
    │
    ▼
SysRng (reads /dev/urandom on Linux, Security framework on macOS)
    │
    ▼  seeds
ChaCha12Rng (fast, deterministic CSPRNG with proven security)
    │
    ▼  generates
Password characters
```

Why not just use `SysRng` directly? It works, but it makes a system call for every random byte. `ChaCha12Rng` is seeded once from the OS and then generates bytes purely in userspace — much faster for generating a 32-character password that needs 32+ random selections.

> **AWS parallel:** When you call `aws secretsmanager get-random-password`, AWS uses hardware security modules (HSMs) as their entropy source — dedicated chips designed to produce true randomness from physical phenomena. Our `SysRng` is the closest equivalent on a regular machine: it gathers entropy from hardware interrupts, disk timing jitter, and other unpredictable system events.

### Step 1: The Character Pool Builder

Create `src/generator.rs`. We'll start by defining what characters can appear in a generated password:

```rust
// src/generator.rs

use rand::seq::IndexedRandom;   // provides .choose() on slices
use rand::SeedableRng;          // provides try_from_rng() for seeding
use rand_chacha::ChaCha12Rng;   // our CSPRNG
use rand::rngs::SysRng;         // OS entropy source (called OsRng in older rand versions)

/// Characters that look similar and cause confusion when reading passwords.
/// 0 vs O, 1 vs l vs I — ever mistyped one of these? That's why we exclude them.
const AMBIGUOUS_CHARS: &[char] = &['0', 'O', '1', 'l', 'I', '|'];

/// Configuration for password generation — uses the builder pattern.
pub struct GeneratorConfig {
    pub length: usize,
    pub uppercase: bool,
    pub lowercase: bool,
    pub digits: bool,
    pub symbols: bool,
    pub exclude_ambiguous: bool,
}
```

**Line-by-line:**

- `use rand::seq::IndexedRandom` — this trait adds `.choose(&mut rng)` to slices. In Python you'd use `random.choice(list)`. In Rust, the method comes from a trait that must be imported.
- `use rand::SeedableRng` — this trait provides `try_from_rng()`, which creates a deterministic RNG seeded from another RNG. Think of it as "pour entropy from source A into generator B."
- `use rand_chacha::ChaCha12Rng` — the ChaCha stream cipher with 12 rounds. ChaCha8 is faster but has a thinner security margin. ChaCha20 is the most conservative. ChaCha12 is the sweet spot — it's what `StdRng` uses internally.
- `use rand::rngs::SysRng` — a zero-sized type that reads from the OS CSPRNG. In rand 0.10, this replaces the older `OsRng` name. It's a *stateless* RNG — every call goes to the kernel.
- `AMBIGUOUS_CHARS` — characters that look alike in many fonts. Excluding them makes passwords easier to read aloud or type manually without errors.

> **Python comparison:** In Python you'd write `AMBIGUOUS = set('0O1lI|')`. Rust uses `&[char]` — a reference to a slice of `char` values. The `&` means we're borrowing the data, and since it's a `const`, it lives in the binary's read-only memory forever.

Now implement the default configuration:

```rust
impl Default for GeneratorConfig {
    fn default() -> Self {
        Self {
            length: 20,
            uppercase: true,
            lowercase: true,
            digits: true,
            symbols: true,
            exclude_ambiguous: true,
        }
    }
}
```

**Why `Default`?** This is Rust's standard trait for "give me a sensible starting point." It's like having default parameters in Python (`def generate(length=20, uppercase=True, ...)`), but as a trait that any code can call via `GeneratorConfig::default()`.

### Step 2: Building the Character Pool

Now the core logic — assembling which characters are available and picking from them:

```rust
impl GeneratorConfig {
    /// Build the pool of characters we'll randomly select from.
    fn build_pool(&self) -> Vec<char> {
        let mut pool: Vec<char> = Vec::new();

        if self.uppercase {
            pool.extend('A'..='Z');  // A, B, C, ..., Z
        }
        if self.lowercase {
            pool.extend('a'..='z');  // a, b, c, ..., z
        }
        if self.digits {
            pool.extend('0'..='9');  // 0, 1, 2, ..., 9
        }
        if self.symbols {
            pool.extend("!@#$%^&*()-_=+[]{}<>?/~".chars());
        }

        if self.exclude_ambiguous {
            pool.retain(|c| !AMBIGUOUS_CHARS.contains(c));
        }

        pool
    }
}
```

**Line-by-line:**

- `let mut pool: Vec<char> = Vec::new()` — a growable array of characters. `mut` because we'll push into it. The `: Vec<char>` type annotation is optional here (Rust can infer it), but we include it for clarity.
- `pool.extend('A'..='Z')` — `'A'..='Z'` is an *inclusive range* of chars. The `..=` means "include the end." `extend()` appends every element from the iterator. In Python: `pool.extend(chr(i) for i in range(ord('A'), ord('Z')+1))`.
- `"!@#$%^&*()-_=+[]{}<>?/~".chars()` — `.chars()` turns a string slice into an iterator of `char` values. We can't use a range here because symbols aren't contiguous in Unicode.
- `pool.retain(|c| !AMBIGUOUS_CHARS.contains(c))` — `retain` keeps only elements where the closure returns `true`. It's like Python's `pool = [c for c in pool if c not in AMBIGUOUS]`. The `|c|` is Rust's closure syntax (Python's `lambda c:`).

> **Python comparison:** `retain` is like a list comprehension filter (`[x for x in items if condition(x)]`), but it modifies the list in place instead of creating a new one. Rust prefers in-place mutation when you own the data — no allocation overhead.

### Step 3: The Generate Function

```rust
impl GeneratorConfig {
    // ... build_pool from above ...

    /// Generate a random password using a CSPRNG.
    pub fn generate(&self) -> Result<String, String> {
        let pool = self.build_pool();

        if pool.is_empty() {
            return Err("No character classes selected — nothing to generate from.".into());
        }
        if self.length == 0 {
            return Err("Password length must be at least 1.".into());
        }

        // Seed ChaCha12 from the OS entropy source.
        // SysRng reads from /dev/urandom (Linux) or Security framework (macOS).
        // try_from_rng pulls enough bytes to fully seed ChaCha12's 256-bit state.
        let mut rng = ChaCha12Rng::try_from_rng(&mut SysRng)
            .expect("OS random source unavailable — this should never happen on a normal system");

        // Pick `length` random characters from the pool.
        let password: String = (0..self.length)
            .map(|_| {
                // .choose() returns Option<&char> — None only if the slice is empty,
                // which we already checked above, so .unwrap() is safe here.
                *pool.choose(&mut rng).unwrap()
            })
            .collect();

        Ok(password)
    }
}
```

**This is the critical security code. Let's break it down carefully:**

- `ChaCha12Rng::try_from_rng(&mut SysRng)` — this is the seeding step. `SysRng` provides OS-level entropy. `try_from_rng` reads 32 bytes (256 bits) from it to initialize ChaCha12's internal state. After this, `rng` is a fast, deterministic CSPRNG that doesn't need further system calls.
  - `try_from_rng` returns `Result` because the OS source *could* theoretically fail (though it essentially never does on modern systems). We use `.expect()` with a clear message.
- `(0..self.length).map(|_| ...)` — create an iterator that runs `length` times. The `|_|` means "I don't care about the index value." In Python: `[pick_char() for _ in range(length)]`.
- `*pool.choose(&mut rng).unwrap()` — `choose` picks a random element from the slice with uniform probability. It returns `Option<&char>` — a reference to a char inside the pool. The `*` dereferences it to get the `char` value (we need owned `char`s to build a `String`). The `.unwrap()` is safe because we verified the pool isn't empty.
- `.collect()` — transforms the iterator of `char` values into a `String`. Rust's `collect` is incredibly versatile — it can build `Vec`, `String`, `HashMap`, and more, depending on the target type.

> **Python comparison:** The whole generate function is roughly:
> ```python
> import secrets
> password = ''.join(secrets.choice(pool) for _ in range(length))
> ```
> Python's `secrets` module is the CSPRNG equivalent. Never use `random.choice` for passwords!

### Step 4: Wire Into the CLI

Add the `generate` subcommand to your CLI in `src/cli.rs`:

```rust
// In your Args enum (clap derive)
#[derive(Subcommand)]
enum Commands {
    // ... existing commands ...

    /// Forge a new password from pure entropy
    Generate {
        /// Password length (default: 20)
        #[arg(short, long, default_value_t = 20)]
        length: usize,

        /// Exclude symbol characters
        #[arg(long)]
        no_symbols: bool,

        /// Exclude digit characters
        #[arg(long)]
        no_digits: bool,

        /// Include ambiguous characters (0/O, 1/l/I)
        #[arg(long)]
        allow_ambiguous: bool,

        /// Copy to clipboard instead of printing
        #[arg(short, long)]
        copy: bool,
    },
}
```

And the handler:

```rust
// In your command dispatch (main.rs or cli.rs)
Commands::Generate { length, no_symbols, no_digits, allow_ambiguous, copy } => {
    let config = GeneratorConfig {
        length,
        symbols: !no_symbols,
        digits: !no_digits,
        exclude_ambiguous: !allow_ambiguous,
        ..Default::default()  // fill remaining fields from defaults
    };

    match config.generate() {
        Ok(password) => {
            if copy {
                // We'll implement clipboard in Stage 15
                println!("(clipboard not yet implemented)");
            } else {
                println!("{}", password);
            }
        }
        Err(e) => eprintln!("Forge error: {}", e),
    }
}
```

**New Rust concept — `..Default::default()`:** This is *struct update syntax*. It says "for any fields I didn't explicitly set, use the values from `Default::default()`." It's like Python's `{**defaults, 'length': length, 'symbols': not no_symbols}` dict merge pattern.

> [!check] Checkpoint
> ```rust
> use rand::seq::IndexedRandom;
> use rand::rngs::SysRng;
> use rand::SeedableRng;
> use rand_chacha::ChaCha12Rng;
>
> const AMBIGUOUS_CHARS: &[char] = &['0', 'O', '1', 'l', 'I', '|'];
>
> pub struct GeneratorConfig {
>     pub length: usize,
>     pub uppercase: bool,
>     pub lowercase: bool,
>     pub digits: bool,
>     pub symbols: bool,
>     pub exclude_ambiguous: bool,
> }
>
> impl Default for GeneratorConfig {
>     fn default() -> Self {
>         Self {
>             length: 20,
>             uppercase: true,
>             lowercase: true,
>             digits: true,
>             symbols: true,
>             exclude_ambiguous: true,
>         }
>     }
> }
>
> impl GeneratorConfig {
>     fn build_pool(&self) -> Vec<char> {
>         let mut pool: Vec<char> = Vec::new();
>
>         if self.uppercase {
>             pool.extend('A'..='Z');
>         }
>         if self.lowercase {
>             pool.extend('a'..='z');
>         }
>         if self.digits {
>             pool.extend('0'..='9');
>         }
>         if self.symbols {
>             pool.extend("!@#$%^&*()-_=+[]{}<>?/~".chars());
>         }
>
>         if self.exclude_ambiguous {
>             pool.retain(|c| !AMBIGUOUS_CHARS.contains(c));
>         }
>
>         pool
>     }
>
>     pub fn generate(&self) -> Result<String, String> {
>         let pool = self.build_pool();
>
>         if pool.is_empty() {
>             return Err("No character classes selected — nothing to generate from.".into());
>         }
>         if self.length == 0 {
>             return Err("Password length must be at least 1.".into());
>         }
>
>         let mut rng = ChaCha12Rng::try_from_rng(&mut SysRng)
>             .expect("OS random source unavailable");
>
>         let password: String = (0..self.length)
>             .map(|_| *pool.choose(&mut rng).unwrap())
>             .collect();
>
>         Ok(password)
>     }
> }
> ```
>
> The Forge produces strong passwords, but displaying them on screen is a security risk. Stage 15 builds the Courier — clipboard copy with automatic clearing — so passwords can travel from vault to login form without ever appearing on screen.

### What to Try
2. `cargo run -- generate --length 32` — longer password
3. `cargo run -- generate --no-symbols` — alphanumeric only
4. `cargo run -- generate --allow-ambiguous` — includes 0/O/1/l/I
5. Run it 5 times — every output should be different (if they're the same, your RNG is broken!)

> [!warning] Common Mistakes
> | Mistake | Why It's Wrong | Fix |
> |---------|---------------|-----|
> | Using `rand::rng()` instead of `ChaCha12Rng` | `rand::rng()` returns `ThreadRng` which is fine for security but not portable/reproducible for testing | Use `ChaCha12Rng` seeded from `SysRng` for explicit control |
> | Forgetting `use rand::seq::IndexedRandom` | `.choose()` won't be available — you'll get "method not found" | Import the trait — Rust requires explicit trait imports |
> | Using `pool.choose(&mut rng)` without `*` | You get `&char` instead of `char`, and `collect()` builds the wrong type | Dereference with `*` to get the owned value |
> | Using `rand::random::<usize>() % pool.len()` | Modulo bias! If pool has 70 chars and usize max is not divisible by 70, some chars are slightly more likely | `.choose()` handles uniform distribution correctly |

---

## Stage 15 — The Courier

Printing a password to the terminal is a liability — it's visible to shoulder surfers, captured by screen recorders, and persisted in terminal scrollback. The clipboard is the standard transport mechanism for passwords, but it's a shared resource readable by every process on the machine. This stage builds a clipboard manager that copies the password and then automatically erases it after 30 seconds, minimizing the window of exposure.

> *A password that sits on screen is a password exposed. The Courier carries your secrets swiftly to the clipboard and then — after a brief window — burns the message. Thirty seconds. That's all you get. Copy it, paste it, and the Courier erases all trace. No clipboard manager will archive it. No shoulder-surfer will catch a second glance.*

> [!tip] What You'll Learn
> - **Rust concepts:** `std::thread::spawn`, `Arc` (atomic reference counting), `thread::sleep`, move closures, the `move` keyword
> - **Security concepts:** clipboard as a shared attack surface, clipboard managers, timed exposure windows

### Why Clipboard Security Matters

The system clipboard is **globally readable by every process on your machine**. When you Cmd+C a password, every running application can read it. Worse:

- **Clipboard managers** (macOS Paste, Windows clipboard history, Linux clipboard tools) persist clipboard contents indefinitely — your password lives in their database forever.
- **Malware** often monitors the clipboard for cryptocurrency addresses, passwords, and API keys.
- **Remote desktop** sessions may sync clipboards across machines.

Our mitigation: copy the password, wait 30 seconds, then clear the clipboard — but *only if it still contains our password*. That last part is important: if the user copies something else in the meantime, we don't want to clobber their new clipboard content.

### Step 1: The Clipboard Module

Create `src/clipboard.rs`:

```rust
// src/clipboard.rs

use arboard::Clipboard;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

/// How long (in seconds) before the clipboard is automatically cleared.
const CLEAR_DELAY_SECS: u64 = 30;

/// Copy text to the clipboard and spawn a background thread that clears it
/// after CLEAR_DELAY_SECS — but only if the clipboard still holds our text.
pub fn copy_and_clear(text: &str) -> Result<(), String> {
    // Create a clipboard instance. This can fail on headless Linux (no X11/Wayland).
    let mut clipboard = Clipboard::new()
        .map_err(|e| format!("Failed to access clipboard: {}", e))?;

    // Write our text to the clipboard.
    clipboard.set_text(text)
        .map_err(|e| format!("Failed to write to clipboard: {}", e))?;

    // Arc lets us share the password string between the main thread and the
    // background cleaner thread. Arc = "Atomic Reference Counted" — it's a
    // thread-safe smart pointer that lets multiple owners share read-only data.
    let password = Arc::new(text.to_string());
    let password_clone = Arc::clone(&password);

    // Spawn a background thread that will clear the clipboard after the delay.
    thread::spawn(move || {
        // Sleep for the configured duration.
        thread::sleep(Duration::from_secs(CLEAR_DELAY_SECS));

        // After waking up, check if the clipboard still has our password.
        let mut cb = match Clipboard::new() {
            Ok(cb) => cb,
            Err(_) => return,  // Can't access clipboard — nothing to clear
        };

        // Read current clipboard contents.
        if let Ok(current) = cb.get_text() {
            // Only clear if it's still our password.
            // If the user copied something else, leave it alone.
            if current == *password_clone {
                let _ = cb.clear();
            }
        }
    });

    Ok(())
}
```

**Let's unpack the threading concepts — these are new:**

**`Arc` (Atomic Reference Counted):**

In Python, you'd just use the string in a thread — Python's GIL handles the sharing. In Rust, you can't share data between threads without proving it's safe. `Arc` is the solution for read-only shared data:

```
Arc::new(text.to_string())  →  creates a reference-counted pointer
Arc::clone(&password)        →  increments the count (cheap, no data copy)
```

When both the main thread and background thread are done with it, the count drops to zero and the string is freed. It's like Python's reference counting, but explicit and thread-safe.

> **Python comparison:** `Arc` is conceptually similar to Python's default reference counting — every object in Python is reference-counted. The difference is Rust makes you opt in to sharing explicitly.

**`thread::spawn(move || { ... })`:**

- `thread::spawn` creates a new OS thread (like Python's `threading.Thread`).
- `move` before the closure means "take ownership of all captured variables." Without `move`, the closure would try to *borrow* `password_clone`, but the borrow might outlive the current function. `move` transfers ownership into the closure, so the thread owns its data independently.
- The thread runs in the background. When our function returns, the main thread continues while the cleaner thread sleeps.

> **Python comparison:**
> ```python
> import threading
> def clear_later(password):
>     time.sleep(30)
>     current = pyperclip.paste()
>     if current == password:
>         pyperclip.copy('')
> threading.Thread(target=clear_later, args=(password,), daemon=True).start()
> ```
> The Rust version is more explicit about ownership, but the logic is identical.

**`if let Ok(current) = cb.get_text()`:**

This is Rust's pattern matching on `Result`. It says "if `get_text()` succeeds, bind the value to `current` and run the block. If it fails, skip it." It's a concise alternative to a full `match` when you only care about one variant.

### Step 2: A Simpler Copy-Only Function

Sometimes you just want to copy without the auto-clear (e.g., for non-sensitive data):

```rust
/// Copy text to clipboard without auto-clear.
pub fn copy_only(text: &str) -> Result<(), String> {
    let mut clipboard = Clipboard::new()
        .map_err(|e| format!("Failed to access clipboard: {}", e))?;

    clipboard.set_text(text)
        .map_err(|e| format!("Failed to write to clipboard: {}", e))?;

    Ok(())
}
```

### Step 3: Wire Into `iv get --copy` and `iv generate --copy`

Update your command handlers:

```rust
// In the Generate command handler:
Commands::Generate { length, no_symbols, no_digits, allow_ambiguous, copy } => {
    let config = GeneratorConfig {
        length,
        symbols: !no_symbols,
        digits: !no_digits,
        exclude_ambiguous: !allow_ambiguous,
        ..Default::default()
    };

    match config.generate() {
        Ok(password) => {
            if copy {
                match clipboard::copy_and_clear(&password) {
                    Ok(()) => println!(
                        "Password copied to clipboard. It will be cleared in {} seconds.",
                        30
                    ),
                    Err(e) => eprintln!("Clipboard error: {}", e),
                }
            } else {
                println!("{}", password);
            }
        }
        Err(e) => eprintln!("Forge error: {}", e),
    }
}

// In the Get command handler:
Commands::Get { name, copy, show_password } => {
    // ... unlock vault, find relic ...
    if copy {
        match clipboard::copy_and_clear(&relic.password) {
            Ok(()) => println!(
                "Password for '{}' copied. Clipboard clears in 30 seconds.",
                relic.name
            ),
            Err(e) => eprintln!("Clipboard error: {}", e),
        }
    }
    // ... rest of display logic ...
}
```

> [!check] Checkpoint
> ```rust
> use arboard::Clipboard;
> use std::sync::Arc;
> use std::thread;
> use std::time::Duration;
>
> const CLEAR_DELAY_SECS: u64 = 30;
>
> pub fn copy_and_clear(text: &str) -> Result<(), String> {
>     let mut clipboard = Clipboard::new()
>         .map_err(|e| format!("Failed to access clipboard: {}", e))?;
>
>     clipboard.set_text(text)
>         .map_err(|e| format!("Failed to write to clipboard: {}", e))?;
>
>     let password = Arc::new(text.to_string());
>     let password_clone = Arc::clone(&password);
>
>     thread::spawn(move || {
>         thread::sleep(Duration::from_secs(CLEAR_DELAY_SECS));
>
>         let mut cb = match Clipboard::new() {
>             Ok(cb) => cb,
>             Err(_) => return,
>         };
>
>         if let Ok(current) = cb.get_text() {
>             if current == *password_clone {
>                 let _ = cb.clear();
>             }
>         }
>     });
>
>     Ok(())
> }
>
> pub fn copy_only(text: &str) -> Result<(), String> {
>     let mut clipboard = Clipboard::new()
>         .map_err(|e| format!("Failed to access clipboard: {}", e))?;
>
>     clipboard.set_text(text)
>         .map_err(|e| format!("Failed to write to clipboard: {}", e))?;
>
>     Ok(())
> }
> ```
>
> Passwords can now travel securely from vault to login form. But some doors require more than a password — they require proof that you're present *right now*. Stage 16 adds TOTP two-factor authentication, the same protocol behind every authenticator app and AWS IAM MFA device.

### What to Try

1. `cargo run -- generate --copy` — paste into a text editor, it should work
2. Wait 30 seconds, try pasting again — clipboard should be empty
3. `cargo run -- generate --copy`, then quickly copy something else (Cmd+C on any text), wait 30 seconds — your new clipboard content should survive (the cleaner only clears if it's still the password)
4. Try on a headless server (SSH without X forwarding) — you should get a clean error message, not a panic

### Extend it

The clear delay is hardcoded to 30 seconds. Make it configurable:

1. Add a `--clear-after <seconds>` flag to the CLI (default: 30)
2. Pass it through to `copy_and_clear`
3. Test with `--clear-after 5` so you don't have to wait 30 seconds every time

<details>
<summary>Hint</summary>

Change `copy_and_clear` to accept the delay as a parameter:

```rust
pub fn copy_and_clear(text: &str, clear_after_secs: u64) -> Result<(), String> {
    // ... same code, but use clear_after_secs instead of CLEAR_DELAY_SECS
}
```

</details>

> [!warning] Common Mistakes
> | Mistake | Why It's Wrong | Fix |
> |---------|---------------|-----|
> | Forgetting `move` on the closure | Compiler error: closure may outlive the current function | Add `move` — the thread needs to own its data |
> | Using `password` directly in the thread instead of `Arc` | The `String` would be moved into the thread, and you couldn't use it in the main thread anymore | `Arc` lets both threads share it |
> | Calling `clipboard.clear()` unconditionally | Clobbers whatever the user copied after the password | Check `get_text() == password` first |
> | Not handling `Clipboard::new()` errors | Panics on headless Linux or Wayland without proper setup | Use `map_err` to return a friendly error |

---

## Stage 16 — The Time Rune

A stolen password grants permanent access — unless the account requires a second factor that changes every 30 seconds. TOTP (Time-based One-Time Passwords) is the industry standard for 2FA, used by GitHub, AWS, Google, and virtually every service that takes security seriously. By storing TOTP secrets alongside credentials, Ironvault becomes a complete authentication tool — password and second factor in one place, one command.

> *Some doors require more than a key. They require proof that you stand before them at this very moment — not yesterday, not tomorrow, but now. The Time Rune is a glyph that changes every thirty seconds, synchronized with a distant oracle. Even if a thief steals your password, without the Time Rune, the door remains sealed.*

> [!tip] What You'll Learn
> - **Rust concepts:** integrating an external crate (`totp-rs`), working with `SystemTime`, URI string parsing, the `Option` type in practice
> - **Security concepts:** TOTP (Time-based One-Time Password), shared secrets, why base32, TOTP vs HOTP
> - **AWS parallel:** IAM MFA virtual devices use the exact same RFC 6238 TOTP standard

### How TOTP Works

TOTP is beautifully simple:

```
shared_secret + current_time → HMAC-SHA1 → 6-digit code
```

1. You and the server share a secret (the base32 string you scan from a QR code).
2. Both sides divide the current Unix timestamp by 30 (the "step") to get a time counter.
3. Both sides compute `HMAC-SHA1(secret, counter)` and extract 6 digits from the result.
4. Because both sides use the same secret and the same time, they get the same code.

The code changes every 30 seconds. A `skew` of 1 means the server also accepts the previous and next codes (to handle clock drift).

**Why base32?** The shared secret is binary data, but users need to type it manually when QR scanning fails. Base32 uses only uppercase letters and digits 2-7 — no ambiguous characters (no 0/O/1/I confusion), easy to read aloud, and case-insensitive. It's less space-efficient than base64 but much more human-friendly.

**TOTP vs HOTP:** TOTP uses *time* as the counter (changes every 30s). HOTP uses an *event counter* (increments on each use). TOTP is more common because it doesn't require synchronizing a counter between client and server.

> **AWS parallel:** When you set up a virtual MFA device in IAM (`aws iam create-virtual-mfa-device`), AWS gives you a base32 secret. Your authenticator app (Google Authenticator, Authy, 1Password) uses that secret with RFC 6238 TOTP — the exact same algorithm we're implementing. When you type a 6-digit code during `aws sts get-session-token --token-code 123456`, AWS computes the same HMAC and compares.

### Step 1: The TOTP Module

Create `src/totp.rs`:

```rust
// src/totp.rs

use totp_rs::{Algorithm, Secret, TOTP};

/// Create a TOTP instance from a base32-encoded secret string.
/// This is what you get when you manually enter a TOTP secret.
pub fn totp_from_base32(
    secret_base32: &str,
    issuer: Option<&str>,
    account: &str,
) -> Result<TOTP, String> {
    // Secret::Encoded wraps a base32 string.
    // .to_bytes() decodes it to raw bytes, which is what TOTP::new expects.
    let secret = Secret::Encoded(secret_base32.to_string());
    let secret_bytes = secret
        .to_bytes()
        .map_err(|e| format!("Invalid base32 secret: {}", e))?;

    // TOTP::new validates all parameters:
    //   - Algorithm::SHA1 — the standard, compatible with all authenticator apps
    //   - 6 digits — the standard code length
    //   - 1 skew — accept codes from 30s before/after (handles clock drift)
    //   - 30 step — new code every 30 seconds
    //   - secret_bytes — the decoded shared secret
    //   - issuer — "GitHub", "AWS", etc. (shown in authenticator apps)
    //   - account_name — "[email]" (shown in authenticator apps)
    TOTP::new(
        Algorithm::SHA1,
        6,
        1,
        30,
        secret_bytes,
        issuer.map(|s| s.to_string()),
        account.to_string(),
    )
    .map_err(|e| format!("Failed to create TOTP: {}", e))
}
```

**Line-by-line:**

- `Secret::Encoded(secret_base32.to_string())` — the `Secret` enum has two variants: `Raw(Vec<u8>)` for binary data and `Encoded(String)` for base32 strings. We use `Encoded` because users provide base32 text.
- `.to_bytes()` — decodes the base32 string to raw bytes. Returns `Result` because the string might not be valid base32.
- `TOTP::new(Algorithm::SHA1, 6, 1, 30, ...)` — constructs a TOTP generator. The `otpauth` feature (which we enabled in `Cargo.toml`) adds the `issuer` and `account_name` parameters, which are needed for generating `otpauth://` URIs.
- `issuer.map(|s| s.to_string())` — converts `Option<&str>` to `Option<String>`. The `.map()` on `Option` transforms the inner value if it's `Some`, and passes through `None` unchanged. In Python: `issuer and str(issuer)`.

### Step 2: Parse `otpauth://` URIs

When you scan a QR code from a website, it encodes an `otpauth://` URI like:

```
otpauth://totp/GitHub:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&algorithm=SHA1&digits=6&period=30
```

The `totp-rs` crate can parse these directly:

```rust
/// Create a TOTP instance from an otpauth:// URI.
/// This is what QR codes encode.
pub fn totp_from_uri(uri: &str) -> Result<TOTP, String> {
    // TOTP::from_url parses the full otpauth:// URI and extracts all parameters.
    // Requires the "otpauth" feature in Cargo.toml.
    TOTP::from_url(uri)
        .map_err(|e| format!("Invalid otpauth URI: {}", e))
}
```

That's it — one line. The crate handles parsing the URI scheme, extracting the secret, algorithm, digits, period, issuer, and account name.

### Step 3: Generate and Display Codes

```rust
/// Generate the current TOTP code and return it with the seconds remaining.
pub fn generate_code(totp: &TOTP) -> Result<(String, u64), String> {
    // generate_current() uses SystemTime::now() internally.
    // Returns the 6-digit code as a zero-padded String.
    let code = totp
        .generate_current()
        .map_err(|e| format!("Failed to generate TOTP code: {}", e))?;

    // ttl() returns how many seconds until the current code expires.
    // "Time To Live" — when this hits 0, a new code is generated.
    let ttl = totp
        .ttl()
        .map_err(|e| format!("Failed to get TTL: {}", e))?;

    Ok((code, ttl))
}
```

**Why does `generate_current()` return `Result`?** It uses `SystemTime::now()`, which on some exotic platforms could fail. On macOS/Linux it never will, but Rust's type system makes us handle the possibility. This is Rust's philosophy: *make impossible states unrepresentable, and make possible failures explicit.*

### Step 4: Wire Into the CLI

Add the TOTP commands:

```rust
#[derive(Subcommand)]
enum Commands {
    // ... existing commands ...

    /// Add a Time Rune (TOTP secret) to an existing relic
    AddTotp {
        /// Relic name or ID
        name: String,

        /// otpauth:// URI (from QR code)
        #[arg(long)]
        uri: Option<String>,
    },

    /// Show the current Time Rune code for a relic
    Totp {
        /// Relic name or ID
        name: String,

        /// Copy code to clipboard
        #[arg(short, long)]
        copy: bool,
    },
}
```

The handlers:

```rust
Commands::AddTotp { name, uri } => {
    // ... unlock vault, find relic ...

    let secret = if let Some(uri) = uri {
        // Parse the otpauth:// URI to validate it, then store just the secret.
        let totp = totp::totp_from_uri(&uri)?;
        totp.get_secret_base32()
    } else {
        // Prompt the user to paste the base32 secret manually.
        print!("Enter TOTP secret (base32): ");
        let mut input = String::new();
        std::io::stdin().read_line(&mut input).unwrap();
        let secret = input.trim().to_string();

        // Validate by trying to create a TOTP from it.
        totp::totp_from_base32(&secret, None, &relic.name)?;
        secret
    };

    relic.totp_secret = Some(secret);
    // ... save vault ...
    println!("Time Rune inscribed on '{}'.", relic.name);
}

Commands::Totp { name, copy } => {
    // ... unlock vault, find relic ...

    let secret = relic.totp_secret.as_ref()
        .ok_or("This relic has no Time Rune. Use 'iv add-totp' first.")?;

    let totp = totp::totp_from_base32(secret, None, &relic.name)?;
    let (code, ttl) = totp::generate_code(&totp)?;

    if copy {
        clipboard::copy_and_clear(&code)?;
        println!("TOTP code copied. Expires in {} seconds.", ttl);
    } else {
        // Show the code with a visual countdown.
        println!("Code: {}  (expires in {}s)", code, ttl);
    }
}
```

**New pattern — `as_ref()` on `Option`:**

`relic.totp_secret` is `Option<String>`. We don't want to *move* the string out of the relic (that would leave the relic's field empty). `as_ref()` converts `Option<String>` to `Option<&String>` — we get a reference without taking ownership. Then `.ok_or()` converts `None` into an `Err` with our message.

> **Python comparison:** This is like `secret = relic.totp_secret or raise ValueError("no TOTP")`. Rust makes the "might be None" case explicit in the type system — you can't accidentally use a `None` value without checking first.

> [!check] Checkpoint
> ```rust
> use totp_rs::{Algorithm, Secret, TOTP};
>
> pub fn totp_from_base32(
>     secret_base32: &str,
>     issuer: Option<&str>,
>     account: &str,
> ) -> Result<TOTP, String> {
>     let secret = Secret::Encoded(secret_base32.to_string());
>     let secret_bytes = secret
>         .to_bytes()
>         .map_err(|e| format!("Invalid base32 secret: {}", e))?;
>
>     TOTP::new(
>         Algorithm::SHA1,
>         6,
>         1,
>         30,
>         secret_bytes,
>         issuer.map(|s| s.to_string()),
>         account.to_string(),
>     )
>     .map_err(|e| format!("Failed to create TOTP: {}", e))
> }
>
> pub fn totp_from_uri(uri: &str) -> Result<TOTP, String> {
>     TOTP::from_url(uri)
>         .map_err(|e| format!("Invalid otpauth URI: {}", e))
> }
>
> pub fn generate_code(totp: &TOTP) -> Result<(String, u64), String> {
>     let code = totp
>         .generate_current()
>         .map_err(|e| format!("Failed to generate TOTP code: {}", e))?;
>
>     let ttl = totp
>         .ttl()
>         .map_err(|e| format!("Failed to get TTL: {}", e))?;
>
>     Ok((code, ttl))
> }
> ```
>
> With passwords generated, copied, and TOTP codes available, the vault is feature-rich — but finding a specific relic in a vault with dozens of entries requires scrolling through `iv list`. Stage 17 builds the Seeker — search and filter across all relic fields.

### What to Try

1. Use a test TOTP secret: `JBSWY3DPEHPK3PXP` (this is a well-known test vector)
2. `cargo run -- add-totp TestRelic` — paste the secret when prompted
3. `cargo run -- totp TestRelic` — should show a 6-digit code that changes every 30 seconds
4. Verify against an authenticator app: add the same secret to Google Authenticator or Authy — the codes should match!
5. Try an `otpauth://` URI: `cargo run -- add-totp TestRelic --uri "otpauth://totp/Test:user@test.com?secret=JBSWY3DPEHPK3PXP&issuer=Test"`

> [!warning] Common Mistakes
> | Mistake | Why It's Wrong | Fix |
> |---------|---------------|-----|
> | Using `Algorithm::SHA256` | Many authenticator apps silently fall back to SHA1, causing code mismatch | Stick with `Algorithm::SHA1` for compatibility |
> | Storing the raw bytes instead of base32 | Can't display the secret back to the user, harder to debug | Store the base32 string, decode when needed |
> | Not validating the secret on input | Invalid base32 strings cause panics later when generating codes | Validate by creating a `TOTP` instance immediately |
> | Forgetting the `otpauth` feature in Cargo.toml | `TOTP::from_url` and `TOTP::new` with issuer/account won't exist | `totp-rs = { version = "5.7", features = ["otpauth"] }` |

---

## Stage 17 — The Seeker

A vault with a hundred relics is useless if finding the right one takes longer than typing the password from memory. This stage builds search and filter capabilities — substring matching across all fields, chamber filtering, tag filtering — so you can locate any credential in milliseconds. It also introduces Rust's lifetime annotations, which let you return references into existing data without copying.

> *A vault with a hundred relics is useless if you can't find the one you need. The Seeker peers into every corner — names, usernames, URLs, notes, tags — and surfaces what matches. It also knows how to filter by chamber or tag, presenting results in clean, aligned columns worthy of a royal inventory.*

> [!tip] What You'll Learn
> - **Rust concepts:** iterator chains (`filter`, `any`, `map`), closures that capture variables, `String` methods (`to_lowercase`, `contains`), formatted table output with `format!` and padding
> - **No new crates** — this is pure Rust standard library

### Step 1: Substring Search Across All Fields

The search function checks a query against every text field on every relic. Create the search logic (this can live in `src/vault.rs` or a new `src/search.rs`):

```rust
// src/search.rs

use crate::model::Relic;

/// Search relics by substring match across all text fields.
/// Case-insensitive. Returns references to matching relics.
pub fn search_relics<'a>(relics: &'a [Relic], query: &str) -> Vec<&'a Relic> {
    let query_lower = query.to_lowercase();

    relics
        .iter()
        .filter(|relic| relic_matches(relic, &query_lower))
        .collect()
}

/// Check if any field on the relic contains the query (case-insensitive).
fn relic_matches(relic: &Relic, query_lower: &str) -> bool {
    // Check each text field. We chain them with || (short-circuit OR).
    relic.name.to_lowercase().contains(query_lower)
        || relic.username.to_lowercase().contains(query_lower)
        || relic.url.as_deref().unwrap_or("").to_lowercase().contains(query_lower)
        || relic.notes.as_deref().unwrap_or("").to_lowercase().contains(query_lower)
        || relic.chamber.to_lowercase().contains(query_lower)
        || relic.tags.iter().any(|tag| tag.to_lowercase().contains(query_lower))
}
```

**Let's break down the new concepts:**

**Lifetimes — `<'a>`:**

This is the first time you're seeing an explicit lifetime annotation. The signature `fn search_relics<'a>(relics: &'a [Relic], query: &str) -> Vec<&'a Relic>` says: "the references in the returned `Vec` live as long as the `relics` slice I was given." This tells the compiler that the returned references point into the input data — they don't dangle.

> **Python comparison:** In Python, you'd return a list of the same objects — no copies, no lifetime tracking. Rust needs to know that the returned references are valid. The `'a` is the compiler's proof that they are.

You won't always need to write lifetimes explicitly — Rust can often infer them. But when a function returns references, you sometimes need to tell the compiler which input they came from.

**`as_deref()` on `Option<String>`:**

`relic.url` is `Option<String>`. We want `Option<&str>` so we can call `.unwrap_or("")`. The chain is:
- `Option<String>` → `.as_deref()` → `Option<&str>` → `.unwrap_or("")` → `&str`

`as_deref()` converts `Option<String>` to `Option<&str>` by dereferencing the inner `String` to a `&str`. It's a common pattern for working with optional strings.

**`.iter().any(|tag| ...)`:**

`any()` returns `true` if *any* element in the iterator satisfies the closure. It short-circuits — stops as soon as it finds a match. In Python: `any(query in tag.lower() for tag in relic.tags)`.

### Step 2: Filter by Chamber and Tag

```rust
/// Filter relics by chamber name (exact match, case-insensitive).
pub fn filter_by_chamber<'a>(relics: &'a [Relic], chamber: &str) -> Vec<&'a Relic> {
    let chamber_lower = chamber.to_lowercase();
    relics
        .iter()
        .filter(|r| r.chamber.to_lowercase() == chamber_lower)
        .collect()
}

/// Filter relics by tag (exact match, case-insensitive).
/// Try implementing this yourself before looking at the solution.
/// Signature: pub fn filter_by_tag<'a>(relics: &'a [Relic], tag: &str) -> Vec<&'a Relic>
/// Hint: combine .filter() with .any() — check if any tag in the relic's tags matches.

<details>
<summary>Solution</summary>

```rust
pub fn filter_by_tag<'a>(relics: &'a [Relic], tag: &str) -> Vec<&'a Relic> {
    let tag_lower = tag.to_lowercase();
    relics
        .iter()
        .filter(|r| r.tags.iter().any(|t| t.to_lowercase() == tag_lower))
        .collect()
}
```

</details>

These are simpler — exact match instead of substring. Notice the pattern is always the same: `.iter().filter(|r| condition).collect()`. This is Rust's equivalent of Python's list comprehension `[r for r in relics if condition(r)]`.

### Step 3: Formatted Table Output

Now let's display results in a clean table:

```rust
/// Print relics in a formatted table.
pub fn print_relic_table(relics: &[&Relic]) {
    if relics.is_empty() {
        println!("No relics found.");
        return;
    }

    // Calculate column widths based on actual data.
    // We need the max width of each column to align them.
    let name_width = relics.iter().map(|r| r.name.len()).max().unwrap_or(4).max(4);
    let user_width = relics.iter().map(|r| r.username.len()).max().unwrap_or(8).max(8);
    let chamber_width = relics.iter().map(|r| r.chamber.len()).max().unwrap_or(7).max(7);

    // Print header
    println!(
        "{:<name_w$}  {:<user_w$}  {:<cham_w$}  Tags",
        "Name", "Username", "Chamber",
        name_w = name_width,
        user_w = user_width,
        cham_w = chamber_width,
    );

    // Print separator
    println!(
        "{:-<name_w$}  {:-<user_w$}  {:-<cham_w$}  ----",
        "", "", "",
        name_w = name_width,
        user_w = user_width,
        cham_w = chamber_width,
    );

    // Print each relic
    for relic in relics {
        let tags = relic.tags.join(", ");
        println!(
            "{:<name_w$}  {:<user_w$}  {:<cham_w$}  {}",
            relic.name, relic.username, relic.chamber, tags,
            name_w = name_width,
            user_w = user_width,
            cham_w = chamber_width,
        );
    }

    println!("\n{} relic(s) found.", relics.len());
}
```

**Format string syntax:**

- `{:<20}` — left-align, pad to 20 characters (like Python's `f"{'text':<20}"`)
- `{:<name_w$}` — left-align, pad to the value of `name_w` (the `$` means "use this variable as the width")
- `{:-<20}` — left-align, pad with `-` characters (creates separator lines)

> **Python comparison:**
> ```python
> print(f"{'Name':<{name_width}}  {'Username':<{user_width}}")
> ```
> Rust's format syntax is very similar to Python's f-strings, just with `$` for variable widths.

### Step 4: Wire Into the CLI

```rust
#[derive(Subcommand)]
enum Commands {
    // ... existing commands ...

    /// Search the vault for relics matching a query
    Search {
        /// Search query (matches name, username, url, notes, tags)
        query: String,
    },

    /// List relics in the vault
    List {
        /// Filter by chamber
        #[arg(long)]
        chamber: Option<String>,

        /// Filter by tag
        #[arg(long)]
        tag: Option<String>,
    },
}
```

```rust
Commands::Search { query } => {
    // ... unlock vault ...
    let results = search::search_relics(&vault.relics, &query);
    search::print_relic_table(&results);
}

Commands::List { chamber, tag } => {
    // ... unlock vault ...
    let results: Vec<&Relic> = if let Some(ref ch) = chamber {
        search::filter_by_chamber(&vault.relics, ch)
    } else if let Some(ref t) = tag {
        search::filter_by_tag(&vault.relics, t)
    } else {
        vault.relics.iter().collect()
    };
    search::print_relic_table(&results);
}
```

**`if let Some(ref ch) = chamber`:** The `ref` keyword borrows the inner value instead of moving it out of the `Option`. Without `ref`, the `String` inside `Some` would be moved, and `chamber` would be consumed. With `ref`, we get `&String` — a reference we can pass to our filter function.

> [!check] Checkpoint
> ```rust
> use crate::model::Relic;
>
> pub fn search_relics<'a>(relics: &'a [Relic], query: &str) -> Vec<&'a Relic> {
>     let query_lower = query.to_lowercase();
>     relics
>         .iter()
>         .filter(|relic| relic_matches(relic, &query_lower))
>         .collect()
> }
>
> fn relic_matches(relic: &Relic, query_lower: &str) -> bool {
>     relic.name.to_lowercase().contains(query_lower)
>         || relic.username.to_lowercase().contains(query_lower)
>         || relic.url.as_deref().unwrap_or("").to_lowercase().contains(query_lower)
>         || relic.notes.as_deref().unwrap_or("").to_lowercase().contains(query_lower)
>         || relic.chamber.to_lowercase().contains(query_lower)
>         || relic.tags.iter().any(|tag| tag.to_lowercase().contains(query_lower))
> }
>
> pub fn filter_by_chamber<'a>(relics: &'a [Relic], chamber: &str) -> Vec<&'a Relic> {
>     let chamber_lower = chamber.to_lowercase();
>     relics
>         .iter()
>         .filter(|r| r.chamber.to_lowercase() == chamber_lower)
>         .collect()
> }
>
> pub fn filter_by_tag<'a>(relics: &'a [Relic], tag: &str) -> Vec<&'a Relic> {
>     let tag_lower = tag.to_lowercase();
>     relics
>         .iter()
>         .filter(|r| r.tags.iter().any(|t| t.to_lowercase() == tag_lower))
>         .collect()
> }
>
> pub fn print_relic_table(relics: &[&Relic]) {
>     if relics.is_empty() {
>         println!("No relics found.");
>         return;
>     }
>
>     let name_width = relics.iter().map(|r| r.name.len()).max().unwrap_or(4).max(4);
>     let user_width = relics.iter().map(|r| r.username.len()).max().unwrap_or(8).max(8);
>     let chamber_width = relics.iter().map(|r| r.chamber.len()).max().unwrap_or(7).max(7);
>
>     println!(
>         "{:<name_w$}  {:<user_w$}  {:<cham_w$}  Tags",
>         "Name", "Username", "Chamber",
>         name_w = name_width,
>         user_w = user_width,
>         cham_w = chamber_width,
>     );
>     println!(
>         "{:-<name_w$}  {:-<user_w$}  {:-<cham_w$}  ----",
>         "", "", "",
>         name_w = name_width,
>         user_w = user_width,
>         cham_w = chamber_width,
>     );
>
>     for relic in relics {
>         let tags = relic.tags.join(", ");
>         println!(
>             "{:<name_w$}  {:<user_w$}  {:<cham_w$}  {}",
>             relic.name, relic.username, relic.chamber, tags,
>             name_w = name_width,
>             user_w = user_width,
>             cham_w = chamber_width,
>         );
>     }
>
>     println!("\n{} relic(s) found.", relics.len());
> }
> ```
>
> You can find any relic instantly. But credentials aren't static — passwords rotate, accounts move between teams, URLs change. Stage 18 builds the Scribe, an interactive editor that lets you reshape any relic field by field.

### Write a test

Search is a pure function — test it:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Relic;
    use chrono::Utc;

    fn test_relic(name: &str, chamber: &str, tags: &[&str]) -> Relic {
        Relic {
            id: "test".into(),
            name: name.into(),
            username: "user@test.com".into(),
            password: "secret".into(),
            url: None,
            chamber: chamber.into(),
            tags: tags.iter().map(|t| t.to_string()).collect(),
            notes: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    #[test]
    fn search_matches_name_case_insensitive() {
        let relics = vec![
            test_relic("GitHub", "Armory", &["dev"]),
            test_relic("Gmail", "Library", &["email"]),
        ];
        let results = search_relics(&relics, "git");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "GitHub");
    }

    #[test]
    fn filter_by_tag_works() {
        let relics = vec![
            test_relic("GitHub", "Armory", &["dev", "git"]),
            test_relic("Gmail", "Library", &["email"]),
        ];
        let results = filter_by_tag(&relics, "dev");
        assert_eq!(results.len(), 1);
    }
}
```

### What to Try
2. `cargo run -- search github` — should find relics with "github" in any field
3. `cargo run -- search dev` — should match tags containing "dev"
4. `cargo run -- list --chamber Armory` — only relics in the Armory
5. `cargo run -- list --tag work` — only relics tagged "work"
6. `cargo run -- list` — all relics, nicely formatted

> [!warning] Common Mistakes
> | Mistake | Why It's Wrong | Fix |
> |---------|---------------|-----|
> | Forgetting `to_lowercase()` on both sides | Search becomes case-sensitive — "GitHub" won't match "github" | Always lowercase both the query and the field |
> | Using `==` instead of `contains` for search | Only exact matches work — searching "git" won't find "GitHub" | Use `contains` for substring matching |
> | Returning `Vec<Relic>` instead of `Vec<&Relic>` | Clones every matching relic — wasteful for large vaults | Return references with lifetime annotations |
> | Hardcoding column widths | Table looks bad when names are longer than expected | Calculate widths from actual data with `.map().max()` |

---

## Stage 18 — The Scribe

Credentials are living things — passwords get rotated, usernames change when companies rebrand, accounts move between teams. Deleting and re-creating a relic just to change one field is tedious and loses the creation timestamp. This stage builds an interactive editor that shows current values and lets you overwrite or keep each field with a single keystroke. It also introduces mutable references (`&mut`), Rust's mechanism for controlled in-place mutation.

> *Relics are not carved in stone. Names change, passwords rotate, accounts move between chambers. The Scribe lets you reshape any relic — field by field — showing you what exists and letting you overwrite or keep each value with a single keystroke. Press Enter to keep, type to replace.*

> [!tip] What You'll Learn
> - **Rust concepts:** mutable references (`&mut`), `Option::unwrap_or`, conditional mutation, reading user input with `stdin`, the `trim()` and `is_empty()` pattern
> - **No new crates** — standard library I/O only

### Step 1: The Interactive Edit Prompt

The UX pattern: show the current value, let the user type a replacement or press Enter to keep it. Create the edit logic:

```rust
// src/edit.rs (or add to an existing module)

use std::io::{self, Write};
use crate::model::Relic;
use crate::generator::GeneratorConfig;

/// Prompt the user for a new value. If they press Enter (empty input),
/// keep the current value.
fn prompt_field(field_name: &str, current: &str) -> String {
    // Show current value and prompt for new one.
    print!("{} [{}]: ", field_name, current);

    // Flush stdout so the prompt appears before we read input.
    // Without this, the prompt might not display because stdout is line-buffered.
    io::stdout().flush().unwrap();

    let mut input = String::new();
    io::stdin().read_line(&mut input).unwrap();

    let trimmed = input.trim();

    if trimmed.is_empty() {
        // User pressed Enter — keep the current value.
        current.to_string()
    } else {
        trimmed.to_string()
    }
}
```

**Why `io::stdout().flush()`?**

In most terminals, `stdout` is *line-buffered* — output only appears when a newline is written. Since our `print!` doesn't end with `\n` (we want the cursor on the same line as the prompt), we need to manually flush. Without it, the user sees a blank line and has to type blind.

> **Python comparison:** Python's `input("Name [current]: ")` handles this automatically. In Rust, `print!` + `flush` + `read_line` is the manual equivalent. It's more verbose but gives you full control.

**`trim()` and `is_empty()`:**

`read_line` includes the trailing newline (`\n`). `trim()` removes it (and any other whitespace). Then `is_empty()` checks if the user typed anything. This two-step pattern is idiomatic Rust for "did the user provide input?"

### Step 2: The Optional Field Prompt

For fields that are `Option<String>` (like `url` and `notes`):

```rust
/// Prompt for an optional field. Shows "(none)" if currently empty.
/// User can type "none" or "clear" to explicitly set it to None.
fn prompt_optional_field(field_name: &str, current: &Option<String>) -> Option<String> {
    let display = current.as_deref().unwrap_or("(none)");
    print!("{} [{}]: ", field_name, display);
    io::stdout().flush().unwrap();

    let mut input = String::new();
    io::stdin().read_line(&mut input).unwrap();

    let trimmed = input.trim();

    if trimmed.is_empty() {
        // Keep current value
        current.clone()
    } else if trimmed.eq_ignore_ascii_case("none") || trimmed.eq_ignore_ascii_case("clear") {
        // Explicitly clear the field
        None
    } else {
        Some(trimmed.to_string())
    }
}
```

**`current.clone()`:** We need to return an owned `Option<String>`, but `current` is a reference (`&Option<String>`). `.clone()` creates a deep copy. For small strings like URLs, this is fine.

**`eq_ignore_ascii_case`:** Case-insensitive comparison for ASCII strings. More efficient than `to_lowercase()` when you just need equality.

### Step 3: The Tags Prompt

Tags are a `Vec<String>`, so they need special handling:

```rust
/// Prompt for tags. Shows current tags, accepts comma-separated new tags.
fn prompt_tags(current: &[String]) -> Vec<String> {
    let display = if current.is_empty() {
        "(none)".to_string()
    } else {
        current.join(", ")
    };

    print!("Tags [{}]: ", display);
    io::stdout().flush().unwrap();

    let mut input = String::new();
    io::stdin().read_line(&mut input).unwrap();

    let trimmed = input.trim();

    if trimmed.is_empty() {
        current.to_vec()
    } else if trimmed.eq_ignore_ascii_case("none") || trimmed.eq_ignore_ascii_case("clear") {
        Vec::new()
    } else {
        trimmed
            .split(',')
            .map(|t| t.trim().to_string())
            .filter(|t| !t.is_empty())
            .collect()
    }
}
```

**Iterator chain breakdown:**

```rust
trimmed.split(',')              // "dev, git, work" → ["dev", " git", " work"]
    .map(|t| t.trim().to_string()) // → ["dev", "git", "work"]
    .filter(|t| !t.is_empty())     // remove empty strings from "tag1,,tag2"
    .collect()                      // → Vec<String>
```

This is the same pattern as Python's `[t.strip() for t in input.split(',') if t.strip()]`.

### Step 4: The Full Edit Command

Now tie it all together:

```rust
/// Interactively edit a relic. Modifies the relic in place.
pub fn edit_relic(relic: &mut Relic, regenerate_password: bool) {
    println!("Editing relic '{}'. Press Enter to keep current value.\n", relic.name);

    relic.name = prompt_field("Name", &relic.name);
    relic.username = prompt_field("Username", &relic.username);

    if regenerate_password {
        // Generate a new password using defaults.
        match GeneratorConfig::default().generate() {
            Ok(new_password) => {
                println!("Password: (regenerated)");
                relic.password = new_password;
            }
            Err(e) => eprintln!("Failed to generate password: {}", e),
        }
    } else {
        // Don't show the actual password — just indicate it exists.
        print!("Password [********] (press Enter to keep, or type new): ");
        io::stdout().flush().unwrap();

        let mut input = String::new();
        io::stdin().read_line(&mut input).unwrap();
        let trimmed = input.trim();

        if !trimmed.is_empty() {
            relic.password = trimmed.to_string();
        }
    }

    relic.url = prompt_optional_field("URL", &relic.url);
    relic.chamber = prompt_field("Chamber", &relic.chamber);
    relic.tags = prompt_tags(&relic.tags);
    relic.notes = prompt_optional_field("Notes", &relic.notes);

    // Update the timestamp.
    relic.updated_at = chrono::Utc::now();

    println!("\nRelic '{}' updated.", relic.name);
}
```

**The key Rust concept here — `&mut Relic`:**

This is a *mutable reference*. It means "I can read and write this relic, but I don't own it." The relic still lives in the vault's `Vec<Relic>` — we're just borrowing it temporarily to make changes.

> **Python comparison:** In Python, you'd just pass the object and mutate it — everything is a reference by default. In Rust, you must explicitly ask for mutation permission with `&mut`. This prevents accidental mutations and makes it clear which functions modify their arguments.

**Rust's borrowing rule:** You can have *either* one `&mut` reference *or* any number of `&` references, but never both at the same time. This prevents data races at compile time.

### Step 5: Wire Into the CLI

```rust
#[derive(Subcommand)]
enum Commands {
    // ... existing commands ...

    /// Reshape a relic's properties
    Edit {
        /// Relic name or ID
        name: String,

        /// Regenerate the password
        #[arg(long)]
        generate: bool,
    },
}
```

```rust
Commands::Edit { name, generate } => {
    // ... unlock vault ...

    // Find the relic by name — we need a mutable reference.
    let relic = vault.relics
        .iter_mut()
        .find(|r| r.name.eq_ignore_ascii_case(&name) || r.id == name)
        .ok_or(format!("Relic '{}' not found.", name))?;

    edit::edit_relic(relic, generate);
    // ... save vault ...
}
```

**`iter_mut()` vs `iter()`:** `iter()` gives `&Relic` (read-only references). `iter_mut()` gives `&mut Relic` (mutable references). Since we need to modify the relic, we use `iter_mut()`. The `.find()` method returns `Option<&mut Relic>`.

> [!check] Checkpoint
> ```rust
> use std::io::{self, Write};
> use crate::model::Relic;
> use crate::generator::GeneratorConfig;
>
> fn prompt_field(field_name: &str, current: &str) -> String {
>     print!("{} [{}]: ", field_name, current);
>     io::stdout().flush().unwrap();
>
>     let mut input = String::new();
>     io::stdin().read_line(&mut input).unwrap();
>     let trimmed = input.trim();
>
>     if trimmed.is_empty() {
>         current.to_string()
>     } else {
>         trimmed.to_string()
>     }
> }
>
> fn prompt_optional_field(field_name: &str, current: &Option<String>) -> Option<String> {
>     let display = current.as_deref().unwrap_or("(none)");
>     print!("{} [{}]: ", field_name, display);
>     io::stdout().flush().unwrap();
>
>     let mut input = String::new();
>     io::stdin().read_line(&mut input).unwrap();
>     let trimmed = input.trim();
>
>     if trimmed.is_empty() {
>         current.clone()
>     } else if trimmed.eq_ignore_ascii_case("none") || trimmed.eq_ignore_ascii_case("clear") {
>         None
>     } else {
>         Some(trimmed.to_string())
>     }
> }
>
> fn prompt_tags(current: &[String]) -> Vec<String> {
>     let display = if current.is_empty() {
>         "(none)".to_string()
>     } else {
>         current.join(", ")
>     };
>
>     print!("Tags [{}]: ", display);
>     io::stdout().flush().unwrap();
>
>     let mut input = String::new();
>     io::stdin().read_line(&mut input).unwrap();
>     let trimmed = input.trim();
>
>     if trimmed.is_empty() {
>         current.to_vec()
>     } else if trimmed.eq_ignore_ascii_case("none") || trimmed.eq_ignore_ascii_case("clear") {
>         Vec::new()
>     } else {
>         trimmed
>             .split(',')
>             .map(|t| t.trim().to_string())
>             .filter(|t| !t.is_empty())
>             .collect()
>     }
> }
>
> pub fn edit_relic(relic: &mut Relic, regenerate_password: bool) {
>     println!("Editing relic '{}'. Press Enter to keep current value.\n", relic.name);
>
>     relic.name = prompt_field("Name", &relic.name);
>     relic.username = prompt_field("Username", &relic.username);
>
>     if regenerate_password {
>         match GeneratorConfig::default().generate() {
>             Ok(new_password) => {
>                 println!("Password: (regenerated)");
>                 relic.password = new_password;
>             }
>             Err(e) => eprintln!("Failed to generate password: {}", e),
>         }
>     } else {
>         print!("Password [********] (press Enter to keep, or type new): ");
>         io::stdout().flush().unwrap();
>
>         let mut input = String::new();
>         io::stdin().read_line(&mut input).unwrap();
>         let trimmed = input.trim();
>
>         if !trimmed.is_empty() {
>             relic.password = trimmed.to_string();
>         }
>     }
>
>     relic.url = prompt_optional_field("URL", &relic.url);
>     relic.chamber = prompt_field("Chamber", &relic.chamber);
>     relic.tags = prompt_tags(&relic.tags);
>     relic.notes = prompt_optional_field("Notes", &relic.notes);
>
>     relic.updated_at = chrono::Utc::now();
>
>     println!("\nRelic '{}' updated.", relic.name);
> }
> ```
>
> Individual relics can be reshaped, but the chambers themselves — the organizational structure of the vault — are still fixed at creation time. Stage 19 builds the Chamber Architect, letting you create, rename, and safely delete the categories that organize your credentials.

### What to Try
2. `cargo run -- edit GitHub --generate` — regenerate the password automatically
3. Try setting a URL to "none" — it should become `None`
4. Try entering tags as "dev, git, work" — should parse into three separate tags
5. Try entering empty tags ("clear") — should remove all tags

> [!warning] Common Mistakes
> | Mistake | Why It's Wrong | Fix |
> |---------|---------------|-----|
> | Forgetting `io::stdout().flush()` | Prompt doesn't appear before input — user types blind | Always flush after `print!` (no newline) |
> | Using `iter()` instead of `iter_mut()` | Can't modify the relic — compiler error about immutable reference | Use `iter_mut()` when you need to mutate |
> | Showing the actual password in the prompt | Shoulder-surfing risk — defeats the purpose of hidden passwords | Show `[********]` instead |
> | Not updating `updated_at` | Audit trail is broken — can't tell when a relic was last modified | Set `relic.updated_at = Utc::now()` after changes |

---

## Stage 19 — The Chamber Architect

The default chambers (Armory, Treasury, Library, Crypt) won't fit every user's workflow. A developer might need "Infrastructure" and "SaaS"; a finance team might need "Banking" and "Trading." This stage makes the organizational structure dynamic — create new chambers, rename existing ones, and safely delete empty ones. The defensive deletion pattern (requiring `--force` for non-empty chambers) prevents accidental data loss, a principle you'll see in every serious CLI tool.

> *A vault without organization is a vault in chaos. The Chamber Architect designs the rooms where relics are stored — creating new chambers for new purposes, renaming them as needs evolve, and demolishing empty ones when they've served their time. But a chamber full of relics cannot be destroyed without deliberate force.*

> [!tip] What You'll Learn
> - **Rust concepts:** `HashMap` operations (`insert`, `remove`, `contains_key`, `keys`), iterating and mutating a `Vec`, confirmation prompts, the `Entry` API
> - **Design pattern:** defensive deletion (require empty or explicit `--force`)

### Step 1: List Chambers with Relic Counts

Create `src/chambers.rs`:

```rust
// src/chambers.rs

use std::collections::HashMap;
use std::io::{self, Write};
use crate::model::{Chamber, Relic, Vault};

/// List all chambers with the number of relics in each.
pub fn list_chambers(vault: &Vault) {
    if vault.chambers.is_empty() {
        println!("No chambers exist. Create one with 'iv chambers add <name>'.");
        return;
    }

    // Count relics per chamber.
    // We iterate over all relics and tally them by chamber name.
    let mut counts: HashMap<&str, usize> = HashMap::new();
    for relic in &vault.relics {
        *counts.entry(relic.chamber.as_str()).or_insert(0) += 1;
    }

    // Sort chamber names for consistent output.
    let mut names: Vec<&String> = vault.chambers.keys().collect();
    names.sort();

    // Calculate column width.
    let name_width = names.iter().map(|n| n.len()).max().unwrap_or(7).max(7);

    println!(
        "{:<name_w$}  {:<6}  Description",
        "Chamber", "Relics",
        name_w = name_width,
    );
    println!(
        "{:-<name_w$}  {:-<6}  -----------",
        "", "",
        name_w = name_width,
    );

    for name in &names {
        let chamber = &vault.chambers[name.as_str()];
        let count = counts.get(name.as_str()).unwrap_or(&0);
        println!(
            "{:<name_w$}  {:<6}  {} {}",
            name, count, chamber.icon, chamber.description,
            name_w = name_width,
        );
    }

    println!("\n{} chamber(s).", vault.chambers.len());
}
```

**New concept — `HashMap::entry()` and `or_insert()`:**

```rust
*counts.entry(relic.chamber.as_str()).or_insert(0) += 1;
```

This is Rust's elegant way to handle "get or create" in a HashMap. Let's break it down:

1. `counts.entry(key)` — looks up the key and returns an `Entry` enum: either `Occupied` (key exists) or `Vacant` (key doesn't exist).
2. `.or_insert(0)` — if vacant, insert `0` and return a mutable reference to it. If occupied, just return a mutable reference to the existing value.
3. `*... += 1` — dereference the mutable reference and increment.

> **Python comparison:** `counts[chamber] = counts.get(chamber, 0) + 1` or using `collections.Counter`. Rust's `Entry` API is more verbose but avoids the double lookup that Python's `get` + assignment does.

> **Python comparison:** `counts[chamber] = counts.get(chamber, 0) + 1`. Same double-lookup issue.

### Step 2: Add a Chamber

```rust
/// Add a new chamber to the vault.
pub fn add_chamber(vault: &mut Vault, name: &str) -> Result<(), String> {
    // Check if it already exists (case-insensitive).
    let exists = vault.chambers.keys().any(|k| k.eq_ignore_ascii_case(name));
    if exists {
        return Err(format!("Chamber '{}' already exists.", name));
    }

    // Prompt for optional details.
    print!("Icon (emoji, e.g. ⚔️): ");
    io::stdout().flush().unwrap();
    let mut icon = String::new();
    io::stdin().read_line(&mut icon).unwrap();
    let icon = icon.trim().to_string();

    print!("Description: ");
    io::stdout().flush().unwrap();
    let mut desc = String::new();
    io::stdin().read_line(&mut desc).unwrap();
    let desc = desc.trim().to_string();

    vault.chambers.insert(
        name.to_string(),
        Chamber {
            icon: if icon.is_empty() { "📦".to_string() } else { icon },
            description: if desc.is_empty() { String::new() } else { desc },
        },
    );

    println!("Chamber '{}' created.", name);
    Ok(())
}
```

**`HashMap::insert`** returns `Option<V>` — the old value if the key already existed, or `None` if it's new. We don't use the return value here since we already checked for duplicates.

### Step 3: Rename a Chamber

Renaming is interesting because we need to update both the `chambers` HashMap *and* every relic that references the old name:

```rust
/// Rename a chamber. Updates all relics that reference it.
pub fn rename_chamber(vault: &mut Vault, old_name: &str, new_name: &str) -> Result<(), String> {
    // Find the actual key (case-insensitive lookup).
    let actual_key = vault.chambers.keys()
        .find(|k| k.eq_ignore_ascii_case(old_name))
        .cloned()  // Clone the String so we can use it after releasing the borrow
        .ok_or(format!("Chamber '{}' not found.", old_name))?;

    // Check new name doesn't conflict.
    let conflict = vault.chambers.keys().any(|k| k.eq_ignore_ascii_case(new_name));
    if conflict {
        return Err(format!("Chamber '{}' already exists.", new_name));
    }

    // Remove old entry, insert with new name.
    let chamber = vault.chambers.remove(&actual_key).unwrap();
    vault.chambers.insert(new_name.to_string(), chamber);

    // Update all relics that were in the old chamber.
    for relic in &mut vault.relics {
        if relic.chamber.eq_ignore_ascii_case(old_name) {
            relic.chamber = new_name.to_string();
        }
    }

    println!(
        "Chamber '{}' renamed to '{}'. {} relic(s) updated.",
        actual_key,
        new_name,
        vault.relics.iter().filter(|r| r.chamber == new_name).count(),
    );
    Ok(())
}
```

**Why `.cloned()` on line 4?**

`vault.chambers.keys()` returns an iterator of `&String` — references into the HashMap. If we hold onto one of those references, we can't mutate the HashMap later (Rust's borrowing rules: can't have `&` and `&mut` at the same time). `.cloned()` converts `&String` to an owned `String`, releasing the borrow so we can call `.remove()` and `.insert()` afterward.

> **Python comparison:** In Python, you'd just do `old_key = next(k for k in chambers if k.lower() == old_name.lower())` and then mutate freely. Rust's borrow checker forces you to think about when you're reading vs. writing — which prevents a whole class of bugs where you modify a collection while iterating over it.

**`for relic in &mut vault.relics`:** This iterates with mutable references, letting us update each relic's `chamber` field in place.

### Step 4: Delete a Chamber (with Safety)

```rust
/// Delete a chamber. Requires it to be empty unless --force is used.
pub fn delete_chamber(vault: &mut Vault, name: &str, force: bool) -> Result<(), String> {
    // Find the actual key.
    let actual_key = vault.chambers.keys()
        .find(|k| k.eq_ignore_ascii_case(name))
        .cloned()
        .ok_or(format!("Chamber '{}' not found.", name))?;

    // Count relics in this chamber.
    let relic_count = vault.relics
        .iter()
        .filter(|r| r.chamber.eq_ignore_ascii_case(name))
        .count();

    if relic_count > 0 && !force {
        return Err(format!(
            "Chamber '{}' contains {} relic(s). Use --force to move them to 'Unsorted'.",
            actual_key, relic_count,
        ));
    }

    if relic_count > 0 && force {
        // Confirmation prompt for destructive action.
        print!(
            "Move {} relic(s) from '{}' to 'Unsorted' and delete the chamber? [y/N]: ",
            relic_count, actual_key,
        );
        io::stdout().flush().unwrap();

        let mut input = String::new();
        io::stdin().read_line(&mut input).unwrap();

        if !input.trim().eq_ignore_ascii_case("y") {
            println!("Cancelled.");
            return Ok(());
        }

        // Move relics to "Unsorted".
        for relic in &mut vault.relics {
            if relic.chamber.eq_ignore_ascii_case(name) {
                relic.chamber = "Unsorted".to_string();
            }
        }

        // Ensure "Unsorted" chamber exists.
        vault.chambers.entry("Unsorted".to_string()).or_insert(Chamber {
            icon: "📦".to_string(),
            description: "Relics without a chamber".to_string(),
        });
    }

    vault.chambers.remove(&actual_key);
    println!("Chamber '{}' deleted.", actual_key);
    Ok(())
}
```

**Design decision — defensive deletion:**

We require `--force` to delete a non-empty chamber. This is a common CLI pattern (think `rm` vs `rm -rf`). The confirmation prompt adds a second layer of protection. This is defense in depth applied to UX.

**`vault.chambers.entry("Unsorted".to_string()).or_insert(...)`:** The `Entry` API again — this time to ensure the "Unsorted" fallback chamber exists. If it already exists, `or_insert` does nothing. If it doesn't, it creates it.

### Step 5: Wire Into the CLI

```rust
#[derive(Subcommand)]
enum Commands {
    // ... existing commands ...

    /// Manage vault chambers (categories)
    Chambers {
        #[command(subcommand)]
        action: Option<ChamberAction>,
    },
}

#[derive(Subcommand)]
enum ChamberAction {
    /// Create a new chamber
    Add {
        /// Chamber name
        name: String,
    },
    /// Rename a chamber
    Rename {
        /// Current name
        old: String,
        /// New name
        new: String,
    },
    /// Delete a chamber
    Delete {
        /// Chamber name
        name: String,
        /// Force delete even if chamber has relics
        #[arg(long)]
        force: bool,
    },
}
```

```rust
Commands::Chambers { action } => {
    // ... unlock vault ...
    match action {
        None => {
            // No subcommand — just list chambers.
            chambers::list_chambers(&vault);
        }
        Some(ChamberAction::Add { name }) => {
            chambers::add_chamber(&mut vault, &name)?;
            // ... save vault ...
        }
        Some(ChamberAction::Rename { old, new }) => {
            chambers::rename_chamber(&mut vault, &old, &new)?;
            // ... save vault ...
        }
        Some(ChamberAction::Delete { name, force }) => {
            chambers::delete_chamber(&mut vault, &name, force)?;
            // ... save vault ...
        }
    }
}
```

**Nested subcommands:** `iv chambers add Armory` uses clap's nested subcommand feature. The `Option<ChamberAction>` means `iv chambers` alone (no subcommand) is valid — it lists chambers.

> [!check] Checkpoint
> ```rust
> use std::collections::HashMap;
> use std::io::{self, Write};
> use crate::model::{Chamber, Relic, Vault};
>
> pub fn list_chambers(vault: &Vault) {
>     if vault.chambers.is_empty() {
>         println!("No chambers exist. Create one with 'iv chambers add <name>'.");
>         return;
>     }
>
>     let mut counts: HashMap<&str, usize> = HashMap::new();
>     for relic in &vault.relics {
>         *counts.entry(relic.chamber.as_str()).or_insert(0) += 1;
>     }
>
>     let mut names: Vec<&String> = vault.chambers.keys().collect();
>     names.sort();
>
>     let name_width = names.iter().map(|n| n.len()).max().unwrap_or(7).max(7);
>
>     println!(
>         "{:<name_w$}  {:<6}  Description",
>         "Chamber", "Relics",
>         name_w = name_width,
>     );
>     println!(
>         "{:-<name_w$}  {:-<6}  -----------",
>         "", "",
>         name_w = name_width,
>     );
>
>     for name in &names {
>         let chamber = &vault.chambers[name.as_str()];
>         let count = counts.get(name.as_str()).unwrap_or(&0);
>         println!(
>             "{:<name_w$}  {:<6}  {} {}",
>             name, count, chamber.icon, chamber.description,
>             name_w = name_width,
>         );
>     }
>
>     println!("\n{} chamber(s).", vault.chambers.len());
> }
>
> pub fn add_chamber(vault: &mut Vault, name: &str) -> Result<(), String> {
>     let exists = vault.chambers.keys().any(|k| k.eq_ignore_ascii_case(name));
>     if exists {
>         return Err(format!("Chamber '{}' already exists.", name));
>     }
>
>     print!("Icon (emoji, e.g. ⚔️): ");
>     io::stdout().flush().unwrap();
>     let mut icon = String::new();
>     io::stdin().read_line(&mut icon).unwrap();
>     let icon = icon.trim().to_string();
>
>     print!("Description: ");
>     io::stdout().flush().unwrap();
>     let mut desc = String::new();
>     io::stdin().read_line(&mut desc).unwrap();
>     let desc = desc.trim().to_string();
>
>     vault.chambers.insert(
>         name.to_string(),
>         Chamber {
>             icon: if icon.is_empty() { "📦".to_string() } else { icon },
>             description: if desc.is_empty() { String::new() } else { desc },
>         },
>     );
>
>     println!("Chamber '{}' created.", name);
>     Ok(())
> }
>
> pub fn rename_chamber(vault: &mut Vault, old_name: &str, new_name: &str) -> Result<(), String> {
>     let actual_key = vault.chambers.keys()
>         .find(|k| k.eq_ignore_ascii_case(old_name))
>         .cloned()
>         .ok_or(format!("Chamber '{}' not found.", old_name))?;
>
>     let conflict = vault.chambers.keys().any(|k| k.eq_ignore_ascii_case(new_name));
>     if conflict {
>         return Err(format!("Chamber '{}' already exists.", new_name));
>     }
>
>     let chamber = vault.chambers.remove(&actual_key).unwrap();
>     vault.chambers.insert(new_name.to_string(), chamber);
>
>     for relic in &mut vault.relics {
>         if relic.chamber.eq_ignore_ascii_case(old_name) {
>             relic.chamber = new_name.to_string();
>         }
>     }
>
>     println!(
>         "Chamber '{}' renamed to '{}'. {} relic(s) updated.",
>         actual_key,
>         new_name,
>         vault.relics.iter().filter(|r| r.chamber == new_name).count(),
>     );
>     Ok(())
> }
>
> pub fn delete_chamber(vault: &mut Vault, name: &str, force: bool) -> Result<(), String> {
>     let actual_key = vault.chambers.keys()
>         .find(|k| k.eq_ignore_ascii_case(name))
>         .cloned()
>         .ok_or(format!("Chamber '{}' not found.", name))?;
>
>     let relic_count = vault.relics
>         .iter()
>         .filter(|r| r.chamber.eq_ignore_ascii_case(name))
>         .count();
>
>     if relic_count > 0 && !force {
>         return Err(format!(
>             "Chamber '{}' contains {} relic(s). Use --force to move them to 'Unsorted'.",
>             actual_key, relic_count,
>         ));
>     }
>
>     if relic_count > 0 && force {
>         print!(
>             "Move {} relic(s) from '{}' to 'Unsorted' and delete the chamber? [y/N]: ",
>             relic_count, actual_key,
>         );
>         io::stdout().flush().unwrap();
>
>         let mut input = String::new();
>         io::stdin().read_line(&mut input).unwrap();
>
>         if !input.trim().eq_ignore_ascii_case("y") {
>             println!("Cancelled.");
>             return Ok(());
>         }
>
>         for relic in &mut vault.relics {
>             if relic.chamber.eq_ignore_ascii_case(name) {
>                 relic.chamber = "Unsorted".to_string();
>             }
>         }
>
>         vault.chambers.entry("Unsorted".to_string()).or_insert(Chamber {
>             icon: "📦".to_string(),
>             description: "Relics without a chamber".to_string(),
>         });
>     }
>
>     vault.chambers.remove(&actual_key);
>     println!("Chamber '{}' deleted.", actual_key);
>     Ok(())
> }
> ```
>
> The vault's toolset is now complete — generate, copy, authenticate, search, edit, and organize. But a vault that only stores secrets without monitoring them is a vault waiting to be breached. In Act 4, you'll build the Watchtower — breach detection, security auditing, and the vigilance tools that keep your credentials safe over time.

### What to Try
2. `cargo run -- chambers add Dungeon` — create a new chamber
3. `cargo run -- chambers rename Dungeon Catacombs` — rename it
4. `cargo run -- chambers delete Catacombs` — should work if empty
5. Move a relic to "Catacombs", then try deleting — should fail without `--force`
6. `cargo run -- chambers delete Catacombs --force` — should prompt, then move relics to "Unsorted"

> [!warning] Common Mistakes
> | Mistake | Why It's Wrong | Fix |
> |---------|---------------|-----|
> | Forgetting to update relics when renaming | Relics still reference the old chamber name — they become orphaned | Loop through `vault.relics` and update matching `chamber` fields |
> | Not using `.cloned()` before mutating the HashMap | Borrow checker error — can't hold a reference to a key while modifying the map | `.cloned()` creates an owned copy, releasing the borrow |
> | Deleting a non-empty chamber without moving relics | Relics reference a chamber that no longer exists | Either require empty or move to "Unsorted" with `--force` |
> | Case-sensitive chamber matching | "armory" and "Armory" treated as different chambers | Use `eq_ignore_ascii_case` consistently |

---

## Act 3 Complete — The Arsenal Is Stocked

You've built six new tools for Ironvault:

| Tool | Module | What It Does |
|------|--------|-------------|
| The Forge | `generator.rs` | CSPRNG password generation with configurable character classes |
| The Courier | `clipboard.rs` | Clipboard copy with 30-second auto-clear |
| The Time Rune | `totp.rs` | TOTP two-factor authentication codes |
| The Seeker | `search.rs` | Substring search and filtered listing |
| The Scribe | `edit.rs` | Interactive relic editing |
| The Chamber Architect | `chambers.rs` | Chamber CRUD with defensive deletion |

### Rust Concepts Mastered in This Act

| Concept | Where You Used It |
|---------|------------------|
| External crate integration | `rand`, `rand_chacha`, `arboard`, `totp-rs` |
| Trait imports (`use Trait`) | `IndexedRandom`, `SeedableRng` |
| `Arc` and thread spawning | Clipboard auto-clear background thread |
| `move` closures | Transferring ownership into threads |
| Lifetime annotations (`'a`) | Search functions returning references |
| `HashMap` Entry API | Chamber relic counting |
| `&mut` references | Editing relics, renaming chambers |
| `iter()` vs `iter_mut()` | Read-only listing vs. in-place mutation |
| Iterator chains | `filter`, `map`, `any`, `collect` everywhere |
| `Option` methods | `as_deref`, `as_ref`, `unwrap_or`, `ok_or` |
| Format string padding | Table output with dynamic column widths |

### Security Concepts Covered

| Concept | Stage | Key Takeaway |
|---------|-------|-------------|
| CSPRNG vs PRNG | 14 | Never use `random` for security — use `SysRng` + ChaCha |
| Entropy sources | 14 | OS gathers hardware entropy; ChaCha stretches it efficiently |
| Clipboard attack surface | 15 | Clipboard is globally readable — auto-clear limits exposure |
| TOTP / RFC 6238 | 16 | Shared secret + time = one-time code. Same as AWS IAM MFA |
| Base32 encoding | 16 | Human-friendly encoding for manual secret entry |
| Defensive deletion | 19 | Require confirmation for destructive operations |

### What's Next — Act 4: The Watchtower

In the next act, you'll build Ironvault's security auditing tools:

- **The Breach Oracle** — check passwords against Have I Been Pwned using k-anonymity (your password never leaves your machine)
- **The Auditor** — detect weak passwords, reused passwords, and aging credentials
- **The Gatekeeper** — change the master password and re-encrypt the vault
- **The Merchant** — import and export relics (CSV/JSON) for migration

The vault is built. The tools are forged. Now it's time to defend what you've created.
