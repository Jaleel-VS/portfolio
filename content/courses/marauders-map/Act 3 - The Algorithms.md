# Act 3: The Algorithms (Stages 15-22)

> *"I solemnly swear that I am up to no good."*

Welcome to the heart of the Marauder's Map. In Acts 1 and 2, you built a castle — walls, floors, doors, stairs, a viewport that follows the player. Beautiful. But the corridors are empty. The map is lifeless.

That changes now.

In this act, you'll bring Hogwarts to life by implementing three fundamental pathfinding algorithms — BFS, Dijkstra, and A* — each one motivated by an NPC that *needs* it. Mrs. Norris needs to scout nearby corridors. Snape needs the shortest route between his office and the potions classroom. Filch needs to chase you down.

These aren't toy examples. Pathfinding algorithms power Google Maps, network routing, robot navigation, game AI, and social network analysis. By the end of this act, you'll understand them deeply — not just how they work, but *why* each one exists and when to reach for which.

> [!info] Bridge Code: The `Map` Abstraction
> Acts 1-2 gave us `Floor` (a grid of tiles with rooms) and `HogwartsMap` (a collection of floors). The algorithms in this act need a thin abstraction layer on top — a `Map` type that provides `neighbors()` lookups and a `Position` type that includes floor information. These didn't exist before because we didn't need graph operations until now.
>
> Add these to your project before starting Stage 15:
>
> ```rust
> // src/position.rs
> #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
> pub struct Position {
>     pub x: usize,
>     pub y: usize,
>     pub floor: u8,
> }
>
> impl Position {
>     pub fn new(x: usize, y: usize, floor: u8) -> Self {
>         Self { x, y, floor }
>     }
> }
> ```
>
> ```rust
> // src/map.rs — add to your existing HogwartsMap
> pub type Map = HogwartsMap;
>
> impl Map {
>     /// Returns walkable neighbors of the given position.
>     pub fn neighbors(&self, pos: Position) -> Vec<Position> {
>         let floor = &self.floors[pos.floor as usize];
>         let directions: [(i32, i32); 4] = [(0, -1), (0, 1), (-1, 0), (1, 0)];
>         directions.iter().filter_map(|&(dx, dy)| {
>             let nx = pos.x as i32 + dx;
>             let ny = pos.y as i32 + dy;
>             if nx >= 0 && ny >= 0 {
>                 let (ux, uy) = (nx as usize, ny as usize);
>                 if floor.is_walkable(ux, uy) {
>                     return Some(Position::new(ux, uy, pos.floor));
>                 }
>             }
>             None
>         }).collect()
>     }
> }
> ```
>
> The `Floor::new_test` helper used in tests creates a floor filled with a given tile type:
>
> ```rust
> impl Floor {
>     pub fn new_test(width: usize, height: usize, fill: Tile) -> Self {
>         Floor {
>             id: 0,
>             name: "Test".to_string(),
>             grid: vec![vec![fill; width]; height],
>             rooms: Vec::new(),
>             stairs: Vec::new(),
>         }
>     }
> }
> ```
>
> The `Viewport::world_to_screen()` method used in debug visualizations converts a world `Position` to screen coordinates relative to the camera:
>
> ```rust
> impl Viewport {
>     pub fn world_to_screen(&self, pos: Position) -> Option<(usize, usize)> {
>         if pos.x >= self.x && pos.x < self.x + self.width
>             && pos.y >= self.y && pos.y < self.y + self.height {
>             Some((pos.x - self.x, pos.y - self.y))
>         } else {
>             None
>         }
>     }
> }
> ```
>
> With these in place, the algorithms in this act have a concrete foundation to build on.

**What you have from Acts 1-2:**
- Full map rendering with ratatui, viewport, multiple floors
- Player movement with WASD/arrows, collision detection
- Door opening, stairs transitions between floors
- Status bar with floor name, position, in-game time
- Game loop with configurable tick rate and crossterm event polling

**What you'll build in Act 3:**
- A graph abstraction over your tile grid
- BFS for area exploration (Mrs. Norris)
- Dijkstra for weighted shortest paths (Snape)
- A* for heuristic-guided pursuit (Filch)
- Debug visualizations that let you *watch* each algorithm think
- A showdown mode comparing all three side-by-side

Let's begin.

---

## Stage 15: The Graph

*Difficulty: Medium*

Before any NPC can patrol a corridor or chase you through the castle, they need to answer a fundamental question: "which tiles can I reach from here?" This stage builds the abstraction layer that every pathfinding algorithm in the game depends on. Without it, BFS, Dijkstra, and A* have nothing to search. The graph is the invisible skeleton beneath every intelligent movement in Hogwarts.

### Theory: Your Grid Is Already a Graph

Right now we have a 2D grid of tiles and a `is_walkable()` check, but no formal way to ask "given position X, what positions can I move to?" We need a `neighbors()` function — the single abstraction that turns a grid of tiles into a searchable graph.

Here's something that might surprise you: you've been working with a graph this entire time. Every tile on your map is a node. Every pair of adjacent walkable tiles shares an edge. You just haven't formalized it yet.

A **graph** is a collection of **nodes** (vertices) connected by **edges**. Graphs come in two flavors:

- **Explicit graphs** store nodes and edges in data structures (adjacency lists, adjacency matrices). Think social networks — you have a `HashMap<User, Vec<User>>` of friendships.
- **Implicit graphs** define edges through a function. Given a node, the function returns its neighbors. Your tile grid is an implicit graph — you don't store edges anywhere, you *compute* them.

Implicit graphs are memory-efficient and natural for grids. Instead of storing millions of edges for a 100x100 map, you write one `neighbors()` function.

> **Python comparison:** In Python, you'd often represent a graph as `dict[Node, list[Node]]` (explicit). In Rust, we'll use a function `fn neighbors(pos: Position) -> Vec<Position>` (implicit). Both work — Rust's approach is more cache-friendly for grid-based graphs because you avoid heap-allocated adjacency lists entirely.

### The Position Type

First, let's define a clean position type. You may already have coordinates as `(usize, usize)` tuples — let's promote them to a proper type:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Position {
    pub x: usize,
    pub y: usize,
    pub floor: u8,
}

impl Position {
    pub fn new(x: usize, y: usize, floor: u8) -> Self {
        Self { x, y, floor }
    }
}
```

We derive `Hash` and `Eq` because positions will be keys in `HashSet` (visited nodes) and `HashMap` (came-from maps for path reconstruction). This is critical — every pathfinding algorithm needs O(1) lookup for "have I visited this node?"

> **Why not just `(usize, usize)`?** You could. But `Position` is self-documenting, and adding `floor` lets us handle multi-floor pathfinding later. Named fields beat tuple indexing for readability: `pos.x` vs `pos.0`.

### The Walkable Check

Before we can find neighbors, we need to know which tiles are walkable:

```rust
impl Floor {
    /// Returns true if an NPC or player can stand on this tile.
    pub fn is_walkable(&self, x: usize, y: usize) -> bool {
        if x >= self.width || y >= self.height {
            return false;
        }
        matches!(
            self.grid[y][x],
            Tile::Floor
                | Tile::Door { locked: false, .. }
                | Tile::Stairs { .. }
                | Tile::Entrance { .. }
                | Tile::SecretPassage { discovered: true, .. }
        )
    }
}
```

The `matches!` macro is Rust's pattern-matching Swiss Army knife. In Python you'd write a chain of `isinstance()` checks or `if tile in (...)`. Rust's `matches!` is concise and exhaustive — the compiler warns you if you add a new `Tile` variant and forget to handle it.

Notice that locked doors and undiscovered secret passages are *not* walkable. This is intentional — NPCs shouldn't walk through locked doors (though ghosts will ignore walls entirely, which we'll handle separately).

### The Neighbors Function

Now the core abstraction — given a position, what positions can you move to?

```rust
/// The four cardinal directions: up, down, left, right.
const DIRECTIONS: [(i32, i32); 4] = [(0, -1), (0, 1), (-1, 0), (1, 0)];

