# Act 4 — The Pipeline

> *Your spell checker has a brain. Now give it a body — a CLI that reads files, checks words, and talks back.*

In Acts 1-3, you built the engine: a trie for dictionary lookup, a bloom filter for fast rejection, a BK-tree for fuzzy suggestions, and Levenshtein distance to measure how far apart two words are. All the hard algorithmic work is done. But right now, Lexicon is a collection of data structures with unit tests. You can't point it at a file and say "check this."

That changes now. Act 4 is about plumbing — connecting your engine to the real world. You'll build a tokenizer that splits messy human text into checkable words, wire up the full check pipeline (bloom → trie → BK-tree), add a proper CLI with clap, and build an interactive mode where you can navigate misspelled words and accept corrections in real time.

This is the act where Lexicon becomes a *tool*. The kind of thing you'd actually run on your code comments or README files.

**What you have from Acts 1-3:**
- A `Trie` with insert, contains, prefix search, and word frequencies
- A `BloomFilter` for fast "definitely not a word" rejection
- A `BKTree` for sub-linear fuzzy search within edit distance ≤ n
- `levenshtein()` and `levenshtein_bounded()` for exact and threshold distance
- Dictionary loading from `.dict` files with frequency data
- FNV-1a and murmur3 hash functions

**What you'll build in Act 4:**
- A Unicode-aware tokenizer (handling punctuation, contractions, accents)
- The full check pipeline orchestrated in `checker.rs`
- A CLI with clap's derive API (subcommands, flags, output formats)
- File checking with line:column error positions
- Custom dictionaries (~/.lexicon/custom.dict and per-project .lexicon)
- An interactive TUI mode with crossterm
- Performance benchmarks against spec targets

**Project location:** `~/juk/lexicon/lexicon/`

> [!important] Pedagogical Shift
> Starting with Act 4, the training wheels come off. Instead of complete implementations, you'll find scaffolded code with `todo!()` placeholders. The surrounding code, types, and tests are provided — your job is to fill in the logic. This mirrors real-world development: you'll read existing code, understand the contract, and implement the missing pieces. If you get stuck, the hints after each `todo!()` will guide you.

---

## Stage 21 — The Tokenizer

Raw text is messy — punctuation clings to words, accents decompose into invisible combining characters, and "don't" is one word or two depending on who you ask. The tokenizer is the front door of the entire check pipeline: every word that enters Lexicon passes through it. Getting tokenization wrong means every downstream component — bloom filter, trie, BK-tree — operates on garbage. This stage teaches you Unicode normalization (NFC), grapheme clusters, and the UAX#29 word boundary algorithm that handles the edge cases you'd never think of.

*Difficulty: Medium*

### The Problem

You have a string: `"¡Hola, cómo estás?"`. You need to extract the words: `["hola", "cómo", "estás"]`. Sounds simple — split on whitespace, strip punctuation. But human text is messy, especially in multiple languages.

Consider what a naive `.split_whitespace()` gives you:

```rust
let text = "¡Hola, cómo estás?";
let tokens: Vec<&str> = text.split_whitespace().collect();
// ["¡Hola,", "cómo", "estás?"]
```

Problems everywhere:
- `"¡Hola,"` — leading inverted exclamation mark AND trailing comma stuck to the word
- `"estás?"` — trailing question mark stuck to the word
- We haven't lowercased anything
- We haven't normalized Unicode (the `ó` in "cómo" might be one codepoint or two)

And that's just Spanish. English has its own traps:

```
"don't"     → should be ONE token "don't", not ["don", "t"]
"it's"      → one token "it's"
"e.g."      → one token? or three?
"U.S.A."    → one token
"3.14"      → one token (number, not two words)
"well-known" → one token or two? (we'll say two: "well", "known")
```

### Unicode Normalization: Why "café" ≠ "café"

Before we even split words, we need to normalize the text. Here's a trap that will bite you if you don't handle it:

The word "café" can be represented two ways in Unicode:

1. **Precomposed (NFC):** `c` `a` `f` `é` — four codepoints, where `é` is U+00E9 (LATIN SMALL LETTER E WITH ACUTE)
2. **Decomposed (NFD):** `c` `a` `f` `e` `◌́` — five codepoints, where `e` is plain U+0065 and `◌́` is U+0301 (COMBINING ACUTE ACCENT)

They look identical on screen. But `"café" == "café"` is **false** if one is NFC and the other is NFD — they're different byte sequences.

```rust
let nfc = "caf\u{00E9}";        // é as one codepoint
let nfd = "caf\u{0065}\u{0301}"; // e + combining accent

println!("{} == {} → {}", nfc, nfd, nfc == nfd);
// café == café → false   (!!!)
```

The fix: normalize everything to NFC (Canonical Decomposition, followed by Canonical Composition) before doing any comparison. Rust's standard library doesn't include Unicode normalization, but the `unicode-normalization` crate does:

```toml
# Cargo.toml
[dependencies]
unicode-normalization = "0.1"
unicode-segmentation = "1.13"
```

```rust
use unicode_normalization::UnicodeNormalization;

let nfd = "caf\u{0065}\u{0301}";
let normalized: String = nfd.nfc().collect();
assert_eq!(normalized, "caf\u{00E9}"); // now they match
```

> **Python comparison:** Python 3 has `unicodedata.normalize('NFC', text)`. Same concept, same four normalization forms (NFC, NFD, NFKC, NFKD). In Rust, you pull in a crate because the standard library is intentionally minimal.

### Grapheme Clusters: What Is a "Character"?

Quick detour into something that will save you from subtle bugs. When humans say "character," they mean a grapheme cluster — the smallest unit that looks like a single character on screen. But Rust's `char` is a Unicode scalar value, and one visible character can be multiple `char`s.

The `unicode-segmentation` crate (v1.13) provides the `UnicodeSegmentation` trait with methods for splitting strings on grapheme cluster, word, and sentence boundaries per UAX#29:

```rust
use unicode_segmentation::UnicodeSegmentation;

// Grapheme clusters — what humans see as "characters"
let s = "a̐éö̲\r\n";
let graphemes: Vec<&str> = s.graphemes(true).collect();
// ["a̐", "é", "ö̲", "\r\n"]  — 4 graphemes, but many more char values

// Flag emoji are TWO codepoints but ONE grapheme
let flags = "🇧🇷🇪🇸";
let g: Vec<&str> = flags.graphemes(true).collect();
// ["🇧🇷", "🇪🇸"]  — 2 graphemes (Brazil, Spain flags)
```

The `graphemes(true)` call uses extended grapheme cluster boundaries (the `true` parameter). Always use `true` — legacy grapheme clusters are outdated.

For our tokenizer, we care more about *word* boundaries than grapheme boundaries. The `unicode-segmentation` crate has exactly what we need:

```rust
use unicode_segmentation::UnicodeSegmentation;

// unicode_words() — splits on UAX#29 word boundaries, keeps only
// substrings containing alphabetic or numeric characters
let text = "The quick (\"brown\") fox can't jump 32.3 feet, right?";
let words: Vec<&str> = text.unicode_words().collect();
// ["The", "quick", "brown", "fox", "can't", "jump", "32.3", "feet", "right"]
```

Notice: `unicode_words()` handles contractions (`can't` stays together), strips punctuation, and even keeps decimal numbers (`32.3`) as single tokens. This is *much* better than anything we could hand-roll with regex.

For our spell checker, we also need byte offsets so we can report *where* in the file a misspelled word appears:

```rust
// unicode_word_indices() — same as unicode_words() but with byte offsets
let text = "¡Hola, cómo estás?";
let word_indices: Vec<(usize, &str)> = text.unicode_word_indices().collect();
// [(2, "Hola"), (8, "cómo"), (14, "estás")]
```

The `¡` at byte 0 (2 bytes in UTF-8) is stripped. The comma after "Hola" is stripped. We get clean words with their positions. This is exactly what we need.

### Building the Tokenizer

Create `src/tokenizer.rs`. The tokenizer's job: take raw text, produce a stream of normalized tokens with their positions.

```rust
// src/tokenizer.rs

use unicode_normalization::UnicodeNormalization;
use unicode_segmentation::UnicodeSegmentation;

/// A token extracted from source text, with its position.
#[derive(Debug, Clone, PartialEq)]
pub struct Token {
    /// The normalized (lowercased, NFC) word.
    pub word: String,
    /// The original word as it appeared in the text.
    pub original: String,
    /// Byte offset in the source text where this token starts.
    pub byte_offset: usize,
}

/// Tokenize a line of text into normalized words with positions.
///
/// Processing pipeline for each token:
/// 1. Split on UAX#29 word boundaries (via unicode-segmentation)
/// 2. Normalize to NFC (via unicode-normalization)
/// 3. Lowercase (via str::to_lowercase — Unicode-aware)
///
/// Returns tokens in order of appearance.
pub fn tokenize(text: &str) -> Vec<Token> {
    text.unicode_word_indices()
        .map(|(byte_offset, word)| {
            let normalized: String = word.nfc().collect::<String>().to_lowercase();
            Token {
                word: normalized,
                original: word.to_string(),
                byte_offset,
            }
        })
        .collect()
}
```

That's the core. Let's trace through our test case:

```
Input: "¡Hola, cómo estás?"

unicode_word_indices() yields:
  (2, "Hola")    — skipped ¡ and started at byte 2
  (8, "cómo")    — skipped comma and space
  (14, "estás")  — skipped space

After NFC + lowercase:
  Token { word: "hola",  original: "Hola",  byte_offset: 2  }
  Token { word: "cómo",  original: "cómo",  byte_offset: 8  }
  Token { word: "estás", original: "estás", byte_offset: 14 }
```

### Handling Edge Cases

The `unicode_words()` function handles most cases well, but there are a few things to think about:

**Contractions:** `"don't"` stays as one token. Good — "don't" is in the dictionary.

**Hyphenated words:** `"well-known"` becomes `["well", "known"]` — `unicode_words()` splits on hyphens. This is fine for spell checking; both halves should be valid words.

**Numbers:** `"32.3"` is kept as one token. We should skip pure numbers during spell checking — they're not words:

```rust
/// Returns true if the token should be checked against the dictionary.
/// Skips pure numbers and single characters.
fn is_checkable(token: &Token) -> bool {
    // Skip single characters — articles like "a" and "I" are valid,
    // but single-char typos aren't useful to flag
    if token.word.chars().count() <= 1 {
        return false;
    }
    // Skip tokens that are purely numeric
    !token.word.chars().all(|c| c.is_numeric() || c == '.')
}
```

**Possessives:** English `"cat's"` stays as one token (`"cat's"`). This is a problem — "cat's" isn't in the dictionary, but "cat" is. We'll handle this in the checker by stripping `'s` as a fallback:

```rust
/// Strip common suffixes that aren't part of the base word.
/// Called when a word isn't found in the dictionary.
fn strip_possessive(word: &str) -> Option<&str> {
    word.strip_suffix("'s")
        .or_else(|| word.strip_suffix("\u{2019}s")) // curly apostrophe
}
```

> **Why two apostrophes?** The straight apostrophe `'` (U+0027) and the curly right single quotation mark `'` (U+2019) both appear in real text. Word processors and web pages typically use the curly version. Your tokenizer needs to handle both.

### Your Turn: Add Tokenize-Line with Column Tracking

The tokenizer above gives byte offsets within a single string. But for file checking (Stage 24), we need line and column numbers. Implement this function:

> [!note] From this stage forward, you implement the core logic. The scaffolding and tests are provided.

```rust
/// A positioned token with line and column information.
#[derive(Debug, Clone, PartialEq)]
pub struct PositionedToken {
    pub token: Token,
    pub line: usize,   // 1-based line number
    pub column: usize, // 1-based column (in characters, not bytes)
}

/// Tokenize an entire document, tracking line and column positions.
///
/// Hint: iterate over lines with `.lines().enumerate()`, tokenize each line,
/// then convert byte offsets to character columns.
pub fn tokenize_document(text: &str) -> Vec<PositionedToken> {
    // YOUR IMPLEMENTATION HERE
    //
    // Steps:
    // 1. Split text into lines (text.lines())
    // 2. For each line, call tokenize()
    // 3. Convert byte_offset to a character column:
    //    column = line[..byte_offset].chars().count() + 1
    // 4. Build PositionedToken with 1-based line number
    todo!() // 👈 Your first todo!()
}
```

**Hint:** The byte offset from `unicode_word_indices()` is relative to the start of the line (since we tokenize each line separately). To convert to a character column, count the characters before that byte offset: `line[..byte_offset].chars().count() + 1`.

### Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn basic_tokenization() {
        let tokens = tokenize("Hello world");
        assert_eq!(tokens.len(), 2);
        assert_eq!(tokens[0].word, "hello");
        assert_eq!(tokens[1].word, "world");
    }

    #[test]
    fn spanish_punctuation() {
        let tokens = tokenize("¡Hola, cómo estás?");
        assert_eq!(tokens.len(), 3);
        assert_eq!(tokens[0].word, "hola");
        assert_eq!(tokens[0].original, "Hola");
        assert_eq!(tokens[1].word, "cómo");
        assert_eq!(tokens[2].word, "estás");
    }

    #[test]
    fn unicode_normalization() {
        // Decomposed é (e + combining accent) should normalize to precomposed é
        let tokens = tokenize("caf\u{0065}\u{0301}");
        assert_eq!(tokens[0].word, "caf\u{00E9}"); // NFC form
    }

    #[test]
    fn contractions_stay_together() {
        let tokens = tokenize("don't it's can't");
        let words: Vec<&str> = tokens.iter().map(|t| t.word.as_str()).collect();
        assert_eq!(words, vec!["don't", "it's", "can't"]);
    }

    #[test]
    fn hyphens_split() {
        let tokens = tokenize("well-known self-aware");
        let words: Vec<&str> = tokens.iter().map(|t| t.word.as_str()).collect();
        assert_eq!(words, vec!["well", "known", "self", "aware"]);
    }

    #[test]
    fn numbers_preserved() {
        let tokens = tokenize("version 3.14 has 42 features");
        let words: Vec<&str> = tokens.iter().map(|t| t.word.as_str()).collect();
        assert_eq!(words, vec!["version", "3.14", "has", "42", "features"]);
    }

    #[test]
    fn byte_offsets_correct() {
        let text = "¡Hola, cómo estás?";
        let tokens = tokenize(text);
        // Verify each token's original can be found at its byte offset
        for token in &tokens {
            let slice = &text[token.byte_offset..];
            assert!(slice.starts_with(&token.original));
        }
    }

    #[test]
    fn empty_and_whitespace() {
        assert_eq!(tokenize("").len(), 0);
        assert_eq!(tokenize("   \t\n  ").len(), 0);
        assert_eq!(tokenize("...!!!???").len(), 0);
    }

    #[test]
    fn portuguese_text() {
        let tokens = tokenize("O gato dorme naração");
        let words: Vec<&str> = tokens.iter().map(|t| t.word.as_str()).collect();
        assert_eq!(words, vec!["o", "gato", "dorme", "na", "ração"]);
    }
}
```

> [!warning] Common Mistakes
> **Using `.split_whitespace()` instead of `unicode_words()`.** Whitespace splitting leaves punctuation attached to words. You'd need to hand-roll punctuation stripping, and you'd get it wrong for edge cases like `¡` and `¿` (Spanish inverted punctuation), `«»` (French/Portuguese quotation marks), and `—` (em dash).
>
> **Forgetting NFC normalization.** Your dictionary is in NFC. If the input text has decomposed characters (common when text is pasted from certain editors or web pages), lookups will fail silently — the word looks correct on screen but doesn't match the dictionary.
>
> **Using `char::to_lowercase()` instead of `str::to_lowercase()`.** The `char` method returns an iterator (because some characters lowercase to multiple characters — German `ß` uppercases to `SS`, and `SS` lowercases to `ss`). The `str` method handles this correctly and returns a `String`.
>
> **Confusing byte offsets with character offsets.** In UTF-8, `"é"` is 2 bytes but 1 character. `"¡"` is 2 bytes. If you use byte offsets as column numbers, your error positions will be wrong for any non-ASCII text. Always convert to character counts for display.
>
> With clean, normalized tokens flowing out of the tokenizer, we're ready to wire them into the check pipeline. Stage 22 orchestrates the bloom filter, trie, and BK-tree behind a single `Checker` facade.

### What Changed

You now have a tokenizer that handles real-world multilingual text. It normalizes Unicode, strips punctuation, preserves contractions, and tracks positions. This is the front door of the check pipeline — every word that enters Lexicon comes through here.

---

## Stage 22 — The Check Pipeline

You've built three data structures that each do one thing well. Separately, they're components; together, they're a spell checker. This stage applies the facade pattern — wrapping the bloom filter, trie, and BK-tree behind a single `Checker` struct with a clean API. The orchestration logic (bloom rejects → trie confirms → BK-tree suggests) is where the architectural decisions from Acts 1-3 finally pay off as a coherent system.

*Difficulty: Hard*

### The Architecture

You've built three data structures that each do one thing well:

```
                    "recieve"
                        |
                        v
              +-------------------+
              |   Bloom Filter    |  "Definitely not a word?" ──yes──> MISSPELLED
              +-------------------+                                    (skip trie)
                        |
                       maybe
                        |
                        v
              +-------------------+
              |      Trie         |  "Is it actually a word?" ──yes──> CORRECT
              +-------------------+
                        |
                        no
                        |
                        v
              +-------------------+
              |     BK-Tree       |  "What words are close?"
              +-------------------+
                        |
                        v
              suggestions: ["receive", "relieve", "retrieve"]
              ranked by: edit distance, then frequency
```

The bloom filter is the bouncer — it rejects obvious non-words without touching the trie. The trie is the authority — it gives the definitive yes/no. The BK-tree is the helper — it finds suggestions for words the trie rejected.

Now we need a `Checker` struct that orchestrates all three. This is the **facade pattern** — a single interface that hides the complexity of multiple subsystems.

> **Python comparison:** This is like creating a class that wraps several internal objects and exposes a clean API. In Python you'd write `class SpellChecker:` with `self.trie`, `self.bloom`, `self.bktree` attributes. Rust is the same idea, just with `struct` + `impl`.

### The Checker Struct

Create `src/checker.rs`:

```rust
// src/checker.rs

use crate::bktree::BKTree;
use crate::bloom::BloomFilter;
use crate::tokenizer::{Token, tokenize};
use crate::trie::Trie;

/// Result of checking a single word.
#[derive(Debug, Clone)]
pub enum CheckResult {
    /// Word is in the dictionary.
    Correct,
    /// Word is not in the dictionary. Suggestions ranked by relevance.
    Misspelled {
        suggestions: Vec<Suggestion>,
    },
}

/// A suggested correction for a misspelled word.
#[derive(Debug, Clone)]
pub struct Suggestion {
    pub word: String,
    pub distance: usize,
    pub frequency: u32,
}

/// The spell-check engine. Orchestrates bloom filter, trie, and BK-tree.
pub struct Checker {
    trie: Trie,
    bloom: BloomFilter,
    bktree: BKTree,
    max_distance: usize,
}

