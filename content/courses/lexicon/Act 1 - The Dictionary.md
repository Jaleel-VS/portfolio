# Act 1 — The Dictionary

> *"Every spell checker begins with a dictionary. Ours begins with a tree."*

In Act 1 you build the core data structure behind Lexicon: a **trie** (pronounced "try"). By the end of these seven stages you'll have a working dictionary that can insert words, look them up, find all words sharing a prefix, serialize to disk for instant reloads, and print itself as an ASCII tree for debugging.

We use Spanish and Portuguese vocabulary throughout — the same words Lexicon will eventually spell-check. This means dealing with Unicode from day one: `ñ`, `ç`, `á`, `é`, `í`, `ó`, `ú`, `ã`, `õ`. No ASCII shortcuts.

**What you'll learn:**
- Rust project setup with `cargo`
- Structs, `HashMap`, `Option`, ownership, borrowing
- Recursive data structures (a node that contains more nodes)
- Iterating over characters in Unicode strings
- Serialization with `serde` + `bincode`
- Writing tests with `#[cfg(test)]` and `cargo test`

**What you'll build:**

```
src/
  main.rs        -- CLI entry point (placeholder for now)
  lib.rs         -- public API surface
  trie.rs        -- the star of Act 1
```

---

## Stage 1 — Hello Lexicon

**Difficulty:** Very Easy
**Goal:** Create the project, set up the file structure, and add dependencies.

### Why this matters

Every Rust project starts with `cargo new`. This stage gets you a compiling project with the right directory layout and all the crates we'll need for Act 1. No code yet — just scaffolding.

### Create the project

Open a terminal and run:

```bash
cargo new lexicon
cd lexicon
```

`cargo new` creates a directory called `lexicon/` with this inside:

```
lexicon/
  Cargo.toml      -- project metadata + dependencies (like package.json or pyproject.toml)
  src/
    main.rs        -- entry point
```

### Edit Cargo.toml

Replace the contents of `Cargo.toml` with:

```toml
[package]
name = "lexicon"
version = "0.1.0"
edition = "2024"

# See more keys and their definitions at
# https://doc.rust-lang.org/cargo/reference/manifest.html

[dependencies]
serde = { version = "1", features = ["derive"] }
bincode = { version = "2", features = ["serde"] }
unicode-segmentation = "1"
```

Line by line:

| Line | What it does |
|------|-------------|
| `name = "lexicon"` | The binary will be called `lexicon` |
| `edition = "2024"` | Use the latest Rust edition (like Python 3 vs 2) |
| `serde = { version = "1", features = ["derive"] }` | Serialization framework. `"derive"` enables `#[derive(Serialize, Deserialize)]` so we don't write serialization code by hand |
| `bincode = { version = "2", features = ["serde"] }` | Binary encoding format. The `"serde"` feature lets bincode work with serde's traits. In bincode 2, serde is optional — you must opt in |
| `unicode-segmentation = "1"` | Splits strings into grapheme clusters (visible characters). We'll use this later for proper Unicode handling |

> **Python comparison:** `Cargo.toml` is like `pyproject.toml` + `requirements.txt` combined. `cargo` handles downloading, building, and version resolution — like `pip` but with a lock file by default.

> **TypeScript comparison:** Think `package.json`. `cargo build` ≈ `npm install && tsc`.

### Create the file structure

We need three source files. Create them:

```bash
touch src/lib.rs src/trie.rs
```

Now edit each file:

**src/main.rs** — the entry point. For now, just a placeholder:

```rust
fn main() {
    println!("Lexicon — a spell checker built from scratch");
}
```

`fn main()` is the entry point of every Rust binary — like `if __name__ == "__main__"` in Python or the top-level code in a Node script. `println!` is a macro (note the `!`) that prints to stdout.

**src/lib.rs** — the library root. This is where we declare our modules:

```rust
pub mod trie;
```

`pub mod trie;` tells Rust: "there's a file called `trie.rs` — make its public items available as `lexicon::trie::*`". The `pub` keyword means other crates (and our `main.rs`) can use it.

> **Python comparison:** `lib.rs` is like `__init__.py`. `pub mod trie;` is like `from . import trie`.

**src/trie.rs** — empty for now, we'll fill it in Stage 2:

```rust
// Trie data structure for dictionary storage
```

### Build and run

```bash
cargo build
```

The first build downloads and compiles all dependencies. Subsequent builds are incremental and fast. You'll see:

```
   Compiling serde v1.x.x
   Compiling bincode v2.x.x
   Compiling unicode-segmentation v1.x.x
   Compiling lexicon v0.1.0
    Finished `dev` profile [unoptimized + debuginfo] target(s)
```

Run it:

```bash
cargo run
```

```
Lexicon — a spell checker built from scratch
```

### Checkpoint

Your project structure:

```
lexicon/
  Cargo.toml          -- with serde, bincode, unicode-segmentation
  src/
    main.rs            -- prints a greeting
    lib.rs             -- declares the trie module
    trie.rs            -- empty, ready for Stage 2
```

You have a compiling Rust project with all dependencies. Stage 2 begins the real work.

---

## Stage 2 — The Node

**Difficulty:** Easy
**Goal:** Define the `TrieNode` struct and the `Trie` wrapper. Understand why we use `HashMap<char, TrieNode>`.

### What is a trie?

A trie (from "re**trie**val") is a tree where each node represents one character of a word. Words that share a prefix share the same path from the root. Insert "gato", "gata", and "gatito" into a trie and you get:

```
        (root)
          |
          g
          |
          a
          |
          t
         / \
        o   a          i
       [*]  [*]        |
                        t
                        |
                        o
                       [*]

[*] = is_word: true
```

The path `g → a → t` is shared by all three words. "gato" ends at `o` (left branch), "gata" ends at `a` (right branch), and "gatito" continues down `i → t → o`.

> **Why not just use a HashSet of words?** A `HashSet<String>` gives O(1) lookup but can't do prefix search ("find all words starting with `com`"). A trie gives O(m) lookup *and* prefix search, where m is the word length. It also uses less memory when words share prefixes — which they do in every natural language.

### Why HashMap, not an array?

You might think: "letters a-z = 26 slots, use an array." That works for ASCII English, but Lexicon supports Spanish and Portuguese:

- Spanish: ñ (U+00F1), á, é, í, ó, ú, ü
- Portuguese: ç (U+00E7), ã, õ, á, é, í, ó, ú

A fixed-size array would need to cover all of Unicode — wasteful. `HashMap<char, TrieNode>` stores only the children that actually exist. For a node in the middle of "ñoño", it has exactly one child: `ñ` or `o`. No wasted slots.

> **Python comparison:** In Python you'd write `children: dict[str, TrieNode]`. Rust's `HashMap<char, TrieNode>` is the same idea, but the key is a `char` (a single Unicode scalar value, 4 bytes) instead of a one-character string.

### The code

Open `src/trie.rs` and replace its contents:

```rust
use std::collections::HashMap;

/// A single node in the trie.
///
/// Each node holds a map of children (one per character), a flag indicating
/// whether this node marks the end of a valid word, and a frequency count
/// used later to rank spelling suggestions.
#[derive(Debug, Clone)]
pub struct TrieNode {
    pub children: HashMap<char, TrieNode>,
    pub is_word: bool,
    pub frequency: u32,
}

impl TrieNode {
    /// Create a new empty node.
    pub fn new() -> Self {
        TrieNode {
            children: HashMap::new(),
            is_word: false,
            frequency: 0,
        }
    }
}

/// The trie itself — just a wrapper around the root node.
///
/// We keep this as a separate struct so we can add methods like `insert`,
/// `contains`, and `prefix_search` without cluttering TrieNode.
#[derive(Debug, Clone)]
pub struct Trie {
    pub root: TrieNode,
}

impl Trie {
    /// Create a new empty trie.
    pub fn new() -> Self {
        Trie {
            root: TrieNode::new(),
        }
    }
}
```

