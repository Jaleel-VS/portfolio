# Lexicon Reference Guide

A standalone reference for the Rust Lexicon course. Consult this while building
your CLI spell checker. Not a tutorial — a lookup tool.

---

## 1. Data Structure Comparison Table

```
┌──────────────┬──────────────────┬──────────────────┬──────────────────┬──────────────────┐
│              │      TRIE        │    HASH MAP      │  BLOOM FILTER    │     BK-TREE      │
├──────────────┼──────────────────┼──────────────────┼──────────────────┼──────────────────┤
│ Also called  │ Prefix tree,     │ Hash table,      │ Probabilistic    │ Burkhard-Keller  │
│              │ digital tree     │ dictionary       │ set membership   │ tree             │
├──────────────┼──────────────────┼──────────────────┼──────────────────┼──────────────────┤
│ Operations   │ insert           │ insert           │ insert           │ insert           │
│              │ contains         │ contains         │ query            │ fuzzy search     │
│              │ prefix_search    │ get/set          │ (no delete)      │                  │
│              │ remove           │ delete           │ (no iteration)   │                  │
│              │ autocomplete     │ iterate          │                  │                  │
├──────────────┼──────────────────┼──────────────────┼──────────────────┼──────────────────┤
│ Insert       │ O(m)             │ O(m) avg         │ O(k)             │ O(m × n) *       │
│              │ m = word length  │ O(m) for hashing │ k = num hashes   │ n = depth walk   │
├──────────────┼──────────────────┼──────────────────┼──────────────────┼──────────────────┤
│ Lookup       │ O(m)             │ O(m) avg         │ O(k)             │ N/A (fuzzy only) │
│ (exact)      │                  │ O(n) worst       │                  │                  │
├──────────────┼──────────────────┼──────────────────┼──────────────────┼──────────────────┤
│ Fuzzy search │ Not built-in     │ O(n × m × q) **  │ Not supported    │ O(n^α × m × q)   │
│              │                  │ (scan all keys)  │                  │ α ≈ 0.6-0.8      │
├──────────────┼──────────────────┼──────────────────┼──────────────────┼──────────────────┤
│ Prefix       │ O(p + k)         │ O(n) scan all    │ Not supported    │ Not supported    │
│ search       │ p=prefix, k=hits │                  │                  │                  │
├──────────────┼──────────────────┼──────────────────┼──────────────────┼──────────────────┤
│ Space        │ O(n × m × C)     │ O(n × m)         │ O(m) bits        │ O(n × m)         │
│ complexity   │ C = child-map    │                  │ m ≈ 10n bits     │ + edge map       │
│              │ overhead         │                  │ for 1% FP        │                  │
├──────────────┼──────────────────┼──────────────────┼──────────────────┼──────────────────┤
│ Memory       │ ~25-40 MB        │ ~15-20 MB        │ ~351 KB          │ ~20-30 MB        │
│ (300k words) │ (HashMap nodes)  │                  │ (at 1% FP)       │                  │
├──────────────┼──────────────────┼──────────────────┼──────────────────┼──────────────────┤
│ Role in      │ Exact dictionary │ (Not used —      │ Fast rejection   │ Fuzzy suggestion │
│ Lexicon      │ lookup           │ trie chosen      │ of non-words     │ engine           │
│              │                  │ for prefix       │ before trie      │                  │
│              │                  │ support)         │                  │                  │
├──────────────┼──────────────────┼──────────────────┼──────────────────┼──────────────────┤
│ Strengths    │ • Prefix queries │ • Simple API     │ • Tiny memory    │ • Sub-linear     │
│              │ • No hash collis.│ • Fast avg case  │ • O(k) query     │   fuzzy search   │
│              │ • Sorted iter    │ • Flexible value │ • No false neg   │ • Triangle ineq  │
│              │ • Shared prefix  │   storage        │ • Cache-friendly │   pruning        │
│              │   compression    │                  │                  │                  │
├──────────────┼──────────────────┼──────────────────┼──────────────────┼──────────────────┤
│ Weaknesses   │ • High memory    │ • No prefix      │ • False positive │ • Build is slow  │
│              │   per node       │   queries        │ • No delete      │   (all-pairs     │
│              │ • Cache-         │ • No ordering    │ • No iteration   │   Levenshtein)   │
│              │   unfriendly     │ • Hash collisions│ • Can't retrieve │ • Unbalanced     │
│              │ • Complex impl   │                  │   stored items   │ • Insert order    │
│              │                  │                  │                  │   matters        │
└──────────────┴──────────────────┴──────────────────┴──────────────────┴──────────────────┘

 * BK-tree insert: compute Levenshtein to current node, walk down matching edge
** HashMap fuzzy: must compare query against every key — no pruning possible
```

**Why Lexicon uses all three together:**

```
  Token arrives
       │
       ▼
  ┌──────────┐  "definitely not"   DONE
  │  Bloom   │ ──────────────────► (report misspelled,
  │  Filter  │                      no trie cost)
  └────┬─────┘
       │ "maybe"
       ▼
  ┌──────────┐  "found"            DONE
  │   Trie   │ ──────────────────► (word is correct)
  └────┬─────┘
       │ "not found"
       ▼
  ┌──────────┐
  │ BK-Tree  │ ──────────────────► ranked suggestions
  └──────────┘
```

