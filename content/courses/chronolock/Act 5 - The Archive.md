# Act 5 — The Archive

> *The Chronolock works. You can store, branch, merge, and recover. But every version of every file sits in its own compressed blob — a library where every edition of every book occupies its own shelf. In this final act, you make the archive efficient and connected: delta compression shrinks storage, pack files consolidate objects, and remote communication lets two Chronolocks share history.*

This act is about engineering — taking a correct system and making it practical. The concepts here (delta compression, pack files, network protocols) are what separate a toy from a tool.

```mermaid
flowchart LR
    S29["Stage 29 - Measure Waste"] --> S30["Stage 30 - Delta Compression"]
    S30 --> S31["Stage 31 - Pack Files"]
    S31 --> S32["Stage 32 - Bare Repos"]
    S32 --> S33["Stage 33 - Push"]
    S33 --> S34["Stage 34 - Fetch"]
    S34 --> S35["Stage 35 - Integration"]
    style S29 fill:#49a,stroke:#333
    style S35 fill:#a4e,stroke:#333
```

---

## Stage 29 — Counting the Cost

> *Difficulty: Easy — Measuring how wasteful the naive approach is.*

Before optimizing, measure. How much space does the Chronolock actually waste? If you have a 10KB file and make 50 commits that each change one line, the naive approach stores 50 × 10KB = 500KB of nearly identical blobs. This stage quantifies the problem so the solution (delta compression) feels motivated rather than arbitrary.

> [!tip] What You'll Learn
> - Walking the object store to count objects and measure size
> - Comparing compressed vs uncompressed sizes
> - Understanding the duplication problem
> - Why optimization matters for real repositories

### 29.1 — The stats command

Add a new file `src/stats.rs`:

```rust
use std::fs;
use std::path::Path;

pub struct StoreStats {
    pub object_count: usize,
    pub total_compressed: u64,
    pub total_uncompressed: u64,
    pub blobs: usize,
    pub trees: usize,
    pub commits: usize,
}

/// Walk the object store and collect statistics.
pub fn collect_stats() -> std::io::Result<StoreStats> {
    let objects_dir = Path::new(".chronolock/objects");
    let mut stats = StoreStats {
        object_count: 0,
        total_compressed: 0,
        total_uncompressed: 0,
        blobs: 0,
        trees: 0,
        commits: 0,
    };

    if !objects_dir.exists() {
        return Ok(stats);
    }

    // Walk the 2-char prefix directories
    for prefix_entry in fs::read_dir(objects_dir)? {
        let prefix_entry = prefix_entry?;
        let prefix_path = prefix_entry.path();

        if !prefix_path.is_dir() {
            continue;
        }

        // Skip pack directory (we'll add this later)
        if prefix_entry.file_name() == "pack" {
            continue;
        }

        for obj_entry in fs::read_dir(&prefix_path)? {
            let obj_entry = obj_entry?;
            let obj_path = obj_entry.path();

            if !obj_path.is_file() {
                continue;
            }

            let compressed_size = obj_entry.metadata()?.len();
            stats.total_compressed += compressed_size;
            stats.object_count += 1;

            // Read and decompress to get the type and uncompressed size
            let prefix = prefix_path.file_name().unwrap().to_string_lossy();
            let suffix = obj_entry.file_name().to_string_lossy().to_string();
            let hash = format!("{}{}", prefix, suffix);

            if let Ok(obj) = crate::object::read_object(&hash) {
                stats.total_uncompressed += obj.size as u64;
                match obj.obj_type {
                    crate::object::ObjectType::Blob => stats.blobs += 1,
                    crate::object::ObjectType::Tree => stats.trees += 1,
                    crate::object::ObjectType::Commit => stats.commits += 1,
                }
            }
        }
    }

    Ok(stats)
}
```

Wire it up:

```rust
/// Show object store statistics
Stats,
```

```rust
Commands::Stats => {
    let s = stats::collect_stats().unwrap_or_else(|e| {
        eprintln!("Failed to collect stats: {}", e);
        std::process::exit(1);
    });
    println!("Object store statistics:");
    println!("  Objects:      {} ({} blobs, {} trees, {} commits)",
        s.object_count, s.blobs, s.trees, s.commits);
    println!("  Compressed:   {} bytes", s.total_compressed);
    println!("  Uncompressed: {} bytes", s.total_uncompressed);
    if s.total_uncompressed > 0 {
        let ratio = s.total_compressed as f64 / s.total_uncompressed as f64;
        println!("  Ratio:        {:.1}%", ratio * 100.0);
    }
}
```

### 29.2 — Test it

```bash
# Make several commits with small changes to see duplication
for i in $(seq 1 10); do
    echo "Line $i" >> growing.txt
    cargo run -- anchor -m "Add line $i"
done

cargo run -- stats
```