impl Floor {
    /// Returns walkable neighbors of the given position on this floor.
    pub fn neighbors(&self, pos: Position) -> Vec<Position> {
        DIRECTIONS
            .iter()
            .filter_map(|&(dx, dy)| {
                let nx = pos.x as i32 + dx;
                let ny = pos.y as i32 + dy;
                if nx >= 0 && ny >= 0 {
                    let (ux, uy) = (nx as usize, ny as usize);
                    if self.is_walkable(ux, uy) {
                        return Some(Position::new(ux, uy, pos.floor));
                    }
                }
                None
            })
            .collect()
    }
}
```

Let's unpack the Rust-specific patterns here:

- **`filter_map`** combines `filter` and `map` — it applies a function that returns `Option<T>`, keeping only the `Some` values. In Python, you'd use a list comprehension with a condition: `[pos for dx, dy in dirs if (pos := check(dx, dy)) is not None]`. Rust's `filter_map` is the idiomatic equivalent.

- **`i32` arithmetic for bounds checking** — we cast to `i32` to handle negative results from subtraction (e.g., `0 + (-1) = -1`). The alternative is checking `pos.x > 0` before subtracting, but the cast approach is cleaner when you have multiple directions.

- **Why `Vec<Position>` and not an iterator?** For simplicity. In a production codebase, you'd return `impl Iterator<Item = Position>` to avoid the allocation. For learning, `Vec` is clearer. We'll optimize later if profiling shows it matters.

### Cross-Floor Neighbors (Stairs)

Stairs connect floors. When an NPC stands on a stair tile, they can move to the destination floor:

```rust
impl Map {
    /// Returns neighbors including cross-floor stair connections.
    pub fn neighbors(&self, pos: Position) -> Vec<Position> {
        let floor = &self.floors[pos.floor as usize];
        let mut result = floor.neighbors(pos);

        // Check if current tile is stairs — add the destination as a neighbor
        if let Tile::Stairs {
            destination_floor,
            destination_pos,
        } = &floor.grid[pos.y][pos.x]
        {
            let (dx, dy) = *destination_pos;
            result.push(Position::new(dx, dy, *destination_floor));
        }

        result
    }
}
```

This is the power of the implicit graph approach. Adding cross-floor edges is just another case in the neighbor function — no data structure changes needed.

### Complexity Analysis

| Operation | Time | Space |
|-----------|------|-------|
| `is_walkable(x, y)` | O(1) | O(1) |
| `neighbors(pos)` | O(1) — at most 4+1 checks | O(1) — at most 5 results |
| Storing the graph | O(0) extra — it's implicit | O(W*H) for the grid itself |

Compare this to an explicit adjacency list, which would need O(W*H) extra space for edges. The implicit approach wins for grids.

### Real-World Applications

Implicit graphs appear everywhere:
- **Puzzle solvers** (Rubik's cube, sliding puzzles) — states are nodes, moves are edges
- **Compiler optimization** — basic blocks are nodes, control flow is edges
- **Chess engines** — board states are nodes, legal moves are edges
- **Network routing** — routers are nodes, links are edges (though often stored explicitly)

> [!check] Checkpoint
> The graph abstraction is ready — `neighbors()` turns any position into its reachable neighbors, and the implicit graph costs zero extra memory. Now we have something to *search*. In Stage 16, Mrs. Norris will use Breadth-First Search to scout every corridor within her detection radius, expanding outward like ripples in a pond.
>
> Your project should now have:
>
> ```
> src/
> ├── map.rs          // Floor, Map, Tile (from Act 1)
> ├── position.rs     // Position type (new)
> ├── graph.rs        // neighbors(), is_walkable() (new)
> ├── player.rs       // Player movement (from Act 2)
> ├── render.rs       // Rendering (from Act 1-2)
> └── main.rs         // Game loop (from Act 1-2)
> ```
>
> Test your graph abstraction:
>
> ```rust
> #[cfg(test)]
> mod tests {
>     use super::*;
>
>     #[test]
>     fn test_neighbors_open_corridor() {
>         // Create a 3x3 floor: all Floor tiles
>         let floor = Floor::new_test(3, 3, Tile::Floor);
>         let pos = Position::new(1, 1, 0);
>         let neighbors = floor.neighbors(pos);
>         assert_eq!(neighbors.len(), 4); // center has 4 neighbors
>     }
>
>     #[test]
>     fn test_neighbors_corner() {
>         let floor = Floor::new_test(3, 3, Tile::Floor);
>         let pos = Position::new(0, 0, 0);
>         let neighbors = floor.neighbors(pos);
>         assert_eq!(neighbors.len(), 2); // corner has 2 neighbors
>     }
>
>     #[test]
>     fn test_neighbors_wall_blocks() {
>         let mut floor = Floor::new_test(3, 3, Tile::Floor);
>         floor.grid[0][1] = Tile::Wall; // block the tile above center
>         let pos = Position::new(1, 1, 0);
>         let neighbors = floor.neighbors(pos);
>         assert_eq!(neighbors.len(), 3); // wall blocks one direction
>     }
> }
> ```
>
> The graph is ready. Time to search it.

---

## Stage 16: Breadth-First Search (BFS)

*Difficulty: Hard*

BFS is the first real algorithm in our arsenal, and it exists because Mrs. Norris doesn't chase — she *explores*. She needs to check every nook and cranny within a radius, expanding outward in concentric rings. BFS is the simplest correct way to do this, and understanding it deeply is the foundation for Dijkstra and A* that follow. Every pathfinding algorithm in this act is a variation on the theme BFS introduces here.

### The Story: Mrs. Norris Scouts the Corridors

Mrs. Norris is Filch's cat — his eyes and ears in the castle. She doesn't chase students directly. Instead, she *explores*. She wanders the corridors near Filch, checking every nook and cranny within a certain radius. If she spots you, she alerts Filch, who then gives chase.

This is a perfect use case for **Breadth-First Search**: explore all tiles within N steps of a starting position, expanding outward in concentric rings. BFS doesn't care about finding the shortest path to a *specific* target — it systematically explores *everything* reachable, layer by layer.

### Theory: How BFS Works

Imagine you drop a stone into a pond. Ripples expand outward in concentric circles — first the tiles 1 step away, then 2 steps, then 3. BFS works exactly like this.

The algorithm uses a **queue** (first-in, first-out). Here's the mental model:

1. **Start**: Put the starting position in the queue. Mark it as visited.
2. **Loop**: Take the *front* of the queue (the oldest item). Look at all its neighbors. For each unvisited neighbor, mark it visited and add it to the *back* of the queue.
3. **Stop**: When the queue is empty (explored everything reachable) or you've found what you're looking for.

The key insight is the **queue discipline**. Because you process nodes in the order they were discovered, you always finish exploring distance-1 nodes before starting distance-2 nodes. This guarantees that the first time you reach any node, you've found the shortest path to it (in terms of number of steps).

Think of it as a **search party** fanning out from a point. The searchers at the front of the line explore first, and new searchers join at the back. Nobody skips ahead.

```
Step 0:  . . . . .     Step 1:  . . . . .     Step 2:  . . . . .
         . . . . .              . . 1 . .              . 2 1 2 .
         . . S . .              . 1 S 1 .              2 1 S 1 2
         . . . . .              . . 1 . .              . 2 1 2 .
         . . . . .              . . . . .              . . 2 . .

S = start, numbers = distance from start
```

### Complexity Analysis

| Metric | BFS |
|--------|-----|
| **Time** | O(V + E) where V = vertices, E = edges |
| **Space** | O(V) for the queue + visited set |
| **Optimal?** | Yes — for unweighted graphs (all edges cost 1) |
| **Complete?** | Yes — finds a path if one exists |

For our grid: V = W*H (width * height), E ≈ 4*V (each tile has at most 4 edges). So BFS on a 100x80 grid visits at most 8,000 nodes and checks ~32,000 edges. Trivial for modern hardware.

> **When BFS fails:** BFS treats all edges as equal cost. If walking through a corridor costs 1 but climbing stairs costs 3, BFS doesn't know — it'll happily take a 10-stair path over a 4-corridor path because 10 < 4 in step count. That's why we'll need Dijkstra later.

### Implementation: BFS in Rust

Here's where Rust's standard library shines. The `VecDeque` type is a double-ended queue backed by a ring buffer — perfect for BFS.

> **Python comparison:** In Python, you'd use `collections.deque` for O(1) popleft. Using a regular `list` with `pop(0)` is O(n) — a classic performance trap. Rust's `VecDeque::pop_front()` is O(1), same as Python's `deque.popleft()`.

```rust
use std::collections::{HashMap, HashSet, VecDeque};

/// Result of a BFS exploration: all reachable positions and how to reach them.
pub struct BfsResult {
    /// Maps each visited position to the position we came from.
    /// The start position maps to itself.
    pub came_from: HashMap<Position, Position>,
    /// Positions in the order they were visited (for visualization).
    pub visit_order: Vec<Position>,
}

/// Explore all reachable tiles from `start` using breadth-first search.
/// If `max_depth` is Some(n), only explore tiles within n steps.
pub fn bfs(map: &Map, start: Position, max_depth: Option<usize>) -> BfsResult {
    let mut queue: VecDeque<(Position, usize)> = VecDeque::new();
    let mut came_from: HashMap<Position, Position> = HashMap::new();
    let mut visit_order: Vec<Position> = Vec::new();

    queue.push_back((start, 0));
    came_from.insert(start, start);

    while let Some((current, depth)) = queue.pop_front() {
        visit_order.push(current);

        // Respect depth limit (Mrs. Norris only scouts N tiles out)
        if let Some(max) = max_depth {
            if depth >= max {
                continue;
            }
        }

        for neighbor in map.neighbors(current) {
            // Only visit each position once — the HashSet check
            if !came_from.contains_key(&neighbor) {
                came_from.insert(neighbor, current);
                queue.push_back((neighbor, depth + 1));
            }
        }
    }

    BfsResult {
        came_from,
        visit_order,
    }
}
```

Let's dissect the critical Rust patterns:

**`while let Some((current, depth)) = queue.pop_front()`** — This is Rust's idiomatic "drain the queue" loop. `pop_front()` returns `Option<T>` — `Some(item)` if the queue has elements, `None` when empty. The `while let` destructures and loops in one line. In Python: `while queue: current, depth = queue.popleft()`.

**`came_from` as both visited set AND path tracker** — This is a common optimization. Instead of a separate `HashSet<Position>` for visited nodes, we use the `came_from` HashMap. If a position is a key in `came_from`, it's been visited. This saves memory and gives us path reconstruction for free.

**Why `HashMap` and not `HashSet`?** A `HashSet` only tells you "was this visited?" A `HashMap<Position, Position>` tells you "was this visited, and *how did we get here?*" The value is the predecessor — the position we came from. This lets us reconstruct the full path by walking backwards from any destination to the start.

### Path Reconstruction

Once BFS completes, we can reconstruct the path from start to any visited position:

```rust
/// Reconstruct the path from start to goal using the came_from map.
/// Returns None if the goal was never reached.
pub fn reconstruct_path(
    came_from: &HashMap<Position, Position>,
    start: Position,
    goal: Position,
) -> Option<Vec<Position>> {
    if !came_from.contains_key(&goal) {
        return None; // Goal not reachable
    }

    let mut path = Vec::new();
    let mut current = goal;

    while current != start {
        path.push(current);
        current = came_from[&current];
    }
    path.push(start);
    path.reverse();

    Some(path)
}
```

This is the same reconstruction algorithm used by Dijkstra and A* — we'll reuse it. The path is built backwards (goal → start) then reversed. In Python you'd do the same with `path.append()` then `path.reverse()` (or `path[::-1]`).

### Mrs. Norris: The BFS NPC

Now let's wire BFS into an actual NPC. Mrs. Norris scouts within a radius, and if the player is within that radius, she alerts Filch:

```rust
pub struct MrsNorris {
    pub pos: Position,
    pub detection_radius: usize, // How far she scouts (in tiles)
    pub alert: bool,             // Has she spotted the player?
    pub last_known_player_pos: Option<Position>,
}

impl MrsNorris {
    pub fn new(pos: Position) -> Self {
        Self {
            pos,
            detection_radius: 8,
            alert: false,
            last_known_player_pos: None,
        }
    }

    /// Scout nearby tiles. If the player is within detection radius, alert!
    pub fn scout(&mut self, map: &Map, player_pos: Position) {
        let result = bfs(map, self.pos, Some(self.detection_radius));

        if result.came_from.contains_key(&player_pos) {
            self.alert = true;
            self.last_known_player_pos = Some(player_pos);
        } else {
            self.alert = false;
        }
    }

