# Reference Guide

> *A chronomancer's quick-reference for the tools, formats, and patterns used throughout the Chronolock.*

---

## Git Object Formats

### Blob

```
blob <size>\0<raw content bytes>
```

- `<size>` is the decimal byte count of the content (not the header)
- `\0` is a null byte separator
- Content is arbitrary bytes (text or binary)
- The entire blob (header + content) is SHA-1 hashed, then zlib-compressed before storage

### Tree

```
tree <size>\0<entries>
```

Each entry (concatenated, no separators between entries):

```
<mode> <name>\0<20-byte raw SHA-1>
```

| Mode | Meaning |
|------|---------|
| `100644` | Regular file |
| `100755` | Executable file |
| `40000` | Subdirectory (points to another tree) |

- Entries are sorted by name (directories sort as if they have a trailing `/`)
- The hash is 20 raw bytes, not 40 hex characters
- `git cat-file -p` displays mode `40000` as `040000` — but write it as `40000`

### Commit

```
commit <size>\0<text content>
```

Text content format:

```
tree <40-char hex hash>
parent <40-char hex hash>        ← optional, absent for root commit
parent <40-char hex hash>        ← second parent for merge commits
author <name> <<email>> <unix-timestamp> <tz-offset>
committer <name> <<email>> <unix-timestamp> <tz-offset>

<commit message>
```

- Blank line separates headers from message
- Message should end with a newline
- Timestamp is Unix epoch seconds (e.g., `1713500000`)
- Timezone offset is `+0200` or `-0500` format

---

## Directory Layout

### Normal repository

```
.chronolock/
├── HEAD                          ← "ref: refs/heads/main\n" or raw hash
├── objects/
│   ├── <2-char prefix>/
│   │   └── <38-char suffix>      ← zlib-compressed object
│   └── pack/
│       ├── main.pack             ← packed objects
│       └── main.idx              ← pack index
├── refs/
│   ├── heads/
│   │   ├── main                  ← commit hash
│   │   └── feature               ← commit hash
│   └── remotes/
│       └── origin/
│           └── main              ← remote-tracking ref
├── remotes/
│   └── origin                    ← remote path
├── logs/
│   └── HEAD                      ← reflog (append-only)
└── MERGE_HEAD                    ← present during conflicted merge
```

### Bare repository

Same as above but without a working directory. Objects and refs live directly in the repository root.

---

## CLI Command Reference

| Command | Description | Git equivalent |
|---------|-------------|----------------|
| `chronolock init` | Create a new repository | `git init` |
| `chronolock init --bare` | Create a bare repository | `git init --bare` |
| `chronolock store <file>` | Store a file as a blob object | `git hash-object -w <file>` |
| `chronolock reveal <hash>` | Display an object's content | `git cat-file -p <hash>` |
| `chronolock reveal -t <hash>` | Show object type | `git cat-file -t <hash>` |
| `chronolock reveal -s <hash>` | Show object size | `git cat-file -s <hash>` |
| `chronolock stage [path]` | Stage directory into a tree | `git add .` |
| `chronolock anchor -m "msg"` | Create a commit | `git commit -m "msg"` |
| `chronolock log` | Show commit history | `git log` |
| `chronolock drift` | Show working directory changes | `git diff` |
| `chronolock drift <old> <new>` | Diff two commits | `git diff <old> <new>` |
| `chronolock status` | Show current state | `git status` |
| `chronolock branch` | List branches | `git branch` |
| `chronolock branch <name>` | Create a branch | `git branch <name>` |
| `chronolock branch -d <name>` | Delete a branch (safe) | `git branch -d <name>` |
| `chronolock branch -d --force <name>` | Force delete | `git branch -D <name>` |
| `chronolock shift <target>` | Switch branch or checkout commit | `git checkout <target>` |
| `chronolock shift --force <target>` | Force checkout | `git checkout -f <target>` |
| `chronolock converge <branch>` | Merge a branch | `git merge <branch>` |
| `chronolock echo` | Show reflog | `git reflog` |
| `chronolock stats` | Show object store statistics | `git count-objects -v` |
| `chronolock pack` | Pack loose objects | `git gc` |
| `chronolock send <remote> <branch>` | Push to remote | `git push <remote> <branch>` |
| `chronolock receive <remote>` | Fetch from remote | `git fetch <remote>` |

