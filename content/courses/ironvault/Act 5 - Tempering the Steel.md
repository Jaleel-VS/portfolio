# Act 5 — Tempering the Steel

> *"The blade is forged. The edge is sharp. But a blade that shatters on first contact is worse than no blade at all. Tempering is what gives steel its resilience — the ability to bend without breaking, to endure what comes."*

Welcome to the final act. Your vault encrypts, decrypts, generates, audits, and checks for breaches. It works. But "works" is not the same as "production-ready." In this act, you'll add the qualities that separate a weekend project from a tool you'd trust with your actual credentials:

- **Data portability** — export and import, because vendor lock-in is bad even when the vendor is you
- **Backups** — because hardware fails and humans make mistakes
- **Secure memory** — because `drop` doesn't clear memory, and core dumps don't care about your feelings
- **Error handling** — because `unwrap()` in production is a ticking time bomb
- **Threat modeling** — because every security tool must document what it *doesn't* protect against
- **Polish** — because the details are what make people trust software

This is where Ironvault becomes real.

---

## Stage 25 — The Trade Routes (Medium)

> *"The merchant spreads a map across the table. 'Your relics are valuable,' she says. 'But a treasure locked in a single vault is a treasure one disaster away from being lost forever. Let me show you the trade routes — how to move your wealth safely between vaults.'"*

Data portability matters. If you can't export your passwords, you're locked into your own tool forever. If you can't import, migrating from another password manager means manually re-entering every credential.

But export is also the most dangerous operation in a password manager — it produces **plaintext**. Every password, every TOTP secret, every note, written to a file in the clear. This is the security equivalent of taking all the gold out of the vault and laying it on the street.

### The Commands

```
iv export --format json          # Export all relics as JSON
iv export --format csv           # Export all relics as CSV
iv import --format json FILE     # Import relics from JSON file
iv import --format csv FILE      # Import relics from CSV file
```

### Export: The Dangerous Part

Export requires two safety gates:

1. **Master password verification** — even if the session is unlocked, re-prompt for the password. This prevents someone who finds an unlocked terminal from silently exporting everything.
2. **Explicit confirmation** — print a warning and require the user to type `EXPORT` to confirm.

```rust
pub fn export_relics(
    vault: &Vault,
    format: ExportFormat,
    output_path: &Path,
) -> Result<(), IronvaultError> {
    // Gate 1: warn the user
    println!("WARNING: This will write ALL passwords in PLAINTEXT to:");
    println!("  {}", output_path.display());
    println!();
    println!("Anyone who can read this file has all your credentials.");
    println!("Type EXPORT to confirm:");

    let mut input = String::new();
    std::io::stdin().read_line(&mut input)?;
    if input.trim() != "EXPORT" {
        println!("Export cancelled.");
        return Ok(());
    }

    match format {
        ExportFormat::Json => export_json(vault, output_path),
        ExportFormat::Csv => export_csv(vault, output_path),
    }
}
```

**Your turn:** implement `export_json` and `export_csv`. For JSON, use `serde_json::to_string_pretty`. For CSV, write a header row and one row per relic. Handle `Option` fields (url, notes, totp_secret) by writing empty strings for `None`.

### Import: The Careful Part

Import needs **duplicate detection**. If the user imports a file that contains a relic named "GitHub" and the vault already has one, what happens?

Options:
- **Skip** — keep the existing relic, ignore the import (safe but might lose updates)
- **Replace** — overwrite the existing relic with the imported one (dangerous — might lose local changes)
- **Rename** — import as "GitHub (imported)" (safe, but clutters the vault)
- **Ask** — prompt the user for each duplicate (correct, but tedious for large imports)

Pick one as the default and implement it. Consider adding a `--on-conflict skip|replace|rename` flag.

```rust
pub fn import_relics(
    vault: &mut Vault,
    format: ExportFormat,
    input_path: &Path,
) -> Result<ImportResult, IronvaultError> {
    let imported = match format {
        ExportFormat::Json => parse_json(input_path)?,
        ExportFormat::Csv => parse_csv(input_path)?,
    };

    let mut added = 0;
    let mut skipped = 0;

    for relic in imported {
        if vault.relics.iter().any(|r| r.name == relic.name) {
            // YOUR CODE: handle duplicate based on chosen strategy
            skipped += 1;
        } else {
            vault.relics.push(relic);
            added += 1;
        }
    }

    Ok(ImportResult { added, skipped })
}
```

### Checkpoint

1. Export to JSON — open the file and verify all passwords are in plaintext (this is expected and correct)
2. Export to CSV — open in a spreadsheet and verify the columns make sense
3. Delete a relic from the vault, then import the JSON file — the deleted relic should reappear
4. Import a file with a duplicate relic name — verify your conflict strategy works
5. **Delete the export file when you're done testing.** Seriously. It contains all your passwords in plaintext.

### Common Mistakes

**Leaving the export file on disk.** Print a reminder after export: "Remember to securely delete this file when you're done." Better yet, print the path so the user can `shred` or `rm` it.

**Not validating imported data.** A malformed JSON file shouldn't crash the program. Validate that required fields exist, that dates parse correctly, and that chamber references point to existing chambers (or create them).

---

## Stage 26 — The Vault Backup (Medium)

> *"The archivist pulls a leather-bound ledger from the shelf. 'Every vault worth protecting has copies,' she says. 'Not of the relics themselves — of the sealed vault. The copies are just as impenetrable as the original. But if the original is lost to fire or flood, the copies remain.'"*

Backups are the most boring and most important feature in any system that stores data. Your vault file is a single point of failure — one accidental `rm`, one disk corruption, one bad `iv change-password` that crashes at the wrong moment, and everything is gone.

The beautiful thing about backing up an encrypted vault: **the backup is already encrypted.** You don't need the master password to create a backup — you're just copying an opaque blob of ciphertext. You *do* need the master password to restore from a backup, because restoring means replacing the current vault file and then decrypting it.

### The Commands

