# The Chronolock — Build Git From Scratch in Rust

> *You are a chronomancer. Your craft is time itself — capturing moments, branching realities, merging timelines. Your tool is the Chronolock, and you're forging it from nothing.*

A progressive, project-based Rust course. You build ONE project from scratch — a working version control system that implements git's core data model and commands. No libraries that do the hard parts for you. Just Rust, SHA-1, and your understanding of how time (and data) can be stored, branched, and merged.

**Project:** `~/juk/chronolock/` (Rust 2024 edition)

**Prerequisites:** Python or TypeScript experience. No Rust knowledge required — every concept is introduced when you first need it. Familiarity with using git (add, commit, branch, merge) is helpful but not required.

**What makes this different from your other Rust courses:** This is the first course where the primary challenge is *data representation* — how to model a complex, interconnected graph of objects on disk using content-addressable storage. There's no game loop, no network server, no TUI. The entire project is about reading and writing carefully structured data, and the elegance of git's design reveals itself one piece at a time.

> [!warning] This is a learning project
> For real-world version control, use git. Chronolock teaches you how git works internally, not to replace it.

---

## Design Decisions

### Why git?

Every developer uses git daily but almost nobody understands what happens below the commands. The internals are surprisingly simple — the entire data model is just three object types (blob, tree, commit) addressed by their SHA-1 hash. But from those three primitives, you get branching, merging, history, and distributed collaboration. Building it yourself is the fastest way to demystify it.

### Why not a database?

A database engine (B-trees, WAL, buffer pools) is a great project, but the concepts are more isolated — you can understand B-trees without understanding WAL. Git's concepts are deeply interconnected: you can't understand merging without understanding trees, which require blobs, which require content addressing. Each stage genuinely depends on the last. That makes for a better course arc.

### CLI design

The learner builds a real CLI called `chronolock` with subcommands that mirror git but use the chronomancer vocabulary:

| chronolock command | git equivalent | Chronomancer term |
|---|---|---|
| `chronolock init` | `git init` | Forge the Chronolock |
| `chronolock store` | `git hash-object -w` | Crystallize an object |
| `chronolock reveal` | `git cat-file` | Read a crystal |
| `chronolock stage` | `git add` | Prepare the moment |
| `chronolock anchor` | `git commit` | Anchor a point in time |
| `chronolock log` | `git log` | Walk the timeline |
| `chronolock drift` | `git diff` | See what changed |
| `chronolock branch` | `git branch` | Fork a timeline |
| `chronolock shift` | `git checkout` | Step into another reality |
| `chronolock converge` | `git merge` | Merge two timelines |
| `chronolock status` | `git status` | Survey the present |
| `chronolock echo` | `git reflog` | Remember abandoned timelines |
| `chronolock send` | `git push` | Transmit to a remote Chronolock |
| `chronolock receive` | `git pull/fetch` | Receive from a remote Chronolock |
| `chronolock pack` | `git gc` | Compress the archive |

### Tone

Quieter than the other courses. A chronomancer working alone in a study, carefully manipulating time. Contemplative, precise, occasionally awed by the elegance of the design. No combat, no urgency — just the craft of building something that handles time correctly.

### Compatibility

The Chronolock's on-disk format is **compatible with real git**. The `.chronolock/` directory uses the same layout as `.git/` — objects in `objects/`, refs in `refs/`, HEAD file, index file. At any point, the learner can run `git log` or `git status` inside a chronolock repo and see the same data. This is both a validation tool and a revelation: "I built this, and git can read it."

---

## Course Map

### [[Act 1 - The Crystals]] — Objects and Hashing (Stages 1-8)

The foundation. You learn how git stores data: content-addressable blobs, tree objects that represent directories, and the SHA-1 hashing that ties it all together. By the end, you can store files and directory snapshots.

| # | Stage | Concept | Difficulty | ~Time |
|---|---|---|---|---|
| 1 | Forging the Chronolock | `cargo new`, project setup, `.chronolock/` directory structure | Very Easy | 25 min |
| 2 | The First Crystal | SHA-1 hashing, content addressing, module system, byte slices and borrowing | Easy | 45 min |
| 3 | Storing Memories | Blob objects, zlib compression, `Result<T,E>` and the `?` operator | Easy | 60 min |
| 4 | Reading Crystals | Decompression, object parsing, `clap` CLI, `#[test]` introduction | Easy | 50 min |
| 5 | The Moment | Tree objects, binary format, closures, `&mut` borrowing | Medium | 75 min |
| 6 | Capturing a Moment | Staging area, directory walking, conditional compilation `#[cfg(unix)]` | Medium | 90 min |
| 7 | Nested Realities | Recursive tree building — subdirectories as tree objects pointing to other trees | Medium | 60 min |
| 8 | The Object Trinity | Commit objects, `Option<T>`, timestamps with `chrono` | Medium | 75 min |

### [[Act 2 - The Timeline]] — Commits, History, and Diff (Stages 9-15)

You build the timeline — a chain of commits stretching back to the beginning. You learn to walk it, display it, and see what changed between any two points.

| # | Stage | Concept | Difficulty | ~Time |
|---|---|---|---|---|
| 9 | Anchoring Time | `chronolock anchor` — create a commit, update HEAD, the parent chain | Medium | 75 min |
| 10 | Walking Backwards | `chronolock log` — traverse the commit chain, format output, follow parent pointers | Easy | 50 min |
| 11 | The Present | HEAD as a file, detached HEAD vs symbolic ref, `refs/heads/main` | Medium | 60 min |
| 12 | Temporal Drift | `chronolock drift` — diff two trees, comparing blob hashes to detect changes | Medium | 90 min |
| 13 | The Working Drift | Diff working directory against staged (index) and staged against last commit | Medium | 75 min |
| 14 | Surveying the Present | `chronolock status` — untracked, modified, staged, combining the diffs into a status display | Medium | 60 min |
| 15 | Ignoring the Noise | `.chronolockignore` — glob pattern matching, filtering the working directory scan | Easy | 45 min |