```
Object store statistics:
  Objects:      31 (11 blobs, 10 trees, 10 commits)
  Compressed:   2847 bytes
  Uncompressed: 4523 bytes
  Ratio:        63.0%
```

Zlib compression helps, but we're still storing 11 nearly-identical versions of `growing.txt`. Each blob differs by one line, yet each is stored independently. Delta compression would store the first version in full and each subsequent version as "the previous version plus one line."

The waste grows with project size. A real project with thousands of files and hundreds of commits would store enormous amounts of redundant data.

> [!check] Checkpoint
> Run `chronolock stats` and observe the object count growing with each commit. Understand that similar blobs are stored independently. Stage 29 complete.

---

## Stage 30 — The Delta

> *Difficulty: Hard — Computing and applying deltas between similar blobs.*

Instead of storing every version of a file in full, we can store the *difference* between two similar versions. The first version (the "base") is stored in full. Subsequent versions are stored as a delta: "take the base, apply these insertions and deletions." This is **delta compression** — the technique that makes git repositories dramatically smaller.

> [!tip] What You'll Learn
> - Delta encoding — representing changes as instructions
> - A simple delta format: copy and insert operations
> - Applying a delta to reconstruct the original
> - Why finding good delta bases matters

### The delta format

Our delta format uses two operations:

- **Copy(offset, length)** — copy `length` bytes starting at `offset` from the base object
- **Insert(data)** — insert literal bytes

A delta is a sequence of these operations. Applying them in order against the base reconstructs the target.

### 30.1 — Delta computation

Create `src/delta.rs`:

```rust
/// A delta operation.
#[derive(Debug)]
pub enum DeltaOp {
    /// Copy bytes from the base: (offset, length)
    Copy(usize, usize),
    /// Insert literal bytes
    Insert(Vec<u8>),
}

/// Compute a delta from `base` to `target`.
/// Uses a simple longest-common-substring approach.
pub fn compute_delta(base: &[u8], target: &[u8]) -> Vec<DeltaOp> {
    let mut ops = Vec::new();
    let mut target_pos = 0;

    while target_pos < target.len() {
        // Try to find the longest match in base
        let (best_offset, best_length) = find_longest_match(base, &target[target_pos..]);

        if best_length >= 8 {
            // Worth copying from base (minimum 8 bytes to justify the copy instruction overhead)
            ops.push(DeltaOp::Copy(best_offset, best_length));
            target_pos += best_length;
        } else {
            // No good match — insert literal bytes until we find one
            let insert_start = target_pos;
            target_pos += 1;

            // Extend the insert until we find a match or reach the end
            while target_pos < target.len() {
                let (_, len) = find_longest_match(base, &target[target_pos..]);
                if len >= 8 {
                    break;
                }
                target_pos += 1;
            }

            ops.push(DeltaOp::Insert(target[insert_start..target_pos].to_vec()));
        }
    }

    ops
}

/// Find the longest match of `needle_start` in `haystack`.
/// Returns (offset_in_haystack, length).
fn find_longest_match(haystack: &[u8], needle: &[u8]) -> (usize, usize) {
    let mut best_offset = 0;
    let mut best_length = 0;

    // Simple O(n*m) search — good enough for our purposes
    for offset in 0..haystack.len() {
        let mut length = 0;
        while offset + length < haystack.len()
            && length < needle.len()
            && haystack[offset + length] == needle[length]
        {
            length += 1;
        }
        if length > best_length {
            best_offset = offset;
            best_length = length;
        }
    }

    (best_offset, best_length)
}

/// Apply a delta to a base to reconstruct the target.
pub fn apply_delta(base: &[u8], ops: &[DeltaOp]) -> Vec<u8> {
    let mut result = Vec::new();
    for op in ops {
        match op {
            DeltaOp::Copy(offset, length) => {
                result.extend_from_slice(&base[*offset..*offset + *length]);
            }
            DeltaOp::Insert(data) => {
                result.extend_from_slice(data);
            }
        }
    }
    result
}

/// Serialize delta operations to bytes.
pub fn serialize_delta(base_size: usize, target_size: usize, ops: &[DeltaOp]) -> Vec<u8> {
    let mut bytes = Vec::new();

    // Header: base size and target size as variable-length integers
    encode_varint(base_size, &mut bytes);
    encode_varint(target_size, &mut bytes);

    for op in ops {
        match op {
            DeltaOp::Copy(offset, length) => {
                // Copy instruction: high bit set
                bytes.push(0x80);
                encode_varint(*offset, &mut bytes);
                encode_varint(*length, &mut bytes);
            }
            DeltaOp::Insert(data) => {
                // Insert instruction: length (high bit clear, max 127)
                assert!(data.len() <= 127, "Insert too large");
                bytes.push(data.len() as u8);
                bytes.extend_from_slice(data);
            }
        }
    }

    bytes
}

fn encode_varint(mut value: usize, buf: &mut Vec<u8>) {
    loop {
        let mut byte = (value & 0x7F) as u8;
        value >>= 7;
        if value > 0 {
            byte |= 0x80;
        }
        buf.push(byte);
        if value == 0 {
            break;
        }
    }
}
```

