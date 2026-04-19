# Act 5 — The Rosetta Stone

> *Your spell checker speaks English. Now teach it Spanish and Portuguese — and how to tell them apart.*

In Act 4, you built a complete CLI spell checker. It reads files, checks words, suggests corrections, and even has an interactive mode. But it only speaks one language at a time. Real-world text isn't that clean. A developer's README might say "Run the servidor locally" or "See the documentação for details." A language learner's notes mix English with Spanish and Portuguese constantly.

Act 5 is about making Lexicon polyglot. You'll load multiple dictionaries simultaneously, detect which language a document is written in, and handle the fascinating edge cases that arise when languages overlap. Spanish and Portuguese share thousands of words — "animal", "chocolate", "hospital" are identical in all three languages. But "embarazada" means "pregnant" in Spanish, not "embarrassed." And "pão" (bread) in Portuguese looks nothing like "pan" (bread) in Spanish, despite both descending from Latin "panis."

This is where the language-learning theme of the course pays off. Every stage teaches you something about how languages work, not just how Rust works.

**What you have from Acts 1-4:**
- A complete `Checker` with bloom filter → trie → BK-tree pipeline
- A Unicode-aware tokenizer with NFC normalization
- A CLI with clap (check, suggest, dict, interactive, bench)
- Custom dictionary support (global + per-project)
- An interactive TUI mode with crossterm
- Performance benchmarks meeting spec targets

**What you'll build in Act 5:**
- Multi-language dictionary loading (en/es/pt)
- Language detection via word frequency overlap
- Trigram-based fallback for short texts
- Per-language custom dictionaries
- A grand benchmark across all three languages

**Project location:** `~/juk/lexicon/lexicon/`

---

## Stage 28 — Multi-Language Dictionaries

A monolingual spell checker is a solved problem. The interesting challenge begins when you load multiple dictionaries and must decide which one to consult — or whether to consult all of them. This stage introduces the `MultiChecker` pattern: one `Checker` per language, keyed by a `Language` enum, with cross-language deduplication for the thousands of cognates (like "animal" and "hospital") that are valid in English, Spanish, and Portuguese simultaneously.

*Difficulty: Medium* | *New concepts: `HashMap` of checkers, enum-keyed data structures, dictionary management*

### One Checker Per Language

In Act 4, we had a single `Checker` with one trie, one bloom filter, and one BK-tree. For multi-language support, we need one set per language. The simplest approach: a `HashMap<Language, Checker>`.

But first, let's make `Language` a proper first-class type:

```rust
// src/language.rs

use std::fmt;

/// Supported languages.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Language {
    English,
    Spanish,
    Portuguese,
}

impl Language {
    /// The ISO 639-1 code.
    pub fn code(&self) -> &'static str {
        match self {
            Language::English => "en",
            Language::Spanish => "es",
            Language::Portuguese => "pt",
        }
    }

    /// Human-readable name.
    pub fn name(&self) -> &'static str {
        match self {
            Language::English => "English",
            Language::Spanish => "Spanish",
            Language::Portuguese => "Portuguese",
        }
    }

    /// All supported languages.
    pub fn all() -> &'static [Language] {
        &[Language::English, Language::Spanish, Language::Portuguese]
    }

    /// Parse from a language code string.
    pub fn from_code(code: &str) -> Option<Language> {
        match code {
            "en" => Some(Language::English),
            "es" => Some(Language::Spanish),
            "pt" => Some(Language::Portuguese),
            _ => None,
        }
    }
}

impl fmt::Display for Language {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} ({})", self.name(), self.code())
    }
}
```

### The MultiChecker

Right now we have a single `Checker` that knows one language. But a developer's README might contain Spanish variable names, Portuguese comments, and English prose. We need a way to hold multiple language-specific checkers and query them individually or collectively.

```rust
// src/checker.rs (additions)

use std::collections::HashMap;
use crate::language::Language;

/// A multi-language spell checker.
///
/// Holds one Checker per language. Can check against a specific language
/// or auto-detect the language first.
pub struct MultiChecker {
    checkers: HashMap<Language, Checker>,
}

impl MultiChecker {
    /// Build checkers for all provided languages.
    ///
    /// `dictionaries` maps each language to its word list.
    pub fn new(
        dictionaries: HashMap<Language, Vec<(String, u32)>>,
        max_distance: usize,
    ) -> Self {
        let checkers = dictionaries.into_iter()
            .map(|(lang, words)| {
                let checker = Checker::from_words(&words, max_distance);
                (lang, checker)
            })
            .collect();

        MultiChecker { checkers }
    }

    /// Check a word against a specific language.
    pub fn check_word(&self, word: &str, lang: Language) -> CheckResult {
        match self.checkers.get(&lang) {
            Some(checker) => checker.check_word(word),
            None => CheckResult::Misspelled {
                suggestions: vec![],
            },
        }
    }

    /// Check a word against ALL loaded languages.
    /// Returns Correct if the word is valid in any language.
    pub fn check_word_any_language(&self, word: &str) -> (CheckResult, Option<Language>) {
        for (lang, checker) in &self.checkers {
            if let CheckResult::Correct = checker.check_word(word) {
                return (CheckResult::Correct, Some(*lang));
            }
        }

        // Not found in any language — get suggestions from all
        let mut all_suggestions: Vec<Suggestion> = Vec::new();
        for checker in self.checkers.values() {
            if let CheckResult::Misspelled { suggestions } = checker.check_word(word) {
                all_suggestions.extend(suggestions);
            }
        }

        all_suggestions.sort_by(|a, b| {
            a.distance.cmp(&b.distance)
                .then(b.frequency.cmp(&a.frequency))
        });
        all_suggestions.truncate(10); // top 10 across all languages

        (CheckResult::Misspelled { suggestions: all_suggestions }, None)
    }
}
```

### Dictionary File Organization

Each language gets its own dictionary file:

```
dicts/
  en-small.dict    # 10k most common English words (bundled)
  es-small.dict    # 10k most common Spanish words (bundled)
  pt-small.dict    # 10k most common Portuguese words (bundled)

~/.lexicon/
  dicts/
    en.dict        # Full English dictionary (300k words, downloaded)
    es.dict        # Full Spanish dictionary (200k words, downloaded)
    pt.dict        # Full Portuguese dictionary (250k words, downloaded)
  cache/
    en.trie.bin    # Compiled trie (bincode)
    es.trie.bin
    pt.trie.bin
```

The loader tries the full dictionary first, falls back to the bundled small one:

```rust
use std::path::{Path, PathBuf};

/// Find the dictionary file for a language.
/// Prefers the full dictionary in ~/.lexicon/dicts/, falls back to bundled.
fn find_dictionary(lang: Language) -> anyhow::Result<PathBuf> {
    let full_path = lexicon_dir()
        .join("dicts")
        .join(format!("{}.dict", lang.code()));

    if full_path.exists() {
        return Ok(full_path);
    }

    // Fall back to bundled small dictionary
    let bundled = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("dicts")
        .join(format!("{}-small.dict", lang.code()));

    if bundled.exists() {
        return Ok(bundled);
    }

    anyhow::bail!(
        "No dictionary found for {}. Run `lexicon dict install {}`.",
        lang.name(), lang.code()
    );
}
```

### Your Turn: Load All Dictionaries