- Bloom filter: O(k) to reject ~99% of misspelled words without touching the trie
- Trie: O(m) exact lookup for the remaining candidates
- BK-tree: O(n^α × m × q) fuzzy search only when a word is actually misspelled


---

## 2. Big-O Reference

All operations you implement in this course, with their complexities.

**Variables:**
- m = length of word (in characters)
- n = number of words in dictionary
- k = number of hash functions (bloom filter)
- p = prefix length
- r = number of results
- d = max edit distance threshold
- q = length of query word

### Trie Operations

```
┌───────────────────┬───────────┬───────────┬─────────────────────────────────┐
│ Operation         │ Time      │ Space     │ Notes                           │
├───────────────────┼───────────┼───────────┼─────────────────────────────────┤
│ insert(word)      │ O(m)      │ O(m)      │ One node per char (worst case)  │
│ contains(word)    │ O(m)      │ O(1)      │ Walk down, check is_word        │
│ prefix_search(p)  │ O(p + r)  │ O(r)      │ Walk to prefix, collect subtree │
│ remove(word)      │ O(m)      │ O(1)      │ Set is_word = false             │
│ build(n words)    │ O(n × m̄)  │ O(n × m̄)  │ m̄ = average word length         │
└───────────────────┴───────────┴───────────┴─────────────────────────────────┘
```

### Bloom Filter Operations

```
┌───────────────────┬───────────┬───────────┬─────────────────────────────────┐
│ Operation         │ Time      │ Space     │ Notes                           │
├───────────────────┼───────────┼───────────┼─────────────────────────────────┤
│ insert(word)      │ O(k)      │ O(1)      │ Set k bits. k=7 for 1% FP      │
│ query(word)       │ O(k)      │ O(1)      │ Check k bits. ~1μs in practice  │
│ build(n words)    │ O(n × k)  │ O(m bits) │ m ≈ 10n for 1% FP rate         │
└───────────────────┴───────────┴───────────┴─────────────────────────────────┘
```

Note: k is typically 7-10, so bloom filter ops are effectively O(1).

### Levenshtein Distance

```
┌───────────────────┬───────────┬───────────┬─────────────────────────────────┐
│ Variant           │ Time      │ Space     │ Notes                           │
├───────────────────┼───────────┼───────────┼─────────────────────────────────┤
│ Full matrix       │ O(m × q)  │ O(m × q)  │ Textbook DP, useful for debug   │
│ Space-optimized   │ O(m × q)  │ O(min(m,q)│ Two-row trick, same time        │
│ Early termination │ O(m × d)  │ O(min(m,q)│ Abort when row min > threshold  │
│                   │ best case │           │ Huge win for d << m             │
│ Damerau-Lev.      │ O(m × q)  │ O(m × q)  │ Adds transposition operation    │
└───────────────────┴───────────┴───────────┴─────────────────────────────────┘
```

### BK-Tree Operations

```
┌───────────────────┬────────────────┬───────────┬──────────────────────────────┐
│ Operation         │ Time           │ Space     │ Notes                        │
├───────────────────┼────────────────┼───────────┼──────────────────────────────┤
│ insert(word)      │ O(h × m)       │ O(1)      │ h = tree height, 1 Lev calc  │
│                   │                │           │ per level                    │
│ fuzzy_search      │ O(n^α × m × q)│ O(d)      │ α ≈ 0.6-0.8 depending on d  │
│ (query, d)        │                │ (stack)   │ d=1: ~2% nodes, d=2: ~7%    │
│ build(n words)    │ O(n × h × m)   │ O(n × m)  │ Insert each word             │
└───────────────────┴────────────────┴───────────┴──────────────────────────────┘
```

### Other Operations

```
┌───────────────────────────┬───────────┬───────────┬──────────────────────────┐
│ Operation                 │ Time      │ Space     │ Notes                    │
├───────────────────────────┼───────────┼───────────┼──────────────────────────┤
│ Tokenize text             │ O(t)      │ O(t)      │ t = text length          │
│ Unicode NFC normalize     │ O(t)      │ O(t)      │ Per-token                │
│ Case fold                 │ O(m)      │ O(m)      │ Per-word, locale-aware   │
│ Language detect (freq)    │ O(w)      │ O(1)      │ w = word count in text   │
│ Language detect (trigram)  │ O(t)      │ O(1)      │ Cosine similarity        │
│ FNV-1a hash               │ O(m)      │ O(1)      │ Byte-at-a-time           │
│ Murmur3 hash              │ O(m)      │ O(1)      │ 4-byte blocks            │
│ Dictionary load (cold)    │ O(n × m̄)  │ O(n × m̄)  │ Parse + build structures │
│ Dictionary load (cached)  │ O(n)      │ O(n × m̄)  │ Bincode deserialization  │
│ Full check pipeline       │ O(w × m̄)  │ O(n × m̄)  │ Per-word: bloom→trie     │
│ (no suggestions)          │           │           │                          │
└───────────────────────────┴───────────┴───────────┴──────────────────────────┘
```


---

## 3. Bloom Filter Math Cheat Sheet

### Variables

```
n = number of items to store (words in dictionary)
m = number of bits in the filter
k = number of hash functions
p = desired false positive probability (e.g., 0.01 for 1%)
e = Euler's number ≈ 2.71828
```

### Core Formulas

**False positive probability (given m, n, k):**