Let's break this down piece by piece.

**`use std::collections::HashMap;`**
Import `HashMap` from the standard library. In Python this is built-in (`dict`). In Rust you import it explicitly.

**`#[derive(Debug, Clone)]`**
This line asks the compiler to auto-generate two trait implementations:
- `Debug` — lets you print the struct with `{:?}` (like Python's `__repr__`)
- `Clone` — lets you make a deep copy with `.clone()` (like Python's `copy.deepcopy`)

**`pub struct TrieNode { ... }`**
Defines a struct (like a Python `dataclass` or TypeScript `interface`). `pub` means it's visible outside this module.

| Field | Type | Purpose |
|-------|------|---------|
| `children` | `HashMap<char, TrieNode>` | Map from character to child node |
| `is_word` | `bool` | `true` if a valid word ends at this node |
| `frequency` | `u32` | How common the word is (for ranking suggestions later) |

**`impl TrieNode { ... }`**
The `impl` block is where you define methods. `TrieNode::new()` is a constructor — Rust doesn't have a special `__init__` or `constructor` keyword. By convention, constructors are called `new()`.

**`Self`**
Inside an `impl TrieNode` block, `Self` is an alias for `TrieNode`. It's like `self.__class__` in Python.

**`pub struct Trie { root: TrieNode }`**
The `Trie` struct wraps a root node. This separation keeps the public API clean: users call `trie.insert("gato")`, not `trie.root.insert_recursive("gato", 0)`.

### A note on ownership

Notice that `children: HashMap<char, TrieNode>` stores `TrieNode` values directly — not pointers, not references. Each node *owns* its children. When a node is dropped (freed), all its children are dropped too, recursively. No garbage collector needed.

> **Python comparison:** In Python, `children: dict[str, TrieNode]` stores references. The garbage collector figures out when to free them. In Rust, ownership is explicit — the parent owns the children, period.

This will matter in Stage 3 when we insert into the trie and fight the borrow checker for the first time.

### Test it

Add a test at the bottom of `src/trie.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_node_is_empty() {
        let node = TrieNode::new();
        assert!(node.children.is_empty());
        assert!(!node.is_word);
        assert_eq!(node.frequency, 0);
    }

    #[test]
    fn test_new_trie_has_empty_root() {
        let trie = Trie::new();
        assert!(trie.root.children.is_empty());
        assert!(!trie.root.is_word);
    }
}
```

**`#[cfg(test)]`** — this module only compiles when running tests. It's like putting tests in a `tests/` directory in Python, but co-located with the code.

**`use super::*;`** — import everything from the parent module (our `TrieNode` and `Trie`).

**`#[test]`** — marks a function as a test case. `cargo test` finds and runs all of these.

**`assert!`** — panics if the condition is false. `assert_eq!` checks equality and prints both values on failure.

Run the tests:

```bash
cargo test
```

```
running 2 tests
test trie::tests::test_new_node_is_empty ... ok
test trie::tests::test_new_trie_has_empty_root ... ok

test result: ok. 2 passed; 0 failed
```

### Checkpoint

You now have:
- `TrieNode` — a recursive struct with `HashMap<char, TrieNode>`, `is_word`, and `frequency`
- `Trie` — a wrapper holding the root node
- Two passing tests confirming the defaults

The trie exists but it's empty. Stage 3 teaches it to learn words.

---

## Stage 3 — Insert

**Difficulty:** Easy
**Goal:** Insert words into the trie character by character. Trace the tree after inserting Spanish words.

### How insertion works

To insert "gato" into the trie:

1. Start at the root
2. Look at the first character: `g`. Does root have a child `g`? No → create one. Move to it.
3. Next character: `a`. Does the `g` node have a child `a`? No → create one. Move to it.
4. Next character: `t`. Create it, move to it.
5. Next character: `o`. Create it, move to it.
6. No more characters. Mark this node as `is_word = true`.

Now insert "gata":

1. Start at root. `g` → already exists, move to it.
2. `a` → already exists, move to it.
3. `t` → already exists, move to it.
4. `a` → doesn't exist under `t`, create it. Mark `is_word = true`.

The path `g → a → t` is shared. This is the magic of tries — shared prefixes are stored once.

### The code

Add this method inside the `impl Trie` block in `src/trie.rs`:

```rust
impl Trie {
    pub fn new() -> Self {
        Trie {
            root: TrieNode::new(),
        }
    }

    /// Insert a word into the trie with a given frequency.
    ///
    /// Walks the trie character by character, creating nodes as needed.
    /// Marks the final node as a word endpoint.
    pub fn insert(&mut self, word: &str, frequency: u32) {
        let mut current = &mut self.root;

        for ch in word.chars() {
            current = current.children.entry(ch).or_insert_with(TrieNode::new);
        }

        current.is_word = true;
        current.frequency = frequency;
    }
}
```

This is dense. Let's unpack every line.

**`pub fn insert(&mut self, word: &str, frequency: u32)`**

| Parameter | Type | Meaning |
|-----------|------|---------|
| `&mut self` | mutable reference to the Trie | We need to modify the trie (add nodes) |
| `word` | `&str` | A borrowed string slice — we read it but don't own it |
| `frequency` | `u32` | How common this word is (1 = default) |

> **Python comparison:** `def insert(self, word: str, frequency: int)`. The `&mut` is the key difference — Rust forces you to declare "I will modify this object." Python lets you mutate anything anytime.

> **TypeScript comparison:** `insert(word: string, frequency: number): void`. TypeScript has no concept of mutable vs immutable references.

**`let mut current = &mut self.root;`**

`current` is a mutable reference that starts at the root and walks down the trie. `mut` on the `let` means we'll reassign `current` to point to different nodes as we walk.

**`for ch in word.chars()`**

`.chars()` returns an iterator over the Unicode scalar values in the string. For "gato" that's `['g', 'a', 't', 'o']`. For "ñoño" that's `['ñ', 'o', 'ñ', 'o']` — Unicode characters work correctly.

> **Important:** `.chars()` iterates over Unicode scalar values, not bytes. The string "café" is 5 bytes in UTF-8 (`é` is 2 bytes) but 4 `char`s. This is what we want.

**`current = current.children.entry(ch).or_insert_with(TrieNode::new);`**

This is the most important line. Let's break it into pieces:

1. `current.children` — the `HashMap<char, TrieNode>` of the current node
2. `.entry(ch)` — look up the key `ch` in the map. Returns an `Entry` enum that's either `Occupied` (key exists) or `Vacant` (key doesn't exist)
3. `.or_insert_with(TrieNode::new)` — if vacant, insert a new `TrieNode` and return a mutable reference to it. If occupied, just return a mutable reference to the existing value
4. `current = ...` — move `current` down to the child node

> **Python comparison:** This one line replaces:
> ```python
> if ch not in current.children:
>     current.children[ch] = TrieNode()
> current = current.children[ch]
> ```
> The `entry` API is Rust's way of doing "get or insert" without looking up the key twice.

**`current.is_word = true;`**

After the loop, `current` points to the last character's node. Mark it as a word endpoint.

### Common mistake: the borrow checker fight

You might try writing the loop like this:

```rust
// THIS DOES NOT COMPILE
for ch in word.chars() {
    if !current.children.contains_key(&ch) {
        current.children.insert(ch, TrieNode::new());
    }
    current = current.children.get_mut(&ch).unwrap();
}
```

This fails because `contains_key` borrows `current.children` immutably, then `insert` tries to borrow it mutably — in the same scope. Rust's borrow checker says no: you can't have an immutable borrow and a mutable borrow alive at the same time.

The `entry` API solves this by doing the check-and-insert in a single operation, with a single borrow. This is a pattern you'll see constantly in Rust.

### Tracing the insertions

Let's trace what happens when we insert "gato", "gata", and "gatito":

```
After insert("gato", 1):

  (root)
    |
    g
    |
    a
    |
    t
    |
    o [*]

After insert("gata", 1):

  (root)
    |
    g
    |
    a
    |
    t
   / \
  o   a
 [*] [*]

After insert("gatito", 1):

  (root)
    |
    g
    |
    a
    |
    t
   /|\
  o  a  i
 [*][*] |
        t
        |
        o
       [*]
```

Three words, but only 8 nodes (root + g + a + t + o + a + i + t + o = 9 nodes, root included). Without a trie, storing these as separate strings would duplicate "gat" three times.

### Tests

Add these tests to the `mod tests` block:

```rust
#[test]
fn test_insert_creates_path() {
    let mut trie = Trie::new();
    trie.insert("gato", 1);

    // Walk the path manually: root -> g -> a -> t -> o
    let g = trie.root.children.get(&'g').expect("missing 'g'");
    let a = g.children.get(&'a').expect("missing 'a'");
    let t = a.children.get(&'t').expect("missing 't'");
    let o = t.children.get(&'o').expect("missing 'o'");

    assert!(o.is_word);
    assert_eq!(o.frequency, 1);
    assert!(o.children.is_empty()); // 'o' is a leaf
}

#[test]
fn test_insert_shared_prefix() {
    let mut trie = Trie::new();
    trie.insert("gato", 5);
    trie.insert("gata", 3);

    // 'g', 'a', 't' are shared — 't' should have two children
    let t = &trie.root.children[&'g'].children[&'a'].children[&'t'];
    assert_eq!(t.children.len(), 2);
    assert!(t.children.contains_key(&'o'));
    assert!(t.children.contains_key(&'a'));
}

#[test]
fn test_insert_unicode_words() {
    let mut trie = Trie::new();
    trie.insert("ñoño", 1);    // Spanish: silly/prudish
    trie.insert("coração", 1); // Portuguese: heart

    // ñ is a single char (U+00F1), not n + combining tilde
    assert!(trie.root.children.contains_key(&'ñ'));

    // ç is a single char (U+00E7)
    let c = &trie.root.children[&'c'];
    let o = &c.children[&'o'];
    let r = &o.children[&'r'];
    let a = &r.children[&'a'];
    assert!(a.children.contains_key(&'ç'));
}

#[test]
fn test_insert_longer_word_extends_path() {
    let mut trie = Trie::new();
    trie.insert("gato", 1);
    trie.insert("gatito", 1);

    // "gato" should still be marked as a word
    let o = &trie.root.children[&'g'].children[&'a']
        .children[&'t'].children[&'o'];
    assert!(o.is_word);

    // "gatito" extends from 't' through 'i' -> 't' -> 'o'
    let i = &trie.root.children[&'g'].children[&'a']
        .children[&'t'].children[&'i'];
    assert!(!i.is_word); // 'i' alone is not a word
    let final_o = &i.children[&'t'].children[&'o'];
    assert!(final_o.is_word);
}
```

Run:

```bash
cargo test
```

```
running 6 tests
test trie::tests::test_new_node_is_empty ... ok
test trie::tests::test_new_trie_has_empty_root ... ok
test trie::tests::test_insert_creates_path ... ok
test trie::tests::test_insert_shared_prefix ... ok
test trie::tests::test_insert_unicode_words ... ok
test trie::tests::test_insert_longer_word_extends_path ... ok

test result: ok. 6 passed; 0 failed
```

### Checkpoint

The trie can now learn words. `insert` walks the tree character by character, creating nodes as needed, and marks the final node. Shared prefixes are stored once. Unicode characters like `ñ` and `ç` work because we use `HashMap<char, TrieNode>` — each `char` is a full Unicode scalar value.

Next: asking the trie "do you know this word?"

---

## Stage 4 — Search

**Difficulty:** Easy
**Goal:** Implement `contains()` — walk the trie and check if a word exists. Test with Spanish words.

### How search works

Searching is simpler than insertion — we just walk the trie without creating anything. For `contains("hola")`:

1. Start at root. Does root have child `h`? Yes → move to it.
2. Does `h` have child `o`? Yes → move to it.
3. Does `o` have child `l`? Yes → move to it.
4. Does `l` have child `a`? Yes → move to it.
5. No more characters. Is `a` marked as `is_word`? Yes → return `true`.

For `contains("holaa")` (a misspelling — extra `a`):

1. Walk `h → o → l → a` — all exist.
2. Does `a` have child `a`? No → return `false`.

For `contains("hol")` (a prefix, not a complete word):

1. Walk `h → o → l` — all exist.
2. No more characters. Is `l` marked as `is_word`? No → return `false`.

This last case is important: the trie contains the *path* `h-o-l` (because "hola" passes through it), but "hol" itself was never inserted as a word.

### The code

Add this method to the `impl Trie` block:

```rust
/// Check if a word exists in the trie.
///
/// Returns `true` only if the full word was previously inserted —
/// partial prefixes return `false`.
pub fn contains(&self, word: &str) -> bool {
    let mut current = &self.root;

    for ch in word.chars() {
        match current.children.get(&ch) {
            Some(node) => current = node,
            None => return false,
        }
    }

    current.is_word
}
```

**`&self`** — note: no `mut`. We're only reading the trie, not modifying it. Rust enforces this at compile time. You could have multiple threads calling `contains` simultaneously because it only takes a shared reference.

**`match current.children.get(&ch)`**

`HashMap::get` returns `Option<&TrieNode>` — either `Some(&node)` if the key exists, or `None` if it doesn't.

`match` is Rust's pattern matching (like Python's `match`/`case` but exhaustive — you must handle every variant). Here:
- `Some(node)` — the child exists, move `current` down to it
- `None` — dead end, the word isn't in the trie, return `false` immediately

