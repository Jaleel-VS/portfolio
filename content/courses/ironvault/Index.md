# ⚔️ Ironvault — Build a Secure Password Manager in Rust

A progressive, project-based Rust course. You build ONE project from scratch — a CLI password manager with real cryptography, RPG theming, and AWS security parallels.

**Prerequisites:** Python experience. No Rust knowledge required.
**Project:** `~/juk/ironvault/` (cargo project ready to go)
**Time estimate:** 40-60 hours across 30 stages

---

## Course Map

### [[Act 1 - Unsealing the Crypt]] — File I/O, JSON, CRUD, CLI
*Build the data layer. No encryption yet — that comes in Act 2.*

| # | Stage | Concepts | Est. Time |
|---|-------|----------|-----------|
| 1 | **The Foundation Stone** | cargo, crates, main.rs, println! | 30 min |
| 2 | **The Relic** | structs, derive macros, String vs &str, Option\<T\>, serde | 45 min |
| 3 | **The Chamber** | HashMap, Vec, nested structs, chrono | 45 min |
| 4 | **The Scroll** | std::fs, Result\<T,E\>, ? operator, PathBuf | 1 hr |
| 5 | **The Gatekeeper** | clap derive, enums for subcommands, stdin | 1.5 hr |
| 6 | **The Ledger** | pattern matching, iterators (find, retain), --show-password | 1.5 hr |
| 7 | **The Atomic Quill** | File::sync_all, fs::rename, #[test], atomic writes | 1.5 hr |

### [[Act 2 - Forging the Master Key]] — Cryptography
*The hardest act. Argon2 key derivation, AES-256-GCM encryption, the vault file format, sessions.*

| # | Stage | Concepts | Est. Time |
|---|-------|----------|-----------|
| 8 | **The Salt Mines** | arrays, slices, OsRng, Argon2id key derivation | 2 hr |
| 9 | **The Cipher** | AES-256-GCM, AEAD, nonces, custom error types, From trait | 2.5 hr |
| 10 | **The Vault Door** | binary I/O, Read/Write traits, Cursor, file format design | 2.5 hr |
| 11 | **The Master Key Ceremony** | rpassword, master password flow, verify-by-decrypting | 2 hr |
| 12 | **The Session Seal** | tmpfs, file permissions, PID, session management | 2 hr |
| 13 | **The Timeout** | chrono Duration, TOML config, session expiry | 1.5 hr |

### [[Act 3 - Tools of the Trade]] — Utility Belt
*Password generation, TOTP, clipboard, search — the features that make it usable.*

| # | Stage | Concepts | Est. Time |
|---|-------|----------|-----------|
| 14 | **The Forge** | rand traits, CSPRNG, ChaCha8Rng, builder pattern | 1.5 hr |
| 15 | **The Courier** | thread::spawn, Arc, move closures, clipboard auto-clear | 1.5 hr |
| 16 | **The Time Rune** | totp-rs, RFC 6238, base32, otpauth:// URIs | 1.5 hr |
| 17 | **The Seeker** | iterators (filter, any, map), closures, formatted output | 1 hr |
| 18 | **The Scribe** | &mut references, conditional mutation, interactive editing | 1 hr |
| 19 | **The Chamber Architect** | HashMap Entry API, Vec mutation, confirmation prompts | 1 hr |

### [[Act 4 - Eyes on the Horizon]] — Security Auditing
*Breach checking, password auditing, and hardening.*

| # | Stage | Concepts | Est. Time |
|---|-------|----------|-----------|
| 20 | **The Breach Oracle** | ureq HTTP, SHA-1, k-anonymity, HIBP API | 2 hr |
| 21 | **The Audit** | HashMap grouping, colored crate, severity reporting | 2 hr |
| 22 | **The Key Reforging** | multi-step transactions, key rotation, error recovery | 1.5 hr |
| 23 | **The Lock Timeout** | chrono::Duration, session expiry, PID checking | 1 hr |
| 24 | **The Sentinel** | secure deletion, overwrite-before-delete, zeroize | 45 min |