```
p = (1 - e^(-kn/m))^k
```

Read as: the probability that all k hash positions are already set to 1
by other items, causing a false "yes" for an item not in the set.

**Optimal number of hash functions (given m, n):**

```
k_opt = (m / n) × ln(2)
      ≈ 0.6931 × (m / n)
```

**Optimal bit array size (given n, p):**

```
m_opt = -(n × ln(p)) / (ln(2))²
      = -(n × ln(p)) / 0.4805
```

**Fill ratio (fraction of bits set to 1 after n insertions):**

```
ρ = 1 - (1 - 1/m)^(kn)
  ≈ 1 - e^(-kn/m)
```

At optimal k, the fill ratio converges to 50% — half the bits are 1.

**Bits per element (at optimal k):**

```
m/n = -ln(p) / (ln(2))²
    = -1.4427 × ln(p)
```

### Deriving Optimal k (Step by Step)

Goal: minimize p = (1 - e^(-kn/m))^k with respect to k.

```
Step 1: Let f = kn/m (the "fullness" parameter)
        p = (1 - e^(-f))^k

Step 2: Take ln of both sides:
        ln(p) = k × ln(1 - e^(-f))

Step 3: Substitute f = kn/m, so k = fm/n:
        ln(p) = (fm/n) × ln(1 - e^(-f))

Step 4: To minimize p, minimize ln(p).
        Take derivative with respect to f, set to 0.

Step 5: The minimum occurs when:
        e^(-f) = 1/2
        f = ln(2) ≈ 0.6931

Step 6: Since f = kn/m:
        kn/m = ln(2)
        k = (m/n) × ln(2)  ◄── optimal k
```

### Deriving Optimal m (Step by Step)

Goal: find m such that p equals the target, using optimal k.

```
Step 1: At optimal k, the false positive rate simplifies to:
        p = (1/2)^k = (1/2)^((m/n) × ln(2))

Step 2: Take ln of both sides:
        ln(p) = (m/n) × ln(2) × ln(1/2)
              = (m/n) × ln(2) × (-ln(2))
              = -(m/n) × (ln(2))²

Step 3: Solve for m:
        m = -n × ln(p) / (ln(2))²  ◄── optimal m
```

### Sizing Table

```
┌─────────────┬───────────┬────────────┬──────────┬──────────┬──────────┐
│ Dict size   │ Target FP │ Bits (m)   │ Hashes   │ Bits per │ Memory   │
│ (n)         │ rate (p)  │            │ (k)      │ element  │          │
├─────────────┼───────────┼────────────┼──────────┼──────────┼──────────┤
│ 100,000     │ 1%        │ 958,506    │ 7        │ 9.6      │ 117 KB   │
│ 300,000     │ 1%        │ 2,875,518  │ 7        │ 9.6      │ 351 KB   │
│ 300,000     │ 0.1%      │ 4,313,277  │ 10       │ 14.4     │ 527 KB   │
│ 500,000     │ 1%        │ 4,792,530  │ 7        │ 9.6      │ 586 KB   │
└─────────────┴───────────┴────────────┴──────────┴──────────┴──────────┘

Memory = m / 8 bytes (bit array packed into bytes)
```

### Worked Example: 300k Words at 1% FP Rate

```
Given:  n = 300,000    p = 0.01

Step 1 — Compute optimal m:
  m = -(300,000 × ln(0.01)) / (ln(2))²
  m = -(300,000 × (-4.6052)) / (0.6931)²
  m = 1,381,551 / 0.4805
  m = 2,875,518 bits
  m = 359,440 bytes ≈ 351 KB

Step 2 — Compute optimal k:
  k = (m / n) × ln(2)
  k = (2,875,518 / 300,000) × 0.6931
  k = 9.585 × 0.6931
  k = 6.64 → round to 7

Step 3 — Verify false positive rate:
  p = (1 - e^(-7 × 300,000 / 2,875,518))^7
  p = (1 - e^(-0.7304))^7
  p = (1 - 0.4816)^7
  p = (0.5184)^7
  p = 0.0099 ≈ 1%  ✓

Step 4 — Check fill ratio:
  ρ = 1 - e^(-kn/m)
  ρ = 1 - e^(-0.7304)
  ρ = 1 - 0.4816
  ρ = 0.5184 ≈ 52%  (close to the optimal 50%)

Summary:
  • 351 KB of memory to pre-screen 300,000 words
  • 7 hash computations per query (~1μs)
  • 1 in 100 misspelled words will falsely pass → checked by trie
  • 99 in 100 misspelled words rejected without touching the trie
```

### Double Hashing Scheme

Instead of computing k independent hash functions, derive them from two base hashes:

```
h_i(x) = (h1(x) + i × h2(x)) mod m     for i = 0, 1, ..., k-1

Where:
  h1 = FNV-1a(word)     ~10 lines of Rust
  h2 = murmur3(word)    ~30 lines of Rust
```

This gives k hash values from just 2 hash computations. Proven to have
the same asymptotic false positive rate as k independent hash functions
(Kirsch & Mitzenmacher, 2006).


---

## 4. Levenshtein DP Walkthrough

### The Three Operations