---

## SHA-1 Hashing

```rust
use sha1::{Sha1, Digest};

fn hash_bytes(data: &[u8]) -> String {
    let mut hasher = Sha1::new();
    hasher.update(data);
    format!("{:x}", hasher.finalize())
}
```

**Key rule:** Always hash the full object (header + content), not just the content. `hash("blob 5\0hello")` ≠ `hash("hello")`.

---

## Zlib Compression

### Compress

```rust
use flate2::write::ZlibEncoder;
use flate2::Compression;
use std::io::Write;

let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
encoder.write_all(&data)?;
let compressed = encoder.finish()?;
```

### Decompress

```rust
use flate2::read::ZlibDecoder;
use std::io::Read;

let mut decoder = ZlibDecoder::new(&compressed[..]);
let mut raw = Vec::new();
decoder.read_to_end(&mut raw)?;
```

---

## Hex ↔ Bytes Conversion

```rust
// 40-char hex string → 20 raw bytes
fn hex_to_bytes(hex: &str) -> Vec<u8> {
    (0..hex.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap())
        .collect()
}

// 20 raw bytes → 40-char hex string
fn bytes_to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}
```

---

## Clap CLI Patterns

### Subcommand with arguments

```rust
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "chronolock")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Description shown in --help
    MyCommand {
        /// Positional argument
        target: String,
        /// Optional flag
        #[arg(short, long)]
        force: bool,
        /// Optional with default
        #[arg(short, long, default_value = ".")]
        path: String,
    },
}
```

### Running

```bash
cargo run -- my-command target-value --force
cargo run -- --help
```

Note: clap converts `MyCommand` to `my-command` in the CLI automatically.

---

## Merge Algorithm Summary

### Fast-forward

```
Condition: merge base == our tip
Action:    move our branch pointer to their tip
Result:    no merge commit
```

### Three-way merge (clean)

```
Condition: merge base != our tip AND merge base != their tip AND no conflicts
Action:    apply all non-conflicting changes, create merge commit with two parents
Result:    merge commit
```

### Three-way merge (conflicted)

```
Condition: both sides changed the same file differently
Action:    write conflict markers, save MERGE_HEAD, wait for user resolution
Result:    user edits files, runs `anchor` to create merge commit
```

### Conflict markers

```
<<<<<<< ours (current branch)
our version
=======
their version
>>>>>>> theirs (merging branch)
```

---

## Reflog Format

Each line in `.chronolock/logs/HEAD`:

```
<old-hash> <new-hash> <author> <email> <timestamp> <tz> <action>
```

Entries are appended (newest at bottom). Read in reverse for newest-first display.

---

## Cargo.toml Dependencies

```toml
[package]
name = "chronolock"
version = "0.1.0"
edition = "2024"

[dependencies]
sha1 = "0.10"
flate2 = "1"
clap = { version = "4", features = ["derive"] }
chrono = "0.4"
glob = "0.3"
colored = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

---

## Module Structure

```
src/
├── main.rs          ← CLI entry point, command dispatch
├── object.rs        ← Object store: hash, store, read, parse (blob/tree/commit)
├── staging.rs       ← Working directory → tree object
├── refs.rs          ← HEAD, branches, ref resolution
├── diff.rs          ← Tree diff, working directory diff, flatten trees
├── merge.rs         ← Merge base, three-way diff, conflict handling
├── checkout.rs      ← Branch switching, working directory reconstruction
├── reflog.rs        ← HEAD movement recording
├── ignore.rs        ← .chronolockignore pattern matching
├── stats.rs         ← Object store statistics
├── pack.rs          ← Pack file creation and reading
├── delta.rs         ← Delta compression
└── remote.rs        ← Push, fetch, remote configuration
```

---

## Rust Module System

### Declaring modules

Every `.rs` file must be declared in `main.rs` (or its parent module):

```rust
// src/main.rs
mod object;    // loads src/object.rs
mod staging;   // loads src/staging.rs
mod refs;      // loads src/refs.rs
```

Without `mod object;`, Rust doesn't know `object.rs` exists — even if the file is right there.

### Visibility

- `pub fn` — visible to other modules
- `fn` (no `pub`) — private to the current module
- `pub struct` — struct is visible, but fields are private unless also `pub`
- `pub(crate)` — visible within the crate but not to external users

### Referencing other modules

```rust
// From staging.rs, call a function in object.rs:
use crate::object;
let hash = object::store_blob(&content)?;