```
iv backup                    # Create a timestamped backup
iv backup list               # List all backups with dates and sizes
iv backup restore <name>     # Restore a specific backup (requires confirmation)
iv backup rotate             # Delete old backups, keep the most recent 10
```

### Implementation Sketch

Backups live in `~/.ironvault/backups/` with timestamped names:

```
~/.ironvault/backups/
├── vault-2026-04-18T170500.iron
├── vault-2026-04-15T093012.iron
└── vault-2026-04-10T141500.iron
```

The core operations:

```rust
use std::fs;
use chrono::Utc;

const MAX_BACKUPS: usize = 10;

/// Create a backup of the current vault file.
pub fn create_backup(vault_path: &Path, backup_dir: &Path) -> Result<PathBuf, IronvaultError> {
    fs::create_dir_all(backup_dir)?;

    let timestamp = Utc::now().format("%Y-%m-%dT%H%M%S");
    let backup_name = format!("vault-{}.iron", timestamp);
    let backup_path = backup_dir.join(&backup_name);

    fs::copy(vault_path, &backup_path)?;

    println!("Backup created: {}", backup_name);
    Ok(backup_path)
}

/// List all backups sorted by date (newest first).
pub fn list_backups(backup_dir: &Path) -> Result<Vec<BackupInfo>, IronvaultError> {
    // YOUR CODE:
    // 1. Read the backup directory
    // 2. Filter for files matching "vault-*.iron"
    // 3. Parse the timestamp from the filename
    // 4. Get file size from metadata
    // 5. Sort by timestamp descending
    // 6. Return Vec<BackupInfo> where BackupInfo has name, timestamp, size
    todo!()
}

/// Restore a backup by copying it over the current vault file.
/// Uses atomic rename for safety.
pub fn restore_backup(
    backup_path: &Path,
    vault_path: &Path,
) -> Result<(), IronvaultError> {
    // Safety: copy to .tmp first, then rename
    let tmp_path = vault_path.with_extension("iron.tmp");
    fs::copy(backup_path, &tmp_path)?;
    fs::rename(&tmp_path, vault_path)?;

    println!("Vault restored from backup.");
    println!("You will need to unlock with the master password that was active when this backup was created.");
    Ok(())
}

/// Delete old backups, keeping only the most recent MAX_BACKUPS.
pub fn rotate_backups(backup_dir: &Path) -> Result<usize, IronvaultError> {
    let mut backups = list_backups(backup_dir)?;

    if backups.len() <= MAX_BACKUPS {
        println!("No rotation needed ({} backups, max {}).", backups.len(), MAX_BACKUPS);
        return Ok(0);
    }

    // Sort newest first, then remove everything after MAX_BACKUPS
    backups.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    let to_remove = &backups[MAX_BACKUPS..];
    let count = to_remove.len();

    for backup in to_remove {
        fs::remove_file(backup_dir.join(&backup.name))?;
    }

    println!("Removed {} old backup(s).", count);
    Ok(count)
}
```

### Key Insight: Backup Password Mismatch

Here's a subtle gotcha: if you change your master password and then restore from a backup created *before* the password change, you need the **old** password to unlock the restored vault.

The backup contains the old salt, old Argon2 parameters, and ciphertext encrypted with the old derived key. The new password won't work. This is correct behavior — but you should warn the user during restore.

### Checkpoint

1. Create a backup — verify the file appears in the backups directory
2. Add a new relic, then restore the backup — the new relic should be gone
3. Create 12 backups, run `iv backup rotate` — should keep 10, delete 2
4. Change your master password, create a backup, change it again, restore the first backup — verify you need the *first* password

### Common Mistakes

**Using `fs::copy` directly to the vault path for restore.** If the copy fails halfway (disk full), you've corrupted the vault and lost the backup's data. Always copy to a temp file first, then atomic rename.

**Not creating the backup directory.** First-time users won't have `~/.ironvault/backups/`. Use `fs::create_dir_all` which creates the directory and all parents, and is a no-op if it already exists.

---

## Stage 27 — The Warding Runes (Hard)

> *"The runesmith traces glowing sigils along the vault walls. 'These are warding runes,' she explains. 'When a secret is no longer needed, the runes don't just hide it — they burn it from existence. No trace remains. No echo. No ghost in the stone.' She pauses. 'Without these wards, every secret you've ever held still lingers in the walls, waiting for someone with the right tools to read them.'"*

This is the most important security stage in the entire course. Everything you've built so far has a hidden flaw: **when Rust drops a value, it doesn't clear the memory.** The bytes remain on the heap (or stack) until something else overwrites them. That means:

- Your master password sits in memory as a `String` after you've finished using it
- The derived encryption key sits in memory as a `Vec<u8>` after decryption
- Every decrypted password from every relic sits in memory until the allocator reuses that space

An attacker who can read your process memory — via a core dump, a swap file, a cold boot attack, or a debugger — can extract every secret your program has ever held.

### The Problem in Detail

When you write this:

```rust
fn unlock_vault() {
    let password = read_password();  // "my-secret-password"
    let key = derive_key(&password); // [0x4a, 0xf2, 0x8b, ...]
    let vault = decrypt(&key);
    // ... use the vault ...
}  // password and key are dropped here
```

After the function returns, `password` and `key` are "dropped" — their destructors run, the heap memory is freed. But "freed" means "returned to the allocator." The bytes `my-secret-password` and `[0x4a, 0xf2, 0x8b, ...]` are still physically present in RAM. They'll stay there until the allocator hands that memory to someone else and the new owner writes over it.

### The Solution: `zeroize` and `secrecy`

Two crates from the RustCrypto ecosystem solve this:

**`zeroize`** provides the `Zeroize` trait — a `zeroize()` method that overwrites memory with zeros using `core::ptr::write_volatile`, which the compiler is guaranteed not to optimize away. It also provides `ZeroizeOnDrop` — a derive macro that automatically calls `zeroize()` when a value is dropped.