impl Checker {
    /// Build a Checker from a word list.
    ///
    /// This is expensive (builds three data structures), so do it once
    /// and reuse the Checker for all queries.
    pub fn from_words(words: &[(String, u32)], max_distance: usize) -> Self {
        let mut trie = Trie::new();
        let mut bktree = BKTree::new();

        // Size bloom filter for 1% false positive rate
        let num_words = words.len();
        let bloom = BloomFilter::with_rate(num_words, 0.01);

        // Mutable reference needed for insertion — can't use the immutable
        // bloom created above. We need to build it:
        let mut bloom = BloomFilter::with_rate(num_words, 0.01);

        for (word, freq) in words {
            trie.insert(word, *freq);
            bloom.insert(word.as_bytes());
            bktree.insert(word.clone(), *freq);
        }

        Checker { trie, bloom, bktree, max_distance }
    }

    /// Check a single word against the dictionary.
    pub fn check_word(&self, word: &str) -> CheckResult {
        // Step 1: Bloom filter — fast rejection
        if !self.bloom.contains(word.as_bytes()) {
            // Bloom says "definitely not in dictionary."
            // Skip the trie, go straight to suggestions.
            return self.suggest(word);
        }

        // Step 2: Trie — authoritative lookup
        // (Bloom said "maybe" — could be a false positive)
        if self.trie.contains(word) {
            return CheckResult::Correct;
        }

        // Step 3: Bloom false positive — word passed bloom but isn't in trie.
        // Get suggestions from BK-tree.
        self.suggest(word)
    }

    /// Get ranked suggestions for a misspelled word.
    fn suggest(&self, word: &str) -> CheckResult {
        let mut suggestions = self.bktree.search(word, self.max_distance);

        // Sort by distance first, then by frequency (descending) for ties
        suggestions.sort_by(|a, b| {
            a.distance.cmp(&b.distance)
                .then(b.frequency.cmp(&a.frequency))
        });

        CheckResult::Misspelled {
            suggestions: suggestions.into_iter().map(|s| Suggestion {
                word: s.word,
                distance: s.distance,
                frequency: s.frequency,
            }).collect(),
        }
    }
}
```

### Your Turn: Add the Custom Dictionary Fallback

Before declaring a word misspelled, the checker should try a few fallbacks. Implement this enhanced check flow:

```rust
/// Enhanced word check with fallbacks.
///
/// Check order:
/// 1. Bloom filter → trie (standard path)
/// 2. If not found, try stripping possessive ('s)
/// 3. If not found, check custom dictionary
/// 4. If still not found, get suggestions from BK-tree
///
/// Hint: you'll need to add a `custom_words: HashSet<String>` field
/// to the Checker struct.
pub fn check_word_with_fallbacks(&self, word: &str) -> CheckResult {
    // YOUR IMPLEMENTATION HERE
    todo!()
}
```

### The Check Report

When checking a file, we need to collect all errors into a report:

```rust
/// A single spelling error found in a document.
#[derive(Debug, Clone)]
pub struct SpellingError {
    /// The misspelled word as it appeared in the text.
    pub original: String,
    /// The normalized (lowercased) form that was checked.
    pub normalized: String,
    /// Line number (1-based).
    pub line: usize,
    /// Column number (1-based, in characters).
    pub column: usize,
    /// Suggested corrections.
    pub suggestions: Vec<Suggestion>,
}

/// Check an entire document, returning all spelling errors.
pub fn check_document(&self, text: &str) -> Vec<SpellingError> {
    let positioned_tokens = crate::tokenizer::tokenize_document(text);

    positioned_tokens
        .into_iter()
        .filter(|pt| is_checkable(&pt.token))
        .filter_map(|pt| {
            match self.check_word(&pt.token.word) {
                CheckResult::Correct => None,
                CheckResult::Misspelled { suggestions } => Some(SpellingError {
                    original: pt.token.original,
                    normalized: pt.token.word,
                    line: pt.line,
                    column: pt.column,
                    suggestions,
                }),
            }
        })
        .collect()
}
```

### Bloom Filter Statistics

One useful thing to track: how often the bloom filter saves us a trie lookup. Add a simple counter:

```rust
use std::sync::atomic::{AtomicUsize, Ordering};

/// Statistics for a check session.
#[derive(Debug, Default)]
pub struct CheckStats {
    pub words_checked: AtomicUsize,
    pub bloom_rejections: AtomicUsize,  // bloom said "no" — skipped trie
    pub bloom_false_positives: AtomicUsize, // bloom said "maybe" but trie said "no"
    pub trie_hits: AtomicUsize,  // bloom said "maybe" AND trie said "yes"
}
```

> **Why `AtomicUsize`?** We're not doing multithreading yet, but atomic counters are zero-cost on single-threaded code and will be ready when we parallelize later. It's a good habit. If you prefer simplicity, use `Cell<usize>` instead — it's single-threaded but avoids `&mut self`.

### Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn build_test_checker() -> Checker {
        let words = vec![
            ("hello".to_string(), 100),
            ("world".to_string(), 90),
            ("help".to_string(), 80),
            ("held".to_string(), 70),
            ("helm".to_string(), 60),
            ("receive".to_string(), 50),
            ("relieve".to_string(), 40),
            ("retrieve".to_string(), 30),
        ];
        Checker::from_words(&words, 2)
    }

    #[test]
    fn correct_word() {
        let checker = build_test_checker();
        assert!(matches!(checker.check_word("hello"), CheckResult::Correct));
    }

    #[test]
    fn misspelled_with_suggestions() {
        let checker = build_test_checker();
        match checker.check_word("helo") {
            CheckResult::Misspelled { suggestions } => {
                let words: Vec<&str> = suggestions.iter()
                    .map(|s| s.word.as_str()).collect();
                assert!(words.contains(&"hello"));
                assert!(words.contains(&"help"));
                // "hello" should rank first (distance 1, higher frequency)
                assert_eq!(suggestions[0].word, "hello");
            }
            CheckResult::Correct => panic!("'helo' should be misspelled"),
        }
    }

    #[test]
    fn completely_unknown_word() {
        let checker = build_test_checker();
        match checker.check_word("zzzzz") {
            CheckResult::Misspelled { suggestions } => {
                // No words within distance 2 of "zzzzz"
                assert!(suggestions.is_empty());
            }
            CheckResult::Correct => panic!("'zzzzz' should be misspelled"),
        }
    }

    #[test]
    fn suggestions_ranked_by_distance_then_frequency() {
        let checker = build_test_checker();
        match checker.check_word("helo") {
            CheckResult::Misspelled { suggestions } => {
                // Distance-1 words should come before distance-2 words
                for window in suggestions.windows(2) {
                    if window[0].distance == window[1].distance {
                        // Same distance: higher frequency first
                        assert!(window[0].frequency >= window[1].frequency);
                    } else {
                        // Different distance: lower distance first
                        assert!(window[0].distance <= window[1].distance);
                    }
                }
            }
            _ => panic!("expected misspelled"),
        }
    }
}
```

> [!warning] Common Mistakes
> **Building the BK-tree but forgetting to populate it.** The BK-tree needs every dictionary word inserted. If you only populate the trie and bloom filter, suggestions will always be empty.
>
> **Double-counting bloom filter stats.** A bloom "rejection" (definitely not in dictionary) is different from a bloom "false positive" (bloom said maybe, trie said no). Track them separately — the false positive rate should be close to your target (1%).
>
> **Not normalizing before checking.** The checker receives tokens from the tokenizer (already normalized), but if someone calls `check_word()` directly with un-normalized input, it won't match the dictionary. Consider normalizing inside `check_word()` as a safety net.
>
> The engine is assembled. Feed it text, get back errors with positions and suggestions. But a library without a command-line interface is invisible to users. Stage 23 gives Lexicon a proper CLI with clap's derive API.

### What Changed

You now have a `Checker` that orchestrates the full pipeline. Feed it text, get back a list of errors with positions and suggestions. The bloom filter handles the fast path (most words are correct), the trie confirms, and the BK-tree suggests. Three data structures, one clean API.

---

## Stage 23 — CLI with clap

A library is code for other code. A CLI is code for humans. This stage transforms Lexicon from something you `use` in tests into something you *run* from a terminal. clap's derive API lets you define your entire command structure — subcommands, flags, defaults, help text — as Rust types, and the compiler generates the parsing logic. It's the difference between a project and a product.

*Difficulty: Medium*

### From Library to Tool

Right now, Lexicon is a library — you `use` it from test code. To make it a real tool, you need a command-line interface. Rust's dominant CLI framework is **clap** (Command Line Argument Parser), and its derive API lets you define your CLI as Rust structs and enums with attributes. The compiler generates the parsing code.

Add clap to your dependencies:

```toml
# Cargo.toml
[dependencies]
clap = { version = "4.6", features = ["derive"] }
```

The `derive` feature enables `#[derive(Parser)]`, `#[derive(Subcommand)]`, `#[derive(Args)]`, and `#[derive(ValueEnum)]`.

### The CLI Structure

Here's what we're building:

```
lexicon check <file>              Check a file for misspelled words
lexicon suggest <word>            Show suggestions for a single word
lexicon dict add <word>           Add word to custom dictionary
lexicon dict remove <word>        Remove word from custom dictionary
lexicon dict list                 List installed dictionaries

Global flags (work with any subcommand):
  --lang <en|es|pt>               Force language (skip detection)
  --max-distance <n>              Max edit distance for suggestions (default: 2)
  --format <text|json>            Output format (default: text)
```

In clap's derive API, this maps to:
- A top-level `struct` with `#[derive(Parser)]` for global flags
- An `enum` with `#[derive(Subcommand)]` for the commands
- Nested enums for sub-subcommands (`dict add`, `dict remove`)
- An `enum` with `#[derive(ValueEnum)]` for enumerated choices like `--format`

### The Implementation

