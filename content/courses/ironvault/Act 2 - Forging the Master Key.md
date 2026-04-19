# Act 2 — Forging the Master Key

> *"The vault stands sealed, its iron door cold to the touch. No lockpick will open it, no battering ram will breach it. Only a key forged from your own secret — a word spoken into the furnace of cryptography — can turn the lock. But beware: forge the key poorly, and any thief with a fast enough hammer can shatter it."*

In Act 1 you built the vault's contents — relics, chambers, the data model that holds your secrets. But those secrets sit in plaintext JSON on disk. Anyone who steals your laptop, copies your backup, or glances at your filesystem can read every password you own. Act 2 fixes this with real cryptography. The concepts get harder here: byte arrays, key derivation, encryption. If you've never worked with crypto before, that's fine — we'll build every piece from first principles.

Act 2 changes everything. By the end of these six stages, your vault will be sealed behind military-grade cryptography. The same encryption that protects classified government data (AES-256) and the same key derivation that won the Password Hashing Competition (Argon2id) will guard your relics.

This is the hardest act in the course. Cryptography is unforgiving — a single mistake (reusing a nonce, using a fast hash, skipping authentication) can reduce your security from "centuries to crack" to "seconds to crack." We'll go slow, explain every choice, and show you what happens when you get it wrong.

**What you'll build in Act 2:**

- Argon2id key derivation: master password + salt → 256-bit encryption key
- AES-256-GCM authenticated encryption: encrypt and decrypt with tamper detection
- A binary vault file format with magic bytes, versioning, and embedded crypto parameters
- Master password ceremony: init, unlock, and wrong-password detection
- Session management: cached keys in tmpfs, lock files, PID tracking
- Auto-lock timeout with configurable expiry

**Crate versions used:** `argon2 0.5`, `aes-gcm 0.10`, `rand 0.9`, `rpassword 7.4`, `hex 0.4`, `chrono 0.4`, `toml 0.8`, `serde 1.0`

---

## Stage 8 — The Salt Mines

*Difficulty: Medium*

Your master password is a human-readable string — maybe 20 characters, maybe 40. AES-256 needs exactly 256 bits of high-entropy key material. You can't just pad the password with zeros or hash it with SHA-256 (which is catastrophically fast for attackers). This stage builds the bridge between a human secret and a cryptographic key, using Argon2id — the algorithm specifically designed to make brute-force attacks economically ruinous.

> *"Deep beneath the vault lies the Salt Mines — ancient tunnels where crystalline salts are harvested. Each grain is unique, and when mixed with the Master Key in the Forge's furnace, they produce an unbreakable alloy. Without salt, two identical keys would produce identical alloys — and a thief who cracks one cracks them all."*

### Why You Can't Just Hash a Password

Your first instinct might be: "I'll SHA-256 my password and use that as the encryption key." This is catastrophically wrong, and understanding why is the most important security lesson in this entire course.

SHA-256 is a **fast** hash function. That's its job — it's designed for checksumming files, verifying downloads, building Merkle trees. On a modern GPU:

| Hash Function | Speed (RTX 4090) | Time to try all 6-char passwords |
|---------------|-------------------|----------------------------------|
| SHA-256 | ~22 billion/sec | ~0.3 seconds |
| MD5 | ~164 billion/sec | ~0.04 seconds |
| bcrypt (cost 12) | ~100,000/sec | ~8 days |
| **Argon2id (64 MiB)** | **~1,000/sec** | **~2.2 years** |

SHA-256 is 22 *million* times faster than Argon2id. If your master password is "correct horse battery staple" (44 bits of entropy), an attacker with a stolen vault file could brute-force SHA-256 in hours. With Argon2id, the same attack takes centuries.

**AWS parallel:** This is exactly why AWS KMS exists. When you create a Customer Master Key (CMK), KMS derives data encryption keys from it using a key derivation function — not a simple hash. Your master password is the CMK. Argon2id is the derivation function. The output is the data key that actually encrypts your vault.

### What Makes Argon2id Special