### [[Act 5 - Tempering the Steel]] — Polish and Hardening
*Import/export, secure memory, error handling, threat model, final polish.*

| # | Stage | Concepts | Est. Time |
|---|-------|----------|-----------|
| 25 | **The Trade Routes** | CSV/JSON export/import, duplicate detection | 1.5 hr |
| 26 | **The Vault Backup** | file copy, timestamp formatting, rotation | 1 hr |
| 27 | **The Warding Runes** | zeroize, secrecy, SecretString, Drop trait, ZeroizeOnDrop | 2.5 hr |
| 28 | **The Armorer's Finish** | custom error enum, Display, From, thiserror, the unwrap purge | 2 hr |
| 29 | **The Cartographer's Map** | threat modeling, trust boundaries, documentation | 1.5 hr |
| 30 | **The Grand Seal** | clap_complete, colored output, --no-color, README | 1.5 hr |

### [[Reference Guide]]
*Desk reference for cryptography, AES-GCM internals, Argon2 tuning, threat modeling, and AWS parallels.*

---

## Security Concepts Checklist

Track your progress — each concept is taught hands-on in the listed stage:

- [ ] **Atomic file operations** — Stage 7 (write-tmp-fsync-rename prevents corruption)
- [ ] **Key derivation (Argon2id)** — Stage 8 (why fast hashes are catastrophic for passwords)
- [ ] **Authenticated encryption (AES-256-GCM)** — Stage 9 (confidentiality + integrity in one operation)
- [ ] **Nonce management** — Stage 9 (why reuse is catastrophic, birthday bound)
- [ ] **Binary file format design** — Stage 10 (plaintext header, version byte, magic bytes)
- [ ] **Master password verification** — Stage 11 (verify by decrypting, never store the password)
- [ ] **Session management** — Stage 12 (tmpfs key cache, PID liveness, 0600 permissions)
- [ ] **Session timeout** — Stage 13 (time-bound access, limits unattended exposure)
- [ ] **CSPRNG** — Stage 14 (OsRng → ChaCha, entropy sources, PRNG vs CSPRNG)
- [ ] **Clipboard security** — Stage 15 (global attack surface, auto-clear, exposure window)
- [ ] **TOTP / MFA** — Stage 16 (RFC 6238, shared secret + time → one-time code)
- [ ] **k-Anonymity** — Stage 20 (privacy-preserving breach checks, prefix queries)
- [ ] **Defense in depth** — Stage 21 (layered security: strong + unique + 2FA + monitoring)
- [ ] **Key rotation** — Stage 22 (new salt → new key → new ciphertext, limits exposure)
- [ ] **Secure deletion** — Stage 24 (overwrite before delete, rm only removes directory entry)
- [ ] **Secure memory (zeroize)** — Stage 27 (drop doesn't clear memory, core dumps, swap)
- [ ] **Error handling as security** — Stage 28 (unwrap panics leak info, proper error messages)
- [ ] **Threat modeling** — Stage 29 (assets, actors, vectors, boundaries, mitigations, residual risk)

## RPG Glossary

| RPG Term | Real Concept |
|----------|-------------|
| Relic | Password entry / credential |
| Chamber | Category / folder |
| The Vault | Encrypted file on disk |
| The Master Key | Master password |
| Forging | Generating passwords |
| The Watchtower | Security audit tools |
| The Arsenal | Utility tools (clipboard, TOTP, search) |
| The Forge | Password generator |
| The Breach Oracle | HIBP breach checker |

## Getting Started

```bash
cd ~/juk/ironvault
cargo run
# ⚔️ Ironvault v0.1.0 — Your relics are safe.
```

Open [[Act 1 - Unsealing the Crypt]] and begin with Stage 1: The Foundation Stone.
