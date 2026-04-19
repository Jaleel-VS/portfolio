# Course Quality Rewrite Prompt

Use this prompt in a new session. Point it at one course at a time.

---

## Prompt

You are rewriting a text-based Rust course for quality. The course lives in `content/courses/{course-name}/` and consists of:

- `Index.md` — course overview, course map, design decisions, totals
- `Act N - {Title}.md` — the teaching content (4-5 acts per course)
- `Reference Guide.md` — desk reference

The target audience is **someone who knows Python but has never written Rust**, learning Rust by building an interesting project. Every course teaches Rust through a single project built from scratch.

### Your job

Rewrite each Act file in-place, applying ALL of the standards below. Do NOT change the project, the stage structure, or the overall narrative arc. You are improving the pedagogy, not redesigning the course.

Work through one Act at a time. Read the full Act, rewrite it, then move to the next. After all Acts are done, update the Index.md (time estimates, any new sections mentioned) and the Reference Guide (add anything missing).

---

## Standards to enforce

### 1. Exercises in every stage (CRITICAL)

Every stage MUST have at least one moment where the learner writes code independently before seeing the solution. Patterns:

- **"Try it yourself" block before the solution.** Describe what the code should do, list the function signature or struct fields, then say "Implement this. When you're ready, compare with the solution below." Put the solution in a collapsible `<details>` block.
- **"Extend it" exercise at the end of the stage.** A small task that requires applying what was just taught in a slightly different way. No solution provided — the learner must figure it out. Example: "Add a `favorite: bool` field to the struct. Update serialization and verify the JSON output."
- **Never give the learner 100% of the code upfront.** The first 2-3 stages can be more guided. From stage 4 onward, at least one function per stage should be implemented by the learner before they see the answer.

### 2. Teach Rust ownership and borrowing when the learner hits the wall

When the code requires `&`, `&mut`, `.clone()`, index-based references instead of references, or any borrow-checker workaround:

- **Stop and explain WHY.** Not just "the borrow checker won't let you" — explain what the borrow checker is protecting against (data races, use-after-free, iterator invalidation).
- **Show the error message.** Print the actual `rustc` error the learner would see if they tried the naive approach. Then show the fix.
- **Give a mental model.** "Think of ownership like a physical object — only one person can hold it. A reference is like letting someone look at it while you still hold it."
- **Don't dodge it.** If the natural design requires `Rc<RefCell<T>>` or indices-into-a-vec, explain the tradeoff. Don't just silently use the workaround.

### 3. Introduce error handling early

- **Stage where `Result<T,E>` first appears:** Explain `Result`, `Ok`, `Err`, the `?` operator, and why `.unwrap()` is a development shortcut that must be replaced.
- **From that stage onward:** All new code should use `?` and return `Result`. If a stage adds `.unwrap()`, it must include a comment: `// TODO: replace with ? in Stage N`.
- **Do NOT defer error handling to a late "unwrap purge" stage.** Introduce it incrementally. Each act should have slightly better error handling than the last.
- **Show what happens when `.unwrap()` panics.** Print the panic message. Explain why this is bad in a real tool.

### 4. Fix time estimates

Multiply all time estimates by 1.5-2x for the actual target audience (Python dev, no Rust experience). A stage that introduces 3+ new Rust concepts (structs, derives, Option, Vec) is not a "20 minute" stage — it's 40-60 minutes.

Update both the Act headers and the Index.md course map table.

### 5. Consistent depth across all acts

The final act of every course tends to get thin — vague code sketches, `todo!()` without guidance, hand-waving. Fix this:

- Every stage in every act must have the same level of detail as Act 1-2 stages.
- If a stage says "YOUR CODE" or `todo!()`, it must also provide: the function signature, a description of the expected behavior, at least one test case, and hints if the implementation is non-obvious.
- If the final act is genuinely polish/extras, it's OK to be slightly lighter, but it must still be complete enough that the learner can finish without outside help.

### 6. Make "Common Mistake" boxes authentic

Replace generic/templated warning boxes with mistakes a real Rust beginner would make:

- Forgetting `mut` on a variable they need to modify
- Type mismatch between `&str` and `String`
- Trying to use a value after moving it
- Confusion about `println!("{}", x)` vs `println!("{:?}", x)` (Display vs Debug)
- Not understanding why `for item in vec` consumes the vec but `for item in &vec` doesn't
- Module system confusion (`mod` declarations, `pub`, file naming)
- Numeric type mismatches (`usize` vs `u32`, `f64` vs `f32`)

Each warning box should show: the broken code, the compiler error message, and the fix. If a stage doesn't have a natural common mistake, don't force one — remove the box.

### 7. Add `#[test]` examples

Every course should introduce `#[test]` and `cargo test` by Act 2 at the latest. From that point:

- Each stage that builds a pure function should include at least one test.
- Tests should be in `#[cfg(test)] mod tests { ... }` blocks.
- Show the learner how to run tests: `cargo test`, `cargo test test_name`.
- Use tests as checkpoints: "If this test passes, your implementation is correct."

### 8. Explain the module system

The first time a course says "Create `src/something.rs`", it must explain:

- How `mod something;` in `main.rs` connects to the file
- Why `pub` is needed on structs and functions used from other modules
- The difference between `mod` (declaration) and `use` (import)
- Show the compiler error you get if you forget `mod something;`

This only needs to be explained once per course, but it must be explained fully.

### 9. Add a "Don't use this in production" disclaimer where appropriate

If the project is something people might actually deploy (password manager, web server, crypto tool):

- Add a clear disclaimer in the Index.md: "This is a learning project. For real-world use, use [established alternatives]. Rolling your own [crypto/auth/etc.] is dangerous."
- In security-sensitive stages, note which simplifications were made for teaching purposes.

### 10. Python comparisons

The existing Python comparison tables are good — keep them and add more where helpful. Every new Rust concept should have a one-line "In Python, this is like..." comparison. Don't overdo it — by Act 3, the learner should be thinking in Rust, not translating from Python.

---

## Formatting conventions (preserve these)

- Stage headers: `## Stage N — Title`
- Difficulty in italics after the quote block: `*Difficulty: Medium*`
- Concept introductions: `### Concept: Name`
- Callout boxes: `> [!tip]`, `> [!warning]`, `> [!check]`, `> [!note]`
- Mermaid flowcharts at the start of each Act showing stage progression
- Summary tables at the end of each Act (components built, Rust concepts used)
- Code blocks with `rust`, `bash`, `toml`, `python`, `json` language tags

## File structure (do not change)

```
content/courses/{name}/
├── Index.md
├── Act 1 - {Title}.md
├── Act 2 - {Title}.md
├── Act 3 - {Title}.md
├── Act 4 - {Title}.md
├── Act 5 - {Title}.md          (some courses have 4 acts, some have 5)
└── Reference Guide.md
```

## Process

1. Read the full Index.md to understand the course structure
2. Read Act 1 fully, rewrite it, output the complete rewritten file
3. Repeat for each subsequent Act
4. Update Index.md (time estimates, any references to new content)
5. Update Reference Guide.md (add module system reference, testing patterns, error handling patterns if missing)

Start with: **Read the Index.md of the course I point you to, then begin rewriting Act 1.**