Argon2 won the [Password Hashing Competition](https://www.password-hashing.net/) in 2015. It's designed to be:

1. **Slow** — each guess takes ~200ms on your machine. That's fine for a human typing a password once, but devastating for an attacker trying billions.

2. **Memory-hard** — each guess requires 64 MiB of RAM. GPUs have thousands of cores but limited memory per core. A GPU with 24 GB of VRAM can only run ~375 parallel Argon2 guesses (24 GB ÷ 64 MiB). Compare that to SHA-256, where each core needs only bytes of state.

3. **Side-channel resistant** — the "id" variant (Argon2**id**) uses a hybrid approach: the first pass accesses memory in a data-independent pattern (safe against cache-timing attacks), while subsequent passes use data-dependent access (harder for GPUs).

The parameters you'll configure:

| Parameter | Our Value | What It Controls |
|-----------|-----------|-----------------|
| `m_cost` | 65536 (64 MiB) | Memory required per hash. Higher = more RAM per guess = fewer parallel attacks |
| `t_cost` | 3 | Number of passes over memory. Higher = slower per guess |
| `p_cost` | 4 | Parallelism lanes. Match to your CPU cores. Attacker must also use this many threads per guess |
| Output length | 32 bytes | 256 bits — exactly what AES-256 needs as a key |

**The salt** is 16 random bytes stored in the vault file header. It ensures that two vaults with the same master password produce completely different encryption keys. Without salt, an attacker could precompute a "rainbow table" of password→key mappings and crack any vault instantly.

### 8.1 — New Dependencies

Add the crates we need to `Cargo.toml`:

```toml
[dependencies]
# ... existing deps from Act 1 ...
argon2 = "0.5"          # Argon2id key derivation
rand = "0.9"            # Cryptographic random number generation
hex = "0.4"             # Hex encoding for display
```

The `argon2` crate is from the RustCrypto project — the same team behind most of Rust's cryptographic ecosystem. It's pure Rust (no C dependencies), audited, and implements all three Argon2 variants.

`rand` with its default features gives us `OsRng` — a cryptographically secure random number generator that reads from your OS's entropy source (`/dev/urandom` on macOS/Linux, `BCryptGenRandom` on Windows).

### 8.2 — Generating a Random Salt

Create `src/crypto.rs`:

```rust
// src/crypto.rs — Cryptographic operations for Ironvault

use rand::RngCore;    // Trait that provides fill_bytes() for random generation
use rand::rngs::OsRng; // OS-level cryptographic RNG

/// Generate a 16-byte random salt for Argon2 key derivation.
///
/// Uses the operating system's CSPRNG (cryptographically secure pseudo-random
/// number generator). On macOS this reads from /dev/urandom via the Security
/// framework. On Linux it uses getrandom(2).
///
/// Each vault gets a unique salt, stored in the file header. This prevents
/// rainbow table attacks and ensures identical passwords produce different keys.
pub fn generate_salt() -> [u8; 16] {
    let mut salt = [0u8; 16];  // 16 bytes of zeros — we'll overwrite them
    OsRng.fill_bytes(&mut salt); // Fill with cryptographic randomness
    salt
}
```

Let's break down every piece:

**`[u8; 16]`** — This is a Rust *array*: exactly 16 bytes, stack-allocated, fixed size. In Python you'd use `bytes(16)` or `os.urandom(16)`. The Rust version is special: the size `16` is part of the *type*. You can't accidentally pass a 15-byte salt — the compiler rejects it.

```python
# Python equivalent
import os
salt = os.urandom(16)  # Returns bytes, but nothing enforces length
```

**`[0u8; 16]`** — Array initialization syntax. `0u8` means "the value 0 as a u8 (unsigned byte)." The `; 16` means "repeat it 16 times." This creates `[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]`.

**`OsRng.fill_bytes(&mut salt)`** — `OsRng` is a zero-sized struct (it has no fields — it's just a handle to the OS entropy source). `fill_bytes` takes a `&mut [u8]` — a mutable reference to a byte slice — and fills it with random data. The `&mut` means "I'm borrowing this array and I'm going to modify it."

> **Why `OsRng` and not `rand::rng()`?** For cryptographic purposes, `OsRng` reads directly from the OS entropy pool. `rand::rng()` uses a userspace CSPRNG (ChaCha12) seeded from `OsRng` — also secure, but for salt generation we want the most direct path to hardware entropy. Both are fine here; we use `OsRng` to be explicit about our security intent.

### 8.3 — Deriving a Key with Argon2id

Now the core function — turning a password and salt into a 256-bit encryption key:

```rust
use argon2::{Argon2, Algorithm, Version, Params};

/// Argon2id parameters matching the design spec (§3.2).
/// These are stored in the vault header so we can change them later
/// without breaking existing vaults.
pub const ARGON2_M_COST: u32 = 65_536;  // 64 MiB in KiB
pub const ARGON2_T_COST: u32 = 3;       // 3 iterations
pub const ARGON2_P_COST: u32 = 4;       // 4 parallel lanes
pub const KEY_LENGTH: usize = 32;        // 256 bits for AES-256

/// Derive a 256-bit encryption key from a password and salt using Argon2id.
///
/// This is deliberately slow (~200ms on modern hardware) to resist brute-force
/// attacks. The memory cost (64 MiB) makes GPU-based attacks impractical.
///
/// # Arguments
/// * `password` - The master password as raw bytes
/// * `salt` - 16-byte unique salt (from generate_salt())
///
/// # Returns
/// A 32-byte (256-bit) key suitable for AES-256-GCM encryption.
pub fn derive_key(password: &[u8], salt: &[u8; 16]) -> Result<[u8; 32], argon2::Error> {
    // Build Argon2 parameters. ParamsBuilder validates all values
    // (e.g., m_cost must be >= 8 * p_cost).
    let params = Params::new(
        ARGON2_M_COST,  // memory: 65536 KiB = 64 MiB
        ARGON2_T_COST,  // time: 3 iterations
        ARGON2_P_COST,  // parallelism: 4 lanes
        Some(KEY_LENGTH), // output: 32 bytes
    )?;

    // Create the Argon2 context:
    //   Algorithm::Argon2id — hybrid variant (side-channel safe + GPU-hard)
    //   Version::V0x13     — version 19 (0x13 in hex), the current standard
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);

    // The output buffer — 32 bytes of zeros that will be overwritten
    // with the derived key material.
    let mut key = [0u8; 32];

    // hash_password_into() takes:
    //   pwd:  &[u8]     — password bytes (borrowed slice)
    //   salt: &[u8]     — salt bytes (borrowed slice)
    //   out:  &mut [u8] — output buffer (mutable borrowed slice)
    //
    // The salt parameter accepts &[u8], so our &[u8; 16] auto-coerces.
    // This is Rust's "deref coercion": &[u8; 16] → &[u8] happens automatically.
    argon2.hash_password_into(password, salt, &mut key)?;

    Ok(key)
}
```

There's a lot happening here. Let's unpack the Rust concepts:

**`&[u8]` vs `&[u8; 16]` vs `[u8; 32]`** — This is the array/slice distinction that trips up every Rust beginner:

| Type | What it is | Size known at | Analogy |
|------|-----------|---------------|---------|
| `[u8; 32]` | Array — exactly 32 bytes, owned | Compile time | Python `bytes(32)` but size is enforced by the type system |
| `&[u8]` | Slice — a *view* into some bytes, any length | Runtime | Python `memoryview` |
| `&[u8; 16]` | Reference to a 16-byte array | Compile time | A pointer to exactly 16 bytes |

When `hash_password_into` asks for `&[u8]`, you can pass `&[u8; 16]` because Rust automatically converts (coerces) a reference to a fixed-size array into a slice. The slice just "forgets" the compile-time length.

```python
# Python — no distinction between "exactly 16 bytes" and "some bytes"
salt = os.urandom(16)       # type: bytes (any length)
key = hashlib.sha256(salt)  # accepts any bytes
```

**`Params::new(m_cost, t_cost, p_cost, Some(output_len))`** — This is the `argon2` 0.5 API for constructing parameters. It returns `Result<Params>` because it validates the parameters (e.g., `m_cost` must be at least `8 * p_cost`). The `Some(KEY_LENGTH)` sets the output length; `None` would use the default (32 bytes, which is what we want anyway, but being explicit is better).

**`Algorithm::Argon2id`** — The enum variant for the hybrid algorithm. The `argon2` crate also provides `Argon2d` and `Argon2i`, but `Argon2id` is the recommended choice for password hashing per the RFC.

**`Version::V0x13`** — Version 19 in hex (0x13 = 19). This is the current and only production version of Argon2. The version is stored in the vault header so future versions can be supported.

**`?` operator** — The question mark propagates errors. If `Params::new()` returns `Err(...)`, the function immediately returns that error. If it returns `Ok(params)`, the value is unwrapped and assigned. This is Rust's equivalent of Python's exception propagation, but explicit and checked at compile time.

### 8.4 — A Test Program

Let's verify our key derivation works. Update `src/main.rs`:

```rust
// src/main.rs — temporary test harness for key derivation

mod crypto;

fn main() {
    println!("=== The Salt Mines ===\n");

    // Generate a random salt
    let salt = crypto::generate_salt();
    println!("Salt (hex): {}", hex::encode(salt));

    // Derive a key from a test password
    let password = b"correct horse battery staple";
    println!("Password:   \"correct horse battery staple\"");
    println!("Deriving key (this takes ~200ms)...\n");

    let key = crypto::derive_key(password, &salt)
        .expect("Key derivation failed");

    println!("Derived key (hex): {}", hex::encode(key));
    println!("Key length: {} bytes ({} bits)\n", key.len(), key.len() * 8);

    // Prove determinism: same password + same salt = same key
    let key2 = crypto::derive_key(password, &salt)
        .expect("Key derivation failed");
    assert_eq!(key, key2, "Same password + salt must produce same key");
    println!("[PASS] Same password + same salt = same key");

    // Prove salt matters: same password + different salt = different key
    let different_salt = crypto::generate_salt();
    let key3 = crypto::derive_key(password, &different_salt)
        .expect("Key derivation failed");
    assert_ne!(key, key3, "Different salt must produce different key");
    println!("[PASS] Same password + different salt = different key");

    // Prove password matters: different password + same salt = different key
    let key4 = crypto::derive_key(b"wrong password", &salt)
        .expect("Key derivation failed");
    assert_ne!(key, key4, "Different password must produce different key");
    println!("[PASS] Different password + same salt = different key");

    println!("\nAll tests passed. The Salt Mines are operational.");
}
```

Run it:

```bash
cargo run
```

You should see output like:

```
=== The Salt Mines ===

Salt (hex): a3f7c2e891b4d056f8e2a1c3b7d9e4f6
Password:   "correct horse battery staple"
Deriving key (this takes ~200ms)...

Derived key (hex): 7b2f4a8c...  (64 hex chars = 32 bytes)
Key length: 32 bytes (256 bits)

[PASS] Same password + same salt = same key
[PASS] Same password + different salt = different key
[PASS] Different password + same salt = different key

All tests passed. The Salt Mines are operational.
```

Notice the ~200ms delay on each derivation. That's the point. You feel it as a brief pause. An attacker feels it as centuries.

> [!warning] Security note: the key is in plain memory
> Right now, the master key sits in memory as a plain `[u8; 32]`. If the process crashes, that memory could be dumped to disk. In Stage 27, we'll fix this with `zeroize` — a crate that overwrites sensitive memory when it's dropped. For now, be aware this is a known gap we'll close later.

### 8.5 — Proper Unit Tests

Add tests to `src/crypto.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn salt_is_16_bytes() {
        let salt = generate_salt();
        assert_eq!(salt.len(), 16);
    }

    #[test]
    fn salt_is_random() {
        // Two salts should (almost certainly) be different.
        // Probability of collision: 1/2^128 — effectively zero.
        let salt1 = generate_salt();
        let salt2 = generate_salt();
        assert_ne!(salt1, salt2);
    }

    #[test]
    fn derive_key_deterministic() {
        let salt = [0xAA; 16]; // Fixed salt for reproducibility
        let key1 = derive_key(b"test password", &salt).unwrap();
        let key2 = derive_key(b"test password", &salt).unwrap();
        assert_eq!(key1, key2);
    }

    #[test]
    fn derive_key_different_salt() {
        let salt1 = [0xAA; 16];
        let salt2 = [0xBB; 16];
        let key1 = derive_key(b"test password", &salt1).unwrap();
        let key2 = derive_key(b"test password", &salt2).unwrap();
        assert_ne!(key1, key2);
    }

    #[test]
    fn derive_key_different_password() {
        let salt = [0xAA; 16];
        let key1 = derive_key(b"password1", &salt).unwrap();
        let key2 = derive_key(b"password2", &salt).unwrap();
        assert_ne!(key1, key2);
    }

    #[test]
    fn derive_key_length() {
        let salt = [0xAA; 16];
        let key = derive_key(b"test", &salt).unwrap();
        assert_eq!(key.len(), 32); // 256 bits
    }
}
```

Run with `cargo test`. All six should pass.

You now have a key derivation function that turns a password into a 256-bit key — slowly, deliberately, and uniquely per vault. But a key without a cipher is just a number. In Stage 9, you'll build the Cipher that uses this key to actually encrypt and decrypt data.

### 8.6 — What to Try

1. **Benchmark it.** Add `use std::time::Instant;` and measure how long `derive_key` takes. Try changing `ARGON2_M_COST` to `8192` (8 MiB) — notice how much faster it gets? That's the tradeoff: faster for you = faster for attackers.

2. **Try an empty password.** Does `derive_key(b"", &salt)` work? It should — Argon2 accepts empty passwords. But Ironvault will enforce minimum password strength later.

3. **Print the salt and key as hex.** Get comfortable with `hex::encode()`. You'll use it constantly when debugging crypto code.

> [!warning] Common Mistake: Using `String` for the password
> `String` in Rust is heap-allocated and may be copied by the allocator during reallocation. When the `String` is dropped, the memory is freed but *not zeroed* — the password lingers in freed memory until something else overwrites it. In Stage 12 we'll use `secrecy::SecretString` to fix this. For now, we use `&[u8]` which at least avoids unnecessary copies.

> [!warning] Common Mistake: Hardcoding the salt
> If every vault uses the same salt, an attacker can precompute a table of password→key mappings and crack any vault instantly. Always generate a fresh random salt per vault.

> [!warning] Common Mistake: Using `rand::rng()` for salt generation
> This actually works fine — `rand::rng()` is cryptographically secure (it uses ChaCha12 seeded from `OsRng`). But using `OsRng` directly makes the security intent explicit. In crypto code, clarity beats cleverness.

> [!warning] Common Mistake: Choosing weak Argon2 parameters
> The OWASP recommendation for 2024+ is `m=64MiB, t=3, p=4` as a minimum. If you're running on a beefy server, crank `m_cost` higher. The goal: key derivation should take 200-500ms on the target machine.

> [!check] Checkpoint
> ```rust
> // src/crypto.rs — Cryptographic operations for Ironvault
>
> use argon2::{Algorithm, Argon2, Params, Version};
> use rand::rngs::OsRng;
> use rand::RngCore;
>
> // --- Constants (§3.2 Key Derivation) ---
>
> pub const ARGON2_M_COST: u32 = 65_536; // 64 MiB in KiB
> pub const ARGON2_T_COST: u32 = 3;      // 3 iterations
> pub const ARGON2_P_COST: u32 = 4;      // 4 parallel lanes
> pub const KEY_LENGTH: usize = 32;       // 256 bits for AES-256
>
> // --- Salt Generation ---
>
> pub fn generate_salt() -> [u8; 16] {
> let mut salt = [0u8; 16];
> OsRng.fill_bytes(&mut salt);
> salt
> }
>
> // --- Key Derivation ---
>
> pub fn derive_key(password: &[u8], salt: &[u8; 16]) -> Result<[u8; 32], argon2::Error> {
> let params = Params::new(ARGON2_M_COST, ARGON2_T_COST, ARGON2_P_COST, Some(KEY_LENGTH))?;
> let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
> let mut key = [0u8; 32];
> argon2.hash_password_into(password, salt, &mut key)?;
> Ok(key)
> }
>
> #[cfg(test)]
> mod tests {
> use super::*;
>
> #[test]
> fn salt_is_16_bytes() {
> let salt = generate_salt();
> assert_eq!(salt.len(), 16);
> }
>
> #[test]
> fn salt_is_random() {
> let salt1 = generate_salt();
> let salt2 = generate_salt();
> assert_ne!(salt1, salt2);
> }
>
> #[test]
> fn derive_key_deterministic() {
> let salt = [0xAA; 16];
> let key1 = derive_key(b"test password", &salt).unwrap();
> let key2 = derive_key(b"test password", &salt).unwrap();
> assert_eq!(key1, key2);
> }
>
> #[test]
> fn derive_key_different_salt() {
> let salt1 = [0xAA; 16];
> let salt2 = [0xBB; 16];
> let key1 = derive_key(b"test password", &salt1).unwrap();
> let key2 = derive_key(b"test password", &salt2).unwrap();
> assert_ne!(key1, key2);
> }
>
> #[test]
> fn derive_key_different_password() {
> let salt = [0xAA; 16];
> let key1 = derive_key(b"password1", &salt).unwrap();
> let key2 = derive_key(b"password2", &salt).unwrap();
> assert_ne!(key1, key2);
> }
>
> #[test]
> fn derive_key_length() {
> let salt = [0xAA; 16];
> let key = derive_key(b"test", &salt).unwrap();
> assert_eq!(key.len(), 32);
> }
> }
> ```


---

## Stage 9 — The Cipher

*Difficulty: Hard*

You have a 256-bit key from Argon2id, but a key alone doesn't protect anything. This stage builds the encryption and decryption functions that transform readable JSON into indecipherable ciphertext — and back again. Critically, it uses *authenticated* encryption (AES-GCM), which means tampering with even a single byte of the encrypted vault will be detected and rejected. Without authentication, an attacker who can't read your passwords could still silently corrupt them.

> *"In the deepest chamber of the Forge, the Cipher awaits — an ancient mechanism that transforms your relics into indecipherable glyphs. Feed it a key and your secrets, and it produces a sealed scroll that no one can read without the same key. But the Cipher does more than hide — it seals. If even a single glyph on the scroll is altered, the Cipher refuses to unseal it. Tampering is detected. Forgery is impossible."*

### What is Authenticated Encryption?

Most people think encryption = "make it unreadable." That's only half the story. There are two properties you need:

1. **Confidentiality** — an attacker can't read the plaintext. AES provides this.
2. **Integrity** — an attacker can't modify the ciphertext without detection. GCM provides this.

Without integrity, an attacker who can't *read* your passwords can still *corrupt* them. Imagine an attacker flips a bit in your encrypted vault. You decrypt it, get garbage for one password, and paste that garbage into a login form. Or worse — with certain cipher modes (like CBC), an attacker can *surgically* modify plaintext by flipping specific ciphertext bits. This is called a **bit-flipping attack**.

AES-**GCM** (Galois/Counter Mode) is an **AEAD** cipher — Authenticated Encryption with Associated Data. It gives you both properties in a single operation:

```
encrypt(key, nonce, plaintext) → ciphertext || auth_tag (16 bytes)
decrypt(key, nonce, ciphertext || auth_tag) → plaintext OR ERROR
```

The **auth tag** is a 16-byte cryptographic checksum. If *anything* changes — the ciphertext, the nonce, or even associated data — decryption fails. This is how we detect wrong passwords too: derive the wrong key → auth tag doesn't match → decryption returns an error.

**AWS parallel:** When you call `aws kms encrypt`, the response includes both the ciphertext and metadata (key ID, encryption context). KMS uses AES-256-GCM internally. S3 server-side encryption with KMS (SSE-KMS) uses the same algorithm. The auth tag is why you can't just swap ciphertext blobs between different encryption contexts — the tag verification fails.

### The Nonce: 12 Random Bytes That Must Never Repeat

A **nonce** (Number used ONCE) is 12 bytes of randomness prepended to each encryption. It ensures that encrypting the same plaintext twice with the same key produces different ciphertext.

**Why nonce reuse is catastrophic in GCM:**

GCM uses the nonce to generate a keystream via AES in counter mode. If you reuse a nonce with the same key:

1. The keystreams are identical
2. XOR of two ciphertexts = XOR of two plaintexts (the keystream cancels out)
3. The attacker can recover both plaintexts using frequency analysis
4. Worse: the attacker can forge valid auth tags for arbitrary messages

This isn't theoretical — it's a complete break of the cipher. The NSA's [CNSA Suite guidance](https://media.defense.gov/2022/Sep/07/2003071834/-1/-1/0/CSA_CNSA_2.0_ALGORITHMS_.PDF) lists nonce reuse as a critical implementation failure.

**How we avoid it:** generate 12 random bytes from `OsRng` for every encryption. With random 96-bit nonces, the birthday bound gives a collision probability of ~2^-32 after 2^32 (~4 billion) encryptions. Since we re-encrypt the vault on every save, and a human might save a few times per day, we'd need to use the same key for billions of years to hit the bound.

### 9.1 — New Dependencies

Add `aes-gcm` to `Cargo.toml`:

```toml
[dependencies]
# ... existing deps ...
aes-gcm = "0.10"   # AES-256-GCM authenticated encryption
```

### 9.2 — Custom Error Type

Right now our `derive_key` function returns `argon2::Error`, but encryption will introduce `aes_gcm::Error` and data validation errors. We can't return three different error types from the same function without a unifying type. A custom error enum solves this — each variant wraps a specific failure mode, and the `From` trait lets the `?` operator convert automatically.

Before we write the crypto functions, we need a proper error type. Crypto operations can fail in multiple ways, and we want to distinguish them:

```rust
// Add to src/crypto.rs, near the top

use std::fmt;

/// Errors that can occur during cryptographic operations.
#[derive(Debug)]
pub enum CryptoError {
    /// Argon2 key derivation failed (invalid params, etc.)
    KeyDerivation(argon2::Error),
    /// AES-GCM encryption or decryption failed.
    /// For decryption, this usually means wrong key or tampered data.
    Cipher(aes_gcm::Error),
    /// The encrypted blob is too short to contain a nonce + ciphertext.
    InvalidData(String),
}

impl fmt::Display for CryptoError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CryptoError::KeyDerivation(e) => write!(f, "Key derivation failed: {e}"),
            CryptoError::Cipher(_) => {
                write!(f, "Decryption failed (wrong password or corrupted data)")
            }
            CryptoError::InvalidData(msg) => write!(f, "Invalid data: {msg}"),
        }
    }
}

// The From trait lets us use the ? operator to auto-convert errors.
// When a function returns Result<T, CryptoError>, calling an argon2
// function with ? automatically wraps its error in CryptoError::KeyDerivation.

impl From<argon2::Error> for CryptoError {
    fn from(e: argon2::Error) -> Self {
        CryptoError::KeyDerivation(e)
    }
}

impl From<aes_gcm::Error> for CryptoError {
    fn from(e: aes_gcm::Error) -> Self {
        CryptoError::Cipher(e)
    }
}
```

**Why custom errors?** In Python, you'd catch `ValueError` or `CryptoError` and check the message string. Rust's approach is different: each error variant is a distinct type. You can `match` on it, and the compiler ensures you handle every case.

**The `From` trait** is Rust's conversion mechanism. By implementing `From<argon2::Error> for CryptoError`, we tell Rust: "whenever you see an `argon2::Error` and need a `CryptoError`, wrap it in `CryptoError::KeyDerivation`." This makes the `?` operator work seamlessly:

```rust
// Without From: manual conversion
let params = Params::new(...).map_err(CryptoError::KeyDerivation)?;

// With From: the ? operator calls .into() automatically
let params = Params::new(...)?;  // argon2::Error → CryptoError via From
```

```python
# Python equivalent — no compile-time guarantees
try:
    key = argon2.hash(password, salt)
except argon2.exceptions.HashingError as e:
    raise CryptoError(f"Key derivation failed: {e}")
```

### 9.3 — Encrypt Function

Now the encryption function. This is the heart of Ironvault's security:

```rust
use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng as AeadOsRng},
    Aes256Gcm, Nonce, Key,
};

/// Size of the AES-GCM nonce in bytes (96 bits).
pub const NONCE_LENGTH: usize = 12;

/// Encrypt plaintext using AES-256-GCM.
///
/// Returns: nonce (12 bytes) || ciphertext || auth_tag (16 bytes)
///
/// The nonce is prepended to the output so decrypt() can extract it.
/// The auth tag is appended by AES-GCM automatically.
///
/// # Security
/// A fresh random nonce is generated for every call. Never reuse a nonce
/// with the same key — it completely breaks GCM's security.
pub fn encrypt(key: &[u8; 32], plaintext: &[u8]) -> Result<Vec<u8>, CryptoError> {
    // Wrap the raw key bytes in aes-gcm's Key type.
    // Key::<Aes256Gcm> is a GenericArray<u8, U32> — a fixed-size array
    // that the crypto library uses internally.
    let cipher_key = Key::<Aes256Gcm>::from_slice(key);

    // Create the cipher instance. This does key expansion — AES internally
    // expands the 256-bit key into 15 round keys (240 bytes total).
    let cipher = Aes256Gcm::new(cipher_key);

    // Generate a random 96-bit nonce. AeadCore::generate_nonce() returns
    // a Nonce<Aes256Gcm> which is a GenericArray<u8, U12>.
    let nonce = Aes256Gcm::generate_nonce(&mut AeadOsRng);

    // Encrypt. The Aead::encrypt() method returns Vec<u8> containing
    // the ciphertext with the 16-byte auth tag appended.
    // If this fails, it's an internal error (shouldn't happen with valid inputs).
    let ciphertext = cipher.encrypt(&nonce, plaintext)?;

    // Prepend the nonce to the ciphertext.
    // Layout: [nonce: 12 bytes][ciphertext + auth_tag: variable]
    let mut output = Vec::with_capacity(NONCE_LENGTH + ciphertext.len());
    output.extend_from_slice(&nonce);  // 12 bytes
    output.extend_from_slice(&ciphertext); // ciphertext + 16-byte tag
    Ok(output)
}
```

Let's trace through the types:

**`Key::<Aes256Gcm>::from_slice(key)`** — The `aes-gcm` crate uses `GenericArray` from the `generic-array` crate for fixed-size arrays. `Key::<Aes256Gcm>` is a type alias for `GenericArray<u8, U32>` — essentially a 32-byte array, but one that the crypto traits can work with. `from_slice()` converts our `&[u8; 32]` (which auto-coerces to `&[u8]`) into this type. It panics if the slice length doesn't match — but since we pass a `&[u8; 32]`, the length is guaranteed at compile time.

**`Aes256Gcm::new(cipher_key)`** — Creates the cipher. This comes from the `KeyInit` trait (re-exported by `aes-gcm`). Internally, AES key expansion runs here — the 256-bit key is expanded into the round keys used by each of AES's 14 rounds.

**`Aes256Gcm::generate_nonce(&mut OsRng)`** — Generates 12 random bytes. This comes from the `AeadCore` trait. The return type is `Nonce<Aes256Gcm>` which is `GenericArray<u8, U12>`.

**`cipher.encrypt(&nonce, plaintext)?`** — The `Aead` trait's `encrypt` method. Takes a nonce and plaintext (as `&[u8]`), returns `Result<Vec<u8>, aes_gcm::Error>`. The returned `Vec` contains the ciphertext with the 16-byte GCM auth tag appended. The `?` converts `aes_gcm::Error` to `CryptoError` via our `From` impl.

**`Vec::with_capacity()`** — Pre-allocates the exact amount of memory we need. Without this, `extend_from_slice` might reallocate multiple times as the Vec grows. This is a performance optimization, not a correctness requirement.

### 9.4 — Decrypt Function

Decryption is the reverse — split the nonce from the ciphertext, then decrypt:

```rust
/// Decrypt a blob produced by encrypt().
///
/// Expects: nonce (12 bytes) || ciphertext || auth_tag (16 bytes)
///
/// # Errors
/// Returns CryptoError::Cipher if:
/// - The key is wrong (auth tag verification fails)
/// - The data has been tampered with
/// - The nonce or ciphertext is corrupted
///
/// Returns CryptoError::InvalidData if the blob is too short.
pub fn decrypt(key: &[u8; 32], encrypted: &[u8]) -> Result<Vec<u8>, CryptoError> {
    // Minimum size: 12 (nonce) + 16 (auth tag) + 1 (at least 1 byte of ciphertext)
    // Actually, GCM can encrypt empty plaintext, so minimum is 12 + 16 = 28.
    if encrypted.len() < NONCE_LENGTH + 16 {
        return Err(CryptoError::InvalidData(format!(
            "Encrypted data too short: {} bytes (minimum {})",
            encrypted.len(),
            NONCE_LENGTH + 16
        )));
    }

    // Split the blob into nonce and ciphertext+tag.
    // Rust slicing: &encrypted[..12] takes the first 12 bytes,
    // &encrypted[12..] takes everything after.
    let (nonce_bytes, ciphertext_with_tag) = encrypted.split_at(NONCE_LENGTH);

    // Convert the nonce slice to the Nonce type.
    // Nonce::from_slice() panics if length != 12, but we just split at 12.
    let nonce = Nonce::from_slice(nonce_bytes);

    let cipher_key = Key::<Aes256Gcm>::from_slice(key);
    let cipher = Aes256Gcm::new(cipher_key);

    // Decrypt and verify the auth tag in one operation.
    // If the key is wrong, the derived keystream is wrong, so the auth tag
    // won't match → returns Err. This is how we detect wrong passwords.
    //
    // GCM tag verification is constant-time (uses the `subtle` crate internally),
    // so an attacker can't use timing differences to guess the correct tag.
    let plaintext = cipher.decrypt(nonce, ciphertext_with_tag)?;

    Ok(plaintext)
}
```

**`split_at(NONCE_LENGTH)`** — This is a slice method that returns two sub-slices: `(&encrypted[..12], &encrypted[12..])`. No copying, no allocation — just two pointers into the same memory. This is one of Rust's strengths: zero-cost abstractions over raw memory.

```python
# Python equivalent
nonce = encrypted[:12]
ciphertext = encrypted[12:]
# But Python copies the bytes! Rust just creates views.
```

**Why `ciphertext_with_tag`?** The `aes-gcm` crate's `encrypt()` appends the 16-byte auth tag to the ciphertext. Its `decrypt()` expects the tag to still be appended. We don't need to split them — the library handles it internally.

### 9.5 — Testing the Cipher

Add these tests to the `tests` module in `crypto.rs`:

```rust
    #[test]
    fn encrypt_decrypt_round_trip() {
        let key = [0x42; 32]; // Fixed key for testing
        let plaintext = b"The Armory holds three relics.";

        let encrypted = encrypt(&key, plaintext).unwrap();
        let decrypted = decrypt(&key, &encrypted).unwrap();

        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn encrypt_produces_different_output_each_time() {
        // Because the nonce is random, encrypting the same plaintext
        // with the same key produces different ciphertext every time.
        let key = [0x42; 32];
        let plaintext = b"same message";

        let enc1 = encrypt(&key, plaintext).unwrap();
        let enc2 = encrypt(&key, plaintext).unwrap();

        assert_ne!(enc1, enc2); // Different nonces → different output
    }

    #[test]
    fn wrong_key_fails() {
        let key1 = [0x42; 32];
        let key2 = [0x43; 32]; // One bit different

        let encrypted = encrypt(&key1, b"secret").unwrap();
        let result = decrypt(&key2, &encrypted);

        assert!(result.is_err()); // Auth tag mismatch → error
    }

    #[test]
    fn tampered_ciphertext_fails() {
        let key = [0x42; 32];
        let mut encrypted = encrypt(&key, b"secret").unwrap();

        // Flip one bit in the ciphertext (after the 12-byte nonce)
        encrypted[15] ^= 0x01;

        let result = decrypt(&key, &encrypted);
        assert!(result.is_err()); // Tamper detected
    }

    #[test]
    fn tampered_nonce_fails() {
        let key = [0x42; 32];
        let mut encrypted = encrypt(&key, b"secret").unwrap();

        // Flip one bit in the nonce
        encrypted[0] ^= 0x01;

        let result = decrypt(&key, &encrypted);
        assert!(result.is_err()); // Wrong nonce → wrong keystream → tag mismatch
    }

    #[test]
    fn too_short_data_fails() {
        let key = [0x42; 32];
        let short = vec![0u8; 10]; // Way too short

        let result = decrypt(&key, &short);
        assert!(matches!(result, Err(CryptoError::InvalidData(_))));
    }

    #[test]
    fn empty_plaintext_round_trip() {
        // GCM can encrypt empty plaintext — the result is just nonce + auth tag
        let key = [0x42; 32];
        let encrypted = encrypt(&key, b"").unwrap();
        assert_eq!(encrypted.len(), 12 + 16); // nonce + tag, no ciphertext

        let decrypted = decrypt(&key, &encrypted).unwrap();
        assert_eq!(decrypted, b"");
    }
```

Run `cargo test`. All tests should pass. Pay special attention to `wrong_key_fails` and `tampered_ciphertext_fails` — these prove that GCM's authentication works. A cipher without authentication (like AES-CBC) would happily decrypt with the wrong key and return garbage instead of an error.

With key derivation and authenticated encryption in hand, you're ready to define the binary file format that ties them together — the Vault Door in Stage 10.

### 9.6 — What to Try

1. **Measure the overhead.** Encrypt a 1 KB plaintext and check the output size. It should be 1024 + 12 (nonce) + 16 (tag) = 1052 bytes. GCM adds exactly 28 bytes of overhead regardless of plaintext size.

2. **Try encrypting a large payload.** Serialize your vault from Act 1 to JSON, encrypt it, then decrypt and deserialize. This is exactly what we'll do in Stage 10.

3. **Inspect the encrypted output.** Print `hex::encode(&encrypted)` and notice the first 24 hex chars are the nonce (12 bytes × 2 hex chars each). The rest is ciphertext + tag.

> [!warning] Common Mistake: Reusing a nonce
> This is the #1 crypto implementation bug. If you ever see code that uses a counter or timestamp as a nonce, be very suspicious. Random nonces from `OsRng` are the safest approach for our use case.

> [!warning] Common Mistake: Not checking the auth tag
> Some crypto libraries return decrypted data even when the tag doesn't match, leaving it to the caller to verify. The `aes-gcm` crate does the right thing: `decrypt()` returns `Err` if the tag is invalid. Never ignore this error.

> [!warning] Common Mistake: Using `String::from_utf8()` on decrypted bytes without checking
> After decryption, you get `Vec<u8>`. If the original plaintext was UTF-8 (like our JSON vault), you need `String::from_utf8(decrypted)?` which validates the bytes. Don't use `from_utf8_unchecked` — if something went wrong in decryption, you'd get undefined behavior.

> [!warning] Common Mistake: Storing the key in a `String` or `Vec<u8>`
> These types don't zeroize on drop. The key lingers in freed memory. We'll fix this with `secrecy::Secret<[u8; 32]>` in a later stage.

> [!check] Checkpoint
> ```rust
> // src/crypto.rs — Cryptographic operations for Ironvault
>
> use aes_gcm::{
> aead::{Aead, AeadCore, KeyInit, OsRng as AeadOsRng},
> Aes256Gcm, Key, Nonce,
> };
> use argon2::{Algorithm, Argon2, Params, Version};
> use rand::rngs::OsRng;
> use rand::RngCore;
> use std::fmt;
>
> // --- Constants ---
>
> pub const ARGON2_M_COST: u32 = 65_536;
> pub const ARGON2_T_COST: u32 = 3;
> pub const ARGON2_P_COST: u32 = 4;
> pub const KEY_LENGTH: usize = 32;
> pub const NONCE_LENGTH: usize = 12;
>
> // --- Error Type ---
>
> #[derive(Debug)]
> pub enum CryptoError {
> KeyDerivation(argon2::Error),
> Cipher(aes_gcm::Error),
> InvalidData(String),
> }
>
> impl fmt::Display for CryptoError {
> fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
> match self {
> CryptoError::KeyDerivation(e) => write!(f, "Key derivation failed: {e}"),
> CryptoError::Cipher(_) => {
> write!(f, "Decryption failed (wrong password or corrupted data)")
> }
> CryptoError::InvalidData(msg) => write!(f, "Invalid data: {msg}"),
> }
> }
> }
>
> impl From<argon2::Error> for CryptoError {
> fn from(e: argon2::Error) -> Self {
> CryptoError::KeyDerivation(e)
> }
> }
>
> impl From<aes_gcm::Error> for CryptoError {
> fn from(e: aes_gcm::Error) -> Self {
> CryptoError::Cipher(e)
> }
> }
>
> // --- Salt Generation ---
>
> pub fn generate_salt() -> [u8; 16] {
> let mut salt = [0u8; 16];
> OsRng.fill_bytes(&mut salt);
> salt
> }
>
> // --- Key Derivation ---
>
> pub fn derive_key(password: &[u8], salt: &[u8; 16]) -> Result<[u8; 32], CryptoError> {
> let params = Params::new(ARGON2_M_COST, ARGON2_T_COST, ARGON2_P_COST, Some(KEY_LENGTH))?;
> let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
> let mut key = [0u8; 32];
> argon2.hash_password_into(password, salt, &mut key)?;
> Ok(key)
> }
>
> // --- Encryption ---
>
> pub fn encrypt(key: &[u8; 32], plaintext: &[u8]) -> Result<Vec<u8>, CryptoError> {
> let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
> let nonce = Aes256Gcm::generate_nonce(&mut AeadOsRng);
> let ciphertext = cipher.encrypt(&nonce, plaintext)?;
>
> let mut output = Vec::with_capacity(NONCE_LENGTH + ciphertext.len());
> output.extend_from_slice(&nonce);
> output.extend_from_slice(&ciphertext);
> Ok(output)
> }
>
> // --- Decryption ---
>
> pub fn decrypt(key: &[u8; 32], encrypted: &[u8]) -> Result<Vec<u8>, CryptoError> {
> if encrypted.len() < NONCE_LENGTH + 16 {
> return Err(CryptoError::InvalidData(format!(
> "Encrypted data too short: {} bytes (minimum {})",
> encrypted.len(),
> NONCE_LENGTH + 16
> )));
> }
>
> let (nonce_bytes, ciphertext_with_tag) = encrypted.split_at(NONCE_LENGTH);
> let nonce = Nonce::from_slice(nonce_bytes);
> let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
> let plaintext = cipher.decrypt(nonce, ciphertext_with_tag)?;
> Ok(plaintext)
> }
>
> #[cfg(test)]
> mod tests {
> use super::*;
>
> #[test]
> fn salt_is_16_bytes() {
> assert_eq!(generate_salt().len(), 16);
> }
>
> #[test]
> fn salt_is_random() {
> assert_ne!(generate_salt(), generate_salt());
> }
>
> #[test]
> fn derive_key_deterministic() {
> let salt = [0xAA; 16];
> let k1 = derive_key(b"test", &salt).unwrap();
> let k2 = derive_key(b"test", &salt).unwrap();
> assert_eq!(k1, k2);
> }
>
> #[test]
> fn derive_key_different_salt() {
> let k1 = derive_key(b"test", &[0xAA; 16]).unwrap();
> let k2 = derive_key(b"test", &[0xBB; 16]).unwrap();
> assert_ne!(k1, k2);
> }
>
> #[test]
> fn derive_key_different_password() {
> let salt = [0xAA; 16];
> let k1 = derive_key(b"pass1", &salt).unwrap();
> let k2 = derive_key(b"pass2", &salt).unwrap();
> assert_ne!(k1, k2);
> }
>
> #[test]
> fn derive_key_length() {
> assert_eq!(derive_key(b"x", &[0; 16]).unwrap().len(), 32);
> }
>
> #[test]
> fn encrypt_decrypt_round_trip() {
> let key = [0x42; 32];
> let plaintext = b"The Armory holds three relics.";
> let encrypted = encrypt(&key, plaintext).unwrap();
> let decrypted = decrypt(&key, &encrypted).unwrap();
> assert_eq!(decrypted, plaintext);
> }
>
> #[test]
> fn encrypt_produces_different_output_each_time() {
> let key = [0x42; 32];
> let enc1 = encrypt(&key, b"same").unwrap();
> let enc2 = encrypt(&key, b"same").unwrap();
> assert_ne!(enc1, enc2);
> }
>
> #[test]
> fn wrong_key_fails() {
> let encrypted = encrypt(&[0x42; 32], b"secret").unwrap();
> assert!(decrypt(&[0x43; 32], &encrypted).is_err());
> }
>
> #[test]
> fn tampered_ciphertext_fails() {
> let key = [0x42; 32];
> let mut encrypted = encrypt(&key, b"secret").unwrap();
> encrypted[15] ^= 0x01;
> assert!(decrypt(&key, &encrypted).is_err());
> }
>
> #[test]
> fn tampered_nonce_fails() {
> let key = [0x42; 32];
> let mut encrypted = encrypt(&key, b"secret").unwrap();
> encrypted[0] ^= 0x01;
> assert!(decrypt(&key, &encrypted).is_err());
> }
>
> #[test]
> fn too_short_data_fails() {
> assert!(matches!(
> decrypt(&[0x42; 32], &[0u8; 10]),
> Err(CryptoError::InvalidData(_))
> ));
> }
>
> #[test]
> fn empty_plaintext_round_trip() {
> let key = [0x42; 32];
> let encrypted = encrypt(&key, b"").unwrap();
> assert_eq!(encrypted.len(), 12 + 16);
> assert_eq!(decrypt(&key, &encrypted).unwrap(), b"");
> }
> }
> ```


---

## Stage 10 — The Vault Door

*Difficulty: Hard*

You have encryption and key derivation, but no way to persist an encrypted vault to disk. The challenge: you need metadata (salt, nonce, Argon2 parameters) *before* you can decrypt, but that metadata must be stored alongside the ciphertext. This stage defines a binary file format with a plaintext header and an encrypted payload — the physical structure that makes the vault a real file on disk rather than an in-memory exercise.

> *"The Vault Door is no ordinary gate. It is inscribed with runes that declare its nature — 'IRONVAULT' in the old tongue — followed by sigils that encode the exact recipe for the alloy that seals it. Any smith who finds the door can read these runes and know what furnace settings to use. But without the Master Key itself, the runes are useless. The recipe is public. The key is not."*

Until now, your vault has been a plaintext JSON file. Anyone who opens it in a text editor can read every password. In this stage, we replace that with a binary file format that embeds the cryptographic parameters in a plaintext header, followed by the encrypted vault payload.

### Why a Binary Format?

You might ask: "Why not just encrypt the JSON and write the blob to a file?" Because you need metadata *before* you can decrypt:

- **Salt** — needed to derive the key from the password
- **Argon2 parameters** — needed to reproduce the same key derivation
- **Nonce** — needed to decrypt the ciphertext

This metadata must be readable *without* the key. So the file has two sections:

1. **Header (plaintext):** magic bytes, version, Argon2 params, salt, nonce
2. **Payload (encrypted):** the vault JSON, encrypted with AES-256-GCM

The header is not secret. An attacker who reads it learns your Argon2 cost parameters and salt — both of which are designed to be public. The salt is random noise. The parameters tell the attacker "this will cost you 64 MiB per guess" — that's a feature, not a bug.

### 10.1 — The Header Struct

Right now we have `encrypt()` and `decrypt()` functions that work on raw bytes, but no way to store the salt, nonce, and Argon2 parameters that the decryptor needs. We need a structured header that lives at the beginning of the file — readable without the key — followed by the encrypted payload.

From the design spec (§4.1), the file layout is:

```
┌─────────────────────────────────────────┐
│ Magic bytes: "IRONVAULT" (9 bytes)      │
│ Version: u8 (1 byte)                    │  ← Header (50 bytes total)
│ Argon2 m_cost: u32 LE (4 bytes)         │
│ Argon2 t_cost: u32 LE (4 bytes)         │
│ Argon2 p_cost: u32 LE (4 bytes)         │
│ Salt: (16 bytes)                        │
│ Nonce: (12 bytes)                       │
├─────────────────────────────────────────┤
│ Encrypted payload (variable length)     │  ← AES-256-GCM ciphertext + tag
└─────────────────────────────────────────┘
```

Create `src/vault.rs`:

```rust
// src/vault.rs — Vault file format: load, save, and atomic write

use crate::crypto::{self, CryptoError};
use std::fs;
use std::io::{self, Cursor, Read, Write};
use std::path::Path;

/// Magic bytes at the start of every vault file.
/// If a file doesn't start with these bytes, it's not an Ironvault file.
const MAGIC: &[u8; 9] = b"IRONVAULT";

/// Current vault format version. Increment when the format changes.
const VERSION: u8 = 1;

/// Total header size in bytes: 9 (magic) + 1 (version) + 12 (argon2 params) + 16 (salt) + 12 (nonce)
const HEADER_SIZE: usize = 9 + 1 + 4 + 4 + 4 + 16 + 12; // = 50

/// Parsed vault file header. Contains everything needed to derive the key
/// and decrypt the payload.
#[derive(Debug, Clone)]
pub struct VaultHeader {
    pub version: u8,
    pub argon2_m: u32,
    pub argon2_t: u32,
    pub argon2_p: u32,
    pub salt: [u8; 16],
    pub nonce: [u8; 12],
}
```

**Why `LE` (little-endian)?** Multi-byte integers (like `u32`) are stored differently on different CPU architectures. x86/ARM are little-endian (least significant byte first). To ensure a vault file created on one machine can be read on another, we explicitly use little-endian encoding with `u32::to_le_bytes()` and `u32::from_le_bytes()`.

```python
# Python equivalent — struct.pack handles endianness
import struct
header = struct.pack('<I', 65536)  # '<' = little-endian, 'I' = u32
```

### 10.2 — Writing the Header

```rust
impl VaultHeader {
    /// Serialize the header to bytes for writing to disk.
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(HEADER_SIZE);

        buf.extend_from_slice(MAGIC);              // 9 bytes
        buf.push(self.version);                     // 1 byte
        buf.extend_from_slice(&self.argon2_m.to_le_bytes()); // 4 bytes
        buf.extend_from_slice(&self.argon2_t.to_le_bytes()); // 4 bytes
        buf.extend_from_slice(&self.argon2_p.to_le_bytes()); // 4 bytes
        buf.extend_from_slice(&self.salt);          // 16 bytes
        buf.extend_from_slice(&self.nonce);         // 12 bytes

        debug_assert_eq!(buf.len(), HEADER_SIZE);
        buf
    }

    /// Parse a header from raw bytes.
    ///
    /// Returns the header and the remaining bytes (the encrypted payload).
    pub fn from_bytes(data: &[u8]) -> Result<(Self, &[u8]), VaultError> {
        if data.len() < HEADER_SIZE {
            return Err(VaultError::TooShort(data.len()));
        }

        // Use a Cursor to read sequentially from the byte slice.
        // Cursor<&[u8]> implements Read, so we can use read_exact().
        let mut cursor = Cursor::new(data);

        // Read and verify magic bytes
        let mut magic = [0u8; 9];
        cursor.read_exact(&mut magic)
            .map_err(|e| VaultError::Io(e))?;
        if &magic != MAGIC {
            return Err(VaultError::BadMagic);
        }

        // Read version
        let mut version_buf = [0u8; 1];
        cursor.read_exact(&mut version_buf)
            .map_err(|e| VaultError::Io(e))?;
        let version = version_buf[0];
        if version != VERSION {
            return Err(VaultError::UnsupportedVersion(version));
        }

        // Read Argon2 parameters (3 × u32, little-endian)
        let mut u32_buf = [0u8; 4];

        cursor.read_exact(&mut u32_buf).map_err(VaultError::Io)?;
        let argon2_m = u32::from_le_bytes(u32_buf);

        cursor.read_exact(&mut u32_buf).map_err(VaultError::Io)?;
        let argon2_t = u32::from_le_bytes(u32_buf);

        cursor.read_exact(&mut u32_buf).map_err(VaultError::Io)?;
        let argon2_p = u32::from_le_bytes(u32_buf);

        // Read salt and nonce
        let mut salt = [0u8; 16];
        cursor.read_exact(&mut salt).map_err(VaultError::Io)?;

        let mut nonce = [0u8; 12];
        cursor.read_exact(&mut nonce).map_err(VaultError::Io)?;

        // Everything after the header is the encrypted payload
        let payload = &data[HEADER_SIZE..];

        Ok((
            VaultHeader {
                version,
                argon2_m,
                argon2_t,
                argon2_p,
                salt,
                nonce,
            },
            payload,
        ))
    }
}
```

**`Cursor<&[u8]>`** — A `Cursor` wraps a byte slice and gives it a "read position" that advances as you read. It implements the `Read` trait, so you can use `read_exact()` to read a precise number of bytes. Think of it as a file-like object over an in-memory buffer.

```python
# Python equivalent
import io
cursor = io.BytesIO(data)
magic = cursor.read(9)
version = cursor.read(1)[0]
m_cost = struct.unpack('<I', cursor.read(4))[0]
```

**`read_exact(&mut buf)`** — Reads exactly `buf.len()` bytes, or returns an error. This is safer than `read()`, which might return fewer bytes than requested (short reads). For parsing a fixed-format header, `read_exact` is what you want.

**`u32::from_le_bytes([u8; 4])`** — Converts 4 little-endian bytes back to a `u32`. This is the inverse of `to_le_bytes()`. Both are `const fn` — they compile to a single instruction on x86.

### 10.3 — Vault Error Type

```rust
/// Errors that can occur when loading or saving the vault file.
#[derive(Debug)]
pub enum VaultError {
    /// File I/O error
    Io(io::Error),
    /// File doesn't start with "IRONVAULT"
    BadMagic,
    /// Vault format version not supported
    UnsupportedVersion(u8),
    /// File too short to contain a valid header
    TooShort(usize),
    /// Cryptographic operation failed (wrong password, tampered data)
    Crypto(CryptoError),
}

impl std::fmt::Display for VaultError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            VaultError::Io(e) => write!(f, "I/O error: {e}"),
            VaultError::BadMagic => write!(f, "Not an Ironvault file (bad magic bytes)"),
            VaultError::UnsupportedVersion(v) => write!(f, "Unsupported vault version: {v}"),
            VaultError::TooShort(n) => write!(f, "File too short ({n} bytes)"),
            VaultError::Crypto(e) => write!(f, "{e}"),
        }
    }
}

impl From<io::Error> for VaultError {
    fn from(e: io::Error) -> Self { VaultError::Io(e) }
}

impl From<CryptoError> for VaultError {
    fn from(e: CryptoError) -> Self { VaultError::Crypto(e) }
}
```

### 10.4 — Save and Load

Now the two functions that tie everything together:

```rust
/// Save an encrypted vault to disk using atomic rename.
///
/// # Atomic Write Strategy
/// 1. Write to a temporary file (vault.iron.tmp)
/// 2. fsync the temp file (flush to disk)
/// 3. Rename temp → vault.iron (atomic on POSIX)
///
/// If the process crashes mid-write, the original file is untouched.
/// This is the same strategy used by SQLite, Git, and most databases.
pub fn save_vault(
    path: &Path,
    key: &[u8; 32],
    salt: &[u8; 16],
    plaintext_json: &[u8],
) -> Result<(), VaultError> {
    // Encrypt the JSON payload
    let encrypted = crypto::encrypt(key, plaintext_json)?;

    // The encrypt() function prepends a nonce to the ciphertext.
    // We need to extract it for the header, then store only the
    // ciphertext+tag portion after the header.
    let nonce: [u8; 12] = encrypted[..crypto::NONCE_LENGTH]
        .try_into()
        .expect("nonce is always 12 bytes");
    let ciphertext_with_tag = &encrypted[crypto::NONCE_LENGTH..];

    // Build the header
    let header = VaultHeader {
        version: VERSION,
        argon2_m: crypto::ARGON2_M_COST,
        argon2_t: crypto::ARGON2_T_COST,
        argon2_p: crypto::ARGON2_P_COST,
        salt: *salt,
        nonce,
    };

    // Assemble the complete file: header + encrypted payload
    let header_bytes = header.to_bytes();
    let mut file_data = Vec::with_capacity(header_bytes.len() + ciphertext_with_tag.len());
    file_data.extend_from_slice(&header_bytes);
    file_data.extend_from_slice(ciphertext_with_tag);

    // Atomic write: temp file → fsync → rename
    let tmp_path = path.with_extension("iron.tmp");

    // Write the temp file
    let mut file = fs::File::create(&tmp_path)?;
    file.write_all(&file_data)?;
    file.sync_all()?; // fsync — ensures data hits the disk, not just the OS cache

    // Atomic rename (POSIX guarantees this is atomic on the same filesystem)
    fs::rename(&tmp_path, path)?;

    Ok(())
}

/// Load and decrypt a vault from disk.
///
/// Returns the decrypted JSON bytes and the header (for re-saving with
/// the same salt and parameters).
pub fn load_vault(
    path: &Path,
    key: &[u8; 32],
) -> Result<(Vec<u8>, VaultHeader), VaultError> {
    let data = fs::read(path)?;
    let (header, ciphertext_with_tag) = VaultHeader::from_bytes(&data)?;

    // Reconstruct the encrypted blob as encrypt() would have produced it:
    // nonce || ciphertext || tag
    let mut encrypted = Vec::with_capacity(crypto::NONCE_LENGTH + ciphertext_with_tag.len());
    encrypted.extend_from_slice(&header.nonce);
    encrypted.extend_from_slice(ciphertext_with_tag);

    // Decrypt. If the key is wrong, the auth tag won't match → CryptoError::Cipher
    let plaintext = crypto::decrypt(key, &encrypted)?;

    Ok((plaintext, header))
}
```

**`file.sync_all()?`** — This is `fsync()`. Without it, the OS might buffer the write in memory and not flush to disk. If the power goes out before the flush, your temp file could be empty or partial. `sync_all()` guarantees the bytes are on the physical disk before we proceed to the rename.

**`fs::rename(&tmp_path, path)?`** — On POSIX systems (macOS, Linux), renaming a file on the same filesystem is atomic. Either the old file exists or the new one does — never neither, never both. This is why we write to a `.tmp` file first: if the process crashes during `write_all`, the original vault is untouched.

**AWS parallel:** This is the same pattern S3 uses internally. S3 objects are immutable — a PUT writes a new object, and the metadata pointer is atomically updated. You never see a half-written object.

> **Why not just `fs::write(path, data)`?** Because `fs::write` is *not* atomic. It truncates the file first (destroying the old content), then writes the new content. If the process crashes between truncate and write, you lose both the old and new data. The temp-file-then-rename pattern is the standard solution.

### 10.5 — Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto;

    #[test]
    fn header_round_trip() {
        let header = VaultHeader {
            version: 1,
            argon2_m: 65536,
            argon2_t: 3,
            argon2_p: 4,
            salt: [0xAA; 16],
            nonce: [0xBB; 12],
        };

        let bytes = header.to_bytes();
        assert_eq!(bytes.len(), HEADER_SIZE);

        // Append some fake payload so from_bytes has something after the header
        let mut data = bytes;
        data.extend_from_slice(&[0xFF; 32]);

        let (parsed, payload) = VaultHeader::from_bytes(&data).unwrap();
        assert_eq!(parsed.version, 1);
        assert_eq!(parsed.argon2_m, 65536);
        assert_eq!(parsed.argon2_t, 3);
        assert_eq!(parsed.argon2_p, 4);
        assert_eq!(parsed.salt, [0xAA; 16]);
        assert_eq!(parsed.nonce, [0xBB; 12]);
        assert_eq!(payload, &[0xFF; 32]);
    }

    #[test]
    fn bad_magic_rejected() {
        let mut data = vec![0u8; HEADER_SIZE + 32];
        data[..9].copy_from_slice(b"NOT_VALID");
        assert!(matches!(
            VaultHeader::from_bytes(&data),
            Err(VaultError::BadMagic)
        ));
    }

    #[test]
    fn save_and_load_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.iron");

        let key = [0x42; 32];
        let salt = [0xAA; 16];
        let json = br#"{"version":1,"relics":[]}"#;

        save_vault(&path, &key, &salt, json).unwrap();
        let (decrypted, header) = load_vault(&path, &key).unwrap();

        assert_eq!(decrypted, json);
        assert_eq!(header.salt, salt);
        assert_eq!(header.version, 1);
    }

    #[test]
    fn wrong_key_load_fails() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.iron");

        save_vault(&path, &[0x42; 32], &[0xAA; 16], b"secret").unwrap();
        assert!(load_vault(&path, &[0x43; 32]).is_err());
    }
}
```

Add `tempfile` to your dev-dependencies for the filesystem tests:

```toml
[dev-dependencies]
tempfile = "3"
```

The vault file format is defined and tested — you can write encrypted data to disk and read it back. But there's no user-facing way to create or unlock a vault yet. Stage 11 wires up the password prompt, key derivation, and file I/O into the Master Key Ceremony.

### 10.6 — What to Try

1. **Hex-dump your vault file.** After saving, run `xxd ~/.ironvault/vault.iron | head -5` in your terminal. You should see `IRONVAULT` in ASCII at the start, followed by binary data.

2. **Corrupt the file.** Open the vault in a hex editor, change one byte in the encrypted section, and try to load it. You should get a decryption error — GCM detected the tampering.

3. **Read just the header.** Write a small program that reads only the first 50 bytes and prints the Argon2 parameters. This is what `iv unlock` will do — read the header to know how to derive the key, then prompt for the password.

> [!warning] Common Mistake: Forgetting `sync_all()`
> Without fsync, a power failure can leave you with an empty or partial temp file. On macOS, the default filesystem (APFS) is journaled, so this is less likely — but not impossible. Always fsync.

> [!warning] Common Mistake: Not using atomic rename
> If you write directly to the vault file and crash mid-write, the file is corrupted and your passwords are gone. The temp-file-then-rename pattern is non-negotiable for any file that stores important data.

> [!warning] Common Mistake: Storing the nonce in both the header and the encrypted blob
> Our `encrypt()` function prepends the nonce to the ciphertext. But we also store the nonce in the header (so we can read it before decryption). In `save_vault`, we extract the nonce from the encrypted blob and store it in the header, then write only the ciphertext+tag after the header. In `load_vault`, we reconstruct the nonce+ciphertext+tag blob before calling `decrypt()`. This is a bit awkward — in a production codebase, you might refactor `encrypt`/`decrypt` to take the nonce as a separate parameter.

---

## Stage 11 — The Master Key Ceremony

*Difficulty: Hard*

You have all the cryptographic primitives — key derivation, encryption, decryption, a binary file format — but they're disconnected functions. This stage wires them into the two most important user-facing operations: creating a new vault (`iv init`) and opening an existing one (`iv unlock`). This is where the vault becomes real — a user types a password, and either a new fortress is forged or an existing one opens its doors.

> *"The Master Key Ceremony is a solemn rite. To forge a new vault, you must speak your secret word twice — once to declare it, once to confirm. The Forge listens, but it does not remember. Your word is consumed in the furnace, transformed into the key, and the word itself is destroyed. If you forget it, no locksmith in the realm can help you. The vault is sealed forever."*

This is where everything comes together. We wire up the password prompt, key derivation, encryption, and vault file I/O into two real CLI commands:

- **`iv init`** — Create a new vault. Prompt for master password twice, derive key, encrypt an empty vault, write to disk.
- **`iv unlock`** — Open an existing vault. Prompt for password, derive key, attempt decryption. If the auth tag fails, the password is wrong.

### The Security of "Verify by Decrypting"

Ironvault never stores your password. It doesn't store a hash of your password. It doesn't store a "password verifier." Instead, it verifies your password by *trying to decrypt the vault*.

Here's why this works:

1. You type your password
2. Argon2id derives a 256-bit key from password + salt
3. AES-256-GCM attempts to decrypt the vault payload using that key
4. If the key is correct → the auth tag matches → decryption succeeds → you're in
5. If the key is wrong → the auth tag doesn't match → decryption fails → wrong password

This is elegant because there's nothing to steal. An attacker who reads the vault file sees the salt and Argon2 parameters (public by design) and the encrypted payload. There's no password hash to crack offline — they must brute-force the actual decryption, which means running Argon2id + AES-GCM for every guess.

**AWS parallel:** This is exactly how IAM authentication works. When you call an AWS API, you sign the request with your secret access key. AWS derives the same signature using its copy of your key. If the signatures match, you're authenticated. If not, you get `AccessDenied`. AWS never sends your key back to you — it verifies by reproducing the computation.

### 11.1 — Password Prompting

The `rpassword` crate (v7.4) provides two key functions:

- `rpassword::prompt_password("Enter password: ")` — prints a prompt, reads input with echo disabled, returns `io::Result<String>`
- `rpassword::read_password()` — reads with echo disabled, no prompt (you print your own)

We'll use `prompt_password` for a clean UX:

```rust
// src/cli.rs — CLI command handlers