    /// Move Mrs. Norris one step along a random explored path.
    pub fn wander(&mut self, map: &Map) {
        let neighbors = map.neighbors(self.pos);
        if !neighbors.is_empty() {
            // Pick a random neighbor (we'll use rand crate)
            let idx = rand::random::<usize>() % neighbors.len();
            self.pos = neighbors[idx];
        }
    }
}
```

Every few ticks, Mrs. Norris runs `scout()` — a BFS from her position with a depth limit. If the player falls within the explored area, she sets `alert = true` and records the player's last known position. Filch (who we'll implement with A* in Stage 20) will use that position as his chase target.

> [!warning] Common Mistakes
> 1. **Forgetting the visited set.** Without it, BFS loops forever on cycles. In a grid, tile A has neighbor B, and B has neighbor A — infinite loop. The `came_from` map prevents revisiting.
>
> 2. **Using a `Vec` as a queue.** `Vec::remove(0)` is O(n) because it shifts all elements. Use `VecDeque` for O(1) front removal. This is the #1 BFS performance bug in every language.
>
> 3. **Checking visited on enqueue vs dequeue.** We check `!came_from.contains_key(&neighbor)` *before* enqueueing. Some implementations check on dequeue instead — this works but wastes memory by allowing duplicates in the queue. Check on enqueue.
>
> 4. **Off-by-one in depth limit.** If `max_depth` is 3, should we explore tiles at distance 3 or stop before them? Our implementation explores distance 3 but doesn't expand from those tiles (the `continue` skips neighbor expansion). Be explicit about what "within N steps" means.

### Real-World BFS Applications

- **Social networks:** "Find all people within 2 degrees of connection" — LinkedIn's connection suggestions
- **Web crawlers:** Explore pages breadth-first to find content close to seed URLs first
- **Garbage collection:** Mark-and-sweep GC uses BFS/DFS to find reachable objects
- **Network broadcasting:** Flooding protocols spread messages BFS-style through network nodes
- **Shortest path in unweighted graphs:** GPS routing on road networks where all roads have equal travel time (rare, but BFS is the foundation)

> [!check] Checkpoint
> Test BFS thoroughly:
>
> ```rust
> #[cfg(test)]
> mod tests {
>     use super::*;
>
>     fn make_corridor_map() -> Map {
>         // 5x1 corridor: [Floor, Floor, Floor, Floor, Floor]
>         Map::from_tiles(5, 1, vec![vec![Tile::Floor; 5]])
>     }
>
>     #[test]
>     fn test_bfs_explores_all_reachable() {
>         let map = make_corridor_map();
>         let result = bfs(&map, Position::new(0, 0, 0), None);
>         assert_eq!(result.came_from.len(), 5);
>     }
>
>     #[test]
>     fn test_bfs_respects_depth_limit() {
>         let map = make_corridor_map();
>         let result = bfs(&map, Position::new(0, 0, 0), Some(2));
>         // Start (depth 0) + 1 neighbor (depth 1) + 1 neighbor (depth 2) = 3
>         assert_eq!(result.came_from.len(), 3);
>     }
>
>     #[test]
>     fn test_bfs_path_reconstruction() {
>         let map = make_corridor_map();
>         let result = bfs(&map, Position::new(0, 0, 0), None);
>         let path = reconstruct_path(
>             &result.came_from,
>             Position::new(0, 0, 0),
>             Position::new(4, 0, 0),
>         );
>         assert_eq!(path.unwrap().len(), 5); // 0 -> 1 -> 2 -> 3 -> 4
>     }
>
>     #[test]
>     fn test_bfs_wall_blocks_path() {
>         // [Floor, Wall, Floor] — position 2 unreachable from 0
>         let map = Map::from_tiles(3, 1, vec![vec![
>             Tile::Floor, Tile::Wall, Tile::Floor,
>         ]]);
>         let result = bfs(&map, Position::new(0, 0, 0), None);
>         assert!(!result.came_from.contains_key(&Position::new(2, 0, 0)));
>     }
> }
> ```
>
> Mrs. Norris is prowling. But she explores blindly — every step costs the same. Before we tackle weighted paths with Dijkstra, let's first *see* BFS in action — Stage 17 adds a debug visualization that makes the algorithm's ripple-like expansion visible in real-time. What happens when some paths are more expensive than others?

---

## Stage 17: BFS Visualization

*Difficulty: Medium*

Algorithms are invisible by default — you call a function, get a result, and trust it worked. But *seeing* an algorithm think is transformative for understanding. This stage exists because watching BFS expand outward, tile by tile, in concentric cyan ripples will teach you more about how it works than any textbook explanation. It also builds the debug visualization framework we'll reuse for Dijkstra and A*.

### The Story: Seeing the Search Party

Algorithms are invisible by default. You call `bfs()`, get a result, done. But *seeing* an algorithm work is transformative for understanding. In this stage, we add a debug mode that visualizes BFS exploration in real-time — watch the "ripples" expand outward from Mrs. Norris, tile by tile.

Press `[d]` to toggle debug mode. When active, the map overlay shows:
- **Cyan tiles** — explored by BFS (fading from bright to dark based on discovery order)
- **Yellow tiles** — currently in the queue (the frontier)
- **Green line** — the reconstructed path (if a target was found)

### Storing Visualization State

We need to capture the BFS execution step-by-step, not just the final result. Add a visualization struct:

```rust
/// A single step in the BFS visualization.
#[derive(Clone)]
pub struct BfsStep {
    pub explored: Vec<Position>,   // All positions explored so far
    pub frontier: Vec<Position>,   // Positions currently in the queue
    pub current: Position,         // The node being expanded right now
}

/// Run BFS and record every step for visualization.
pub fn bfs_visualized(
    map: &Map,
    start: Position,
    max_depth: Option<usize>,
) -> Vec<BfsStep> {
    let mut steps: Vec<BfsStep> = Vec::new();
    let mut queue: VecDeque<(Position, usize)> = VecDeque::new();
    let mut visited: HashSet<Position> = HashSet::new();

    queue.push_back((start, 0));
    visited.insert(start);

    while let Some((current, depth)) = queue.pop_front() {
        // Snapshot the current state
        let frontier: Vec<Position> = queue.iter().map(|(p, _)| *p).collect();
        let explored: Vec<Position> = visited.iter().copied().collect();
        steps.push(BfsStep {
            explored,
            frontier,
            current,
        });

        if let Some(max) = max_depth {
            if depth >= max {
                continue;
            }
        }

        for neighbor in map.neighbors(current) {
            if visited.insert(neighbor) {
                queue.push_back((neighbor, depth + 1));
            }
        }
    }

    steps
}
```

Note the `visited.insert(neighbor)` trick — `HashSet::insert` returns `true` if the value was newly inserted, `false` if it was already present. This replaces the `if !visited.contains(&neighbor) { visited.insert(neighbor); }` two-step pattern. Idiomatic Rust.

### Debug Mode Toggle

Add a debug state to your game:

```rust
pub struct DebugState {
    pub active: bool,
    pub bfs_steps: Vec<BfsStep>,
    pub current_step: usize,
    pub step_timer: u32,       // Ticks until next step
    pub ticks_per_step: u32,   // How fast to animate (lower = faster)
}

impl DebugState {
    pub fn new() -> Self {
        Self {
            active: false,
            bfs_steps: Vec::new(),
            current_step: 0,
            step_timer: 0,
            ticks_per_step: 2, // Show a new BFS step every 2 game ticks
        }
    }

    pub fn toggle(&mut self, map: &Map, npc_pos: Position) {
        self.active = !self.active;
        if self.active {
            self.bfs_steps = bfs_visualized(map, npc_pos, Some(12));
            self.current_step = 0;
            self.step_timer = 0;
        }
    }

    pub fn tick(&mut self) {
        if !self.active || self.bfs_steps.is_empty() {
            return;
        }
        self.step_timer += 1;
        if self.step_timer >= self.ticks_per_step {
            self.step_timer = 0;
            if self.current_step < self.bfs_steps.len() - 1 {
                self.current_step += 1;
            }
        }
    }
}
```

### Rendering the Overlay

In your render function, after drawing the map tiles but before drawing NPCs, overlay the debug visualization. We use `Buffer::set_style` to color explored tiles without changing their character:

```rust
use ratatui::style::{Color, Style, Modifier};
use ratatui::buffer::Buffer;
use ratatui::layout::Rect;

fn render_bfs_debug(
    debug: &DebugState,
    buf: &mut Buffer,
    viewport: &Viewport,
    area: Rect,
) {
    if !debug.active || debug.bfs_steps.is_empty() {
        return;
    }

    let step = &debug.bfs_steps[debug.current_step];

    // Color explored tiles — gradient from bright to dim cyan
    let total = step.explored.len().max(1);
    for (i, pos) in step.explored.iter().enumerate() {
        if let Some((sx, sy)) = viewport.world_to_screen(*pos) {
            let screen_x = area.x + sx as u16;
            let screen_y = area.y + sy as u16;
            if screen_x < area.right() && screen_y < area.bottom() {
                // Fade from bright cyan (early) to dark cyan (late)
                let brightness = 255 - ((i * 180) / total) as u8;
                let style = Style::default()
                    .bg(Color::Rgb(0, brightness / 3, brightness));
                buf.set_style(
                    Rect::new(screen_x, screen_y, 1, 1),
                    style,
                );
            }
        }
    }

    // Highlight the frontier (queue) in yellow
    for pos in &step.frontier {
        if let Some((sx, sy)) = viewport.world_to_screen(*pos) {
            let screen_x = area.x + sx as u16;
            let screen_y = area.y + sy as u16;
            if screen_x < area.right() && screen_y < area.bottom() {
                let style = Style::default()
                    .bg(Color::Rgb(180, 180, 0));
                buf.set_style(
                    Rect::new(screen_x, screen_y, 1, 1),
                    style,
                );
            }
        }
    }

    // Highlight the current node in bright white
    if let Some((sx, sy)) = viewport.world_to_screen(step.current) {
        let screen_x = area.x + sx as u16;
        let screen_y = area.y + sy as u16;
        if screen_x < area.right() && screen_y < area.bottom() {
            let style = Style::default()
                .bg(Color::White)
                .add_modifier(Modifier::BOLD);
            buf.set_style(
                Rect::new(screen_x, screen_y, 1, 1),
                style,
            );
        }
    }
}
```

We use `Color::Rgb(r, g, b)` for smooth gradients. The `Buffer::set_style` method applies a style to a rectangular area — here, a 1x1 rect for each tile. This overlays color on top of whatever character is already rendered (wall symbols, floor dots, etc.), so the map structure remains visible underneath the debug coloring.

### The Status Line

Show BFS stats in the status bar during debug mode:

```rust
fn debug_status_text(debug: &DebugState) -> String {
    if !debug.active || debug.bfs_steps.is_empty() {
        return String::new();
    }
    let step = &debug.bfs_steps[debug.current_step];
    format!(
        "[DEBUG] BFS step {}/{} | Explored: {} | Frontier: {}",
        debug.current_step + 1,
        debug.bfs_steps.len(),
        step.explored.len(),
        step.frontier.len(),
    )
}
```

### What You Should See

When you press `[d]`, the map comes alive with color. Starting from Mrs. Norris's position, cyan tiles ripple outward — first the 4 adjacent tiles, then the next ring of 8-12 tiles, then the next. The yellow frontier shows the "edge" of exploration. You can *see* BFS expanding in concentric layers.

Watch what happens when the ripple hits a wall — it flows around it, like water around a rock. Dead-end corridors fill up and stop. Open rooms flood quickly. This is BFS.

> [!check] Checkpoint
> Wire the `[d]` key into your event handler:
>
> ```rust
> KeyCode::Char('d') => {
>     game.debug.toggle(&game.map, game.mrs_norris.pos);
> }
> ```
>
> And call `game.debug.tick()` in your game loop's update phase. The visualization should animate smoothly at your configured `ticks_per_step` rate.
>
> You now have a visual understanding of BFS — watch the concentric ripples expand, flow around walls, and fill dead ends. But BFS treats every step as equal cost. What happens when stairs cost 3 and corridors cost 1? Dijkstra's algorithm enters the scene next, and Snape gets the shortest *weighted* path to his classroom.

---

## Stage 18: Dijkstra's Algorithm

*Difficulty: Hard*

BFS assumes every step costs the same — but Hogwarts doesn't work that way. Climbing a spiral staircase is slower than walking a corridor. Opening a heavy oak door takes longer than striding through an archway. Dijkstra's algorithm is BFS's sophisticated cousin: it finds the cheapest path, not just the shortest one. This is the algorithm that powers GPS navigation, network routing, and Snape's efficient glide between his office and the Potions classroom.

### The Story: Snape Takes the Shortest Path

Professor Snape moves with purpose. When the clock strikes 8 AM, he leaves his office in the dungeons and heads to the Potions classroom. He doesn't wander — he takes the *shortest* path. But "shortest" isn't just about counting tiles.

Consider two routes from Snape's office to the Potions classroom:
- **Route A:** 15 corridor tiles (cost: 15)
- **Route B:** 8 corridor tiles + 2 staircase transitions (cost: 8 + 2*3 = 14)

Route B is fewer tiles but involves stairs. In our game, stairs cost 3 (they're slow — narrow, spiral staircases) while corridors cost 1. Route B is actually cheaper despite being "longer" in tile count.

BFS would choose Route A (fewer steps). Dijkstra chooses Route B (lower total cost). This is why Dijkstra exists — **weighted shortest paths**.

### Theory: How Dijkstra Works

Dijkstra's algorithm is BFS's sophisticated cousin. Instead of a FIFO queue (process in discovery order), it uses a **priority queue** (process in cost order). Always expand the cheapest unexplored node first.

The intuition: imagine you're filling the map with water, but some tiles are "thicker" (stairs, crowded areas) and water flows through them more slowly. The water reaches nearby easy tiles first, then gradually seeps through expensive tiles. The first time water reaches any tile, that's the cheapest path to it.

Here's the algorithm:

1. **Start**: Put the starting position in the priority queue with cost 0. Set all other costs to infinity.
2. **Loop**: Pop the node with the *lowest cost* from the priority queue. For each neighbor, calculate the cost to reach it through the current node. If this cost is lower than the previously known cost, update it and add the neighbor to the queue.
3. **Stop**: When you pop the goal from the queue (found shortest path) or the queue is empty (goal unreachable).

The critical difference from BFS: BFS processes nodes in *discovery order* (FIFO). Dijkstra processes nodes in *cost order* (priority queue). This means Dijkstra might explore a node at distance 10 before a node at distance 3, if the distance-3 node is behind expensive terrain.

```
BFS thinks:    "I found it in 5 steps, that must be shortest!"
Dijkstra says: "I found it in 5 steps costing 11, but let me check
                if there's a 7-step path costing 9..."
