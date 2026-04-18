# Act 2 — The Gatekeeper

> *"Before you search the library, ask the bouncer."*

In Act 1 you built a trie — a tree that stores every word in the dictionary. It works, but there's a problem: when someone types "recivir" (a misspelling of the Spanish *recibir*), your trie walks through nodes `r → e → c → i → v → i → r` only to report "not found." That's seven node lookups wasted on a word that was never going to be there.

What if you could reject obvious non-words *before* touching the trie? That's what a **bloom filter** does. It's a probabilistic gatekeeper — a compact bit array that can tell you "definitely not in the dictionary" in constant time, or "maybe in the dictionary, go check the trie." It never has false negatives (if a word is in the dictionary, the bloom filter always says "maybe"), but it occasionally has false positives (it says "maybe" for a word that isn't actually there). At a 1% false positive rate, 99 out of 100 misspelled words get rejected instantly.

In this act you'll build a bloom filter from scratch:

1. **Stage 8** — A bit array backed by `Vec<u64>`
2. **Stage 9** — The FNV-1a hash function (10 lines of code)
3. **Stage 10** — The MurmurHash3 hash function (30 lines, avalanche effect)
4. **Stage 11** — The bloom filter itself (double hashing, insert, query)
5. **Stage 12** — Optimal sizing (the real math — derived, not memorized)
6. **Stage 13** — False positive testing (measure theory vs reality)

By the end, you'll have a 351 KB structure that pre-screens a 300,000-word dictionary and rejects misspellings in under a microsecond.

```
The Check Pipeline (what we're building toward):

    "recivir"
        |
        v
  +-------------+     "definitely not"
  | Bloom Filter | -----------------------> MISSPELLED (skip trie)
  +-------------+
        |
        | "maybe"
        v
  +-------------+     "not found"
  |    Trie     | -----------------------> MISSPELLED (suggest fixes)
  +-------------+
        |
        | "found"
        v
     CORRECT
```

---

## Stage 8 — Bit Array

**Difficulty: Easy** · **Lines of code: ~50** · **Concepts: bitwise ops, Vec\<u64\>, indexing**

A bloom filter is, at its core, a giant array of bits. Not bytes — *bits*. Each bit is either 0 or 1. We need millions of them (we'll calculate exactly how many in Stage 12), so we need to pack them efficiently.

Rust doesn't have a `Vec<bool>` that stores one bit per element — `Vec<bool>` uses one *byte* per element, wasting 7 bits. Instead, we'll pack 64 bits into each `u64` and use bitwise operations to read and write individual bits.

### The Mental Model

Think of a long row of light switches, each numbered starting from 0:

```
Bit index:   0  1  2  3  4  5  6  7  8  9  10 11 12 ...  63  64  65 ...
             [------------ u64[0] ------------]  [------- u64[1] -------]
Value:        0  0  1  0  0  1  0  0  0  0   0   1  0      0   1   0
```

To find which `u64` holds bit number `n`:
- **Which u64?** → `n / 64` (or equivalently, `n >> 6`)
- **Which bit inside that u64?** → `n % 64` (or equivalently, `n & 63`)

Why `>> 6`? Because 2⁶ = 64. Dividing by a power of two is the same as shifting right. And `& 63` works because 63 in binary is `0b111111` — it masks off everything except the lowest 6 bits, giving you the remainder when dividing by 64.

> **Python comparison:** Python integers have arbitrary precision, so you'd just use a single giant int and do `big_int |= (1 << n)`. Rust makes you manage the storage yourself — but you get predictable memory layout and cache-friendly access.

### Setting a Bit

To set bit `n` to 1, we need to OR the correct `u64` with a mask that has a 1 in the right position:

```
Before:  0000 0000 0000 0000 ... 0000 0000    (u64 is all zeros)
Mask:    0000 0000 0000 0000 ... 0000 0100    (1 shifted left by 2)
                                                ─── bit position 2
After:   0000 0000 0000 0000 ... 0000 0100    (OR combines them)
```

The mask is `1u64 << bit_position`. The `1u64` is important — it tells Rust this is a 64-bit one, not a 32-bit one. Without it, shifting left by 32 or more would overflow.

### Getting a Bit

To check if bit `n` is set, AND the `u64` with the same mask. If the result is non-zero, the bit is set:

```
Value:   0000 0000 0000 0000 ... 0000 0100    (bit 2 is set)
Mask:    0000 0000 0000 0000 ... 0000 0100    (checking bit 2)
Result:  0000 0000 0000 0000 ... 0000 0100    (non-zero → bit is set!)

Value:   0000 0000 0000 0000 ... 0000 0100    (bit 2 is set)
Mask:    0000 0000 0000 0000 ... 0000 1000    (checking bit 3)
Result:  0000 0000 0000 0000 ... 0000 0000    (zero → bit is NOT set)
```

### Clearing a Bit

To clear bit `n` (set it back to 0), AND with the *inverse* of the mask:

```
Value:   0000 0000 0000 0000 ... 0000 0100    (bit 2 is set)
!Mask:   1111 1111 1111 1111 ... 1111 1011    (NOT of the bit-2 mask)
Result:  0000 0000 0000 0000 ... 0000 0000    (bit 2 cleared, all others unchanged)
```

The `!` operator in Rust flips every bit. So `!(1u64 << 2)` turns `0...0100` into `1...1011`.

### The Code

```rust
// src/bloom.rs (we'll add the bloom filter here later — start with the bit array)

/// A compact bit array backed by Vec<u64>.
/// Each u64 stores 64 bits, so a BitArray with num_bits = 1000
/// uses only ceil(1000/64) = 16 u64s = 128 bytes.
pub struct BitArray {
    /// The raw storage. Each element holds 64 bits.
    data: Vec<u64>,
    /// Total number of bits this array represents.
    num_bits: usize,
}

impl BitArray {
    /// Create a new bit array with all bits set to 0.
    ///
    /// `num_bits` is the total number of bits you want.
    /// We allocate enough u64s to hold them all.
    pub fn new(num_bits: usize) -> Self {
        // How many u64s do we need?
        // For 64 bits we need 1, for 65 bits we need 2, etc.
        // The formula (num_bits + 63) / 64 rounds up.
        let num_words = (num_bits + 63) / 64;

        Self {
            // vec![0u64; n] creates a vector of n zeros.
            // This is like [0] * n in Python.
            data: vec![0u64; num_words],
            num_bits,
        }
    }

    /// Set bit at `index` to 1.
    ///
    /// Panics if index >= num_bits (just like Vec indexing).
    pub fn set(&mut self, index: usize) {
        // Guard against out-of-bounds access.
        assert!(index < self.num_bits, "bit index {index} out of range (max {})", self.num_bits);

        let word = index >> 6;    // same as index / 64
        let bit = index & 63;     // same as index % 64
        self.data[word] |= 1u64 << bit;  // OR to set the bit
    }

    /// Check if bit at `index` is 1.
    pub fn get(&self, index: usize) -> bool {
        assert!(index < self.num_bits, "bit index {index} out of range (max {})", self.num_bits);

        let word = index >> 6;
        let bit = index & 63;
        // AND with the mask, then check if non-zero.
        // The `!= 0` converts u64 to bool.
        (self.data[word] & (1u64 << bit)) != 0
    }

    /// Set bit at `index` back to 0.
    pub fn clear(&mut self, index: usize) {
        assert!(index < self.num_bits, "bit index {index} out of range (max {})", self.num_bits);

        let word = index >> 6;
        let bit = index & 63;
        self.data[word] &= !(1u64 << bit);  // AND with inverted mask
    }

    /// How many bits are set to 1? Useful for measuring fill ratio later.
    pub fn count_ones(&self) -> usize {
        // count_ones() is a built-in on u64 that uses the CPU's
        // POPCNT instruction — counts set bits in hardware.
        self.data.iter().map(|word| word.count_ones() as usize).sum()
    }

    /// Total number of bits in this array.
    pub fn len(&self) -> usize {
        self.num_bits
    }
}
```

Let's walk through every line that might be unfamiliar:

- **`pub struct BitArray`** — `pub` makes it visible outside this module. A `struct` is like a Python `class` or TypeScript `interface`, but it only holds data — methods are defined separately in `impl` blocks.
- **`vec![0u64; num_words]`** — the `vec!` macro creates a heap-allocated vector. The `0u64` is the initial value, and `num_words` is how many copies. This is Rust's equivalent of `[0] * n` in Python or `new Array(n).fill(0)` in TypeScript.
- **`&mut self`** — the `set` and `clear` methods need to *modify* the bit array, so they take a mutable reference. `get` only reads, so it takes `&self` (immutable reference). This is Rust's ownership system enforcing read/write discipline at compile time.
- **`assert!`** — panics (crashes) if the condition is false. In production code you might return a `Result` instead, but for a learning project, panicking on invalid input is fine.
- **`1u64 << bit`** — the `u64` suffix is critical. Without it, Rust defaults to `i32`, and shifting a 32-bit integer left by 32+ positions is undefined behavior in C and a panic in Rust.

### Common Mistake: Off-by-One in Word Count

If you write `num_bits / 64` instead of `(num_bits + 63) / 64`, you'll allocate one too few `u64`s when `num_bits` isn't a multiple of 64. For example, 65 bits needs 2 `u64`s, but `65 / 64 = 1`. The `+ 63` trick rounds up integer division.

> **TypeScript comparison:** `Math.ceil(numBits / 64)` does the same thing, but floating-point division can lose precision for very large numbers. The integer trick `(n + d - 1) / d` is exact.

### Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_all_zeros() {
        let ba = BitArray::new(128);
        // All 128 bits should start as 0.
        for i in 0..128 {
            assert!(!ba.get(i), "bit {i} should be 0");
        }
        assert_eq!(ba.count_ones(), 0);
    }

    #[test]
    fn test_set_and_get() {
        let mut ba = BitArray::new(256);

        ba.set(0);      // first bit
        ba.set(63);     // last bit of first u64
        ba.set(64);     // first bit of second u64
        ba.set(255);    // very last bit

        assert!(ba.get(0));
        assert!(ba.get(63));
        assert!(ba.get(64));
        assert!(ba.get(255));

        // Bits we didn't set should still be 0.
        assert!(!ba.get(1));
        assert!(!ba.get(62));
        assert!(!ba.get(65));
        assert!(!ba.get(254));

        assert_eq!(ba.count_ones(), 4);
    }

    #[test]
    fn test_clear() {
        let mut ba = BitArray::new(128);

        ba.set(42);
        assert!(ba.get(42));

        ba.clear(42);
        assert!(!ba.get(42));
    }

    #[test]
    fn test_set_is_idempotent() {
        let mut ba = BitArray::new(128);

        // Setting the same bit twice shouldn't change anything.
        ba.set(10);
        ba.set(10);
        assert!(ba.get(10));
        assert_eq!(ba.count_ones(), 1);
    }

    #[test]
    fn test_boundary_bits() {
        // Test the boundaries between u64 words.
        let mut ba = BitArray::new(192); // 3 u64s

        // Set the last bit of each word and the first bit of the next.
        ba.set(63);   // last bit of word 0
        ba.set(64);   // first bit of word 1
        ba.set(127);  // last bit of word 1
        ba.set(128);  // first bit of word 2

        assert!(ba.get(63));
        assert!(ba.get(64));
        assert!(ba.get(127));
        assert!(ba.get(128));

        // Neighbors should be unaffected.
        assert!(!ba.get(62));
        assert!(!ba.get(65));
        assert!(!ba.get(126));
        assert!(!ba.get(129));
    }

    #[test]
    fn test_non_multiple_of_64() {
        // 100 bits needs 2 u64s (128 bits of storage).
        // But we should only be able to access bits 0..99.
        let mut ba = BitArray::new(100);
        ba.set(99); // last valid bit
        assert!(ba.get(99));
    }

    #[test]
    #[should_panic(expected = "out of range")]
    fn test_out_of_bounds_panics() {
        let ba = BitArray::new(100);
        ba.get(100); // one past the end — should panic
    }
}
```

Run the tests:

```bash
cargo test bit_array
```

You should see all 7 tests pass. The bit array is the foundation — everything in the bloom filter sits on top of it.

### What You Built

```
BitArray
  +-- data: Vec<u64>     (the packed storage)
  +-- num_bits: usize     (logical size)
  +-- set(index)          (turn a bit on)
  +-- get(index) -> bool  (check a bit)
  +-- clear(index)        (turn a bit off)
  +-- count_ones() -> usize (population count)