**`secrecy`** builds on `zeroize` to provide `SecretBox<S>` — a wrapper that:
- Implements `Zeroize` and `ZeroizeOnDrop` (memory is cleared on drop)
- Implements `Debug` as `"[REDACTED]"` (prevents accidental logging)
- Does **not** implement `Clone` by default (prevents accidental copies that escape zeroization)
- Requires `.expose_secret()` to access the inner value (makes secret access explicit and auditable)

`SecretString` is a type alias for `SecretBox<String>`, and `SecretSlice<u8>` is `SecretBox<Vec<u8>>`.

### The AWS Parallel

**IAM temporary credentials** expire and become useless. But the credential *values* might still be in memory, in log files, or in environment variables. AWS SDKs are careful to not log credential values — `SecretBox`'s `Debug` impl serves the same purpose.

**Hardware Security Modules (HSMs)** go further: they physically destroy cryptographic keys when tampered with. The HSM detects physical intrusion and zeroizes all key material. `ZeroizeOnDrop` is the software equivalent — when the value's lifetime ends, the secret is actively destroyed.

### New Dependencies

```toml
[dependencies]
zeroize = { version = "1.8", features = ["zeroize_derive"] }
secrecy = "0.10"
```

The `zeroize_derive` feature enables `#[derive(Zeroize, ZeroizeOnDrop)]`.

### Implementation: Wrapping the Master Password

Before (insecure):

```rust
fn unlock() -> Result<String, Error> {
    let password: String = rpassword::prompt_password("Master password: ")?;
    // password is a plain String — sits in memory until allocator reuses the space
    Ok(password)
}
```

After (secure):

```rust
use secrecy::{ExposeSecret, SecretString, SecretBox};

fn unlock() -> Result<SecretString, Error> {
    let password: String = rpassword::prompt_password("Master password: ")?;

    // Wrap in SecretBox immediately. The original String is moved into the box.
    // SecretString is a type alias for SecretBox<String>.
    let secret: SecretString = SecretBox::init_with(|| password);

    // To use the password, you must explicitly call .expose_secret():
    let hash = derive_key(secret.expose_secret().as_bytes());

    // When `secret` is dropped, the memory is overwritten with zeros.
    Ok(secret)
}
```

Key API details (verified from docs.rs):
- `SecretBox::init_with(|| value)` — creates a SecretBox from a closure. The closure constructs the value, which is then moved to the heap. The crate makes an effort to zeroize the stack copy.
- `SecretBox::new(boxed_value)` — creates from a pre-boxed value. Use when you already have a `Box<T>`.
- `.expose_secret()` returns `&S` — a reference to the inner value. This is the *only* way to access it.
- `.expose_secret_mut()` returns `&mut S` — mutable access.
- `Debug` prints `SecretBox([REDACTED])` — safe to include in error messages.

### Implementation: Wrapping the Derived Key

```rust
use secrecy::{SecretSlice, SecretBox, ExposeSecret};

/// Derive the encryption key and return it wrapped in SecretSlice.
/// SecretSlice<u8> is a type alias for SecretBox<Vec<u8>>.
fn derive_key_secure(
    password: &str,
    salt: &[u8],
    params: &Argon2Params,
) -> Result<SecretSlice<u8>, Error> {
    let key_bytes: Vec<u8> = derive_key_raw(password, salt, params)?;

    // Wrap immediately — the Vec is moved into the SecretBox.
    Ok(SecretBox::init_with(|| key_bytes))
}

// Usage:
fn decrypt_vault(key: &SecretSlice<u8>, ciphertext: &[u8]) -> Result<Vec<u8>, Error> {
    // Must explicitly expose the secret to use it.
    let plaintext = aes_gcm_decrypt(key.expose_secret(), ciphertext)?;
    Ok(plaintext)
}
```

### Implementation: Zeroizing Relic Fields

For the `Relic` struct, we can't wrap every field in `SecretBox` (that would make serialization painful). Instead, derive `Zeroize` and `ZeroizeOnDrop` on the struct itself:

```rust
use zeroize::{Zeroize, ZeroizeOnDrop};
use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
pub struct Relic {
    #[zeroize(skip)]  // Not secret — safe to leave in memory
    pub id: String,
    #[zeroize(skip)]
    pub name: String,
    #[zeroize(skip)]
    pub username: String,

    pub password: String,  // Will be zeroized on drop

    #[zeroize(skip)]
    pub url: Option<String>,
    #[zeroize(skip)]
    pub chamber: String,
    #[zeroize(skip)]
    pub tags: Vec<String>,
    #[zeroize(skip)]
    pub notes: Option<String>,

    pub totp_secret: Option<String>,  // Will be zeroized on drop

    #[zeroize(skip)]
    pub created_at: String,
    #[zeroize(skip)]
    pub updated_at: String,
}
```

The `#[zeroize(skip)]` attribute tells the derive macro to skip non-secret fields. Only `password` and `totp_secret` are zeroized on drop.

**Important:** `Zeroize` is implemented for `String` by overwriting the buffer with zeros and then truncating to length 0. For `Option<String>`, it zeroizes the inner `String` if `Some`. For `Vec<T>` where `T: Zeroize`, it zeroizes each element and then clears the vec.

### Why No `Clone` on Secret Types?

`SecretBox` deliberately does not implement `Clone` (unless the inner type implements the `CloneableSecret` marker trait). This is a design choice:

```rust
let secret: SecretString = SecretBox::init_with(|| "password".to_string());

// This won't compile:
// let copy = secret.clone();  // ERROR: Clone not implemented

// This is the point. If you could clone a SecretBox, the clone
// would be a separate heap allocation that you might forget to
// zeroize. By preventing clones, the crate ensures there's exactly
// one copy of the secret in memory, and it will be zeroized when
// the SecretBox is dropped.
```

If you need to pass a secret to multiple functions, pass a reference (`&SecretString`) or use `.expose_secret()` at the call site.

### The Refactoring Checklist

Go through your codebase and apply these changes:

| Location | Before | After |
|----------|--------|-------|
| Password prompt | `String` | `SecretString` |
| Derived key | `Vec<u8>` | `SecretSlice<u8>` |
| Key cache read | `Vec<u8>` | `SecretSlice<u8>` |
| `Relic` struct | plain `#[derive]` | add `Zeroize, ZeroizeOnDrop` |
| Password comparison | `==` on `String` | `.expose_secret() == other.expose_secret()` |
| Argon2 input | `password.as_bytes()` | `password.expose_secret().as_bytes()` |
| AES-GCM key | `&key` | `key.expose_secret()` |
| Debug logging | might print passwords | `SecretBox` prints `[REDACTED]` |

### Checkpoint

1. Add `zeroize` and `secrecy` to `Cargo.toml` and verify it compiles
2. Wrap the master password in `SecretString` — fix all compilation errors that result
3. Wrap the derived key in `SecretSlice<u8>` — fix all compilation errors
4. Add `Zeroize, ZeroizeOnDrop` to `Relic` — verify serialization still works
5. Try `println!("{:?}", secret_password)` — should print `SecretBox([REDACTED])`
6. Run your full test suite — everything should still pass

### What to Try

- Add a `dbg!()` call on a `SecretString` — notice it prints `[REDACTED]`, not the value
- Try to `.clone()` a `SecretString` — the compiler should refuse
- Think about where secrets might still leak: function arguments copied on the stack, string formatting, error messages that include password values

### Common Mistakes

**Exposing the secret too early.** Don't do `let pw: String = secret.expose_secret().clone()` — that creates an unprotected copy. Keep values inside `SecretBox` as long as possible and only call `.expose_secret()` at the point of use.

**Deriving `Zeroize` on types with non-zeroizable fields.** If your struct contains a `DateTime<Utc>` from chrono, `Zeroize` can't be derived automatically because `DateTime` doesn't implement `Zeroize`. Use `#[zeroize(skip)]` on those fields, or store timestamps as `String`.

**Forgetting that `SecretBox::init_with` requires `Clone`.** The `init_with` method needs `S: Zeroize + Clone` because it constructs the value on the stack, copies it to the heap, then zeroizes the stack copy. If your type doesn't implement `Clone`, use `SecretBox::new(Box::new(value))` instead.

### Limitations to Be Honest About

`zeroize` and `secrecy` are not magic. They have real limitations:

- **Allocator copies.** When Rust's allocator grows a `Vec` or `String`, it may copy the old buffer to a new location without zeroing the old one. `SecretBox` mitigates this by allocating on the heap immediately, but the initial stack value (before boxing) might leave a trace.
- **Swap and hibernation.** If the OS swaps your process's memory to disk, secrets end up on persistent storage. The mitigation is `mlock()` to pin pages in RAM — but that requires `unsafe` and platform-specific code. Ironvault documents this as a known limitation.
- **Core dumps.** If the process crashes, the OS may write the entire memory space to a core dump file. Disable core dumps in production (`ulimit -c 0`).
- **Compiler optimizations.** While `write_volatile` prevents the *zeroing* from being optimized away, the compiler might still create temporary copies of secret values during normal operations.

These limitations are real, and Stage 29 (Threat Model) is where you'll document them honestly.

---

## Stage 28 — The Armorer's Finish (Medium)

> *"The armorer runs a gloved hand along the blade. 'The edge is true,' she says. 'But look here — a rough spot where the tang meets the guard. And here — a stress point that will crack under pressure. These aren't flaws in the steel. They're flaws in the finishing.' She picks up a fine file. 'Let's fix them.'"*

Your codebase is probably littered with `unwrap()` and `expect()` calls. Every one of them is a potential panic — an uncontrolled crash that dumps a stack trace to the user's terminal. Stack traces are useful for developers. They're terrifying and useless for users.

Good error handling means:
- **User-facing messages** that explain what went wrong and what to do about it
- **No panics** in normal operation — every error is caught and handled
- **Error propagation** with the `?` operator instead of manual matching at every level
- **Custom error types** that unify all the different error kinds in your application

### The Custom Error Type

Create `src/error.rs`:

```rust
use std::fmt;
use std::io;

/// All errors that Ironvault can produce.
#[derive(Debug)]
pub enum IronvaultError {
    /// Vault file not found — user needs to run `iv init`.
    VaultNotFound,
    /// Wrong master password — decryption auth tag failed.
    WrongPassword,
    /// New password and confirmation don't match.
    PasswordMismatch,
    /// Vault file is corrupted or has an unrecognized format.
    CorruptVault(String),
    /// Relic not found by name or ID.
    RelicNotFound(String),
    /// Chamber not found.
    ChamberNotFound(String),
    /// A relic with this name already exists.
    DuplicateRelic(String),
    /// Network error (e.g., HIBP API unreachable).
    Network(String),
    /// File I/O error.
    Io(io::Error),
    /// JSON serialization/deserialization error.
    Json(serde_json::Error),
    /// Encryption or decryption failed.
    Crypto(String),
    /// Session expired or lock file invalid.
    SessionExpired,
    /// Configuration file error.
    Config(String),
    /// TOTP secret is invalid or missing.
    InvalidTotp(String),
}
```

### Implementing `Display`

`Display` is what the user sees. Keep it human-readable:

```rust
impl fmt::Display for IronvaultError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::VaultNotFound => write!(
                f, "No vault found. Run `iv init` to create one."
            ),
            Self::WrongPassword => write!(
                f, "Wrong master password. The vault could not be decrypted."
            ),
            Self::PasswordMismatch => write!(
                f, "Passwords do not match. Try again."
            ),
            Self::CorruptVault(detail) => write!(
                f, "Vault file is corrupted: {}. Restore from a backup with `iv backup restore`.", detail
            ),
            Self::RelicNotFound(name) => write!(
                f, "Relic '{}' not found. Use `iv list` to see all relics.", name
            ),
            Self::ChamberNotFound(name) => write!(
                f, "Chamber '{}' not found. Use `iv chambers` to see all chambers.", name
            ),
            Self::DuplicateRelic(name) => write!(
                f, "A relic named '{}' already exists. Use `iv edit` to modify it.", name
            ),
            Self::Network(msg) => write!(
                f, "Network error: {}. Check your internet connection.", msg
            ),
            Self::Io(err) => write!(f, "File error: {}", err),
            Self::Json(err) => write!(f, "Data format error: {}", err),
            Self::Crypto(msg) => write!(f, "Encryption error: {}", msg),
            Self::SessionExpired => write!(
                f, "Session expired. Please enter your master password."
            ),
            Self::Config(msg) => write!(f, "Configuration error: {}", msg),
            Self::InvalidTotp(msg) => write!(
                f, "Invalid TOTP secret: {}. Ensure it's a valid base32 string.", msg
            ),
        }
    }
}
```

### Implementing `From` for Automatic Conversion

The `From` trait lets the `?` operator automatically convert library errors into your error type:

```rust
impl From<io::Error> for IronvaultError {
    fn from(err: io::Error) -> Self {
        IronvaultError::Io(err)
    }
}

impl From<serde_json::Error> for IronvaultError {
    fn from(err: serde_json::Error) -> Self {
        IronvaultError::Json(err)
    }
}
```

With these `From` impls, any function that returns `Result<T, IronvaultError>` can use `?` on `io::Error` and `serde_json::Error` without manual conversion:

```rust
// Before: manual error handling
fn load_vault(path: &Path) -> Result<Vault, IronvaultError> {
    let data = fs::read(path).map_err(|e| IronvaultError::Io(e))?;
    let vault: Vault = serde_json::from_slice(&data)
        .map_err(|e| IronvaultError::Json(e))?;
    Ok(vault)
}

// After: automatic conversion via From
fn load_vault(path: &Path) -> Result<Vault, IronvaultError> {
    let data = fs::read(path)?;           // io::Error → IronvaultError::Io
    let vault: Vault = serde_json::from_slice(&data)?;  // serde → IronvaultError::Json
    Ok(vault)
}
```

### The `main` Function

Your `main` should be the only place that formats errors for the user:

```rust
fn main() {
    if let Err(e) = run() {
        eprintln!("Error: {}", e);
        std::process::exit(1);
    }
}

fn run() -> Result<(), IronvaultError> {
    let cli = Cli::parse();
    match cli.command {
        Commands::Init => init_vault()?,
        Commands::Get { name, .. } => get_relic(&name)?,
        // ... all other commands ...
    }
    Ok(())
}
```

No `unwrap()`. No `expect()`. No stack traces. Just a clean error message and a non-zero exit code.

### Your Turn: The Purge

Search your codebase for every `unwrap()` and `expect()`. Replace each one:

- `unwrap()` on a `Result` → use `?` to propagate, or `match` to handle specifically
- `unwrap()` on an `Option` → use `.ok_or(IronvaultError::RelicNotFound(...))?`
- `expect("should never happen")` → if it truly can't happen, add a comment explaining why. If it *can* happen, handle it.

**Hint:** `grep -rn "unwrap\|expect" src/` will find them all.

### Checkpoint

1. Replace all `unwrap()`/`expect()` calls — the code should compile with zero panicking paths
2. Run with a nonexistent vault — should print "No vault found. Run `iv init` to create one."
3. Run with a wrong password — should print "Wrong master password."
4. Run `iv get nonexistent-relic` — should print "Relic 'nonexistent-relic' not found."
5. Disconnect from the internet and run `iv breach-check` — should print a network error, not a panic

### Common Mistakes

**Using `thiserror` without understanding what it does.** The `thiserror` crate auto-generates `Display` and `From` impls from attributes. It's convenient, but for a learning project, writing them by hand teaches you what's actually happening. Consider `thiserror` for your next project.

**Making error messages too technical.** "serde_json::Error: expected value at line 1 column 1" means nothing to a user. Wrap it: "Vault file is corrupted. The data format is invalid."

**Forgetting `std::process::exit(1)`.** Without a non-zero exit code, shell scripts that call `iv` won't know the command failed. Always exit with 1 (or higher) on error.

---

## Stage 29 — The Cartographer's Map (Medium)

> *"The cartographer unrolls a vast parchment. It shows the vault, the surrounding lands, the roads, the borders. But what makes this map remarkable isn't what it shows — it's the areas marked 'Here be dragons.' The cartographer doesn't pretend the dragons don't exist. She marks them clearly so travelers know where the protection ends."*

Every security tool must document two things: what it protects against, and what it doesn't. A tool that claims to protect against everything is either lying or delusional. Honest threat modeling builds trust — it tells users exactly where the boundaries are so they can make informed decisions.

### The AWS Parallel

The **AWS Shared Responsibility Model** is the most famous threat model in cloud computing. AWS is responsible for security *of* the cloud (physical infrastructure, hypervisor, network). You are responsible for security *in* the cloud (IAM policies, encryption, application code). The boundary is explicit and documented.

Every AWS service has a security chapter in its documentation that describes what the service protects against and what it doesn't. DynamoDB encrypts data at rest — but if your IAM policy grants `*` to `*`, encryption doesn't help. The documentation says this clearly.

Your `THREAT_MODEL.md` serves the same purpose for Ironvault.

### The Template

Create `THREAT_MODEL.md` in your project root. Here's the complete template — fill in the details based on what you've actually built:

```markdown
# Ironvault — Threat Model

**Version:** 1.0
**Last Updated:** YYYY-MM-DD
**Author:** [Your Name]

## 1. What Is Ironvault?

Ironvault is a local-first CLI password manager. It stores encrypted credentials
on disk and provides tools to generate, retrieve, audit, and check passwords
against known breaches. It runs entirely on the user's machine — no cloud sync,
no daemon, no browser extension.

## 2. Security Properties

### 2.1 Confidentiality

| Property | Mechanism | Strength |
|----------|-----------|----------|
| Vault encryption | AES-256-GCM | 256-bit key, authenticated encryption |
| Key derivation | Argon2id (64 MiB, 3 iterations, 4 lanes) | Memory-hard, GPU-resistant |
| Password never stored | Only the derived key is used; password is zeroized after derivation | — |
| Clipboard auto-clear | Password removed from clipboard after 30 seconds | Time-limited exposure |
| Breach check privacy | k-anonymity — only 5-char SHA-1 prefix sent to API | ~800 passwords share each prefix |

### 2.2 Integrity

| Property | Mechanism |
|----------|-----------|
| Tamper detection | GCM authentication tag — any modification causes decryption failure |
| Atomic writes | Write to .tmp → fsync → rename prevents partial-write corruption |
| Backup verification | Restoring a backup requires successful decryption (implicit integrity check) |

### 2.3 Availability

| Property | Mechanism |
|----------|-----------|
| Backup system | Timestamped encrypted backups with rotation (max 10) |
| No external dependencies | Vault is a local file — no server, no network required for core operations |
| Export capability | JSON/CSV export for migration to other tools |

## 3. Threats Mitigated

### 3.1 Vault File Stolen (Disk Theft, Backup Leak)

**Attack:** Attacker obtains the encrypted vault file.
**Mitigation:** AES-256-GCM encryption with Argon2id-derived key.
**Residual risk:** Attacker can attempt offline brute-force against the master
password. At 64 MiB / 3 iterations, each guess costs ~200ms on modern hardware.
A 20-character random password is effectively unbreakable. A weak 6-character
password could be cracked in hours.

### 3.2 Vault File Tampered

**Attack:** Attacker modifies the encrypted vault file.
**Mitigation:** GCM authentication tag detects any modification. Decryption
fails cleanly with an error message rather than producing corrupted plaintext.

### 3.3 Shoulder Surfing

**Attack:** Someone watches the user's screen.
**Mitigation:** Passwords are hidden by default in `iv get`. Shown only with
the explicit `--show-password` flag. Master password input uses terminal echo
suppression (`rpassword`).

### 3.4 Clipboard Snooping

**Attack:** Malware or clipboard manager reads copied passwords.
**Mitigation:** Auto-clear after 30 seconds. Only clears if the clipboard still
contains the password Ironvault wrote (avoids clobbering user's subsequent copies).
**Residual risk:** During the 30-second window, any process can read the clipboard.

### 3.5 Credential Reuse and Weak Passwords

**Attack:** User reuses passwords or uses weak ones.
**Mitigation:** `iv audit` reports reused, weak, and old passwords. `iv generate`
creates strong random passwords. `iv breach-check` queries HIBP.
**Residual risk:** The user can ignore audit findings.

### 3.6 Memory Forensics (Partial)

**Attack:** Attacker reads process memory (core dump, swap, debugger).
**Mitigation:** `zeroize` on drop for master password (`SecretString`), derived
key (`SecretSlice<u8>`), and relic password/TOTP fields (`#[derive(ZeroizeOnDrop)]`).
Key cached in tmpfs (RAM-backed, cleared on reboot).
**Residual risk:** See Section 4.6.

## 4. Threats NOT Mitigated

### 4.1 Keylogger / Screen Recorder

**Attack:** Malware captures keystrokes or screen content.
**Why not mitigated:** If the attacker controls input devices, they capture the
master password as it's typed. No password manager can defend against this.
**User guidance:** Keep your OS and antivirus updated. Use a hardware security
key for high-value accounts where possible.

### 4.2 Malware with Memory Access

**Attack:** A process with `ptrace` or equivalent reads Ironvault's memory.
**Why not mitigated:** A process with sufficient privileges can read any other
process's memory space, including decrypted vault contents.
**User guidance:** Keep lock timeout short. Don't run untrusted software.

### 4.3 Compromised Operating System

**Attack:** The kernel is compromised.
**Why not mitigated:** A compromised kernel can read tmpfs, intercept syscalls,
log keystrokes, and bypass all userspace protections.
**User guidance:** This is outside Ironvault's threat model entirely.

### 4.4 Weak Master Password

**Attack:** Attacker brute-forces a short or predictable master password.
**Why not mitigated:** Argon2 slows brute-force but cannot compensate for a
4-character password. Ironvault warns on weak passwords but does not enforce
a minimum strength policy.
**User guidance:** Use a passphrase of 4+ random words or a 16+ character
random password.

### 4.5 Physical Access While Unlocked

**Attack:** Someone sits at the terminal while the vault is unlocked.
**Why not mitigated:** They can run any `iv` command. Lock timeout limits the
window but doesn't eliminate it.
**User guidance:** Lock your screen. Set a short vault timeout.

### 4.6 Swap / Hibernation Leaks

**Attack:** Decrypted data written to swap partition or hibernation file.
**Why not mitigated:** `mlock()` would pin pages in RAM, preventing swap. This
requires platform-specific `unsafe` code and elevated privileges. Ironvault
does not implement it.
**User guidance:** Use encrypted swap. Disable hibernation on sensitive machines.

### 4.7 Allocator Memory Copies

**Attack:** Rust's allocator copies secret data during reallocation.
**Why not mitigated:** When a `Vec` or `String` grows, the allocator may copy
the old buffer to a new location without zeroing the old one. `SecretBox`
mitigates by allocating on the heap immediately, but stack temporaries may
leave traces.
**User guidance:** This is a known limitation of userspace memory management.
Production-grade vaults use custom allocators or `mlock`.

## 5. Trust Boundaries

```
┌─────────────────────────────────────────────────┐
│                  User's Machine                  │
│                                                  │
│  ┌──────────┐    ┌──────────┐    ┌───────────┐  │
│  │ Terminal  │───>│ Ironvault│───>│ Vault File│  │
│  │ (input)  │    │ (process)│    │ (disk)    │  │
│  └──────────┘    └─────┬────┘    └───────────┘  │
│                        │                         │
│                  ┌─────▼────┐                    │
│                  │ Clipboard│                    │
│                  │ (shared) │                    │
│                  └──────────┘                    │
│                        │                         │
└────────────────────────┼────────────────────────┘
                         │ HTTPS (prefix only)
                   ┌─────▼─────┐
                   │ HIBP API  │
                   │ (external)│
                   └───────────┘
```