use crate::crypto;
use crate::vault;
use std::path::PathBuf;
use std::process;

/// Default vault file location.
fn vault_path() -> PathBuf {
    let home = std::env::var("HOME").expect("HOME not set");
    PathBuf::from(home).join(".ironvault").join("vault.iron")
}

/// Prompt for a new master password with confirmation.
/// Returns the password as bytes, or exits if the user fails 3 times.
fn prompt_new_password() -> Vec<u8> {
    for attempt in 1..=3 {
        // prompt_password() disables terminal echo so the password
        // isn't visible as you type. On macOS/Linux it uses termios
        // to set ECHO off, reads from /dev/tty, then restores ECHO.
        let pass1 = rpassword::prompt_password("  Master password: ")
            .expect("Failed to read password");

        let pass2 = rpassword::prompt_password("  Confirm password: ")
            .expect("Failed to read password");

        if pass1 == pass2 {
            if pass1.is_empty() {
                eprintln!("  Password cannot be empty. Try again.");
                continue;
            }
            return pass1.into_bytes();
        }

        eprintln!(
            "  Passwords don't match. {} attempt(s) remaining.",
            3 - attempt
        );
    }

    eprintln!("Too many failed attempts. Aborting.");
    process::exit(1);
}

/// Prompt for an existing master password (single entry, no confirmation).
fn prompt_password() -> Vec<u8> {
    rpassword::prompt_password("  Master password: ")
        .expect("Failed to read password")
        .into_bytes()
}
```

**`rpassword::prompt_password()`** returns `io::Result<String>`. We `.expect()` on it because if we can't read from the terminal, there's nothing useful we can do. The `String` is then converted to `Vec<u8>` with `.into_bytes()` — this consumes the String (no copy) and gives us the raw UTF-8 bytes that Argon2 needs.

> **Security note:** The `String` returned by `rpassword` is a regular heap-allocated `String`. When we call `.into_bytes()`, the String's buffer is moved into the Vec — same memory, no copy. But if the String was ever reallocated (unlikely for a short password, but possible), the old buffer isn't zeroed. In a production password manager, you'd use `secrecy::SecretString` and `zeroize` to ensure the password is wiped from memory. We'll add that in a later stage.

### 11.2 — The `init` Command

```rust
/// Create a new vault. Prompts for master password, derives key,
/// encrypts an empty vault, writes to disk.
pub fn cmd_init() {
    let path = vault_path();

    // Don't overwrite an existing vault
    if path.exists() {
        eprintln!("Vault already exists at {}", path.display());
        eprintln!("Use 'iv destroy' to delete it first.");
        process::exit(1);
    }

    println!("=== Forging a New Vault ===\n");
    println!("Choose a master password. This is the ONLY way to unlock your vault.");
    println!("If you forget it, your relics are lost forever.\n");

    let password = prompt_new_password();

    println!("\n  Forging the Master Key (this takes a moment)...");

    // Generate a fresh salt for this vault
    let salt = crypto::generate_salt();

    // Derive the encryption key from password + salt
    let key = crypto::derive_key(&password, &salt)
        .expect("Key derivation failed");

    // Create an empty vault as JSON
    let empty_vault = br#"{
  "version": 1,
  "created_at": "",
  "updated_at": "",
  "chambers": {},
  "relics": []
}"#;

    // Create the directory if it doesn't exist
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).expect("Failed to create vault directory");
    }

    // Save the encrypted vault
    vault::save_vault(&path, &key, &salt, empty_vault)
        .expect("Failed to save vault");

    println!("  Vault forged at {}", path.display());
    println!("\n  Your vault is sealed. Use 'iv unlock' to open it.");
}
```

**`process::exit(1)`** — Immediately terminates the process with exit code 1 (error). This is the nuclear option — no destructors run, no cleanup happens. We use it here because there's nothing to clean up yet. In later stages, when we have session files to delete, we'll use a more graceful shutdown.

```python
# Python equivalent
import sys
sys.exit(1)
```

### 11.3 — The `unlock` Command

```rust
/// Unlock an existing vault. Prompts for password, derives key,
/// attempts decryption. Returns the decrypted JSON and key on success.
pub fn cmd_unlock() -> Option<(Vec<u8>, [u8; 32], vault::VaultHeader)> {
    let path = vault_path();

    if !path.exists() {
        eprintln!("No vault found at {}", path.display());
        eprintln!("Use 'iv init' to create one.");
        return None;
    }

    println!("=== Unlocking the Vault ===\n");

    // Read the vault header first to get the salt and Argon2 params.
    // We need these before we can derive the key.
    let file_data = std::fs::read(&path).expect("Failed to read vault file");
    let (header, _) = vault::VaultHeader::from_bytes(&file_data)
        .expect("Failed to parse vault header");

    // Allow 3 password attempts
    for attempt in 1..=3 {
        let password = prompt_password();

        println!("  Deriving key...");

        // Derive key using the salt and params from the vault header.
        // This ensures we use the same parameters that were used to create the vault,
        // even if the defaults have changed since then.
        let key = match crypto::derive_key_with_params(
            &password,
            &header.salt,
            header.argon2_m,
            header.argon2_t,
            header.argon2_p,
        ) {
            Ok(k) => k,
            Err(e) => {
                eprintln!("  Key derivation error: {e}");
                return None;
            }
        };

        // Attempt decryption. If the key is wrong, the GCM auth tag
        // won't match and decrypt will return Err.
        match vault::load_vault(&path, &key) {
            Ok((plaintext, header)) => {
                println!("  Vault unlocked.\n");
                return Some((plaintext, key, header));
            }
            Err(vault::VaultError::Crypto(_)) => {
                // Auth tag mismatch = wrong password
                eprintln!(
                    "  Wrong password. {} attempt(s) remaining.",
                    3 - attempt
                );
            }
            Err(e) => {
                // Some other error (I/O, corrupt file, etc.)
                eprintln!("  Error: {e}");
                return None;
            }
        }
    }

    eprintln!("Too many failed attempts. The vault remains sealed.");
    None
}
```

Notice we need a new function `derive_key_with_params` that accepts custom Argon2 parameters (from the vault header) instead of using the hardcoded defaults. Add this to `crypto.rs`:

```rust
/// Derive a key using specific Argon2 parameters (from a vault header).
/// This allows opening vaults created with different cost parameters.
pub fn derive_key_with_params(
    password: &[u8],
    salt: &[u8; 16],
    m_cost: u32,
    t_cost: u32,
    p_cost: u32,
) -> Result<[u8; 32], CryptoError> {
    let params = Params::new(m_cost, t_cost, p_cost, Some(KEY_LENGTH))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = [0u8; 32];
    argon2.hash_password_into(password, salt, &mut key)?;
    Ok(key)
}
```

### 11.4 — Wiring Up main.rs

Update `main.rs` to dispatch commands:

```rust
// src/main.rs