```
Given source word "A" and target word "B":

  Insertion:    A = "cat"   → B = "cats"     cost 1  (insert 's')
  Deletion:     A = "cats"  → B = "cat"      cost 1  (delete 's')
  Substitution: A = "cat"   → B = "car"      cost 1  (replace 't' with 'r')

In the DP matrix:
  dp[i-1][j]   + 1  = deletion    (skip a char in source)
  dp[i][j-1]   + 1  = insertion   (skip a char in target)
  dp[i-1][j-1] + c  = substitution (c=0 if match, c=1 if mismatch)
```

### Full Matrix: "recivir" → "recibir"

Source (misspelled): r e c i v i r  (length 7)
Target (correct):    r e c i b i r  (length 7)

The only difference is position 5: 'v' vs 'b'. Expected distance: 1.

```
        ""  r   e   c   i   b   i   r       ← target: "recibir"
    ┌────┬────┬────┬────┬────┬────┬────┬────┐
 "" │  0 │  1 │  2 │  3 │  4 │  5 │  6 │  7 │  ← base case: inserting
    ├────┼────┼────┼────┼────┼────┼────┼────┤     from empty string
  r │  1 │  0 │  1 │  2 │  3 │  4 │  5 │  6 │
    ├────┼────┼────┼────┼────┼────┼────┼────┤
  e │  2 │  1 │  0 │  1 │  2 │  3 │  4 │  5 │
    ├────┼────┼────┼────┼────┼────┼────┼────┤
  c │  3 │  2 │  1 │  0 │  1 │  2 │  3 │  4 │
    ├────┼────┼────┼────┼────┼────┼────┼────┤
  i │  4 │  3 │  2 │  1 │  0 │  1 │  2 │  3 │
    ├────┼────┼────┼────┼────┼────┼────┼────┤
  v │  5 │  4 │  3 │  2 │  1 │ [1]│  2 │  3 │  ← v≠b: sub cost=1
    ├────┼────┼────┼────┼────┼────┼────┼────┤     min(0+1, 2+1, 1+1)=1
  i │  6 │  5 │  4 │  3 │  2 │  2 │  1 │  2 │
    ├────┼────┼────┼────┼────┼────┼────┼────┤
  r │  7 │  6 │  5 │  4 │  3 │  3 │  2 │  1 │  ← answer
    └────┴────┴────┴────┴────┴────┴────┴────┘

  ↑
  source: "recivir"

Answer: dp[7][7] = 1  ✓
```

**Reading cell [5][5] (row='v', col='b') in detail:**

```
  v ≠ b, so substitution cost = 1

  dp[5][5] = min(
      dp[4][4] + 1,    // substitution: 0 + 1 = 1  ◄── winner
      dp[4][5] + 1,    // deletion:     1 + 1 = 2
      dp[5][4] + 1,    // insertion:    1 + 1 = 2
  ) = 1
```

**Tracing the optimal path (bottom-right to top-left):**

```
  (7,7)→(6,6)→(5,5)→(4,4)→(3,3)→(2,2)→(1,1)→(0,0)
    r=r   i=i   v→b   i=i   c=c   e=e   r=r
    match match  SUB  match match match match

  One substitution: v → b. Total cost: 1.
```

### Space Optimization (Two-Row Trick)

The full matrix uses O(m × n) space. But each cell only depends on:
- The cell directly above: dp[i-1][j]
- The cell to the left: dp[i][j-1]
- The cell diagonally above-left: dp[i-1][j-1]

So we only need two rows at a time:

```
  Full matrix (wasteful):        Two-row version (efficient):

  ┌──┬──┬──┬──┬──┬──┐           prev: [2, 1, 0, 1, 2, 3]
  │  │  │  │  │  │  │                   ↑        ↑
  ├──┼──┼──┼──┼──┼──┤                   │diag    │above
  │  │  │  │  │  │  │                   │        │
  ├──┼──┼──┼──┼──┼──┤           curr: [3, 2, 1, ?, ?, ?]
  │  │  │  │  │  │  │                         ↑  ↑
  ├──┼──┼──┼──┼──┼──┤                    left─┘  └─computing
  │  │  │  │  │  │  │
  └──┴──┴──┴──┴──┴──┘           After each row: swap(prev, curr)

  Space: O(m × n)                Space: O(min(m, n))
```

```rust
// The key insight: swap rows instead of allocating a matrix
for (i, ch_long) in long.chars().enumerate() {
    curr[0] = i + 1;
    for (j, ch_short) in short.chars().enumerate() {
        let cost = if ch_long == ch_short { 0 } else { 1 };
        curr[j + 1] = min3(
            prev[j] + cost,      // diagonal (substitution)
            prev[j + 1] + 1,     // above (deletion)
            curr[j] + 1,         // left (insertion)
        );
    }
    std::mem::swap(&mut prev, &mut curr);  // prev becomes curr
}
```

### Early Termination

When you only care about "is the distance ≤ threshold?", abort early:

```
  Checking "abcdefgh" vs "xyz" with threshold = 2

  After computing row 1:  [1, 1, 2, 3]   min = 1  ≤ 2 → continue
  After computing row 2:  [2, 2, 2, 3]   min = 2  ≤ 2 → continue
  After computing row 3:  [3, 3, 3, 3]   min = 3  > 2 → ABORT ✗

  Saved: didn't compute rows 4-8 (5 rows skipped out of 8)
```

This is critical for BK-tree performance. Most candidate words are far
from the query — early termination rejects them after 1-3 rows instead
of computing the full matrix.