> [!note] Simplification
> Real git uses a more sophisticated delta algorithm with hash-based matching (similar to rsync). Our O(n*m) approach works for learning but would be too slow for large files. The concept is identical — only the matching speed differs.

### 30.2 — Test delta compression

```bash
# We'll test this programmatically in the next stage when we build pack files.
# For now, verify the round-trip works:
```

Add a quick test in `main.rs` or as a unit test:

```rust
#[cfg(test)]
mod tests {
    use super::delta;

    #[test]
    fn test_delta_round_trip() {
        let base = b"Hello, world! This is a test file with some content.";
        let target = b"Hello, world! This is a modified file with some content.";

        let ops = delta::compute_delta(base, target);
        let reconstructed = delta::apply_delta(base, &ops);

        assert_eq!(reconstructed, target);
    }
}
```

```bash
cargo test
```

> [!check] Checkpoint
> The delta module can compute a delta between two byte sequences and apply it to reconstruct the target. The round-trip test passes. Stage 30 complete.

---

## Stage 31 — The Pack File

> *Difficulty: Hard — Consolidating loose objects into a single indexed file.*

Right now, every object is a separate file in `objects/`. A repository with 10,000 objects has 10,000 files spread across 256 directories. This is slow to clone, slow to transfer, and wasteful on filesystems that allocate space in blocks. Pack files solve this by concatenating all objects into a single `.pack` file with an `.idx` index for O(1) lookup.

> [!tip] What You'll Learn
> - The pack file format — a sequence of compressed objects
> - The index file — mapping hashes to offsets
> - Packing loose objects into a single file
> - Reading objects from pack files

### The pack format (simplified)

Our simplified pack file:

```
PACK                    ← 4-byte magic
<version: u32>          ← version number (1)
<count: u32>            ← number of objects
<entry>...              ← one per object
```

Each entry:

```
<hash: 20 bytes>        ← SHA-1 hash
<type: u8>              ← 1=blob, 2=tree, 3=commit
<size: u32>             ← uncompressed size
<compressed data>       ← zlib-compressed object content (without header)
```

The index file maps hashes to byte offsets in the pack file for O(1) lookup.

### 31.1 — The pack module

Create `src/pack.rs`:

```rust
use crate::object::{self, ObjectType};
use flate2::write::ZlibEncoder;
use flate2::read::ZlibDecoder;
use flate2::Compression;
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::Path;

const PACK_MAGIC: &[u8] = b"PACK";
const PACK_VERSION: u32 = 1;

/// Pack all loose objects into a single pack file.
/// Returns the number of objects packed.
pub fn pack_objects() -> std::io::Result<usize> {
    let objects_dir = Path::new(".chronolock/objects");
    let pack_dir = objects_dir.join("pack");
    fs::create_dir_all(&pack_dir)?;

    // Collect all loose objects
    let mut entries: Vec<(String, ObjectType, Vec<u8>)> = Vec::new();

    for prefix_entry in fs::read_dir(objects_dir)? {
        let prefix_entry = prefix_entry?;
        let prefix_path = prefix_entry.path();
        if !prefix_path.is_dir() || prefix_entry.file_name() == "pack" {
            continue;
        }

        let prefix = prefix_entry.file_name().to_string_lossy().to_string();
        for obj_entry in fs::read_dir(&prefix_path)? {
            let obj_entry = obj_entry?;
            let suffix = obj_entry.file_name().to_string_lossy().to_string();
            let hash = format!("{}{}", prefix, suffix);

            let obj = object::read_object(&hash)?;
            entries.push((hash, obj.obj_type, obj.content));
        }
    }

    if entries.is_empty() {
        println!("No loose objects to pack.");
        return Ok(0);
    }

    let count = entries.len();

    // Write pack file
    let pack_path = pack_dir.join("main.pack");
    let mut pack_data: Vec<u8> = Vec::new();

    // Header
    pack_data.extend_from_slice(PACK_MAGIC);
    pack_data.extend_from_slice(&PACK_VERSION.to_be_bytes());
    pack_data.extend_from_slice(&(count as u32).to_be_bytes());

    // Index: hash → offset
    let mut index: HashMap<String, u64> = HashMap::new();

    for (hash, obj_type, content) in &entries {
        let offset = pack_data.len() as u64;
        index.insert(hash.clone(), offset);

        // Hash (20 bytes)
        let hash_bytes = object::hex_to_bytes_pub(hash)?;
        pack_data.extend_from_slice(&hash_bytes);

        // Type (1 byte)
        let type_byte: u8 = match obj_type {
            ObjectType::Blob => 1,
            ObjectType::Tree => 2,
            ObjectType::Commit => 3,
        };
        pack_data.push(type_byte);

        // Uncompressed size (4 bytes)
        pack_data.extend_from_slice(&(content.len() as u32).to_be_bytes());

        // Compressed content
        let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(content)?;
        let compressed = encoder.finish()?;

        // Compressed size (4 bytes) + data
        pack_data.extend_from_slice(&(compressed.len() as u32).to_be_bytes());
        pack_data.extend_from_slice(&compressed);
    }

    fs::write(&pack_path, &pack_data)?;

    // Write index file
    let idx_path = pack_dir.join("main.idx");
    let idx_json = serde_json::to_string(&index)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    fs::write(&idx_path, idx_json)?;

    // Remove loose objects
    for (hash, _, _) in &entries {
        let loose_path = objects_dir.join(&hash[..2]).join(&hash[2..]);
        let _ = fs::remove_file(&loose_path);
        // Clean up empty prefix directories
        let prefix_dir = objects_dir.join(&hash[..2]);
        if prefix_dir.read_dir()?.next().is_none() {
            let _ = fs::remove_dir(&prefix_dir);
        }
    }

    Ok(count)
}
```