> **Python comparison:**
> ```python
> def contains(self, word: str) -> bool:
>     current = self.root
>     for ch in word:
>         if ch not in current.children:
>             return False
>         current = current.children[ch]
>     return current.is_word
> ```
> Almost identical logic. The Rust version uses `match` on `Option` instead of `if ch not in dict`.

**`current.is_word`**

After walking all characters, we check if this node marks the end of a real word. This is what distinguishes "hol" (a prefix) from "hola" (a word).

### Tests

```rust
#[test]
fn test_contains_inserted_word() {
    let mut trie = Trie::new();
    trie.insert("hola", 1);

    assert!(trie.contains("hola"));
}

#[test]
fn test_contains_rejects_missing_word() {
    let mut trie = Trie::new();
    trie.insert("hola", 1);

    assert!(!trie.contains("holaa")); // extra letter
    assert!(!trie.contains("hol"));   // prefix only
    assert!(!trie.contains("adios")); // never inserted
    assert!(!trie.contains(""));      // empty string
}

#[test]
fn test_contains_multiple_words() {
    let mut trie = Trie::new();
    trie.insert("casa", 1);  // house
    trie.insert("caso", 1);  // case
    trie.insert("casi", 1);  // almost

    assert!(trie.contains("casa"));
    assert!(trie.contains("caso"));
    assert!(trie.contains("casi"));
    assert!(!trie.contains("cas")); // shared prefix, not a word
}

#[test]
fn test_contains_unicode() {
    let mut trie = Trie::new();
    trie.insert("información", 1);  // Spanish: information
    trie.insert("informação", 1);   // Portuguese: information

    assert!(trie.contains("información"));
    assert!(trie.contains("informação"));
    assert!(!trie.contains("informacion")); // missing accent — misspelling!
}

#[test]
fn test_contains_common_misspellings() {
    let mut trie = Trie::new();
    // Insert correct spellings
    trie.insert("recibir", 1);  // to receive
    trie.insert("haber", 1);    // to have (auxiliary)
    trie.insert("conocer", 1);  // to know

    // Correct spellings found
    assert!(trie.contains("recibir"));
    assert!(trie.contains("haber"));
    assert!(trie.contains("conocer"));

    // Common misspellings rejected
    assert!(!trie.contains("recivir"));  // b/v confusion
    assert!(!trie.contains("aver"));     // silent h dropped
    assert!(!trie.contains("conoser")); // c/s confusion
}
```