Implement the function that loads dictionaries for multiple languages and builds a `MultiChecker`:

```rust
/// Load dictionaries for the specified languages and build a MultiChecker.
///
/// If `languages` is None, load all available languages.
/// If a language's dictionary is missing, skip it with a warning (don't fail).
///
/// Hint: iterate over languages, call find_dictionary() and load_word_file()
/// for each, collect into a HashMap, then pass to MultiChecker::new().
///
/// Bonus: print loading times per language:
///   "Loaded English: 312,000 words in 234ms"
///   "Loaded Spanish: 198,000 words in 187ms"
pub fn build_multi_checker(
    languages: Option<&[Language]>,
    max_distance: usize,
) -> anyhow::Result<MultiChecker> {
    // YOUR IMPLEMENTATION HERE
    todo!()
}
```

### Shared Words Across Languages

Here's something interesting: many words exist in multiple languages. "Animal" is valid in English, Spanish, AND Portuguese. "Hospital", "chocolate", "idea", "normal" — all three. When checking a mixed-language document, a word that's valid in *any* loaded language should be marked correct.

But this creates an interesting problem for suggestions. If someone writes "hopital" (missing the 's'), should Lexicon suggest "hospital" from English, Spanish, or Portuguese? All three have it. The answer: suggest from all languages, deduplicate, and rank by distance then frequency.

```rust
/// Deduplicate suggestions across languages.
/// If the same word appears from multiple languages, keep the one
/// with the highest frequency.
fn dedup_suggestions(suggestions: &mut Vec<Suggestion>) {
    suggestions.sort_by(|a, b| a.word.cmp(&b.word));
    suggestions.dedup_by(|a, b| {
        if a.word == b.word {
            // Keep the one with higher frequency (in b, since dedup keeps b)
            if a.frequency > b.frequency {
                b.frequency = a.frequency;
            }
            true
        } else {
            false
        }
    });
    // Re-sort by distance, then frequency
    suggestions.sort_by(|a, b| {
        a.distance.cmp(&b.distance)
            .then(b.frequency.cmp(&a.frequency))
    });
}
```

### Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn build_test_multi_checker() -> MultiChecker {
        let mut dicts = HashMap::new();

        dicts.insert(Language::English, vec![
            ("hello".into(), 100), ("world".into(), 90),
            ("animal".into(), 80), ("hospital".into(), 70),
            ("the".into(), 69971), ("receive".into(), 50),
        ]);

        dicts.insert(Language::Spanish, vec![
            ("hola".into(), 100), ("mundo".into(), 90),
            ("animal".into(), 80), ("hospital".into(), 70),
            ("gato".into(), 60), ("recibir".into(), 50),
        ]);

        dicts.insert(Language::Portuguese, vec![
            ("olá".into(), 100), ("mundo".into(), 90),
            ("animal".into(), 80), ("hospital".into(), 70),
            ("gato".into(), 60), ("receber".into(), 50),
        ]);

        MultiChecker::new(dicts, 2)
    }

    #[test]
    fn word_correct_in_specific_language() {
        let mc = build_test_multi_checker();
        assert!(matches!(
            mc.check_word("hello", Language::English),
            CheckResult::Correct
        ));
        assert!(matches!(
            mc.check_word("hello", Language::Spanish),
            CheckResult::Misspelled { .. }
        ));
    }

    #[test]
    fn shared_word_correct_in_any_language() {
        let mc = build_test_multi_checker();
        let (result, lang) = mc.check_word_any_language("animal");
        assert!(matches!(result, CheckResult::Correct));
        assert!(lang.is_some()); // found in at least one language
    }

    #[test]
    fn language_specific_word() {
        let mc = build_test_multi_checker();
        let (result, _) = mc.check_word_any_language("hola");
        assert!(matches!(result, CheckResult::Correct));

        let (result, _) = mc.check_word_any_language("hello");
        assert!(matches!(result, CheckResult::Correct));
    }

    #[test]
    fn misspelled_in_all_languages() {
        let mc = build_test_multi_checker();
        let (result, lang) = mc.check_word_any_language("zzzzz");
        assert!(matches!(result, CheckResult::Misspelled { .. }));
        assert!(lang.is_none());
    }

    #[test]
    fn suggestions_from_multiple_languages() {
        let mc = build_test_multi_checker();
        // "recive" is close to "receive" (en) and "recibir" (es)
        let (result, _) = mc.check_word_any_language("recive");
        if let CheckResult::Misspelled { suggestions } = result {
            let words: Vec<&str> = suggestions.iter()
                .map(|s| s.word.as_str()).collect();
            // Should have suggestions from multiple languages
            assert!(!suggestions.is_empty());
        }
    }
}
```

### Common Mistakes

**Loading all languages when the user specified one.** If `--lang en` is set, only load English. Loading three dictionaries triples startup time and memory usage for no benefit.

**Not handling missing dictionaries gracefully.** If the user hasn't installed the Portuguese dictionary, `lexicon check --lang pt file.txt` should give a clear error, not a panic.

**Checking against all languages when one is specified.** If the user said `--lang es`, don't check against English and Portuguese too. The `--lang` flag means "I know what language this is."

Multiple dictionaries are loaded and queryable, but the user still has to tell Lexicon which language to use. For a truly polyglot tool, Lexicon should figure it out on its own. Stage 29 adds automatic language detection.

### What Changed

Lexicon now loads multiple dictionaries and can check words against any or all of them. The `MultiChecker` wraps per-language `Checker` instances and handles cross-language deduplication. Shared words like "animal" and "hospital" are correctly recognized regardless of which language is active.

---

## Stage 29 — Language Detection

Asking users to specify `--lang` every time defeats the purpose of a polyglot tool. Language detection sounds like it should require machine learning, but for well-separated languages with distinct vocabularies, a beautifully simple approach works: count how many of the text's words appear in each language's list of function words. Articles, prepositions, and conjunctions — the words linguists find least interesting — turn out to be the most powerful language fingerprints.

*Difficulty: Medium* | *New concepts: word frequency overlap scoring, stop words, confidence thresholds*

### The Problem

Given a block of text, which language is it? This sounds like it should require machine learning, but for well-separated languages with distinct vocabularies, a simple word-overlap approach works surprisingly well.

The idea: every language has a set of extremely common words — "the", "is", "and" for English; "el", "es", "de" for Spanish; "o", "é", "de" for Portuguese. If you count how many words in the input text appear in each language's "top 1000" list, the language with the highest overlap wins.

Let's trace through an example:

```
Input: "El gato duerme en la silla"
Tokens: ["el", "gato", "duerme", "en", "la", "silla"]

English top-1000 hits: "en" (also English word!) → 1/6 = 16.7%
Spanish top-1000 hits: "el", "en", "la" → 3/6 = 50.0%
Portuguese top-1000 hits: "em"? no. "la"? maybe → ~1/6 = 16.7%