```

### Complexity Analysis

| Metric | Dijkstra |
|--------|----------|
| **Time** | O((V + E) log V) with a binary heap |
| **Space** | O(V) for the priority queue + distance map |
| **Optimal?** | Yes — for non-negative edge weights |
| **Complete?** | Yes — finds a path if one exists |

The `log V` factor comes from the priority queue operations (push and pop are O(log n) for a binary heap). For our grid: V = W*H, E ≈ 4V, so Dijkstra on a 100x80 grid does roughly 8,000 * log(8,000) ≈ 104,000 operations. Still fast.

> **Critical requirement:** Dijkstra only works with **non-negative** edge weights. If an edge has negative cost (e.g., a healing tile that reduces your travel cost), Dijkstra breaks. You'd need Bellman-Ford instead. In our game, all costs are positive, so we're safe.

### Edge Weights in Hogwarts

Define the cost of moving between tiles:

```rust
/// Cost of moving from one tile to an adjacent tile.
pub fn edge_cost(map: &Map, from: Position, to: Position) -> u32 {
    // Cross-floor movement (stairs) is expensive
    if from.floor != to.floor {
        return 3;
    }

    let tile = &map.floors[to.floor as usize].grid[to.y][to.x];
    match tile {
        Tile::Stairs { .. } => 3,       // Stairs are slow
        Tile::Door { .. } => 2,         // Doors slow you down (opening)
        Tile::Floor => 1,               // Normal corridor
        Tile::Entrance { .. } => 1,     // Room entrances are normal
        Tile::SecretPassage { .. } => 1, // Secret passages are fast (hidden but direct)
        Tile::Wall => u32::MAX,         // Should never happen (not walkable)
    }
}
```

### The BinaryHeap Problem: Rust's Max-Heap

Here's where Rust throws a curveball. `std::collections::BinaryHeap` is a **max-heap** — it pops the *largest* element first. Dijkstra needs a **min-heap** — pop the *smallest* cost first.

> **Python comparison:** Python's `heapq` is a min-heap by default — `heapq.heappush(heap, (cost, node))` just works. Rust gives you a max-heap and says "figure it out."

The solution: wrap your cost in `std::cmp::Reverse`. This flips the ordering so the smallest value has the highest priority:

```rust
use std::cmp::Reverse;
use std::collections::BinaryHeap;

// Without Reverse: BinaryHeap pops largest first
// With Reverse:    BinaryHeap pops smallest first (what we want)

let mut heap: BinaryHeap<Reverse<(u32, Position)>> = BinaryHeap::new();
heap.push(Reverse((0, start)));  // Cost 0 to reach start

// Pop returns Reverse((cost, pos)) — unwrap with pattern matching
if let Some(Reverse((cost, pos))) = heap.pop() {
    // `cost` is the lowest cost in the heap
}
```

Why does `Reverse` work? `BinaryHeap` uses the `Ord` trait to compare elements. `Reverse<T>` implements `Ord` by flipping the comparison: `Reverse(3) < Reverse(1)` because `3 > 1`. So the heap thinks the smallest cost is the "largest" and pops it first.

But there's another subtlety: `Position` doesn't implement `Ord` (and shouldn't — there's no natural ordering for 2D positions). We need `Ord` for the tuple `(u32, Position)` to work in the heap. The fix: derive `Ord` on `Position` or use a wrapper:

```rust
/// Wrapper for Dijkstra's priority queue.
/// We only compare by cost — position is just cargo.
#[derive(Debug, Clone, Eq, PartialEq)]
struct DijkstraEntry {
    cost: u32,
    pos: Position,
}

impl Ord for DijkstraEntry {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        // Reverse ordering for min-heap behavior
        other.cost.cmp(&self.cost)
    }
}

impl PartialOrd for DijkstraEntry {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}
```

By implementing `Ord` with reversed comparison (`other.cost.cmp(&self.cost)` instead of `self.cost.cmp(&other.cost)`), we bake the min-heap behavior directly into the type. Now `BinaryHeap<DijkstraEntry>` is a min-heap without needing `Reverse`. This is cleaner for complex entries.

### Implementation: Dijkstra in Rust

```rust
use std::collections::{BinaryHeap, HashMap};

pub struct DijkstraResult {
    pub came_from: HashMap<Position, Position>,
    pub cost_so_far: HashMap<Position, u32>,
    pub visit_order: Vec<Position>,
}

pub fn dijkstra(
    map: &Map,
    start: Position,
    goal: Option<Position>,
) -> DijkstraResult {
    let mut heap: BinaryHeap<DijkstraEntry> = BinaryHeap::new();
    let mut came_from: HashMap<Position, Position> = HashMap::new();
    let mut cost_so_far: HashMap<Position, u32> = HashMap::new();
    let mut visit_order: Vec<Position> = Vec::new();

    heap.push(DijkstraEntry { cost: 0, pos: start });
    came_from.insert(start, start);
    cost_so_far.insert(start, 0);

    while let Some(DijkstraEntry { cost, pos: current }) = heap.pop() {
        // Early exit if we reached the goal
        if let Some(g) = goal {
            if current == g {
                break;
            }
        }

        // Skip if we've already found a cheaper path to this node.
        // This happens because we can't decrease-key in BinaryHeap,
        // so we push duplicates and skip stale entries here.
        if cost > cost_so_far[&current] {
            continue;
        }

        visit_order.push(current);

        for neighbor in map.neighbors(current) {
            let new_cost = cost + edge_cost(map, current, neighbor);

            if !cost_so_far.contains_key(&neighbor)
                || new_cost < cost_so_far[&neighbor]
            {
                cost_so_far.insert(neighbor, new_cost);
                came_from.insert(neighbor, current);
                heap.push(DijkstraEntry {
                    cost: new_cost,
                    pos: neighbor,
                });
            }
        }
    }

    DijkstraResult {
        came_from,
        cost_so_far,
        visit_order,
    }
}
```

### The "Stale Entry" Pattern — Critical to Understand

The most subtle part of this implementation is the stale entry check:

```rust
if cost > cost_so_far[&current] {
    continue;
}
```

Why is this needed? Because Rust's `BinaryHeap` doesn't support **decrease-key** — you can't update the priority of an element already in the heap. Instead, when we find a cheaper path to a node, we push a *new* entry with the lower cost. The old, more expensive entry is still in the heap.

When we eventually pop that old entry, its cost will be higher than the cost we've already recorded in `cost_so_far`. We detect this and skip it. This is called the "lazy deletion" pattern.

> **Python comparison:** Python's `heapq` has the same limitation — no decrease-key. The same lazy deletion pattern is used. Some implementations use a `visited` set instead, but the cost check is more general.

The alternative is using a data structure that supports decrease-key (like a Fibonacci heap), but that's overkill for our use case. The lazy deletion approach adds at most O(E) extra entries to the heap, which is fine.

### Snape: The Dijkstra NPC

Snape follows a schedule. At each schedule transition, he computes the shortest weighted path to his destination:

```rust
pub struct Snape {
    pub pos: Position,
    pub current_path: Vec<Position>,
    pub path_index: usize,
    pub state: NpcState,
}

#[derive(Debug, Clone, PartialEq)]
pub enum NpcState {
    Idle,
    Patrol,
    Alert,
    Chase,
    Return,
}

impl Snape {
    /// Compute shortest path to destination and start walking.
    pub fn navigate_to(&mut self, map: &Map, destination: Position) {
        let result = dijkstra(map, self.pos, Some(destination));
        if let Some(path) = reconstruct_path(
            &result.came_from,
            self.pos,
            destination,
        ) {
            self.current_path = path;
            self.path_index = 0;
            self.state = NpcState::Patrol;
        }
    }