```

Next up: we need a way to convert words into bit positions. That's what hash functions do.

---

## Stage 9 — FNV-1a

**Difficulty: Easy** · **Lines of code: ~10** · **Concepts: byte iteration, wrapping arithmetic, XOR**

A hash function takes arbitrary input (a word like "olá") and produces a fixed-size number (a `u64`). Good hash functions spread their outputs evenly across the number space — "olá" and "ola" should produce wildly different numbers even though they differ by just one accent.

FNV-1a (Fowler–Noll–Vo, variant 1a) is one of the simplest useful hash functions. It was created by Glenn Fowler, Landon Curt Noll, and Kiem-Phong Vo, and it's in the public domain. The entire algorithm is three lines inside a loop.

### The Algorithm

```
Start with hash = OFFSET_BASIS
For each byte in the input:
    hash = hash XOR byte
    hash = hash * PRIME
Return hash
```

That's it. Two operations per byte: XOR then multiply.

The constants for the 64-bit version (verified from the IETF draft and Wikipedia):

| Constant | Decimal | Hex |
|----------|---------|-----|
| FNV offset basis (64-bit) | 14695981039346656037 | 0xcbf29ce484222325 |
| FNV prime (64-bit) | 1099511628211 | 0x00000100000001b3 |

> **FNV-1 vs FNV-1a:** The original FNV-1 does multiply-then-XOR. FNV-1a reverses the order to XOR-then-multiply, which gives slightly better avalanche properties (changing one input bit affects more output bits). We use FNV-1a.

### Why These Constants?

The **offset basis** is not random — it's computed by hashing a specific string (`"chongo <Landon Curt Noll> /\.\n/\"`) with the FNV-0 algorithm (which starts at 0). This ensures the initial state isn't zero, which would cause problems with zero-byte inputs.

The **prime** is chosen to have specific mathematical properties: it's a prime number of the form 2⁴⁰ + 2⁸ + 0xb3, with exactly 4-5 one-bits in the low byte. These constraints produce good bit dispersion when multiplied.

### Wrapping Arithmetic

When you multiply two `u64` values, the result can exceed 2⁶⁴. In Python, integers grow automatically. In Rust, overflow on `u64` panics in debug mode and wraps in release mode. We *want* wrapping — the overflow is part of the hash function's mixing. Rust provides `.wrapping_mul()` and `.wrapping_add()` for this:

```
// This panics in debug mode if it overflows:
let x: u64 = a * b;

// This wraps around (modulo 2^64), which is what we want:
let x: u64 = a.wrapping_mul(b);
```

> **Python comparison:** Python's `hash()` function used a modified FNV internally until Python 3.4 (when it switched to SipHash for security). The concept is the same — iterate over bytes, mix with XOR and multiply.

### The Code

```rust
// src/hash.rs

/// FNV-1a 64-bit hash function.
///
/// Algorithm (from IETF draft-eastlake-fnv-17):
///   hash = offset_basis
///   for each byte:
///     hash = hash XOR byte
///     hash = hash * prime
///
/// Constants verified from:
///   https://en.wikipedia.org/wiki/Fowler-Noll-Vo_hash_function
///   https://tools.ietf.org/html/draft-eastlake-fnv-17
pub fn fnv1a_64(data: &[u8]) -> u64 {
    // The 64-bit FNV offset basis.
    const OFFSET_BASIS: u64 = 0xcbf29ce484222325;
    // The 64-bit FNV prime.
    const PRIME: u64 = 0x00000100000001b3;

    let mut hash = OFFSET_BASIS;

    for &byte in data {
        hash ^= byte as u64;           // XOR the byte into the hash
        hash = hash.wrapping_mul(PRIME); // multiply by the prime (wrapping)
    }

    hash
}
```

Ten lines of logic. Let's trace through it with a real example.

### Tracing: "ola" vs "olá"

The string "ola" is 3 bytes in UTF-8: `[111, 108, 97]` (o, l, a).

The string "olá" is 4 bytes in UTF-8: `[111, 108, 195, 161]` (o, l, then the two-byte sequence for á).