Winner: Spanish (50.0%)  ✓ Correct!
```

### Stop Words as Language Fingerprints

The most useful words for language detection are the *least* interesting words linguistically — articles, prepositions, conjunctions. Linguists call them "stop words" or "function words." They're perfect for detection because:

1. They're extremely frequent (appear in almost every sentence)
2. They're highly language-specific ("the" is English, "el/la" is Spanish, "o/a" is Portuguese)
3. They're short, so even a brief text contains several

Here are the top function words for each language:

```rust
/// Top function words for language detection.
/// These are the most frequent words that are highly specific to each language.
fn top_words(lang: Language) -> &'static [&'static str] {
    match lang {
        Language::English => &[
            "the", "be", "to", "of", "and", "a", "in", "that", "have", "i",
            "it", "for", "not", "on", "with", "he", "as", "you", "do", "at",
            "this", "but", "his", "by", "from", "they", "we", "say", "her",
            "she", "or", "an", "will", "my", "would", "there", "their",
            "what", "so", "if", "about", "who", "get", "which", "when",
            "make", "can", "like", "just", "him", "know", "take", "people",
            "into", "your", "could", "them", "than", "other", "been", "has",
            "its", "over", "think", "also", "back", "after", "should",
            "where", "most", "these", "because", "does", "each",
        ],
        Language::Spanish => &[
            "de", "la", "que", "el", "en", "y", "a", "los", "del", "se",
            "las", "por", "un", "para", "con", "no", "una", "su", "al",
            "lo", "como", "más", "pero", "sus", "le", "ya", "o", "este",
            "si", "porque", "esta", "entre", "cuando", "muy", "sin",
            "sobre", "también", "me", "hasta", "hay", "donde", "quien",
            "desde", "todo", "nos", "durante", "todos", "uno", "les",
            "ni", "contra", "otros", "ese", "eso", "ante", "ellos",
            "esto", "antes", "algunos", "qué", "unos", "yo", "otro",
            "otras", "otra", "él", "tanto", "esa", "estos", "mucho",
            "quienes", "nada", "muchos", "cual", "poco", "ella",
        ],
        Language::Portuguese => &[
            "de", "a", "o", "que", "e", "do", "da", "em", "um", "para",
            "é", "com", "não", "uma", "os", "no", "se", "na", "por",
            "mais", "as", "dos", "como", "mas", "foi", "ao", "ele",
            "das", "tem", "à", "seu", "sua", "ou", "ser", "quando",
            "muito", "há", "nos", "já", "está", "eu", "também", "só",
            "pelo", "pela", "até", "isso", "ela", "entre", "era",
            "depois", "sem", "mesmo", "aos", "ter", "seus", "quem",
            "nas", "me", "esse", "eles", "estão", "você", "tinha",
            "foram", "essa", "num", "nem", "suas", "meu", "às",
            "minha", "têm", "numa", "pelos", "elas",
        ],
    }
}
```

### The Detection Algorithm

```rust
use std::collections::HashSet;

/// Result of language detection.
#[derive(Debug, Clone)]
pub struct DetectionResult {
    /// The detected language (if confidence is high enough).
    pub language: Option<Language>,
    /// Confidence scores for each language (0.0 to 1.0).
    pub scores: Vec<(Language, f64)>,
    /// Whether the result is confident enough to act on.
    pub confident: bool,
}

/// Detect the language of a text using word frequency overlap.
///
/// For each supported language, count how many of the text's words
/// appear in that language's top-word list. The language with the
/// highest overlap ratio wins.
pub fn detect_language(text: &str) -> DetectionResult {
    let tokens = crate::tokenizer::tokenize(text);
    let words: Vec<&str> = tokens.iter().map(|t| t.word.as_str()).collect();

    if words.is_empty() {
        return DetectionResult {
            language: None,
            scores: vec![],
            confident: false,
        };
    }

    let total = words.len() as f64;

    let mut scores: Vec<(Language, f64)> = Language::all().iter().map(|&lang| {
        let top: HashSet<&str> = top_words(lang).iter().copied().collect();
        let hits = words.iter().filter(|w| top.contains(*w)).count();
        (lang, hits as f64 / total)
    }).collect();

    // Sort by score descending
    scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());

    let best_score = scores[0].1;
    let second_score = if scores.len() > 1 { scores[1].1 } else { 0.0 };

    // Confidence heuristics:
    // 1. Best score must be above 15% (at least some function words matched)
    // 2. Best must be at least 1.5x the second-best (clear winner)
    let confident = best_score > 0.15 && (second_score == 0.0 || best_score / second_score > 1.5);

    DetectionResult {
        language: if confident { Some(scores[0].0) } else { None },
        scores,
        confident,
    }
}
```

### The Tricky Cases

Language detection sounds easy until you hit the edge cases:

**Spanish vs Portuguese overlap.** These two languages share enormous vocabulary. "de", "por", "como", "entre", "para" appear in both top-word lists. The distinguishing words are:
- Spanish: "el", "los", "las", "que" (with different frequency), "pero"
- Portuguese: "o", "os", "as", "não", "é", "mas"

A sentence like "El gato duerme" is clearly Spanish ("el" is the giveaway). But "O gato dorme" is clearly Portuguese ("o" is the giveaway). The function words do the heavy lifting.

**Short texts.** With only 3-5 words, there might not be enough function words to distinguish. "Hola amigo" has zero function words — neither "hola" nor "amigo" is in the top-word lists. This is where the trigram fallback (Stage 30) comes in.

**Mixed-language text.** "I went to the tienda to buy some pão" has English function words ("I", "to", "the", "to", "some") and Spanish/Portuguese content words. The function word overlap will correctly identify the *matrix language* as English, even though it contains foreign words.

> **Linguistics note:** In code-switching (mixing languages), there's usually a "matrix language" that provides the grammar and function words, and an "embedded language" that provides content words. Our detector naturally finds the matrix language because it counts function words.

### The `detect` Command

Wire it into the CLI:

```rust
// In the Commands enum:
/// Detect the language of a file
Detect {
    /// File to analyze
    file: PathBuf,
},

// In the match:
Commands::Detect { file } => {
    let text = read_input(&file)?;
    let result = detect_language(&text);

    println!("Language detection for {}:\n", file.display());
    for (lang, score) in &result.scores {
        let bar_len = (score * 40.0) as usize;
        let bar: String = "█".repeat(bar_len);
        println!("  {} {:>5.1}%  {}", lang.code(), score * 100.0, bar);
    }

    println!();
    match result.language {
        Some(lang) => println!("Detected: {} (confident)", lang),
        None => println!("Uncertain — try with more text or use --lang"),
    }
}
```

Example output:

```
Language detection for README.md:

  en  42.3%  █████████████████
  es   8.1%  ███
  pt   5.7%  ██