```rust
// After computing each row:
if *curr.iter().min().unwrap() > threshold {
    return threshold + 1;  // signal "too far"
}
```


---

## 5. Unicode Handling Guide

### NFC Normalization

The same visible character can be stored multiple ways in Unicode:

```
  "café" can be:

  Composed (NFC):     c  a  f  é           4 code points
                               U+00E9     (single char: LATIN SMALL LETTER E WITH ACUTE)

  Decomposed (NFD):   c  a  f  e  ́         5 code points
                               U+0065     (plain 'e')
                               U+0301     (combining acute accent)

  Both render identically: café
  But byte-for-byte they are DIFFERENT strings.
```

**Why it matters for Lexicon:** if the dictionary stores "café" as NFC but the
input text has NFD, a byte comparison says they're different words. Always
normalize to NFC before any comparison.

```rust
use unicode_normalization::UnicodeNormalization;

let normalized: String = input.nfc().collect();
```

### Bytes vs Chars vs Grapheme Clusters

```
  String: "señor"

  Bytes (.len()):           6    (ñ = 2 bytes in UTF-8: 0xC3 0xB1)
  Chars (.chars().count()): 5    (s, e, ñ, o, r — if NFC)
  Graphemes:                5    (what humans see)

  String: "é" (decomposed: e + combining accent)

  Bytes (.len()):           3    (e=1 byte, combining accent=2 bytes)
  Chars (.chars().count()): 2    (e, ◌́)
  Graphemes:                1    (what humans see: é)
```

**Rule of thumb:**
- `.len()` → byte count. Use for buffer sizing, never for "word length"
- `.chars().count()` → Unicode scalar value count. Usually right after NFC
- Grapheme clusters → what humans perceive as characters. Use `unicode-segmentation` crate

```rust
use unicode_segmentation::UnicodeSegmentation;

let s = "señor";
println!("{}", s.len());                        // 6 (bytes)
println!("{}", s.chars().count());              // 5 (chars)
println!("{}", s.graphemes(true).count());      // 5 (graphemes)

// Where it diverges — flag emoji:
let flag = "🇪🇸";  // Spanish flag
println!("{}", flag.len());                     // 8 (bytes)
println!("{}", flag.chars().count());           // 2 (two regional indicators)
println!("{}", flag.graphemes(true).count());   // 1 (one visible flag)
```

### Case Folding Across Languages

Simple `.to_lowercase()` works for most cases but has edge cases:

```
  English:   "Hello"    → "hello"       ✓ straightforward
  Spanish:   "Ñoño"     → "ñoño"        ✓ works
  German:    "Straße"   → "straße"      ✓ but "ß".to_uppercase() = "SS"
  Turkish:   "Istanbul"  → "ıstanbul"    ✗ Turkish dotless-i problem!
```

**The Turkish İ/I problem:**

```
  Standard rules:     I → i     İ → i̇
  Turkish rules:      I → ı     İ → i

  "I".to_lowercase() gives "i" — wrong for Turkish!
  Turkish expects "ı" (dotless i).
```

For Lexicon (English/Spanish/Portuguese only), standard `.to_lowercase()` is
sufficient. But be aware this exists if you add Turkish support.

```rust
// Safe for en/es/pt:
let folded: String = word.to_lowercase();

// For locale-aware folding (if needed later):
// Use the `icu` crate or manual mapping
```

### Accent Handling

```
  á = U+00E1 (NFC: single code point)
  á = U+0061 + U+0301 (NFD: a + combining acute)

  After NFC normalization, both become U+00E1.

  For Lexicon, accented characters are DISTINCT:
    "si" ≠ "sí"  (Spanish: "if" vs "yes")
    "papa" ≠ "papá"  (Spanish: "potato" vs "dad/pope")
    "avó" ≠ "avô"  (Portuguese: "grandmother" vs "grandfather")

  Do NOT strip accents for dictionary lookup.
  DO normalize to NFC before comparison.
```

### Common Pitfalls

```
┌─────────────────────────────────┬──────────────────────────────────────────┐
│ Pitfall                         │ Fix                                      │
├─────────────────────────────────┼──────────────────────────────────────────┤
│ Using .len() for word length    │ Use .chars().count() after NFC           │
│                                 │                                          │
│ Indexing with s[i]              │ Rust won't let you — use .chars().nth(i) │
│                                 │ or iterate with .chars()                 │
│                                 │                                          │
│ Comparing without normalizing   │ Always NFC-normalize before compare      │
│                                 │                                          │
│ Stripping accents for lookup    │ Don't — accents change meaning           │
│                                 │                                          │
│ Assuming 1 char = 1 byte        │ UTF-8: ñ=2 bytes, 中=3 bytes, 🎉=4 bytes │
│                                 │                                          │
│ Slicing with &s[0..n]           │ Panics if n lands mid-character.         │
│                                 │ Use s.chars().take(n).collect::<String>()│
│                                 │                                          │
│ Sorting by bytes                │ "ñ" sorts after "z" by bytes.            │
│                                 │ Use locale-aware collation if ordering   │
│                                 │ matters.                                 │
└─────────────────────────────────┴──────────────────────────────────────────┘
```

### Lexicon-Relevant Characters

```
  Spanish:  á é í ó ú ü ñ  ¿ ¡
  Portuguese: á â ã à é ê í ó ô õ ú ü ç

  All fit in 2 bytes of UTF-8.
  All are single code points in NFC.
  All have distinct uppercase forms.

  Trie node children map: HashMap<char, TrieNode>
  This handles them naturally — each accented char is just another key.
```