mod cli;
mod crypto;
mod vault;

fn main() {
    let args: Vec<String> = std::env::args().collect();

    match args.get(1).map(|s| s.as_str()) {
        Some("init") => cli::cmd_init(),
        Some("unlock") => {
            if let Some((json, _key, _header)) = cli::cmd_unlock() {
                // For now, just print the decrypted vault
                println!("{}", String::from_utf8_lossy(&json));
            }
        }
        _ => {
            eprintln!("Usage: ironvault <init|unlock>");
            std::process::exit(1);
        }
    }
}
```

Try it:

```bash
# Create a new vault
cargo run -- init

# Unlock it
cargo run -- unlock

# Try with wrong password — should fail after 3 attempts
cargo run -- unlock
```

The vault can be created and unlocked, but every command requires typing the master password and waiting for Argon2id. That's unusable for daily work. Stage 12 introduces session management — caching the derived key so you only authenticate once per session.

### 11.5 — What to Try

1. **Create a vault, then hex-dump it.** `xxd ~/.ironvault/vault.iron | head` — you should see the IRONVAULT magic bytes and binary header data.

2. **Try unlocking with the wrong password.** You should see "Wrong password" and get 3 attempts. The error comes from GCM auth tag verification — the decryption itself "works" (produces bytes), but the auth tag doesn't match, so the library returns an error.

3. **Delete the vault and re-create it with the same password.** The encrypted output will be completely different because the salt and nonce are random. This is correct — same password, different vault file.

> [!warning] Common Mistake: Comparing passwords with `==` on `String`
> String comparison in Rust is *not* constant-time. An attacker who can measure timing could theoretically determine how many characters match. For password *confirmation* (user typing the same password twice), this doesn't matter — the attacker is the user. But never use `==` to verify a password against a stored hash. GCM's tag verification is constant-time internally (via the `subtle` crate).

> [!warning] Common Mistake: Using `String` for the password after this point
> Once you have the derived key, the password should be dropped immediately. In our current code, `prompt_new_password()` returns `Vec<u8>` which is dropped at the end of `cmd_init()`. But the memory isn't zeroed. We'll fix this with `zeroize` in a later stage.

> [!warning] Common Mistake: Not reading params from the vault header
> If you always use the hardcoded defaults for key derivation, you can never change the Argon2 parameters without breaking existing vaults. Always read the params from the header — that's why they're stored there.

---

## Stage 12 — The Session Seal

*Difficulty: Hard*

Running Argon2id on every single command makes the vault unusable — 200ms of key derivation for a quick `iv list` is maddening. But keeping the derived key in memory only works for a single process invocation. This stage solves the UX problem by caching the derived key in a temporary file on RAM-backed storage, with strict permissions and PID tracking. The result: authenticate once, then use the vault freely until you lock it or the session expires.

> *"Once the vault is open, the Master Key must be kept close — but not too close. The ancient smiths devised the Session Seal: a wax imprint of the key, pressed into a tablet that exists only in the ether. When the vault is locked, the tablet dissolves. When the smith dies, the tablet dissolves. It cannot be copied to parchment, cannot survive a reboot of the realm. It exists only in the fleeting memory of the workshop."*

Right now, every command that needs the vault requires typing the master password. That means running Argon2id (~200ms) on every `iv get`, `iv list`, `iv add`. This is unusable.

The solution: after a successful unlock, cache the derived key in a temporary file. Subsequent commands read the cached key instead of re-prompting. The key file lives in `$TMPDIR` (which is RAM-backed on macOS) with strict permissions (readable only by your user).

### Why tmpfs?

On macOS, `$TMPDIR` points to a per-user directory under `/var/folders/` that's backed by APFS — technically on disk, but encrypted at rest by FileVault. On Linux, `/dev/shm` is a true tmpfs (RAM-backed filesystem) that's cleared on reboot.

The key insight: **the cached key file is the session token.** If an attacker can read it, they can decrypt your vault without knowing the password. So we need:

1. **Restrictive permissions** — `0600` (owner read/write only). No group, no other.
2. **Volatile storage** — tmpfs is cleared on reboot. If your laptop is stolen while powered off, the key is gone.
3. **PID tracking** — the lock file records which process created the session. If that process dies, the session is stale.

**AWS parallel:** This is exactly how AWS STS session tokens work. When you call `aws sts assume-role`, you get temporary credentials cached in `~/.aws/cli/cache/`. The credentials have an expiry time. If the process that requested them dies, the credentials persist until expiry — same tradeoff we're making here.

### 12.1 — The Session Module

Create `src/session.rs`:

```rust
// src/session.rs — Session management: key cache, lock file, PID tracking