Detected: English (en) (confident)
```

### Your Turn: Improve Detection with Weighted Scoring

The basic algorithm treats all top words equally. But "the" appearing 50 times is stronger evidence than "the" appearing once. Implement weighted scoring:

```rust
/// Detect language using weighted word frequency scoring.
///
/// Instead of just counting hits, weight each hit by how many times
/// the word appears in the text. A text with 20 occurrences of "the"
/// is more confidently English than one with 1 occurrence.
///
/// Algorithm:
/// 1. Count word frequencies in the input text (HashMap<&str, usize>)
/// 2. For each language, sum the frequencies of words that appear
///    in that language's top-word list
/// 3. Divide by total word count for the score
///
/// This handles the case where a short text repeats function words:
/// "the cat and the dog and the bird" → "the" x3, "and" x2 = strong English signal
pub fn detect_language_weighted(text: &str) -> DetectionResult {
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
    fn detect_english() {
        let result = detect_language(
            "The quick brown fox jumps over the lazy dog. \
             It was a beautiful day and the sun was shining."
        );
        assert_eq!(result.language, Some(Language::English));
        assert!(result.confident);
    }

    #[test]
    fn detect_spanish() {
        let result = detect_language(
            "El gato duerme en la silla. La casa es grande \
             y tiene un jardín con muchas flores."
        );
        assert_eq!(result.language, Some(Language::Spanish));
        assert!(result.confident);
    }

    #[test]
    fn detect_portuguese() {
        let result = detect_language(
            "O gato dorme na cadeira. A casa é grande \
             e tem um jardim com muitas flores."
        );
        assert_eq!(result.language, Some(Language::Portuguese));
        assert!(result.confident);
    }

    #[test]
    fn short_text_low_confidence() {
        let result = detect_language("Hola amigo");
        // Too short for confident detection
        assert!(!result.confident);
    }

    #[test]
    fn empty_text() {
        let result = detect_language("");
        assert!(result.language.is_none());
        assert!(!result.confident);
    }

    #[test]
    fn mixed_language_detects_matrix() {
        // English matrix with Spanish content words
        let result = detect_language(
            "I went to the tienda to buy some food for the fiesta."
        );
        // "I", "to", "the" (x2), "to", "some", "for", "the" → strong English
        assert_eq!(result.language, Some(Language::English));
    }

    #[test]
    fn spanish_vs_portuguese_distinguished() {
        let es = detect_language(
            "El presidente habló sobre los problemas del país \
             y las soluciones que el gobierno propone."
        );
        assert_eq!(es.language, Some(Language::Spanish));

        let pt = detect_language(
            "O presidente falou sobre os problemas do país \
             e as soluções que o governo propõe."
        );
        assert_eq!(pt.language, Some(Language::Portuguese));
    }
}
```

### Common Mistakes

**Using content words instead of function words.** Content words ("cat", "house", "run") overlap heavily between languages. Function words ("the", "el", "o") are the real discriminators.

**Not lowercasing before comparison.** "The" won't match "the" in your top-word set if you forget to normalize. The tokenizer handles this, but if you're comparing raw text, remember to lowercase.

**Treating low scores as confident.** If the best score is 8% and the second is 6%, that's noise, not a detection. Require both an absolute threshold (>15%) and a relative margin (>1.5x second place).

**Hardcoding "de" as Spanish.** "De" is in the top words for both Spanish AND Portuguese. It's not a discriminator. The detection works because the *combination* of function words differs, not any single word.

Word-frequency detection handles long texts with high accuracy, but short texts — "Hola amigo", "informação importante" — may contain no function words at all. Stage 30 adds a character-level fallback that can distinguish languages from the shape of their trigrams, even in a single word.

### What Changed

Lexicon can now detect the language of a document by analyzing word frequency overlap with language-specific function word lists. It handles the easy cases (clearly English, clearly Spanish) with high confidence and honestly reports uncertainty for ambiguous or short texts. The `lexicon detect` command visualizes the scores.

But short texts remain a problem. "Hola amigo" has no function words to count. That's what Stage 30 fixes.

---

## Stage 30 — Trigram Fallback

Word-frequency detection fails on short texts because there aren't enough function words to count. But even a single word carries a language signature in its *character patterns*. Spanish "información" ends in "-ción"; Portuguese "informação" ends in "-ção". These three-character sequences — trigrams — are the sub-word fingerprints that let you distinguish languages from fragments as short as a single word. This stage introduces cosine similarity over sparse vectors, a technique that appears everywhere from search engines to recommendation systems.

*Difficulty: Hard* | *New concepts: character n-grams, cosine similarity, frequency vectors, the `HashMap` as a sparse vector*

### Why Trigrams?

Word-frequency detection fails on short texts because there aren't enough function words to count. But even a single word contains *character patterns* that are language-specific.

A **trigram** is a sequence of three consecutive characters. The word "the" contains one trigram: `"the"`. The word "hello" contains three: `"hel"`, `"ell"`, `"llo"`.

Different languages have different trigram frequency profiles:

```
English top trigrams: "the", "ing", "and", "tion", "her", "ent"
Spanish top trigrams: "ción", "ent", "ado", "que", "los", "del"
Portuguese top trigrams: "ção", "ent", "ado", "que", "dos", "uma"
```

Notice: Spanish has "ción" (as in "información") while Portuguese has "ção" (as in "informação"). Same Latin root, different evolution. This single trigram difference can distinguish the two languages even in a short phrase.

### Building Trigram Profiles

A trigram profile is a frequency vector: for each possible trigram, how often does it appear in a large corpus of that language? We normalize the counts so the vector has unit length (L2 norm = 1), which lets us use cosine similarity to compare.

```rust
use std::collections::HashMap;

/// A trigram frequency profile for a language.
/// Stored as a sparse vector (HashMap) since most possible trigrams
/// have zero frequency.
#[derive(Debug, Clone)]
pub struct TrigramProfile {
    /// Trigram -> normalized frequency (0.0 to 1.0)
    frequencies: HashMap<String, f64>,
}

/// Extract character trigrams from text.
///
/// Includes a space prefix and suffix to capture word boundaries:
/// " hello " -> [" he", "hel", "ell", "llo", "lo "]
fn extract_trigrams(text: &str) -> HashMap<String, usize> {
    let padded = format!(" {} ", text.to_lowercase());
    let chars: Vec<char> = padded.chars().collect();
    let mut counts: HashMap<String, usize> = HashMap::new();

    for window in chars.windows(3) {
        let trigram: String = window.iter().collect();
        *counts.entry(trigram).or_insert(0) += 1;
    }

    counts
}

impl TrigramProfile {
    /// Build a profile from a large text corpus.
    pub fn from_corpus(text: &str) -> Self {
        let counts = extract_trigrams(text);
        let total: f64 = counts.values().map(|&c| (c as f64).powi(2)).sum::<f64>().sqrt();

        let frequencies = if total > 0.0 {
            counts.into_iter()
                .map(|(trigram, count)| (trigram, count as f64 / total))
                .collect()
        } else {
            HashMap::new()
        };

        TrigramProfile { frequencies }
    }

    /// Build a profile from a short input text (for comparison).
    pub fn from_text(text: &str) -> Self {
        Self::from_corpus(text)
    }

    /// Cosine similarity between this profile and another.
    ///
    /// cos(A, B) = (A . B) / (|A| * |B|)
    ///
    /// Since both profiles are already L2-normalized, this simplifies to
    /// just the dot product.
    pub fn similarity(&self, other: &TrigramProfile) -> f64 {
        // Dot product of two sparse vectors: iterate over the smaller one,
        // look up each key in the larger one.
        let (smaller, larger) = if self.frequencies.len() <= other.frequencies.len() {
            (&self.frequencies, &other.frequencies)
        } else {
            (&other.frequencies, &self.frequencies)
        };

        smaller.iter()
            .filter_map(|(trigram, &freq_a)| {
                larger.get(trigram).map(|&freq_b| freq_a * freq_b)
            })
            .sum()
    }
}
```

### Cosine Similarity Explained

If you haven't seen cosine similarity before, here's the intuition. Imagine each trigram profile as a point in a very high-dimensional space (one dimension per possible trigram). Two profiles from the same language point in roughly the same direction. Two profiles from different languages point in different directions.

Cosine similarity measures the angle between two vectors:
- 1.0 = identical direction (same language)
- 0.0 = perpendicular (completely different)
- Values between 0.7-1.0 typically indicate the same language

```
                    English profile
                   /
                  /  angle = small
                 /   cos = high (~0.9)
                /
    origin ----+-----------> Spanish profile
                \
                 \  angle = medium
                  \ cos = medium (~0.6)
                   \
                    Portuguese profile