    /// Move one step along the precomputed path.
    pub fn step(&mut self) {
        if self.path_index + 1 < self.current_path.len() {
            self.path_index += 1;
            self.pos = self.current_path[self.path_index];
        } else {
            self.state = NpcState::Idle;
        }
    }
}
```

Snape computes his path once when his schedule changes, then follows it step by step. He doesn't recompute every tick — that would be wasteful. He only recomputes if something blocks his path (a locked door, the player in the way) or when his schedule changes.

> [!warning] Common Mistakes
> 1. **Using BinaryHeap without Reverse or custom Ord.** Rust's BinaryHeap is a max-heap. If you push `(cost, pos)` directly, you'll pop the *most expensive* node first — the exact opposite of what Dijkstra needs. Your algorithm will still terminate but explore nodes in the wrong order, potentially giving suboptimal paths.
>
> 2. **Forgetting the stale entry check.** Without `if cost > cost_so_far[&current] { continue; }`, you'll process nodes multiple times with outdated costs. The algorithm still works but does redundant work — O(E log E) instead of O((V+E) log V).
>
> 3. **Negative edge weights.** If any edge has negative cost, Dijkstra can miss shorter paths. It assumes "once I've popped a node, I've found the cheapest path to it." Negative edges violate this assumption.
>
> 4. **Not using early exit.** If you have a specific goal, break when you pop it from the heap. Without early exit, Dijkstra explores the entire reachable graph — correct but slow when you only need one path.

### Real-World Dijkstra Applications

- **GPS navigation:** Google Maps, Waze — find shortest route considering road speeds, traffic, tolls
- **Network routing:** OSPF (Open Shortest Path First) protocol uses Dijkstra to route internet packets
- **Airline routing:** Find cheapest flight path considering layover costs, fuel, and time
- **Robotics:** Path planning for robots navigating terrain with varying difficulty (mud, gravel, pavement)
- **Game AI:** Any NPC that needs to navigate weighted terrain — exactly what we're doing

> [!check] Checkpoint
> ```rust
> #[cfg(test)]
> mod tests {
>     use super::*;
>
>     #[test]
>     fn test_dijkstra_prefers_cheap_path() {
>         // Two paths from (0,0) to (4,0):
>         // Top row: Floor Floor Floor Floor Floor (cost 4)
>         // Bottom:  Floor Stairs Stairs Stairs Floor (cost 1+3+3+3+1=11)
>         // Dijkstra should pick the top row
>         let map = make_two_path_map();
>         let result = dijkstra(
>             &map,
>             Position::new(0, 0, 0),
>             Some(Position::new(4, 0, 0)),
>         );
>         assert_eq!(result.cost_so_far[&Position::new(4, 0, 0)], 4);
>     }
>
>     #[test]
>     fn test_dijkstra_finds_optimal_with_stairs() {
>         // Verify that Dijkstra correctly weights stair transitions
>         let map = make_multi_floor_map();
>         let start = Position::new(5, 5, 0);
>         let goal = Position::new(5, 5, 1);
>         let result = dijkstra(&map, start, Some(goal));
>         assert!(result.cost_so_far.contains_key(&goal));
>         assert_eq!(result.cost_so_far[&goal], 3); // One stair transition
>     }
> }
> ```
>
> Snape glides through the dungeons on the cheapest path. But Dijkstra explores in all directions equally — it has no idea *where* the goal is. What if we could give it a sense of direction? First, let's see the difference between BFS and Dijkstra side by side in Stage 19, then we'll add that directional intuition with A* in Stage 20.

---

## Stage 19: Dijkstra vs BFS — The Comparison

*Difficulty: Medium*

Understanding an algorithm in isolation is one thing; understanding *when to choose it* is another. This stage makes the difference between BFS and Dijkstra visceral — you'll see both algorithms solve the same problem simultaneously and compare their behavior. The visual comparison will burn the distinction into your memory far more effectively than any table of Big-O notation.

### The Story: Why Dijkstra Exists

You've now implemented both BFS and Dijkstra. But *when* should you use which? This stage makes the difference visceral — you'll see both algorithms solve the same problem simultaneously and compare their behavior.

### Recording Dijkstra Steps

Just like we did for BFS in Stage 17, record Dijkstra's execution for visualization:

```rust
#[derive(Clone)]
pub struct DijkstraStep {
    pub explored: Vec<(Position, u32)>,  // (position, cost to reach it)
    pub frontier: Vec<(Position, u32)>,  // positions in the priority queue
    pub current: Position,
}

pub fn dijkstra_visualized(
    map: &Map,
    start: Position,
    goal: Option<Position>,
) -> Vec<DijkstraStep> {
    let mut steps: Vec<DijkstraStep> = Vec::new();
    let mut heap: BinaryHeap<DijkstraEntry> = BinaryHeap::new();
    let mut cost_so_far: HashMap<Position, u32> = HashMap::new();
    let mut visited: Vec<(Position, u32)> = Vec::new();

    heap.push(DijkstraEntry { cost: 0, pos: start });
    cost_so_far.insert(start, 0);

    while let Some(DijkstraEntry { cost, pos: current }) = heap.pop() {
        if cost > *cost_so_far.get(&current).unwrap_or(&u32::MAX) {
            continue;
        }

        visited.push((current, cost));

        // Snapshot
        let frontier: Vec<(Position, u32)> = heap
            .iter()
            .map(|e| (e.pos, e.cost))
            .collect();
        steps.push(DijkstraStep {
            explored: visited.clone(),
            frontier,
            current,
        });

        if goal == Some(current) {
            break;
        }

        for neighbor in map.neighbors(current) {
            let new_cost = cost + edge_cost(map, current, neighbor);
            if new_cost < *cost_so_far.get(&neighbor).unwrap_or(&u32::MAX) {
                cost_so_far.insert(neighbor, new_cost);
                heap.push(DijkstraEntry {
                    cost: new_cost,
                    pos: neighbor,
                });
            }
        }
    }

    steps
}
```

### The Comparison View

When the user presses `[d]` twice (or a separate key like `[c]` for compare), show both algorithms side by side. Split the map area into two panels:

```rust
use ratatui::layout::{Layout, Constraint, Direction};

fn render_comparison(
    frame: &mut Frame,
    area: Rect,
    bfs_debug: &DebugState,
    dijkstra_debug: &DijkstraDebugState,
) {
    let chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Percentage(50),
            Constraint::Percentage(50),
        ])
        .split(area);

    // Left panel: BFS
    render_map_with_bfs_overlay(frame, chunks[0], bfs_debug);

    // Right panel: Dijkstra
    render_map_with_dijkstra_overlay(frame, chunks[1], dijkstra_debug);
}
```

### Rendering Dijkstra's Overlay

Dijkstra's visualization uses a cost-based color gradient instead of BFS's discovery-order gradient. Tiles with higher costs appear in warmer colors:

```rust
fn render_dijkstra_debug(
    debug: &DijkstraDebugState,
    buf: &mut Buffer,
    viewport: &Viewport,
    area: Rect,
) {
    if !debug.active || debug.steps.is_empty() {
        return;
    }

    let step = &debug.steps[debug.current_step];

    // Find max cost for normalization
    let max_cost = step
        .explored
        .iter()
        .map(|(_, c)| *c)
        .max()
        .unwrap_or(1)
        .max(1);

    for &(pos, cost) in &step.explored {
        if let Some((sx, sy)) = viewport.world_to_screen(pos) {
            let screen_x = area.x + sx as u16;
            let screen_y = area.y + sy as u16;
            if screen_x < area.right() && screen_y < area.bottom() {
                // Gradient: green (cheap) → yellow → red (expensive)
                let ratio = (cost as f32) / (max_cost as f32);
                let r = (255.0 * ratio) as u8;
                let g = (255.0 * (1.0 - ratio)) as u8;
                let style = Style::default().bg(Color::Rgb(r, g, 0));
                buf.set_style(
                    Rect::new(screen_x, screen_y, 1, 1),
                    style,
                );
            }
        }
    }
}
```

### The Stats Panel

Below each map, show comparison statistics:

```rust
fn comparison_stats(
    bfs_result: &BfsResult,
    dijkstra_result: &DijkstraResult,
    goal: Position,
) -> String {
    let bfs_explored = bfs_result.visit_order.len();
    let dij_explored = dijkstra_result.visit_order.len();

    let bfs_path_len = reconstruct_path(
        &bfs_result.came_from,
        /* start */,
        goal,
    )
    .map(|p| p.len())
    .unwrap_or(0);

    let dij_cost = dijkstra_result
        .cost_so_far
        .get(&goal)
        .copied()
        .unwrap_or(0);

    format!(
        "BFS: {} nodes explored, {} steps | \
         Dijkstra: {} nodes explored, cost {}",
        bfs_explored, bfs_path_len, dij_explored, dij_cost,
    )
}
```

### What You Should See

Run both algorithms from Snape's office to the Potions classroom on a map with mixed terrain:

| Metric | BFS | Dijkstra |
|--------|-----|----------|
| Nodes explored | ~200 | ~180 |
| Path length (steps) | 18 | 22 |
| Path cost (weighted) | 24 | 18 |

BFS finds the path with the fewest *steps* but ignores costs. Dijkstra finds the path with the lowest *total cost* but may take more steps. On a uniform-cost map (all edges = 1), they produce identical results — Dijkstra degenerates to BFS.

The visualization makes this obvious: BFS expands in perfect concentric circles. Dijkstra's expansion is lopsided — it eagerly explores cheap corridors and reluctantly creeps through expensive stairs. The "ripple" is no longer circular; it's shaped by the terrain costs.

### When to Use Which

| Scenario | Algorithm | Why |
|----------|-----------|-----|
| All edges equal cost | BFS | Simpler, same result, no priority queue overhead |
| Weighted edges, no target | Dijkstra | Finds cheapest path to all reachable nodes |
| Weighted edges, specific target | Dijkstra with early exit | Stops as soon as target is found |
| Unweighted, just need reachability | BFS with depth limit | Cheapest option for "is X within N steps?" |

> [!check] Checkpoint
> The comparison mode makes the algorithm trade-offs undeniable. BFS is simpler but blind to costs. Dijkstra respects costs but explores in all directions. Both expand outward without any sense of *where* the goal is. What if the algorithm could look ahead toward the goal? That's exactly what A* does — and it's how Filch will chase you through the castle.
>
> Add the comparison mode to your debug system. The key insight from this stage: **BFS is Dijkstra where all edges cost 1.** Dijkstra is the generalization. But both explore blindly — they don't know where the goal is. They expand in all directions equally.
>
> What if the algorithm could *look ahead* toward the goal?

---

## Stage 20: A* (A-Star)

*Difficulty: Hard*

A* is the crown jewel of this act — the algorithm that powers nearly every game AI you've ever encountered. It exists because Dijkstra wastes time exploring in directions that lead *away* from the goal. A* adds a single brilliant idea: a heuristic that estimates "how far is the goal from here?" This one addition eliminates entire quadrants of wasted exploration. Filch doesn't search every corridor in Hogwarts — he has *intuition* about where you are, and he beelines toward you.

### The Story: Filch Gives Chase

Filch is hunting you. Mrs. Norris spotted you near the restricted section, and now Filch is coming — fast. He doesn't explore blindly like Mrs. Norris (BFS). He doesn't methodically check every corridor like Snape (Dijkstra). He has *intuition*. He knows roughly where you are, and he beelines toward you, only detouring around walls.

This is A* — Dijkstra with a sense of direction. It's the algorithm that powers most game AI pathfinding, and it's the crown jewel of this act.

### Theory: The Heuristic — Marauder's Intuition

A* adds one thing to Dijkstra: a **heuristic function** `h(n)` that *estimates* the remaining cost from node `n` to the goal. Instead of expanding the node with the lowest cost-so-far `g(n)`, A* expands the node with the lowest **total estimated cost**:

```
f(n) = g(n) + h(n)

where:
  f(n) = estimated total cost of the path through n
  g(n) = actual cost from start to n (known exactly)
  h(n) = estimated cost from n to goal (heuristic guess)