That last test is the heart of a spell checker: correct words pass, misspellings fail. The trie doesn't know *why* "recivir" is wrong — it just knows it was never inserted. Later (in Act 3) we'll use a BK-tree to suggest "recibir" as a correction.

> **Language learning note:** The misspellings above are real mistakes Spanish learners make:
> - **recivir** → recibir: `b` and `v` sound identical in Spanish
> - **aver** → haber: the `h` is silent in Spanish
> - **conoser** → conocer: `c` before `e/i` sounds like `s` in Latin American Spanish

```bash
cargo test
```

```
running 11 tests
...
test result: ok. 11 passed; 0 failed
```

### Checkpoint

The trie now supports exact-match lookup. `contains` walks the tree and checks `is_word` at the end. Misspelled words are rejected because their character path either dead-ends or reaches a node that isn't marked as a word.

Next: finding all words that share a prefix.

---

## Stage 5 — Prefix Matching

**Difficulty:** Medium
**Goal:** Implement `prefix_search()` — find all words starting with a given prefix. This is the feature that makes tries special.

### Why prefix search matters

A `HashSet<String>` can tell you if "comprar" is a word, but it can't efficiently answer "what words start with `com`?" You'd have to scan every word in the set.

A trie answers this in O(m + k) time — walk m characters to the prefix node, then collect all k words in that subtree. For a 300,000-word dictionary, this is the difference between checking 300,000 words and checking maybe 50.