```

> **Python comparison:** In Python you'd use `numpy` for this: `np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))`. In Rust, we're doing it by hand with HashMaps as sparse vectors. The math is identical.

### Pre-built Language Profiles

In practice, you'd build trigram profiles from large corpora (Wikipedia dumps, news articles). For the course, we'll use representative sample texts. The key insight: you only need to build the reference profiles once, then compare each input text against them.

```rust
/// Build reference trigram profiles for each language.
///
/// In production, these would be pre-computed from large corpora
/// and loaded from disk. For now, we use representative samples.
pub fn reference_profiles() -> HashMap<Language, TrigramProfile> {
    let mut profiles = HashMap::new();

    profiles.insert(Language::English, TrigramProfile::from_corpus(
        "The quick brown fox jumps over the lazy dog. \
         It was the best of times, it was the worst of times. \
         To be or not to be, that is the question. \
         All human beings are born free and equal in dignity and rights. \
         They are endowed with reason and conscience and should act \
         towards one another in a spirit of brotherhood."
    ));

    profiles.insert(Language::Spanish, TrigramProfile::from_corpus(
        "El rápido zorro marrón salta sobre el perro perezoso. \
         Todos los seres humanos nacen libres e iguales en dignidad \
         y derechos. Dotados como están de razón y conciencia, deben \
         comportarse fraternalmente los unos con los otros. La educación \
         tendrá por objeto el pleno desarrollo de la personalidad humana."
    ));

    profiles.insert(Language::Portuguese, TrigramProfile::from_corpus(
        "O rápido raposo marrom salta sobre o cão preguiçoso. \
         Todos os seres humanos nascem livres e iguais em dignidade \
         e direitos. Dotados de razão e consciência, devem agir uns \
         para com os outros com espírito de fraternidade. A educação \
         terá por objetivo o pleno desenvolvimento da personalidade humana."
    ));

    profiles
}
```

### Integrating with Word-Frequency Detection

The trigram detector is a *fallback*, not a replacement. Use it when word-frequency detection isn't confident:

```rust
/// Detect language using word frequency first, trigram fallback second.
pub fn detect_language_with_fallback(text: &str) -> DetectionResult {
    // Try word frequency first
    let word_result = detect_language(text);
    if word_result.confident {
        return word_result;
    }

    // Fall back to trigram analysis
    let profiles = reference_profiles();
    let input_profile = TrigramProfile::from_text(text);

    let mut scores: Vec<(Language, f64)> = profiles.iter()
        .map(|(&lang, profile)| (lang, input_profile.similarity(profile)))
        .collect();

    scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());

    let best = scores[0].1;
    let second = if scores.len() > 1 { scores[1].1 } else { 0.0 };

    // Trigram confidence: best score > 0.3 and > 1.2x second
    let confident = best > 0.3 && (second == 0.0 || best / second > 1.2);

    DetectionResult {
        language: if confident { Some(scores[0].0) } else { None },
        scores,
        confident,
    }
}
```

### Your Turn: Distinguish Spanish from Portuguese

This is the hardest detection case. Write a test that verifies Lexicon can tell them apart on short phrases:

```rust
/// Test that trigram analysis can distinguish Spanish from Portuguese
/// on short phrases where word-frequency detection fails.
///
/// Key distinguishing patterns:
///   Spanish: "ción" (nación, educación), "llo" (caballo), "ñ" (español)
///   Portuguese: "ção" (nação, educação), "lh" (trabalho), "nh" (caminho)
///
/// Implement tests for these pairs:
///   "información importante" vs "informação importante"
///   "el niño pequeño" vs "o menino pequeno"
///   "corazón de la nación" vs "coração da nação"
///
/// Hint: if the reference profiles are too small to distinguish these,
/// you'll need to expand them with more representative text.
#[cfg(test)]
mod trigram_tests {
    use super::*;

    // YOUR TESTS HERE
    // Each test should verify that the trigram detector returns
    // the correct language for a short phrase.
}
```

### The Spanish-Portuguese Problem

Let's look at why these two languages are hard to distinguish and how trigrams help:

```
Spanish:  "información"  → trigrams: " in", "inf", "nfo", "for", "orm",
                                      "rma", "mac", "aci", "ció", "ión", "ón "
Portuguese: "informação"  → trigrams: " in", "inf", "nfo", "for", "orm",
                                      "rma", "maç", "açã", "ção", "ão "
```

The first 6 trigrams are identical! But then they diverge: "aci"/"ció"/"ión" vs "açã"/"ção"/"ão". The cedilla (ç) and the tilde (ã/õ) are strong Portuguese markers. The "ción" ending is a strong Spanish marker.

This is why trigrams work better than whole-word matching for short texts — even a single word contains enough character-level signal to distinguish the languages.

### Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trigram_extraction() {
        let trigrams = extract_trigrams("hello");
        // " hello " -> " he", "hel", "ell", "llo", "lo "
        assert_eq!(trigrams.get(" he"), Some(&1));
        assert_eq!(trigrams.get("hel"), Some(&1));
        assert_eq!(trigrams.get("ell"), Some(&1));
        assert_eq!(trigrams.get("llo"), Some(&1));
        assert_eq!(trigrams.get("lo "), Some(&1));
        assert_eq!(trigrams.len(), 5);
    }

    #[test]
    fn identical_texts_have_similarity_one() {
        let profile = TrigramProfile::from_text("hello world");
        let similarity = profile.similarity(&profile);
        assert!((similarity - 1.0).abs() < 0.001);
    }

    #[test]
    fn different_languages_have_lower_similarity() {
        let en = TrigramProfile::from_text("the quick brown fox jumps over");
        let es = TrigramProfile::from_text("el rápido zorro marrón salta sobre");

        let same = en.similarity(&en);
        let diff = en.similarity(&es);

        assert!(same > diff, "same-language similarity should be higher");
    }

    #[test]
    fn fallback_detects_short_spanish() {
        let result = detect_language_with_fallback("información importante");
        // Word frequency might not be confident, but trigrams should detect Spanish
        if let Some(lang) = result.language {
            assert_eq!(lang, Language::Spanish);
        }
        // At minimum, Spanish should score higher than Portuguese
        let es_score = result.scores.iter()
            .find(|(l, _)| *l == Language::Spanish)
            .map(|(_, s)| *s).unwrap_or(0.0);
        let pt_score = result.scores.iter()
            .find(|(l, _)| *l == Language::Portuguese)
            .map(|(_, s)| *s).unwrap_or(0.0);
        assert!(es_score > pt_score);
    }

    #[test]
    fn fallback_detects_short_portuguese() {
        let result = detect_language_with_fallback("informação importante");
        if let Some(lang) = result.language {
            assert_eq!(lang, Language::Portuguese);
        }
        let pt_score = result.scores.iter()
            .find(|(l, _)| *l == Language::Portuguese)
            .map(|(_, s)| *s).unwrap_or(0.0);
        let es_score = result.scores.iter()
            .find(|(l, _)| *l == Language::Spanish)
            .map(|(_, s)| *s).unwrap_or(0.0);
        assert!(pt_score > es_score);
    }
}
```