```
"ola" (3 bytes: 111, 108, 97):
  Start:  hash = 0xcbf29ce484222325  (14695981039346656037)
  Byte 0: hash ^= 111  → hash = 0xcbf29ce484222358
          hash *= prime → hash = 0xaf63dc4c8601ec08
  Byte 1: hash ^= 108  → hash = 0xaf63dc4c8601ec64
          hash *= prime → hash = 0x...  (keeps mixing)
  Byte 2: hash ^= 97   → ...
          hash *= prime → final hash for "ola"

"olá" (4 bytes: 111, 108, 195, 161):
  Start:  hash = 0xcbf29ce484222325  (same start)
  Byte 0: same as above (111)
  Byte 1: same as above (108)
  Byte 2: hash ^= 195  → DIFFERENT from "ola" (which XORed 97)
          hash *= prime → completely different from here on
  Byte 3: hash ^= 161  → even more different
          hash *= prime → final hash for "olá"
```

The accent on á changes the UTF-8 encoding from one byte (`97`) to two bytes (`195, 161`). From byte 2 onward, the hashes diverge completely. This is exactly what we want for a spell checker — "ola" and "olá" are different words and must hash to different positions.

### Why Bytes, Not Characters?

We hash the raw UTF-8 bytes, not Rust `char`s. This is important:

1. **Consistency** — the same string always produces the same bytes in UTF-8
2. **Speed** — no need to decode characters, just iterate over the byte slice
3. **Correctness** — accented characters like á naturally produce different byte sequences than their unaccented counterparts

In Rust, `"olá".as_bytes()` gives you the UTF-8 byte slice `&[u8]`. That's what we pass to `fnv1a_64`.

### Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fnv1a_empty() {
        // Hashing empty input should return the offset basis.
        // (No bytes to process, so the hash never changes from the initial value.)
        assert_eq!(fnv1a_64(b""), 0xcbf29ce484222325);
    }

    #[test]
    fn test_fnv1a_known_values() {
        // Different inputs should produce different hashes.
        let h1 = fnv1a_64(b"hello");
        let h2 = fnv1a_64(b"Hello");  // capital H
        let h3 = fnv1a_64(b"hello!");  // extra character

        assert_ne!(h1, h2, "case should matter");
        assert_ne!(h1, h3, "extra char should matter");
        assert_ne!(h2, h3);
    }

    #[test]
    fn test_fnv1a_deterministic() {
        // Same input always produces the same hash.
        let h1 = fnv1a_64(b"lexicon");
        let h2 = fnv1a_64(b"lexicon");
        assert_eq!(h1, h2);
    }

    #[test]
    fn test_fnv1a_accent_matters() {
        // "ola" (3 bytes) vs "olá" (4 bytes in UTF-8).
        let h_ola = fnv1a_64("ola".as_bytes());
        let h_ola_accent = fnv1a_64("olá".as_bytes());

        assert_ne!(h_ola, h_ola_accent,
            "accent must change the hash — different UTF-8 bytes");

        // Print them so you can see how different they are.
        println!("fnv1a(\"ola\")  = 0x{h_ola:016x}");
        println!("fnv1a(\"olá\") = 0x{h_ola_accent:016x}");
    }

    #[test]
    fn test_fnv1a_spanish_words() {
        // Spanish minimal pairs that differ by one accent.
        let h_si = fnv1a_64("si".as_bytes());    // "if"
        let h_si_accent = fnv1a_64("sí".as_bytes()); // "yes"

        assert_ne!(h_si, h_si_accent,
            "si (if) and sí (yes) must hash differently");
    }
}
```

Run with `cargo test fnv1a` and use `-- --nocapture` to see the printed hashes:

```bash
cargo test fnv1a -- --nocapture
```

You'll see something like:

```
fnv1a("ola")  = 0x3b8c895f8a8eb42a
fnv1a("olá") = 0x7c2d0e4517e6f1b5
```

Completely different hashes from a single accent mark. The bloom filter will map these to different bit positions, so "ola" and "olá" can coexist in the dictionary without interfering.

### What You Built

```
fnv1a_64(data: &[u8]) -> u64
  - 10 lines of code
  - Processes one byte at a time
  - XOR then multiply (FNV-1a order)
  - Wrapping arithmetic (mod 2^64)
  - Deterministic: same input → same output
  - Accent-aware via UTF-8 byte differences
```

FNV-1a is fast and simple, but it has a weakness: its bit mixing isn't great. Changing one input byte only directly affects the bits near that byte's position. For a bloom filter, we want a second hash function with better *avalanche* properties — where changing one input bit flips roughly half the output bits. That's MurmurHash3.

---

## Stage 10 — MurmurHash3

**Difficulty: Medium** · **Lines of code: ~40** · **Concepts: bit rotation, avalanche effect, block processing**

MurmurHash3 was created by Austin Appleby in 2008 and is in the public domain. The name comes from its two core operations: **mu**ltiply and **r**otate. It's designed for speed *and* excellent distribution — every input bit influences every output bit (the "avalanche effect").

We'll implement the 32-bit variant (`MurmurHash3_x86_32`) because:
1. It's simpler than the 128-bit variant
2. Combined with FNV-1a's 64-bit output, we get two independent hashes for double hashing
3. 32 bits is plenty for bloom filter indexing

### The Algorithm at a High Level

MurmurHash3 processes input in 4-byte blocks, then handles any remaining bytes (the "tail"), then does a final mix:

```
1. Initialize h1 = seed
2. For each 4-byte block:
   a. Multiply block by c1, rotate left 15, multiply by c2  (mix the block)
   b. XOR into h1, rotate left 13, multiply by 5, add constant  (mix into state)
3. Handle remaining 1-3 bytes (tail)
4. XOR in the total length
5. Final mix: three rounds of shift-XOR-multiply  (force avalanche)
```

### Constants (Verified from Reference Implementation)

These come directly from Austin Appleby's reference C code (`MurmurHash3_x86_32` in [github.com/PeterScott/murmur3](https://github.com/PeterScott/murmur3)):

| Constant | Value | Purpose |
|----------|-------|---------|
| c1 | `0xcc9e2d51` | Block mixing multiplier 1 |
| c2 | `0x1b873593` | Block mixing multiplier 2 |
| Rotation 1 | 15 bits | Block rotation |
| Rotation 2 | 13 bits | State rotation |
| State multiply | 5 | State multiplier |
| State add | `0xe6546b64` | State additive constant |
| fmix shift 1 | 16 bits | Finalization |
| fmix multiply 1 | `0x85ebca6b` | Finalization |
| fmix shift 2 | 13 bits | Finalization |
| fmix multiply 2 | `0xc2b2ae35` | Finalization |
| fmix shift 3 | 16 bits | Finalization |

These constants weren't chosen randomly — they were found by testing billions of candidates against statistical quality metrics (SMHasher test suite).

### Bit Rotation

A left rotation moves bits left and wraps the overflow back to the right:

```
rotate_left(0b1100_0011, 2):

  Before:  1 1 0 0 0 0 1 1
           ^-^                 these two bits would "fall off" the left
  After:   0 0 0 0 1 1 1 1
                       ^-^     they wrap around to the right
```

In code: `(x << r) | (x >> (32 - r))`. The left shift moves bits up, the right shift captures the bits that would overflow, and OR combines them.

> **Why rotate instead of just shift?** A plain shift loses bits — they fall off the edge and become zeros. Rotation preserves all the information, just rearranges it. This is critical for mixing: we want to *move* bits around, not destroy them.

### The Code

```rust
// src/hash.rs (add below fnv1a_64)

/// Rotate a 32-bit value left by `r` bits.
/// Bits that shift off the left end wrap around to the right.
///
/// Example: rotate_left(0xFF000000, 8) = 0x000000FF
fn rotate_left_32(x: u32, r: u32) -> u32 {
    // x << r : shift left, filling right side with zeros
    // x >> (32 - r) : capture the bits that would overflow
    // OR combines them
    (x << r) | (x >> (32 - r))
}