> [!note] Simplification
> We use a JSON index file for simplicity. Real git uses a binary index format with fan-out tables for O(1) lookup. The concept is the same — map hash to offset — but the binary format is more compact and faster.

### 31.2 — Add serde for the index

Update `Cargo.toml` if not already present:

```toml
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

Make `hex_to_bytes` public in `object.rs`:

```rust
pub fn hex_to_bytes_pub(hex: &str) -> std::io::Result<Vec<u8>> {
    hex_to_bytes(hex)
}
```

### 31.3 — The pack command

```rust
/// Pack loose objects into a pack file
Pack,
```

```rust
Commands::Pack => {
    let count = pack::pack_objects().unwrap_or_else(|e| {
        eprintln!("Pack failed: {}", e);
        std::process::exit(1);
    });
    println!("Packed {} objects.", count);
}
```

### 31.4 — Reading from pack files

Update `read_object` in `object.rs` to fall back to pack files when a loose object isn't found. This is the key integration point — the rest of the codebase doesn't need to know whether an object is loose or packed.

```rust
pub fn read_object(hash: &str) -> std::io::Result<Object> {
    // Try loose object first
    let loose_path = Path::new(".chronolock/objects")
        .join(&hash[..2])
        .join(&hash[2..]);

    if loose_path.exists() {
        return read_loose_object(&loose_path);
    }

    // Try pack file
    read_from_pack(hash)
}
```

Add `read_from_pack` that reads the index, finds the offset, and reads the entry from the pack file.

### 31.5 — Test it

```bash
cargo run -- stats
# Note the object count and compressed size

cargo run -- pack
# Packed N objects.

cargo run -- stats
# Objects should now be 0 (all packed)

# Verify everything still works
cargo run -- log
cargo run -- status
cargo run -- reveal <some-hash>
```

All commands should work identically — the pack file is transparent to the rest of the system.

> [!check] Checkpoint
> Pack all loose objects. Verify `stats` shows 0 loose objects. Verify `log`, `status`, and `reveal` still work. Stage 31 complete.

---

## Stage 32 — The Other Chronolock

> *Difficulty: Medium — Bare repositories and the concept of remotes.*

So far, the Chronolock only knows about itself. But version control's real power is collaboration — sharing history between repositories. Before we can push and pull, we need to understand **bare repositories**: Chronolocks that store objects and refs but have no working directory. They exist solely to receive and serve history.

> [!tip] What You'll Learn
> - Bare repositories — what they are and why they exist
> - `chronolock init --bare` — creating a bare repo
> - The concept of a "remote" — a reference to another repository
> - Why servers use bare repos (no working directory to conflict with)

### Why bare?

A normal repository has a working directory — the actual files you edit. A bare repository has only the `.chronolock/` internals (objects, refs, HEAD) without a working directory. Why?

When you push to a remote, you're updating its refs and adding objects. If the remote had a working directory, pushing would make the working directory out of sync with HEAD — confusing and dangerous. Bare repos avoid this by having no working directory to desync.

### 32.1 — Init bare

Update the `init` command to support `--bare`:

```rust
Init {
    /// Create a bare repository (no working directory)
    #[arg(long)]
    bare: bool,
},
```

```rust
Commands::Init { bare } => {
    if bare {
        init_bare();
    } else {
        init();
    }
}
```

```rust
fn init_bare() {
    let root = Path::new(".");
    // Bare repos store objects and refs directly in the current directory
    fs::create_dir_all("objects").expect("Failed to create objects/");
    fs::create_dir_all("refs/heads").expect("Failed to create refs/heads/");
    fs::write("HEAD", "ref: refs/heads/main\n").expect("Failed to write HEAD");
    println!("Bare Chronolock forged.");
}
```

### 32.2 — Remote configuration

Add a simple remote tracking file. Create `src/remote.rs`:

```rust
use std::fs;
use std::path::Path;