**Boundary 1: Terminal → Ironvault.** The master password crosses in plaintext
(unavoidable). `rpassword` disables echo. `SecretString` zeroizes after use.

**Boundary 2: Ironvault → Clipboard.** Password placed in a shared OS resource.
Auto-clear limits exposure to 30 seconds.

**Boundary 3: Ironvault → HIBP API.** Only a 5-character SHA-1 prefix crosses
the network. Full hash and password never leave the machine.

## 6. Assumptions

- The user's operating system is not compromised
- The Rust compiler and dependencies are not backdoored
- The cryptographic primitives (AES-256-GCM, Argon2id) are sound
- The user's terminal emulator does not log input
- The filesystem supports atomic rename (POSIX)
- `/dev/shm` or `$TMPDIR` is RAM-backed (not persisted to disk)

## 7. Future Improvements

- [ ] `mlock()` to prevent secret pages from being swapped
- [ ] Configurable Argon2 parameters based on hardware benchmarking
- [ ] FIDO2/hardware key support for master password unlock
- [ ] Encrypted export format (export to another Ironvault vault)
- [ ] Audit logging (who accessed what, when)
```

### Your Turn

Copy this template into your project and fill in any details specific to your implementation. Pay special attention to:

1. **Section 3 residual risks** — be specific about what's left after your mitigation
2. **Section 4** — add any threats you've thought of that aren't listed
3. **Section 6 assumptions** — add any assumptions your implementation makes
4. **Section 7** — add improvements you'd make if this were a production tool

### Checkpoint

1. Does your threat model honestly describe what Ironvault doesn't protect against?
2. Would a security reviewer reading this document understand the tool's limitations?
3. Does every mitigation in Section 3 correspond to code you've actually written?
4. Are the trust boundaries accurate for your implementation?

### Common Mistakes

**Claiming more protection than you provide.** If you didn't implement `mlock()`, don't claim protection against swap leaks. If your clipboard clear has a 30-second window, say so.

**Forgetting to update the threat model when you change the code.** The threat model is a living document. If you add a feature or change a security mechanism, update the corresponding section.

---

## Stage 30 — The Grand Seal (Medium)

> *"The master smith examines the finished blade. She turns it in the light, checking the edge, the balance, the temper. Then she nods. 'It is ready,' she says. She heats the seal — a circle of interlocking runes — and presses it into the pommel. The metal hisses. When she lifts the seal, the mark glows faintly, then fades to a permanent impression. 'This blade bears your mark now. It is yours. It is complete.'"*

This is the final stage. Your vault works, your security is solid, your errors are handled, your threats are documented. Now we add the finishing touches that make Ironvault feel like a real tool — and then we look back at everything you've built.

### Shell Completions

The `clap_complete` crate generates shell completion scripts from your clap CLI definition:

```toml
[dependencies]
clap_complete = "4"
```

Add a hidden subcommand that generates completions:

```rust
use clap_complete::{generate, Shell};

#[derive(Subcommand)]
enum Commands {
    // ... all your existing commands ...

    /// Generate shell completions (hidden from help).
    #[command(hide = true)]
    Completions {
        /// Shell to generate completions for.
        #[arg(value_enum)]
        shell: Shell,
    },
}

// In your command handler:
Commands::Completions { shell } => {
    let mut cmd = Cli::command();
    generate(shell, &mut cmd, "iv", &mut std::io::stdout());
}
```

Usage:

```bash
# Bash
iv completions bash > ~/.local/share/bash-completion/completions/iv

# Zsh
iv completions zsh > ~/.zfunc/_iv

# Fish
iv completions fish > ~/.config/fish/completions/iv.fish
```

### Version Flag

Add version info to your clap app:

```rust
#[derive(Parser)]
#[command(name = "ironvault", version, about = "A secure CLI password manager")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}
```

This uses the version from `Cargo.toml` automatically. `iv --version` will print `ironvault 1.0.0`.

### The `--no-color` Flag

Some users pipe output to files or use terminals that don't support ANSI colors. Add a global flag:

```rust
#[derive(Parser)]
#[command(name = "ironvault", version, about = "A secure CLI password manager")]
struct Cli {
    /// Disable colored output.
    #[arg(long, global = true)]
    no_color: bool,

    #[command(subcommand)]
    command: Commands,
}