```rust
// src/main.rs

use clap::{Parser, Subcommand, ValueEnum};
use std::path::PathBuf;

/// Lexicon — a multilingual spell checker built from scratch.
///
/// Check files for misspelled words, get suggestions, and manage
/// custom dictionaries. Supports English, Spanish, and Portuguese.
#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
struct Cli {
    /// Language to use (skips auto-detection)
    #[arg(short, long, global = true)]
    lang: Option<Language>,

    /// Maximum edit distance for suggestions
    #[arg(short, long, global = true, default_value_t = 2)]
    max_distance: usize,

    /// Output format
    #[arg(short, long, global = true, default_value_t = OutputFormat::Text)]
    format: OutputFormat,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand, Debug)]
enum Commands {
    /// Check a file for misspelled words
    Check {
        /// File to check (use - for stdin)
        file: PathBuf,

        /// Don't show suggestions, only report misspelled words
        #[arg(long)]
        no_suggest: bool,
    },

    /// Show suggestions for a single word
    Suggest {
        /// The word to look up
        word: String,
    },

    /// Manage custom dictionaries
    Dict {
        #[command(subcommand)]
        action: DictAction,
    },

    /// Interactive spell-check mode
    Interactive {
        /// File to check interactively
        file: PathBuf,
    },

    /// Run performance benchmarks
    Bench {
        /// File to benchmark against
        file: PathBuf,
    },
}

#[derive(Subcommand, Debug)]
enum DictAction {
    /// Add a word to the custom dictionary
    Add {
        /// Word to add
        word: String,
    },
    /// Remove a word from the custom dictionary
    Remove {
        /// Word to remove
        word: String,
    },
    /// List installed dictionaries
    List,
}

#[derive(ValueEnum, Clone, Debug)]
enum Language {
    En,
    Es,
    Pt,
}

#[derive(ValueEnum, Clone, Debug, Default)]
enum OutputFormat {
    #[default]
    Text,
    Json,
}

// Display impl needed for default_value_t to show in help text
impl std::fmt::Display for OutputFormat {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OutputFormat::Text => write!(f, "text"),
            OutputFormat::Json => write!(f, "json"),
        }
    }
}
```

Let's break down the key clap attributes:

**`#[derive(Parser)]`** — The entry point. Generates `Cli::parse()` which reads `std::env::args()` and returns a populated `Cli` struct or exits with an error message.

**`#[command(version, about)]`** — Pulls version from `Cargo.toml` and about from the doc comment. `long_about = None` prevents the full doc comment from showing on `--help` (only the first line shows).

**`#[arg(short, long, global = true)]`** — `short` generates `-l`, `long` generates `--lang`. `global = true` means this flag works with any subcommand (`lexicon check --lang en file.txt` and `lexicon --lang en check file.txt` both work).

**`#[arg(default_value_t = 2)]`** — Sets a default. The `_t` suffix means "typed" — clap uses `Display` to show it in help text. Without `_t`, you'd use `default_value = "2"` (a string).

**`#[derive(Subcommand)]`** — Each enum variant becomes a subcommand. Struct variants have named fields (which become arguments); tuple variants wrap another `Args` struct.

**`#[derive(ValueEnum)]`** — Turns an enum into a set of allowed values for an argument. Variants are automatically kebab-cased (`Text` → `text`, `Json` → `json`).

### Wiring Up main()

```rust
fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Check { file, no_suggest } => {
            let text = std::fs::read_to_string(&file)?;
            let checker = build_checker(cli.lang.as_ref(), cli.max_distance)?;
            let errors = checker.check_document(&text);

            match cli.format {
                OutputFormat::Text => print_errors_text(&errors, &file),
                OutputFormat::Json => print_errors_json(&errors, &file)?,
            }

            // Exit with code 1 if there were errors (useful for CI)
            if !errors.is_empty() {
                std::process::exit(1);
            }
        }

        Commands::Suggest { word } => {
            let checker = build_checker(cli.lang.as_ref(), cli.max_distance)?;
            let normalized: String = word
                .nfc()
                .collect::<String>()
                .to_lowercase();

            match checker.check_word(&normalized) {
                CheckResult::Correct => {
                    println!("'{}' is spelled correctly.", word);
                }
                CheckResult::Misspelled { suggestions } => {
                    if suggestions.is_empty() {
                        println!("'{}' — no suggestions found.", word);
                    } else {
                        println!("'{}' — did you mean:", word);
                        for s in &suggestions {
                            println!("  {} (distance: {})", s.word, s.distance);
                        }
                    }
                }
            }
        }

        Commands::Dict { action } => {
            handle_dict_action(action)?;
        }

        Commands::Interactive { file } => {
            // Stage 26
            todo!("Interactive mode coming in Stage 26")
        }

        Commands::Bench { file } => {
            // Stage 27
            todo!("Benchmarks coming in Stage 27")
        }
    }

    Ok(())
}
```

### Your Turn: Implement the Output Formatters

The text formatter should match this format:

```
src/main.rs:12:5  "recieve"  -> receive, retrieve, relieve
src/main.rs:24:18 "seperate" -> separate
```

The JSON formatter should produce:

```json
[
  {
    "file": "src/main.rs",
    "line": 12,
    "column": 5,
    "word": "recieve",
    "suggestions": [
      {"word": "receive", "distance": 1},
      {"word": "retrieve", "distance": 2}
    ]
  }
]
```

Implement both:

```rust
use std::path::Path;

fn print_errors_text(errors: &[SpellingError], file: &Path) {
    // YOUR IMPLEMENTATION HERE
    //
    // Format: file:line:column  "word"  -> suggestion1, suggestion2, ...
    // If no suggestions: file:line:column  "word"  (no suggestions)
    //
    // Hint: use the file's display path, not the canonical path
    todo!()
}

fn print_errors_json(errors: &[SpellingError], file: &Path) -> serde_json::Result<()> {
    // YOUR IMPLEMENTATION HERE
    //
    // Hint: define a serializable struct and use serde_json::to_string_pretty
    // Or build it manually with serde_json::json! macro
    todo!()
}
```

### Testing the CLI

clap has a built-in way to test that your CLI definition is valid:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use clap::CommandFactory;

    #[test]
    fn verify_cli() {
        // This catches common mistakes: conflicting short flags,
        // missing required args, invalid default values, etc.
        Cli::command().debug_assert();
    }

    #[test]
    fn parse_check_command() {
        let cli = Cli::try_parse_from([
            "lexicon", "check", "test.txt",
            "--lang", "es", "--max-distance", "3",
        ]).unwrap();

        assert!(matches!(cli.command, Commands::Check { .. }));
        assert!(matches!(cli.lang, Some(Language::Es)));
        assert_eq!(cli.max_distance, 3);
    }

    #[test]
    fn parse_suggest_command() {
        let cli = Cli::try_parse_from([
            "lexicon", "suggest", "recieve",
        ]).unwrap();

        match cli.command {
            Commands::Suggest { word } => assert_eq!(word, "recieve"),
            _ => panic!("expected Suggest command"),
        }
    }

    #[test]
    fn parse_dict_subcommand() {
        let cli = Cli::try_parse_from([
            "lexicon", "dict", "add", "kubernetes",
        ]).unwrap();

        match cli.command {
            Commands::Dict { action: DictAction::Add { word } } => {
                assert_eq!(word, "kubernetes");
            }
            _ => panic!("expected Dict Add"),
        }
    }

    #[test]
    fn default_values() {
        let cli = Cli::try_parse_from([
            "lexicon", "check", "test.txt",
        ]).unwrap();

        assert_eq!(cli.max_distance, 2);
        assert!(matches!(cli.format, OutputFormat::Text));
        assert!(cli.lang.is_none());
    }
}
```

> [!warning] Common Mistakes
> **Forgetting `features = ["derive"]` in Cargo.toml.** Without it, `#[derive(Parser)]` doesn't exist and you get a confusing "cannot find derive macro" error.
>
> **Using `#[arg(default_value_t)]` without implementing `Display`.** clap needs `Display` to show the default in help text. If your type doesn't implement it, use `default_value = "string"` instead.
>
> **Conflicting short flags.** If two global args both use `-f`, clap panics at runtime. The `debug_assert()` test catches this at test time instead.
>
> **Not making flags `global = true`.** Without `global`, `--lang` only works before the subcommand: `lexicon --lang en check file.txt`. With `global`, it works anywhere: `lexicon check --lang en file.txt`. Users expect the latter.
>
> The CLI skeleton is wired up, but `lexicon check test.txt` doesn't actually read files yet. Stage 24 connects the CLI to the filesystem — reading files, formatting output, and returning proper exit codes for CI integration.

### What Changed

Lexicon is now a real CLI tool. `cargo run -- check test.txt` checks a file. `cargo run -- suggest recieve` gets suggestions. The clap derive API gave us argument parsing, help text, version info, and error messages — all generated from struct definitions.

---

## Stage 24 — File Checking

A CLI that parses arguments but can't read files is a facade with nothing behind it. This stage completes the end-to-end flow: read a file from disk, tokenize it, check every word, and report errors with precise line:column positions in both human-readable text and machine-readable JSON. The JSON output makes Lexicon composable — other tools, editors, and CI pipelines can consume its results programmatically.

*Difficulty: Medium*

### Reading Files

Stage 23 wired up the CLI. Now let's make `lexicon check <file>` actually work end-to-end. The flow:

```
file on disk
    |
    v
read to string (or stream line-by-line)
    |
    v
tokenize_document() -- produces PositionedTokens
    |
    v
checker.check_document() -- produces SpellingErrors
    |
    v
format output (text or JSON)
    |
    v
stdout
```

For small files (< 10 MB), reading the entire file into a `String` is fine:

```rust
let text = std::fs::read_to_string(&file)?;
let errors = checker.check_document(&text);
```