/// MurmurHash3 32-bit hash function.
///
/// Algorithm and constants from Austin Appleby's reference implementation:
///   https://github.com/PeterScott/murmur3/blob/master/murmur3.c
///
/// `seed` lets you create different hash functions from the same algorithm.
/// murmur3_32(data, 0) and murmur3_32(data, 1) produce different hashes.
pub fn murmur3_32(data: &[u8], seed: u32) -> u32 {
    let len = data.len();
    let mut h1: u32 = seed;

    // --- Constants (from reference implementation) ---
    const C1: u32 = 0xcc9e2d51;
    const C2: u32 = 0x1b873593;

    // --- Body: process 4-byte blocks ---
    // How many complete 4-byte blocks are there?
    let nblocks = len / 4;

    for i in 0..nblocks {
        // Read 4 bytes as a little-endian u32.
        // We can't just cast a pointer like C does — Rust requires explicit conversion.
        let offset = i * 4;
        let k1_bytes: [u8; 4] = [
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ];
        let mut k1 = u32::from_le_bytes(k1_bytes);

        // Mix the block:
        //   multiply by c1 → rotate left 15 → multiply by c2
        k1 = k1.wrapping_mul(C1);
        k1 = rotate_left_32(k1, 15);
        k1 = k1.wrapping_mul(C2);

        // Fold into the running hash:
        //   XOR → rotate left 13 → multiply by 5 → add constant
        h1 ^= k1;
        h1 = rotate_left_32(h1, 13);
        h1 = h1.wrapping_mul(5).wrapping_add(0xe6546b64);
    }

    // --- Tail: handle remaining 1-3 bytes ---
    // Not every input length is a multiple of 4. The leftover bytes
    // get their own mixing pass.
    let tail_start = nblocks * 4;
    let mut k1: u32 = 0;

    // Fall through from the highest remaining byte to the lowest.
    // This matches the reference C code's switch-case fallthrough.
    let remaining = len & 3; // same as len % 4
    if remaining >= 3 {
        k1 ^= (data[tail_start + 2] as u32) << 16;
    }
    if remaining >= 2 {
        k1 ^= (data[tail_start + 1] as u32) << 8;
    }
    if remaining >= 1 {
        k1 ^= data[tail_start] as u32;
        // Only mix if there were tail bytes.
        k1 = k1.wrapping_mul(C1);
        k1 = rotate_left_32(k1, 15);
        k1 = k1.wrapping_mul(C2);
        h1 ^= k1;
    }

    // --- Finalization: force all bits to avalanche ---
    // XOR in the length so that strings of different lengths
    // that happen to share a prefix produce different hashes.
    h1 ^= len as u32;

    // fmix32: three rounds of shift-XOR-multiply.
    // This is the "avalanche" step — it ensures every input bit
    // affects every output bit.
    h1 ^= h1 >> 16;
    h1 = h1.wrapping_mul(0x85ebca6b);
    h1 ^= h1 >> 13;
    h1 = h1.wrapping_mul(0xc2b2ae35);
    h1 ^= h1 >> 16;

    h1
}
```

### Understanding the Avalanche Effect

The finalization step (`fmix32`) is the secret sauce. Without it, changing the last byte of input would only affect the lower bits of the hash. The three rounds of shift-XOR-multiply spread that change across *all* 32 bits.

Let's visualize. Imagine hashing "cat" vs "bat" — they differ in one byte (c=99 vs b=98, a single bit flip):

```
Without finalization:
  hash("cat") = 0x____XX__    (difference concentrated in a few bits)
  hash("bat") = 0x____XY__

With finalization (fmix32):
  hash("cat") = 0x3A7C91E2    (bits spread everywhere)
  hash("bat") = 0xD1F50B87    (completely different pattern)
```

The shift-XOR step (`h ^= h >> 16`) copies the upper bits down to the lower half. The multiply spreads changes across all bit positions. Three rounds ensure complete mixing.

### Comparing FNV-1a and MurmurHash3

```
                    FNV-1a              MurmurHash3
                    ------              -----------
Output size:        64 bits             32 bits
Speed:              ~1 byte/cycle       ~4 bytes/cycle
Mixing quality:     Good                Excellent
Code complexity:    3 lines in a loop   ~30 lines
Processes:          1 byte at a time    4 bytes at a time
Finalization:       None                fmix32 (3 rounds)
```

FNV-1a is simpler but processes bytes one at a time. MurmurHash3 reads 4 bytes at once and does heavier mixing, which gives better distribution. For our bloom filter, we use *both* — FNV-1a as h1 and MurmurHash3 as h2 — to generate k hash positions via double hashing (Stage 11).

### Tests

```rust
#[cfg(test)]
mod murmur3_tests {
    use super::*;

    #[test]
    fn test_murmur3_empty() {
        // Empty input with seed 0.
        // The hash should be fmix32(0 ^ 0) = fmix32(0).
        let h = murmur3_32(b"", 0);
        assert_eq!(h, 0); // fmix32(0) = 0 (all shifts of 0 are 0)
    }

    #[test]
    fn test_murmur3_deterministic() {
        let h1 = murmur3_32(b"lexicon", 0);
        let h2 = murmur3_32(b"lexicon", 0);
        assert_eq!(h1, h2, "same input + same seed = same hash");
    }

    #[test]
    fn test_murmur3_seed_matters() {
        // Different seeds should produce different hashes.
        let h1 = murmur3_32(b"hello", 0);
        let h2 = murmur3_32(b"hello", 42);
        assert_ne!(h1, h2, "different seeds must produce different hashes");
    }

    #[test]
    fn test_murmur3_accent_matters() {
        let h_ola = murmur3_32("ola".as_bytes(), 0);
        let h_ola_accent = murmur3_32("olá".as_bytes(), 0);

        assert_ne!(h_ola, h_ola_accent);
        println!("murmur3(\"ola\")  = 0x{h_ola:08x}");
        println!("murmur3(\"olá\") = 0x{h_ola_accent:08x}");
    }

    #[test]
    fn test_murmur3_avalanche() {
        // "cat" and "bat" differ by one bit in the first byte.
        // A good hash should flip roughly half the output bits.
        let h_cat = murmur3_32(b"cat", 0);
        let h_bat = murmur3_32(b"bat", 0);

        // XOR shows which bits differ.
        let diff = h_cat ^ h_bat;
        let bits_changed = diff.count_ones();

        println!("murmur3(\"cat\") = 0x{h_cat:08x}");
        println!("murmur3(\"bat\") = 0x{h_bat:08x}");
        println!("XOR diff       = 0x{diff:08x} ({bits_changed} bits differ)");

        // Ideal avalanche: 16 out of 32 bits change.
        // We'll accept anything above 8 (25%) as "good enough."
        assert!(bits_changed > 8,
            "expected good avalanche: {bits_changed} bits changed (want >8 of 32)");
    }

    #[test]
    fn test_murmur3_tail_handling() {
        // Test inputs of length 1, 2, 3, 4, 5 to exercise tail code paths.
        // (Length 4 has no tail, length 5 has a 1-byte tail, etc.)
        let hashes: Vec<u32> = (1..=5)
            .map(|n| murmur3_32(&b"abcde"[..n], 0))
            .collect();

        // All should be different.
        for i in 0..hashes.len() {
            for j in (i + 1)..hashes.len() {
                assert_ne!(hashes[i], hashes[j],
                    "hash of {} bytes == hash of {} bytes", i + 1, j + 1);
            }
        }
    }

    #[test]
    fn test_murmur3_distribution() {
        // Hash 1000 words, check they spread across the u32 range.
        // Divide the u32 range into 16 buckets and count.
        let mut buckets = [0u32; 16];

        for i in 0..1000u32 {
            let word = format!("word_{i}");
            let h = murmur3_32(word.as_bytes(), 0);
            let bucket = (h >> 28) as usize; // top 4 bits → bucket 0-15
            buckets[bucket] += 1;
        }

        // With perfect distribution, each bucket gets ~62.5 words.
        // Allow 20-120 as a loose bound.
        for (i, &count) in buckets.iter().enumerate() {
            assert!(count > 20 && count < 120,
                "bucket {i} has {count} entries — distribution looks skewed");
        }
    }
}
```

### Common Mistake: Integer Overflow Without Wrapping

If you write `k1 *= C1` instead of `k1 = k1.wrapping_mul(C1)`, Rust will panic in debug mode:

```
thread 'test' panicked at 'attempt to multiply with overflow'
```

Every arithmetic operation in MurmurHash3 must use `.wrapping_mul()` and `.wrapping_add()`. The overflow is intentional — it's part of the mixing.

> **TypeScript comparison:** JavaScript numbers are 64-bit floats, so you can't do proper 32-bit wrapping arithmetic without `Math.imul()` and manual masking with `>>> 0`. This is one area where Rust's explicit integer types are a real advantage.

### What You Built

```
murmur3_32(data: &[u8], seed: u32) -> u32
  - ~40 lines of code
  - Processes 4 bytes at a time (body) + 1-3 bytes (tail)
  - Excellent avalanche: 1 bit change → ~16 bits change
  - Seed parameter: different seeds = different hash functions
  - Finalization (fmix32) ensures complete bit mixing