---

## 6. Common Spanish/Portuguese Learner Mistakes Reference

These are the error patterns Lexicon should catch well. Useful for building
test cases and understanding why certain misspellings cluster at edit distance 1.

### Spanish: b/v Confusion

Spanish b and v are pronounced identically in most dialects. Native speakers
and learners both confuse them.

```
  Correct       Common error     Distance   Notes
  ─────────     ────────────     ────────   ─────
  recibir       recivir          1          "to receive"
  haber         haver            1          "to have" (auxiliary)
  escribir      escrivir         1          "to write"
  saber         saver            1          "to know"
  deber         dever            1          "to owe / must"
  gobierno      govierno         1          "government"
  también       tanbién          1          "also" (m→n before b)
  cambiar       canviar          2          "to change" (mb→nv)
  bello         vello            1          "beautiful" vs "body hair"
  tubo          tuvo             1          "tube" vs "he/she had"
```

### Spanish: s/c/z Confusion

In Latin American Spanish, s, c (before e/i), and z all sound like /s/.
In Castilian Spanish, c/z = /θ/ (like English "th").

```
  Correct       Common error     Distance   Notes
  ─────────     ────────────     ────────   ─────
  conocer       conoser          1          "to know"
  decir         desir            1          "to say"
  hacer         haser            1          "to do/make"
  comenzar      comensar         1          "to begin"
  necesitar     nesesitar        2          "to need" (c→s twice)
  ciencia       siencia          1          "science"
  cocina        cosina           1          "kitchen"
  zapato        sapato           1          "shoe"
  cerveza       servesa          2          "beer"
  feliz         felis            1          "happy"
```

### Spanish: h Omission/Addition

Spanish h is always silent. Learners forget it or add it where it doesn't belong.

```
  Correct       Common error     Distance   Notes
  ─────────     ────────────     ────────   ─────
  hacer         acer             1          "to do" (drop h)
  hoy           oy               1          "today"
  ahora         aora             1          "now"
  huevo         uevo             1          "egg"
  alcohol       alcool           1          (drop h)
  a ver         haber            —          "let's see" vs "to have"
```

### Portuguese: Word Boundary Errors

Portuguese has many multi-word expressions that learners write as one word.

```
  Correct          Common error     Distance   Notes
  ─────────        ────────────     ────────   ─────
  com certeza      concerteza       —          "certainly" (2 words → 1)
  de repente       derrepente       —          "suddenly"
  em cima          encima           —          "on top"
  por que          porque           —          "why" (question) vs "because"
  a partir de      apartir de       —          "starting from"
  de novo          denovo           —          "again"
```

Note: word boundary errors need the tokenizer to handle correctly. These
are harder to catch with edit distance alone — they require the checker
to consider joining/splitting tokens.

### Portuguese: Accent Errors

```
  Correct       Common error     Distance   Notes
  ─────────     ────────────     ────────   ─────
  você          voce             1          "you" (missing accent)
  café          cafe             1          "coffee"
  também        tambem           1          "also"
  é             e                1          "is" vs "and"
  avó           avo              1          "grandmother"
  saúde         saude            1          "health"
```

### False Cognates Across Languages

Words that look similar but mean different things. Lexicon won't catch
semantic errors, but these are useful for understanding the problem space.

```
  English       Spanish          Portuguese       Trap
  ─────────     ────────────     ────────────     ─────
  actually      actualmente      atualmente       = "currently"
  embarrassed   embarazada       —                = "pregnant" (ES)
  library       librería         livraria         = "bookstore"
  exit          éxito            êxito            = "success"
  fabric        fábrica          fábrica          = "factory"
  sensible      sensible         sensível         = "sensitive"
  carpet        carpeta          carpete          = "folder" (ES)
  attend        atender          atender          = "to serve/answer"
```

### Common English Misspellings (for Comparison)

These are the classic English test cases for any spell checker:

```
  Misspelling     Correct         Distance   Pattern
  ───────────     ────────        ────────   ───────
  recieve         receive         1          i/e swap (i before e rule)
  seperate        separate        1          e→a
  definately      definitely      2          a→i, drop e
  occured         occurred        1          missing r
  accomodate      accommodate     1          missing m
  embarass        embarrass       1          missing r
  mispell         misspell        1          missing s
  wierd           weird           1          i/e swap
  goverment       government      1          missing n
  enviroment      environment     1          missing n
  arguement       argument        1          extra e
  independant     independent     1          a→e
```


---

## 7. Rust Quick Reference for Python Developers

### Ownership & Borrowing

The big concept that doesn't exist in Python. Every value in
Rust has exactly one owner. When the owner goes out of scope, the value is
dropped (freed).

```rust
// MOVE — ownership transfers (Python: this never happens)
let s1 = String::from("hello");
let s2 = s1;           // s1 is MOVED to s2
// println!("{s1}");    // ✗ compile error! s1 is no longer valid

// BORROW — temporary read access (Python: just use the variable)
let s1 = String::from("hello");
let len = calculate_length(&s1);  // &s1 = immutable borrow
println!("{s1}");                  // ✓ s1 still valid

// MUTABLE BORROW — temporary write access (only one at a time)
let mut s = String::from("hello");
change(&mut s);                    // &mut s = mutable borrow
```