For large files, you'd want to stream line-by-line with `BufReader`. But spell checking needs context (what line are we on?), and our tokenizer already handles this. So read-all-at-once is the pragmatic choice for now.

### Handling stdin

The `--stdin` flag (or using `-` as the filename) should read from stdin. This lets users pipe text into Lexicon:

```bash
echo "This has a mispeling" | lexicon check -
cat README.md | lexicon check --stdin
```

```rust
use std::io::Read;

fn read_input(file: &Path) -> anyhow::Result<String> {
    if file.as_os_str() == "-" {
        let mut buf = String::new();
        std::io::stdin().read_to_string(&mut buf)?;
        Ok(buf)
    } else {
        Ok(std::fs::read_to_string(file)?)
    }
}
```

### Text Output with Color

Plain text output is fine for CI, but for interactive use, color helps. Use crossterm's `Stylize` trait to highlight misspelled words in red:

```rust
use crossterm::style::Stylize;

fn print_errors_text(errors: &[SpellingError], file: &Path) {
    for err in errors {
        let location = format!("{}:{}:{}", file.display(), err.line, err.column);
        let word = format!("\"{}\"", err.original).red().bold();

        if err.suggestions.is_empty() {
            println!("{}  {}  (no suggestions)", location, word);
        } else {
            let suggestions: Vec<String> = err.suggestions.iter()
                .take(5) // limit to top 5
                .map(|s| s.word.clone())
                .collect();
            println!("{}  {}  -> {}", location, word, suggestions.join(", "));
        }
    }

    // Summary line
    let count = errors.len();
    if count == 0 {
        println!("{}", "No misspellings found.".green());
    } else {
        println!(
            "\n{} misspelling{} found.",
            count.to_string().red().bold(),
            if count == 1 { "" } else { "s" }
        );
    }
}
```

The `Stylize` trait from crossterm adds methods like `.red()`, `.bold()`, `.green()` directly on strings. These return a `StyledContent` that wraps the string with ANSI escape codes. When printed, the terminal renders the color. When piped to a file, the escape codes are included (you might want to detect whether stdout is a TTY and disable colors if not).

### JSON Output with serde

For machine-readable output, JSON is standard. Add serde:

```toml
[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

```rust
use serde::Serialize;

#[derive(Serialize)]
struct JsonError {
    file: String,
    line: usize,
    column: usize,
    word: String,
    suggestions: Vec<JsonSuggestion>,
}

#[derive(Serialize)]
struct JsonSuggestion {
    word: String,
    distance: usize,
}

fn print_errors_json(errors: &[SpellingError], file: &Path) -> anyhow::Result<()> {
    let json_errors: Vec<JsonError> = errors.iter().map(|err| {
        JsonError {
            file: file.display().to_string(),
            line: err.line,
            column: err.column,
            word: err.original.clone(),
            suggestions: err.suggestions.iter().take(5).map(|s| {
                JsonSuggestion {
                    word: s.word.clone(),
                    distance: s.distance,
                }
            }).collect(),
        }
    }).collect();

    println!("{}", serde_json::to_string_pretty(&json_errors)?);
    Ok(())
}
```

### Your Turn: Exit Codes and Summary Stats

Make `lexicon check` useful in CI pipelines by implementing proper exit codes and a summary:

```rust
/// Run the check command and return an appropriate exit code.
///
/// Exit codes:
///   0 — no misspellings found
///   1 — misspellings found
///   2 — error (file not found, invalid encoding, etc.)
///
/// Also print a summary line:
///   "Checked 1,234 words in 0.45s. 7 misspellings found."
///
/// Hint: use std::time::Instant for timing.
fn run_check(file: &Path, checker: &Checker, format: &OutputFormat,
             no_suggest: bool) -> i32 {
    // YOUR IMPLEMENTATION HERE
    todo!()
}
```

### Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn json_output_is_valid() {
        let errors = vec![SpellingError {
            original: "recieve".to_string(),
            normalized: "recieve".to_string(),
            line: 12,
            column: 5,
            suggestions: vec![
                Suggestion { word: "receive".to_string(), distance: 1, frequency: 50 },
            ],
        }];

        // Capture output by building the JSON string directly
        let json_errors: Vec<JsonError> = errors.iter().map(|err| {
            JsonError {
                file: "test.txt".to_string(),
                line: err.line,
                column: err.column,
                word: err.original.clone(),
                suggestions: err.suggestions.iter().map(|s| {
                    JsonSuggestion { word: s.word.clone(), distance: s.distance }
                }).collect(),
            }
        }).collect();

        let json_str = serde_json::to_string_pretty(&json_errors).unwrap();
        // Verify it's valid JSON by parsing it back
        let parsed: serde_json::Value = serde_json::from_str(&json_str).unwrap();
        assert!(parsed.is_array());
        assert_eq!(parsed[0]["word"], "recieve");
        assert_eq!(parsed[0]["line"], 12);
    }

    #[test]
    fn text_output_format() {
        let errors = vec![SpellingError {
            original: "teh".to_string(),
            normalized: "teh".to_string(),
            line: 1,
            column: 1,
            suggestions: vec![
                Suggestion { word: "the".to_string(), distance: 1, frequency: 69971 },
            ],
        }];

        // Verify the format matches "file:line:col  "word"  -> suggestions"
        let location = format!("test.txt:{}:{}", errors[0].line, errors[0].column);
        assert_eq!(location, "test.txt:1:1");
    }
}
```

> [!warning] Common Mistakes
> **Not handling non-UTF-8 files.** `std::fs::read_to_string()` returns an error for non-UTF-8 content. This is correct — Lexicon only handles text files. But give a clear error message: "Error: file.bin is not valid UTF-8 text."
>
> **Forgetting to flush stdout before `process::exit()`.** If you call `std::process::exit(1)` immediately after printing, the output buffer might not be flushed. Either call `stdout().flush()` first, or return the exit code from `main()` instead of calling `exit()`.
>
> **Hardcoding the file path in JSON output.** Use the path the user provided, not the canonicalized path. If they said `lexicon check ../README.md`, the JSON should say `"file": "../README.md"`, not `"file": "/home/user/project/README.md"`.
>
> File checking works, but every technical document is full of words that are correct in context but absent from standard dictionaries — "kubernetes", "async", "mutex". Without a custom dictionary, Lexicon would drown in false positives. Stage 25 adds the escape valve.

### What Changed

`lexicon check test.txt` now works end-to-end. It reads a file, tokenizes it, checks every word, and reports errors with line:column positions in either text or JSON format. The exit code tells CI whether the file passed.

---

## Stage 25 — Custom Dictionary

No standard dictionary contains every word a user needs. Technical jargon, proper nouns, project-specific terms — they're all "misspellings" to a dictionary that only knows natural language. A custom dictionary is the pressure valve that makes a spell checker livable. This stage introduces layered configuration (global + per-project), file I/O for persistence, and the `HashSet` as a zero-false-positive lookup that sits in front of the probabilistic pipeline.

*Difficulty: Easy*

### Why Custom Dictionaries?

Every spell checker flags words that are correct in context but not in any standard dictionary: "kubernetes", "async", "tokio", "serde", "mutex", "struct". Technical writing is full of them. Without a custom dictionary, you'd drown in false positives.

Lexicon supports two layers of custom words:

1. **Global:** `~/.lexicon/custom.dict` — words that are valid everywhere (your name, company jargon, tools you always use)
2. **Per-project:** `.lexicon` in the current directory — words specific to this project (API names, domain terms)

The per-project file takes precedence, and both are additive — a word in either file is considered correct.

### Finding the Home Directory

Rust's standard library doesn't have a "get home directory" function. The `dirs` crate provides it cross-platform:

```toml
[dependencies]
dirs = "6"
```

```rust
use std::path::PathBuf;

fn lexicon_dir() -> PathBuf {
    dirs::home_dir()
        .expect("could not determine home directory")
        .join(".lexicon")
}

fn global_custom_dict_path() -> PathBuf {
    lexicon_dir().join("custom.dict")
}

fn project_custom_dict_path() -> PathBuf {
    PathBuf::from(".lexicon")
}
```

### Loading Custom Words

```rust
use std::collections::HashSet;
use std::io::{BufRead, BufReader};

/// Load words from a dictionary file. One word per line.
/// Lines starting with # are comments. Empty lines are skipped.
fn load_word_file(path: &Path) -> HashSet<String> {
    let mut words = HashSet::new();

    let file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return words, // file doesn't exist yet — that's fine
    };

    for line in BufReader::new(file).lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        // Normalize the word the same way the tokenizer does
        let normalized: String = trimmed.nfc().collect::<String>().to_lowercase();
        words.insert(normalized);
    }

    words
}

/// Load all custom words (global + project).
pub fn load_custom_words() -> HashSet<String> {
    let mut words = load_word_file(&global_custom_dict_path());
    words.extend(load_word_file(&project_custom_dict_path()));
    words
}
```

### Adding and Removing Words

The `lexicon dict add` and `lexicon dict remove` commands modify the global custom dictionary:

```rust
use std::io::Write;

pub fn add_custom_word(word: &str) -> anyhow::Result<()> {
    let path = global_custom_dict_path();

    // Ensure ~/.lexicon/ exists
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    // Check if word already exists
    let existing = load_word_file(&path);
    let normalized: String = word.nfc().collect::<String>().to_lowercase();

    if existing.contains(&normalized) {
        println!("'{}' is already in the custom dictionary.", word);
        return Ok(());
    }

    // Append to file
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)?;

    writeln!(file, "{}", normalized)?;
    println!("Added '{}' to custom dictionary.", normalized);
    Ok(())
}

pub fn remove_custom_word(word: &str) -> anyhow::Result<()> {
    let path = global_custom_dict_path();
    let normalized: String = word.nfc().collect::<String>().to_lowercase();

    let existing = load_word_file(&path);
    if !existing.contains(&normalized) {
        println!("'{}' is not in the custom dictionary.", word);
        return Ok(());
    }

    // Read all lines, filter out the word, write back
    let content = std::fs::read_to_string(&path)?;
    let filtered: Vec<&str> = content.lines()
        .filter(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with('#') {
                return true; // keep comments and blank lines
            }
            let line_normalized: String = trimmed.nfc().collect::<String>().to_lowercase();
            line_normalized != normalized
        })
        .collect();

    std::fs::write(&path, filtered.join("\n") + "\n")?;
    println!("Removed '{}' from custom dictionary.", normalized);
    Ok(())
}
```