use std::fs;
use std::io::Write;
use std::os::unix::fs::PermissionsExt; // Unix-specific: set file mode bits
use std::path::PathBuf;
use std::time::SystemTime;

/// Get the path for the session key cache file.
///
/// On macOS: $TMPDIR/ironvault-<uid>  (e.g., /var/folders/.../ironvault-501)
/// On Linux: /dev/shm/ironvault-<uid> (RAM-backed tmpfs)
///
/// The UID suffix prevents collisions between users on shared machines.
fn key_cache_path() -> PathBuf {
    let uid = unsafe { libc::getuid() }; // POSIX getuid() — always safe to call

    // Prefer /dev/shm on Linux (true tmpfs), fall back to $TMPDIR
    if cfg!(target_os = "linux") && std::path::Path::new("/dev/shm").exists() {
        PathBuf::from(format!("/dev/shm/ironvault-{uid}"))
    } else {
        std::env::temp_dir().join(format!("ironvault-{uid}"))
    }
}

/// Get the path for the session lock file.
fn lock_file_path() -> PathBuf {
    let home = std::env::var("HOME").expect("HOME not set");
    PathBuf::from(home)
        .join(".ironvault")
        .join("session.lock")
}
```

Wait — we need `libc` for `getuid()`. Add it to `Cargo.toml`:

```toml
[dependencies]
# ... existing deps ...
libc = "0.2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

