# Act 4 — Eyes on the Horizon

> *"The vault is sealed. The relics are safe. But safety is not the same as vigilance. A locked door means nothing if the key was copied years ago and you never knew."*

Welcome to Act 4. Your vault works — encryption, key derivation, TOTP, clipboard, search. You can store secrets and retrieve them. But a password manager that only stores passwords is like a castle with walls but no watchtower. You can't see what's coming.

In this act, you'll build **The Watchtower** — a suite of security audit tools that scan your vault for weaknesses before an attacker finds them:

- **The Breach Oracle** — check passwords against the Have I Been Pwned database without ever sending them over the network
- **The Audit** — scan every relic for weak passwords, reuse, age, and missing 2FA
- **The Key Reforging** — change your master password and re-encrypt the entire vault atomically
- **The Lock Timeout** — auto-lock the vault after inactivity
- **The Sentinel** — securely destroy the vault when it's time

These are the tools that separate a toy project from a real security tool. AWS Security Hub doesn't just store your config — it continuously scans for misconfigurations. Your vault should do the same.

---

## Stage 20 — The Breach Oracle (Hard)

A strong password is worthless if it appeared in a data breach three years ago and is sitting in every attacker's dictionary. This stage lets you check any password against over 600 million known compromised credentials — without ever sending the password (or even its full hash) over the network. The k-anonymity protocol is one of the most elegant privacy-preserving designs in modern security, and implementing it teaches you how to balance utility against exposure.

> *"The Oracle does not see the future. It sees the past — every breach, every leak, every password that was ever exposed. And it can tell you if yours is among them, without ever learning what your password is."*

This is one of the most elegant security protocols you'll ever implement. The Have I Been Pwned (HIBP) Pwned Passwords API lets you check if a password has appeared in a data breach — and it does this without you ever sending the password, or even its full hash, over the network.

The trick is called **k-anonymity**, and it works like this:

1. SHA-1 hash the password locally
2. Send only the first 5 hex characters (the **prefix**) to the HIBP API
3. The API returns ~800 hash suffixes that share that prefix
4. Check locally whether the full hash appears in the response

The API sees a 5-character prefix shared by roughly 800 different passwords. It cannot determine which one you're checking. Even if someone intercepts the request, the prefix reveals nothing useful.

### New Dependencies

Add these to `Cargo.toml`:

```toml
[dependencies]
sha1 = "0.11"       # RustCrypto SHA-1 implementation
ureq = "3.3"         # Blocking HTTP client — minimal deps, no async overhead
```