// Or import the function directly:
use crate::object::store_blob;
let hash = store_blob(&content)?;
```

### Common error

```
error[E0433]: failed to resolve: use of undeclared crate or module `object`
```

Fix: add `mod object;` to `main.rs`.

---

## Testing Patterns

### Unit tests (inside the source file)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_something() {
        assert_eq!(hash_bytes(b"hello"), "aaf4c61d...");
    }

    #[test]
    fn test_round_trip() {
        let original = b"test data";
        let ops = compute_delta(b"base", original);
        let result = apply_delta(b"base", &ops);
        assert_eq!(result, original);
    }
}
```

### Running tests

```bash
cargo test                    # run all tests
cargo test test_hash          # run tests matching "test_hash"
cargo test -- --nocapture     # show println! output during tests
```

### Key assertions

| Macro | Purpose |
|-------|---------|
| `assert_eq!(a, b)` | Check equality |
| `assert_ne!(a, b)` | Check inequality |
| `assert!(condition)` | Check boolean |
| `assert!(result.is_ok())` | Check Result is Ok |

### `#[cfg(test)]` — test-only code

The `#[cfg(test)]` attribute means the module only compiles when running `cargo test`. It's not included in the release binary. This is where you put test helpers, mock data, and test-only imports.

---

## Error Handling Patterns

### The progression

| Stage | Pattern | When to use |
|-------|---------|-------------|
| 1-2 | `.expect("msg")` | Prototype code, unrecoverable errors |
| 3+ | `Result<T, E>` + `?` | Library functions, I/O operations |
| CLI | `unwrap_or_else` | Top-level command handlers |

### Library functions: return Result, use ?

```rust
pub fn store_blob(content: &[u8]) -> std::io::Result<String> {
    let dir = Path::new(".chronolock/objects").join(&hash[..2]);
    fs::create_dir_all(&dir)?;    // ? propagates error to caller
    fs::write(&file_path, &compressed)?;
    Ok(hash)                       // wrap success in Ok()
}
```

### CLI handlers: unwrap_or_else for user-friendly errors

```rust
fn store(file: &str) {
    let content = fs::read(file).unwrap_or_else(|e| {
        eprintln!("Cannot read {}: {}", file, e);
        std::process::exit(1);
    });
    match object::store_blob(&content) {
        Ok(hash) => println!("{}", hash),
        Err(e) => {
            eprintln!("Failed to store: {}", e);
            std::process::exit(1);
        }
    }
}
```

### Converting error types with .map_err()

```rust
let header = std::str::from_utf8(&raw[..null_pos])
    .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
```

### Converting Option to Result with .ok_or_else()

```rust
let null_pos = raw.iter().position(|&b| b == 0)
    .ok_or_else(|| std::io::Error::new(
        std::io::ErrorKind::InvalidData,
        "No null byte in object header",
    ))?;
```

---

## Ownership and Borrowing Quick Reference

| Syntax | Meaning | Python equivalent |
|--------|---------|-------------------|
| `data: Vec<u8>` | Owned — this function takes ownership | `data: list[int]` (but Python doesn't transfer ownership) |
| `data: &[u8]` | Borrowed read-only — looking but not modifying | `data: bytes` (read-only view) |
| `data: &mut Vec<u8>` | Borrowed read-write — can modify in place | `data: list[int]` (mutable reference) |
| `data: String` | Owned string | `data: str` |
| `data: &str` | Borrowed string slice | `data: str` (read-only view) |

**Key rules:**
- One owner at a time — when you pass ownership, you can't use the original
- Multiple `&` borrows OR one `&mut` borrow — never both
- References can't outlive the data they point to
- `.clone()` creates an owned copy when you need to keep both

---

## Verifying with Git

At any point, verify your Chronolock's output with real git:

```bash
# Point git at the chronolock directory
GIT_DIR=.chronolock git log --oneline
GIT_DIR=.chronolock git cat-file -p <hash>
GIT_DIR=.chronolock git cat-file -t <hash>
GIT_DIR=.chronolock git status
GIT_DIR=.chronolock git log --oneline --graph
```

If git can read it, you built it correctly.