### [[Act 3 - The Branches]] — Branching and Checkout (Stages 16-21)

Timelines diverge. You build branching — which turns out to be shockingly simple (a branch is just a file containing a commit hash). The complexity is in checkout: reconstructing the working directory from a commit.

| # | Stage | Concept | Difficulty | ~Time |
|---|---|---|---|---|
| 16 | Forking a Timeline | `chronolock branch` — create a ref file in `refs/heads/`, list branches | Easy | 40 min |
| 17 | Shifting Realities | `chronolock shift` — update HEAD, reconstruct working directory from a tree | Hard | 100 min |
| 18 | The Safe Shift | Detecting uncommitted changes before checkout, refusing to overwrite dirty files | Medium | 60 min |
| 19 | Detached Time | Checking out a specific commit (detached HEAD), the "you are not on any branch" state | Medium | 50 min |
| 20 | Deleting Timelines | Branch deletion — safe delete (only if merged) vs force delete, dangling commits | Easy | 40 min |
| 21 | The Echo Memory | `chronolock echo` — the reflog, recording every HEAD movement, recovering "lost" commits | Medium | 60 min |

### [[Act 4 - The Convergence]] — Merging (Stages 22-28)

Two timelines become one. This is the hardest act — three-way merge, conflict detection, conflict resolution. The learner understands why merge conflicts happen and what git actually does to resolve them.

| # | Stage | Concept | Difficulty | ~Time |
|---|---|---|---|---|
| 22 | Finding Common Ground | Merge base — walking two commit chains to find the lowest common ancestor | Hard | 90 min |
| 23 | The Fast Path | Fast-forward merge — when one branch is strictly ahead, just move the pointer | Easy | 40 min |
| 24 | The Three-Way Mirror | Three-way diff — comparing base, ours, theirs to classify each file's changes | Hard | 100 min |
| 25 | Clean Convergence | Auto-merge — applying non-conflicting changes from both sides | Hard | 90 min |
| 26 | The Paradox | Conflict detection — both sides changed the same lines, writing conflict markers | Hard | 75 min |
| 27 | Resolving the Paradox | `chronolock converge --continue` — reading resolved files, completing the merge commit | Medium | 60 min |
| 28 | The Merge Commit | Creating a commit with two parents, updating log for DAG traversal | Medium | 50 min |

### [[Act 5 - The Archive]] — Performance, Packing, and Remotes (Stages 29-35)

The Chronolock works but stores every version of every file as a separate compressed blob. Act 5 makes it efficient (delta compression, pack files) and connected (push/pull between repositories).

| # | Stage | Concept | Difficulty | ~Time |
|---|---|---|---|---|
| 29 | Counting the Cost | Measuring storage — how much space does the naive approach waste? Motivating pack files | Easy | 40 min |
| 30 | The Delta | Delta compression — storing the difference between similar blobs instead of full copies | Hard | 90 min |
| 31 | The Pack File | Packing objects into a single `.pack` file with an `.idx` index for O(1) lookup | Hard | 90 min |
| 32 | The Other Chronolock | Remote repositories — `chronolock init --bare`, the concept of a remote | Medium | 50 min |
| 33 | Sending Memories | `chronolock send` — determining what the remote is missing, transferring objects | Hard | 75 min |
| 34 | Receiving Memories | `chronolock receive` — fetching remote refs, downloading missing objects | Hard | 75 min |
| 35 | The Complete Chronolock | Integration — init, stage, anchor, branch, shift, converge, send, receive. The full tool | Medium | 60 min |

### [[Reference Guide]]

SHA-1 internals, zlib compression, git object format specification, index file binary format, pack file format, merge algorithms, Rust byte manipulation patterns, `clap` CLI patterns.

---

## Totals

| Act | Stages | Est. Time |
|---|---|---|
| The Crystals | 8 | ~8 hrs |
| The Timeline | 7 | ~7.5 hrs |
| The Branches | 6 | ~6 hrs |
| The Convergence | 7 | ~8.5 hrs |
| The Archive | 7 | ~8 hrs |
| **Total** | **35** | **~38 hrs** |

## Tech Stack

| Crate | Version | Introduced |
|---|---|---|
| sha1 | 0.10 | Stage 2 |
| flate2 | 1 | Stage 3 |
| clap | 4 | Stage 4 |
| chrono | 0.4 | Stage 8 |
| glob | 0.3 | Stage 15 |
| colored | 2 | Stage 10 |

Minimal dependencies by design. The point is to build the hard parts yourself — no `git2` or `libgit2` bindings.

## What You'll Understand After This Course

- Why `git add` and `git commit` are separate operations (the index is a staging area, not a formality)
- Why the same file content in two different repos produces the same hash (content addressing)
- Why branches are "cheap" in git (they're literally a 41-byte file)
- Why merge conflicts happen (three-way diff, not two-way)
- Why `git reflog` can save your life (HEAD movements are recorded even when commits become unreachable)
- Why `.git/objects/` has those weird 2-character subdirectories (filesystem performance)
- Why `git gc` exists (loose objects → pack files with delta compression)
- How git can be distributed without a central server (every clone is a full repository)