This powers autocomplete, tab completion, and (in Lexicon's case) finding correction candidates that share a prefix with a misspelled word.

### The algorithm

1. Walk the trie to the end of the prefix (same as `contains`, but don't check `is_word`)
2. If the prefix path doesn't exist, return an empty list
3. From the prefix node, recursively collect all words in the subtree

For prefix "com" with words "como", "comer", "comenzar", "comprar" in the trie:

```
  (root)
    |
    c
    |
    o
    |
    m ← we navigate here for prefix "com"
   / \  \
  o   e   p
  |   |    \
 [*]  r     r
como  |      \
      [*]     a
     comer     \
       |        r
       n       [*]
       |      comprar
       z
       |
       a
       |
       r
      [*]
     comenzar
```

From the `m` node, we explore every branch and collect words where `is_word == true`.

### The code

We need a helper method that recursively collects words from a subtree. Add both methods to `impl Trie`:

```rust
/// Find all words in the trie that start with the given prefix.
///
/// Returns a vector of (word, frequency) pairs. Returns an empty
/// vector if the prefix doesn't exist in the trie.
pub fn prefix_search(&self, prefix: &str) -> Vec<(String, u32)> {
    // Step 1: walk to the prefix node
    let mut current = &self.root;
    for ch in prefix.chars() {
        match current.children.get(&ch) {
            Some(node) => current = node,
            None => return Vec::new(),
        }
    }

    // Step 2: collect all words from this subtree
    let mut results = Vec::new();
    let mut path = prefix.to_string();
    Self::collect_words(current, &mut path, &mut results);
    results
}

/// Recursively collect all words from a subtree.
///
/// `path` accumulates the characters as we descend. When we hit a node
/// where `is_word == true`, we snapshot the current path as a result.
fn collect_words(
    node: &TrieNode,
    path: &mut String,
    results: &mut Vec<(String, u32)>,
) {
    if node.is_word {
        results.push((path.clone(), node.frequency));
    }

    // Visit children in sorted order for deterministic output
    let mut children: Vec<(&char, &TrieNode)> = node.children.iter().collect();
    children.sort_by_key(|&(ch, _)| *ch);

    for (&ch, child) in children {
        path.push(ch);
        Self::collect_words(child, path, results);
        path.pop(); // backtrack — remove the character we just added
    }
}
```

Let's trace through this carefully.

**`prefix_search`** — the public method:

The first half is identical to `contains`: walk the trie following the prefix characters. If any character is missing, the prefix doesn't exist — return empty.

`let mut path = prefix.to_string();` — convert the `&str` prefix into an owned `String` that we can push characters onto. `.to_string()` allocates a new `String` on the heap.

> **Python comparison:** In Python, strings are immutable so you'd use a list of characters. In Rust, `String` is mutable — you can `push` and `pop` characters.

**`collect_words`** — the recursive helper:

This is a depth-first traversal. At each node:

1. If `is_word`, save a copy of the current path (that's a complete word)
2. For each child, push the child's character onto `path`, recurse, then pop it off (backtrack)

The push/pop pattern builds up the word as we descend and tears it down as we return. This avoids allocating a new `String` at every level.

**`path.clone()`** — when we find a word, we need to save a *copy* of the path. Without `.clone()`, we'd be trying to move `path` into the results vector while still using it for the rest of the traversal. The borrow checker would reject this.

**Sorted children** — `HashMap` iteration order is random. We sort by character so tests get deterministic results. In production you might skip this for speed, but for a learning project, predictable output is worth the cost.

### Common mistake: forgetting to backtrack

If you forget `path.pop()`:

```rust
// BUG: no backtrack
for (&ch, child) in &node.children {
    path.push(ch);
    Self::collect_words(child, path, results);
    // missing: path.pop();
}
```

The path grows forever. After visiting "como", the path is "como". When we backtrack to visit "comer", the path becomes "comomer" instead of "comer". Always pair `push` with `pop`.

### Tests

```rust
#[test]
fn test_prefix_search_basic() {
    let mut trie = Trie::new();
    trie.insert("como", 10);     // like/how
    trie.insert("comer", 8);     // to eat
    trie.insert("comenzar", 5);  // to begin
    trie.insert("comprar", 7);   // to buy

    let results = trie.prefix_search("com");
    let words: Vec<&str> = results.iter().map(|(w, _)| w.as_str()).collect();

    assert_eq!(words.len(), 4);
    assert!(words.contains(&"como"));
    assert!(words.contains(&"comer"));
    assert!(words.contains(&"comenzar"));
    assert!(words.contains(&"comprar"));
}

#[test]
fn test_prefix_search_narrow() {
    let mut trie = Trie::new();
    trie.insert("como", 10);
    trie.insert("comer", 8);
    trie.insert("comenzar", 5);
    trie.insert("comprar", 7);

    // "comp" narrows to just "comprar"
    let results = trie.prefix_search("comp");
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].0, "comprar");
}

#[test]
fn test_prefix_search_no_match() {
    let mut trie = Trie::new();
    trie.insert("hola", 1);

    let results = trie.prefix_search("xyz");
    assert!(results.is_empty());
}

#[test]
fn test_prefix_search_exact_word_is_prefix() {
    let mut trie = Trie::new();
    trie.insert("com", 1);     // "com" is itself a word
    trie.insert("como", 10);
    trie.insert("comer", 8);

    let results = trie.prefix_search("com");
    let words: Vec<&str> = results.iter().map(|(w, _)| w.as_str()).collect();

    // Should include "com" itself plus words that extend it
    assert_eq!(words.len(), 3);
    assert!(words.contains(&"com"));
    assert!(words.contains(&"como"));
    assert!(words.contains(&"comer"));
}

#[test]
fn test_prefix_search_empty_prefix_returns_all() {
    let mut trie = Trie::new();
    trie.insert("a", 1);
    trie.insert("b", 1);
    trie.insert("c", 1);

    // Empty prefix = start from root = all words
    let results = trie.prefix_search("");
    assert_eq!(results.len(), 3);
}

#[test]
fn test_prefix_search_preserves_frequency() {
    let mut trie = Trie::new();
    trie.insert("como", 100);
    trie.insert("comer", 50);

    let results = trie.prefix_search("com");
    let como = results.iter().find(|(w, _)| w == "como").unwrap();
    let comer = results.iter().find(|(w, _)| w == "comer").unwrap();

    assert_eq!(como.1, 100);
    assert_eq!(comer.1, 50);
}
```

```bash
cargo test
```

```
running 17 tests
...
test result: ok. 17 passed; 0 failed
```

### Checkpoint

The trie now supports prefix search — the killer feature that makes it better than a hash set. `prefix_search("com")` walks to the `m` node and recursively collects all words in the subtree. The push/pop backtracking pattern builds words without extra allocations.

Next: saving the trie to disk so we don't rebuild it every time.

---

## Stage 6 — Serialize

**Difficulty:** Medium
**Goal:** Save the compiled trie to disk with serde + bincode. Load it back. Measure the speed difference.

### Why serialize?

Building a trie from a 300,000-word dictionary takes ~200ms. That's fine for a one-time setup, but a spell checker that takes 200ms to start every time you run it feels sluggish. The solution: build the trie once, serialize it to a binary file, and deserialize it on subsequent runs.

With bincode, deserializing a pre-built trie takes ~20ms — a 10x speedup. The binary file is also smaller than the text word list because bincode is a compact format with no field names or delimiters.

### serde + bincode: how they fit together

**serde** is a framework. It defines two traits:
- `Serialize` — "I know how to describe my fields to any format"
- `Deserialize` — "I know how to reconstruct myself from any format's description"

**bincode** is a format. It implements serde's serializer and deserializer interfaces to convert Rust structs to/from compact binary bytes.

You derive `Serialize` and `Deserialize` on your structs, then call bincode's functions. serde generates the glue code at compile time — zero runtime reflection.

> **Python comparison:** Like `pickle.dumps()` / `pickle.loads()`, but type-safe and cross-version stable. serde is the `pickle` protocol; bincode is one specific encoding format.

### bincode 2 API

bincode 2 made serde an optional feature. Since we enabled `features = ["serde"]` in Cargo.toml, we use the functions in the `bincode::serde` module:

| Function | Purpose |
|----------|---------|
| `bincode::serde::encode_to_vec(&value, config)` | Serialize to `Vec<u8>` |
| `bincode::serde::decode_from_slice(&bytes, config)` | Deserialize from `&[u8]`, returns `(value, bytes_read)` |

Both take a config argument. We'll use `bincode::config::standard()` which gives sensible defaults (variable-length integers, little-endian).

### The code

First, add serde derives to our structs. Update the top of `src/trie.rs`:

```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::Path;
use std::time::Instant;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrieNode {
    pub children: HashMap<char, TrieNode>,
    pub is_word: bool,
    pub frequency: u32,
}
```

The only change is adding `Serialize, Deserialize` to the `#[derive(...)]` line. serde's derive macro inspects the struct fields at compile time and generates serialization code. Because `HashMap`, `char`, `bool`, and `u32` all implement `Serialize`/`Deserialize` already, and `TrieNode` contains only those types (plus itself, recursively), the derive works automatically.

Do the same for `Trie`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Trie {
    pub root: TrieNode,
}
```

Now add save/load methods to `impl Trie`:

```rust
/// Save the trie to a binary file using bincode.
///
/// The file can be loaded back with `Trie::load()` for fast startup.
pub fn save(&self, path: &Path) -> io::Result<()> {
    let bytes = bincode::serde::encode_to_vec(self, bincode::config::standard())
        .map_err(|e| io::Error::new(io::ErrorKind::Other, e.to_string()))?;
    fs::write(path, bytes)
}

/// Load a trie from a binary file previously created by `save()`.
pub fn load(path: &Path) -> io::Result<Self> {
    let bytes = fs::read(path)?;
    let (trie, _bytes_read) =
        bincode::serde::decode_from_slice(&bytes, bincode::config::standard())
            .map_err(|e| io::Error::new(io::ErrorKind::Other, e.to_string()))?;
    Ok(trie)
}
```

Let's unpack the new concepts.

**`path: &Path`**

`Path` is Rust's cross-platform file path type (like `pathlib.Path` in Python). `&Path` is a borrowed reference — we just need to read the path, not own it.

**`bincode::serde::encode_to_vec(self, bincode::config::standard())`**

This is the key call. It takes:
1. `self` — a reference to our `Trie` (which implements `serde::Serialize`)
2. `bincode::config::standard()` — the encoding configuration

It returns `Result<Vec<u8>, EncodeError>` — either the serialized bytes or an error.

**`.map_err(|e| io::Error::new(...))?`**

bincode returns its own error type. Our function returns `io::Result`, so we convert the bincode error into an `io::Error`. The `?` operator propagates the error — if encoding fails, the function returns early with the error.

> **Python comparison:**
> ```python
> # Save
> with open(path, 'wb') as f:
>     pickle.dump(self, f)
>
> # Load
> with open(path, 'rb') as f:
>     return pickle.load(f)
> ```
> Same idea, but Rust's version is type-safe — `decode_from_slice` returns a `Trie`, not an `Any`.

**`let (trie, _bytes_read) = ...`**

`decode_from_slice` returns a tuple: the decoded value and how many bytes were consumed. We ignore the byte count with `_bytes_read` (the leading underscore tells Rust "I know this is unused").

### Measuring the difference

Add a convenience method to build a trie from a word list and time it:

```rust
/// Build a trie from an iterator of (word, frequency) pairs.
/// Returns the trie and the time taken to build it.
pub fn from_words(words: impl Iterator<Item = (String, u32)>) -> (Self, std::time::Duration) {
    let start = Instant::now();
    let mut trie = Trie::new();
    for (word, freq) in words {
        trie.insert(&word, freq);
    }
    (trie, start.elapsed())
}
```

### Tests

```rust
#[test]
fn test_save_and_load_roundtrip() {
    let mut trie = Trie::new();
    trie.insert("gato", 5);
    trie.insert("gata", 3);
    trie.insert("gatito", 1);
    trie.insert("información", 10);
    trie.insert("ñoño", 2);

    // Save to a temp file
    let dir = std::env::temp_dir();
    let path = dir.join("lexicon_test_trie.bin");

    trie.save(&path).expect("save failed");

    // Load it back
    let loaded = Trie::load(&path).expect("load failed");

    // Verify all words survived the roundtrip
    assert!(loaded.contains("gato"));
    assert!(loaded.contains("gata"));
    assert!(loaded.contains("gatito"));
    assert!(loaded.contains("información"));
    assert!(loaded.contains("ñoño"));
    assert!(!loaded.contains("missing"));

    // Verify frequencies survived
    let results = loaded.prefix_search("gat");
    let gato = results.iter().find(|(w, _)| w == "gato").unwrap();
    assert_eq!(gato.1, 5);

    // Clean up
    let _ = fs::remove_file(&path);
}

#[test]
fn test_save_load_empty_trie() {
    let trie = Trie::new();
    let dir = std::env::temp_dir();
    let path = dir.join("lexicon_test_empty.bin");

    trie.save(&path).expect("save failed");
    let loaded = Trie::load(&path).expect("load failed");

    assert!(!loaded.contains("anything"));
    assert!(loaded.prefix_search("").is_empty());

    let _ = fs::remove_file(&path);
}

#[test]
fn test_build_vs_load_timing() {
    // Build a trie with enough words to see a timing difference
    let words: Vec<(String, u32)> = (0..10_000)
        .map(|i| (format!("word{i}"), i as u32))
        .collect();

    let start = Instant::now();
    let mut trie = Trie::new();
    for (word, freq) in &words {
        trie.insert(word, *freq);
    }
    let build_time = start.elapsed();

    // Save
    let dir = std::env::temp_dir();
    let path = dir.join("lexicon_test_timing.bin");
    trie.save(&path).expect("save failed");

    // Load and time it
    let start = Instant::now();
    let loaded = Trie::load(&path).expect("load failed");
    let load_time = start.elapsed();

    // Verify correctness
    assert!(loaded.contains("word0"));
    assert!(loaded.contains("word9999"));

    // Print timing (visible with `cargo test -- --nocapture`)
    println!("Build time (10k words): {:?}", build_time);
    println!("Load time (from cache): {:?}", load_time);
    println!(
        "Speedup: {:.1}x",
        build_time.as_secs_f64() / load_time.as_secs_f64()
    );

    let _ = fs::remove_file(&path);
}
```

Run with `--nocapture` to see the timing output:

```bash
cargo test test_build_vs_load_timing -- --nocapture
```

You'll see something like:

```
Build time (10k words): 12.3ms
Load time (from cache): 2.1ms
Speedup: 5.9x
```

The speedup grows with dictionary size. At 300k words (a real English dictionary), expect 10x or more.

### Common mistake: forgetting the serde feature

If you see this error:

```
error[E0277]: the trait bound `HashMap<char, TrieNode>: Serialize` is not satisfied
```

Check that your `Cargo.toml` has `features = ["derive"]` on serde and `features = ["serde"]` on bincode. Without these feature flags, the derive macros and serde integration aren't compiled.

### Checkpoint

The trie can now persist to disk. `save()` serializes the entire tree to a compact binary file using serde + bincode. `load()` deserializes it back. The roundtrip preserves all words, frequencies, and structure. Loading from cache is significantly faster than rebuilding from a word list.

Full `src/trie.rs` so far (imports and struct definitions):

```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::Path;
use std::time::Instant;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrieNode {
    pub children: HashMap<char, TrieNode>,
    pub is_word: bool,
    pub frequency: u32,
}

impl TrieNode {
    pub fn new() -> Self {
        TrieNode {
            children: HashMap::new(),
            is_word: false,
            frequency: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Trie {
    pub root: TrieNode,
}
```

Next: seeing the trie with your own eyes.

---

## Stage 7 — Trie Visualization

**Difficulty:** Easy
**Goal:** Print the trie as an ASCII tree for debugging. See how "casa", "caso", "casi" share the "cas" prefix.

### Why visualize?

When something goes wrong with a data structure, the fastest way to debug is to *look at it*. A trie with 10 words is hard to reason about from `println!("{:?}", trie)` — you get a wall of nested `HashMap` output. An ASCII tree shows the structure at a glance.

### The output we want

For a trie containing "casa", "caso", "casi":

```
.
└── c
    └── a
        └── s
            ├── a [*] (freq: 1)
            ├── i [*] (freq: 1)
            └── o [*] (freq: 1)
```

The `[*]` marks word endpoints. The tree connectors (`├──`, `└──`, `│`) show parent-child relationships. Children are sorted alphabetically.

For "gato", "gata", "gatito":

```
.
└── g
    └── a
        └── t
            ├── a [*] (freq: 1)
            ├── i
            │   └── t
            │       └── o [*] (freq: 1)
            └── o [*] (freq: 1)
```

You can immediately see that "gat" is the shared prefix, and "gatito" branches off from `t` through `i`.

### The code

We'll implement the `Display` trait for `Trie`, which lets you print it with `println!("{trie}")`. Add this to `src/trie.rs`:

```rust
use std::fmt;

impl fmt::Display for Trie {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        writeln!(f, ".")?;
        Self::fmt_node(&self.root, f, "")
    }
}

impl Trie {
    /// Recursively format a node and its children as an ASCII tree.
    ///
    /// `prefix` is the string of box-drawing characters that prints to the
    /// left of this node's children (vertical bars and spaces from ancestors).
    fn fmt_node(node: &TrieNode, f: &mut fmt::Formatter<'_>, prefix: &str) -> fmt::Result {
        // Sort children for deterministic output
        let mut children: Vec<(&char, &TrieNode)> = node.children.iter().collect();
        children.sort_by_key(|&(ch, _)| *ch);

        let last_idx = children.len().saturating_sub(1);

        for (i, (&ch, child)) in children.iter().enumerate() {
            let is_last = i == last_idx;

            // Pick the connector: └── for the last child, ├── for others
            let connector = if is_last { "└── " } else { "├── " };

            // Build the label: character + optional word marker
            let marker = if child.is_word {
                format!(" [*] (freq: {})", child.frequency)
            } else {
                String::new()
            };

            writeln!(f, "{prefix}{connector}{ch}{marker}")?;

            // The prefix for children: │ continues the vertical line,
            // spaces fill under └──
            let extension = if is_last { "    " } else { "│   " };
            let child_prefix = format!("{prefix}{extension}");
            Self::fmt_node(child, f, &child_prefix)?;
        }

        Ok(())
    }
}
```

Let's walk through the key ideas.

**`impl fmt::Display for Trie`**

`Display` is Rust's trait for human-readable formatting — it's what `println!("{trie}")` calls. Like Python's `__str__` or JavaScript's `toString()`.

**`writeln!(f, ".")?;`**

Print the root as a dot (`.`), like the `tree` command in Unix.

**The connector logic:**

```
├── c     ← not the last child: use ├── and continue │ below
│   └── a ← last child: use └── and use spaces below
└── z     ← last child of root
```

`├──` means "there are more siblings below me" (the vertical bar continues).
`└──` means "I'm the last sibling" (no vertical bar below).

**`let extension = if is_last { "    " } else { "│   " };`**

When we recurse into a child's children, we need to extend the prefix. If this child is the last sibling, there's no vertical bar to continue — use spaces. Otherwise, draw a `│` to connect to the next sibling.

**`.saturating_sub(1)`**

`children.len() - 1` would panic if `children` is empty (underflow on `usize`). `.saturating_sub(1)` returns 0 instead. Defensive programming.

### Using it

Update `src/main.rs` to build and display a trie:

```rust
use lexicon::trie::Trie;

fn main() {
    let mut trie = Trie::new();

    // Spanish words sharing the "cas" prefix
    trie.insert("casa", 10);   // house
    trie.insert("caso", 8);    // case
    trie.insert("casi", 6);    // almost

    // Spanish words sharing the "gat" prefix
    trie.insert("gato", 5);    // cat (male)
    trie.insert("gata", 4);    // cat (female)
    trie.insert("gatito", 3);  // kitten

    // A Portuguese word with special characters
    trie.insert("coração", 7); // heart

    println!("{trie}");
}
```

Run it:

```bash
cargo run
```

```
.
├── c
│   ├── a
│   │   └── s
│   │       ├── a [*] (freq: 10)
│   │       ├── i [*] (freq: 6)
│   │       └── o [*] (freq: 8)
│   └── o
│       └── r
│           └── a
│               └── ç
│                   └── ã
│                       └── o [*] (freq: 7)
└── g
    └── a
        └── t
            ├── a [*] (freq: 4)
            ├── i
            │   └── t
            │       └── o [*] (freq: 3)
            └── o [*] (freq: 5)
```

Now you can *see* the trie. The "cas" prefix is shared by casa/casi/caso. The "gat" prefix is shared by gato/gata/gatito. The Portuguese "coração" shows `ç` and `ã` as regular nodes — Unicode just works.

### Tests

```rust
#[test]
fn test_display_single_word() {
    let mut trie = Trie::new();
    trie.insert("hi", 1);

    let output = format!("{trie}");
    assert!(output.contains("h"));
    assert!(output.contains("i [*]"));
}

#[test]
fn test_display_shared_prefix() {
    let mut trie = Trie::new();
    trie.insert("casa", 1);
    trie.insert("caso", 1);
    trie.insert("casi", 1);

    let output = format!("{trie}");

    // 's' should have three children shown with tree connectors
    assert!(output.contains("├── a [*]"));
    assert!(output.contains("└── o [*]"));
    // 'c', 'a', 's' should appear as a chain
    assert!(output.contains("c"));
    assert!(output.contains("s"));
}

#[test]
fn test_display_empty_trie() {
    let trie = Trie::new();
    let output = format!("{trie}");
    // Just the root dot and a newline
    assert_eq!(output.trim(), ".");
}
```

```bash
cargo test
```

```
running 22 tests
...
test result: ok. 22 passed; 0 failed
```

### Checkpoint

The trie can now print itself as a readable ASCII tree. This is invaluable for debugging — when a word isn't found or a prefix search returns unexpected results, print the trie and trace the path visually.

---

## Full Checkpoint — End of Act 1

Here is the complete `src/trie.rs` with all seven stages integrated:

```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fmt;
use std::fs;
use std::io;
use std::path::Path;
use std::time::Instant;

// ---------------------------------------------------------------------------
// TrieNode
// ---------------------------------------------------------------------------

/// A single node in the trie.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrieNode {
    pub children: HashMap<char, TrieNode>,
    pub is_word: bool,
    pub frequency: u32,
}

impl TrieNode {
    pub fn new() -> Self {
        TrieNode {
            children: HashMap::new(),
            is_word: false,
            frequency: 0,
        }
    }
}

// ---------------------------------------------------------------------------
// Trie
// ---------------------------------------------------------------------------

/// A trie (prefix tree) for dictionary storage.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Trie {
    pub root: TrieNode,
}

impl Trie {
    /// Create a new empty trie.
    pub fn new() -> Self {
        Trie {
            root: TrieNode::new(),
        }
    }

    /// Insert a word with a given frequency.
    pub fn insert(&mut self, word: &str, frequency: u32) {
        let mut current = &mut self.root;
        for ch in word.chars() {
            current = current.children.entry(ch).or_insert_with(TrieNode::new);
        }
        current.is_word = true;
        current.frequency = frequency;
    }

    /// Check if a word exists in the trie.
    pub fn contains(&self, word: &str) -> bool {
        let mut current = &self.root;
        for ch in word.chars() {
            match current.children.get(&ch) {
                Some(node) => current = node,
                None => return false,
            }
        }
        current.is_word
    }

    /// Find all words starting with the given prefix.
    pub fn prefix_search(&self, prefix: &str) -> Vec<(String, u32)> {
        let mut current = &self.root;
        for ch in prefix.chars() {
            match current.children.get(&ch) {
                Some(node) => current = node,
                None => return Vec::new(),
            }
        }
        let mut results = Vec::new();
        let mut path = prefix.to_string();
        Self::collect_words(current, &mut path, &mut results);
        results
    }

    fn collect_words(
        node: &TrieNode,
        path: &mut String,
        results: &mut Vec<(String, u32)>,
    ) {
        if node.is_word {
            results.push((path.clone(), node.frequency));
        }
        let mut children: Vec<(&char, &TrieNode)> = node.children.iter().collect();
        children.sort_by_key(|&(ch, _)| *ch);
        for (&ch, child) in children {
            path.push(ch);
            Self::collect_words(child, path, results);
            path.pop();
        }
    }

    /// Save the trie to a binary file.
    pub fn save(&self, path: &Path) -> io::Result<()> {
        let bytes = bincode::serde::encode_to_vec(self, bincode::config::standard())
            .map_err(|e| io::Error::new(io::ErrorKind::Other, e.to_string()))?;
        fs::write(path, bytes)
    }

    /// Load a trie from a binary file.
    pub fn load(path: &Path) -> io::Result<Self> {
        let bytes = fs::read(path)?;
        let (trie, _) =
            bincode::serde::decode_from_slice(&bytes, bincode::config::standard())
                .map_err(|e| io::Error::new(io::ErrorKind::Other, e.to_string()))?;
        Ok(trie)
    }

    /// Build a trie from an iterator of (word, frequency) pairs.
    pub fn from_words(words: impl Iterator<Item = (String, u32)>) -> (Self, std::time::Duration) {
        let start = Instant::now();
        let mut trie = Trie::new();
        for (word, freq) in words {
            trie.insert(&word, freq);
        }
        (trie, start.elapsed())
    }

    // -- Display helpers (not serialized) --

    fn fmt_node(node: &TrieNode, f: &mut fmt::Formatter<'_>, prefix: &str) -> fmt::Result {
        let mut children: Vec<(&char, &TrieNode)> = node.children.iter().collect();
        children.sort_by_key(|&(ch, _)| *ch);
        let last_idx = children.len().saturating_sub(1);

        for (i, (&ch, child)) in children.iter().enumerate() {
            let is_last = i == last_idx;
            let connector = if is_last { "└── " } else { "├── " };
            let marker = if child.is_word {
                format!(" [*] (freq: {})", child.frequency)
            } else {
                String::new()
            };
            writeln!(f, "{prefix}{connector}{ch}{marker}")?;

            let extension = if is_last { "    " } else { "│   " };
            let child_prefix = format!("{prefix}{extension}");
            Self::fmt_node(child, f, &child_prefix)?;
        }
        Ok(())
    }
}

impl fmt::Display for Trie {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        writeln!(f, ".")?;
        Self::fmt_node(&self.root, f, "")
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // Stage 2 tests
    #[test]
    fn test_new_node_is_empty() {
        let node = TrieNode::new();
        assert!(node.children.is_empty());
        assert!(!node.is_word);
        assert_eq!(node.frequency, 0);
    }

    #[test]
    fn test_new_trie_has_empty_root() {
        let trie = Trie::new();
        assert!(trie.root.children.is_empty());
        assert!(!trie.root.is_word);
    }

    // Stage 3 tests
    #[test]
    fn test_insert_creates_path() {
        let mut trie = Trie::new();
        trie.insert("gato", 1);
        let g = trie.root.children.get(&'g').expect("missing 'g'");
        let a = g.children.get(&'a').expect("missing 'a'");
        let t = a.children.get(&'t').expect("missing 't'");
        let o = t.children.get(&'o').expect("missing 'o'");
        assert!(o.is_word);
        assert_eq!(o.frequency, 1);
        assert!(o.children.is_empty());
    }

    #[test]
    fn test_insert_shared_prefix() {
        let mut trie = Trie::new();
        trie.insert("gato", 5);
        trie.insert("gata", 3);
        let t = &trie.root.children[&'g'].children[&'a'].children[&'t'];
        assert_eq!(t.children.len(), 2);
        assert!(t.children.contains_key(&'o'));
        assert!(t.children.contains_key(&'a'));
    }

    #[test]
    fn test_insert_unicode_words() {
        let mut trie = Trie::new();
        trie.insert("ñoño", 1);
        trie.insert("coração", 1);
        assert!(trie.root.children.contains_key(&'ñ'));
        let c = &trie.root.children[&'c'];
        let o = &c.children[&'o'];
        let r = &o.children[&'r'];
        let a = &r.children[&'a'];
        assert!(a.children.contains_key(&'ç'));
    }

    #[test]
    fn test_insert_longer_word_extends_path() {
        let mut trie = Trie::new();
        trie.insert("gato", 1);
        trie.insert("gatito", 1);
        let o = &trie.root.children[&'g'].children[&'a']
            .children[&'t'].children[&'o'];
        assert!(o.is_word);
        let i = &trie.root.children[&'g'].children[&'a']
            .children[&'t'].children[&'i'];
        assert!(!i.is_word);
        let final_o = &i.children[&'t'].children[&'o'];
        assert!(final_o.is_word);
    }

    // Stage 4 tests
    #[test]
    fn test_contains_inserted_word() {
        let mut trie = Trie::new();
        trie.insert("hola", 1);
        assert!(trie.contains("hola"));
    }

    #[test]
    fn test_contains_rejects_missing_word() {
        let mut trie = Trie::new();
        trie.insert("hola", 1);
        assert!(!trie.contains("holaa"));
        assert!(!trie.contains("hol"));
        assert!(!trie.contains("adios"));
        assert!(!trie.contains(""));
    }

    #[test]
    fn test_contains_multiple_words() {
        let mut trie = Trie::new();
        trie.insert("casa", 1);
        trie.insert("caso", 1);
        trie.insert("casi", 1);
        assert!(trie.contains("casa"));
        assert!(trie.contains("caso"));
        assert!(trie.contains("casi"));
        assert!(!trie.contains("cas"));
    }

    #[test]
    fn test_contains_unicode() {
        let mut trie = Trie::new();
        trie.insert("información", 1);
        trie.insert("informação", 1);
        assert!(trie.contains("información"));
        assert!(trie.contains("informação"));
        assert!(!trie.contains("informacion"));
    }

    #[test]
    fn test_contains_common_misspellings() {
        let mut trie = Trie::new();
        trie.insert("recibir", 1);
        trie.insert("haber", 1);
        trie.insert("conocer", 1);
        assert!(trie.contains("recibir"));
        assert!(trie.contains("haber"));
        assert!(trie.contains("conocer"));
        assert!(!trie.contains("recivir"));
        assert!(!trie.contains("aver"));
        assert!(!trie.contains("conoser"));
    }

    // Stage 5 tests
    #[test]
    fn test_prefix_search_basic() {
        let mut trie = Trie::new();
        trie.insert("como", 10);
        trie.insert("comer", 8);
        trie.insert("comenzar", 5);
        trie.insert("comprar", 7);
        let results = trie.prefix_search("com");
        let words: Vec<&str> = results.iter().map(|(w, _)| w.as_str()).collect();
        assert_eq!(words.len(), 4);
        assert!(words.contains(&"como"));
        assert!(words.contains(&"comer"));
        assert!(words.contains(&"comenzar"));
        assert!(words.contains(&"comprar"));
    }

    #[test]
    fn test_prefix_search_narrow() {
        let mut trie = Trie::new();
        trie.insert("como", 10);
        trie.insert("comer", 8);
        trie.insert("comenzar", 5);
        trie.insert("comprar", 7);
        let results = trie.prefix_search("comp");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].0, "comprar");
    }

    #[test]
    fn test_prefix_search_no_match() {
        let mut trie = Trie::new();
        trie.insert("hola", 1);
        let results = trie.prefix_search("xyz");
        assert!(results.is_empty());
    }

    #[test]
    fn test_prefix_search_exact_word_is_prefix() {
        let mut trie = Trie::new();
        trie.insert("com", 1);
        trie.insert("como", 10);
        trie.insert("comer", 8);
        let results = trie.prefix_search("com");
        let words: Vec<&str> = results.iter().map(|(w, _)| w.as_str()).collect();
        assert_eq!(words.len(), 3);
        assert!(words.contains(&"com"));
        assert!(words.contains(&"como"));
        assert!(words.contains(&"comer"));
    }

    #[test]
    fn test_prefix_search_empty_prefix_returns_all() {
        let mut trie = Trie::new();
        trie.insert("a", 1);
        trie.insert("b", 1);
        trie.insert("c", 1);
        let results = trie.prefix_search("");
        assert_eq!(results.len(), 3);
    }

    #[test]
    fn test_prefix_search_preserves_frequency() {
        let mut trie = Trie::new();
        trie.insert("como", 100);
        trie.insert("comer", 50);
        let results = trie.prefix_search("com");
        let como = results.iter().find(|(w, _)| w == "como").unwrap();
        let comer = results.iter().find(|(w, _)| w == "comer").unwrap();
        assert_eq!(como.1, 100);
        assert_eq!(comer.1, 50);
    }

    // Stage 6 tests
    #[test]
    fn test_save_and_load_roundtrip() {
        let mut trie = Trie::new();
        trie.insert("gato", 5);
        trie.insert("gata", 3);
        trie.insert("gatito", 1);
        trie.insert("información", 10);
        trie.insert("ñoño", 2);
        let dir = std::env::temp_dir();
        let path = dir.join("lexicon_test_trie.bin");
        trie.save(&path).expect("save failed");
        let loaded = Trie::load(&path).expect("load failed");
        assert!(loaded.contains("gato"));
        assert!(loaded.contains("gata"));
        assert!(loaded.contains("gatito"));
        assert!(loaded.contains("información"));
        assert!(loaded.contains("ñoño"));
        assert!(!loaded.contains("missing"));
        let results = loaded.prefix_search("gat");
        let gato = results.iter().find(|(w, _)| w == "gato").unwrap();
        assert_eq!(gato.1, 5);
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn test_save_load_empty_trie() {
        let trie = Trie::new();
        let dir = std::env::temp_dir();
        let path = dir.join("lexicon_test_empty.bin");
        trie.save(&path).expect("save failed");
        let loaded = Trie::load(&path).expect("load failed");
        assert!(!loaded.contains("anything"));
        assert!(loaded.prefix_search("").is_empty());
        let _ = fs::remove_file(&path);
    }

    // Stage 7 tests
    #[test]
    fn test_display_single_word() {
        let mut trie = Trie::new();
        trie.insert("hi", 1);
        let output = format!("{trie}");
        assert!(output.contains("h"));
        assert!(output.contains("i [*]"));
    }

    #[test]
    fn test_display_shared_prefix() {
        let mut trie = Trie::new();
        trie.insert("casa", 1);
        trie.insert("caso", 1);
        trie.insert("casi", 1);
        let output = format!("{trie}");
        assert!(output.contains("├── a [*]"));
        assert!(output.contains("└── o [*]"));
        assert!(output.contains("c"));
        assert!(output.contains("s"));
    }

    #[test]
    fn test_display_empty_trie() {
        let trie = Trie::new();
        let output = format!("{trie}");
        assert_eq!(output.trim(), ".");
    }
}
```

And `src/main.rs`:

```rust
use lexicon::trie::Trie;

fn main() {
    let mut trie = Trie::new();

    trie.insert("casa", 10);
    trie.insert("caso", 8);
    trie.insert("casi", 6);
    trie.insert("gato", 5);
    trie.insert("gata", 4);
    trie.insert("gatito", 3);
    trie.insert("coração", 7);

    println!("{trie}");

    // Quick demo of all operations
    println!("contains 'gato': {}", trie.contains("gato"));
    println!("contains 'gatos': {}", trie.contains("gatos"));

    let matches = trie.prefix_search("cas");
    println!("\nWords starting with 'cas':");
    for (word, freq) in &matches {
        println!("  {word} (frequency: {freq})");
    }
}
```

### What you've built

In seven stages you implemented a trie from scratch that:

1. **Stores words** as character paths in a tree (`insert`)
2. **Looks up words** in O(m) time (`contains`)
3. **Finds all words sharing a prefix** (`prefix_search`)
4. **Serializes to disk** for fast reloads (`save` / `load`)
5. **Prints itself** as a readable ASCII tree (`Display`)

All with proper Unicode support — `ñ`, `ç`, `á`, `ã` are first-class characters, not special cases.

### What's next

**Act 2 — The Filter** builds a bloom filter from scratch. The bloom filter sits in front of the trie as a fast pre-check: if a word is "definitely not in the dictionary," we skip the trie lookup entirely. You'll implement FNV-1a and murmur3 hash functions by hand, learn the math behind optimal filter sizing, and measure the false positive rate experimentally.

**Act 3 — The Suggester** implements Levenshtein distance and a BK-tree for fuzzy matching. When the trie says "this word isn't in the dictionary," the BK-tree finds the closest real words — turning Lexicon from a yes/no checker into a spell checker that suggests corrections.
