# Runescript — Build an Interpreter in Rust

A progressive, project-based course where you build a complete interpreter from scratch. No parser generators, no magic — just Rust, a hand-written lexer, a recursive descent parser, and a tree-walking evaluator.

**Project:** `~/juk/runescript/` (Rust 2024 edition)
**Language:** Runescript — a fantasy-themed scripting language for dungeon room events
**Pipeline:** Source text → Lexer (chars → tokens) → Parser (tokens → AST) → Evaluator (AST → effects)

## Course Map

### Act 1: Carving the Runes — The Lexer
**File:** [[Act 1 - Carving the Runes]]
**Estimated time:** 4-6 hours

| Stage | Title | Difficulty | What you build |
|-------|-------|-----------|----------------|
| 1 | The First Rune | Very Easy | Project setup, Token and Span types |
| 2 | Single-Character Runes | Easy | Scan operators and delimiters |
| 3 | Two-Character Runes | Easy | Handle ==, !=, <=, >=, &&, \|\| |
| 4 | Numbers and the Void | Easy | Integer literals, nil |
| 5 | Words of Power | Medium | Identifiers and keywords |
| 6 | The Spoken Word | Medium | String literals with interpolation markers |
| 7 | The Complete Carver | Medium | Comments, EOF, error reporting, full tests |

### Act 2: Deciphering the Incantation — The Parser
**File:** [[Act 2 - Deciphering the Incantation]]
**Estimated time:** 6-8 hours

| Stage | Title | Difficulty | What you build |
|-------|-------|-----------|----------------|
| 8 | The Spell Tree | Easy | Expr and Stmt AST enums |
| 9 | Literals and Names | Easy | Parse primary expressions |
| 10 | The Binding Power | Hard | Pratt parsing for operator precedence |
| 11 | Unary and Grouping | Medium | Prefix operators, parentheses |
| 12 | Declarations | Medium | let and fn statements |
| 13 | Control Flow | Medium | if/else, while, for-in, return |
| 14 | Error Recovery | Hard | Panic-mode sync, multiple error reporting |

### Act 3: Casting the Spell — The Evaluator
**File:** [[Act 3 - Casting the Spell]]
**Estimated time:** 6-8 hours

| Stage | Title | Difficulty | What you build |
|-------|-------|-----------|----------------|
| 15 | The Grimoire | Medium | Environment (scope chain) |
| 16 | Simple Incantations | Medium | Literals, arithmetic, string concat |
| 17 | Variables and Assignment | Medium | Let, Ident, Assign evaluation |
| 18 | Truth and Consequence | Medium | Comparisons, boolean logic, if/while |
| 19 | The Summoning | Hard | Functions, calls, return unwinding |
| 20 | Cantrips | Medium | Built-in functions and game stubs |
| 21 | Arrays and the Index | Medium | Arrays, indexing, for-in loops |
| 22 | The Interpolation Ritual | Medium | String interpolation, objects, field access |

### Act 4: The Scrying Pool — REPL & File Execution
**File:** [[Act 4 - The Scrying Pool]]
**Estimated time:** 3-4 hours

| Stage | Title | Difficulty | What you build |
|-------|-------|-----------|----------------|
| 23 | The Scrying Pool | Medium | Interactive REPL with rustyline |
| 24 | Multi-Line Incantations | Medium | Brace-matching continuation, history |
| 25 | Scroll Execution | Medium | File mode, hunter object injection |
| 26 | Miscast Diagnostics | Medium | Polished errors, "did you mean?", color |

### Act 5: The Binding — Game Engine Integration
**File:** [[Act 5 - The Binding]]
**Estimated time:** 3-4 hours

| Stage | Title | Difficulty | What you build |
|-------|-------|-----------|----------------|
| 27 | The Game Bridge | Medium | GameCallback trait, dependency inversion |
| 28 | Loading Scrolls | Medium | Directory scanning, room script loading |
| 29 | The Watcher | Hard | Hot reload with file watching |
| 30 | The Grand Ritual | Medium | End-to-end tests, performance benchmark |

### Reference
**File:** [[Reference Guide]]

Rust cheat sheet, interpreter glossary, operator precedence table, BNF grammar, built-in function reference, common Rust patterns, error reference, project file map.

## Total Estimated Time

| Act | Hours | Stages |
|-----|-------|--------|
| Act 1: The Lexer | 4-6 | 7 |
| Act 2: The Parser | 6-8 | 7 |
| Act 3: The Evaluator | 6-8 | 8 |
| Act 4: The REPL | 3-4 | 4 |
| Act 5: Integration | 3-4 | 4 |
| **Total** | **22-30** | **30** |

## Prerequisites

- A working Rust toolchain (`rustup`, `cargo`)
- nvim + Ghostty terminal (or any editor/terminal)
- macOS (Linux works too)
- Familiarity with Python or TypeScript
- No prior Rust or interpreter experience needed