```

Think of it this way:
- **g(n)** is how far you've *actually* traveled (looking backward)
- **h(n)** is how far you *think* you still need to go (looking forward)
- **f(n)** is your best guess at the total trip cost

Dijkstra only uses g(n) — it has no concept of "forward." It expands outward in all directions like a balloon inflating. A* uses f(n) — it preferentially expands toward the goal, like a balloon being squeezed toward a point.

> **The Marauder's Map metaphor:** g(n) is the ink trail showing where you've been. h(n) is the Marauder's intuition — the map *knows* where things are and whispers "the goal is roughly *that* way." The better the intuition, the fewer wrong turns.

### Manhattan Distance: The Right Heuristic for Grids

For a grid where you can move in 4 directions (no diagonals), the **Manhattan distance** is the perfect heuristic:

```rust
/// Manhattan distance between two positions on the same floor.
/// This is the minimum number of steps if there were no walls.
pub fn manhattan_distance(a: Position, b: Position) -> u32 {
    let dx = (a.x as i32 - b.x as i32).unsigned_abs();
    let dy = (a.y as i32 - b.y as i32).unsigned_abs();
    dx + dy
}
```

Why Manhattan distance? Because on a 4-directional grid, the shortest possible path between two points (ignoring walls) is `|dx| + |dy|`. You must move `dx` tiles horizontally and `dy` tiles vertically — no shortcuts. This is called "Manhattan" because it's how you navigate a city grid (you can't cut through buildings diagonally).

> **Python comparison:** In Python: `abs(a.x - b.x) + abs(a.y - b.y)`. In Rust, we use `i32` arithmetic and `unsigned_abs()` to avoid underflow on unsigned types. The `.unsigned_abs()` method returns a `u32` directly — cleaner than casting through `i32`.

### Admissibility: The One Rule

A heuristic is **admissible** if it never *overestimates* the true cost. Manhattan distance on a uniform-cost grid is admissible because:
- The true shortest path is *at least* `|dx| + |dy|` steps
- It could be longer (walls force detours) but never shorter
- So `h(n) <= true_cost(n, goal)` always holds

Why does admissibility matter? Because A* with an admissible heuristic is **guaranteed to find the optimal path**. If the heuristic overestimates, A* might skip the optimal path in favor of a suboptimal one that *looks* cheaper.

| Heuristic | Admissible? | Effect |
|-----------|-------------|--------|
| `h(n) = 0` | Yes | A* degenerates to Dijkstra (no guidance) |
| Manhattan distance | Yes (on uniform grid) | Optimal, good guidance |
| Euclidean distance | Yes | Optimal, slightly less guidance than Manhattan |
| `h(n) = 2 * manhattan` | **No** | Faster but may find suboptimal paths |
| `h(n) = actual_cost` | Yes (perfect) | A* goes straight to goal, no wasted exploration |

The sweet spot is a heuristic that's as high as possible (strong guidance) while still being admissible (never overestimates). Manhattan distance hits this sweet spot for unweighted grids.

**But wait — our grid has weighted edges!** Stairs cost 3, not 1. Does Manhattan distance still work?

Yes, but it's *less tight*. Manhattan distance assumes every step costs 1, but some steps cost 3. So the true cost is often higher than the Manhattan estimate, meaning our heuristic underestimates more than necessary. A* will still find the optimal path (admissibility holds), but it'll explore more nodes than a tighter heuristic would.

For a tighter heuristic on weighted grids, you could use `manhattan_distance * min_edge_cost` — but since our minimum edge cost is 1, it's the same. The heuristic is fine as-is.

### Implementation: A* in Rust

A* is structurally identical to Dijkstra — same priority queue, same came_from map, same stale entry check. The only difference is what we push onto the heap:

```rust
/// Entry for A*'s priority queue.
/// Ordered by f_cost (= g_cost + heuristic).
#[derive(Debug, Clone, Eq, PartialEq)]
struct AStarEntry {
    f_cost: u32,  // g + h — the priority
    g_cost: u32,  // actual cost from start
    pos: Position,
}

impl Ord for AStarEntry {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        // Min-heap: lower f_cost = higher priority
        // Break ties by preferring higher g_cost (closer to goal)
        other
            .f_cost
            .cmp(&self.f_cost)
            .then_with(|| self.g_cost.cmp(&other.g_cost))
    }
}

impl PartialOrd for AStarEntry {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}
```

Notice the tie-breaking: when two nodes have the same f_cost, we prefer the one with higher g_cost. Why? Higher g_cost means lower h_cost, which means we're closer to the goal. This reduces unnecessary exploration.

Now the algorithm itself:

```rust
pub struct AStarResult {
    pub came_from: HashMap<Position, Position>,
    pub g_cost: HashMap<Position, u32>,
    pub visit_order: Vec<Position>,
    pub nodes_explored: usize,
}

pub fn astar(
    map: &Map,
    start: Position,
    goal: Position,
) -> AStarResult {
    let mut heap: BinaryHeap<AStarEntry> = BinaryHeap::new();
    let mut came_from: HashMap<Position, Position> = HashMap::new();
    let mut g_cost: HashMap<Position, u32> = HashMap::new();
    let mut visit_order: Vec<Position> = Vec::new();

    let h = manhattan_distance(start, goal);
    heap.push(AStarEntry {
        f_cost: h,
        g_cost: 0,
        pos: start,
    });
    came_from.insert(start, start);
    g_cost.insert(start, 0);

    while let Some(AStarEntry {
        f_cost: _,
        g_cost: current_g,
        pos: current,
    }) = heap.pop()
    {
        // Early exit — we found the goal!
        if current == goal {
            visit_order.push(current);
            break;
        }

        // Skip stale entries (same pattern as Dijkstra)
        if current_g > *g_cost.get(&current).unwrap_or(&u32::MAX) {
            continue;
        }

        visit_order.push(current);

        for neighbor in map.neighbors(current) {
            let new_g = current_g + edge_cost(map, current, neighbor);

            if new_g < *g_cost.get(&neighbor).unwrap_or(&u32::MAX) {
                g_cost.insert(neighbor, new_g);
                came_from.insert(neighbor, current);

                let h = manhattan_distance(neighbor, goal);
                heap.push(AStarEntry {
                    f_cost: new_g + h,
                    g_cost: new_g,
                    pos: neighbor,
                });
            }
        }
    }

    let nodes_explored = visit_order.len();
    AStarResult {
        came_from,
        g_cost,
        visit_order,
        nodes_explored,
    }
}
```

Compare this to Dijkstra line by line. The differences are minimal:

1. **Push**: Dijkstra pushes `cost`. A* pushes `g_cost + h(neighbor, goal)`.
2. **That's it.** The rest is identical.

This is the beauty of A*: it's Dijkstra with one extra addition per neighbor. The heuristic guides the search toward the goal, dramatically reducing the number of nodes explored.

### Filch: The A* NPC

Filch is the most dangerous NPC. When alerted, he chases the player using A* with real-time path updates:

```rust
pub struct Filch {
    pub pos: Position,
    pub state: NpcState,
    pub current_path: Vec<Position>,
    pub path_index: usize,
    pub alert_pos: Option<Position>,  // Where Mrs. Norris spotted the player
    pub recompute_interval: u32,      // Ticks between path recomputation
    pub ticks_since_recompute: u32,
}

impl Filch {
    pub fn new(pos: Position) -> Self {
        Self {
            pos,
            state: NpcState::Idle,
            current_path: Vec::new(),
            path_index: 0,
            alert_pos: None,
            recompute_interval: 5, // Recompute path every 5 ticks
            ticks_since_recompute: 0,
        }
    }

    /// Called when Mrs. Norris spots the player.
    pub fn alert(&mut self, player_pos: Position) {
        self.state = NpcState::Chase;
        self.alert_pos = Some(player_pos);
    }

    /// Update Filch's position each tick.
    pub fn update(&mut self, map: &Map, player_pos: Position) {
        match self.state {
            NpcState::Chase => {
                self.ticks_since_recompute += 1;

                // Periodically recompute path to track moving player
                if self.ticks_since_recompute >= self.recompute_interval
                    || self.path_index >= self.current_path.len()
                {
                    let result = astar(map, self.pos, player_pos);
                    if let Some(path) = reconstruct_path(
                        &result.came_from,
                        self.pos,
                        player_pos,
                    ) {
                        self.current_path = path;
                        self.path_index = 0;
                    }
                    self.ticks_since_recompute = 0;
                }

                // Move one step along the path
                if self.path_index + 1 < self.current_path.len() {
                    self.path_index += 1;
                    self.pos = self.current_path[self.path_index];
                }

                // Caught the player?
                if self.pos == player_pos {
                    // Trigger caught event!
                }
            }
            NpcState::Alert => {
                // Move toward last known position
                if let Some(target) = self.alert_pos {
                    let result = astar(map, self.pos, target);
                    if let Some(path) = reconstruct_path(
                        &result.came_from,
                        self.pos,
                        target,
                    ) {
                        self.current_path = path;
                        self.path_index = 0;
                        self.state = NpcState::Chase;
                    }
                }
            }
            _ => {}
        }
    }
}
```

Filch recomputes his path every 5 ticks. This is a balance between responsiveness (tracking the player's movement) and performance (A* isn't free). On a 100x80 grid, A* typically explores 100-300 nodes — fast enough for 5-tick intervals at 200ms per tick.

> [!warning] Common Mistakes
> 1. **Wrong heuristic.** Using Euclidean distance on a 4-directional grid underestimates less than Manhattan, making A* explore more nodes. Using `2 * manhattan` overestimates, making A* inadmissible (may find suboptimal paths). Always match the heuristic to the movement model.
>
> 2. **Forgetting that BinaryHeap is a max-heap.** Same trap as Dijkstra. If you don't reverse the ordering, A* expands the *worst* nodes first. Your paths will be correct (eventually) but exploration will be maximally inefficient.
>
> 3. **Not breaking ties correctly.** When two nodes have the same f_cost, preferring lower g_cost (farther from goal) causes unnecessary exploration. Prefer higher g_cost (closer to goal) for tighter search.
>
> 4. **Recomputing too often.** A* on every tick is wasteful if the player hasn't moved. Track the player's last known position and only recompute when it changes significantly.
>
> 5. **Cross-floor heuristic.** Manhattan distance doesn't account for floor changes. If the goal is on a different floor, the heuristic should add the minimum stair cost. A simple fix:
>
> ```rust
> pub fn heuristic(a: Position, b: Position) -> u32 {
>     let dx = (a.x as i32 - b.x as i32).unsigned_abs();
>     let dy = (a.y as i32 - b.y as i32).unsigned_abs();
>     let floor_cost = if a.floor != b.floor {
>         3 // Minimum cost to change floors (one stair transition)
>     } else {
>         0
>     };
>     dx + dy + floor_cost
> }
> ```

### Why A* Is Faster Than Dijkstra

On a grid with a specific goal, A* explores dramatically fewer nodes:

```
Dijkstra (no heuristic):        A* (Manhattan heuristic):

  . . 4 4 4 4 . .                . . . . . . . .
  . 3 3 3 3 3 3 .                . . . . 4 . . .
  2 2 2 2 2 2 2 2                . . . 3 3 3 . .
  1 1 1 S 1 1 1 1                . . 2 2 S 2 . .
  2 2 2 2 2 2 2 2                . . . 1 1 1 G .
  . 3 3 3 3 3 3 .                . . . . . . . .
  . . 4 4 4 G . .                . . . . . . . .

  Explored: ~48 nodes             Explored: ~15 nodes
  (expands in all directions)     (focuses toward goal)