```

Now we have two hash functions: `fnv1a_64` (64-bit) and `murmur3_32` (32-bit). Time to combine them into a bloom filter.

---

## Stage 11 — The Bloom Filter

**Difficulty: Medium** · **Lines of code: ~40** · **Concepts: double hashing, probabilistic data structures, false positives**

Now we combine the bit array (Stage 8) and both hash functions (Stages 9-10) into a bloom filter. The idea is simple:

**Insert:** hash the word k times, set those k bits to 1.
**Query:** hash the word k times, check if *all* k bits are 1.

If any bit is 0, the word is *definitely* not in the set. If all bits are 1, the word is *probably* in the set (but might be a false positive — other words could have set those same bits).

### Double Hashing: k Hash Functions from 2

We need k different hash functions, but we only implemented two (FNV-1a and MurmurHash3). The trick is **double hashing** — a technique from Kirsch and Mitzenmacher (2004) that generates k hash values from just two base hashes:

```
h_i(x) = h1(x) + i * h2(x)    mod m

where:
  h1 = fnv1a_64(x)     (our first hash)
  h2 = murmur3_32(x)   (our second hash)
  i  = 0, 1, 2, ..., k-1
  m  = number of bits in the filter
```

For k=7 (which we'll derive as optimal in Stage 12), this gives us 7 bit positions from just 2 hash computations. The math proves this is as good as 7 truly independent hash functions for bloom filter purposes.

Let's trace through an example. Say m=1000 bits, k=3, and we're inserting "olá":

```
h1 = fnv1a_64("olá")  = (some large u64, say 0x7c2d0e4517e6f1b5)
h2 = murmur3_32("olá") = (some u32, say 0xa3f1c2d4)

Position 0: (h1 + 0 * h2) mod 1000 = h1 mod 1000 = 437
Position 1: (h1 + 1 * h2) mod 1000 = 211
Position 2: (h1 + 2 * h2) mod 1000 = 985

Set bits 437, 211, and 985 to 1.
```

To query "olá" later, compute the same 3 positions and check if all are 1. If bit 211 is 0, the word was never inserted.

### Why This Works (Intuitively)

Each word sets k bits in a pattern determined by its hash values. Two different words are unlikely to set the *exact same* k bits (unless the filter is too full). The more hash functions (larger k), the more bits must all coincidentally be set for a false positive — but also the faster the filter fills up. There's an optimal k that balances these forces (Stage 12).

### The Code

```rust
// src/bloom.rs (add below BitArray)

use crate::hash::{fnv1a_64, murmur3_32};

/// A bloom filter for fast set membership testing.
///
/// Insert words, then query: "is this word possibly in the set?"
/// - "Definitely not" → the word was never inserted (guaranteed)
/// - "Probably yes" → the word was likely inserted (small chance of false positive)
pub struct BloomFilter {
    bits: BitArray,
    num_hashes: usize,  // k
}

impl BloomFilter {
    /// Create a new bloom filter.
    ///
    /// - `num_bits` (m): size of the bit array
    /// - `num_hashes` (k): number of hash functions to use
    ///
    /// We'll compute optimal values for these in Stage 12.
    /// For now, pass them explicitly.
    pub fn new(num_bits: usize, num_hashes: usize) -> Self {
        Self {
            bits: BitArray::new(num_bits),
            num_hashes,
        }
    }

    /// Compute the k bit positions for a given key using double hashing.
    ///
    /// h_i(x) = (h1(x) + i * h2(x)) mod m
    ///
    /// Returns an iterator of k positions, each in [0, num_bits).
    fn positions<'a>(&'a self, key: &'a [u8]) -> impl Iterator<Item = usize> + 'a {
        let h1 = fnv1a_64(key);
        let h2 = murmur3_32(key, 0) as u64;
        let m = self.bits.len() as u64;

        (0..self.num_hashes).map(move |i| {
            // h1 + i * h2, all mod m.
            // Use wrapping_add and wrapping_mul to avoid overflow panics.
            // Then mod m to get a valid bit index.
            let hash = h1.wrapping_add((i as u64).wrapping_mul(h2));
            (hash % m) as usize
        })
    }

    /// Insert a word into the bloom filter.
    ///
    /// Sets k bits to 1. After this, `contains()` will return true for this word.
    /// There is no way to remove a word from a standard bloom filter.
    pub fn insert(&mut self, key: &[u8]) {
        // Collect positions first to avoid borrowing conflict.
        // (We need &self for positions() but &mut self for set().)
        let positions: Vec<usize> = self.positions(key).collect();
        for pos in positions {
            self.bits.set(pos);
        }
    }

    /// Check if a word might be in the bloom filter.
    ///
    /// Returns:
    /// - `false` → the word was DEFINITELY NOT inserted (no false negatives)
    /// - `true`  → the word was PROBABLY inserted (possible false positive)
    pub fn contains(&self, key: &[u8]) -> bool {
        self.positions(key).all(|pos| self.bits.get(pos))
    }

    /// What fraction of bits are set to 1?
    ///
    /// As this approaches 1.0, false positive rate increases dramatically.
    /// A healthy bloom filter should be ~50% full (we'll derive why in Stage 12).
    pub fn fill_ratio(&self) -> f64 {
        self.bits.count_ones() as f64 / self.bits.len() as f64
    }
}
```

Let's unpack the tricky parts:

**The `positions` method** returns an iterator — a lazy sequence of values computed on demand. The `move` keyword in the closure transfers ownership of `h1`, `h2`, and `m` into the closure (they're `Copy` types, so this is just copying the values). The lifetime `'a` ensures the iterator doesn't outlive the bloom filter or the key.

**Why `collect()` in `insert`?** Rust's borrow checker won't let us call `self.positions(key)` (which borrows `&self`) while also calling `self.bits.set()` (which borrows `&mut self`). Collecting into a `Vec` first resolves this — we compute all positions, then mutate. This is a common Rust pattern.

**No removal:** A standard bloom filter can't remove items. If you clear the bits for word A, you might accidentally clear bits that word B also uses. (Counting bloom filters solve this, but we don't need them.)

### Language Learning Example: The Gatekeeper in Action

```rust
fn demo_gatekeeper() {
    // Create a small bloom filter: 1000 bits, 7 hash functions.
    let mut bloom = BloomFilter::new(1000, 7);

    // Insert some Spanish words.
    let dictionary = ["hola", "mundo", "recibir", "español", "café"];
    for word in &dictionary {
        bloom.insert(word.as_bytes());
    }

    // These should all return true (no false negatives).
    assert!(bloom.contains(b"hola"));
    assert!(bloom.contains("café".as_bytes()));
    assert!(bloom.contains("español".as_bytes()));

    // Common misspelling: "recivir" (v instead of b).
    // The bloom filter will almost certainly say "not found."
    if !bloom.contains(b"recivir") {
        println!("recivir: DEFINITELY not in dictionary — skip the trie!");
    }

    // Another misspelling: "expresso" (should be "espresso").
    if !bloom.contains(b"expresso") {
        println!("expresso: DEFINITELY not in dictionary — skip the trie!");
    }

    println!("Fill ratio: {:.1}%", bloom.fill_ratio() * 100.0);
}
```

### Tests