We also add `serde` and `serde_json` because the lock file is JSON.

**`cfg!(target_os = "linux")`** — A compile-time check. On macOS, this branch is compiled out entirely. Rust's `cfg!` macro returns `true` or `false` at compile time based on the target platform. This is how you write cross-platform code without `#ifdef` spaghetti.

**`unsafe { libc::getuid() }`** — `getuid()` is a POSIX system call that returns the current user's numeric ID. It's marked `unsafe` in Rust because it's a foreign function call (FFI), but it's always safe to call — it just reads a kernel value. The `unsafe` block is Rust saying "I've verified this is safe, trust me."

```python
# Python equivalent
import os, tempfile
key_path = os.path.join(tempfile.gettempdir(), f"ironvault-{os.getuid()}")
```

### 12.2 — Saving and Loading the Cached Key

```rust
/// Cache the derived key to a tmpfs-backed file with 0600 permissions.
///
/// # Security
/// - File permissions: 0600 (owner read/write only)
/// - Location: tmpfs (RAM-backed, cleared on reboot)
/// - Content: raw 32 bytes of the derived key
pub fn cache_key(key: &[u8; 32]) -> std::io::Result<()> {
    let path = key_cache_path();

    // Write the key to the file
    let mut file = fs::File::create(&path)?;
    file.write_all(key)?;
    file.sync_all()?;

    // Set permissions to 0600 (owner read/write only).
    // This MUST happen after creation — there's a brief window between
    // create and chmod where the file has default permissions (usually 0644).
    // A production implementation would use open() with O_CREAT | O_EXCL
    // and a umask, but this is sufficient for our threat model.
    let perms = fs::Permissions::from_mode(0o600);
    fs::set_permissions(&path, perms)?;

    Ok(())
}

/// Read the cached key from the tmpfs file.
/// Returns None if the file doesn't exist or is the wrong size.
pub fn load_cached_key() -> Option<[u8; 32]> {
    let path = key_cache_path();
    let data = fs::read(&path).ok()?;

    // The key must be exactly 32 bytes
    let key: [u8; 32] = data.try_into().ok()?;
    Some(key)
}

/// Zeroize and delete the cached key file.
///
/// We overwrite the file with zeros before deleting to ensure the key
/// doesn't linger on disk (even tmpfs can be swapped in theory).
pub fn clear_cached_key() -> std::io::Result<()> {
    let path = key_cache_path();

    if path.exists() {
        // Overwrite with zeros
        let mut file = fs::OpenOptions::new().write(true).open(&path)?;
        file.write_all(&[0u8; 32])?;
        file.sync_all()?;

        // Then delete
        fs::remove_file(&path)?;
    }

    Ok(())
}
```