```

Dijkstra's exploration is a circle. A*'s exploration is an ellipse pointed at the goal. The heuristic eliminates entire quadrants of the search space.

### Real-World A* Applications

- **Video game AI:** Nearly every game with NPC pathfinding uses A* or a variant (D*, Jump Point Search, Hierarchical A*)
- **Robotics:** Self-driving cars use A* variants for route planning
- **Puzzle solving:** A* with domain-specific heuristics solves sliding puzzles, Rubik's cubes
- **Natural language processing:** A* decoding in machine translation (finding the most likely sentence)
- **Protein folding:** Searching conformational space with energy-based heuristics

> [!check] Checkpoint
> ```rust
> #[cfg(test)]
> mod tests {
>     use super::*;
>
>     #[test]
>     fn test_astar_finds_optimal_path() {
>         let map = make_corridor_map();
>         let start = Position::new(0, 0, 0);
>         let goal = Position::new(4, 0, 0);
>         let result = astar(&map, start, goal);
>         let path = reconstruct_path(&result.came_from, start, goal);
>         assert_eq!(path.unwrap().len(), 5);
>     }
>
>     #[test]
>     fn test_astar_explores_fewer_nodes_than_dijkstra() {
>         let map = make_open_room_map(20, 20); // 20x20 open room
>         let start = Position::new(0, 0, 0);
>         let goal = Position::new(19, 19, 0);
>
>         let dij = dijkstra(&map, start, Some(goal));
>         let ast = astar(&map, start, goal);
>
>         // A* should explore significantly fewer nodes
>         assert!(
>             ast.nodes_explored < dij.visit_order.len(),
>             "A* explored {} nodes, Dijkstra explored {}",
>             ast.nodes_explored,
>             dij.visit_order.len(),
>         );
>     }
>
>     #[test]
>     fn test_astar_same_cost_as_dijkstra() {
>         // A* must find the same optimal cost as Dijkstra
>         let map = make_weighted_map();
>         let start = Position::new(0, 0, 0);
>         let goal = Position::new(9, 9, 0);
>
>         let dij = dijkstra(&map, start, Some(goal));
>         let ast = astar(&map, start, goal);
>
>         assert_eq!(
>             dij.cost_so_far[&goal],
>             ast.g_cost[&goal],
>         );
>     }
> }
> ```
>
> Filch is on the hunt. But how much faster is A* really? Let's see it with our own eyes — Stage 21 adds a visualization that shows A*'s f/g/h values in real-time, making the heuristic's pruning power visible.

---

## Stage 21: A* Visualization

*Difficulty: Medium*

The most powerful insight about A* isn't the nodes it explores — it's the nodes it *skips*. This visualization stage makes that pruning power visible. You'll watch A* shoot a narrow beam toward the goal while huge swaths of the map stay dark and unexplored. Seeing the f/g/h values update in real-time will cement your understanding of why the heuristic works and when it helps most.

### The Story: Watching Intuition Work

This is where the magic becomes visible. You'll see A* *think* — watch it evaluate nodes, see the f/g/h values update, and understand viscerally why the heuristic makes it faster.

### Recording A* Steps with f/g/h Values

Extend the visualization to capture the full decision-making process:

```rust
#[derive(Clone)]
pub struct AStarStep {
    pub explored: Vec<AStarNodeInfo>,
    pub frontier: Vec<AStarNodeInfo>,
    pub current: Position,
    pub current_f: u32,
    pub current_g: u32,
    pub current_h: u32,
}

#[derive(Clone)]
pub struct AStarNodeInfo {
    pub pos: Position,
    pub f: u32,
    pub g: u32,
    pub h: u32,
}

pub fn astar_visualized(
    map: &Map,
    start: Position,
    goal: Position,
) -> (Vec<AStarStep>, HashMap<Position, Position>) {
    let mut steps: Vec<AStarStep> = Vec::new();
    let mut heap: BinaryHeap<AStarEntry> = BinaryHeap::new();
    let mut came_from: HashMap<Position, Position> = HashMap::new();
    let mut g_cost: HashMap<Position, u32> = HashMap::new();
    let mut explored: Vec<AStarNodeInfo> = Vec::new();

    let h = manhattan_distance(start, goal);
    heap.push(AStarEntry { f_cost: h, g_cost: 0, pos: start });
    came_from.insert(start, start);
    g_cost.insert(start, 0);

    while let Some(entry) = heap.pop() {
        let current = entry.pos;
        let current_g = entry.g_cost;

        if current_g > *g_cost.get(&current).unwrap_or(&u32::MAX) {
            continue; // Stale entry
        }

        let current_h = manhattan_distance(current, goal);
        let info = AStarNodeInfo {
            pos: current,
            f: current_g + current_h,
            g: current_g,
            h: current_h,
        };
        explored.push(info);

        // Snapshot
        let frontier: Vec<AStarNodeInfo> = heap
            .iter()
            .map(|e| {
                let h = manhattan_distance(e.pos, goal);
                AStarNodeInfo {
                    pos: e.pos,
                    f: e.f_cost,
                    g: e.g_cost,
                    h,
                }
            })
            .collect();

        steps.push(AStarStep {
            explored: explored.clone(),
            frontier,
            current,
            current_f: current_g + current_h,
            current_g,
            current_h,
        });

        if current == goal {
            break;
        }

        for neighbor in map.neighbors(current) {
            let new_g = current_g + edge_cost(map, current, neighbor);
            if new_g < *g_cost.get(&neighbor).unwrap_or(&u32::MAX) {
                g_cost.insert(neighbor, new_g);
                came_from.insert(neighbor, current);
                let h = manhattan_distance(neighbor, goal);
                heap.push(AStarEntry {
                    f_cost: new_g + h,
                    g_cost: new_g,
                    pos: neighbor,
                });
            }
        }
    }

    (steps, came_from)
}
```

### Rendering f/g/h Values

The key visualization: show the f, g, and h values on each explored tile. Since terminal cells are small, we use color to encode f-cost and show numeric values only for the current node and its neighbors:

```rust
fn render_astar_debug(
    debug: &AStarDebugState,
    buf: &mut Buffer,
    viewport: &Viewport,
    area: Rect,
    goal: Position,
) {
    if !debug.active || debug.steps.is_empty() {
        return;
    }

    let step = &debug.steps[debug.current_step];

    // Color explored nodes by f-cost (purple gradient)
    let max_f = step
        .explored
        .iter()
        .map(|n| n.f)
        .max()
        .unwrap_or(1)
        .max(1);

    for node in &step.explored {
        if let Some((sx, sy)) = viewport.world_to_screen(node.pos) {
            let screen_x = area.x + sx as u16;
            let screen_y = area.y + sy as u16;
            if screen_x < area.right() && screen_y < area.bottom() {
                let ratio = (node.f as f32) / (max_f as f32);
                // Purple gradient: dark purple (low f) → bright magenta (high f)
                let r = (100.0 + 155.0 * ratio) as u8;
                let b = (180.0 - 80.0 * ratio) as u8;
                let style = Style::default().bg(Color::Rgb(r, 0, b));
                buf.set_style(
                    Rect::new(screen_x, screen_y, 1, 1),
                    style,
                );
            }
        }
    }

    // Highlight frontier in yellow-green
    for node in &step.frontier {
        if let Some((sx, sy)) = viewport.world_to_screen(node.pos) {
            let screen_x = area.x + sx as u16;
            let screen_y = area.y + sy as u16;
            if screen_x < area.right() && screen_y < area.bottom() {
                let style = Style::default().bg(Color::Rgb(150, 200, 50));
                buf.set_style(
                    Rect::new(screen_x, screen_y, 1, 1),
                    style,
                );
            }
        }
    }

    // Mark the goal with a bright green marker
    if let Some((sx, sy)) = viewport.world_to_screen(goal) {
        let screen_x = area.x + sx as u16;
        let screen_y = area.y + sy as u16;
        if screen_x < area.right() && screen_y < area.bottom() {
            let style = Style::default()
                .bg(Color::Green)
                .add_modifier(Modifier::BOLD);
            buf.set_style(
                Rect::new(screen_x, screen_y, 1, 1),
                style,
            );
        }
    }
}
```

### The Info Panel

Below the map, show the current node's f/g/h breakdown:

```rust
fn astar_info_text(step: &AStarStep) -> String {
    format!(
        "[A*] Current: ({},{}) | f={} (g={} + h={}) | \
         Explored: {} | Frontier: {}",
        step.current.x,
        step.current.y,
        step.current_f,
        step.current_g,
        step.current_h,
        step.explored.len(),
        step.frontier.len(),
    )
}
```

### What You Should See

Watch A* solve a path from Filch's office to the player:

1. **Early steps:** A* explores nodes near the start, but the frontier quickly skews toward the goal. Nodes *away* from the goal have high h-values, so their f-values are high, and they sit in the queue unpicked.

2. **Mid-search:** The explored region forms an elongated shape pointing at the goal — not a circle like Dijkstra. Nodes to the sides and behind the start are barely touched.

3. **Wall encounters:** When A* hits a wall, it briefly explores sideways to find a way around, then snaps back toward the goal. The heuristic pulls it back on course.

4. **Goal reached:** The moment A* pops the goal from the heap, it stops. The explored region is a narrow corridor compared to Dijkstra's full circle.

The f/g/h display makes the decision process transparent:
- Nodes near the start have **high h, low g** (far from goal, close to start)
- Nodes near the goal have **low h, high g** (close to goal, far from start)
- The algorithm picks the node where **g + h is minimized** — the sweet spot

### Why A* Skips Nodes

The most powerful insight: look at the nodes A* *doesn't* explore. In the Dijkstra visualization, the entire reachable area lights up. In A*, huge swaths of the map stay dark. Those are nodes where `f(n) > f(goal)` — the heuristic tells A* "even in the best case, going through this node is more expensive than the path I've already found."

This is the heuristic's pruning power. Every node A* skips is work Dijkstra would have done.

> [!check] Checkpoint
> Your debug mode now cycles through three algorithm visualizations — BFS in cyan, Dijkstra in cost-gradient, A* in purple with f/g/h info. The visual difference is undeniable. One more stage to go — the grand finale where all three algorithms race head-to-head on the same problem.
>
> Your debug mode should now cycle through three views:
> 1. `[d]` once → BFS visualization (cyan ripples)
> 2. `[d]` twice → Dijkstra visualization (cost gradient)
> 3. `[d]` three times → A* visualization (purple f-cost gradient with info panel)
> 4. `[d]` four times → debug off
>
> One more stage to go — the grand finale.

---

## Stage 22: The Algorithm Showdown

*Difficulty: Medium*

This is the capstone of Act 3 — the moment where theory becomes conviction. Seeing three algorithms solve the same problem simultaneously, watching A* finish while Dijkstra is still expanding and BFS is flooding the entire map, will give you an intuition for algorithm selection that no amount of reading can match. After this stage, you'll *know* which algorithm to reach for and why.

### The Story: Three Algorithms Enter, One Path Wins

This is the capstone of Act 3. You'll build a showdown mode where all three algorithms — BFS, Dijkstra, and A* — race to solve the same pathfinding problem simultaneously. Same start, same goal, same map. Watch them expand in real-time and see exactly why A* dominates.

Press `[r]` (race) to enter showdown mode. Pick a start and goal (or use Filch's office → player position). Three panels appear, each running one algorithm step-by-step in sync.

### The Race Controller

Coordinate all three algorithms to step in lockstep:

```rust
pub struct AlgorithmRace {
    pub active: bool,
    pub start: Position,
    pub goal: Position,
    pub bfs_steps: Vec<BfsStep>,
    pub dijkstra_steps: Vec<DijkstraStep>,
    pub astar_steps: Vec<AStarStep>,
    pub current_step: usize,
    pub step_timer: u32,
    pub ticks_per_step: u32,
    pub finished: [bool; 3], // Which algorithms have finished
}