```rust
#[cfg(test)]
mod bloom_tests {
    use super::*;

    #[test]
    fn test_no_false_negatives() {
        let mut bloom = BloomFilter::new(10_000, 7);

        let words = vec!["hello", "world", "rust", "bloom", "filter",
                         "olá", "café", "naïve", "résumé", "über"];

        // Insert all words.
        for word in &words {
            bloom.insert(word.as_bytes());
        }

        // Every inserted word MUST be found (no false negatives).
        for word in &words {
            assert!(bloom.contains(word.as_bytes()),
                "false negative for '{word}' — this should NEVER happen");
        }
    }

    #[test]
    fn test_empty_filter_rejects_everything() {
        let bloom = BloomFilter::new(1000, 7);

        // Nothing was inserted, so everything should return false.
        assert!(!bloom.contains(b"hello"));
        assert!(!bloom.contains(b"world"));
        assert!(!bloom.contains(b""));
    }

    #[test]
    fn test_fill_ratio_increases() {
        let mut bloom = BloomFilter::new(1000, 7);

        assert_eq!(bloom.fill_ratio(), 0.0);

        for i in 0..100 {
            let word = format!("word_{i}");
            bloom.insert(word.as_bytes());
        }

        let ratio = bloom.fill_ratio();
        assert!(ratio > 0.0 && ratio < 1.0,
            "fill ratio should be between 0 and 1, got {ratio}");
        println!("Fill ratio after 100 words in 1000-bit filter: {:.1}%", ratio * 100.0);
    }

    #[test]
    fn test_accent_discrimination() {
        let mut bloom = BloomFilter::new(10_000, 7);

        // Insert "si" (Spanish for "if") but NOT "sí" (Spanish for "yes").
        bloom.insert("si".as_bytes());

        assert!(bloom.contains("si".as_bytes()));
        // "sí" was not inserted — it should (almost certainly) not be found.
        // This isn't guaranteed (could be a false positive), but with
        // 10,000 bits and only 1 word inserted, the probability is negligible.
        assert!(!bloom.contains("sí".as_bytes()),
            "sí should not be found — only si was inserted");
    }

    #[test]
    fn test_misspelling_rejection() {
        let mut bloom = BloomFilter::new(100_000, 7);

        // Insert correct Spanish words.
        let correct = ["recibir", "escribir", "vivir", "decidir"];
        for word in &correct {
            bloom.insert(word.as_bytes());
        }

        // Common misspellings should be rejected.
        assert!(!bloom.contains(b"recivir"),  "recivir should be rejected");
        assert!(!bloom.contains(b"escrivir"), "escrivir should be rejected");
    }
}
```

### What You Built

```
BloomFilter
  +-- bits: BitArray          (the storage)
  +-- num_hashes: usize       (k)
  +-- insert(key)             (set k bits)
  +-- contains(key) -> bool   (check k bits)
  +-- fill_ratio() -> f64     (how full is it?)

Uses double hashing:
  h_i(x) = fnv1a(x) + i * murmur3(x)  mod m
```

But we've been picking `num_bits` and `num_hashes` by hand. How do you choose the right values? That's the math in Stage 12.

---

## Stage 12 — Optimal Sizing

**Difficulty: Medium** · **Lines of code: ~30** · **Concepts: probability, calculus (minimization), natural logarithms**

This is the math stage. We'll derive — not just state — the formulas for optimal bloom filter sizing. By the end, you'll understand *why* k=7 and m≈2.9 million bits is the right choice for a 300,000-word dictionary at 1% false positive rate.

### The False Positive Probability

Imagine a bloom filter with m bits and k hash functions. You've inserted n words. What's the probability that a *new* word (not in the dictionary) triggers a false positive?

**Step 1: Probability that a single hash does NOT set a specific bit.**

Each hash function picks one of m positions uniformly at random. The probability that a specific bit is *not* set by one hash is:

```
P(bit not set by one hash) = 1 - 1/m
```

**Step 2: Probability after all k hashes of one word.**

One word applies k hash functions. The probability that a specific bit survives all k hashes unset:

```
P(bit not set by one word) = (1 - 1/m)^k
```

**Step 3: Probability after inserting n words.**

After inserting n words (each applying k hashes), the probability that a specific bit is still 0:

```
P(bit is 0 after n insertions) = (1 - 1/m)^(kn)
```

Using the approximation (1 - 1/m)^m ≈ e⁻¹ (valid for large m):

```
P(bit is 0) ≈ e^(-kn/m)
```

So the probability that a specific bit IS set to 1:

```
P(bit is 1) ≈ 1 - e^(-kn/m)
```

**Step 4: False positive probability.**

A false positive occurs when ALL k hash positions for a query word happen to be set to 1 (by other words). Since each position is independently set with probability ≈ 1 - e^(-kn/m):

```
p = P(false positive) ≈ (1 - e^(-kn/m))^k
```

This is the master formula. Everything else follows from it.

### Deriving Optimal k

Given m bits and n items, what value of k minimizes the false positive rate?

Let's define the fill ratio f = 1 - e^(-kn/m) (the fraction of bits that are 1). Then p = f^k.

Taking the natural log: ln(p) = k × ln(f)

Substituting f = 1 - e^(-kn/m) and setting the derivative dp/dk = 0 (calculus — finding the minimum), the optimal k turns out to be:

```
k_opt = (m/n) × ln(2)
```

Where ln(2) ≈ 0.693. This means:

- If m/n = 10 (10 bits per word), then k = 10 × 0.693 ≈ 7
- If m/n = 15 (15 bits per word), then k = 15 × 0.693 ≈ 10

**Why ln(2)?** At the optimal k, exactly half the bits are set to 1. The fill ratio f = 1/2. This makes intuitive sense — if too few bits are set, you're wasting space; if too many are set, everything looks like a match.

### Deriving Optimal m

Given n items and a target false positive rate p, how many bits do we need?

At optimal k, the false positive rate simplifies to:

```
p = (1/2)^k = (1/2)^((m/n) × ln(2))
```

Taking the natural log of both sides:

```
ln(p) = (m/n) × ln(2) × ln(1/2)
ln(p) = (m/n) × ln(2) × (-ln(2))
ln(p) = -(m/n) × (ln(2))²
```

Solving for m:

```
m = -n × ln(p) / (ln(2))²
```

Let's plug in numbers. For n = 300,000 words and p = 0.01 (1% false positive rate):

```
m = -300,000 × ln(0.01) / (ln(2))²
  = -300,000 × (-4.60517) / (0.69315)²
  = 300,000 × 4.60517 / 0.48045
  = 300,000 × 9.585
  = 2,875,518 bits
```

And the optimal k:

```
k = (m/n) × ln(2)
  = (2,875,518 / 300,000) × 0.693
  = 9.585 × 0.693
  = 6.64 ≈ 7
```

So for a 300,000-word English dictionary at 1% false positive rate: **m ≈ 2.88 million bits (351 KB), k = 7 hash functions.**

### The Fill Ratio

After inserting n items with optimal k, what fraction of bits are set?

```
fill = 1 - e^(-kn/m)
     = 1 - e^(-(m/n × ln2 × n)/m)
     = 1 - e^(-ln(2))
     = 1 - 1/2
     = 0.5
```

Exactly 50%! At the optimal k, the filter is half full. This is a beautiful result — it falls directly out of the math.

### The Sizing Table

Let's build the table from the design spec:

```
n (words)    | p (FP rate) | m (bits)    | k (hashes) | Memory
-------------|-------------|-------------|------------|--------
100,000      | 1%          | 958,506     | 7          | 117 KB
300,000      | 1%          | 2,875,518   | 7          | 351 KB
300,000      | 0.1%        | 4,313,277   | 10         | 527 KB
500,000      | 1%          | 4,792,530   | 7          | 586 KB
```

Memory = m / 8 / 1024 (bits → bytes → kilobytes).

Notice that k=7 appears for all 1% entries. That's because k depends only on the *ratio* m/n, and at 1% false positive rate, m/n ≈ 9.585 regardless of n. The filter scales linearly — twice the words, twice the bits, same number of hashes.

### The Code

```rust
// src/bloom.rs (add to the impl BloomFilter block)

impl BloomFilter {
    /// Create a bloom filter with optimal sizing for the given parameters.
    ///
    /// - `expected_items` (n): how many items you plan to insert
    /// - `false_positive_rate` (p): target false positive probability (e.g., 0.01 for 1%)
    ///
    /// Computes optimal m (bits) and k (hashes) from the formulas:
    ///   m = -n * ln(p) / (ln(2))^2
    ///   k = (m/n) * ln(2)
    pub fn with_rate(expected_items: usize, false_positive_rate: f64) -> Self {
        assert!(expected_items > 0, "need at least one item");
        assert!(
            false_positive_rate > 0.0 && false_positive_rate < 1.0,
            "false positive rate must be between 0 and 1"
        );

        let n = expected_items as f64;
        let p = false_positive_rate;
        let ln2 = std::f64::consts::LN_2; // 0.693147...

        // m = -n * ln(p) / (ln(2))^2
        let m = (-n * p.ln() / (ln2 * ln2)).ceil() as usize;

        // k = (m/n) * ln(2), rounded to nearest integer, at least 1
        let k = ((m as f64 / n) * ln2).round().max(1.0) as usize;

        Self::new(m, k)
    }

    /// Return the number of bits (m) in this filter.
    pub fn num_bits(&self) -> usize {
        self.bits.len()
    }

    /// Return the number of hash functions (k) used by this filter.
    pub fn num_hashes(&self) -> usize {
        self.num_hashes
    }
}
```