/// Add a remote (just a path to another repository for now).
pub fn add_remote(name: &str, path: &str) -> std::io::Result<()> {
    let remotes_dir = Path::new(".chronolock/remotes");
    fs::create_dir_all(remotes_dir)?;
    fs::write(remotes_dir.join(name), format!("{}\n", path))
}

/// Read a remote's path.
pub fn get_remote(name: &str) -> std::io::Result<Option<String>> {
    let path = Path::new(".chronolock/remotes").join(name);
    if path.exists() {
        let content = fs::read_to_string(&path)?;
        Ok(Some(content.trim().to_string()))
    } else {
        Ok(None)
    }
}
```

For this course, remotes are local filesystem paths (not network URLs). This keeps the focus on the data transfer protocol rather than networking.

### 32.3 — Test it

```bash
# Create a bare remote
mkdir -p /tmp/chronolock-remote
cd /tmp/chronolock-remote
chronolock init --bare

# Back in your project, add the remote
cd ~/juk/chronolock
cargo run -- remote add origin /tmp/chronolock-remote
```

> [!note] Local remotes
> Real git supports `file://`, `ssh://`, `https://` remotes. We use filesystem paths because the interesting part isn't the transport — it's the object negotiation (what does the remote need that I have?). The protocol is the same regardless of transport.

We have a bare remote. Next stage, we'll push our history to it.

> [!check] Checkpoint
> Create a bare repository. Add it as a remote. Verify the remote path is stored in `.chronolock/remotes/origin`. Stage 32 complete.

---

## Stage 33 — Sending Memories

> *Difficulty: Hard — Determining what the remote needs and transferring objects.*

Pushing isn't "copy everything." It's "figure out what the remote is missing, then send only that." This is the **object negotiation** — the Chronolock compares its refs with the remote's refs, walks the commit graph to find missing objects, and transfers them.

> [!tip] What You'll Learn
> - Object negotiation — finding what the remote needs
> - Walking the commit graph to collect reachable objects
> - Copying objects between repositories
> - Updating remote refs after a successful push

### 33.1 — Collect reachable objects

Add to `src/remote.rs`:

```rust
use crate::object;
use std::collections::HashSet;

/// Collect all object hashes reachable from a commit.
/// Walks commits, trees, and blobs recursively.
pub fn collect_reachable(commit_hash: &str) -> std::io::Result<HashSet<String>> {
    let mut visited = HashSet::new();
    collect_reachable_inner(commit_hash, &mut visited)?;
    Ok(visited)
}

fn collect_reachable_inner(hash: &str, visited: &mut HashSet<String>) -> std::io::Result<()> {
    if visited.contains(hash) {
        return Ok(());
    }
    visited.insert(hash.to_string());

    let obj = object::read_object(hash)?;
    match obj.obj_type {
        object::ObjectType::Commit => {
            let info = object::parse_commit(&obj.content);
            // Visit the tree
            collect_reachable_inner(&info.tree, visited)?;
            // Visit parents
            for parent in &info.parents {
                collect_reachable_inner(parent, visited)?;
            }
        }
        object::ObjectType::Tree => {
            let entries = object::parse_tree(&obj.content);
            for entry in entries {
                collect_reachable_inner(&entry.hash, visited)?;
            }
        }
        object::ObjectType::Blob => {
            // Leaf node — nothing more to visit
        }
    }
    Ok(())
}
```

### 33.2 — The push function