**`fs::Permissions::from_mode(0o600)`** — The `0o` prefix means octal. `600` in octal = owner can read+write, group and others have no access. This is the `PermissionsExt` trait from `std::os::unix::fs` — it's Unix-specific, which is fine because Ironvault only targets macOS and Linux.

```bash
# Equivalent shell command
chmod 600 /tmp/ironvault-501
```

**`data.try_into().ok()?`** — This converts `Vec<u8>` to `[u8; 32]`. `try_into()` returns `Result<[u8; 32], Vec<u8>>` — it succeeds if the Vec has exactly 32 elements, fails otherwise. `.ok()` converts the Result to an Option (discarding the error), and `?` returns `None` if it failed. This is a common Rust pattern for "try to convert, bail if it doesn't work."

```python
# Python equivalent
data = open(path, 'rb').read()
if len(data) != 32:
    return None
```

### 12.3 — The Lock File

The lock file tracks session metadata — which process owns the session and when it was last active:

```rust
use serde::{Deserialize, Serialize};

/// Session lock file contents.
#[derive(Debug, Serialize, Deserialize)]
pub struct LockInfo {
    pub pid: u32,
    pub unlocked_at: u64,    // Unix timestamp
    pub last_activity: u64,  // Unix timestamp — updated on every command
}

/// Write the lock file with current PID and timestamp.
pub fn write_lock_file() -> std::io::Result<()> {
    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    let info = LockInfo {
        pid: std::process::id(),
        unlocked_at: now,
        last_activity: now,
    };

    let path = lock_file_path();
    let json = serde_json::to_string_pretty(&info)
        .expect("Failed to serialize lock info");
    fs::write(&path, json)?;
    Ok(())
}

/// Read the lock file. Returns None if it doesn't exist or can't be parsed.
pub fn read_lock_file() -> Option<LockInfo> {
    let path = lock_file_path();
    let data = fs::read_to_string(&path).ok()?;
    serde_json::from_str(&data).ok()
}

/// Update the last_activity timestamp in the lock file.
pub fn touch_lock_file() -> std::io::Result<()> {
    if let Some(mut info) = read_lock_file() {
        info.last_activity = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let path = lock_file_path();
        let json = serde_json::to_string_pretty(&info)
            .expect("Failed to serialize lock info");
        fs::write(&path, json)?;
    }
    Ok(())
}

/// Remove the lock file.
pub fn remove_lock_file() -> std::io::Result<()> {
    let path = lock_file_path();
    if path.exists() {
        fs::remove_file(&path)?;
    }
    Ok(())
}

/// Check if a process with the given PID is still alive.
///
/// Uses kill(pid, 0) — sending signal 0 doesn't actually send a signal,
/// it just checks if the process exists and we have permission to signal it.
pub fn is_pid_alive(pid: u32) -> bool {
    // kill(pid, 0) returns 0 if the process exists, -1 if it doesn't
    unsafe { libc::kill(pid as i32, 0) == 0 }
}

/// Check if there's a valid (non-stale) session.
///
/// A session is stale if:
/// - The lock file doesn't exist
/// - The PID in the lock file is dead
/// - The key cache file doesn't exist
pub fn is_session_valid() -> bool {
    let lock = match read_lock_file() {
        Some(l) => l,
        None => return false,
    };

    // Check if the owning process is still alive
    if !is_pid_alive(lock.pid) {
        // Stale session — clean up
        let _ = clear_cached_key();
        let _ = remove_lock_file();
        return false;
    }

    // Check if the key cache exists
    load_cached_key().is_some()
}
```

**`std::process::id()`** — Returns the current process's PID as `u32`. Every time you run `cargo run -- unlock`, this is a different PID.