### Common Mistakes

**Not padding with spaces.** Without the space prefix/suffix, you miss word-boundary trigrams like `" th"` and `"he "`. These are some of the most discriminating trigrams.

**Using raw counts instead of normalized vectors.** A longer text has more trigrams, so raw counts aren't comparable across texts of different lengths. Normalize to unit vectors before computing cosine similarity.

**Building profiles from too-small corpora.** If your reference English profile is built from "the cat sat on the mat", it won't have enough trigram diversity to distinguish from other languages. Use at least a few hundred words per language.

**Confusing L1 and L2 normalization.** L1 normalization (divide by sum) gives a probability distribution. L2 normalization (divide by Euclidean norm) gives a unit vector for cosine similarity. We want L2 here.

With two-tier language detection in place — word frequency for long texts, trigrams for short ones — Lexicon can identify the language of almost any input. But detection is only half the multi-language story. Stage 31 ensures that custom dictionaries respect language boundaries, so "servidor" doesn't leak from Spanish into English.

### What Changed

Lexicon now has a two-tier language detection system. Word frequency handles long texts with high accuracy. Trigram analysis handles short texts and the tricky Spanish-Portuguese distinction. The `detect_language_with_fallback()` function tries word frequency first and falls back to trigrams when confidence is low.

---

## Stage 31 — Custom Dictionary per Language

A single custom dictionary shared across all languages is a cross-contamination risk. "Embarazada" means "pregnant" in Spanish — adding it to a universal dictionary would make Lexicon accept it in English text, where it doesn't belong. Per-language custom dictionaries enforce the same boundaries that separate the standard dictionaries, while a universal tier handles true cognates like "kubernetes" that transcend language. This stage also introduces false friends and cognates — the linguistic concepts that make multi-language spell checking genuinely tricky.

*Difficulty: Easy* | *New concepts: language-tagged data, cognates, false friends*

### The Problem with One Custom Dictionary

In Stage 25, we built a single custom dictionary at `~/.lexicon/custom.dict`. But with multiple languages, a single list creates problems:

- You add "servidor" (Spanish for "server") to your custom dictionary
- Now Lexicon accepts "servidor" when checking an English document
- That's wrong — "servidor" isn't an English word

We need per-language custom dictionaries.

### Language-Tagged Custom Words

The simplest approach: one file per language, plus a "universal" file for words valid in all languages:

```
~/.lexicon/
  custom.dict          # universal — valid in all languages
  custom.en.dict       # English-only custom words
  custom.es.dict       # Spanish-only custom words
  custom.pt.dict       # Portuguese-only custom words
```

Update the loading logic:

```rust
/// Load custom words for a specific language.
///
/// Loads from three sources (in order):
/// 1. Universal custom dict (~/.lexicon/custom.dict)
/// 2. Language-specific custom dict (~/.lexicon/custom.{lang}.dict)
/// 3. Project-level dict (.lexicon) — always universal
pub fn load_custom_words_for_language(lang: Language) -> HashSet<String> {
    let mut words = HashSet::new();

    // Universal
    words.extend(load_word_file(&global_custom_dict_path()));

    // Language-specific
    let lang_path = lexicon_dir().join(format!("custom.{}.dict", lang.code()));
    words.extend(load_word_file(&lang_path));

    // Project-level (universal)
    words.extend(load_word_file(&project_custom_dict_path()));

    words
}
```

Update the `dict add` command to accept an optional language:

```rust
// In the DictAction enum:
/// Add a word to the custom dictionary
Add {
    /// Word to add
    word: String,
    /// Language to tag the word with (omit for universal)
    #[arg(short, long)]
    lang: Option<Language>,
},

// In the handler:
DictAction::Add { word, lang } => {
    let path = match lang {
        Some(l) => lexicon_dir().join(format!("custom.{}.dict", l.code())),
        None => global_custom_dict_path(),
    };
    add_word_to_file(&path, &word)?;
}
```

### False Friends: A Language Learning Moment

This is a great place to talk about **false friends** (falsos amigos) — words that look similar across languages but mean different things. They're the reason per-language dictionaries matter:

| Word | English | Spanish | Portuguese |
|------|---------|---------|------------|
| embarazada | — | pregnant | grávida |
| constipado | constipated | has a cold | constipado (cold) |
| éxito | exit | success | êxito (success) |
| sensible | sensible | sensitive | sensível (sensitive) |
| actual | actual | current | atual (current) |
| pretender | pretend | to intend | pretender (to intend) |

If "embarazada" is in a universal custom dictionary, Lexicon would accept it in an English document — where it doesn't belong. With per-language dictionaries, you'd add it to `custom.es.dict` only.

### Cognates: Words That Are Friends

The flip side of false friends: **cognates** are words that look similar AND mean the same thing across languages. These are safe to put in the universal dictionary:

```
animal      — same in en/es/pt
hospital    — same in en/es/pt
chocolate   — same in en/es/pt
idea        — same in en/es/pt
normal      — same in en/es/pt
```

### Your Turn: The `dict` Command Enhancements

Implement these improvements to the dictionary management commands:

```rust
/// Enhanced dict list that shows per-language word counts.
///
/// Output:
///   Custom dictionaries:
///     Universal:   47 words  (~/.lexicon/custom.dict)
///     English:     12 words  (~/.lexicon/custom.en.dict)
///     Spanish:      8 words  (~/.lexicon/custom.es.dict)
///     Portuguese:   3 words  (~/.lexicon/custom.pt.dict)
///     Project:     15 words  (.lexicon)
///
///   Total: 85 custom words
pub fn list_custom_dictionaries() -> anyhow::Result<()> {
    // YOUR IMPLEMENTATION HERE
    todo!()
}

/// Check if a word is a known cognate (exists in all three language dictionaries).
///
/// This is useful for suggesting whether a custom word should be added
/// universally or to a specific language.
///
/// Hint: check the word against each language's Checker.
/// If it's valid in all three, it's a cognate.
pub fn is_cognate(word: &str, multi_checker: &MultiChecker) -> bool {
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
    fn language_specific_custom_words() {
        let tmp = tempfile::TempDir::new().unwrap();

        // Create universal and language-specific dicts
        let universal = tmp.path().join("custom.dict");
        let english = tmp.path().join("custom.en.dict");
        let spanish = tmp.path().join("custom.es.dict");

        std::fs::write(&universal, "kubernetes\ntokio\n").unwrap();
        std::fs::write(&english, "async\nawait\n").unwrap();
        std::fs::write(&spanish, "servidor\n").unwrap();

        // Load for English — should include universal + english
        // (In real code, you'd parameterize the base directory)
        let en_words = load_word_file(&universal)
            .into_iter()
            .chain(load_word_file(&english))
            .collect::<HashSet<_>>();

        assert!(en_words.contains("kubernetes")); // universal
        assert!(en_words.contains("async"));      // english-specific
        assert!(!en_words.contains("servidor"));   // spanish-only

        // Load for Spanish — should include universal + spanish
        let es_words = load_word_file(&universal)
            .into_iter()
            .chain(load_word_file(&spanish))
            .collect::<HashSet<_>>();

        assert!(es_words.contains("kubernetes")); // universal
        assert!(es_words.contains("servidor"));   // spanish-specific
        assert!(!es_words.contains("async"));     // english-only
    }

    #[test]
    fn false_friends_not_cross_contaminated() {
        // "embarazada" should only be valid in Spanish context
        let es_words: HashSet<String> = ["embarazada".to_string()].into();
        let en_words: HashSet<String> = HashSet::new();

        assert!(es_words.contains("embarazada"));
        assert!(!en_words.contains("embarazada"));
    }
}
```