impl AlgorithmRace {
    pub fn start_race(
        map: &Map,
        start: Position,
        goal: Position,
    ) -> Self {
        let bfs_steps = bfs_visualized(map, start, Some(8));
        let dijkstra_steps = dijkstra_visualized(map, start, Some(goal));
        let (astar_steps, _) = astar_visualized(map, start, goal);

        Self {
            active: true,
            start,
            goal,
            bfs_steps,
            dijkstra_steps,
            astar_steps,
            current_step: 0,
            step_timer: 0,
            ticks_per_step: 1,
            finished: [false; 3],
        }
    }

    pub fn tick(&mut self) {
        if !self.active {
            return;
        }

        self.step_timer += 1;
        if self.step_timer >= self.ticks_per_step {
            self.step_timer = 0;
            self.current_step += 1;

            // Mark algorithms as finished when they run out of steps
            if self.current_step >= self.bfs_steps.len() {
                self.finished[0] = true;
            }
            if self.current_step >= self.dijkstra_steps.len() {
                self.finished[1] = true;
            }
            if self.current_step >= self.astar_steps.len() {
                self.finished[2] = true;
            }
        }
    }

    pub fn all_finished(&self) -> bool {
        self.finished.iter().all(|&f| f)
    }
}
```

### The Three-Panel Layout

Split the screen into three equal columns, each showing the same map with a different algorithm's overlay:

```rust
use ratatui::layout::{Layout, Constraint, Direction};
use ratatui::widgets::{Block, Borders, Paragraph};
use ratatui::style::{Color, Style};

fn render_race(
    frame: &mut Frame,
    area: Rect,
    race: &AlgorithmRace,
    map: &Map,
    viewport: &Viewport,
) {
    // Three columns
    let columns = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Ratio(1, 3),
            Constraint::Ratio(1, 3),
            Constraint::Ratio(1, 3),
        ])
        .split(area);

    // Each column: header + map + stats
    let labels = ["BFS", "Dijkstra", "A*"];
    let colors = [Color::Cyan, Color::Yellow, Color::Magenta];

    for (i, (col, label)) in columns.iter().zip(labels.iter()).enumerate() {
        let inner = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(1),  // Header
                Constraint::Min(5),    // Map
                Constraint::Length(2), // Stats
            ])
            .split(*col);

        // Header
        let header = Paragraph::new(*label)
            .style(Style::default().fg(colors[i]));
        frame.render_widget(header, inner[0]);

        // Map with algorithm overlay
        render_map(frame, inner[1], map, viewport);
        let buf = frame.buffer_mut();
        match i {
            0 => render_bfs_race_overlay(
                &race.bfs_steps,
                race.current_step,
                buf,
                viewport,
                inner[1],
            ),
            1 => render_dijkstra_race_overlay(
                &race.dijkstra_steps,
                race.current_step,
                buf,
                viewport,
                inner[1],
            ),
            2 => render_astar_race_overlay(
                &race.astar_steps,
                race.current_step,
                buf,
                viewport,
                inner[1],
            ),
            _ => {}
        }

        // Stats
        let stats = race_stats(i, race);
        let stats_widget = Paragraph::new(stats)
            .style(Style::default().fg(Color::Gray));
        frame.render_widget(stats_widget, inner[2]);
    }
}
```

### Race Statistics

Show real-time stats for each algorithm as the race progresses:

```rust
fn race_stats(algo_index: usize, race: &AlgorithmRace) -> String {
    let step = race.current_step;

    match algo_index {
        0 => {
            // BFS stats
            let explored = if step < race.bfs_steps.len() {
                race.bfs_steps[step].explored.len()
            } else {
                race.bfs_steps.last().map(|s| s.explored.len()).unwrap_or(0)
            };
            let status = if race.finished[0] { "DONE" } else { "..." };
            format!("Explored: {} [{}]", explored, status)
        }
        1 => {
            // Dijkstra stats
            let explored = if step < race.dijkstra_steps.len() {
                race.dijkstra_steps[step].explored.len()
            } else {
                race.dijkstra_steps
                    .last()
                    .map(|s| s.explored.len())
                    .unwrap_or(0)
            };
            let status = if race.finished[1] { "DONE" } else { "..." };
            format!("Explored: {} [{}]", explored, status)
        }
        2 => {
            // A* stats
            let explored = if step < race.astar_steps.len() {
                race.astar_steps[step].explored.len()
            } else {
                race.astar_steps
                    .last()
                    .map(|s| s.explored.len())
                    .unwrap_or(0)
            };
            let status = if race.finished[2] { "DONE" } else { "..." };
            format!("Explored: {} [{}]", explored, status)
        }
        _ => String::new(),
    }
}
```

### The Final Summary Panel

When all three algorithms finish, show a summary comparison:

```rust
fn race_summary(race: &AlgorithmRace) -> String {
    let bfs_nodes = race
        .bfs_steps
        .last()
        .map(|s| s.explored.len())
        .unwrap_or(0);
    let dij_nodes = race
        .dijkstra_steps
        .last()
        .map(|s| s.explored.len())
        .unwrap_or(0);
    let ast_nodes = race
        .astar_steps
        .last()
        .map(|s| s.explored.len())
        .unwrap_or(0);

    format!(
        "RACE COMPLETE!\n\
         BFS: {} nodes | Dijkstra: {} nodes | A*: {} nodes\n\
         A* explored {:.0}% fewer nodes than Dijkstra",
        bfs_nodes,
        dij_nodes,
        ast_nodes,
        if dij_nodes > 0 {
            (1.0 - ast_nodes as f64 / dij_nodes as f64) * 100.0
        } else {
            0.0
        },
    )
}
```

### What You Should See

On a typical Hogwarts floor (80x60 tiles with corridors and rooms), racing from Filch's office to the library:

| Algorithm | Nodes Explored | Path Cost | Steps to Complete |
|-----------|---------------|-----------|-------------------|
| BFS | ~847 | 32 (unweighted) | 847 |
| Dijkstra | ~623 | 28 (weighted) | 623 |
| A* | ~203 | 28 (weighted) | 203 |

The visual difference is stunning:
- **BFS** floods the entire reachable area in concentric circles — a tidal wave of cyan
- **Dijkstra** expands unevenly based on costs — a lopsided yellow blob
- **A*** shoots a narrow purple beam toward the goal, barely touching the sides

A* finishes first (fewest steps), finds the same optimal path as Dijkstra (same cost), and explores 67% fewer nodes. The heuristic is doing its job.

### The Complete Algorithm Comparison

| Property | BFS | Dijkstra | A* |
|----------|-----|----------|-----|
| **Data structure** | VecDeque (FIFO) | BinaryHeap (min by cost) | BinaryHeap (min by f=g+h) |
| **Edge weights** | All equal (unweighted) | Any non-negative | Any non-negative |
| **Heuristic** | None | None | Required (admissible) |
| **Optimal?** | Yes (unweighted) | Yes | Yes (with admissible h) |
| **Time complexity** | O(V + E) | O((V+E) log V) | O((V+E) log V) worst case |
| **Space complexity** | O(V) | O(V) | O(V) |
| **Nodes explored** | All reachable | All cheaper than goal | Only promising directions |
| **Best for** | Unweighted, exploration | Weighted, no target info | Weighted, known target |
| **Hogwarts NPC** | Mrs. Norris (scout) | Snape (patrol) | Filch (chase) |

### When to Use What — The Decision Tree

```
Do all edges have equal cost?
├── YES → Use BFS (simpler, no priority queue overhead)
└── NO → Do you have a specific target?
    ├── NO → Use Dijkstra (explore all cheapest paths)
    └── YES → Can you estimate distance to target?
        ├── YES → Use A* (fastest, fewest nodes explored)
        └── NO → Use Dijkstra with early exit
```

> [!check] Checkpoint
> The race is complete. You've seen BFS flood, Dijkstra expand, and A* laser toward the goal. These three algorithms are now tools in your belt — and in Act 4, they become the nervous system of a living castle. Mrs. Norris scouts with BFS, Snape patrols with Dijkstra, and Filch hunts with A*. The corridors won't be empty much longer.
>
> Wire the `[r]` key to start a race:
>
> ```rust
> KeyCode::Char('r') => {
>     let start = game.filch.pos;
>     let goal = game.player.pos;
>     game.race = AlgorithmRace::start_race(&game.map, start, goal);
> }
> ```
>
> Call `game.race.tick()` in your update loop. The race animates automatically.

---

## Act 3 Complete

You've implemented three fundamental algorithms that power everything from Google Maps to game AI. More importantly, you *understand* them — not just the code, but the *why*:

- **BFS** explores systematically, layer by layer. It's the foundation — simple, correct, complete. Use it when all moves cost the same.
- **Dijkstra** adds cost awareness. It's BFS with priorities — always expand the cheapest option. Use it when moves have different costs.
- **A*** adds intuition. It's Dijkstra with a compass — always expand toward the goal. Use it when you know where you're going.

Each algorithm builds on the last. A* without the heuristic *is* Dijkstra. Dijkstra on an unweighted graph *is* BFS. They're not three separate algorithms — they're one algorithm with increasing sophistication.

Your Hogwarts is alive now. Mrs. Norris scouts the corridors. Snape glides between his office and the classroom. Filch hunts you through the castle. And when you press `[d]`, you can watch their algorithms think.

**What's next in Act 4:** The NPCs have brains, but they don't have *personalities*. Act 4 adds the AI state machine — Idle, Patrol, Alert, Chase, Return — and the schedule system that makes Snape show up to class on time. The algorithms you built here become the *movement layer* underneath higher-level behavior.

> *"Mischief managed."*