**In Python:** everything is a reference. `a = b` makes both point to the same
object. Garbage collector handles cleanup. You never think about this.

**In Rust:** `let a = b` MOVES the value. `b` is gone. To share, you borrow
with `&` (read) or `&mut` (write). No garbage collector — compiler enforces
rules at compile time.

```
  Python mental model:           Rust mental model:

  a ──→ ┌───────┐ ←── b         a ──→ ┌───────┐     b is INVALID
         │ data  │                      │ data  │
         └───────┘                      └───────┘

  (both valid, GC cleans up)     (one owner, dropped when owner dies)
```

### String vs &str

```rust
// String — owned, heap-allocated, growable (like Python str)
let owned: String = String::from("hello");
let also_owned: String = "hello".to_string();

// &str — borrowed string slice, read-only view (no Python equivalent)
let slice: &str = "hello";          // string literal → &str
let slice2: &str = &owned[0..3];    // borrow part of a String → &str
let slice3: &str = &owned;          // borrow whole String → &str
```

**When to use which:**
- Function parameters: prefer `&str` (accepts both String and &str)
- Struct fields that own data: use `String`
- Return values: usually `String` (caller owns it)

```rust
// Good — accepts both String and &str:
fn word_length(word: &str) -> usize {
    word.chars().count()
}

word_length("hello");                    // &str ✓
word_length(&String::from("hello"));     // String auto-borrows ✓
```

**In Python:** there's just `str`. It's immutable and reference-counted.
**In Rust:** `String` = you own it and can mutate it. `&str` = you're borrowing
a view of someone else's string.

### HashMap

```rust
use std::collections::HashMap;

// Create and insert (Python: d = {}; d["key"] = value)
let mut map: HashMap<String, u32> = HashMap::new();
map.insert("hello".to_string(), 42);

// Get (Python: d.get("key") or d["key"])
let val: Option<&u32> = map.get("hello");    // Returns Option, not the value!

// Check + get (Python: if "key" in d)
if let Some(freq) = map.get("hello") {
    println!("frequency: {freq}");
}

// Default value (Python: d.get("key", 0))
let freq = map.get("hello").copied().unwrap_or(0);

// Iterate (Python: for k, v in d.items())
for (word, freq) in &map {
    println!("{word}: {freq}");
}

// Entry API — insert if missing (Python: d.setdefault(key, default))
map.entry("world".to_string()).or_insert(0);

// Entry API — modify in place (Python: d[key] = d.get(key, 0) + 1)
*map.entry("hello".to_string()).or_insert(0) += 1;
```

**In Python:** `dict` — `d["key"]` raises `KeyError` if missing.
**In Rust:** `HashMap` — `.get()` returns `Option<&V>`, forcing you to handle
the missing case.

### Option and Result

```rust
// Option<T> = either Some(value) or None
// Like: Python's Optional[T]

let maybe: Option<i32> = Some(42);
let nothing: Option<i32> = None;

// Unwrap (Python: just use it and hope)
let val = maybe.unwrap();           // panics if None — avoid in production
let val = maybe.unwrap_or(0);       // default if None (Python: value or 0)
let val = maybe.expect("msg");      // panics with message if None

// Pattern match (no Python equivalent — this is better)
match maybe {
    Some(v) => println!("got {v}"),
    None => println!("nothing"),
}

// if let (concise pattern match)
if let Some(v) = maybe {
    println!("got {v}");
}
```

```rust
// Result<T, E> = either Ok(value) or Err(error)
// Like: Python's try/except — but as a return type

fn parse_number(s: &str) -> Result<i32, String> {
    s.parse::<i32>().map_err(|e| e.to_string())
}

// Handle the result:
match parse_number("42") {
    Ok(n) => println!("parsed: {n}"),
    Err(e) => println!("error: {e}"),
}
```

### Pattern Matching

```rust
// match = Python's match/case (3.10+), but exhaustive

let distance: usize = 2;

match distance {
    0 => println!("exact match"),
    1 => println!("close match"),
    2 => println!("fuzzy match"),
    _ => println!("too far"),       // _ = default (required for exhaustiveness)
}

// Destructuring (no direct Python equivalent)
enum Suggestion {
    Exact(String),
    Fuzzy(String, usize),  // word, distance
    None,
}

match suggestion {
    Suggestion::Exact(word) => println!("exact: {word}"),
    Suggestion::Fuzzy(word, d) if d <= 1 => println!("close: {word}"),
    Suggestion::Fuzzy(word, d) => println!("far: {word} (dist {d})"),
    Suggestion::None => println!("no suggestion"),
}
```

**In Python:** `match/case` (3.10+) is similar but not exhaustive.
**In Rust:** `match` is exhaustive (compiler error if you miss a case) and
destructures naturally.

### Iterator Methods