// In main, before any output:
fn run() -> Result<(), IronvaultError> {
    let cli = Cli::parse();

    if cli.no_color {
        // colored crate: disable all coloring globally.
        colored::control::set_override(false);
    }

    // Also respect the NO_COLOR environment variable
    // (https://no-color.org/ — a community standard).
    if std::env::var("NO_COLOR").is_ok() {
        colored::control::set_override(false);
    }

    match cli.command {
        // ...
    }
}
```

The `colored` crate's `control::set_override(false)` disables all color output globally. The `Colorize` trait methods still work — they just produce plain strings without ANSI escape codes.

### The README

Write a `README.md` that covers:

1. **What it is** — one paragraph
2. **Installation** — `cargo install --path .`
3. **Quick start** — `iv init`, `iv add`, `iv get --copy`, `iv generate`
4. **All commands** — a table or list with one-line descriptions
5. **Security model** — brief summary pointing to `THREAT_MODEL.md`
6. **Configuration** — where the config file lives, what's configurable
7. **Building from source** — `cargo build --release`

You know how to write documentation by now. Make it scannable — a reader should understand what Ironvault does in 30 seconds.

### The Security Recap

You've implemented every major concept in applied cryptography for a password manager. Let's review what you built and why:

| Concept | What You Built | Why It Matters |
|---------|---------------|----------------|
| **Symmetric encryption** | AES-256-GCM in `crypto.rs` | Confidentiality + integrity in one operation. GCM's auth tag catches tampering. |
| **Key derivation** | Argon2id in `crypto.rs` | Turns a human password into a cryptographic key. Memory-hard = GPU-resistant. |
| **Nonce management** | Random 96-bit nonces | Nonce reuse in GCM is catastrophic. Random nonces are safe for our use case. |
| **Atomic file operations** | Write-tmp-fsync-rename in `vault.rs` | Crash safety. The vault is never in a half-written state. |
| **Secure random generation** | `OsRng` + `rand_chacha` in `generator.rs` | Passwords must come from a CSPRNG, not `rand::thread_rng()`. |
| **TOTP** | RFC 6238 in `totp.rs` | Time-based one-time passwords for 2FA. |
| **Clipboard security** | Auto-clear in `clipboard.rs` | The clipboard is a shared resource. Limit exposure time. |
| **k-anonymity** | HIBP prefix query in `breach.rs` | Check breaches without revealing the password. Privacy by protocol design. |
| **Security auditing** | Multi-check scan in `audit.rs` | Defense in depth. No single measure is enough. |
| **Key rotation** | Atomic re-encryption in `change_password` | Limits exposure window. New salt = new key = old ciphertext useless. |
| **Session management** | Timeout + lock in `session.rs` | Unattended terminals are a real threat. |
| **Secure deletion** | Overwrite-then-delete in `destroy` | `rm` doesn't erase data. Overwrite first. |
| **Secure memory** | `zeroize` + `secrecy` | `drop` doesn't clear memory. Secrets must be actively destroyed. |
| **Error handling** | Custom `IronvaultError` enum | No panics in production. User-facing messages, not stack traces. |
| **Threat modeling** | `THREAT_MODEL.md` | Document what you protect against *and what you don't*. |

### The Challenge: Break Your Own Vault

You've built the defenses. Now try to break them. This is how real security engineers think — you don't trust your own code until you've tried to defeat it.

**Try these attacks:**

1. **Hex editor attack.** Open `vault.iron` in a hex editor. Flip a single byte in the ciphertext. Try to decrypt. (Expected: GCM auth tag failure — decryption refused.)

2. **Nonce reuse simulation.** In a test, encrypt two different plaintexts with the same key and same nonce. XOR the two ciphertexts together. What do you get? (Expected: the XOR of the two plaintexts — this is why nonce reuse is catastrophic.)

3. **Memory inspection.** Run `iv get --show-password` on a relic, then immediately create a core dump (`kill -ABRT <pid>` or `gcore <pid>`). Search the core dump for the password string. With `SecretString`, it should be zeroized. Without it, it'll be there in plaintext.

4. **Brute force estimation.** Write a script that times how long one Argon2id derivation takes on your machine. Calculate how long it would take to brute-force a 4-character password, an 8-character password, and a 20-character password.

5. **Clipboard race.** Write a script that polls the clipboard every 100ms. Run `iv get --copy` and see if the script captures the password before the 30-second clear. (Expected: yes, it can. This is a documented limitation.)

### Checkpoint

1. `iv --version` prints the version from `Cargo.toml`
2. `iv completions bash` produces valid bash completion script
3. `iv audit --no-color | cat` produces output without ANSI escape codes
4. `NO_COLOR=1 iv audit` also produces plain output
5. `README.md` exists and covers all sections
6. `THREAT_MODEL.md` exists and is honest about limitations
7. `cargo clippy` produces no warnings
8. `cargo test` passes all tests
9. No `unwrap()` or `expect()` in non-test code

---

## Act 5 — The Grand Seal

> *"You stand at the gate of the vault. Behind you, the forge where you shaped the first relic. The chambers where you organized your treasures. The watchtower where you learned to see threats before they arrived. The warding runes that protect your secrets even in death."*
>
> *"The vault is yours. You built it from raw iron and fire. You understand every lock, every ward, every rune — because you forged them yourself."*
>
> *"Most people trust their secrets to vaults they've never seen inside. You are not most people. You know exactly what protects your secrets, and exactly what doesn't. That knowledge is worth more than any lock."*

### What You've Built

Ironvault is a complete, working password manager with:

- AES-256-GCM authenticated encryption
- Argon2id memory-hard key derivation
- TOTP two-factor authentication
- Cryptographically secure password generation
- Clipboard management with auto-clear
- k-anonymity breach checking
- Security auditing with severity ratings
- Atomic file operations for crash safety
- Session management with auto-lock
- Secure memory handling with zeroize
- Data portability (import/export)
- Encrypted backups with rotation
- Custom error handling with user-facing messages
- A documented threat model
- Shell completions and colored output

### What You've Learned

More importantly, you now understand *why* each of these exists. You can explain:

- Why AES-GCM over AES-CBC
- Why Argon2id over bcrypt or SHA-256
- Why random nonces are safe for GCM but not for other modes
- Why `drop` doesn't clear memory and what `zeroize` does about it
- Why k-anonymity works and what its limits are
- Why atomic rename prevents corruption
- Why a threat model must document what you *don't* protect against

These concepts transfer directly to your work as an AWS engineer. Every time you configure KMS, set up Secrets Manager rotation, design an IAM policy, or review a security architecture — you'll understand the cryptographic foundations underneath.

### Where to Go Next

If you want to keep building:

- **Add `mlock()`** — pin secret pages in RAM to prevent swapping. Requires `unsafe` and platform-specific code.
- **Add FIDO2 support** — use a hardware security key as the master "password." The `ctap-hid-fido2` crate provides the protocol.
- **Add encrypted export** — export to a second Ironvault vault file instead of plaintext.
- **Add git-based sync** — store the encrypted vault in a git repo for cross-machine sync. The vault is opaque ciphertext, so merge conflicts mean "pick one version."
- **Benchmark Argon2 parameters** — write a tool that finds the optimal memory/time cost for the user's hardware (target: 200-500ms per derivation).

The forge is always open. The steel is always ready.

Welcome to the other side, Vaultkeeper.