**Why SHA-1 here?** SHA-1 is cryptographically broken for collision resistance — you should never use it to protect data. But we're not using it for security. HIBP's database is *indexed* by SHA-1 hashes (that's what leaked breach data contains). We hash locally just to query their index. Your password's actual protection comes from Argon2id + AES-256-GCM.

**Why `ureq` over `reqwest`?** We make exactly one HTTP call. `ureq` is a blocking HTTP client with a tiny dependency tree and zero async overhead. `reqwest` pulls in `tokio`, `hyper`, and half the async ecosystem — overkill for a single GET request.

### The AWS Parallel

**VPC Endpoints** keep traffic off the public internet by routing AWS API calls through private network paths. k-anonymity achieves something similar at the protocol level — your actual password never touches the network. The API sees only a prefix that maps to hundreds of possible passwords.

Think of it this way: a VPC endpoint means "my API call never leaves Amazon's network." k-anonymity means "my password never leaves my machine."

### Rust Concepts

This stage introduces:

- **`sha1::Sha1` and the `Digest` trait** — the RustCrypto hashing API pattern (new → update → finalize)
- **`ureq::get().call()`** — blocking HTTP with proper error handling
- **String slicing** — working with hex string prefixes and suffixes
- **Response parsing** — splitting multi-line text responses into structured data
- **Network error handling** — graceful degradation when the API is unreachable

### Implementation

Create `src/breach.rs`:

```rust
use sha1::{Sha1, Digest};
use std::collections::HashMap;
use std::fmt;

/// Errors specific to breach checking.
#[derive(Debug)]
pub enum BreachError {
    /// Network or HTTP error when contacting HIBP.
    Network(String),
    /// Failed to parse the HIBP API response.
    ParseError(String),
}

impl fmt::Display for BreachError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            BreachError::Network(msg) => write!(f, "Network error: {}", msg),
            BreachError::ParseError(msg) => write!(f, "Parse error: {}", msg),
        }
    }
}

/// Result of checking a single password against HIBP.
#[derive(Debug)]
pub struct BreachResult {
    pub name: String,
    pub compromised: bool,
    pub times_seen: u64,
}

/// SHA-1 hash a password and return the uppercase hex string.
///
/// Uses the RustCrypto `Digest` trait pattern:
///   1. `Sha1::new()` — create the hasher
///   2. `hasher.update(data)` — feed it bytes
///   3. `hasher.finalize()` — consume the hasher, get the hash
///
/// The result is a 40-character hex string like "5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8".
fn sha1_hex(password: &str) -> String {
    let mut hasher = Sha1::new();
    hasher.update(password.as_bytes());
    let result = hasher.finalize();

    // Convert each byte to two uppercase hex characters.
    // `format!("{:02X}", byte)` pads single-digit hex values with a leading zero.
    result
        .iter()
        .map(|byte| format!("{:02X}", byte))
        .collect::<String>()
}

/// Query the HIBP Pwned Passwords API using k-anonymity.
///
/// Sends only the first 5 characters of the SHA-1 hash to the API.
/// Returns a HashMap of suffix → count for all matching hashes.
fn query_hibp(prefix: &str) -> Result<HashMap<String, u64>, BreachError> {
    let url = format!("https://api.pwnedpasswords.com/range/{}", prefix);

    // ureq 3.x API: get() returns a RequestBuilder, call() executes it.
    // body_mut().read_to_string() reads the response body as a String.
    let body: String = ureq::get(&url)
        .call()
        .map_err(|e| BreachError::Network(e.to_string()))?
        .body_mut()
        .read_to_string()
        .map_err(|e| BreachError::Network(e.to_string()))?;

    // The API returns lines like:
    //   0018A45C4D1DEF81644B54AB7F969B88D65:1
    //   00D4F6E8FA6EECAD2A3AA415EEC418D38EC:2
    //
    // Each line is: HASH_SUFFIX:COUNT
    // The suffix is the remaining 35 characters of the SHA-1 hash.
    let mut results = HashMap::new();

    for line in body.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        // Split on ':' — suffix is left, count is right.
        let parts: Vec<&str> = line.splitn(2, ':').collect();
        if parts.len() != 2 {
            return Err(BreachError::ParseError(
                format!("Unexpected line format: {}", line),
            ));
        }

        let suffix = parts[0].to_uppercase();
        let count: u64 = parts[1]
            .trim()
            .parse()
            .map_err(|_| BreachError::ParseError(
                format!("Invalid count in line: {}", line),
            ))?;

        results.insert(suffix, count);
    }

    Ok(results)
}

/// Check a single password against the HIBP database.
///
/// Returns the number of times the password has been seen in breaches,
/// or 0 if it hasn't been found.
pub fn check_password(password: &str) -> Result<u64, BreachError> {
    let hash = sha1_hex(password);

    // Split the hash: first 5 chars are the prefix (sent to API),
    // remaining 35 chars are the suffix (checked locally).
    let prefix = &hash[..5];
    let suffix = &hash[5..];

    let results = query_hibp(prefix)?;

    // Look up our suffix in the response.
    // If it's there, the password has been breached.
    Ok(*results.get(suffix).unwrap_or(&0))
}

/// Check a single relic's password and return a BreachResult.
pub fn check_relic(name: &str, password: &str) -> Result<BreachResult, BreachError> {
    let times_seen = check_password(password)?;
    Ok(BreachResult {
        name: name.to_string(),
        compromised: times_seen > 0,
        times_seen,
    })
}

/// Check all relics and return results for each.
/// Continues checking even if one relic fails (collects errors separately).
pub fn check_all(
    relics: &[(String, String)], // Vec of (name, password) pairs
) -> (Vec<BreachResult>, Vec<(String, BreachError)>) {
    let mut results = Vec::new();
    let mut errors = Vec::new();

    for (name, password) in relics {
        match check_relic(name, password) {
            Ok(result) => results.push(result),
            Err(e) => errors.push((name.clone(), e)),
        }
    }

    (results, errors)
}
```

### The CLI Commands

Add these subcommands to your clap CLI:

```rust
/// Check a relic's password against known breaches.
#[derive(Subcommand)]
enum Commands {
    // ... existing commands ...

    /// Check if a password has appeared in known data breaches.
    BreachCheck {
        /// Name or ID of the relic to check.
        #[arg(value_name = "NAME")]
        name: Option<String>,

        /// Check all relics in the vault.
        #[arg(long)]
        all: bool,
    },
}
```

The handler logic — you write this part:

```rust
Commands::BreachCheck { name, all } => {
    // 1. Unlock the vault (you already have this pattern)
    // 2. If --all: iterate all relics, call check_all()
    //    If name provided: find the relic, call check_relic()
    // 3. Print results:
    //    - "GitHub: COMPROMISED — seen 47,832 times!" (red)
    //    - "AWS Console: Safe — not found in any breaches." (green)
    // 4. If --all: print summary ("3 of 12 relics have compromised passwords")
}
```

### Understanding the Protocol

Let's trace through a complete breach check to make sure the security properties are clear:

```
Password: "hunter2"
    ↓
SHA-1 hash: "F3BBBD66A63D4BF1747940578EC3D0103530E21D"
    ↓
Split: prefix = "F3BBB", suffix = "D66A63D4BF1747940578EC3D0103530E21D"
    ↓
HTTP GET https://api.pwnedpasswords.com/range/F3BBB
    ↓
API returns ~800 lines:
    ...
    D66A63D4BF1747940578EC3D0103530E21D:17043    ← our suffix!
    D6812B18B1B0B4D34F3D23B6E60F2B3A1C2:3
    ...
    ↓
Local match found → "hunter2" has been seen 17,043 times in breaches.
```

What the API server sees: someone queried prefix `F3BBB`. That prefix matches ~800 different passwords. The server has no way to know which one was being checked.

What a network eavesdropper sees: an HTTPS request to `api.pwnedpasswords.com/range/F3BBB`. Even without TLS, the prefix alone is useless — it maps to hundreds of passwords.

> [!check] Checkpoint
> Run these tests:
>
> ```rust
> #[cfg(test)]
> mod tests {
>     use super::*;
>
>     #[test]
>     fn test_sha1_hex() {
>         // Known SHA-1 hash of "password"
>         assert_eq!(
>             sha1_hex("password"),
>             "5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8"
>         );
>     }
>
>     #[test]
>     fn test_sha1_hex_splits_correctly() {
>         let hash = sha1_hex("password");
>         let prefix = &hash[..5];
>         let suffix = &hash[5..];
>
>         assert_eq!(prefix, "5BAA6");
>         assert_eq!(suffix.len(), 35);
>     }
>
>     // Integration test — requires network access.
>     // Run manually: cargo test -- --ignored
>     #[test]
>     #[ignore]
>     fn test_known_breached_password() {
>         let result = check_password("password").unwrap();
>         assert!(result > 0, "The password 'password' should be in HIBP");
>     }
> }
> ```
>
> Breach checking tells you if a password has *already* been exposed. But what about passwords that are weak, reused, or aging — problems that haven't caused a breach *yet*? Stage 21 builds the Audit, a comprehensive security scanner for your entire vault.

### What to Try
2. Check a long random password from your generator — it should come back clean
3. Disconnect from the internet and run a breach check — does your error handling work?
4. Try `iv breach-check --all` with a vault containing both weak and strong passwords

> [!warning] Common Mistake: Forgetting to uppercase the hash
> HIBP returns uppercase hex suffixes. If your SHA-1 output is lowercase, the suffix comparison will never match. The `format!("{:02X}", byte)` format specifier produces uppercase — `{:02x}` would produce lowercase.

> [!warning] Common Mistake: Not handling network errors gracefully
> The user might be offline, behind a firewall, or HIBP might be down. Your CLI should print a helpful message ("Could not reach the breach database. Check your internet connection.") rather than panicking.

> [!warning] Common Mistake: Sending the full hash
> If you accidentally send all 40 characters instead of just the first 5, you've defeated the entire purpose of k-anonymity. The API would still work (it only reads the first 5), but your request URL would contain the full hash — visible in logs, proxy servers, and browser history.

---

## Stage 21 — The Audit (Hard)

Breach checking is reactive — it tells you about past exposure. An audit is proactive — it identifies weaknesses *before* they're exploited. Short passwords, reused credentials, missing 2FA, and aging secrets are all ticking time bombs. This stage builds a comprehensive scanner that evaluates every relic against multiple security criteria and produces a severity-rated report, just like AWS Security Hub aggregates findings across your cloud infrastructure.

> *"The Watchtower keeper unrolls a scroll and begins reading. 'Relic: GitHub. Password length: 8. Mixed case: no. Reused: yes — same as your Bitbucket relic. Age: 347 days. TOTP: missing.' The keeper looks up. 'This relic is a liability.'"*

A breach check tells you if a password has *already* been exposed. An audit tells you if a password is *likely to be* exposed. It's the difference between a smoke detector and a fire inspection — you want both.

`iv audit` scans every relic in your vault and reports:

- **Weak passwords** — shorter than 12 characters, missing character classes (no uppercase, no digits, no symbols)
- **Reused passwords** — the same password used across multiple relics
- **Old passwords** — not rotated in over 90 days
- **Missing TOTP** — no 2FA configured for the relic

### The AWS Parallel

**AWS Security Hub** aggregates findings from GuardDuty, Inspector, Macie, and Config into a single dashboard with severity ratings. Each finding has a type, a severity, and a remediation recommendation.

`iv audit` is your local Security Hub. Each finding has a severity (Critical, High, Medium, Low), a description, and an implicit remediation: change the password, add TOTP, stop reusing credentials.

**Defense in depth** — no single security measure is sufficient. A strong password doesn't help if it's reused. A unique password doesn't help if it's 4 characters. TOTP doesn't help if the password was in a breach. The audit checks *all* of these because security is a system, not a single control.

### New Dependency

```toml
[dependencies]
colored = "3.1"    # Terminal colors — trait-based API on strings
```

The `colored` crate adds methods to any string via the `Colorize` trait:

```rust
use colored::Colorize;

println!("{}", "CRITICAL".red().bold());
println!("{}", "Safe".green());
println!("{}", "Warning".yellow());
```

### Implementation Sketch

Create `src/audit.rs`. By now you know the patterns — here's the structure with key logic for you to complete:

```rust
use std::collections::HashMap;
use chrono::{Utc, Duration};
use colored::Colorize;

/// Severity levels for audit findings.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Severity {
    Critical,
    High,
    Medium,
    Low,
}

impl Severity {
    /// Return a colored string representation.
    pub fn colored_label(&self) -> String {
        match self {
            Severity::Critical => "CRITICAL".red().bold().to_string(),
            Severity::High => "HIGH".red().to_string(),
            Severity::Medium => "MEDIUM".yellow().to_string(),
            Severity::Low => "LOW".bright_blue().to_string(),
        }
    }
}

/// A single audit finding.
#[derive(Debug)]
pub struct Finding {
    pub relic_name: String,
    pub severity: Severity,
    pub category: String,
    pub description: String,
}

/// Run a full audit on all relics. Returns a list of findings sorted by severity.
pub fn audit_vault(relics: &[Relic]) -> Vec<Finding> {
    let mut findings = Vec::new();

    // 1. Check password strength for each relic
    for relic in relics {
        findings.extend(check_password_strength(relic));
    }

    // 2. Check for reused passwords across relics
    findings.extend(check_reuse(relics));

    // 3. Check password age
    for relic in relics {
        findings.extend(check_age(relic));
    }

    // 4. Check for missing TOTP
    for relic in relics {
        if relic.totp_secret.is_none() {
            findings.push(Finding {
                relic_name: relic.name.clone(),
                severity: Severity::Medium,
                category: "Missing 2FA".to_string(),
                description: "No TOTP secret configured.".to_string(),
            });
        }
    }

    // Sort by severity (Critical first)
    findings.sort_by(|a, b| a.severity.cmp(&b.severity));
    findings
}
```

### Your Turn: The Check Functions

Implement these three functions. Here are the rules:

**`check_password_strength(relic) -> Vec<Finding>`**
- Length < 8: Critical ("Password is dangerously short")
- Length 8–11: High ("Password is below recommended minimum of 12 characters")
- No uppercase letters: Medium
- No lowercase letters: Medium
- No digits: Medium
- No symbols (`!@#$%^&*` etc.): Low

**`check_reuse(relics) -> Vec<Finding>`**
- Group relics by password using a `HashMap<&str, Vec<&str>>` (password → list of relic names)
- Any group with 2+ relics: Critical finding for each relic in the group
- Hint: `HashMap::entry().or_insert_with(Vec::new).push(name)`

**`check_age(relic) -> Vec<Finding>`**
- `Utc::now() - relic.updated_at > Duration::days(90)`: High ("Password not rotated in over 90 days")
- `> Duration::days(180)`: Critical ("Password not rotated in over 180 days")

### The Report Printer

```rust
/// Print a formatted audit report to the terminal.
pub fn print_report(findings: &[Finding]) {
    if findings.is_empty() {
        println!("{}", "All clear! No issues found.".green().bold());
        return;
    }

    println!("{}", "=== Vault Audit Report ===".bold());
    println!();

    // Group findings by relic name for readability.
    let mut by_relic: HashMap<&str, Vec<&Finding>> = HashMap::new();
    for finding in findings {
        by_relic
            .entry(&finding.relic_name)
            .or_insert_with(Vec::new)
            .push(finding);
    }

    for (relic_name, relic_findings) in &by_relic {
        println!("  {} {}", "Relic:".bold(), relic_name);
        for f in relic_findings {
            println!(
                "    [{}] {} — {}",
                f.severity.colored_label(),
                f.category,
                f.description
            );
        }
        println!();
    }

    // Summary counts
    let critical = findings.iter().filter(|f| f.severity == Severity::Critical).count();
    let high = findings.iter().filter(|f| f.severity == Severity::High).count();
    let medium = findings.iter().filter(|f| f.severity == Severity::Medium).count();
    let low = findings.iter().filter(|f| f.severity == Severity::Low).count();

    println!("{}", "--- Summary ---".bold());
    println!(
        "  {} critical, {} high, {} medium, {} low",
        critical.to_string().red().bold(),
        high.to_string().red(),
        medium.to_string().yellow(),
        low.to_string().bright_blue(),
    );
}
```

> [!check] Checkpoint
> After implementing the check functions, test with a vault containing:
> - A relic with password `"abc"` (should trigger Critical: short, plus missing character classes)
> - Two relics with the same password (should trigger Critical: reuse)
> - A relic with `updated_at` set to 6 months ago (should trigger Critical: age)
> - A relic with a strong, unique, recent password and TOTP (should produce zero findings)
>
> The audit reveals weaknesses, but the most critical remediation — changing the master password itself — requires re-encrypting the entire vault atomically. Stage 22 builds the Key Reforging ceremony.

### What to Try

1. Create a vault with deliberately bad passwords and run `iv audit` — does the report make sense?
2. Fix all the findings and run the audit again — you should see the "All clear!" message
3. Pipe the output to a file (`iv audit > report.txt`) — notice the color codes appear as escape sequences. We'll fix this with `--no-color` in Act 5

> [!warning] Common Mistake: Comparing passwords directly for reuse detection
> This works but consider: if you later add `secrecy::SecretString` (Stage 27), you won't be able to use passwords as HashMap keys directly. For now, direct comparison is fine — just know it'll need refactoring.

> [!warning] Common Mistake: Forgetting `PartialOrd` and `Ord` on `Severity`
> The `sort_by` call needs these traits. Derive order matters — Rust derives `Ord` based on variant declaration order, so declare `Critical` first if you want it to sort first.

> [!warning] Common Mistake: Using `text-xs` severity labels
> Just kidding — this isn't a frontend. But the principle applies: make the output scannable. A wall of text is worse than no audit at all.

---

## Stage 22 — The Key Reforging (Medium)

Master passwords should be rotated — especially if you suspect exposure, or if your original password was weaker than you'd like. But changing the master password means re-deriving the encryption key and re-encrypting the entire vault. If this process fails halfway through, you could lose access to everything. This stage builds a transactional password change that either completes fully or leaves the vault untouched — the same atomicity guarantee that protects database commits and S3 multipart uploads.

> *"The blacksmith sets the old key on the anvil. 'This key has served you well,' she says, 'but every key wears down with time. The tumblers learn its shape. We forge a new one — and the old one ceases to exist.'"*

Changing your master password is the most dangerous operation in a password manager. You're re-encrypting the entire vault with a new key. If the process fails halfway through — power outage, crash, disk full — you could lose everything.

This is a **transaction**: it must either complete fully or not happen at all. Sound familiar? It's the same principle behind DynamoDB transactions, S3 multipart uploads, and every database COMMIT/ROLLBACK you've ever used.

### The AWS Parallel

**KMS automatic key rotation** creates a new backing key every year while keeping the old key available for decryption of previously encrypted data. The key ID stays the same — only the cryptographic material changes.

**Secrets Manager rotation Lambdas** follow a multi-step protocol: createSecret → setSecret → testSecret → finishSecret. If any step fails, the rotation rolls back. Your `iv change-password` follows the same pattern.

### The Protocol

```
1. Verify current master password (decrypt vault with existing key)
2. Prompt for new master password (twice, must match)
3. Validate new password strength (warn if weak, but allow)
4. Generate new salt (16 bytes from OsRng)
5. Derive new key from new password + new salt via Argon2id
6. Serialize the decrypted vault to JSON
7. Encrypt JSON with new key + fresh nonce
8. Write to vault.iron.tmp (with new salt in header)
9. fsync vault.iron.tmp
10. Rename vault.iron.tmp → vault.iron (atomic on POSIX)
11. Update session with new cached key
```

If the process fails at any step before the rename (step 10), the original vault file is untouched. The user can retry with their old password. This is the same atomic-write pattern you built in your vault save logic — now it's protecting the most critical operation.

### Your Turn

This stage is about orchestrating existing pieces. You already have:
- `crypto::derive_key(password, salt)` — Argon2id key derivation
- `crypto::encrypt(key, plaintext)` — AES-256-GCM encryption
- `vault::save_atomic(path, encrypted_data, header)` — atomic write
- `session::update_cached_key(key)` — session key cache

Wire them together in a new function. Here's the skeleton:

```rust
/// Change the vault's master password.
///
/// This is a multi-step transaction:
/// 1. Verify the current password can decrypt the vault
/// 2. Collect and validate the new password
/// 3. Re-derive the encryption key with a new salt
/// 4. Re-encrypt and atomically replace the vault file
pub fn change_password(vault_path: &Path, config: &Config) -> Result<(), IronvaultError> {
    // Step 1: Verify current password
    let current_password = prompt_password("Enter current master password: ")?;
    let (header, vault) = load_and_decrypt(vault_path, &current_password)?;
    // If we get here, the current password is correct.

    // Step 2: Collect new password
    let new_password = prompt_password("Enter new master password: ")?;
    let confirm = prompt_password("Confirm new master password: ")?;
    if new_password != confirm {
        return Err(IronvaultError::PasswordMismatch);
    }

    // Step 3: Warn if weak (but don't block)
    if new_password.len() < 12 {
        eprintln!("Warning: password is shorter than 12 characters.");
    }

    // Step 4: New salt, new key
    // YOUR CODE: generate 16 random bytes for the salt
    // YOUR CODE: derive new key using Argon2id with config params

    // Step 5: Re-encrypt
    // YOUR CODE: serialize vault to JSON
    // YOUR CODE: encrypt with new key and fresh nonce

    // Step 6: Atomic write with new header
    // YOUR CODE: build new VaultHeader with new salt, nonce, same Argon2 params
    // YOUR CODE: write to .tmp, fsync, rename

    // Step 7: Update session
    // YOUR CODE: cache the new key, update last_activity

    println!("Master password changed successfully.");
    println!("The vault has been re-encrypted with a new key.");
    Ok(())
}
```

### Key Insight: Why a New Salt?

You might wonder: why generate a new salt? Can't we just re-derive with the new password and the old salt?

You *could*, but a new salt is strictly better:

- **Different salt = different key = different ciphertext.** Even if the new password is similar to the old one, the derived key will be completely different.
- **Limits exposure.** If an attacker captured the old salt + ciphertext and was brute-forcing offline, a new salt invalidates all their work.
- **Matches KMS behavior.** When KMS rotates a key, it generates entirely new cryptographic material — it doesn't derive from the old key.

> [!check] Checkpoint
> Test these scenarios:
> 1. Change password successfully — verify you can unlock with the new password
> 2. Enter wrong current password — should fail at step 1
> 3. Enter mismatched new passwords — should fail at step 2
> 4. Kill the process during step 5 (before the rename) — verify the old vault still works
> 5. Change password, then check that `iv get` still returns correct relic data
>
> The vault can be re-keyed safely. But the session management from Act 2 still lacks one critical feature — automatic expiry after inactivity. Stage 23 adds the lock timeout that seals the vault when you walk away.
>
> > [!warning] Common Mistake: Forgetting to update the session cache
> > If you change the password but don't update the cached key in tmpfs, the next command will try to decrypt with the old key and fail. The user will think the password change corrupted their vault.
>
> > [!warning] Common Mistake: Not generating a fresh nonce
> > The new key is different, so technically reusing the old nonce is safe (nonce reuse is only catastrophic with the *same* key). But generating a fresh nonce is cheap and eliminates any doubt.
>
> > [!warning] Common Mistake: Zeroizing the old key
> > After the password change succeeds, the old derived key should be zeroized. You'll formalize this in Stage 27 with the `secrecy` crate, but for now, be aware that the old key is sitting in memory until the variable goes out of scope.

---

## Stage 23 — The Lock Timeout (Medium)

> [!note] Building on Stage 13
> In Stage 13, we built basic session timeout — the vault locks after N minutes of inactivity, and we added the config file where users set `lock_timeout_minutes`. But that implementation only *checked* the timeout; it didn't *enforce* it automatically. Now we harden it: automatic key zeroization when the session expires, `touch_session` calls after every vault operation to keep the timer fresh, and `is_session_valid` checks at the start of every command so stale sessions are caught before they're used.

An unlocked vault on an unattended terminal is an open invitation. Every minute the session stays active without user interaction is another minute an attacker — or a curious coworker — has full access to every credential. This stage adds an inactivity timer that automatically zeroizes the cached key and re-seals the vault, limiting the blast radius of a forgotten terminal session.

> *"The vault door has a peculiar enchantment. Leave it unattended too long, and it seals itself. The magic doesn't care if you stepped away for coffee or fell asleep at your desk. Fifteen minutes of silence, and the wards re-engage."*

Your vault currently stays unlocked until you explicitly run `iv lock` or the process exits. That's a problem. If you unlock the vault, get distracted, and walk away from your terminal, anyone who sits down can run `iv get --show-password` on every relic.

Session expiry is one of the oldest security patterns in computing. AWS STS credentials expire after 1 hour by default. SSH sessions time out. Screen locks activate. The principle is the same: **limit the window of exposure from an unattended session.**

### The AWS Parallel

When you call `sts:AssumeRole`, you get temporary credentials that expire. The maximum session duration is 12 hours, the default is 1 hour. After expiry, every API call fails with `ExpiredTokenException` until you re-authenticate.

Your vault's lock timeout works the same way. The "credential" is the cached derived key in tmpfs. The "expiry" is `last_activity + lock_timeout_minutes`. After expiry, the cached key is zeroized and the user must re-enter their master password.

### The Mechanism

You already have a session lock file (`~/.ironvault/session.lock`) from earlier stages. Extend it:

```json
{
  "pid": 12345,
  "unlocked_at": "2026-04-18T17:00:00Z",
  "last_activity": "2026-04-18T17:05:00Z"
}
```

The check happens at the start of every command that needs vault access:

```rust
use chrono::{Utc, Duration};

/// Check if the current session is still valid.
///
/// A session is expired if:
/// 1. The lock file doesn't exist
/// 2. The PID in the lock file is dead (stale session)
/// 3. last_activity + timeout < now
pub fn is_session_valid(
    lock_path: &Path,
    timeout_minutes: i64,
) -> Result<bool, IronvaultError> {
    // YOUR CODE: read and parse the lock file
    // YOUR CODE: check if the PID is still alive (see hint below)
    // YOUR CODE: parse last_activity, compare with Utc::now()

    let elapsed = Utc::now() - session.last_activity;
    if elapsed > Duration::minutes(timeout_minutes) {
        // Session expired — clean up
        expire_session(lock_path)?;
        return Ok(false);
    }

    Ok(true)
}

/// Update the last_activity timestamp in the lock file.
/// Call this after every successful vault operation.
pub fn touch_session(lock_path: &Path) -> Result<(), IronvaultError> {
    // YOUR CODE: read lock file, update last_activity to Utc::now(), write back
    todo!()
}

/// Expire a session: zeroize the cached key file, remove the lock file.
fn expire_session(lock_path: &Path) -> Result<(), IronvaultError> {
    // YOUR CODE: find and zeroize the tmpfs key cache file
    // YOUR CODE: remove the lock file
    todo!()
}
```

**Hint: Checking if a PID is alive.** On Unix, you can send signal 0 to a process — it doesn't actually send a signal, but it checks if the process exists:

```rust
use std::process::Command;

fn is_pid_alive(pid: u32) -> bool {
    // kill -0 checks existence without sending a signal.
    // Returns success (exit code 0) if the process exists.
    Command::new("kill")
        .args(["-0", &pid.to_string()])
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}
```

A more portable approach uses `libc::kill(pid, 0)`, but the `Command` approach avoids `unsafe` and works fine for a CLI tool.

### The `iv lock` Command

Immediate lock is simple — it's just `expire_session()` with a message:

```rust
Commands::Lock => {
    expire_session(&config.lock_path())?;
    println!("Vault locked. The wards are sealed.");
}
```

### Integration with Existing Commands

Every command that accesses the vault should start with:

```rust
fn ensure_unlocked(config: &Config) -> Result<DerivedKey, IronvaultError> {
    let lock_path = config.lock_path();
    let timeout = config.lock_timeout_minutes;

    if is_session_valid(&lock_path, timeout)? {
        // Session is valid — read the cached key and touch the timestamp
        let key = read_cached_key(&config.key_cache_path())?;
        touch_session(&lock_path)?;
        Ok(key)
    } else {
        // Session expired or doesn't exist — prompt for password
        let password = prompt_password("Master password: ")?;
        let (header, _vault) = load_and_decrypt(&config.vault_path(), &password)?;
        let key = derive_key(&password, &header.salt, &config.argon2_params())?;
        create_session(&lock_path, &config.key_cache_path(), &key)?;
        Ok(key)
    }
}
```

> [!check] Checkpoint
> 1. Set `lock_timeout_minutes = 1` in your config for testing
> 2. Unlock the vault, run `iv list` — should work
> 3. Wait 70 seconds, run `iv list` — should prompt for password
> 4. Run `iv lock` — should lock immediately
> 5. Run `iv list` — should prompt for password
>
> The vault auto-locks after inactivity. But there's one final operation the Watchtower needs — the ability to completely and securely destroy the vault when it's no longer needed. Stage 24 builds the Sentinel.

### What to Try — every command should prompt for the password (maximum security, minimum convenience)
- Set the timeout to 1440 minutes (24 hours) — basically never locks (minimum security, maximum convenience)
- Think about the tradeoff: what timeout would you use for your real password manager?

> [!warning] Common Mistake: Using file modification time instead of an explicit timestamp
> You might think "just check when the lock file was last modified." But file modification times can be unreliable — some filesystems have coarse granularity, and tools like `touch` or backup software can change mtime. An explicit `last_activity` field in the JSON is unambiguous.

> [!warning] Common Mistake: Race conditions between check and use
> If the session expires between `is_session_valid()` and the actual vault operation, the cached key file might be gone. Handle this gracefully — if the key cache read fails, fall back to prompting for the password.

---

## Stage 24 — The Sentinel (Easy)

When you decommission a machine, migrate to a different tool, or simply want a fresh start, the vault must be destroyed completely. But `rm` doesn't actually erase data — it just removes the filename. The bytes remain on disk, recoverable by forensic tools. This stage builds a secure destruction ceremony that overwrites the vault with random data before deletion, and requires an exact confirmation phrase to prevent accidental annihilation.

> *"The Sentinel stands at the gate, torch in hand. 'You wish to destroy the vault?' it asks. 'Speak the words, and I will burn it to ash. Every relic, every chamber, every memory. There is no return from this.' You take a breath. The Sentinel waits."*

Sometimes you need to destroy a vault completely. Maybe you're decommissioning a machine. Maybe you're migrating to a different password manager. Maybe you just want to start fresh. Whatever the reason, `iv destroy` must do it right.

Here's what most people don't know: **`rm` doesn't delete data.** It removes the directory entry — the *name* that points to the data on disk. The actual bytes remain on the storage medium until they're overwritten by new data. A forensic tool can recover "deleted" files trivially.

Secure deletion means: overwrite the file contents with random data *before* removing the directory entry. The original bytes are gone — replaced by noise.

### The Protocol

`iv destroy` follows a strict ceremony:

1. Print a solemn warning explaining what's about to happen
2. Require the user to type `DESTROY MY VAULT` exactly — not "yes", not "y", not "destroy"
3. Overwrite the vault file with random bytes (same length as the file)
4. Delete the overwritten vault file
5. Remove the session lock file and key cache
6. Remove the config file (optional — ask the user)
7. Print a farewell message

The exact-string confirmation is a pattern you see in AWS too — `aws cloudformation delete-stack` requires the stack name, and deleting an S3 bucket requires it to be empty first. The friction is intentional.

### Implementation

This one is straightforward — you have all the building blocks:

```rust
use std::fs;
use rand::RngCore;

/// Securely destroy the vault and all associated files.
pub fn destroy_vault(vault_dir: &Path) -> Result<(), IronvaultError> {
    // Step 1: The warning
    println!("WARNING: This will permanently destroy your vault.");
    println!("All relics, chambers, and configuration will be lost.");
    println!("This action cannot be undone.");
    println!();
    println!("To confirm, type exactly: DESTROY MY VAULT");

    // Step 2: Exact confirmation
    let mut input = String::new();
    std::io::stdin().read_line(&mut input)?;
    let input = input.trim();

    if input != "DESTROY MY VAULT" {
        println!("Destruction cancelled. Your vault is safe.");
        return Ok(());
    }

    // Step 3: Overwrite vault file with random bytes
    let vault_path = vault_dir.join("vault.iron");
    if vault_path.exists() {
        secure_delete(&vault_path)?;
    }

    // Step 4: Clean up session files
    let lock_path = vault_dir.join("session.lock");
    if lock_path.exists() {
        fs::remove_file(&lock_path)?;
    }

    // Step 5: Remove the vault directory
    // (only if it's empty or contains only our files)
    if vault_dir.exists() {
        fs::remove_dir_all(vault_dir)?;
    }

    // Step 6: Farewell
    println!();
    println!("The vault has been destroyed.");
    println!("All relics have been reduced to ash.");
    println!("May your next vault serve you well.");

    Ok(())
}

/// Overwrite a file with random bytes, then delete it.
fn secure_delete(path: &Path) -> Result<(), IronvaultError> {
    // Read the file length so we know how many bytes to overwrite.
    let metadata = fs::metadata(path)?;
    let len = metadata.len() as usize;

    // Generate random bytes to overwrite with.
    let mut random_data = vec![0u8; len];
    rand::rng().fill_bytes(&mut random_data);

    // Overwrite the file contents.
    fs::write(path, &random_data)?;

    // Now remove the directory entry.
    fs::remove_file(path)?;

    Ok(())
}
```

### Why Not Multiple Overwrite Passes?

You might have heard of the "Gutmann method" — 35 passes of different bit patterns. That was designed for 1990s magnetic hard drives where residual magnetism could theoretically be read with specialized equipment.

On modern SSDs, a single overwrite pass is sufficient. SSDs use wear leveling, which means the physical location of data changes unpredictably. Multiple passes just wear out the drive faster without improving security. The real limitation is that SSDs may retain data in spare blocks that the OS can't address — but that's a hardware-level concern beyond what any software can solve.

For Ironvault's threat model, a single random overwrite is appropriate. If you need to defend against nation-state forensics on SSDs, you need full-disk encryption (LUKS, FileVault) — not per-file deletion.

> [!check] Checkpoint
> 1. Create a test vault with a few relics
> 2. Run `iv destroy` and type something wrong — should cancel
> 3. Run `iv destroy` and type `DESTROY MY VAULT` — should succeed
> 4. Verify the vault directory is gone
> 5. Try `iv list` — should tell you no vault exists
>
> The Watchtower is complete — breach detection, auditing, key rotation, auto-lock, and secure destruction. In Act 5, you'll temper the steel with data portability, backups, secure memory handling, and the final polish that turns Ironvault into a tool you'd trust with real credentials.

### What to Try

- After destroying, check if any vault data remains with `hexdump` or `xxd` on the directory (it shouldn't — the directory is gone)
- Think about what happens if the process crashes between the overwrite and the delete — the file still exists but contains random noise, not your passwords. That's the safe failure mode.

> [!warning] Common Mistake: Using `"yes"` or `"y"` as the confirmation
> Too easy to type accidentally. The exact phrase `DESTROY MY VAULT` requires deliberate intent. This is the same reason AWS makes you type the resource name to confirm deletion.

> [!warning] Common Mistake: Forgetting to handle the tmpfs key cache
> If you destroy the vault but leave the derived key in `/dev/shm/ironvault-<uid>`, someone could theoretically use it to decrypt a backup. Clean up everything.

> [!warning] Common Mistake: Not checking if files exist before deleting
> `fs::remove_file` on a nonexistent file returns an error. Always check with `.exists()` first, or use `if let Err(e) = fs::remove_file(path)` and ignore `NotFound` errors.

---

## Act 4 — Checkpoint

You've built The Watchtower. Your vault now has:

- **Breach detection** — passwords checked against 600+ million known breaches without ever leaving your machine
- **Security auditing** — weak, reused, old, and unprotected credentials flagged with severity ratings
- **Key rotation** — master password changes that atomically re-encrypt the entire vault
- **Session management** — automatic lock after inactivity, immediate lock on demand
- **Secure destruction** — vault data overwritten before deletion

These aren't nice-to-haves. They're the difference between a password *store* and a password *manager*. A store holds your secrets. A manager actively protects them.

In Act 5, you'll temper the steel — adding data portability, backups, secure memory handling, proper error types, a threat model document, and the final polish that turns a project into a tool you'd actually trust with your credentials.

The forge awaits.