### Tests

```rust
#[cfg(test)]
mod sizing_tests {
    use super::*;

    #[test]
    fn test_optimal_sizing_300k() {
        let bloom = BloomFilter::with_rate(300_000, 0.01);

        println!("300k words at 1% FP:");
        println!("  bits (m)   = {}", bloom.num_bits());
        println!("  hashes (k) = {}", bloom.num_hashes());
        println!("  memory     = {} KB", bloom.num_bits() / 8 / 1024);

        // Should be close to the design spec values.
        // m ≈ 2,875,518, k = 7
        assert!(bloom.num_bits() > 2_800_000 && bloom.num_bits() < 2_950_000,
            "expected ~2.88M bits, got {}", bloom.num_bits());
        assert_eq!(bloom.num_hashes(), 7, "expected k=7");
    }

    #[test]
    fn test_optimal_sizing_100k() {
        let bloom = BloomFilter::with_rate(100_000, 0.01);

        assert!(bloom.num_bits() > 900_000 && bloom.num_bits() < 1_000_000);
        assert_eq!(bloom.num_hashes(), 7);
    }

    #[test]
    fn test_optimal_sizing_stricter_rate() {
        // 0.1% FP rate needs more bits and more hashes.
        let bloom = BloomFilter::with_rate(300_000, 0.001);

        println!("300k words at 0.1% FP:");
        println!("  bits (m)   = {}", bloom.num_bits());
        println!("  hashes (k) = {}", bloom.num_hashes());

        assert!(bloom.num_bits() > 4_200_000 && bloom.num_bits() < 4_400_000);
        assert_eq!(bloom.num_hashes(), 10);
    }

    #[test]
    fn test_sizing_table() {
        // Reproduce the full sizing table from the design spec.
        let cases = vec![
            // (n, p, expected_m_approx, expected_k)
            (100_000, 0.01,  958_506,   7),
            (300_000, 0.01,  2_875_518, 7),
            (300_000, 0.001, 4_313_277, 10),
            (500_000, 0.01,  4_792_530, 7),
        ];

        println!("{:<12} {:>8} {:>12} {:>4} {:>8}",
            "n", "p", "m", "k", "KB");
        println!("{}", "-".repeat(48));

        for (n, p, expected_m, expected_k) in cases {
            let bloom = BloomFilter::with_rate(n, p);
            let m = bloom.num_bits();
            let k = bloom.num_hashes();
            let kb = m / 8 / 1024;

            println!("{n:<12} {p:>8.3} {m:>12} {k:>4} {kb:>8}");

            // Allow 1% tolerance on m (rounding differences).
            let tolerance = (expected_m as f64 * 0.01) as usize;
            assert!((m as isize - expected_m as isize).unsigned_abs() < tolerance,
                "n={n}, p={p}: expected m≈{expected_m}, got {m}");
            assert_eq!(k, expected_k,
                "n={n}, p={p}: expected k={expected_k}, got {k}");
        }
    }
}
```

### Bits Per Word: A Useful Rule of Thumb

At 1% false positive rate, m/n ≈ 9.585 — roughly **10 bits per word**. This is a handy rule of thumb:

```
Memory ≈ (number of words × 10) / 8 bytes

300,000 words × 10 bits = 3,000,000 bits ≈ 366 KB
```

Each additional order of magnitude in false positive rate (1% → 0.1% → 0.01%) adds about 4.8 bits per word. So 0.1% needs ~14.4 bits/word, and 0.01% needs ~19.2 bits/word.

### What You Built

```
BloomFilter::with_rate(n, p) → BloomFilter
  - Computes optimal m = -n * ln(p) / (ln(2))^2
  - Computes optimal k = (m/n) * ln(2)
  - 300k words at 1% → 2.88M bits (351 KB), k=7
  - At optimal k, filter is exactly 50% full
  - ~10 bits per word at 1% FP rate (rule of thumb)
```

The math says our bloom filter should have a 1% false positive rate. But does it? Let's measure.

---

## Stage 13 — False Positive Testing

**Difficulty: Medium** · **Lines of code: ~60** · **Concepts: empirical testing, statistical validation, ASCII visualization**

We derived that a bloom filter with n=10,000 items, 1% target FP rate should produce roughly 1% false positives on random queries. Let's test it. We'll insert 10,000 real-ish words, query 10,000 non-words, count the false positives, and compare against the theoretical prediction.

### The Experiment

```
1. Create a bloom filter with with_rate(10_000, 0.01)
2. Insert 10,000 "real" words: "word_0", "word_1", ..., "word_9999"
3. Query 10,000 "non-words": "fake_0", "fake_1", ..., "fake_9999"
4. Count how many non-words the filter says "maybe yes" → those are false positives
5. Compare: actual FP rate vs theoretical 1%
```

We use synthetic words instead of a real dictionary so the experiment is reproducible and doesn't need external files.

### The Code