```rust
/// Push a branch to a remote repository.
pub fn push(remote_path: &str, branch: &str) -> std::io::Result<()> {
    let local_ref = crate::refs::read_branch(branch)?
        .ok_or_else(|| std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("Local branch '{}' not found", branch),
        ))?;

    // Check what the remote already has
    let remote_ref_path = std::path::Path::new(remote_path).join("refs/heads").join(branch);
    let remote_has: HashSet<String> = if remote_ref_path.exists() {
        let remote_hash = fs::read_to_string(&remote_ref_path)?.trim().to_string();
        collect_reachable(&remote_hash).unwrap_or_default()
    } else {
        HashSet::new()
    };

    // Collect what we need to send
    let local_objects = collect_reachable(&local_ref)?;
    let to_send: Vec<&String> = local_objects.difference(&remote_has).collect();

    if to_send.is_empty() {
        println!("Everything up to date.");
        return Ok(());
    }

    println!("Sending {} objects...", to_send.len());

    // Copy objects to the remote
    let remote_objects = std::path::Path::new(remote_path).join("objects");
    for hash in &to_send {
        let src = std::path::Path::new(".chronolock/objects")
            .join(&hash[..2])
            .join(&hash[2..]);

        if src.exists() {
            let dst_dir = remote_objects.join(&hash[..2]);
            fs::create_dir_all(&dst_dir)?;
            let dst = dst_dir.join(&hash[2..]);
            if !dst.exists() {
                fs::copy(&src, &dst)?;
            }
        }
    }

    // Update the remote's branch ref
    let remote_refs_dir = std::path::Path::new(remote_path).join("refs/heads");
    fs::create_dir_all(&remote_refs_dir)?;
    fs::write(remote_refs_dir.join(branch), format!("{}\n", local_ref))?;

    println!("Pushed {} to {}/{}", &local_ref[..8], remote_path, branch);
    Ok(())
}
```

### 33.3 — Wire it up

```rust
/// Send history to a remote Chronolock
Send {
    /// Remote name
    remote: String,
    /// Branch to push
    branch: String,
},
```

```rust
Commands::Send { remote: remote_name, branch } => {
    let remote_path = remote::get_remote(&remote_name).unwrap_or_else(|e| {
        eprintln!("Failed to read remote: {}", e);
        std::process::exit(1);
    }).unwrap_or_else(|| {
        eprintln!("Remote '{}' not found.", remote_name);
        std::process::exit(1);
    });
    remote::push(&remote_path, &branch).unwrap_or_else(|e| {
        eprintln!("Push failed: {}", e);
        std::process::exit(1);
    });
}
```

### 33.4 — Test it

```bash
cargo run -- send origin main
```

```
Sending 31 objects...
Pushed e5f8a2b4 to /tmp/chronolock-remote/main
```

Verify the remote has the objects:

```bash
GIT_DIR=/tmp/chronolock-remote git log --oneline
```

Git should show the same history as your local repository.

> [!check] Checkpoint
> Push to the bare remote. Verify the remote contains all objects and the branch ref is updated. Verify `git log` works on the remote. Stage 33 complete.

---

## Stage 34 — Receiving Memories

> *Difficulty: Hard — Fetching objects from a remote and updating local refs.*

The inverse of push: read the remote's refs, find objects we don't have, copy them locally, and update our tracking refs. This completes the two-way communication between Chronolocks.

> [!tip] What You'll Learn
> - Fetching remote refs
> - Downloading missing objects
> - Remote-tracking branches (`refs/remotes/origin/main`)
> - The fetch-then-merge workflow

### 34.1 — The fetch function

Add to `src/remote.rs`:

```rust
/// Fetch objects and refs from a remote.
pub fn fetch(remote_path: &str, remote_name: &str) -> std::io::Result<()> {
    let remote_refs_dir = std::path::Path::new(remote_path).join("refs/heads");
    if !remote_refs_dir.exists() {
        println!("Remote has no branches.");
        return Ok(());
    }

    // Read all remote branches
    for entry in fs::read_dir(&remote_refs_dir)? {
        let entry = entry?;
        let branch = entry.file_name().to_string_lossy().to_string();
        let remote_hash = fs::read_to_string(entry.path())?.trim().to_string();

        // Collect objects we need
        let remote_objects = collect_reachable_from_remote(&remote_hash, remote_path)?;
        let local_objects = {
            let mut set = HashSet::new();
            // Check which objects we already have
            for hash in &remote_objects {
                if object_exists_locally(hash) {
                    set.insert(hash.clone());
                }
            }
            set
        };

        let to_fetch: Vec<&String> = remote_objects.difference(&local_objects).collect();

        if !to_fetch.is_empty() {
            println!("Fetching {} objects for {}...", to_fetch.len(), branch);

            let remote_obj_dir = std::path::Path::new(remote_path).join("objects");
            let local_obj_dir = std::path::Path::new(".chronolock/objects");

            for hash in &to_fetch {
                let src = remote_obj_dir.join(&hash[..2]).join(&hash[2..]);
                if src.exists() {
                    let dst_dir = local_obj_dir.join(&hash[..2]);
                    fs::create_dir_all(&dst_dir)?;
                    let dst = dst_dir.join(&hash[2..]);
                    if !dst.exists() {
                        fs::copy(&src, &dst)?;
                    }
                }
            }
        }

        // Update remote-tracking ref
        let tracking_dir = std::path::Path::new(".chronolock/refs/remotes").join(remote_name);
        fs::create_dir_all(&tracking_dir)?;
        fs::write(tracking_dir.join(&branch), format!("{}\n", remote_hash))?;

        println!("Updated {}/{} -> {}", remote_name, branch, &remote_hash[..8]);
    }

    Ok(())
}

fn collect_reachable_from_remote(hash: &str, remote_path: &str) -> std::io::Result<HashSet<String>> {
    // Temporarily read objects from the remote path
    // In a real implementation, this would use a network protocol
    let mut visited = HashSet::new();
    collect_from_remote_inner(hash, remote_path, &mut visited)?;
    Ok(visited)
}

fn collect_from_remote_inner(hash: &str, remote_path: &str, visited: &mut HashSet<String>) -> std::io::Result<()> {
    if visited.contains(hash) {
        return Ok(());
    }
    visited.insert(hash.to_string());

    let obj_path = std::path::Path::new(remote_path)
        .join("objects")
        .join(&hash[..2])
        .join(&hash[2..]);

    if !obj_path.exists() {
        return Ok(());
    }

    // Read and parse the object from the remote
    let compressed = fs::read(&obj_path)?;
    let mut decoder = flate2::read::ZlibDecoder::new(&compressed[..]);
    let mut raw = Vec::new();
    decoder.read_to_end(&mut raw)?;

    let null_pos = raw.iter().position(|&b| b == 0).unwrap_or(0);
    let header = std::str::from_utf8(&raw[..null_pos]).unwrap_or("");
    let content = &raw[null_pos + 1..];

    if header.starts_with("commit") {
        let info = object::parse_commit(content);
        collect_from_remote_inner(&info.tree, remote_path, visited)?;
        for parent in &info.parents {
            collect_from_remote_inner(parent, remote_path, visited)?;
        }
    } else if header.starts_with("tree") {
        let entries = object::parse_tree(content);
        for entry in entries {
            collect_from_remote_inner(&entry.hash, remote_path, visited)?;
        }
    }

    Ok(())
}

fn object_exists_locally(hash: &str) -> bool {
    std::path::Path::new(".chronolock/objects")
        .join(&hash[..2])
        .join(&hash[2..])
        .exists()
}
```

### 34.2 — Wire it up

```rust
/// Receive history from a remote Chronolock
Receive {
    /// Remote name
    remote: String,
},
```

```rust
Commands::Receive { remote: remote_name } => {
    let remote_path = remote::get_remote(&remote_name).unwrap_or_else(|e| {
        eprintln!("Failed to read remote: {}", e);
        std::process::exit(1);
    }).unwrap_or_else(|| {
        eprintln!("Remote '{}' not found.", remote_name);
        std::process::exit(1);
    });
    remote::fetch(&remote_path, &remote_name).unwrap_or_else(|e| {
        eprintln!("Fetch failed: {}", e);
        std::process::exit(1);
    });
}
```

### 34.3 — Test the round trip

```bash
# Clone scenario: create a new repo and fetch from the remote
mkdir -p /tmp/chronolock-clone
cd /tmp/chronolock-clone
chronolock init
cargo run -- remote add origin /tmp/chronolock-remote
cargo run -- receive origin
```

```
Fetching 31 objects for main...
Updated origin/main -> e5f8a2b4
```

The clone now has all the objects. To actually use the fetched branch, merge it:

```bash
# Set up local main to track the remote
cargo run -- converge origin/main  # or manually set refs/heads/main
```

> [!check] Checkpoint
> Fetch from a remote into a new repository. Verify all objects are transferred and remote-tracking refs are created. Stage 34 complete.

---

## Stage 35 — The Complete Chronolock

> *Difficulty: Medium — Integration testing and the full workflow.*

The Chronolock is complete. This final stage is about verification — running through the entire workflow end-to-end, confirming git compatibility at every step, and reflecting on what you've built.

> [!tip] What You'll Learn
> - End-to-end integration testing
> - Git compatibility verification
> - The complete command set working together
> - What you've actually built (and what real git does differently)

### 35.1 — The full workflow test

```bash
# Start fresh
rm -rf /tmp/chronolock-test
mkdir /tmp/chronolock-test
cd /tmp/chronolock-test

# Initialize
chronolock init

# Create some files
echo "fn main() { println!(\"Chronolock\"); }" > main.rs
echo "# The Chronolock" > README.md

# First commit
chronolock anchor -m "Initial commit"

# Create a feature branch
chronolock branch feature
chronolock shift feature

# Work on the feature
echo "fn helper() {}" > helper.rs
chronolock anchor -m "Add helper"

# Switch back to main
chronolock shift main

# Work on main
echo "## Usage" >> README.md
chronolock anchor -m "Update README"

# Merge feature into main
chronolock converge feature

# View the history
chronolock log

# Check status
chronolock status

# View stats
chronolock stats

# Pack objects
chronolock pack

# Push to a remote
mkdir -p /tmp/chronolock-remote-test
cd /tmp/chronolock-remote-test
chronolock init --bare
cd /tmp/chronolock-test
chronolock remote add origin /tmp/chronolock-remote-test
chronolock send origin main

# Verify with git at every step
GIT_DIR=.chronolock git log --oneline --graph
GIT_DIR=.chronolock git cat-file -p HEAD
```