**`libc::kill(pid, 0)`** — Signal 0 is special: it doesn't send any signal, but the kernel still checks if the target process exists and if you have permission to signal it. If it returns 0, the process is alive. If -1, it's dead (or you don't have permission, but since we're checking our own user's processes, permission is guaranteed).

```python
# Python equivalent
import os, signal
try:
    os.kill(pid, 0)
    return True
except ProcessLookupError:
    return False
```

### 12.4 — The `lock` Command

```rust
// Add to src/cli.rs

/// Lock the vault: zeroize cached key, remove lock file.
pub fn cmd_lock() {
    println!("=== Sealing the Vault ===\n");

    match session::clear_cached_key() {
        Ok(()) => println!("  Key cache cleared."),
        Err(e) => eprintln!("  Warning: failed to clear key cache: {e}"),
    }

    match session::remove_lock_file() {
        Ok(()) => println!("  Lock file removed."),
        Err(e) => eprintln!("  Warning: failed to remove lock file: {e}"),
    }

    println!("\n  The vault is sealed.");
}
```

And update `cmd_unlock` to cache the key and write the lock file:

```rust
// In cmd_unlock(), after successful decryption:
pub fn cmd_unlock() -> Option<(Vec<u8>, [u8; 32], vault::VaultHeader)> {
    // ... (existing code up to successful decryption) ...

    // After: match vault::load_vault(&path, &key) { Ok((plaintext, header)) => {
        // Cache the key for subsequent commands
        session::cache_key(&key)
            .expect("Failed to cache session key");
        session::write_lock_file()
            .expect("Failed to write lock file");

        println!("  Vault unlocked. Session active.\n");
        return Some((plaintext, key, header));
    // }}
}
```

### 12.5 — Auto-Unlock for Commands

Now any command that needs the vault can check for a cached session first:

```rust
// Add to src/cli.rs

/// Get the vault key — either from cache or by prompting.
/// Updates the lock file's last_activity timestamp.
pub fn get_vault_key() -> Option<([u8; 32], vault::VaultHeader)> {
    // Try cached session first
    if session::is_session_valid() {
        if let Some(key) = session::load_cached_key() {
            // Update activity timestamp
            let _ = session::touch_lock_file();

            // Read the header (we need it for the salt)
            let path = vault_path();
            let data = std::fs::read(&path).ok()?;
            let (header, _) = vault::VaultHeader::from_bytes(&data).ok()?;

            return Some((key, header));
        }
    }

    // No valid session — prompt for password
    let (_, key, header) = cmd_unlock()?;
    Some((key, header))
}
```

Sessions make the vault usable, but an unlocked session that never expires is a security hole. If you walk away from your terminal, anyone can access your credentials. Stage 13 adds a configurable inactivity timeout that automatically seals the vault.

### 12.6 — What to Try

1. **Run `iv unlock`, then check the key cache.** On macOS: `ls -la $TMPDIR/ironvault-*`. You should see a 32-byte file with `-rw-------` permissions (0600).

2. **Run `iv lock`, then check again.** The file should be gone.

3. **Simulate a stale session.** Unlock, note the PID in `~/.ironvault/session.lock`, then kill that process (or just wait — the PID will be reused eventually). The next command should detect the stale session and re-prompt.

> [!warning] Common Mistake: Setting permissions before writing
> If you `chmod 600` an empty file, then write to it, some systems might reset the permissions. Always write first, then set permissions. (Better yet, use `open()` with a umask, but that requires more platform-specific code.)

> [!warning] Common Mistake: Not zeroizing before deleting
> `fs::remove_file()` unlinks the file from the directory, but the data may still be on disk until overwritten by something else. By writing zeros first, we ensure the key bytes are gone even if the filesystem doesn't immediately reclaim the blocks.

> [!warning] Common Mistake: Trusting the PID blindly
> PIDs are recycled. If process 12345 unlocked the vault and then died, a new process might get PID 12345. Our `is_pid_alive` check would say "yes, it's alive" even though it's a different process. This is a known limitation — the window is small (PIDs cycle through tens of thousands of values), and the timeout in Stage 13 provides a second layer of defense.

> [!warning] Common Mistake: Running as root
> If Ironvault runs as root, the key cache file at `/tmp/ironvault-0` is readable by root — which is every process running as root. Don't run password managers as root.

---

## Stage 13 — The Timeout

*Difficulty: Medium*

An unlocked vault that stays unlocked forever is an invitation to disaster. If you step away from your desk, anyone who sits down has full access to every credential. This stage adds an inactivity timeout — after a configurable period of silence, the session key is zeroized and the vault re-seals itself. It also introduces the configuration file, giving users control over security-convenience tradeoffs.

> *"Even the most vigilant guardian must sleep. The Timeout is a ward placed upon the Session Seal — after a period of silence, the seal dissolves on its own. A thief who finds an unattended workshop has only minutes before the key vanishes. The ward is configurable: a paranoid smith sets it to five minutes, a trusting one to an hour. But it must never be infinite. An eternal session is an eternal vulnerability."*

Right now, once you unlock the vault, the session lasts forever (until you explicitly `iv lock` or reboot). If you walk away from your laptop with the vault unlocked, anyone who sits down can run `iv get --show-password` and read all your credentials.

The fix: check the `last_activity` timestamp in the lock file against a configurable timeout. If the session has been idle too long, require re-authentication.

### 13.1 — The Config File

Right now the lock timeout, clipboard clear duration, and Argon2 parameters are all hardcoded constants scattered across the codebase. Users can't adjust them without recompiling. We need a configuration file with sensible defaults that users can override — and the `#[serde(default)]` pattern makes this painless.

Ironvault's configuration lives at `~/.ironvault/config.toml`. We'll use the `toml` crate to parse it and provide sensible defaults for every field:

Add to `Cargo.toml`:

```toml
[dependencies]
# ... existing deps ...
toml = "0.8"
```

Create `src/config.rs`:

```rust
// src/config.rs — Configuration file loading with defaults

use serde::Deserialize;
use std::path::PathBuf;

/// Top-level configuration.
#[derive(Debug, Deserialize)]
#[serde(default)] // Use Default impl for missing fields
pub struct Config {
    pub vault: VaultConfig,
    pub argon2: Argon2Config,
}

/// Vault-related settings.
#[derive(Debug, Deserialize)]
#[serde(default)]
pub struct VaultConfig {
    /// Path to the vault file. ~ is expanded to $HOME.
    pub path: String,
    /// Auto-lock after this many minutes of inactivity.
    pub lock_timeout_minutes: u64,
    /// Seconds before clipboard is cleared after copying a password.
    pub clipboard_clear_seconds: u64,
}

/// Argon2 key derivation parameters.
#[derive(Debug, Deserialize)]
#[serde(default)]
pub struct Argon2Config {
    pub memory_kib: u32,
    pub iterations: u32,
    pub parallelism: u32,
}

// --- Defaults ---

impl Default for Config {
    fn default() -> Self {
        Config {
            vault: VaultConfig::default(),
            argon2: Argon2Config::default(),
        }
    }
}

impl Default for VaultConfig {
    fn default() -> Self {
        VaultConfig {
            path: "~/.ironvault/vault.iron".to_string(),
            lock_timeout_minutes: 15,
            clipboard_clear_seconds: 30,
        }
    }
}

impl Default for Argon2Config {
    fn default() -> Self {
        Argon2Config {
            memory_kib: 65_536,
            iterations: 3,
            parallelism: 4,
        }
    }
}
```

**`#[serde(default)]`** — This attribute tells serde: "if a field is missing from the TOML file, use the `Default` implementation instead of returning an error." This means users only need to specify the settings they want to change. A minimal config file works:

```toml
# ~/.ironvault/config.toml
[vault]
lock_timeout_minutes = 5
```

All other fields get their defaults. This is much friendlier than requiring every field.

```python
# Python equivalent — manual default merging
DEFAULT_CONFIG = {"lock_timeout_minutes": 15, "clipboard_clear_seconds": 30}
user_config = toml.load("config.toml")
config = {**DEFAULT_CONFIG, **user_config}  # user overrides defaults
```

In Rust, `#[serde(default)]` does this automatically at the struct level.

### 13.2 — Loading the Config

```rust
/// Load configuration from ~/.ironvault/config.toml.
/// Returns defaults if the file doesn't exist.
pub fn load_config() -> Config {
    let home = std::env::var("HOME").expect("HOME not set");
    let config_path = PathBuf::from(&home)
        .join(".ironvault")
        .join("config.toml");

    match std::fs::read_to_string(&config_path) {
        Ok(contents) => {
            // Parse the TOML. If parsing fails, warn and use defaults.
            match toml::from_str::<Config>(&contents) {
                Ok(config) => config,
                Err(e) => {
                    eprintln!(
                        "Warning: failed to parse {}: {e}",
                        config_path.display()
                    );
                    eprintln!("Using default configuration.");
                    Config::default()
                }
            }
        }
        Err(_) => {
            // File doesn't exist — that's fine, use defaults
            Config::default()
        }
    }
}

/// Expand ~ to $HOME in a path string.
pub fn expand_path(path: &str) -> PathBuf {
    if let Some(rest) = path.strip_prefix("~/") {
        let home = std::env::var("HOME").expect("HOME not set");
        PathBuf::from(home).join(rest)
    } else {
        PathBuf::from(path)
    }
}
```

**`toml::from_str::<Config>(&contents)`** — The turbofish syntax `::<Config>` tells `from_str` what type to deserialize into. The `toml` crate uses serde under the hood, so our `#[derive(Deserialize)]` and `#[serde(default)]` attributes do all the work.

**Graceful degradation:** If the config file is missing, we use defaults. If it exists but has a parse error, we warn and use defaults. The vault should always be usable, even with a broken config.

### 13.3 — Timeout Check

Now we integrate the timeout into the session validation. Update `session.rs`:

```rust
use crate::config;

/// Check if the session has expired based on the lock timeout.
///
/// Returns true if the session is still valid (within timeout).
/// Returns false if expired, and cleans up the stale session.
pub fn check_timeout() -> bool {
    let cfg = config::load_config();
    let timeout_secs = cfg.vault.lock_timeout_minutes * 60;

    let lock = match read_lock_file() {
        Some(l) => l,
        None => return false,
    };

    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    let elapsed = now.saturating_sub(lock.last_activity);

    if elapsed > timeout_secs {
        // Session expired — clean up
        eprintln!(
            "  Session expired ({} minutes idle, timeout is {} minutes).",
            elapsed / 60,
            cfg.vault.lock_timeout_minutes
        );
        let _ = clear_cached_key();
        let _ = remove_lock_file();
        return false;
    }

    true
}
```

**`now.saturating_sub(lock.last_activity)`** — Saturating subtraction returns 0 instead of panicking on underflow. If `last_activity` is somehow in the future (clock skew, NTP adjustment), we get 0 instead of a panic. Always use saturating arithmetic when dealing with timestamps.

```python
# Python equivalent
elapsed = max(0, time.time() - last_activity)
if elapsed > timeout_seconds:
    cleanup()
```

Now update `is_session_valid()` to include the timeout check:

```rust
/// Check if there's a valid, non-expired session.
pub fn is_session_valid() -> bool {
    let lock = match read_lock_file() {
        Some(l) => l,
        None => return false,
    };

    // Check PID liveness
    if !is_pid_alive(lock.pid) {
        let _ = clear_cached_key();
        let _ = remove_lock_file();
        return false;
    }

    // Check timeout
    if !check_timeout() {
        return false;
    }

    // Check key cache exists
    load_cached_key().is_some()
}
```

### 13.4 — Activity Tracking

Every command that uses the vault should update `last_activity`. We already have `touch_lock_file()` — make sure `get_vault_key()` calls it:

```rust
// In cli.rs — get_vault_key()
pub fn get_vault_key() -> Option<([u8; 32], vault::VaultHeader)> {
    if session::is_session_valid() {
        if let Some(key) = session::load_cached_key() {
            // Update activity timestamp — resets the timeout clock
            let _ = session::touch_lock_file();
            // ... rest of the function
        }
    }
    // ... prompt for password if no valid session
}
```

This means the timeout is an *inactivity* timeout, not an absolute timeout. If you're actively using the vault, the session stays alive. It only expires after `lock_timeout_minutes` of no commands.

**AWS parallel:** IAM session tokens have a fixed expiry (1-12 hours). AWS SSO credentials refresh automatically on use. Our approach is closer to SSO — activity extends the session.

With the timeout in place, Act 2's cryptographic foundation is complete. The vault encrypts, decrypts, manages sessions, and auto-locks. In Act 3, you'll build the tools that make the vault genuinely useful — password generation, clipboard management, TOTP, search, and more.

### 13.5 — Testing the Timeout

You can test the timeout without waiting 15 minutes by creating a config with a short timeout:

```bash
mkdir -p ~/.ironvault
cat > ~/.ironvault/config.toml << 'EOF'
[vault]
lock_timeout_minutes = 1
EOF
```

Then:

```bash
cargo run -- unlock    # Unlock the vault
# Wait 61 seconds...
cargo run -- unlock    # Should say "Session expired" and re-prompt
```

### 13.6 — What to Try

1. **Set timeout to 0.** What happens? Every command requires re-authentication. This is the most secure setting but terrible UX.

2. **Set timeout to 1440 (24 hours).** Now the session lasts all day. Convenient but risky — if you leave your laptop unlocked, anyone has 24 hours to read your passwords.

3. **Check the lock file.** `cat ~/.ironvault/session.lock` — you should see the PID and timestamps. Run a command and check again — `last_activity` should be updated.

4. **Kill the process and try again.** Note the PID in the lock file, then run `kill <pid>` (it'll fail because the process already exited, but that's fine). The next command should detect the stale PID and re-prompt.

> [!warning] Common Mistake: Using `chrono` for simple duration math
> We don't actually need `chrono` for the timeout check — `SystemTime` and Unix timestamps (u64 seconds) are sufficient. `chrono` is useful when you need human-readable dates (like `created_at` in the vault JSON), but for "has N seconds elapsed?" plain arithmetic works.

> [!warning] Common Mistake: Not handling clock skew
> If the system clock jumps backward (NTP correction, manual adjustment, VM migration), `now - last_activity` could underflow. `saturating_sub` handles this gracefully. Never use plain subtraction on timestamps.

> [!warning] Common Mistake: Making the timeout configurable but not the Argon2 params
> We store Argon2 params in the vault header *and* in the config file. The header params are authoritative (used for decryption). The config params are used only when creating a new vault or changing the password. Don't mix them up.

> [!warning] Common Mistake: Infinite timeout
> Never allow `lock_timeout_minutes = 0` to mean "no timeout." If you want that behavior, make it explicit (e.g., a separate `disable_timeout = true` flag) so users can't accidentally set it.

---

## Act 2 — Summary

You've built the cryptographic foundation of a real password manager. Let's review what each layer protects:

| Layer | What It Does | What Attack It Prevents |
|-------|-------------|------------------------|
| **Argon2id** | Turns password → 256-bit key (slowly) | Brute-force: GPU/ASIC attacks cost 64 MiB per guess |
| **AES-256-GCM** | Encrypts vault with authentication | Confidentiality: can't read without key. Integrity: can't tamper without detection |
| **Random salt** | Unique per vault | Rainbow tables: precomputed password→key mappings |
| **Random nonce** | Unique per encryption | Nonce reuse: XOR of plaintexts, auth tag forgery |
| **Binary header** | Stores params in plaintext | Forward compatibility: can change params without breaking old vaults |
| **Atomic write** | Temp file → fsync → rename | Data loss: crash during write doesn't corrupt the vault |
| **Session cache** | Key in tmpfs with 0600 perms | Repeated prompting: usable UX without sacrificing security |
| **Lock timeout** | Auto-expire after inactivity | Unattended access: stolen laptop with unlocked vault |

**What's still missing** (we'll add these in later acts):

- `zeroize` / `secrecy` — wiping secrets from memory on drop
- Clipboard auto-clear — copying passwords securely
- HIBP breach checking — k-anonymity password verification
- Password generation — cryptographically secure random passwords
- TOTP — time-based one-time passwords

In Act 3, we'll build the relic CRUD operations — adding, retrieving, editing, and deleting passwords. The vault is sealed. Now we fill it with treasure.

> *"The vault stands ready. Its door is forged from the strongest alloy known to the realm — a key derived from your secret word, tempered in the fires of Argon2, sealed with the Cipher of Galois. No thief can read its contents. No forger can alter them undetected. The Salt Mines ensure every vault is unique. The Timeout ensures no session lasts forever. You are the Vaultkeeper now. Guard your Master Key well."*