### Integrating with the Checker

Update the `Checker` to accept custom words:

```rust
impl Checker {
    pub fn with_custom_words(mut self, custom: HashSet<String>) -> Self {
        self.custom_words = custom;
        self
    }

    pub fn check_word(&self, word: &str) -> CheckResult {
        // Check custom dictionary first — O(1) HashSet lookup
        if self.custom_words.contains(word) {
            return CheckResult::Correct;
        }

        // Then the standard pipeline: bloom -> trie -> bktree
        if !self.bloom.contains(word.as_bytes()) {
            return self.suggest(word);
        }
        if self.trie.contains(word) {
            return CheckResult::Correct;
        }
        self.suggest(word)
    }
}
```

### Your Turn: The `dict list` Command

Implement the `lexicon dict list` command that shows all installed dictionaries and custom word counts:

```rust
/// Display information about installed dictionaries.
///
/// Output should look like:
///
///   Installed dictionaries:
///     en  English     312,000 words  (cached)
///     es  Spanish     198,000 words  (not cached)
///     pt  Portuguese  245,000 words  (cached)
///
///   Custom dictionary: ~/.lexicon/custom.dict (47 words)
///   Project dictionary: .lexicon (12 words)
///
/// Hint: check if cache files exist in ~/.lexicon/cache/
/// Hint: count lines in custom dict files (excluding comments)
pub fn list_dictionaries() -> anyhow::Result<()> {
    // YOUR IMPLEMENTATION HERE
    todo!()
}
```

### Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn load_custom_words_from_file(tmp_path: &Path) {
        let dict_path = tmp_path.join("custom.dict");
        let mut f = std::fs::File::create(&dict_path).unwrap();
        writeln!(f, "# My custom words").unwrap();
        writeln!(f, "kubernetes").unwrap();
        writeln!(f, "").unwrap();
        writeln!(f, "tokio").unwrap();
        writeln!(f, "# Another comment").unwrap();
        writeln!(f, "serde").unwrap();

        let words = load_word_file(&dict_path);
        assert_eq!(words.len(), 3);
        assert!(words.contains("kubernetes"));
        assert!(words.contains("tokio"));
        assert!(words.contains("serde"));
    }

    #[test]
    fn custom_words_are_normalized() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        writeln!(tmp.as_file(), "Kubernetes").unwrap();  // uppercase
        writeln!(tmp.as_file(), "ASYNC").unwrap();

        let words = load_word_file(tmp.path());
        assert!(words.contains("kubernetes")); // lowercased
        assert!(words.contains("async"));
    }

    #[test]
    fn missing_file_returns_empty_set() {
        let words = load_word_file(Path::new("/nonexistent/path/dict.txt"));
        assert!(words.is_empty());
    }

    #[test]
    fn checker_respects_custom_words() {
        let words = vec![("hello".to_string(), 100)];
        let custom: HashSet<String> = ["kubernetes".to_string()].into();

        let checker = Checker::from_words(&words, 2)
            .with_custom_words(custom);

        assert!(matches!(checker.check_word("kubernetes"), CheckResult::Correct));
        assert!(matches!(checker.check_word("hello"), CheckResult::Correct));
        assert!(matches!(checker.check_word("zzzzz"), CheckResult::Misspelled { .. }));
    }
}
```

> [!warning] Common Mistakes
> **Not creating `~/.lexicon/` before writing.** `OpenOptions::new().create(true).append(true)` creates the *file* but not parent directories. You need `create_dir_all()` first.
>
> **Case-sensitive custom dictionary.** If the user adds "Kubernetes" but the tokenizer lowercases to "kubernetes", the lookup fails. Always normalize custom words on both insert and lookup.
>
> **Reading the custom dictionary on every word check.** Load it once when building the `Checker`, not on every call to `check_word()`. File I/O per word would destroy performance.
>
> Custom dictionaries tame false positives, but the workflow is still batch-oriented: run the checker, read the output, fix the file, run again. Stage 26 collapses that loop into a single interactive session where you navigate errors, accept suggestions, and save corrections — all without leaving the terminal.

### What Changed

Lexicon now has a two-layer custom dictionary system. `lexicon dict add kubernetes` adds a word globally. A `.lexicon` file in the project root adds project-specific terms. The checker consults custom words before the standard pipeline, so custom words are O(1) lookups with zero false positives.

---

## Stage 26 — Interactive Mode

Batch checking is useful for CI; interactive checking is useful for humans. This stage builds a terminal UI where you navigate misspelled words, see suggestions in context, accept corrections with a keypress, and add words to your custom dictionary — all in a single session. It introduces raw mode, the alternate screen, and the event-loop pattern that underpins every terminal application from `vim` to `htop`.

*Difficulty: Hard*

### What We're Building

`lexicon interactive README.md` opens a full-screen terminal UI:

```
+------------------------------------------------------------------+
|  README.md                                    [3/7 misspellings]  |
+------------------------------------------------------------------+
|                                                                   |
|  This is a document with some mispelled words. The checker        |
|  can find them and offer sugestions for each one.                  |
|                                                                   |
|  It handles contractions like don't and it's correctly,           |
|  but flags definately as wrong.                                   |
|                                                                   |
+------------------------------------------------------------------+
|  Word: "mispelled" (line 2, col 35)                              |
|  Suggestions:                                                     |
|    [1] misspelled  (distance: 1)                                  |
|    [2] dispelled   (distance: 2)                                  |
|                                                                   |
|  n: next  p: prev  1-9: accept  a: add to dict  s: skip  q: quit |
+------------------------------------------------------------------+
```

Misspelled words are highlighted in red in the text. The currently selected word is highlighted in red with a bold underline. The bottom panel shows suggestions and controls.

This is a **state machine** — the program loops reading keyboard events and updating the display based on the current state.

### Terminal Concepts

Before writing code, you need to understand three terminal concepts:

**Raw mode:** Normally, the terminal buffers your input line-by-line (you type, press Enter, the program gets the whole line). In raw mode, the program gets each keypress immediately — no buffering, no echo. This is how TUI apps work.

**Alternate screen:** The terminal has a "main" screen (your shell history) and an "alternate" screen (a blank canvas). TUI apps switch to the alternate screen so they don't destroy your shell history. When they exit, the original screen is restored.

**Cursor control:** In raw mode, you control where text appears by moving the cursor with ANSI escape codes. crossterm abstracts this into commands like `MoveTo(x, y)`.

```rust
use crossterm::{
    execute,
    terminal::{enable_raw_mode, disable_raw_mode,
               EnterAlternateScreen, LeaveAlternateScreen, Clear, ClearType},
    cursor::{MoveTo, Hide, Show},
    event::{read, Event, KeyCode, KeyEvent, KeyEventKind},
    style::{SetForegroundColor, SetBackgroundColor, ResetColor,
            Color, Print, Stylize, SetAttribute, Attribute},
};
use std::io::{self, Write, stdout};
```

### The State Machine

```
                    +----------+
                    |  Start   |
                    +----+-----+
                         |
                    load file, find errors
                         |
                    +----v-----+
              +---->|  Display |<----+
              |     | current  |     |
              |     +----+-----+     |
              |          |           |
              |     read keypress    |
              |          |           |
         +----+----+----+----+------+----+
         |         |         |           |
      n: next   p: prev   1-9: accept  a: add
         |         |         |           |
    advance    go back    replace     add to
    index      index      word        custom dict
         |         |         |           |
         +----+----+----+----+------+----+
              |                      |
              +-------> redraw <-----+
```

### The Core Loop

Here's the skeleton. The rendering details are left for you to implement:

```rust
/// State for the interactive spell-check session.
struct InteractiveState {
    /// The original file content, split into lines.
    lines: Vec<String>,
    /// All spelling errors found.
    errors: Vec<SpellingError>,
    /// Index of the currently focused error.
    current: usize,
    /// Whether the file has been modified.
    modified: bool,
    /// The file path (for saving).
    file_path: PathBuf,
}

pub fn run_interactive(file: PathBuf, checker: &Checker) -> anyhow::Result<()> {
    let text = std::fs::read_to_string(&file)?;
    let errors = checker.check_document(&text);

    if errors.is_empty() {
        println!("No misspellings found in {}.", file.display());
        return Ok(());
    }

    let lines: Vec<String> = text.lines().map(String::from).collect();

    let mut state = InteractiveState {
        lines,
        errors,
        current: 0,
        modified: false,
        file_path: file,
    };

    // Enter TUI mode
    enable_raw_mode()?;
    let mut stdout = stdout();
    execute!(stdout, EnterAlternateScreen, Hide)?;

    let result = interactive_loop(&mut state, &mut stdout, checker);

    // Always restore terminal, even on error
    execute!(stdout, Show, LeaveAlternateScreen)?;
    disable_raw_mode()?;

    // Handle the result after restoring the terminal
    result?;

    if state.modified {
        println!("File modified. Save changes to {}? [y/N]", state.file_path.display());
        // Read one character (we're back in normal mode now)
        let mut input = String::new();
        std::io::stdin().read_line(&mut input)?;
        if input.trim().eq_ignore_ascii_case("y") {
            let content = state.lines.join("\n");
            std::fs::write(&state.file_path, content)?;
            println!("Saved.");
        } else {
            println!("Changes discarded.");
        }
    }

    Ok(())
}