### 35.2 — Git compatibility checklist

| Command | Git equivalent | Compatible? |
|---------|---------------|-------------|
| `chronolock init` | `git init` | ✓ HEAD, objects/, refs/ |
| `chronolock store` | `git hash-object -w` | ✓ Same blob format |
| `chronolock reveal` | `git cat-file -p` | ✓ Same object parsing |
| `chronolock anchor` | `git add . && git commit` | ✓ Same commit format |
| `chronolock log` | `git log` | ✓ Same parent chain |
| `chronolock branch` | `git branch` | ✓ Same ref files |
| `chronolock shift` | `git checkout` | ✓ Same HEAD update |
| `chronolock converge` | `git merge` | ✓ Same merge commits |
| `chronolock send` | `git push` | ✓ Same object transfer |

### 35.3 — What real git does differently

| Feature | Chronolock | Real git |
|---------|-----------|----------|
| Index format | Stage-on-commit | Binary index file with stat cache |
| Delta compression | Simple longest-match | Window-based with hash chains |
| Pack index | JSON | Binary fan-out table |
| Network protocol | Filesystem copy | Smart HTTP / SSH / git:// |
| Merge algorithm | Simple three-way | Recursive (handles criss-cross merges) |
| Reflog retention | Forever | 90 days (configurable) |
| Garbage collection | Manual pack | Auto-gc with reachability analysis |

These differences are engineering optimizations, not conceptual ones. The data model — content-addressed objects, trees, commits, refs — is identical.

> [!check] Checkpoint
> Run the full workflow. Verify git can read every object the Chronolock creates. Stage 35 complete.

---

## Act 5 Complete — The Archive

```mermaid
flowchart TD
    ST["Stats - measure the problem"]
    DL["Delta - compress similar objects"]
    PK["Pack - consolidate into one file"]
    BR["Bare repos - storage-only Chronolocks"]
    PU["Push - send to remote"]
    FE["Fetch - receive from remote"]
    FW["Full workflow - everything together"]
    ST --> DL --> PK
    BR --> PU
    BR --> FE
    PK --> PU
    PK --> FE
    PU --> FW
    FE --> FW
    style ST fill:#49a,stroke:#333
    style FW fill:#a4e,stroke:#333
```

---

## Course Complete — The Chronolock

You built a version control system from scratch. Not a toy — a working tool with git-compatible objects, branching, merging, and remote communication.

### What you built

| Component | What it does |
|-----------|-------------|
| Object store | Content-addressed blobs, trees, commits with SHA-1 hashing and zlib compression |
| Staging | Recursive directory scanning, tree building from the filesystem |
| Commit chain | Linked list of commits with parent pointers, HEAD tracking |
| Diff engine | Tree comparison, working directory diff, three-way merge diff |
| Branch system | Ref files, checkout with working directory reconstruction, safety checks |
| Merge engine | Merge base, fast-forward, three-way merge, conflict detection and resolution |
| Pack files | Object consolidation, delta compression, indexed lookup |
| Remote communication | Push/fetch with object negotiation, bare repositories |
| Safety systems | Dirty-checkout protection, reflog, merge state tracking |

### What you learned

| Rust Concept | Where |
|-------------|-------|
| Structs and enums | Object types, merge actions, diff entries, CLI commands |
| Ownership and borrowing | Object store (content moves into storage), tree building |
| `Option` and `Result` | Every I/O operation, parent chains, merge state |
| Pattern matching | Three-way diff (12+ arms), command dispatch, object type handling |
| `HashMap` and `HashSet` | Tree diffing, ancestor collection, object negotiation |
| Recursive functions | Tree flattening, directory scanning, reachable object collection |
| Byte manipulation | Tree binary format, pack files, SHA-1 hashing |
| External crates | sha1, flate2, clap, chrono, glob, colored, serde |
| Modules | 10+ modules with clear boundaries |
| Testing | Unit tests, integration tests, git compatibility verification |

### The deeper lesson

Git's genius isn't in any single algorithm. It's in the data model: **three object types, content-addressed by SHA-1, immutable once written.** From those constraints, everything else follows naturally — deduplication, integrity checking, branching, merging, distribution. The Chronolock taught you this by making you build each piece yourself, seeing how each decision enables the next.

The timeline is yours now. Use it well.