### Common Mistakes

**Defaulting to universal when the user probably means language-specific.** If the user runs `lexicon dict add servidor` while checking a Spanish file, it might make sense to default to the detected language rather than universal. But this is a UX decision — for now, require the explicit `--lang` flag.

**Not normalizing language-specific custom words.** Same as Stage 25 — always NFC-normalize and lowercase before storing and comparing.

Per-language custom dictionaries close the last gap in Lexicon's multi-language support. The system is feature-complete. Stage 32 puts it all through a grand benchmark — loading all three dictionaries, detecting languages, checking mixed-language text, and measuring every metric against the spec targets.

### What Changed

Custom dictionaries are now language-aware. Technical terms like "kubernetes" go in the universal dictionary. Language-specific terms like "servidor" go in `custom.es.dict`. False friends can't leak across language boundaries.

---

## Stage 32 — The Grand Benchmark

This is the capstone. Every component you've built across five acts — trie, bloom filter, BK-tree, tokenizer, checker, CLI, language detection, custom dictionaries — gets exercised in a single end-to-end benchmark. The grand benchmark isn't just a performance test; it's a proof of completeness. If every phase passes, you've built a real, working, multi-language spell checker from scratch.

*Difficulty: Medium* | *New concepts: multi-language benchmarking, mixed-language documents, comprehensive performance reporting*

### The Final Test

This is the capstone stage. `lexicon bench` now exercises the entire system: load all three dictionaries, detect the language of a mixed-language document, check every word, and report comprehensive statistics.

### Building the Benchmark Document

Create a test document that exercises all the edge cases:

```rust
/// Generate a mixed-language benchmark document.
///
/// Contains:
/// - English paragraphs with common misspellings
/// - Spanish paragraphs with accent-related errors
/// - Portuguese paragraphs with cedilla/tilde errors
/// - Mixed-language sentences
/// - Technical terms (should be in custom dict)
/// - Numbers, punctuation, contractions
fn generate_benchmark_document() -> String {
    let mut doc = String::new();

    // English section (~3000 words)
    doc.push_str("# Project Documentation\n\n");
    doc.push_str(
        "The quick brown fox jumps over the lazy dog. This sentence contains \
         every letter of the English alphabet. It is commonly used for testing \
         purposes in software development and typography.\n\n"
    );
    doc.push_str(
        "The development team has been working on several improvements to the \
         system. Performance optimizations have reduced latency by approximately \
         forty percent. The new caching layer handles thousands of requests per \
         second without any degradation in response quality.\n\n"
    );

    // Spanish section (~3000 words)
    doc.push_str("## Documentación en Español\n\n");
    doc.push_str(
        "El equipo de desarrollo ha estado trabajando en varias mejoras del \
         sistema. Las optimizaciones de rendimiento han reducido la latencia \
         en aproximadamente un cuarenta por ciento. La nueva capa de caché \
         maneja miles de solicitudes por segundo.\n\n"
    );

    // Portuguese section (~3000 words)
    doc.push_str("## Documentação em Português\n\n");
    doc.push_str(
        "A equipe de desenvolvimento tem trabalhado em várias melhorias do \
         sistema. As otimizações de desempenho reduziram a latência em \
         aproximadamente quarenta por cento. A nova camada de cache lida \
         com milhares de solicitações por segundo.\n\n"
    );

    // Mixed-language section
    doc.push_str("## Mixed Language Notes\n\n");
    doc.push_str(
        "I went to the tienda to buy some pão de queijo. The señora at the \
         counter said \"obrigado\" which I think means thank you in Portuguese. \
         My friend corrected me — in Spanish you say \"gracias\" instead.\n\n"
    );

    doc
}
```

### The Grand Benchmark Command

```rust
pub fn run_grand_bench(file: Option<&Path>) -> anyhow::Result<()> {
    println!("=== Lexicon Grand Benchmark ===\n");

    // Phase 1: Dictionary Loading
    println!("Phase 1: Dictionary Loading");
    println!("{}", "-".repeat(40));

    let mut load_times: Vec<(Language, std::time::Duration, usize)> = Vec::new();

    for &lang in Language::all() {
        let start = Instant::now();
        let words = load_dictionary(lang)?;
        let elapsed = start.elapsed();
        let count = words.len();
        load_times.push((lang, elapsed, count));
        println!("  {} {:>8} words in {:>6.1?}", lang.code(), count, elapsed);
    }

    let total_load: std::time::Duration = load_times.iter().map(|(_, d, _)| *d).sum();
    let total_words: usize = load_times.iter().map(|(_, _, c)| *c).sum();
    println!("  Total: {} words in {:.1?}\n", total_words, total_load);

    // Phase 2: Build MultiChecker
    println!("Phase 2: Build MultiChecker");
    println!("{}", "-".repeat(40));

    let start = Instant::now();
    let multi_checker = build_multi_checker(None, 2)?;
    let build_time = start.elapsed();
    println!("  Built in {:.1?}\n", build_time);

    // Phase 3: Language Detection
    let text = match file {
        Some(f) => std::fs::read_to_string(f)?,
        None => generate_benchmark_document(),
    };

    println!("Phase 3: Language Detection");
    println!("{}", "-".repeat(40));

    let start = Instant::now();
    let detection = detect_language_with_fallback(&text);
    let detect_time = start.elapsed();

    println!("  Detected: {:?} in {:.1?}", detection.language, detect_time);
    for (lang, score) in &detection.scores {
        println!("    {} {:.1}%", lang.code(), score * 100.0);
    }
    println!();

    // Phase 4: Check Throughput
    println!("Phase 4: Check Throughput");
    println!("{}", "-".repeat(40));

    let tokens = crate::tokenizer::tokenize_document(&text);
    let checkable: Vec<_> = tokens.iter()
        .filter(|t| is_checkable(&t.token))
        .collect();

    let word_count = checkable.len();

    let start = Instant::now();
    let mut correct = 0usize;
    let mut misspelled = 0usize;

    for token in &checkable {
        let (result, _) = multi_checker.check_word_any_language(&token.token.word);
        match result {
            CheckResult::Correct => correct += 1,
            CheckResult::Misspelled { .. } => misspelled += 1,
        }
    }
    let check_time = start.elapsed();

    println!("  {} words checked in {:.2?}", word_count, check_time);
    println!("  {:.0} words/second",
             word_count as f64 / check_time.as_secs_f64());
    println!("  {} correct, {} misspelled ({:.1}%)\n",
             correct, misspelled,
             (misspelled as f64 / word_count as f64) * 100.0);

    // Phase 5: Suggestion Latency
    println!("Phase 5: Suggestion Latency");
    println!("{}", "-".repeat(40));

    let test_words = ["recieve", "definately", "seperate",
                      "informacion", "educacion", "comunicacao"];

    for word in &test_words {
        let start = Instant::now();
        let (result, _) = multi_checker.check_word_any_language(word);
        let elapsed = start.elapsed();

        let suggestion_str = match result {
            CheckResult::Misspelled { suggestions } => {
                suggestions.iter().take(3)
                    .map(|s| format!("{} (d={})", s.word, s.distance))
                    .collect::<Vec<_>>()
                    .join(", ")
            }
            CheckResult::Correct => "correct!".to_string(),
        };

        println!("  \"{}\" -> {} [{:.2?}]", word, suggestion_str, elapsed);
    }
    println!();

    // Phase 6: Targets
    println!("Phase 6: Target Assessment");
    println!("{}", "-".repeat(40));

    let targets = [
        ("Dict load (all) < 1.5s", total_load.as_secs_f64() < 1.5),
        ("Build checker < 2s", build_time.as_secs_f64() < 2.0),
        ("10k words < 1s",
         check_time.as_secs_f64() < (word_count as f64 / 10_000.0)),
        ("Detection < 10ms", detect_time.as_secs_f64() < 0.01),
    ];

    let mut all_pass = true;
    for (name, passed) in &targets {
        let status = if *passed { "PASS" } else { all_pass = false; "FAIL" };
        println!("  [{}] {}", status, name);
    }

    println!("\n{}", if all_pass {
        "All targets met!"
    } else {
        "Some targets missed — see optimization checklist in Stage 27."
    });

    Ok(())
}
```