```rust
// src/bloom.rs (add to tests module or as a separate test file)

#[cfg(test)]
mod false_positive_tests {
    use super::*;

    #[test]
    fn test_false_positive_rate() {
        let n = 10_000;
        let target_fp_rate = 0.01; // 1%
        let num_queries = 10_000;

        // Step 1: Create an optimally-sized bloom filter.
        let mut bloom = BloomFilter::with_rate(n, target_fp_rate);

        println!("Bloom filter parameters:");
        println!("  items (n)  = {n}");
        println!("  bits (m)   = {}", bloom.num_bits());
        println!("  hashes (k) = {}", bloom.num_hashes());
        println!("  target FP  = {:.1}%", target_fp_rate * 100.0);
        println!();

        // Step 2: Insert n "real" words.
        for i in 0..n {
            let word = format!("word_{i}");
            bloom.insert(word.as_bytes());
        }

        // Step 3: Verify no false negatives (sanity check).
        for i in 0..n {
            let word = format!("word_{i}");
            assert!(bloom.contains(word.as_bytes()),
                "false negative for '{word}' — bloom filter is broken!");
        }

        // Step 4: Query non-words and count false positives.
        let mut false_positives = 0;
        for i in 0..num_queries {
            // "fake_" prefix ensures these were never inserted.
            let non_word = format!("fake_{i}");
            if bloom.contains(non_word.as_bytes()) {
                false_positives += 1;
            }
        }

        // Step 5: Compare actual vs theoretical.
        let actual_fp_rate = false_positives as f64 / num_queries as f64;
        let fill = bloom.fill_ratio();

        println!("Results:");
        println!("  false positives = {false_positives} / {num_queries}");
        println!("  actual FP rate  = {:.2}%", actual_fp_rate * 100.0);
        println!("  target FP rate  = {:.2}%", target_fp_rate * 100.0);
        println!("  fill ratio      = {:.1}%", fill * 100.0);
        println!();

        // The actual rate should be in the ballpark of the target.
        // Allow 0% to 3% (statistical variation is expected).
        assert!(actual_fp_rate < 0.03,
            "FP rate {:.2}% is way above target {:.1}% — something is wrong",
            actual_fp_rate * 100.0, target_fp_rate * 100.0);

        // Fill ratio should be close to 50% (the theoretical optimum).
        assert!(fill > 0.40 && fill < 0.60,
            "fill ratio {:.1}% is far from the optimal 50%", fill * 100.0);
    }

    #[test]
    fn test_fp_rate_scales_with_target() {
        // A stricter target (0.1%) should produce fewer false positives
        // than a looser target (1%).
        let n = 5_000;
        let queries = 10_000;

        let rates = [0.01, 0.001]; // 1% and 0.1%
        let mut results: Vec<(f64, f64)> = Vec::new();

        for &target in &rates {
            let mut bloom = BloomFilter::with_rate(n, target);

            for i in 0..n {
                bloom.insert(format!("word_{i}").as_bytes());
            }

            let mut fps = 0;
            for i in 0..queries {
                if bloom.contains(format!("fake_{i}").as_bytes()) {
                    fps += 1;
                }
            }

            let actual = fps as f64 / queries as f64;
            results.push((target, actual));

            println!("target={:.2}%  actual={:.2}%  m={}  k={}",
                target * 100.0, actual * 100.0,
                bloom.num_bits(), bloom.num_hashes());
        }

        // The stricter filter should have a lower FP rate.
        assert!(results[1].1 <= results[0].1,
            "0.1% target should produce fewer FPs than 1% target");
    }

    #[test]
    fn test_visualize_fill_ratio() {
        // Watch the fill ratio grow as we insert more items.
        let n = 1_000;
        let mut bloom = BloomFilter::with_rate(n, 0.01);

        println!();
        println!("Fill ratio as items are inserted (n={n}, target=1%):");
        println!("  {:>6}  {:>6}  {}", "items", "fill%", "visualization");
        println!("  {}  {}  {}", "-".repeat(6), "-".repeat(6), "-".repeat(50));

        let checkpoints = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];

        let mut inserted = 0;
        for &checkpoint in &checkpoints {
            while inserted < checkpoint {
                bloom.insert(format!("w_{inserted}").as_bytes());
                inserted += 1;
            }

            let fill = bloom.fill_ratio();
            let bar_len = (fill * 50.0) as usize;
            let bar: String = "#".repeat(bar_len) + &".".repeat(50 - bar_len);

            println!("  {:>6}  {:>5.1}%  |{bar}|", checkpoint, fill * 100.0);
        }

        // At n=1000 (100% of capacity), fill should be ~50%.
        let final_fill = bloom.fill_ratio();
        println!();
        println!("  Final fill ratio: {:.1}% (theoretical optimum: 50.0%)", final_fill * 100.0);

        assert!(final_fill > 0.40 && final_fill < 0.60);
    }

    #[test]
    fn test_overfilling_increases_fp_rate() {
        // What happens when you insert MORE items than the filter was sized for?
        // The FP rate should increase dramatically.
        let n = 1_000;
        let mut bloom = BloomFilter::with_rate(n, 0.01);

        // Insert 1x capacity (normal).
        for i in 0..n {
            bloom.insert(format!("word_{i}").as_bytes());
        }
        let fp_at_1x = measure_fp_rate(&bloom, 5_000);

        // Insert 3x capacity (overfilled).
        for i in n..(3 * n) {
            bloom.insert(format!("word_{i}").as_bytes());
        }
        let fp_at_3x = measure_fp_rate(&bloom, 5_000);

        // Insert 5x capacity (severely overfilled).
        for i in (3 * n)..(5 * n) {
            bloom.insert(format!("word_{i}").as_bytes());
        }
        let fp_at_5x = measure_fp_rate(&bloom, 5_000);

        println!();
        println!("Effect of overfilling (filter sized for {n} items):");
        println!("  1x ({n} items):    FP={:.1}%, fill={:.1}%",
            fp_at_1x * 100.0, bloom.fill_ratio() * 100.0);
        // Note: fill_ratio is cumulative, so we print the final state.
        // For accurate per-stage fill, you'd need to measure at each point.
        println!("  3x ({} items):  FP={:.1}%", 3 * n, fp_at_3x * 100.0);
        println!("  5x ({} items):  FP={:.1}%", 5 * n, fp_at_5x * 100.0);

        // FP rate should increase as we overfill.
        assert!(fp_at_3x > fp_at_1x, "overfilling should increase FP rate");
        assert!(fp_at_5x > fp_at_3x, "more overfilling = even higher FP rate");
    }

    /// Helper: measure false positive rate by querying `num_queries` non-words.
    fn measure_fp_rate(bloom: &BloomFilter, num_queries: usize) -> f64 {
        let mut fps = 0;
        for i in 0..num_queries {
            if bloom.contains(format!("nonexistent_{i}").as_bytes()) {
                fps += 1;
            }
        }
        fps as f64 / num_queries as f64
    }
}
```

### Expected Output

When you run `cargo test false_positive -- --nocapture`, you'll see something like:

```
Bloom filter parameters:
  items (n)  = 10000
  bits (m)   = 95851
  hashes (k) = 7
  target FP  = 1.0%

Results:
  false positives = 92 / 10000
  actual FP rate  = 0.92%
  target FP rate  = 1.00%
  fill ratio      = 49.8%
```

The actual rate (0.92%) is close to the target (1.00%). The fill ratio (49.8%) is close to the theoretical optimum (50.0%). The math works.

### Visualizing the Fill Ratio

The `test_visualize_fill_ratio` test prints an ASCII bar chart:

```
Fill ratio as items are inserted (n=1000, target=1%):
  items   fill%  visualization
  ------  ------  --------------------------------------------------
       0    0.0%  |..................................................|
     100    6.7%  |###................................................|
     200   12.8%  |######............................................|
     300   18.5%  |#########.........................................|
     400   23.7%  |############......................................|
     500   28.6%  |##############....................................|
     600   33.1%  |################..................................|
     700   37.3%  |##################................................|
     800   41.2%  |####################..............................|
     900   44.9%  |######################............................|
    1000   48.3%  |########################..........................|

  Final fill ratio: 48.3% (theoretical optimum: 50.0%)
```

The fill ratio grows quickly at first (each new word sets bits that were all 0) and slows down as the filter fills (new words increasingly set bits that are already 1). At capacity, it converges to ~50%.

### The Overfilling Experiment

What happens when you put too many items in?

```
Effect of overfilling (filter sized for 1000 items):
  1x (1000 items):    FP=0.8%, fill=48.3%
  3x (3000 items):    FP=18.2%
  5x (5000 items):    FP=52.7%
```

At 3x capacity, the filter is nearly useless (18% false positives). At 5x, it's a coin flip. This is why sizing matters — the `with_rate` constructor exists to prevent this.

### Common Mistake: Using the Wrong n

If you create `BloomFilter::with_rate(1_000, 0.01)` but then insert 10,000 words, you'll get terrible false positive rates. The `expected_items` parameter must match (or exceed) the actual number of insertions. When in doubt, overestimate n — the cost is just a bit more memory.

### Putting It All Together: The Spell Check Pipeline

Here's how the bloom filter fits into Lexicon's check pipeline:

```rust
/// Check if a word is spelled correctly.
///
/// Returns true if the word is in the dictionary.
fn check_word(word: &str, bloom: &BloomFilter, trie: &Trie) -> bool {
    let normalized = word.to_lowercase();
    let bytes = normalized.as_bytes();

    // Step 1: Ask the bloom filter.
    if !bloom.contains(bytes) {
        // "Definitely not in the dictionary."
        // No need to check the trie — save time!
        return false;
    }

    // Step 2: Bloom filter said "maybe." Confirm with the trie.
    trie.contains(&normalized)
}
```

For a correctly spelled word, both the bloom filter and trie say "yes" — two checks. For a misspelled word, the bloom filter usually says "no" — one check. Since most words in a typical document are spelled correctly, the bloom filter doesn't help much there. But when checking *suggestions* (Act 3), you'll test many candidate words against the dictionary, and most of them won't match. That's where the bloom filter shines — rejecting non-words in microseconds instead of traversing the trie.

### What You Built in Act 2

```
Stage 8:  BitArray           — packed bit storage in Vec<u64>
Stage 9:  fnv1a_64()         — FNV-1a hash (XOR-then-multiply, 10 lines)
Stage 10: murmur3_32()       — MurmurHash3 (block processing, avalanche, 40 lines)
Stage 11: BloomFilter        — double hashing, insert, contains
Stage 12: BloomFilter::with_rate() — optimal m and k from the math
Stage 13: Empirical testing  — actual FP rate matches theory

The complete bloom filter:
  - 351 KB for a 300,000-word dictionary
  - 7 hash functions (from 2 via double hashing)
  - 1% false positive rate
  - Sub-microsecond queries
  - 50% fill ratio at capacity
```

### File Organization

Your `src/` directory should now look like:

```
src/
  main.rs          (CLI entry point — from Act 1)
  lib.rs           (module declarations)
  trie.rs          (from Act 1)
  hash.rs          (NEW — fnv1a_64, murmur3_32)
  bloom.rs         (NEW — BitArray, BloomFilter)
```

In `lib.rs`, declare the new modules:

```rust
pub mod trie;
pub mod hash;
pub mod bloom;
```

### What's Next

The gatekeeper is in place. The bloom filter can reject misspelled words in under a microsecond, saving the trie from unnecessary lookups. But when a word *is* misspelled, we need to suggest corrections. How do you find "recibir" when the user typed "recivir"?

That's Act 3 — **The Suggester** — where you'll implement Levenshtein distance and a BK-tree for fast fuzzy matching.
