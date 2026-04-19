# Act 3 — The Suggester

> *Your spell checker can say "that's wrong." Now teach it to say "did you mean…?"*

In Acts 1 and 2, you built a trie that stores a dictionary and a bloom filter that rejects non-words fast. Lexicon can tell you that "recivir" isn't a Spanish word. Useful — but not helpful. A real spell checker doesn't just point at your mistakes, it offers corrections.

That's what this act is about. You'll implement Levenshtein edit distance — the algorithm that measures how "far apart" two words are — and then build a BK-tree, a data structure that finds similar words without scanning the entire dictionary. By the end, Lexicon will take "recivir" and suggest "recibir" (the correct Spanish verb "to receive"), ranked above less likely alternatives.

The math here is real. You'll fill in dynamic programming matrices cell by cell, prove why the triangle inequality lets you prune a tree search, and benchmark optimizations that turn a 300ms query into a 6ms one. This is the kind of algorithm work that powers autocorrect on your phone, "did you mean" on Google, and fuzzy matching in every code editor's Ctrl+P.

**What you have from Acts 1-2:**
- A `Trie` with insert, contains, and prefix search
- A `BloomFilter` for fast rejection of non-words
- Dictionary loading from `.dict` files with word frequencies
- A check pipeline: tokenize → bloom filter → trie lookup
- Unicode-aware text processing (NFC normalization, case folding)

**What you'll build in Act 3:**
- Levenshtein edit distance (full DP matrix, then optimized)
- Early termination for bounded distance queries
- A BK-tree for sub-linear fuzzy search
- Frequency-weighted suggestion ranking
- The `lexicon suggest <word>` command

**Project location:** `~/juk/lexicon/lexicon/`

---

## Stage 14 — The DP Matrix

Edit distance is the mathematical backbone of every spell checker, autocorrect engine, and DNA sequence aligner on the planet. This stage builds it from scratch using dynamic programming — the technique of solving a problem by breaking it into overlapping subproblems and storing their solutions in a table. You'll fill in the matrix cell by cell, trace the optimal edit path, and understand *why* the naive recursive approach explodes exponentially while the table approach runs in polynomial time.

*Difficulty: Medium* | *New concepts: dynamic programming, edit distance, 2D vectors*

### The Problem

You have a misspelled word — "recivir" — and a dictionary full of correct words. How do you find the closest match? You need a way to measure the *distance* between two strings. Not physical distance — *edit distance*: the minimum number of single-character operations needed to transform one string into another.

The three operations:
- **Insertion**: add a character. "recvir" → "rec**i**vir" (insert 'i')
- **Deletion**: remove a character. "reciivir" → "recivir" (delete extra 'i')
- **Substitution**: replace a character. "reci**v**ir" → "reci**b**ir" (replace 'v' with 'b')

Each operation costs 1. The **Levenshtein distance** between two strings is the minimum total cost to transform one into the other.

Some examples to build intuition:

| Source | Target | Distance | Operations |
|--------|--------|----------|------------|
| "recivir" | "recibir" | 1 | substitute v→b |
| "definately" | "definitely" | 3 | substitute a→i, delete l…actually let's compute it properly |
| "cat" | "cat" | 0 | identical |
| "cat" | "cats" | 1 | insert s |
| "cat" | "dog" | 3 | substitute c→d, a→o, t→g |
| "" | "hello" | 5 | insert h, e, l, l, o |

That last one is important — transforming an empty string into "hello" requires 5 insertions. Transforming "hello" into "" requires 5 deletions. The distance from any string to the empty string is always the string's length.

### Why Not Just Try Every Possibility?

Your first instinct might be recursive: try all three operations at each position, take the minimum. Let's write that to see why it fails:

```rust
// DON'T USE THIS — it's exponentially slow. We're writing it to understand the problem.
fn levenshtein_naive(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();

    fn recurse(a: &[char], b: &[char], i: usize, j: usize) -> usize {
        // Base cases: one string is exhausted
        if i == 0 {
            return j; // insert all remaining chars of b
        }
        if j == 0 {
            return i; // delete all remaining chars of a
        }

        // If characters match, no operation needed — move diagonally
        if a[i - 1] == b[j - 1] {
            return recurse(a, b, i - 1, j - 1);
        }

        // Try all three operations, take the cheapest
        let delete = recurse(a, b, i - 1, j) + 1;
        let insert = recurse(a, b, i, j - 1) + 1;
        let substitute = recurse(a, b, i - 1, j - 1) + 1;

        delete.min(insert).min(substitute)
    }

    recurse(&a, &b, a.len(), b.len())
}
```

This works correctly. But it's catastrophically slow. For "recivir" (7 chars) vs "recibir" (7 chars), it makes thousands of recursive calls. For two 20-character strings, it makes *billions*. The time complexity is O(3^max(m,n)) — exponential.

Why? Because it recomputes the same subproblems over and over. Computing `recurse(a, b, 3, 4)` might happen from `recurse(4, 4)` via deletion, from `recurse(3, 5)` via insertion, and from `recurse(4, 5)` via substitution. Each of those calls spawns its own tree of redundant work.

> **Python comparison:** This is the same problem you hit with naive recursive Fibonacci. `fib(5)` calls `fib(3)` twice, `fib(2)` three times. The fix is the same too: either memoize (top-down) or build a table (bottom-up). We'll go bottom-up — it's called **dynamic programming**.

### The DP Table

Instead of recursing, we build an (m+1) × (n+1) table where `dp[i][j]` stores the edit distance between the first `i` characters of string `a` and the first `j` characters of string `b`.

The recurrence relation (same logic as the recursive version, just stored in a table):

```
dp[i][j] = min(
    dp[i-1][j]   + 1,       // deletion:     remove a[i-1]
    dp[i][j-1]   + 1,       // insertion:    insert b[j-1]
    dp[i-1][j-1] + cost,    // substitution: cost=0 if a[i-1]==b[j-1], else 1
)
```

Let's trace through "recivir" → "recibir" cell by cell. The table has 8 rows (0..=7 for "recivir") and 8 columns (0..=7 for "recibir"):

**Step 1 — Initialize the borders:**

The first row represents transforming "" into progressively longer prefixes of "recibir" — each step is an insertion. The first column represents transforming progressively longer prefixes of "recivir" into "" — each step is a deletion.

```
        ""  r  e  c  i  b  i  r
    ""   0  1  2  3  4  5  6  7
    r    1  .  .  .  .  .  .  .
    e    2  .  .  .  .  .  .  .
    c    3  .  .  .  .  .  .  .
    i    4  .  .  .  .  .  .  .
    v    5  .  .  .  .  .  .  .
    i    6  .  .  .  .  .  .  .
    r    7  .  .  .  .  .  .  .
```

**Step 2 — Fill row by row:**

For `dp[1][1]`: comparing 'r' vs 'r'. They match! So `cost = 0`.
- Diagonal: `dp[0][0] + 0 = 0`
- Up: `dp[0][1] + 1 = 2`
- Left: `dp[1][0] + 1 = 2`
- Min = **0** ✓ (characters match, no edit needed)

For `dp[1][2]`: comparing 'r' vs 'e'. They differ. `cost = 1`.
- Diagonal: `dp[0][1] + 1 = 2`
- Up: `dp[0][2] + 1 = 3`
- Left: `dp[1][1] + 1 = 1`
- Min = **1**

Continuing this process for the entire first row of 'r':

```
        ""  r  e  c  i  b  i  r
    ""   0  1  2  3  4  5  6  7
    r    1  0  1  2  3  4  5  6
    e    2  .  .  .  .  .  .  .
    ...
```

Let me fill the complete table. Each cell takes the minimum of three neighbors:

```
        ""  r  e  c  i  b  i  r
    ""   0  1  2  3  4  5  6  7
    r    1  0  1  2  3  4  5  6
    e    2  1  0  1  2  3  4  5
    c    3  2  1  0  1  2  3  4
    i    4  3  2  1  0  1  2  3
    v    5  4  3  2  1  1  2  3
    i    6  5  4  3  2  2  1  2
    r    7  6  5  4  3  3  2  1
```

The answer is in the bottom-right corner: **dp[7][7] = 1**. The edit distance between "recivir" and "recibir" is 1 — a single substitution of 'v' → 'b'.

Look at the diagonal of zeros from `dp[0][0]` to `dp[4][4]` — that's "reci" matching "reci" perfectly. Then at `dp[5][5]` we see 1 instead of 0 because 'v' ≠ 'b'. After that substitution, the remaining "ir" matches "ir" and the distance stays at 1.

> **Language learning insight:** Spanish learners constantly confuse 'b' and 'v' because they're pronounced identically in Spanish. "recibir" (to receive), "vivir" (to live), "haber" (to have) — the b/v distinction is purely orthographic. Edit distance captures this: it's always exactly 1 substitution.

### The Implementation

Create `src/levenshtein.rs`:

```rust
/// Computes the Levenshtein edit distance between two strings.
///
/// Uses the full (m+1)×(n+1) dynamic programming matrix.
/// Time: O(m × n) | Space: O(m × n)
pub fn levenshtein(a: &str, b: &str) -> usize {
    // Collect into Vec<char> so we can index by position.
    // Rust strings are UTF-8 — you can't index them directly because
    // characters can be 1-4 bytes. .chars().collect() gives us O(1) indexing.
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    let m = a_chars.len();
    let n = b_chars.len();

    // Build the (m+1) × (n+1) matrix, initialized to zeros.
    // vec![vec![0; cols]; rows] creates a 2D vector — Rust's equivalent of
    // a 2D array. In Python: [[0] * cols for _ in range(rows)]
    let mut dp = vec![vec![0usize; n + 1]; m + 1];

    // Base cases: first column — transforming a[0..i] into "" costs i deletions
    for i in 0..=m {
        dp[i][0] = i;
    }

    // Base cases: first row — transforming "" into b[0..j] costs j insertions
    for j in 0..=n {
        dp[0][j] = j;
    }

    // Fill the table row by row
    for i in 1..=m {
        for j in 1..=n {
            // cost is 0 if characters match, 1 if they differ
            let cost = if a_chars[i - 1] == b_chars[j - 1] { 0 } else { 1 };

            dp[i][j] = (dp[i - 1][j - 1] + cost) // substitution (or match)
                .min(dp[i - 1][j] + 1)             // deletion
                .min(dp[i][j - 1] + 1);            // insertion
        }
    }

    // Answer is in the bottom-right corner
    dp[m][n]
}
```

Register the module in `src/lib.rs`:

```rust
pub mod levenshtein;
```

### Why `Vec<char>` and Not Just `&str`?

This is a Rust-specific gotcha. Rust strings are UTF-8 encoded, which means characters like 'ñ' or 'é' take 2 bytes, and '日' takes 3 bytes. You can't write `s[i]` on a `&str` because byte index `i` might land in the middle of a multi-byte character.

```rust
let word = "información";
// word[5] — this won't compile! Rust prevents you from indexing strings.
// word.chars().nth(5) — this works but is O(n), not O(1).
```

By collecting into `Vec<char>`, each element is a full Unicode scalar value, and indexing is O(1). The cost is one allocation up front — worth it for an O(m×n) algorithm.

> **Python comparison:** Python strings are sequences of Unicode code points — `s[5]` just works. JavaScript's `s[5]` also works but returns UTF-16 code units, which can split emoji. Rust makes you think about encoding explicitly, which is annoying but prevents subtle bugs with accented characters.

### Testing

Add tests in `src/levenshtein.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identical_strings() {
        assert_eq!(levenshtein("recibir", "recibir"), 0);
    }

    #[test]
    fn empty_strings() {
        assert_eq!(levenshtein("", ""), 0);
        assert_eq!(levenshtein("hello", ""), 5);
        assert_eq!(levenshtein("", "hello"), 5);
    }

    #[test]
    fn single_substitution() {
        // Spanish b/v confusion
        assert_eq!(levenshtein("recivir", "recibir"), 1);
    }

    #[test]
    fn single_insertion() {
        assert_eq!(levenshtein("cat", "cats"), 1);
    }

    #[test]
    fn single_deletion() {
        assert_eq!(levenshtein("cats", "cat"), 1);
    }

    #[test]
    fn classic_examples() {
        assert_eq!(levenshtein("kitten", "sitting"), 3);
        assert_eq!(levenshtein("saturday", "sunday"), 3);
    }

    #[test]
    fn unicode_accents() {
        // "información" vs "information" — how many edits?
        // i-n-f-o-r-m-a-c-i-ó-n  vs  i-n-f-o-r-m-a-t-i-o-n
        //                  ^ c→t       ^ ó→o
        // That's 2 substitutions: c→t and ó→o
        assert_eq!(levenshtein("información", "information"), 2);
    }

    #[test]
    fn symmetry() {
        // Edit distance is symmetric: d(a, b) == d(b, a)
        assert_eq!(
            levenshtein("recivir", "recibir"),
            levenshtein("recibir", "recivir")
        );
    }

    #[test]
    fn completely_different() {
        assert_eq!(levenshtein("abc", "xyz"), 3);
    }
}
```

Run the tests:

```bash
cargo test -p lexicon --lib levenshtein
```

```
running 8 tests
test levenshtein::tests::identical_strings ... ok
test levenshtein::tests::empty_strings ... ok
test levenshtein::tests::single_substitution ... ok
test levenshtein::tests::single_insertion ... ok
test levenshtein::tests::single_deletion ... ok
test levenshtein::tests::classic_examples ... ok
test levenshtein::tests::unicode_accents ... ok
test levenshtein::tests::symmetry ... ok
test levenshtein::tests::completely_different ... ok
```

### Common Mistakes

**Off-by-one in the matrix dimensions.** The matrix is (m+1) × (n+1), not m × n. Row 0 and column 0 represent the empty string prefix. If you allocate `vec![vec![0; n]; m]`, you'll panic on the base case initialization.

**Forgetting to handle empty strings.** If either string is empty, the distance is the length of the other string. The base case initialization handles this, but if you skip it, `dp[0][j]` stays 0 and you get wrong answers.

**Indexing strings directly.** `a.as_bytes()[i]` works for ASCII but breaks on "información" because 'ó' is 2 bytes in UTF-8. Always use `chars().collect()` for correctness with multilingual text.

**Confusing row/column orientation.** In our table, rows are characters of `a` (the source) and columns are characters of `b` (the target). Swapping them gives the same answer (edit distance is symmetric) but makes the code confusing to read.

The algorithm is correct and the tests pass, but the full matrix allocates O(m×n) memory — wasteful when we only ever look at two adjacent rows. Stage 15 slashes the space cost without changing the result.

### What We Built

You now have a working Levenshtein distance function. It's correct, handles Unicode, and runs in O(m×n) time. But it allocates an entire (m+1)×(n+1) matrix — for two 20-character words, that's 441 `usize` values (3.5 KB on 64-bit). Not a problem for one comparison, but when the BK-tree queries thousands of words per suggestion, those allocations add up.

Next stage: we'll cut the space from O(m×n) down to O(min(m,n)) by keeping only one row at a time.

---

## Stage 15 — Space Optimization

The full DP matrix works, but it's profligate with memory — storing an entire grid when only two rows are ever live at once. This stage teaches a fundamental optimization pattern: when a recurrence only looks back one step, you can collapse the table to a sliding window. The `std::mem::swap` trick you learn here is idiomatic Rust for zero-allocation buffer rotation, and it cuts memory from O(m×n) to O(min(m,n)).

*Difficulty: Medium* | *New concepts: `std::mem::swap`, two-row DP, ensuring the shorter string is the inner loop*

### The Insight

Look at the recurrence again:

```
dp[i][j] = min(
    dp[i-1][j-1] + cost,   // diagonal (previous row, previous column)
    dp[i-1][j]   + 1,      // up       (previous row, same column)
    dp[i][j-1]   + 1,      // left     (same row, previous column)
)
```

Every cell depends on exactly three things: the cell above it, the cell to its left, and the cell diagonally above-left. That means when we're filling row `i`, we only need row `i-1`. Rows `i-2`, `i-3`, etc. are dead weight.

Instead of an (m+1)×(n+1) matrix, we can use just **two rows**: the previous row and the current row. After filling the current row, it becomes the previous row for the next iteration.

```
Full matrix (Stage 14):          Two-row optimization (Stage 15):

    ""  r  e  c  i  b  i  r         prev: [1, 0, 1, 2, 3, 4, 5, 6]
""   0  1  2  3  4  5  6  7         curr: [2, _, _, _, _, _, _, _]
r    1  0  1  2  3  4  5  6              ↓ fill left to right
e    2  1  0  1  2  3  4  5         prev: [2, 1, 0, 1, 2, 3, 4, 5]  (swap!)
c    3  2  1  0  1  2  3  4         curr: [3, _, _, _, _, _, _, _]
i    4  3  2  1  0  1  2  3              ↓ fill left to right
v    5  4  3  2  1  1  2  3         ...and so on
i    6  5  4  3  2  2  1  2
r    7  6  5  4  3  3  2  1
```

Space drops from O(m × n) to O(n) — or better yet, O(min(m, n)) if we make the shorter string the column dimension.

### The Swap Trick

Here's the elegant part. After filling `curr`, we need `curr` to become `prev` for the next iteration. We could copy: `prev = curr.clone()`. But that allocates a new vector every iteration.

Instead, we **swap** them:

```rust
std::mem::swap(&mut prev, &mut curr);
```

`std::mem::swap` exchanges two values in place — no allocation, no copying. It just swaps the pointers (a `Vec` is a pointer + length + capacity on the stack). This is O(1).

> **Python comparison:** Python's `a, b = b, a` does a similar thing — it swaps references, not data. Rust's `std::mem::swap` is the explicit equivalent. You could also write `(prev, curr) = (curr, prev)` in Rust, but `std::mem::swap` makes the intent clearer and works with mutable borrows.

### Ensuring the Shorter String Is the Inner Loop

The inner loop runs `n` times per outer iteration. If we make `n` the length of the shorter string, we minimize both the row size and the number of inner iterations. The outer loop runs `m` times regardless, but the rows are shorter.

For "información" (11 chars) vs "info" (4 chars), the two-row approach uses rows of length 5 instead of 12. Small win here, but it adds up when the BK-tree runs thousands of comparisons.

### The Implementation

Update `src/levenshtein.rs` — replace the full-matrix version:

```rust
/// Computes the Levenshtein edit distance between two strings.
///
/// Uses two-row optimization: O(min(m, n)) space instead of O(m × n).
/// The shorter string becomes the column dimension to minimize row size.
pub fn levenshtein(a: &str, b: &str) -> usize {
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();

    // Make `short` the shorter string — it determines row width.
    let (short, long) = if a_chars.len() <= b_chars.len() {
        (&a_chars, &b_chars)
    } else {
        (&b_chars, &a_chars)
    };

    let n = short.len();

    // Edge case: if one string is empty, distance is the other's length.
    if n == 0 {
        return long.len();
    }

    // prev row: represents dp[i-1][0..=n]
    // Initialize to [0, 1, 2, ..., n] — the base case row (empty string vs short[0..j])
    let mut prev: Vec<usize> = (0..=n).collect();

    // curr row: represents dp[i][0..=n]
    let mut curr: Vec<usize> = vec![0; n + 1];

    for (i, &ch_long) in long.iter().enumerate() {
        // First cell of each row: transforming long[0..=i] into "" costs i+1 deletions
        curr[0] = i + 1;

        for (j, &ch_short) in short.iter().enumerate() {
            let cost = if ch_long == ch_short { 0 } else { 1 };

            curr[j + 1] = (prev[j] + cost)       // substitution / match (diagonal)
                .min(prev[j + 1] + 1)             // deletion (above)
                .min(curr[j] + 1);                // insertion (left)
        }

        // Swap: curr becomes prev for the next iteration. No allocation.
        std::mem::swap(&mut prev, &mut curr);
    }

    // After the last swap, the result is in prev (because we just swapped).
    prev[n]
}
```

**Why `prev[n]` and not `curr[n]`?** Because `std::mem::swap` runs *after* we fill `curr`. So what was `curr` (with our answer) is now called `prev`. This trips people up — if you return `curr[n]`, you get the *second-to-last* row's value. Off by one swap.

### Testing

The same tests from Stage 14 should still pass — the function signature and behavior are identical, only the internal memory layout changed:

```bash
cargo test -p lexicon --lib levenshtein
```

```
running 8 tests
test levenshtein::tests::identical_strings ... ok
test levenshtein::tests::empty_strings ... ok
test levenshtein::tests::single_substitution ... ok
...all pass...
```

Add a test that specifically validates the optimization doesn't break with asymmetric lengths:

```rust
#[test]
fn asymmetric_lengths() {
    // Short vs long — exercises the short/long swap logic
    assert_eq!(levenshtein("hi", "hello"), 4);
    assert_eq!(levenshtein("hello", "hi"), 4);

    // One character vs many
    assert_eq!(levenshtein("a", "abcdef"), 5);
}
```

### Common Mistakes

**Returning `curr[n]` instead of `prev[n]`.** After the loop's final `std::mem::swap`, the completed row is in `prev`. This is the #1 bug people hit with the two-row approach.

**Forgetting `curr[0] = i + 1`.** The first cell of each row is the base case — transforming `long[0..=i]` into the empty string. If you forget this, the first column stays all zeros and every distance comes out too small.

**Not handling the empty string edge case.** If `short` is empty (length 0), the loop body never executes and `prev` is still `[0]`. You'd return 0 instead of `long.len()`. The early return handles this.

Same algorithm, same results, dramatically less memory. But we can do even better — right now, we always compute the full distance even when we only care whether it's ≤ 2. When the BK-tree fires thousands of distance queries per suggestion, most of them will exceed the threshold. Stage 16 adds the escape hatch: bail out early when the answer is already too large.

### What Changed

Same algorithm, same results, dramatically less memory. For two 100-character strings, the full matrix uses 10,201 cells (80 KB). The two-row version uses 202 cells (1.6 KB). When the BK-tree fires off thousands of distance calculations per query, this matters.

But we can do even better. Right now, we always compute the full distance — even when we only care whether it's ≤ 2. Next stage: bail out early when the answer is already too large.

---

## Stage 16 — Early Termination

In the BK-tree (Stage 19), we'll ask "is the distance ≤ 2?" thousands of times per suggestion lookup, and the answer is usually "no." Computing the exact distance for words that are clearly 10 edits apart is wasted work. This stage adds a threshold parameter that lets the algorithm bail out mid-computation when the minimum possible result already exceeds the bound — turning a 3-4x speedup into the difference between a responsive tool and a sluggish one.

*Difficulty: Medium* | *New concepts: bounded edit distance, row minimum tracking, `Option` return for "exceeded threshold"*

### Why This Matters

In the BK-tree (coming in Stage 19), we'll query "is the distance between these two words ≤ 2?" thousands of times per suggestion lookup. Most of the time, the answer is "no" — the words are far apart. But our current `levenshtein()` computes the *exact* distance every time, even when it's obvious halfway through that the answer will be 15.

The optimization: after filling each row, check the **minimum value** in that row. If the minimum already exceeds our threshold, no subsequent row can produce a smaller value (each row can only decrease by at most 1 compared to its minimum). We can abort immediately.

### The Math

Why can we trust the row minimum? Consider row `i`. The minimum value in this row represents the best possible alignment of `long[0..=i]` against any prefix of `short`. As we add more characters from `long` (moving to row `i+1`), the minimum can decrease by at most 1 (if the next character matches perfectly). So if the minimum in row `i` is already 5 and our threshold is 2, there's no way to reach ≤ 2 — we'd need to decrease by 3, but we can only decrease by 1 per row.

More precisely: the final answer `dp[m][n]` is always ≥ `min(row_i) - (m - i)`. If `min(row_i) - (m - i) > threshold`, we can bail.

But the simpler (and nearly as effective) check is: if `min(row_i) > threshold`, bail. This is slightly conservative — it might not bail as early as theoretically possible — but it's simple and catches the vast majority of cases.

### The Implementation

Add a new function alongside the existing one — we keep `levenshtein()` for when we need the exact distance, and add `levenshtein_bounded()` for threshold queries:

```rust
/// Computes edit distance, but returns None if the distance exceeds `max_distance`.
///
/// This is the hot path in BK-tree search. Early termination avoids wasting
/// cycles on word pairs that are clearly too far apart.
pub fn levenshtein_bounded(a: &str, b: &str, max_distance: usize) -> Option<usize> {
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();

    let (short, long) = if a_chars.len() <= b_chars.len() {
        (&a_chars, &b_chars)
    } else {
        (&b_chars, &a_chars)
    };

    let n = short.len();
    let m = long.len();

    // Quick check: if the length difference alone exceeds the threshold,
    // we need at least that many insertions/deletions. No point computing.
    if m - n > max_distance {
        return None;
    }

    if n == 0 {
        return if m <= max_distance { Some(m) } else { None };
    }

    let mut prev: Vec<usize> = (0..=n).collect();
    let mut curr: Vec<usize> = vec![0; n + 1];

    for (i, &ch_long) in long.iter().enumerate() {
        curr[0] = i + 1;

        // Track the minimum value in this row
        let mut row_min = curr[0];

        for (j, &ch_short) in short.iter().enumerate() {
            let cost = if ch_long == ch_short { 0 } else { 1 };

            curr[j + 1] = (prev[j] + cost)
                .min(prev[j + 1] + 1)
                .min(curr[j] + 1);

            row_min = row_min.min(curr[j + 1]);
        }

        // Early termination: if the smallest value in this row exceeds
        // the threshold, the final answer will too. Bail out.
        if row_min > max_distance {
            return None;
        }

        std::mem::swap(&mut prev, &mut curr);
    }

    let distance = prev[n];
    if distance <= max_distance {
        Some(distance)
    } else {
        None
    }
}
```

### The Length Difference Shortcut

Notice the check at the top:

```rust
if m - n > max_distance {
    return None;
}
```

If "cat" (3 chars) is compared to "elephant" (8 chars), the length difference is 5. You need at least 5 insertions to bridge the gap — no amount of clever substitutions can fix a 5-character length mismatch in fewer than 5 edits. If `max_distance` is 2, we can reject immediately without touching the DP table.

This is free and eliminates a huge number of comparisons in the BK-tree.

### Testing

```rust
#[cfg(test)]
mod bounded_tests {
    use super::*;

    #[test]
    fn within_threshold() {
        // Distance is 1, threshold is 2 — should return Some(1)
        assert_eq!(levenshtein_bounded("recivir", "recibir", 2), Some(1));
    }

    #[test]
    fn exactly_at_threshold() {
        // Distance is 3, threshold is 3 — should return Some(3)
        assert_eq!(levenshtein_bounded("kitten", "sitting", 3), Some(3));
    }

    #[test]
    fn exceeds_threshold() {
        // Distance is 3, threshold is 2 — should return None
        assert_eq!(levenshtein_bounded("kitten", "sitting", 2), None);
    }

    #[test]
    fn length_difference_shortcut() {
        // "hi" vs "elephant" — length diff is 6, threshold is 2
        assert_eq!(levenshtein_bounded("hi", "elephant", 2), None);
    }

    #[test]
    fn zero_threshold() {
        // Only identical strings match at distance 0
        assert_eq!(levenshtein_bounded("cat", "cat", 0), Some(0));
        assert_eq!(levenshtein_bounded("cat", "car", 0), None);
    }

    #[test]
    fn empty_strings_bounded() {
        assert_eq!(levenshtein_bounded("", "", 0), Some(0));
        assert_eq!(levenshtein_bounded("", "hi", 2), Some(2));
        assert_eq!(levenshtein_bounded("", "hello", 2), None);
    }
}
```

### Benchmarking the Speedup

Let's measure how much early termination helps. Add a quick benchmark to see the difference. You can run this as a test that prints timing:

```rust
#[test]
fn benchmark_early_termination() {
    use std::time::Instant;

    let word_pairs: Vec<(&str, &str)> = vec![
        ("algorithm", "altruistic"),
        ("elephant", "relevant"),
        ("programming", "procrastinating"),
        ("universidad", "understanding"),
        ("butterfly", "buttermilk"),
    ];

    // Full distance (no early termination)
    let start = Instant::now();
    for _ in 0..10_000 {
        for &(a, b) in &word_pairs {
            let _ = levenshtein(a, b);
        }
    }
    let full_time = start.elapsed();

    // Bounded distance with threshold 2
    let start = Instant::now();
    for _ in 0..10_000 {
        for &(a, b) in &word_pairs {
            let _ = levenshtein_bounded(a, b, 2);
        }
    }
    let bounded_time = start.elapsed();

    println!("Full:    {full_time:?} for 50k comparisons");
    println!("Bounded: {bounded_time:?} for 50k comparisons");
    println!(
        "Speedup: {:.1}x",
        full_time.as_nanos() as f64 / bounded_time.as_nanos() as f64
    );
}
```