```
┌──────────────────────┬──────────────────────────┐
│ Rust                 │ Python                   │
├──────────────────────┼──────────────────────────┤
│ iter.map(|x| x + 1) │ [x + 1 for x in lst]    │
│                      │ map(lambda x: x+1, lst)  │
├──────────────────────┼──────────────────────────┤
│ iter.filter(|x|      │ [x for x in lst          │
│   x > &5)            │   if x > 5]              │
├──────────────────────┼──────────────────────────┤
│ iter.collect::<Vec>()│ list(...)                │
├──────────────────────┼──────────────────────────┤
│ iter.enumerate()     │ enumerate(lst)           │
├──────────────────────┼──────────────────────────┤
│ iter.any(|x| cond)   │ any(cond for x in lst)   │
├──────────────────────┼──────────────────────────┤
│ iter.all(|x| cond)   │ all(cond for x in lst)   │
├──────────────────────┼──────────────────────────┤
│ iter.find(|x| cond)  │ next(x for x in lst      │
│                      │   if cond, None)         │
├──────────────────────┼──────────────────────────┤
│ iter.fold(init,      │ functools.reduce(f, lst,  │
│   |acc, x| f)        │   init)                  │
├──────────────────────┼──────────────────────────┤
│ iter.zip(other)      │ zip(lst1, lst2)          │
├──────────────────────┼──────────────────────────┤
│ iter.take(n)         │ lst[:n] or               │
│                      │ itertools.islice(it, n)  │
├──────────────────────┼──────────────────────────┤
│ iter.skip(n)         │ lst[n:] or               │
│                      │ itertools.islice(it,n,∞) │
├──────────────────────┼──────────────────────────┤
│ iter.count()         │ len(lst)                 │
├──────────────────────┼──────────────────────────┤
│ iter.min() / max()   │ min(lst) / max(lst)      │
├──────────────────────┼──────────────────────────┤
│ iter.sum::<T>()      │ sum(lst)                 │
├──────────────────────┼──────────────────────────┤
│ iter.flatten()       │ itertools.chain(*lsts)   │
├──────────────────────┼──────────────────────────┤
│ iter.chain(other)    │ itertools.chain(a, b)    │
├──────────────────────┼──────────────────────────┤
│ iter.sorted()        │ sorted(lst)              │
│ (itertools crate)    │                          │
└──────────────────────┴──────────────────────────┘
```

**Key difference:** Rust iterators are lazy (like Python generators). Nothing
happens until you call `.collect()`, `.count()`, `.for_each()`, etc.

```rust
// Lexicon example: get top 5 suggestions sorted by distance then frequency
let suggestions: Vec<(String, usize)> = candidates
    .iter()
    .filter(|(_, dist)| *dist <= max_distance)
    .sorted_by(|(w1, d1), (w2, d2)| d1.cmp(d2).then(w2.cmp(w1)))
    .take(5)
    .cloned()
    .collect();
```

### Error Handling: The ? Operator

```rust
// The ? operator: early-return on error (like Python try/except but cleaner)

// WITHOUT ? (verbose):
fn load_dict(path: &str) -> Result<Vec<String>, io::Error> {
    let content = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(e) => return Err(e),
    };
    Ok(content.lines().map(String::from).collect())
}

// WITH ? (idiomatic):
fn load_dict(path: &str) -> Result<Vec<String>, io::Error> {
    let content = fs::read_to_string(path)?;  // returns Err early if fails
    Ok(content.lines().map(String::from).collect())
}
```

**In Python:**
```python
# Exceptions propagate implicitly — you don't see the error path
def load_dict(path):
    with open(path) as f:          # raises IOError implicitly
        return f.read().splitlines()
```

**In Rust:** errors are values, not exceptions. The `?` operator is syntactic
sugar for "if this is an Err, return it from the current function." You always
see where errors can occur — no hidden control flow.

```
  Python:      errors are invisible until they explode at runtime
  Rust:        errors are in the type signature — you MUST handle them
```

### Quick Syntax Cheat Sheet

```
┌──────────────────────┬──────────────────────────┬──────────────────────────┐
│ Concept              │ Python                    │ Rust                     │
├──────────────────────┼──────────────────────────┼──────────────────────────┤
│ Variable             │ x = 5                    │ let x = 5;               │
│ Mutable variable     │ (all mutable by default) │ let mut x = 5;           │
│ Constant             │ X = 5                    │ const X: i32 = 5;        │
│ Print                │ print(f"{x}")            │ println!("{x}");         │
│ String format        │ f"hello {name}"          │ format!("hello {name}")  │
│ Function             │ def f(x: int) -> int:    │ fn f(x: i32) -> i32 {    │
│ Struct/Class         │ class Foo:               │ struct Foo { ... }       │
│ Method               │ def method(self):        │ fn method(&self) { ... } │
│ Array/Vec            │ lst = [1, 2, 3]          │ let v = vec![1, 2, 3];   │
│ Dict/HashMap         │ d = {"a": 1}             │ HashMap::from([("a", 1)])│
│ For loop             │ for x in lst:            │ for x in &v { ... }      │
│ While loop           │ while cond:              │ while cond { ... }       │
│ If/else              │ if x > 5:                │ if x > 5 { ... }         │
│ Null/None            │ None                     │ None (inside Option<T>)  │
│ Type annotation      │ x: int = 5               │ let x: i32 = 5;          │
│ Tuple                │ (1, "a")                 │ (1, "a")                 │
│ Closure/Lambda       │ lambda x: x + 1          │ |x| x + 1               │
│ Import               │ from x import y          │ use x::y;               │
│ Test                 │ def test_foo():           │ #[test] fn test_foo() {  │
│ Assert               │ assert x == 5            │ assert_eq!(x, 5);        │
└──────────────────────┴──────────────────────────┴──────────────────────────┘
```
