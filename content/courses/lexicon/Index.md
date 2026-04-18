# Rust Lexicon Course — Index

Build a CLI spell checker from scratch in Rust. Hand-built data structures, multi-language support, and language learning flavor throughout.

**Project:** `~/juk/lexicon/`
**Design Spec:** [[Lexicon Design Spec]]

## Course Files

| Act | File | Stages | Focus |
|-----|------|--------|-------|
| 1 | [[Act 1 - The Dictionary]] | 1–7 | Trie: insert, search, prefix matching, serialization |
| 2 | [[Act 2 - The Gatekeeper]] | 8–13 | Bloom filter: bit arrays, hash functions, optimal sizing |
| 3 | [[Act 3 - The Suggester]] | 14–20 | Levenshtein distance, BK-tree, fuzzy matching |
| 4 | [[Act 4 - The Pipeline]] | 21–27 | Tokenizer, check pipeline, CLI, interactive mode |
| 5 | [[Act 5 - The Rosetta Stone]] | 28–32 | Multi-language, detection, trigrams, benchmarks |
| — | [[Reference Guide]] | — | Data structures, Big-O, bloom math, Unicode, Rust cheat sheet |

## Full Stage List

### Act 1 — The Dictionary (Stages 1–7)

| # | Stage | Difficulty | Est. Time |
|---|-------|-----------|-----------|
| 1 | Hello Lexicon — project setup, Cargo.toml | Very Easy | 15 min |
| 2 | The Node — TrieNode struct, HashMap vs array | Easy | 30 min |
| 3 | Insert — character-by-character insertion | Easy | 30 min |
| 4 | Search — contains() with trie traversal | Easy | 30 min |
| 5 | Prefix Matching — find all words with a prefix | Medium | 45 min |
| 6 | Serialize — serde + bincode, cache to disk | Medium | 45 min |
| 7 | Trie Visualization — ASCII tree debugging | Easy | 30 min |

### Act 2 — The Gatekeeper (Stages 8–13)

| # | Stage | Difficulty | Est. Time |
|---|-------|-----------|-----------|
| 8 | Bit Array — Vec\<u64\>-backed bit vector | Easy | 30 min |
| 9 | FNV-1a — hand-rolled hash function | Easy | 30 min |
| 10 | Murmur3 — second hash with avalanche effect | Medium | 45 min |
| 11 | The Bloom Filter — double hashing, insert, query | Medium | 45 min |
| 12 | Optimal Sizing — the math behind bloom filters | Medium | 45 min |
| 13 | False Positive Testing — empirical validation | Medium | 45 min |

### Act 3 — The Suggester (Stages 14–20)

| # | Stage | Difficulty | Est. Time |
|---|-------|-----------|-----------|
| 14 | The DP Matrix — full Levenshtein matrix | Medium | 45 min |
| 15 | Space Optimization — two-row O(min(m,n)) | Medium | 45 min |
| 16 | Early Termination — bounded distance check | Medium | 45 min |
| 17 | The BK-Tree Node — struct and triangle inequality | Easy | 30 min |
| 18 | BK-Tree Insert — recursive insertion | Medium | 45 min |
| 19 | BK-Tree Search — fuzzy search with pruning | Hard | 60 min |
| 20 | Suggestion Ranking — distance + frequency | Medium | 45 min |

### Act 4 — The Pipeline (Stages 21–27)

| # | Stage | Difficulty | Est. Time |
|---|-------|-----------|-----------|
| 21 | Tokenizer — Unicode normalization, punctuation | Medium | 45 min |
| 22 | The Check Pipeline — bloom → trie → BK-tree | Hard | 60 min |
| 23 | CLI with clap — derive API, subcommands | Medium | 45 min |
| 24 | File Checking — line:column reporting, JSON output | Medium | 45 min |
| 25 | Custom Dictionary — user and per-project dicts | Easy | 30 min |
| 26 | Interactive Mode — crossterm TUI | Hard | 90 min |
| 27 | Performance Checkpoint — benchmarks, profiling | Medium | 45 min |

### Act 5 — The Rosetta Stone (Stages 28–32)

| # | Stage | Difficulty | Est. Time |
|---|-------|-----------|-----------|
| 28 | Multi-Language Dictionaries — en/es/pt | Medium | 45 min |
| 29 | Language Detection — word frequency scoring | Medium | 45 min |
| 30 | Trigram Fallback — cosine similarity | Hard | 60 min |
| 31 | Custom Dictionary per Language — false friends | Easy | 30 min |
| 32 | The Grand Benchmark — full system benchmark | Medium | 45 min |

## Summary

- **32 stages** across 5 acts
- **Estimated total:** ~23 hours
- **Difficulty breakdown:** 6 Very Easy/Easy, 19 Medium, 4 Hard, 3 Very Easy
- **Prerequisites:** Python or TypeScript experience, no Rust required
- **Output:** A working multi-language CLI spell checker with hand-built data structures