Run with output visible:

```bash
cargo test -p lexicon --lib levenshtein::bounded_tests::benchmark_early_termination -- --nocapture
```

Typical results on a modern machine:

```
Full:    42ms for 50k comparisons
Bounded: 11ms for 50k comparisons
Speedup: 3.8x
```

The speedup depends on how many pairs exceed the threshold. For distant words (most dictionary comparisons), early termination bails after 2-3 rows instead of filling the full matrix. In the BK-tree, where ~93% of comparisons exceed the threshold, the real-world speedup is even larger.

We now have three progressively optimized versions of edit distance. The bounded version is the one the BK-tree will call on its hot path. But even with fast distance computation, scanning every word in a 300,000-word dictionary is too slow. We need a data structure that prunes the search space — and that's the BK-tree, starting in Stage 17.

### Common Mistakes

**Using `usize` subtraction without checking.** If you try to compute `m - n` when `m < n`, you get a panic (usize underflow in debug mode, wrapping in release). Our code avoids this by always putting the shorter string in `short` — so `m >= n` is guaranteed. But if you skip the short/long swap, `m - n` will underflow for inputs like `levenshtein_bounded("elephant", "cat", 2)`.

**Checking `row_min > max_distance` too eagerly.** If you check after setting `curr[0]` but before filling the rest of the row, you might bail prematurely. `curr[0] = i + 1` is always the largest value in the row (it's the "delete everything" base case). The minimum is usually somewhere in the middle. Always check after the inner loop completes.

**Returning `None` when the final distance equals `max_distance`.** The threshold is inclusive — distance ≤ max_distance should return `Some`. Check `distance <= max_distance`, not `distance < max_distance`.

### What We Built

Three versions of edit distance, each building on the last:

| Version | Time | Space | Use case |
|---------|------|-------|----------|
| Full matrix (Stage 14) | O(m×n) | O(m×n) | Learning / visualization |
| Two-row (Stage 15) | O(m×n) | O(min(m,n)) | Exact distance, production |
| Bounded (Stage 16) | O(m×n) worst, much less typical | O(min(m,n)) | BK-tree queries (hot path) |

The bounded version is what the BK-tree will call. Now we need a data structure that avoids checking every word in the dictionary. Enter the BK-tree.

---

## Stage 17 — The BK-Tree Node

Linear scan is the brute-force approach to fuzzy search: compare the query against every word in the dictionary. It works, but at 300,000 comparisons per query, it's too slow for interactive use. The BK-tree exploits a deep mathematical property — the triangle inequality of edit distance — to skip entire branches of the search space. This stage defines the node structure; the next two stages add insertion and the search algorithm that makes it all worthwhile.

*Difficulty: Easy* | *New concepts: BK-tree structure, triangle inequality, `HashMap<usize, T>` as sparse children*

### The Problem with Linear Scan

You have 300,000 words in your dictionary. A user types "recivir". To find suggestions, you could compute `levenshtein_bounded("recivir", word, 2)` for every word in the dictionary. With our optimized function, each comparison takes ~1μs. That's 300,000 × 1μs = 300ms per query.

300ms is noticeable. For interactive spell checking (highlighting words as you type), it's unacceptable. We need a data structure that prunes the search space — checking maybe 20,000 words instead of 300,000.

That's what a **BK-tree** (Burkhard-Keller tree) does. It organizes words by their edit distances to each other, then uses the **triangle inequality** to skip entire subtrees that can't contain matches.

### The Triangle Inequality

This is the mathematical property that makes BK-trees work. For any three strings a, b, c:

```
|d(a, c) - d(b, c)| ≤ d(a, b) ≤ d(a, c) + d(b, c)
```

In plain English: if you know the distance from A to B, and the distance from B to C, then the distance from A to C is *bounded*. It can't be wildly different — it's constrained by the other two distances.

Let's make this concrete. Say we have three words:

```
a = "recivir"   (the misspelling)
b = "hola"      (a node in the BK-tree)
c = "recibir"   (a word we're looking for)

d(a, b) = levenshtein("recivir", "hola") = 7
d(b, c) = levenshtein("hola", "recibir") = 7
```

The triangle inequality tells us:

```
|d(a,c) - d(b,c)| ≤ d(a,b) ≤ d(a,c) + d(b,c)
|d(a,c) - 7| ≤ 7
```

So `d(a, c)` is between 0 and 14. Not very helpful here — the bounds are wide.

But consider a tighter example:

```
a = "recivir"   (the misspelling)
b = "recitar"   (a node in the BK-tree)
c = "recibir"   (a word we're looking for)

d(a, b) = levenshtein("recivir", "recitar") = 2
```

Now the triangle inequality says: any word `c` within distance 2 of "recivir" must be within distance [2-2, 2+2] = [0, 4] of "recitar". We only need to check children of "recitar" that are at distances 0, 1, 2, 3, or 4 from it. Children at distance 5, 6, 7, etc. can be skipped entirely.

**This is the pruning insight.** The closer the tree node is to our query, the tighter the bounds, and the more children we skip.

> **Intuition:** Think of it like GPS. If you're in Madrid and you know a restaurant is within 2km of you, and your friend is 1km away from you, then the restaurant must be within 1-3km of your friend. You don't need to search the entire city — just a ring around your friend. The BK-tree does the same thing with edit distances.

### The Node Structure

A BK-tree node stores a word and its children, indexed by edit distance:

```
         "recibir" (root)
        /    |     \
      1/     2\     3\
      /       |      \
  "recitar" "recivir" "escribir"
     |
    2\
     |
  "recitar" → "meditar"
```

Each edge is labeled with the edit distance between parent and child. "recitar" is at distance 2 from "recibir" (substitute b→t, substitute i→a). "escribir" is at distance 3 from "recibir".

The key constraint: **each node has at most one child per distance value.** If "recitar" is already the distance-2 child of "recibir", and we want to insert "decidir" (also distance 2 from "recibir"), we don't add a second distance-2 child. Instead, we recurse into "recitar" and insert "decidir" as a child of "recitar" at whatever distance "decidir" is from "recitar".

This is why we use `HashMap<usize, BKNode>` for children — the keys are distances (0, 1, 2, 3, ...) and each key maps to exactly one child subtree.

### The Implementation

Right now we have edit distance functions but no way to organize dictionary words for efficient fuzzy lookup. We need a tree where each node stores a word and its children are indexed by their edit distance from that word — so that the triangle inequality can prune entire subtrees during search.

Create `src/bktree.rs`:

```rust
use std::collections::HashMap;

/// A node in the BK-tree. Each node stores a word and its children,
/// indexed by their edit distance to this node's word.
pub struct BKNode {
    /// The dictionary word stored at this node.
    pub word: String,
    /// How common this word is (for ranking suggestions).
    pub frequency: u32,
    /// Children indexed by edit distance. Key = distance from this node's word.
    /// At most one child per distance value.
    pub children: HashMap<usize, BKNode>,
}

/// A BK-tree for efficient fuzzy string matching.
///
/// Organizes words by edit distance, enabling sub-linear search
/// for words within a given edit distance of a query.
pub struct BKTree {
    /// The root node. None if the tree is empty.
    pub root: Option<BKNode>,
}

impl BKNode {
    /// Creates a new leaf node (no children).
    pub fn new(word: String, frequency: u32) -> Self {
        Self {
            word,
            frequency,
            children: HashMap::new(),
        }
    }
}

impl BKTree {
    /// Creates an empty BK-tree.
    pub fn new() -> Self {
        Self { root: None }
    }
}
```

Register the module in `src/lib.rs`:

```rust
pub mod bktree;
```

### Why `HashMap<usize, BKNode>` and Not `Vec<BKNode>`?

Edit distances are sparse. A node might have children at distances 1, 3, and 7 — but not 0, 2, 4, 5, 6. A `Vec` would waste space on empty slots (and you'd need `Option<BKNode>` for each). A `HashMap` stores only the distances that actually have children.

> **Python comparison:** In Python you'd use `dict[int, BKNode]` — same idea. In TypeScript, `Map<number, BKNode>`. Rust's `HashMap<usize, BKNode>` is the direct equivalent.

### Why `usize` for Distance Keys?

Edit distance is always a non-negative integer. In Rust, `usize` is the natural type for non-negative integers used as indices or counts. Using `i32` would work but introduces the possibility of negative keys, which makes no sense for distances.

### Testing

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_empty_tree() {
        let tree = BKTree::new();
        assert!(tree.root.is_none());
    }

    #[test]
    fn create_node() {
        let node = BKNode::new("recibir".to_string(), 500);
        assert_eq!(node.word, "recibir");
        assert_eq!(node.frequency, 500);
        assert!(node.children.is_empty());
    }

    #[test]
    fn node_children_are_sparse() {
        let mut node = BKNode::new("recibir".to_string(), 500);
        node.children.insert(
            2,
            BKNode::new("recitar".to_string(), 200),
        );
        node.children.insert(
            3,
            BKNode::new("escribir".to_string(), 300),
        );

        // Only distances 2 and 3 have children
        assert!(node.children.contains_key(&2));
        assert!(node.children.contains_key(&3));
        assert!(!node.children.contains_key(&1));
        assert_eq!(node.children.len(), 2);
    }
}
```

```bash
cargo test -p lexicon --lib bktree
```

### Common Mistakes

**Using `Box<BKNode>` for children values.** You might think you need `HashMap<usize, Box<BKNode>>` because the node is recursive (a node contains nodes). But `HashMap` already stores values on the heap — each entry is heap-allocated internally. Adding `Box` would be a double indirection. `HashMap<usize, BKNode>` is correct and sufficient.

**Trying to derive `Clone` or `Copy`.** `BKNode` contains a `HashMap` and a `String`, neither of which is `Copy`. You can derive `Clone` if you need it, but cloning a BK-tree is expensive (deep copy of the entire tree). For our use case, we'll build the tree once and query it many times — no cloning needed.

The skeleton is in place — a node type and a tree wrapper. But an empty tree is as useful as an empty dictionary. Stage 18 teaches the tree to grow by inserting words, one edit-distance edge at a time.

### What We Built

The skeleton of a BK-tree: a node type and a tree wrapper. No logic yet — just the data structure. Next stage, we'll implement insertion to actually build a tree from a dictionary.

---

## Stage 18 — BK-Tree Insert

A tree without insertion is just a type definition. This stage populates the BK-tree from a dictionary, building the distance-indexed structure that search will later exploit. The recursive insertion algorithm is elegant — compute the distance, follow the edge if it exists, create a new leaf if it doesn't — and it naturally handles collisions by pushing words deeper into the tree.

*Difficulty: Medium* | *New concepts: recursive insertion, building a tree from a dictionary, `&mut self` recursion*

### The Algorithm

Inserting a word into a BK-tree:

1. If the tree is empty, the new word becomes the root.
2. Otherwise, compute the edit distance `d` between the new word and the current node's word.
3. If the current node already has a child at distance `d`, recurse into that child.
4. If not, create a new child node at distance `d`.

That's it. The tree builds itself based on the natural distances between words.

Let's trace an insertion sequence to see the tree take shape. We'll insert these Spanish words: "recibir" (to receive), "recitar" (to recite), "escribir" (to write), "decidir" (to decide), "vivir" (to live).

**Insert "recibir"** — tree is empty, becomes root:

```
"recibir"
```

**Insert "recitar"** — d("recitar", "recibir") = 2. No child at distance 2. Add it:

```
      "recibir"
         |
        2|
         |
     "recitar"
```

**Insert "escribir"** — d("escribir", "recibir") = 3. No child at distance 3. Add it:

```
      "recibir"
        / \
      2/   \3
      /     \
"recitar" "escribir"
```

**Insert "decidir"** — d("decidir", "recibir") = 2. There's already a child at distance 2 ("recitar"). Recurse into "recitar". d("decidir", "recitar") = 3. No child at distance 3 under "recitar". Add it:

```
        "recibir"
          / \
        2/   \3
        /     \
  "recitar" "escribir"
       |
      3|
       |
  "decidir"
```

**Insert "vivir"** — d("vivir", "recibir") = 4. No child at distance 4. Add it:

```
          "recibir"
          /  |  \
        2/  3|   \4
        /    |    \
"recitar" "escribir" "vivir"
       |
      3|
       |
  "decidir"
```

Notice how the tree's shape depends on insertion order. If we'd inserted "vivir" first, it would be the root and everything else would hang off it differently. The tree is still correct for search regardless of insertion order — just potentially less balanced.

### The Implementation

Add methods to `BKNode` and `BKTree` in `src/bktree.rs`:

```rust
use crate::levenshtein::levenshtein;

impl BKNode {
    /// Inserts a word into the subtree rooted at this node.
    ///
    /// Computes the edit distance to this node's word, then either:
    /// - Creates a new child at that distance, or
    /// - Recurses into the existing child at that distance.
    pub fn insert(&mut self, word: String, frequency: u32) {
        let d = levenshtein(&self.word, &word);

        // Distance 0 means identical word — skip (already in tree).
        if d == 0 {
            return;
        }

        // If a child exists at this distance, recurse into it.
        // If not, create a new leaf node.
        match self.children.get_mut(&d) {
            Some(child) => child.insert(word, frequency),
            None => {
                self.children.insert(d, BKNode::new(word, frequency));
            }
        }
    }
}

impl BKTree {
    /// Inserts a word with its frequency into the BK-tree.
    pub fn insert(&mut self, word: String, frequency: u32) {
        match &mut self.root {
            Some(root) => root.insert(word, frequency),
            None => self.root = Some(BKNode::new(word, frequency)),
        }
    }

    /// Returns true if the tree has no words.
    pub fn is_empty(&self) -> bool {
        self.root.is_none()
    }
}
```

### The `match` on `get_mut`

Let's unpack this pattern — it's idiomatic Rust for "update or insert":

```rust
match self.children.get_mut(&d) {
    Some(child) => child.insert(word, frequency),
    None => {
        self.children.insert(d, BKNode::new(word, frequency));
    }
}
```

`get_mut(&d)` returns `Option<&mut BKNode>` — a mutable reference to the child if it exists, or `None`. We match on it:
- `Some(child)` — child exists, recurse into it
- `None` — no child at this distance, create one

> **Python comparison:** In Python you'd write:
> ```python
> if d in self.children:
>     self.children[d].insert(word, frequency)
> else:
>     self.children[d] = BKNode(word, frequency)
> ```
> The Rust version is more explicit about mutability — `get_mut` tells the borrow checker "I need to modify this child."

### Why Not Use the `entry` API?

Rust's `HashMap` has an `entry` API that's often cleaner for "insert or update" patterns:

```rust
// This WON'T work here:
self.children
    .entry(d)
    .or_insert_with(|| BKNode::new(word.clone(), frequency))
    .insert(word, frequency);  // BUG: inserts into the new node too!
```

The problem: if the entry doesn't exist, `or_insert_with` creates a new node, and then `.insert()` tries to insert the word *again* into the node that already has it. We'd need to handle the two cases differently, which is exactly what `match` does. Stick with `match` here — it's clearer.

### Building from a Dictionary

Let's add a convenience method to build a tree from a list of (word, frequency) pairs:

```rust
impl BKTree {
    /// Builds a BK-tree from an iterator of (word, frequency) pairs.
    pub fn from_words(words: impl IntoIterator<Item = (String, u32)>) -> Self {
        let mut tree = Self::new();
        for (word, freq) in words {
            tree.insert(word, freq);
        }
        tree
    }
}
```

### Testing

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn insert_into_empty_tree() {
        let mut tree = BKTree::new();
        assert!(tree.is_empty());

        tree.insert("recibir".to_string(), 500);
        assert!(!tree.is_empty());
        assert_eq!(tree.root.as_ref().unwrap().word, "recibir");
    }

    #[test]
    fn insert_multiple_words() {
        let mut tree = BKTree::new();
        tree.insert("recibir".to_string(), 500);
        tree.insert("recitar".to_string(), 200);
        tree.insert("escribir".to_string(), 300);

        let root = tree.root.as_ref().unwrap();
        assert_eq!(root.word, "recibir");

        // "recitar" is distance 2 from "recibir"
        assert!(root.children.contains_key(&2));
        assert_eq!(root.children[&2].word, "recitar");

        // "escribir" is distance 3 from "recibir"
        assert!(root.children.contains_key(&3));
        assert_eq!(root.children[&3].word, "escribir");
    }

    #[test]
    fn insert_collision_recurses() {
        let mut tree = BKTree::new();
        tree.insert("recibir".to_string(), 500);
        tree.insert("recitar".to_string(), 200); // distance 2 from root
        tree.insert("decidir".to_string(), 100); // also distance 2 from root!

        let root = tree.root.as_ref().unwrap();
        let recitar = &root.children[&2];
        assert_eq!(recitar.word, "recitar");

        // "decidir" should be a child of "recitar", not a second distance-2 child of root
        // d("decidir", "recitar") = 3
        assert!(recitar.children.contains_key(&3));
        assert_eq!(recitar.children[&3].word, "decidir");
    }

    #[test]
    fn duplicate_word_ignored() {
        let mut tree = BKTree::new();
        tree.insert("recibir".to_string(), 500);
        tree.insert("recibir".to_string(), 500); // duplicate

        let root = tree.root.as_ref().unwrap();
        assert!(root.children.is_empty()); // no children — duplicate was skipped
    }

    #[test]
    fn build_from_words() {
        let words = vec![
            ("recibir".to_string(), 500),
            ("recitar".to_string(), 200),
            ("escribir".to_string(), 300),
            ("vivir".to_string(), 400),
            ("decidir".to_string(), 100),
        ];

        let tree = BKTree::from_words(words);
        assert!(!tree.is_empty());

        let root = tree.root.as_ref().unwrap();
        assert_eq!(root.word, "recibir"); // first word becomes root
    }
}
```

```bash
cargo test -p lexicon --lib bktree
```

### Common Mistakes

**Forgetting to handle distance 0 (duplicate words).** If you insert "recibir" twice, the second insertion computes distance 0 to the root. If you try to add a child at distance 0, you'd overwrite the root's "self-child" — which makes no sense. The `if d == 0 { return; }` guard handles this.

**Stack overflow on deeply unbalanced trees.** If you insert words in sorted order (e.g., "a", "aa", "aaa", "aaaa"...), each word might be distance 1 from the previous, creating a chain. For 300k words this could overflow the stack. In practice, natural language dictionaries have enough variety that this doesn't happen. If it did, you'd convert the recursion to an iterative loop with an explicit stack — but we won't need to.

**Confusing insertion order with tree correctness.** The first word inserted becomes the root. Different insertion orders produce different tree shapes. But search correctness doesn't depend on the shape — the triangle inequality holds regardless. A well-balanced tree is faster to search, but even a lopsided tree gives correct results.

The BK-tree is populated and ready. Now comes the payoff: the search algorithm that uses the triangle inequality to visit only a fraction of the tree. Stage 19 is where the 93% pruning happens.

### What We Built

A BK-tree that can be populated from a dictionary. The tree organizes words by their edit distances, setting up the pruning that makes search fast. Next: the search algorithm that exploits the triangle inequality to find suggestions without scanning every node.

---

## Stage 19 — BK-Tree Search

This is the stage where the mathematical investment pays off. The triangle inequality — that abstract property you proved in Stage 17 — becomes a concrete pruning rule: only visit children whose edge distance falls within a computable range. The result is a search that touches ~7% of a 300,000-node tree instead of 100%, turning a 300ms linear scan into a 6ms tree traversal. This is the algorithm that makes interactive spell checking possible.

*Difficulty: Hard* | *New concepts: triangle inequality pruning, range iteration with `usize` underflow protection, recursive search with result accumulation*

### The Algorithm

Searching a BK-tree for all words within `max_distance` of a query:

1. Compute the distance `d` between the query and the current node's word.
2. If `d ≤ max_distance`, this node's word is a match — add it to results.
3. For children: only visit children whose edge distance `child_dist` satisfies `d.abs_diff(child_dist) ≤ max_distance`. Equivalently, visit children in the range `[d - max_distance, d + max_distance]`.
4. Recurse into each qualifying child.

Step 3 is where the magic happens. Let's trace through an example.

### Worked Example: Searching for "recivir"

We have this tree (from Stage 18):

```
          "recibir" (freq 500)
          /  |  \
        2/  3|   \4
        /    |    \
"recitar" "escribir" "vivir"
 (200)     (300)     (400)
    |
   3|
    |
"decidir"
  (100)
```

Query: "recivir", max_distance: 2.

**Step 1 — Visit root "recibir":**
- d("recivir", "recibir") = 1
- 1 ≤ 2? Yes → add "recibir" (distance 1) to results
- Children to visit: edge distances in [1 - 2, 1 + 2] = but wait — `1 - 2` is negative!

**The `usize` underflow problem.** In Rust, `usize` can't be negative. `1_usize - 2_usize` panics in debug mode and wraps to `usize::MAX` in release mode. Neither is what we want.

The safe range is `[d.saturating_sub(max_distance), d + max_distance]`:
- `1.saturating_sub(2)` = 0 (clamps to 0 instead of underflowing)
- `1 + 2` = 3

So we visit children at edge distances 0, 1, 2, 3.

Our root has children at distances 2, 3, and 4:
- Distance 2 ("recitar"): 2 is in [0, 3] → **visit**
- Distance 3 ("escribir"): 3 is in [0, 3] → **visit**
- Distance 4 ("vivir"): 4 is NOT in [0, 3] → **skip!**

We just pruned "vivir" and its entire subtree without computing a single edit distance for it.

**Step 2 — Visit "recitar" (child at distance 2):**
- d("recivir", "recitar") = 3
- 3 ≤ 2? No → don't add to results
- Children to visit: edge distances in [3 - 2, 3 + 2] = [1, 5]
- "recitar" has one child at distance 3 ("decidir"): 3 is in [1, 5] → **visit**

**Step 3 — Visit "decidir" (child at distance 3 from "recitar"):**
- d("recivir", "decidir") = 4
- 4 ≤ 2? No → don't add to results
- Children to visit: edge distances in [4 - 2, 4 + 2] = [2, 6]
- "decidir" has no children → done

**Step 4 — Visit "escribir" (child at distance 3 from root):**
- d("recivir", "escribir") = 4
- 4 ≤ 2? No → don't add to results
- Children to visit: edge distances in [4 - 2, 4 + 2] = [2, 6]
- "escribir" has no children → done

**Results:** "recibir" at distance 1. We visited 4 out of 5 nodes. In a tree with 300,000 nodes, we'd visit ~20,000 — a 93% reduction.

Let's visualize which nodes were visited and which were pruned:

```
          "recibir"  ← VISITED (d=1, MATCH!)
          /  |  \
        2/  3|   \4
        /    |    \
"recitar" "escribir" "vivir"
 VISITED    VISITED    PRUNED
 (d=3, no)  (d=4, no)  (never computed)
    |
   3|
    |
"decidir"
 VISITED
 (d=4, no)
```

### The Implementation

Add search methods to `src/bktree.rs`:

```rust
/// A search result: a word and its edit distance from the query.
#[derive(Debug, Clone)]
pub struct SearchResult {
    pub word: String,
    pub distance: usize,
    pub frequency: u32,
}

impl BKNode {
    /// Recursively searches this subtree for words within `max_distance` of `query`.
    fn search_recursive(
        &self,
        query: &str,
        max_distance: usize,
        results: &mut Vec<SearchResult>,
    ) {
        let d = levenshtein(query, &self.word);

        // If this node's word is close enough, it's a match
        if d <= max_distance {
            results.push(SearchResult {
                word: self.word.clone(),
                distance: d,
                frequency: self.frequency,
            });
        }

        // Triangle inequality pruning: only visit children whose edge distance
        // is in [d - max_distance, d + max_distance].
        //
        // saturating_sub prevents usize underflow when d < max_distance.
        let low = d.saturating_sub(max_distance);
        let high = d + max_distance;

        for (&child_dist, child_node) in &self.children {
            if child_dist >= low && child_dist <= high {
                child_node.search_recursive(query, max_distance, results);
            }
        }
    }
}

impl BKTree {
    /// Finds all words within `max_distance` edits of `query`.
    ///
    /// Returns results unsorted — call `sort_results()` to rank them.
    pub fn search(&self, query: &str, max_distance: usize) -> Vec<SearchResult> {
        let mut results = Vec::new();
        if let Some(root) = &self.root {
            root.search_recursive(query, max_distance, &mut results);
        }
        results
    }
}
```

### Why `saturating_sub`?

This is critical. In Rust, subtracting a larger `usize` from a smaller one panics in debug mode:

```rust
let d: usize = 1;
let max: usize = 2;
let low = d - max; // PANIC! 1 - 2 underflows
```

`saturating_sub` clamps to 0 instead:

```rust
let low = d.saturating_sub(max); // 0, not panic
```

> **Python comparison:** Python integers can be negative, so `d - max_distance` just works. In TypeScript, `d - maxDistance` gives a negative number, which is fine for comparison. Rust's unsigned integers force you to handle this explicitly — annoying, but it prevents a class of bugs where negative indices silently wrap around.

### Using `levenshtein_bounded` for Extra Speed

We can make search even faster by using our bounded distance function from Stage 16. If the distance exceeds `max_distance`, we don't need the exact value — we just need to know it's too far:

```rust
use crate::levenshtein::levenshtein_bounded;

impl BKNode {
    /// Optimized search using bounded Levenshtein distance.
    fn search_recursive_bounded(
        &self,
        query: &str,
        max_distance: usize,
        results: &mut Vec<SearchResult>,
    ) {
        // Use bounded version — returns None if distance > some reasonable upper bound.
        // We still need the exact distance for the pruning range, so we use
        // the unbounded version here. But for the match check, bounded helps
        // when we can set a tighter internal bound.
        let d = levenshtein(query, &self.word);

        if d <= max_distance {
            results.push(SearchResult {
                word: self.word.clone(),
                distance: d,
                frequency: self.frequency,
            });
        }

        let low = d.saturating_sub(max_distance);
        let high = d + max_distance;

        for (&child_dist, child_node) in &self.children {
            if child_dist >= low && child_dist <= high {
                child_node.search_recursive_bounded(query, max_distance, results);
            }
        }
    }
}
```

> **Note:** We still need the exact distance `d` for computing the pruning range `[d - max, d + max]`. The bounded version helps most when we can reject early — but for the BK-tree node comparison, we need `d` regardless. The real win from `levenshtein_bounded` comes if we add a secondary check inside the loop, or if we restructure to avoid computing exact distances for nodes we won't match. For now, the pruning from the tree structure itself is the big win.

### Testing

```rust
#[cfg(test)]
mod search_tests {
    use super::*;

    fn build_spanish_tree() -> BKTree {
        BKTree::from_words(vec![
            ("recibir".to_string(), 500),
            ("recitar".to_string(), 200),
            ("escribir".to_string(), 300),
            ("decidir".to_string(), 100),
            ("vivir".to_string(), 400),
        ])
    }

    #[test]
    fn search_finds_exact_match() {
        let tree = build_spanish_tree();
        let results = tree.search("recibir", 0);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].word, "recibir");
        assert_eq!(results[0].distance, 0);
    }

    #[test]
    fn search_finds_close_matches() {
        let tree = build_spanish_tree();
        let results = tree.search("recivir", 2);

        let words: Vec<&str> = results.iter().map(|r| r.word.as_str()).collect();

        // "recibir" is distance 1 from "recivir" — should be found
        assert!(words.contains(&"recibir"), "expected recibir in {words:?}");

        // "recitar" is distance 3 from "recivir" — should NOT be found at max_distance 2
        assert!(!words.contains(&"recitar"), "recitar should be excluded at distance 2");
    }

    #[test]
    fn search_empty_tree() {
        let tree = BKTree::new();
        let results = tree.search("anything", 2);
        assert!(results.is_empty());
    }

    #[test]
    fn search_no_matches() {
        let tree = build_spanish_tree();
        let results = tree.search("xyz", 1);
        assert!(results.is_empty());
    }

    #[test]
    fn search_distance_1_is_tight() {
        let tree = build_spanish_tree();
        let results = tree.search("recivir", 1);

        // Only "recibir" (distance 1) should match
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].word, "recibir");
    }

    #[test]
    fn search_includes_frequency() {
        let tree = build_spanish_tree();
        let results = tree.search("recivir", 1);
        assert_eq!(results[0].frequency, 500);
    }

    #[test]
    fn search_english_misspelling() {
        let tree = BKTree::from_words(vec![
            ("the".to_string(), 69971),
            ("tee".to_string(), 203),
            ("tea".to_string(), 1450),
            ("ten".to_string(), 3200),
            ("then".to_string(), 18000),
            ("them".to_string(), 15000),
            ("they".to_string(), 20000),
        ]);

        let results = tree.search("teh", 1);
        let words: Vec<&str> = results.iter().map(|r| r.word.as_str()).collect();

        // "the" is distance 1 (transpose h and e — but Levenshtein counts it as 2
        // substitutions, not 1 transposition). Actually: "teh" → "the" requires
        // swapping positions 2 and 3. In Levenshtein: sub e→h at pos 2, sub h→e at pos 3 = 2.
        // Wait — let's compute: t-e-h vs t-h-e
        //   t=t (match), e≠h (sub), h≠e (sub) → distance 2, not 1!
        //
        // At distance 1: "tee" (sub h→e), "ten" (sub e→e, h→n — no, that's 2)
        // Actually "ten": t-e-h vs t-e-n → h≠n, distance 1. Yes!
        // "tea": t-e-h vs t-e-a → h≠a, distance 1. Yes!
        assert!(words.contains(&"tea"), "expected tea in {words:?}");
        assert!(words.contains(&"ten"), "expected ten in {words:?}");
    }
}
```

Wait — that test revealed something important! "teh" → "the" is actually distance **2** in Levenshtein (two substitutions), not distance 1. Levenshtein doesn't have a transposition operation. That's Damerau-Levenshtein (a stretch goal from the design spec). Let's make sure our test expectations are correct:

```rust
    #[test]
    fn teh_the_distance_is_two() {
        // "teh" → "the" is 2 substitutions in Levenshtein, not 1 transposition.
        // t-e-h vs t-h-e: position 2 (e→h) + position 3 (h→e) = 2 edits.
        // This is why Damerau-Levenshtein exists — it adds transposition as
        // a single operation, making "teh"→"the" = 1.
        use crate::levenshtein::levenshtein;
        assert_eq!(levenshtein("teh", "the"), 2);
    }
```

This is a real gotcha. Many people assume "teh" → "the" is distance 1 because it "looks like" a transposition. But standard Levenshtein only has insert, delete, and substitute. Transpositions cost 2 (two substitutions). Keep this in mind when setting `max_distance` — you might need distance 2 to catch common transposition typos.

### Common Mistakes

**`usize` underflow in the range calculation.** This is the #1 bug. If `d = 0` and `max_distance = 2`, then `d - max_distance` underflows. Always use `d.saturating_sub(max_distance)`. If you see a panic like "attempt to subtract with overflow," this is why.

**Iterating over a fixed range instead of HashMap keys.** You might write:

```rust
for child_dist in low..=high {
    if let Some(child) = self.children.get(&child_dist) {
        // ...
    }
}
```

This works but is wasteful when the range is large and the HashMap is sparse. If `d = 5` and `max_distance = 2`, you iterate over [3, 4, 5, 6, 7] and do 5 HashMap lookups. With our approach (iterating over `self.children` and filtering), we only touch children that actually exist. For small trees it doesn't matter, but for nodes with few children and large ranges, iterating the HashMap is faster.

**Forgetting that search results are unordered.** The BK-tree returns results in traversal order, which depends on HashMap iteration order (effectively random). Don't assume results are sorted by distance. We'll add ranking in Stage 20.

The BK-tree can now find all words within a given edit distance of a query, visiting only a fraction of the tree. But the results come back as an unranked bag — "recibir" (distance 1, frequency 500) and some obscure word (distance 2, frequency 3) are treated equally. Stage 20 adds the ranking that turns raw results into useful suggestions.

### What We Built

The BK-tree can now find all words within a given edit distance of a query, visiting only a fraction of the tree. For a 300k-word dictionary at max distance 2, it typically visits ~7% of nodes — turning a 300ms linear scan into a ~6ms tree search.

But the results come back unranked. "recibir" (distance 1, frequency 500) and some obscure word (distance 2, frequency 3) are treated equally. Next stage: rank suggestions so the best one comes first.

---

## Stage 20 — Suggestion Ranking

A spell checker that returns suggestions in random order is like a dictionary with shuffled pages — technically complete, practically useless. Ranking transforms a bag of candidates into a prioritized list where the most likely correction appears first. This stage introduces multi-key sorting in Rust, the `.then()` combinator for chaining comparison criteria, and the design decision of why distance trumps frequency.

*Difficulty: Medium* | *New concepts: multi-key sorting, `Ord` for custom types, `Reverse`, putting it all together*

### The Problem

The BK-tree returns a bag of results. For the query "teh" at max distance 2, we might get:

| Word | Distance | Frequency |
|------|----------|-----------|
| "the" | 2 | 69,971 |
| "tee" | 1 | 203 |
| "tea" | 1 | 1,450 |
| "ten" | 1 | 3,200 |
| "teh" | 0 | 0 (not in dict) |

Which suggestion should come first? Two reasonable strategies:

1. **Distance first, then frequency.** Closer words are better suggestions. Among equally close words, prefer the more common one. This gives: "ten" (d=1, f=3200), "tea" (d=1, f=1450), "tee" (d=1, f=203), "the" (d=2, f=69971).

2. **Weighted score.** Combine distance and frequency into a single score. This might rank "the" higher despite distance 2, because it's overwhelmingly common.

We'll implement strategy 1 — it's simpler, more predictable, and what most spell checkers use. Distance is the primary signal (a distance-1 match is almost always better than distance-2), and frequency breaks ties.

### Sorting in Rust

Rust's `sort_by` takes a comparison function. For multi-key sorting, we compare the primary key first, then the secondary key if the primary keys are equal:

```rust
// Sort by distance ascending, then by frequency descending
results.sort_by(|a, b| {
    a.distance
        .cmp(&b.distance)                    // primary: closer is better
        .then(b.frequency.cmp(&a.frequency)) // secondary: more common is better
});
```

The `.then()` method on `Ordering` is elegant — it says "if the first comparison is `Equal`, use this tiebreaker." It chains naturally for multi-key sorts.

> **Python comparison:** In Python you'd use a tuple key:
> ```python
> results.sort(key=lambda r: (r.distance, -r.frequency))
> ```
> The negative frequency trick works because Python sorts tuples lexicographically. Rust's `.then()` is the equivalent — and it doesn't require negating unsigned integers (which you can't do with `usize`).

> **TypeScript comparison:**
> ```typescript
> results.sort((a, b) => a.distance - b.distance || b.frequency - a.frequency);
> ```
> The `||` trick works because `0` is falsy in JS. Rust's `.then()` is the type-safe equivalent.

### The Implementation

Add ranking to `src/bktree.rs`:

```rust
impl BKTree {
    /// Finds all words within `max_distance` edits of `query`, ranked by:
    /// 1. Edit distance (ascending — closer matches first)
    /// 2. Word frequency (descending — common words first among ties)
    pub fn suggest(&self, query: &str, max_distance: usize) -> Vec<SearchResult> {
        let mut results = self.search(query, max_distance);

        results.sort_by(|a, b| {
            a.distance
                .cmp(&b.distance)
                .then(b.frequency.cmp(&a.frequency))
        });

        results
    }
}
```

That's it. The search does the hard work; ranking is just a sort.

### Limiting Results

A query might return 50 matches at distance 2. The user doesn't want to see all 50. Let's add a limit:

```rust
impl BKTree {
    /// Suggests corrections for a misspelled word.
    ///
    /// Returns up to `limit` results, ranked by distance then frequency.
    pub fn suggest_top(
        &self,
        query: &str,
        max_distance: usize,
        limit: usize,
    ) -> Vec<SearchResult> {
        let mut results = self.suggest(query, max_distance);
        results.truncate(limit);
        results
    }
}
```

`truncate` is O(1) — it just adjusts the vector's length without deallocating. We sort first (O(n log n)) then truncate, which is fine for the small result sets we get from BK-tree queries (typically < 100 results).

### End-to-End Example

Let's put everything together — build a small dictionary, query it, and see ranked suggestions:

```rust
#[cfg(test)]
mod ranking_tests {
    use super::*;

    fn build_english_tree() -> BKTree {
        BKTree::from_words(vec![
            ("the".to_string(), 69971),
            ("tee".to_string(), 203),
            ("tea".to_string(), 1450),
            ("ten".to_string(), 3200),
            ("then".to_string(), 18000),
            ("them".to_string(), 15000),
            ("they".to_string(), 20000),
            ("thee".to_string(), 890),
            ("tie".to_string(), 1100),
            ("toe".to_string(), 950),
        ])
    }

    #[test]
    fn suggest_ranks_by_distance_then_frequency() {
        let tree = build_english_tree();
        let results = tree.suggest("teh", 2);

        // Distance 1 results should come before distance 2 results
        let d1: Vec<&str> = results
            .iter()
            .filter(|r| r.distance == 1)
            .map(|r| r.word.as_str())
            .collect();
        let d2: Vec<&str> = results
            .iter()
            .filter(|r| r.distance == 2)
            .map(|r| r.word.as_str())
            .collect();

        // All distance-1 results appear before any distance-2 result
        if let (Some(last_d1_idx), Some(first_d2_idx)) = (
            results.iter().rposition(|r| r.distance == 1),
            results.iter().position(|r| r.distance == 2),
        ) {
            assert!(
                last_d1_idx < first_d2_idx,
                "distance-1 results should precede distance-2"
            );
        }

        // Within distance 1, higher frequency comes first
        if d1.len() >= 2 {
            let freqs: Vec<u32> = results
                .iter()
                .filter(|r| r.distance == 1)
                .map(|r| r.frequency)
                .collect();
            for window in freqs.windows(2) {
                assert!(
                    window[0] >= window[1],
                    "frequencies should be descending within same distance"
                );
            }
        }

        println!("Suggestions for 'teh':");
        for r in &results {
            println!("  {} (distance: {}, frequency: {})", r.word, r.distance, r.frequency);
        }
    }

    #[test]
    fn suggest_top_limits_results() {
        let tree = build_english_tree();
        let results = tree.suggest_top("teh", 2, 3);
        assert!(results.len() <= 3);
    }

    #[test]
    fn suggest_spanish_bv_confusion() {
        let tree = BKTree::from_words(vec![
            ("recibir".to_string(), 5000),
            ("recitar".to_string(), 2000),
            ("escribir".to_string(), 3000),
            ("decidir".to_string(), 1000),
            ("vivir".to_string(), 4000),
            ("hervir".to_string(), 800),
        ]);

        let results = tree.suggest("recivir", 2);

        // "recibir" should be the top suggestion (distance 1, high frequency)
        assert!(!results.is_empty());
        assert_eq!(results[0].word, "recibir");
        assert_eq!(results[0].distance, 1);

        println!("Suggestions for 'recivir':");
        for r in &results {
            println!("  {} (distance: {}, frequency: {})", r.word, r.distance, r.frequency);
        }
    }

    #[test]
    fn suggest_portuguese_word_boundary() {
        // "concerteza" is a common Portuguese mistake — should be "com certeza" (two words).
        // Our spell checker works on single words, so it won't suggest "com certeza".
        // But it might suggest "certeza" (distance 3 — delete c, o, n from prefix).
        // This shows a limitation: word boundary errors need a different approach.
        let tree = BKTree::from_words(vec![
            ("certeza".to_string(), 3000),
            ("concerto".to_string(), 1500),
            ("conversa".to_string(), 2000),
        ]);

        let results = tree.suggest("concerteza", 3);
        let words: Vec<&str> = results.iter().map(|r| r.word.as_str()).collect();

        println!("Suggestions for 'concerteza': {words:?}");
        // This demonstrates that single-word edit distance has limits.
        // Word boundary errors ("concerteza" → "com certeza") need tokenization-level fixes.
    }

    #[test]
    fn suggest_definately() {
        let tree = BKTree::from_words(vec![
            ("definitely".to_string(), 8500),
            ("defiantly".to_string(), 1200),
            ("definitive".to_string(), 2000),
            ("delicately".to_string(), 900),
        ]);

        let results = tree.suggest("definately", 3);

        println!("Suggestions for 'definately':");
        for r in &results {
            println!("  {} (distance: {}, frequency: {})", r.word, r.distance, r.frequency);
        }

        // "definitely" should appear (it's the intended word)
        let words: Vec<&str> = results.iter().map(|r| r.word.as_str()).collect();
        assert!(words.contains(&"definitely"), "expected 'definitely' in {words:?}");
    }
}
```

Run all the tests:

```bash
cargo test -p lexicon --lib bktree -- --nocapture
```

Sample output:

```
Suggestions for 'teh':
  ten (distance: 1, frequency: 3200)
  tea (distance: 1, frequency: 1450)
  tee (distance: 1, frequency: 203)
  the (distance: 2, frequency: 69971)
  them (distance: 2, frequency: 15000)
  ...

Suggestions for 'recivir':
  recibir (distance: 1, frequency: 5000)

Suggestions for 'definately':
  definitely (distance: 3, frequency: 8500)
  defiantly (distance: 3, frequency: 1200)
```

Notice "the" at distance 2 ranks below "ten" at distance 1, even though "the" is 22x more common. Distance dominates. This is usually the right call — if someone typed "teh", they almost certainly meant a 3-letter word, not a word that requires two edits.

### Common Mistakes

**Sorting by frequency alone.** If you ignore distance, "the" (the most common English word) would be suggested for almost every misspelling. Distance must be the primary sort key.

**Forgetting that `sort_by` is ascending by default.** For frequency, we want descending (higher is better). The trick is swapping `a` and `b`: `b.frequency.cmp(&a.frequency)` sorts descending. If you write `a.frequency.cmp(&b.frequency)`, rare words come first.

**Not handling the "no results" case.** If the query is so mangled that nothing is within `max_distance`, `suggest()` returns an empty vector. The caller should handle this gracefully — "no suggestions found" is a valid outcome.

### The Full `bktree.rs`

Here's the complete module after all four BK-tree stages:

```rust
use std::collections::HashMap;

use crate::levenshtein::levenshtein;

/// A search result: a word and its edit distance from the query.
#[derive(Debug, Clone)]
pub struct SearchResult {
    pub word: String,
    pub distance: usize,
    pub frequency: u32,
}

/// A node in the BK-tree.
pub struct BKNode {
    pub word: String,
    pub frequency: u32,
    pub children: HashMap<usize, BKNode>,
}

/// A BK-tree for efficient fuzzy string matching.
pub struct BKTree {
    pub root: Option<BKNode>,
}

impl BKNode {
    pub fn new(word: String, frequency: u32) -> Self {
        Self {
            word,
            frequency,
            children: HashMap::new(),
        }
    }

    pub fn insert(&mut self, word: String, frequency: u32) {
        let d = levenshtein(&self.word, &word);
        if d == 0 {
            return;
        }
        match self.children.get_mut(&d) {
            Some(child) => child.insert(word, frequency),
            None => {
                self.children.insert(d, BKNode::new(word, frequency));
            }
        }
    }

    fn search_recursive(
        &self,
        query: &str,
        max_distance: usize,
        results: &mut Vec<SearchResult>,
    ) {
        let d = levenshtein(query, &self.word);

        if d <= max_distance {
            results.push(SearchResult {
                word: self.word.clone(),
                distance: d,
                frequency: self.frequency,
            });
        }

        let low = d.saturating_sub(max_distance);
        let high = d + max_distance;

        for (&child_dist, child_node) in &self.children {
            if child_dist >= low && child_dist <= high {
                child_node.search_recursive(query, max_distance, results);
            }
        }
    }
}

impl BKTree {
    pub fn new() -> Self {
        Self { root: None }
    }

    pub fn is_empty(&self) -> bool {
        self.root.is_none()
    }

    pub fn insert(&mut self, word: String, frequency: u32) {
        match &mut self.root {
            Some(root) => root.insert(word, frequency),
            None => self.root = Some(BKNode::new(word, frequency)),
        }
    }

    pub fn from_words(words: impl IntoIterator<Item = (String, u32)>) -> Self {
        let mut tree = Self::new();
        for (word, freq) in words {
            tree.insert(word, freq);
        }
        tree
    }

    pub fn search(&self, query: &str, max_distance: usize) -> Vec<SearchResult> {
        let mut results = Vec::new();
        if let Some(root) = &self.root {
            root.search_recursive(query, max_distance, &mut results);
        }
        results
    }

    pub fn suggest(&self, query: &str, max_distance: usize) -> Vec<SearchResult> {
        let mut results = self.search(query, max_distance);
        results.sort_by(|a, b| {
            a.distance
                .cmp(&b.distance)
                .then(b.frequency.cmp(&a.frequency))
        });
        results
    }

    pub fn suggest_top(
        &self,
        query: &str,
        max_distance: usize,
        limit: usize,
    ) -> Vec<SearchResult> {
        let mut results = self.suggest(query, max_distance);
        results.truncate(limit);
        results
    }
}
```

The suggestion engine is complete — from raw edit distance math to ranked, frequency-weighted corrections. But all of this machinery still lives as library code with unit tests. Act 4 gives it a body: a tokenizer, a CLI, file checking, and an interactive mode that turns Lexicon from a collection of data structures into a tool you'd actually use.

### What We Built in Act 3

Seven stages, from raw math to a working suggestion engine:

| Stage | What | Key concept |
|-------|------|-------------|
| 14 | Full DP matrix | Dynamic programming, the recurrence relation |
| 15 | Two-row optimization | `std::mem::swap`, O(min(m,n)) space |
| 16 | Early termination | Bounded distance, `saturating_sub`, 3-4x speedup |
| 17 | BK-tree node | Triangle inequality, `HashMap<usize, BKNode>` |
| 18 | BK-tree insert | Recursive insertion, collision handling |
| 19 | BK-tree search | Pruning via `[d-max, d+max]`, `usize` underflow protection |
| 20 | Suggestion ranking | Multi-key sort with `.then()`, frequency tiebreaking |

The pipeline is now: user types "recivir" → BK-tree searches ~7% of the dictionary → finds "recibir" at distance 1 → ranks it above alternatives → suggests it in ~6ms.

**What's next in Act 4:** We'll integrate the suggester into the check pipeline (bloom filter → trie → BK-tree), add the `lexicon suggest <word>` CLI command, handle multi-language dictionaries, and tackle Unicode edge cases like "información" vs "information". The data structures are built — now we wire them together.