### Your Turn: Memory Usage Report

Add a memory usage section to the benchmark:

```rust
/// Estimate memory usage of the MultiChecker.
///
/// For each language, report:
///   - Trie: approximate node count * size_of::<TrieNode>()
///   - Bloom filter: bit array size in bytes
///   - BK-tree: approximate node count * size_of::<BKNode>()
///
/// Hint: add a `memory_estimate(&self) -> usize` method to each
/// data structure. For the trie, count nodes recursively.
/// For the bloom filter, it's just `bits.len() * 8`.
/// For the BK-tree, count nodes recursively.
///
/// Print a table:
///   Memory Usage:
///     Language  Trie      Bloom    BK-Tree   Total
///     en        12.3 MB   351 KB   8.7 MB    21.3 MB
///     es         8.1 MB   234 KB   5.8 MB    14.1 MB
///     pt         9.4 MB   293 KB   6.9 MB    16.6 MB
///     Total:    29.8 MB   878 KB  21.4 MB    52.0 MB
pub fn report_memory_usage(multi_checker: &MultiChecker) {
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
    fn benchmark_document_is_substantial() {
        let doc = generate_benchmark_document();
        let tokens = crate::tokenizer::tokenize_document(&doc);
        let checkable: Vec<_> = tokens.iter()
            .filter(|t| is_checkable(&t.token))
            .collect();

        // Should have a meaningful number of words
        assert!(checkable.len() > 100,
                "benchmark doc only has {} words", checkable.len());
    }

    #[test]
    fn benchmark_document_is_multilingual() {
        let doc = generate_benchmark_document();

        // Should contain words from all three languages
        assert!(doc.contains("development")); // English
        assert!(doc.contains("desarrollo"));  // Spanish
        assert!(doc.contains("desenvolvimento")); // Portuguese
    }

    #[test]
    fn cross_language_suggestions_work() {
        let mc = build_test_multi_checker();

        // "recive" should get suggestions from English ("receive")
        // and possibly Spanish ("recibir") and Portuguese ("receber")
        let (result, _) = mc.check_word_any_language("recive");
        if let CheckResult::Misspelled { suggestions } = result {
            assert!(!suggestions.is_empty(),
                    "should have cross-language suggestions");
        }
    }
}
```

### Common Mistakes

**Not warming up before benchmarking.** The first dictionary load includes file system cache misses. Run the load twice and report the second time, or report both cold and warm times.

**Comparing wall-clock times across different machines.** Benchmark results depend on CPU, memory speed, and system load. Report relative numbers (words/second) rather than absolute times when comparing.

**Forgetting to use `--release` mode.** Debug builds are 10-50x slower. Always benchmark with `cargo run --release -- bench`.

The grand benchmark is both a validation and a celebration. Every number it reports traces back to a data structure you built by hand, an algorithm you derived from first principles, or a design decision you made with intention.

### What Changed

The grand benchmark exercises every component of Lexicon: dictionary loading, language detection, multi-language checking, and suggestion generation. It reports throughput, latency percentiles, and pass/fail against spec targets. This is your proof that the system works — and your baseline for future optimization.

---

## Act 5 Summary

| Stage | What you built | Key concept |
|-------|---------------|-------------|
| 28 | Multi-language dictionaries | HashMap of checkers, shared words, deduplication |
| 29 | Language detection | Word frequency overlap, function words, confidence thresholds |
| 30 | Trigram fallback | Character n-grams, cosine similarity, sparse vectors |
| 31 | Per-language custom dict | Language-tagged data, false friends, cognates |
| 32 | Grand benchmark | End-to-end performance, multi-language throughput |

**Lexicon can now:**
- Load English, Spanish, and Portuguese dictionaries simultaneously
- Auto-detect the language of a document (word frequency + trigram fallback)
- Check words against the correct language's dictionary
- Handle mixed-language text by checking against all loaded languages
- Manage per-language custom dictionaries
- Benchmark the entire system with comprehensive statistics

**The complete Lexicon feature set (Acts 1-5):**
- Hand-built trie, bloom filter, and BK-tree
- Levenshtein edit distance with early termination
- Unicode-aware tokenization (NFC, grapheme clusters, UAX#29)
- Full CLI with clap (check, suggest, detect, dict, interactive, bench)
- Interactive TUI mode with crossterm
- Multi-language support (en/es/pt)
- Language detection (word frequency + trigram cosine similarity)
- Custom dictionaries (global, per-language, per-project)
- Performance meeting spec targets (10k words/sec, <10ms suggestions)

---

## What's Next?

Lexicon is complete as specified. But there's always more to build. Here are stretch goals if you want to keep going:

**Damerau-Levenshtein distance** — Add transposition as a fourth edit operation. "teh" → "the" becomes distance 1 instead of 2. Requires tracking two previous rows in the DP matrix.

**Markdown/code awareness** — Skip code blocks, URLs, and email addresses when checking. Parse markdown fences and inline code spans.

**Dictionary caching with bincode** — Serialize compiled tries to disk. Cut cold-start from 500ms to 50ms.

**Compressed trie (radix tree)** — Collapse single-child chains. Reduce memory by 40-60%.

**LSP server** — Expose Lexicon as a Language Server Protocol backend. Get spell checking in VS Code, Neovim, or any LSP-compatible editor.

**WASM build** — Compile to WebAssembly for a browser-based demo. The entire engine runs client-side.

Each of these is a substantial project that teaches new Rust concepts. But the foundation you've built — the data structures, the pipeline, the CLI, the multi-language support — is solid enough to support any of them.

*Congratulations. You've built a real spell checker from scratch. Every trie node, every bloom filter bit, every BK-tree traversal — you wrote it. That's not something most developers can say.*