fn interactive_loop(
    state: &mut InteractiveState,
    stdout: &mut io::Stdout,
    checker: &Checker,
) -> anyhow::Result<()> {
    loop {
        render(state, stdout)?;

        // Block until a key event
        if let Event::Key(KeyEvent { code, kind: KeyEventKind::Press, .. }) = read()? {
            match code {
                KeyCode::Char('q') | KeyCode::Esc => break,

                KeyCode::Char('n') | KeyCode::Right => {
                    if state.current < state.errors.len() - 1 {
                        state.current += 1;
                    }
                }

                KeyCode::Char('p') | KeyCode::Left => {
                    if state.current > 0 {
                        state.current -= 1;
                    }
                }

                KeyCode::Char('s') => {
                    // Skip — just advance
                    if state.current < state.errors.len() - 1 {
                        state.current += 1;
                    }
                }

                KeyCode::Char('a') => {
                    // Add to custom dictionary
                    let word = state.errors[state.current].normalized.clone();
                    let _ = add_custom_word(&word);
                    // Remove this error from the list
                    state.errors.remove(state.current);
                    if state.current >= state.errors.len() && state.current > 0 {
                        state.current -= 1;
                    }
                    if state.errors.is_empty() {
                        break;
                    }
                }

                KeyCode::Char(c) if c.is_ascii_digit() && c != '0' => {
                    let idx = (c as usize) - ('1' as usize);
                    let error = &state.errors[state.current];
                    if idx < error.suggestions.len() {
                        // Replace the word in the source text
                        let replacement = &error.suggestions[idx].word;
                        apply_replacement(state, replacement);
                    }
                }

                _ => {} // ignore other keys
            }
        }
    }
    Ok(())
}
```

### Your Turn: Implement the Renderer

The `render()` function redraws the entire screen. This is the "immediate mode" approach — clear everything and redraw from scratch on every frame. It's simple and correct, though not the most efficient.

```rust
/// Render the interactive UI.
///
/// Layout:
///   Row 0:      Header bar (filename, error count)
///   Rows 1-H-6: Text content with highlighted misspellings
///   Row H-5:    Separator
///   Rows H-4..: Current word info, suggestions, and controls
///
/// Highlighting:
///   - All misspelled words: red foreground
///   - Currently selected word: red foreground + bold + underline
///
/// Hints:
///   - Use terminal::size() to get (width, height)
///   - Use execute!(stdout, MoveTo(col, row), Print("text")) to draw
///   - Use SetForegroundColor(Color::Red) for misspelled words
///   - Use SetAttribute(Attribute::Bold) for the current word
///   - Call ResetColor after each colored segment
///   - Clear the screen with Clear(ClearType::All) at the start
fn render(state: &InteractiveState, stdout: &mut io::Stdout) -> anyhow::Result<()> {
    // YOUR IMPLEMENTATION HERE
    //
    // Suggested approach:
    // 1. Clear screen
    // 2. Draw header bar
    // 3. For each visible line of text:
    //    a. Walk through the line character by character
    //    b. When you hit a misspelled word's position, switch to red
    //    c. After the word, switch back to default
    //    d. For the CURRENT error, also add bold + underline
    // 4. Draw the info panel at the bottom
    // 5. Flush stdout
    todo!()
}
```

Also implement the replacement function:

```rust
/// Replace a misspelled word in the source text with a correction.
///
/// This modifies state.lines in place and marks the file as modified.
/// After replacement, recalculate column offsets for subsequent errors
/// on the same line (they may have shifted).
///
/// Hint: use String::replace_range or rebuild the line with
///       line[..col] + replacement + line[col+original.len()..]
///       Be careful with byte offsets vs character offsets!
fn apply_replacement(state: &mut InteractiveState, replacement: &str) {
    // YOUR IMPLEMENTATION HERE
    todo!()
}
```

### The Cleanup Pattern

Notice the structure of `run_interactive()`:

```rust
enable_raw_mode()?;
execute!(stdout, EnterAlternateScreen, Hide)?;

let result = interactive_loop(/* ... */);

// ALWAYS runs, even if interactive_loop returned an error
execute!(stdout, Show, LeaveAlternateScreen)?;
disable_raw_mode()?;

result?; // NOW propagate the error
```

This is critical. If the interactive loop panics or returns an error, you **must** restore the terminal first. Otherwise the user's terminal is stuck in raw mode with no cursor — they'd have to close the terminal window.

> **Python comparison:** This is like a `try/finally` block. In Rust, you could also use a `Drop` guard (a struct whose `Drop` impl restores the terminal). That's more robust against panics. For now, the explicit cleanup is clear enough.

### Tests

Interactive mode is hard to unit test (it needs a terminal). Focus on testing the state logic:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_state() -> InteractiveState {
        InteractiveState {
            lines: vec![
                "This has a mispeling here.".to_string(),
                "And another eror on this line.".to_string(),
            ],
            errors: vec![
                SpellingError {
                    original: "mispeling".to_string(),
                    normalized: "mispeling".to_string(),
                    line: 1, column: 12,
                    suggestions: vec![
                        Suggestion { word: "misspelling".to_string(), distance: 1, frequency: 100 },
                    ],
                },
                SpellingError {
                    original: "eror".to_string(),
                    normalized: "eror".to_string(),
                    line: 2, column: 13,
                    suggestions: vec![
                        Suggestion { word: "error".to_string(), distance: 1, frequency: 200 },
                    ],
                },
            ],
            current: 0,
            modified: false,
            file_path: PathBuf::from("test.txt"),
        }
    }

    #[test]
    fn navigation_bounds() {
        let mut state = make_test_state();
        assert_eq!(state.current, 0);

        // Can't go before first
        if state.current > 0 { state.current -= 1; }
        assert_eq!(state.current, 0);

        // Advance to next
        state.current += 1;
        assert_eq!(state.current, 1);

        // Can't go past last
        if state.current < state.errors.len() - 1 { state.current += 1; }
        assert_eq!(state.current, 1);
    }

    #[test]
    fn remove_error_adjusts_index() {
        let mut state = make_test_state();
        state.current = 1; // pointing at last error

        state.errors.remove(state.current);
        if state.current >= state.errors.len() && state.current > 0 {
            state.current -= 1;
        }

        assert_eq!(state.current, 0);
        assert_eq!(state.errors.len(), 1);
    }
}
```

> [!warning] Common Mistakes
> **Not filtering `KeyEventKind::Press`.** crossterm 0.27+ reports key press, repeat, and release events. If you don't filter for `KeyEventKind::Press`, every keypress triggers your handler twice (once on press, once on release). This is the #1 crossterm gotcha.
>
> **Forgetting to restore the terminal on error.** If your render function panics, the terminal stays in raw mode. Use a `Drop` guard or the explicit cleanup pattern shown above.
>
> **Drawing past the terminal bounds.** `terminal::size()` returns `(width, height)`. If your text has more lines than `height - 6` (accounting for header and footer), you need scrolling. Start simple — just show the lines around the current error.
>
> **Byte offset vs character offset in replacement.** When replacing a word in a line, the column from `SpellingError` is in characters, but `String::replace_range` uses byte indices. Convert: `line.char_indices().nth(col - 1).map(|(i, _)| i)`.
>
> Interactive mode makes Lexicon a pleasure to use, but "it feels fast" isn't the same as "it meets spec." Stage 27 puts numbers on every component — throughput, latency, memory — and compares them against the targets from the design document.

### What Changed

Lexicon now has a full interactive mode. You can navigate misspelled words, see suggestions, accept corrections, add words to your custom dictionary, and save the corrected file. The crossterm event loop handles keyboard input in raw mode, and the alternate screen keeps your shell history clean.

---

## Stage 27 — Performance Checkpoint

"It works" is necessary but not sufficient. A spell checker that takes 5 seconds to check a README will be abandoned after the first use. This stage establishes the discipline of measurement: you'll benchmark every component against concrete targets, profile with flamegraphs to find bottlenecks, and learn the optimization checklist that turns a slow prototype into a responsive tool. The numbers you collect here become the baseline for every future change.

*Difficulty: Medium*

### The Targets

From the design spec, here's what Lexicon should hit:

| Metric | Target | Why it matters |
|--------|--------|----------------|
| Dictionary load (cold) | < 500ms | First run experience |
| Dictionary load (cached) | < 50ms | Subsequent runs with bincode cache |
| Check 10,000 words | < 1 second | Practical file checking speed |
| Single word suggestion | < 10ms | Interactive mode responsiveness |
| Memory (English dict) | < 50 MB | Reasonable for a CLI tool |
| Bloom filter query | < 1 microsecond | The fast path must be *fast* |

### The Bench Command

`lexicon bench <file>` runs a standardized benchmark and reports results:

```rust
use std::time::Instant;

pub fn run_bench(file: &Path, checker: &Checker) -> anyhow::Result<()> {
    let text = std::fs::read_to_string(file)?;
    let tokens = tokenize_document(&text);
    let checkable: Vec<_> = tokens.iter()
        .filter(|t| is_checkable(&t.token))
        .collect();

    let word_count = checkable.len();
    println!("Benchmarking with {} checkable words from {}\n",
             word_count, file.display());

    // --- Check throughput ---
    let start = Instant::now();
    let mut misspelled = 0;
    for token in &checkable {
        if let CheckResult::Misspelled { .. } = checker.check_word(&token.token.word) {
            misspelled += 1;
        }
    }
    let check_elapsed = start.elapsed();

    println!("Check throughput:");
    println!("  {} words in {:.2?}", word_count, check_elapsed);
    println!("  {:.0} words/second",
             word_count as f64 / check_elapsed.as_secs_f64());
    println!("  {} misspelled ({:.1}%)\n",
             misspelled, (misspelled as f64 / word_count as f64) * 100.0);

    // --- Suggestion latency ---
    // Collect some misspelled words to benchmark suggestions
    let misspelled_words: Vec<&str> = checkable.iter()
        .filter_map(|t| {
            match checker.check_word(&t.token.word) {
                CheckResult::Misspelled { .. } => Some(t.token.word.as_str()),
                _ => None,
            }
        })
        .take(100)
        .collect();

    if !misspelled_words.is_empty() {
        let mut suggestion_times: Vec<f64> = Vec::new();

        for word in &misspelled_words {
            let start = Instant::now();
            let _ = checker.check_word(word);
            suggestion_times.push(start.elapsed().as_secs_f64() * 1000.0); // ms
        }

        suggestion_times.sort_by(|a, b| a.partial_cmp(b).unwrap());

        let p50 = suggestion_times[suggestion_times.len() / 2];
        let p95 = suggestion_times[(suggestion_times.len() as f64 * 0.95) as usize];
        let p99 = suggestion_times[(suggestion_times.len() as f64 * 0.99) as usize];

        println!("Suggestion latency ({} samples):", misspelled_words.len());
        println!("  p50: {:.2}ms", p50);
        println!("  p95: {:.2}ms", p95);
        println!("  p99: {:.2}ms", p99);
    }

    // --- Pass/fail against targets ---
    println!("\nTargets:");
    let check_ok = check_elapsed.as_secs_f64() < (word_count as f64 / 10_000.0);
    print_target("10k words < 1s", check_ok);

    Ok(())
}

fn print_target(name: &str, passed: bool) {
    if passed {
        println!("  [PASS] {}", name);
    } else {
        println!("  [FAIL] {}", name);
    }
}
```

### Criterion Benchmarks

For repeatable, statistically rigorous benchmarks, use the `criterion` crate:

```toml
[dev-dependencies]
criterion = { version = "0.5", features = ["html_reports"] }

[[bench]]
name = "check_bench"
harness = false
```

```rust
// benches/check_bench.rs

use criterion::{criterion_group, criterion_main, Criterion, black_box};

fn bench_bloom_lookup(c: &mut Criterion) {
    let words: Vec<(String, u32)> = load_test_dictionary();
    let mut bloom = BloomFilter::with_rate(words.len(), 0.01);
    for (w, _) in &words { bloom.insert(w.as_bytes()); }

    c.bench_function("bloom_contains_hit", |b| {
        b.iter(|| bloom.contains(black_box("hello").as_bytes()))
    });

    c.bench_function("bloom_contains_miss", |b| {
        b.iter(|| bloom.contains(black_box("xyzzy").as_bytes()))
    });
}

fn bench_levenshtein(c: &mut Criterion) {
    c.bench_function("levenshtein_short", |b| {
        b.iter(|| levenshtein(black_box("kitten"), black_box("sitting")))
    });

    c.bench_function("levenshtein_bounded_miss", |b| {
        b.iter(|| levenshtein_bounded(
            black_box("abcdefghij"),
            black_box("zyxwvutsrq"),
            2
        ))
    });
}

fn bench_bktree_search(c: &mut Criterion) {
    let words = load_test_dictionary();
    let mut bktree = BKTree::new();
    for (w, f) in &words { bktree.insert(w.clone(), *f); }

    c.bench_function("bktree_search_d1", |b| {
        b.iter(|| bktree.search(black_box("recieve"), 1))
    });

    c.bench_function("bktree_search_d2", |b| {
        b.iter(|| bktree.search(black_box("recieve"), 2))
    });
}

criterion_group!(benches, bench_bloom_lookup, bench_levenshtein, bench_bktree_search);
criterion_main!(benches);
```

Run with `cargo bench`. Criterion runs each benchmark many times, computes statistics, and detects regressions between runs.

### Your Turn: Dictionary Load Benchmark

Add a benchmark for dictionary loading — both cold (from `.dict` file) and warm (from bincode cache):

```rust
/// Benchmark dictionary loading.
///
/// Measure:
/// 1. Cold load: parse .dict file, build trie + bloom + bktree
/// 2. Warm load: deserialize from bincode cache
///
/// The cold load target is < 500ms for a 300k-word dictionary.
/// The warm load target is < 50ms.
///
/// Hint: use std::time::Instant for wall-clock timing.
/// Hint: for the warm load, you'll need to implement bincode
///       serialization for Trie (Stage 4.4 in the design spec).
fn bench_dictionary_load(c: &mut Criterion) {
    // YOUR IMPLEMENTATION HERE
    todo!()
}
```

### Profiling with flamegraph

If you're not hitting targets, you need to find the bottleneck. Install `cargo-flamegraph`:

```bash
cargo install flamegraph
```

Then run:

```bash
cargo flamegraph --bench check_bench -- --bench "bktree_search_d2"
```

This produces an SVG flamegraph showing where time is spent. Common findings:

- **Levenshtein inner loop** dominates BK-tree search time. The `chars().collect()` allocation inside `levenshtein()` is a hot spot — consider caching the char vectors.
- **HashMap lookups** in trie nodes. If profiling shows hash computation is significant, consider the array-mapped trie optimization for top levels.
- **String allocation** in BK-tree results. If `search()` clones strings into the result vec, that's allocation in the hot path.

### Optimization Checklist

If you're not hitting targets, try these in order:

1. **Cache char vectors.** `levenshtein()` calls `a.chars().collect()` every time. In the BK-tree, the query word is the same across all comparisons — collect it once and pass the slice.

2. **Early termination in levenshtein_bounded.** Make sure you're checking the row minimum and bailing when it exceeds the threshold. This should cut BK-tree search time by 60-80%.

3. **Bloom filter sizing.** Verify your bloom filter has the right number of bits and hashes. An undersized filter has too many false positives, sending more words to the trie unnecessarily.

4. **BK-tree insertion order.** The root word affects tree balance. Using a common word (high frequency) as the root tends to produce better-balanced trees. Sort words by frequency descending before building.

5. **Bincode caching.** Serializing the built trie/bloom/bktree to disk with bincode and loading the binary on subsequent runs can cut startup from 500ms to 50ms.

### Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn check_throughput_sanity() {
        // Build a small checker and verify it can check words quickly
        let words: Vec<(String, u32)> = (0..1000)
            .map(|i| (format!("word{}", i), 1))
            .collect();
        let checker = Checker::from_words(&words, 2);

        let start = Instant::now();
        for i in 0..1000 {
            let _ = checker.check_word(&format!("word{}", i));
        }
        let elapsed = start.elapsed();

        // 1000 correct words should take well under 100ms
        assert!(elapsed.as_millis() < 100,
                "1000 lookups took {}ms — too slow", elapsed.as_millis());
    }

    #[test]
    fn bloom_filter_saves_trie_lookups() {
        // For misspelled words, bloom should reject most without hitting trie
        let words: Vec<(String, u32)> = vec![
            ("hello".into(), 100), ("world".into(), 90),
        ];
        let checker = Checker::from_words(&words, 2);

        // "zzzzz" should be rejected by bloom (not in dictionary)
        // This is hard to test without exposing stats, but we can verify
        // the bloom filter itself
        assert!(!checker.bloom.contains("zzzzz".as_bytes()));
    }
}
```

> [!warning] Common Mistakes
> **Benchmarking debug builds.** `cargo bench` uses release mode by default, but if you're timing with `Instant` in a test, you might be in debug mode (10-50x slower). Always benchmark with `--release`.
>
> **Including dictionary load time in check throughput.** The "10k words < 1 second" target is for checking only — dictionary loading is measured separately. Build the checker once, then time the check loop.
>
> **Not using `black_box()` in criterion benchmarks.** Without `black_box()`, the compiler might optimize away the computation entirely (it can prove the result is unused). `black_box()` prevents this.
>
> With performance validated and a complete single-language tool in hand, Act 4 is done. Lexicon works — but it only speaks one language at a time. Act 5 teaches it to detect, load, and check English, Spanish, and Portuguese simultaneously.

### What Changed

You now have concrete performance numbers for every component. The `lexicon bench` command gives a quick health check. Criterion benchmarks give statistically rigorous measurements for regression detection. And you know how to profile with flamegraphs when something is too slow.

This is the end of Act 4. Lexicon is a working CLI tool: it reads files, checks spelling, suggests corrections, supports custom dictionaries, has an interactive mode, and meets performance targets. In Act 5, you'll teach it to speak multiple languages.

---

## Act 4 Summary

| Stage | What you built | Key concept |
|-------|---------------|-------------|
| 21 | Tokenizer | Unicode word segmentation, NFC normalization, grapheme clusters |
| 22 | Check pipeline | Facade pattern, bloom → trie → BK-tree orchestration |
| 23 | CLI with clap | Derive API, subcommands, ValueEnum, global flags |
| 24 | File checking | File I/O, text/JSON output, exit codes for CI |
| 25 | Custom dictionary | Layered config, home directory, HashSet persistence |
| 26 | Interactive mode | Raw mode, alternate screen, crossterm event loop |
| 27 | Performance | Criterion benchmarks, flamegraph profiling, optimization |

**Lexicon can now:**
- Check files for misspelled words with `lexicon check <file>`
- Suggest corrections with `lexicon suggest <word>`
- Output in text or JSON format
- Manage custom dictionaries with `lexicon dict add/remove`
- Interactively correct misspellings with `lexicon interactive <file>`
- Benchmark its own performance with `lexicon bench <file>`

**Next up:** Act 5 — teaching Lexicon to detect and handle English, Spanish, and Portuguese.
