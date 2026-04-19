# Act 2 — The Voice

> *Your character exists. Your quest engine ticks. Now Crónica needs a voice — an AI narrator that breathes life into every choice. In this act you connect to AWS Bedrock, teach the AI how to narrate your world, and build a fully playable CLI adventure.*

Act 1 gave you structs, enums, dice, serialization, and a quest engine — all synchronous, all local. Act 2 introduces **async programming** and **network calls**. By the end, you'll have a working CLI game where an AI narrates your quest, combat plays out in narrative exchanges, and a chronicle compiler writes your story.

---

## Stage 9 — Calling Bedrock: async/await and Your First AI Call

> **Difficulty: Medium**

Our quest engine ticks and our characters have stats, but the narrator's throne is empty — every scene description is hardcoded, every outcome predetermined. We need to reach across the network to an AI that can improvise, react, and weave stories we didn't write. This stage cracks open async programming and makes your first call to the voice that will narrate every adventure from here on.

> [!info] What You'll Learn
> - What async programming is and why network code needs it
> - The `tokio` runtime and `#[tokio::main]`
> - The `aws-sdk-bedrockruntime` crate and the Converse API
> - Making your first AI call and getting text back
> - How `.await` works compared to Python's `await` and JS promises

### Why Async?

When your program calls an API over the network, it waits — maybe 500ms, maybe 2 seconds. In synchronous code, your entire program freezes during that wait. Nothing else can happen.

**Python comparison:**
```python
# Synchronous — blocks the whole program
import requests
response = requests.get("https://api.example.com/data")  # frozen here

# Async — other work can happen while waiting
import aiohttp
async with aiohttp.ClientSession() as session:
    response = await session.get("https://api.example.com/data")  # yields control
```

**TypeScript comparison:**
```typescript
// Promise-based — non-blocking
const response = await fetch("https://api.example.com/data");
// JS engine can handle other events while waiting
```

Rust's async works like Python's `asyncio` — you need a **runtime** to drive the futures. Rust chose not to bake a runtime into the language (unlike JS which has one built into the browser/Node). Instead, you pick one. The ecosystem standard is **tokio**.

### The Mental Model

A **Future** in Rust is like a Promise in JS or a coroutine in Python. It represents "a value that will exist later." But unlike JS promises, Rust futures are **lazy** — they do nothing until you `.await` them.

```rust
// This does NOT send a request. It just creates a Future.
let future = client.get("https://example.com").send();

// THIS sends the request — .await drives the future to completion.
let response = client.get("https://example.com").send().await;
```

Think of `.await` as saying: "pause me here, go do other work, come back when this is ready."

### Update Cargo.toml

Uncomment the Act 2 dependencies and add the AWS SDK crates:

```toml
[dependencies]
# --- Act 1 (already uncommented) ---
rand = "0.8"
serde = { version = "1", features = ["derive"] }
serde_json = "1"

# --- Act 2: The Voice (Stages 9-14) ---
tokio = { version = "1", features = ["full"] }
reqwest = { version = "0.12", features = ["json"] }
aws-config = { version = "1", features = ["behavior-version-latest"] }
aws-sdk-bedrockruntime = "1"
```

> [!note] Why the AWS SDK instead of raw reqwest?
> AWS APIs require **SigV4 request signing** — a complex process involving timestamps, canonical headers, and HMAC-SHA256 chains. The official `aws-sdk-bedrockruntime` crate handles all of this automatically using your `~/.aws/credentials`. We still list `reqwest` because the SDK uses it internally, and we'll use it directly in later stages. Teaching SigV4 signing from scratch would be an entire act on its own.

### The Bedrock Converse API

AWS Bedrock's **Converse API** provides a unified interface across all models. The HTTP shape looks like this:

```
POST /model/{modelId}/converse HTTP/1.1

{
    "messages": [
        { "role": "user", "content": [{ "text": "Tell me a story" }] }
    ],
    "system": [{ "text": "You are a narrator" }],
    "inferenceConfig": {
        "maxTokens": 1000,
        "temperature": 0.7
    }
}
```

The response comes back as:
```json
{
    "output": {
        "message": {
            "role": "assistant",
            "content": [{ "text": "Once upon a time..." }]
        }
    },
    "stopReason": "end_turn",
    "usage": { "inputTokens": 30, "outputTokens": 150 }
}
```

The Rust SDK wraps this into typed structs so you never deal with raw JSON for the API call itself.

### Your First AI Call

```rust
use aws_config::BehaviorVersion;
use aws_sdk_bedrockruntime::{
    operation::converse::ConverseOutput,
    types::{ContentBlock, ConversationRole, Message, SystemContentBlock},
    Client,
};

// The model ID for Claude Haiku — fast and cheap, perfect for gameplay.
const MODEL_ID: &str = "anthropic.claude-3-5-haiku-20241022-v1:0";
const AWS_REGION: &str = "us-east-1";

// #[tokio::main] transforms your main() into an async function
// running inside a tokio runtime. Without this, you can't use .await.
//
// It expands roughly to:
//   fn main() {
//       tokio::runtime::Runtime::new().unwrap().block_on(async { ... })
//   }
#[tokio::main]
async fn main() {
    // Load AWS credentials from ~/.aws/credentials or environment variables.
    // This is async because it may read files or call IMDS on EC2.
    let config = aws_config::defaults(BehaviorVersion::latest())
        .region(aws_config::Region::new(AWS_REGION))
        .load()
        .await;

    // Create the Bedrock Runtime client. This is cheap to clone (Arc inside).
    let client = Client::new(&config);

    // Build the user message.
    let user_message = Message::builder()
        .role(ConversationRole::User)
        .content(ContentBlock::Text(
            "You are the narrator of a fantasy RPG. Describe a mysterious tavern.".into(),
        ))
        .build()
        .expect("failed to build message");

    // Call the Converse API — this is where .await does its magic.
    // The program yields here, the tokio runtime can do other work,
    // and we resume when Bedrock responds.
    let response = client
        .converse()
        .model_id(MODEL_ID)
        .system(SystemContentBlock::Text(
            "You are Crónica, narrator of a dark fantasy RPG.".into(),
        ))
        .messages(user_message)
        .send()       // Returns a Future — nothing sent yet
        .await;       // NOW the request fires and we wait for the response

    match response {
        Ok(output) => {
            // Extract the text from the response.
            let text = extract_text(output);
            println!("\n--- Crónica speaks ---\n{text}\n");
        }
        Err(e) => {
            eprintln!("Bedrock error: {e}");
        }
    }
}

/// Pull the first text block out of a Converse response.
fn extract_text(output: ConverseOutput) -> String {
    output
        .output()                              // Option<&ConverseOutputType>
        .and_then(|o| o.as_message().ok())     // Option<&Message>
        .and_then(|m| m.content().first())     // Option<&ContentBlock>
        .and_then(|c| c.as_text().ok())        // Option<&str>
        .unwrap_or("(no response)")
        .to_string()
}
```

Run it:
```bash
cargo run
```

If your AWS credentials are configured, you'll see the AI narrate a tavern scene.

### Line-by-Line Breakdown

| Line | What it does |
|------|-------------|
| `#[tokio::main]` | Macro that creates a tokio runtime and runs `main()` as an async task |
| `async fn main()` | Declares main as async — now you can use `.await` inside |
| `.load().await` | Reads AWS config asynchronously (file I/O is async too) |
| `Client::new(&config)` | Creates the HTTP client with connection pooling and auth |
| `.send().await` | Sends the HTTP request and waits for the response |
| `extract_text(output)` | Navigates the nested response types to get the text string |

> [!warning] Common Mistakes
> **Forgetting `.await`** — If you write `client.converse()...send()` without `.await`, you get a `Future` value, not a response. The compiler warns: "unused `Future` that must be used." Always `.await` your futures.
>
> **Blocking in async** — Never use `std::thread::sleep()` in async code. It freezes the entire tokio thread. Use `tokio::time::sleep()` instead.
>
> **Missing `#[tokio::main]`** — Without it, `async fn main()` won't compile. The error says "main function is not allowed to be async" — the macro is what makes it work.

The voice speaks — but it speaks freely, without structure or constraint. We can hear the AI, but we can't control *what* it says or *how* it formats its response. Next stage, we'll craft the prompt that shapes the narrator's every word.

### Checkpoint

- [ ] `cargo run` compiles without errors
- [ ] You see AI-generated text describing a tavern
- [ ] You understand that `.await` yields control, not blocks the thread

---

## Stage 10 — The Prompt: Crafting the AI's Instructions

> **Difficulty: Medium**

We can call the AI, but right now it's a wild oracle — it doesn't know our character's name, their realm, or what kind of quest they're on. Without structured instructions, the narrator rambles aimlessly. We need a prompt architecture that injects game state into every AI call, demands structured JSON responses, and shapes the narrator's voice to match Crónica's dark fantasy tone.

> [!info] What You'll Learn
> - How system prompts shape AI behavior
> - Building a `PromptBuilder` struct that assembles context from game state
> - String formatting with `format!` and multi-line strings
> - Passing Act 1 structs (Character, Quest) into the prompt

### The Prompt Architecture

The spec (§12) defines what the AI needs to know to narrate well. Each context element exists for a specific reason — without the realm, the AI can't set the scene; without stats, it can't propose mechanically meaningful choices; without the current beat and tension, it can't pace the story:

| Context | Example | Why |
|---------|---------|-----|
| Realm | "Ashenmoor, a plague-scarred marshland" | Sets the scene |
| Language | "English" | Localization |
| Character stats | STR 14, DEX 10, WIS 16 | AI proposes stat-appropriate choices |
| Quest archetype | "rescue" | Shapes narrative arc |
| Current beat | "rising_action" | Controls pacing |
| Tension level | 3 (of 5) | Governs danger and tone |

The AI must return **structured JSON** — not free-form prose. We'll handle parsing in Stage 11; here we build the prompt that requests it.

### The PromptBuilder

```rust
use crate::{Character, Quest, QuestBeat};

/// Assembles the system prompt from game state.
/// Each field maps to a context element from spec §12.
pub struct PromptBuilder {
    pub realm: String,
    pub language: String,
    pub quest_archetype: String,
    pub current_beat: QuestBeat,
    pub tension_level: u8,
}

impl PromptBuilder {
    /// Build the full system prompt, injecting character stats and quest context.
    pub fn build_system_prompt(&self, character: &Character) -> String {
        format!(
            r#"You are Crónica, the narrator of a dark fantasy tabletop RPG.

## World
- Realm: {realm}
- Language: {language}

## Character
- Name: {name}
- Class: {class}
- Level: {level}
- Stats: STR {str}, DEX {dex}, CON {con}, WIS {wis}, INT {int}, CHA {cha}
- HP: {hp}/{max_hp}

## Quest
- Archetype: {archetype}
- Current beat: {beat}
- Tension level: {tension}/5

## Response Format
You MUST respond with valid JSON matching this schema:
{{
  "narration": "2-4 paragraphs of atmospheric prose",
  "choices": [
    {{
      "label": "Short description of the choice",
      "primary_stat": "STR",
      "dc": 12,
      "secondary_stat": "CON",
      "secondary_dc": 15
    }}
  ],
  "ambient_event": "Optional environmental detail or null",
  "quest_beat": "rising_action",
  "tension_level": 3
}}

Rules:
- Provide exactly 3 choices per response
- Each choice has a primary_stat and dc (difficulty class)
- secondary_stat activates at dc + 3 (a bonus if the roll is very high)
- Valid stats: STR, DEX, CON, WIS, INT, CHA
- DC range: 8-18 based on tension level
- quest_beat must be one of: introduction, rising_action, climax, falling_action, resolution
- tension_level: 1-5, should shift gradually based on narrative momentum
- Do NOT include anything outside the JSON object"#,
            realm = self.realm,
            language = self.language,
            name = character.name,
            class = character.class,
            level = character.level,
            str = character.stats.strength,
            dex = character.stats.dexterity,
            con = character.stats.constitution,
            wis = character.stats.wisdom,
            int = character.stats.intelligence,
            cha = character.stats.charisma,
            archetype = self.quest_archetype,
            beat = self.current_beat.as_str(),
            tension = self.tension_level,
            hp = character.hp,
            max_hp = character.max_hp,
        )
    }

    /// Build the user message for a player's choice.
    pub fn build_user_message(&self, choice: &str) -> String {
        format!("The player chooses: {choice}")
    }

    /// Build the opening message to start a quest.
    pub fn build_opening_message(&self) -> String {
        "Begin the quest. Describe the opening scene and present the first three choices.".into()
    }
}
```

### The Supporting Types

You need `QuestBeat` from Act 1 to have an `as_str()` method. If you don't have it yet:

```rust
/// Where we are in the narrative arc.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum QuestBeat {
    Introduction,
    RisingAction,
    Climax,
    FallingAction,
    Resolution,
}

impl QuestBeat {
    pub fn as_str(&self) -> &'static str {
        match self {
            QuestBeat::Introduction => "introduction",
            QuestBeat::RisingAction => "rising_action",
            QuestBeat::Climax => "climax",
            QuestBeat::FallingAction => "falling_action",
            QuestBeat::Resolution => "resolution",
        }
    }

    /// Parse from the AI's JSON response string.
    pub fn from_str(s: &str) -> Self {
        match s {
            "introduction" => Self::Introduction,
            "rising_action" => Self::RisingAction,
            "climax" => Self::Climax,
            "falling_action" => Self::FallingAction,
            "resolution" => Self::Resolution,
            _ => Self::RisingAction, // safe default
        }
    }
}
```

### Using the PromptBuilder

```rust
let prompt = PromptBuilder {
    realm: "Ashenmoor, a plague-scarred marshland".into(),
    language: "English".into(),
    quest_archetype: "rescue".into(),
    current_beat: QuestBeat::Introduction,
    tension_level: 2,
};

let system_prompt = prompt.build_system_prompt(&character);
let opening = prompt.build_opening_message();

// Now pass these to the Bedrock call from Stage 9:
let response = client
    .converse()
    .model_id(MODEL_ID)
    .system(SystemContentBlock::Text(system_prompt))
    .messages(
        Message::builder()
            .role(ConversationRole::User)
            .content(ContentBlock::Text(opening))
            .build()
            .expect("failed to build message"),
    )
    .send()
    .await;
```

### Why `format!` with Named Arguments?

The `r#"..."#` syntax is a **raw string literal** — backslashes and quotes don't need escaping. The `{realm}` syntax uses **named arguments** in `format!`, which is much cleaner than positional `{0}`, `{1}` when you have many variables.

One gotcha: literal curly braces in the JSON schema must be **doubled** — `{{` and `}}` — because `format!` uses `{}` for interpolation.

> [!warning] Common Mistakes
> **Single braces in format strings** — Writing `{"narration": ...}` inside `format!()` causes a compile error. You need `{{"narration": ...}}`. Every literal `{` becomes `{{`.
>
> **Prompt too vague** — If you don't specify the exact JSON schema, the AI returns free-form text. Be explicit about the response format.
>
> **Forgetting to update the prompt when stats change** — The prompt is built fresh each turn, so it always reflects current HP, tension, etc. Don't cache it across turns.

We can instruct the narrator now, but the JSON it returns is still just a raw string — we can't access the choices, the tension level, or the narration as typed Rust data. Next stage, we'll parse that JSON into structs the compiler can check.

### Checkpoint

- [ ] `PromptBuilder::build_system_prompt()` returns a string containing character stats
- [ ] The JSON schema in the prompt matches the `AiResponse` struct we'll build in Stage 11
- [ ] You understand why `{{` is needed for literal braces in `format!`

---

## Stage 11 — Structured Responses: Parsing the AI's JSON

> **Difficulty: Medium**

The AI speaks, but its words arrive as a raw string — we can print them, but we can't extract the three choices, read the tension level, or check the quest beat without manual string parsing. We need typed Rust structs that mirror the AI's JSON output so the compiler catches mismatches before the player ever sees a broken scene. This is where serde earns its keep.

> [!info] What You'll Learn
> - Defining Rust structs that mirror the AI's JSON output
> - `serde_json::from_str` for parsing JSON into typed structs
> - Graceful error handling when the AI returns malformed JSON
> - The `Option<T>` type for fields that may be absent

### The Response Structs

Right now we have a raw text string from the AI, but no way to access individual fields like `narration` or `choices` without fragile string manipulation. We need Rust structs that serde can deserialize the JSON into directly.

The AI returns JSON matching the schema we defined in Stage 10. Now we build Rust types to receive it:

```rust
use serde::{Deserialize, Serialize};

/// The complete AI response for one game turn.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiResponse {
    /// 2-4 paragraphs of atmospheric narration.
    pub narration: String,

    /// Exactly 3 choices the player can pick from.
    pub choices: Vec<Choice>,

    /// Optional environmental flavor text (e.g., "A crow lands on the windowsill").
    pub ambient_event: Option<String>,

    /// Where we are in the narrative arc.
    pub quest_beat: String,

    /// Current tension level (1-5).
    pub tension_level: u8,
}

/// A single choice presented to the player.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Choice {
    /// Short description: "Kick down the door"
    pub label: String,

    /// The main stat tested: "STR", "DEX", etc.
    pub primary_stat: String,

    /// Difficulty class for the primary check.
    pub dc: i32,

    /// Bonus stat that activates at dc + 3.
    pub secondary_stat: Option<String>,

    /// DC for the secondary check (typically dc + 3).
    pub secondary_dc: Option<i32>,
}
```

### Parsing the Response

The AI returns a text string. We need to extract JSON from it and parse it:

```rust
/// Parse the AI's text response into a typed AiResponse.
/// Handles cases where the AI wraps JSON in markdown code fences.
pub fn parse_ai_response(raw: &str) -> Result<AiResponse, String> {
    // The AI sometimes wraps JSON in ```json ... ``` — strip that.
    let cleaned = strip_code_fences(raw);

    serde_json::from_str::<AiResponse>(&cleaned)
        .map_err(|e| format!("Failed to parse AI response: {e}\nRaw text: {cleaned}"))
}

/// Remove markdown code fences if present.
fn strip_code_fences(s: &str) -> String {
    let trimmed = s.trim();
    if trimmed.starts_with("```") {
        // Remove first line (```json) and last line (```)
        let lines: Vec<&str> = trimmed.lines().collect();
        if lines.len() >= 3 {
            return lines[1..lines.len() - 1].join("\n");
        }
    }
    trimmed.to_string()
}
```

### Wiring It Together

Combine the `extract_text` from Stage 9 with parsing:

```rust
/// Call Bedrock and parse the response into an AiResponse.
pub async fn call_ai(
    client: &Client,
    system_prompt: &str,
    user_message: &str,
    history: &[Message],
) -> Result<AiResponse, String> {
    // Build the messages list: history + new user message.
    let mut messages = history.to_vec();
    messages.push(
        Message::builder()
            .role(ConversationRole::User)
            .content(ContentBlock::Text(user_message.into()))
            .build()
            .map_err(|e| format!("Failed to build message: {e}"))?,
    );

    let response = client
        .converse()
        .model_id(MODEL_ID)
        .system(SystemContentBlock::Text(system_prompt.into()))
        .set_messages(Some(messages))
        .send()
        .await
        .map_err(|e| format!("Bedrock API error: {e}"))?;

    let raw_text = extract_text(response);
    parse_ai_response(&raw_text)
}
```

### Understanding `Option<T>`

Some fields in the AI response might be absent. In Python, you'd use `None`. In TypeScript, `undefined` or `null`. Rust uses `Option<T>`:

```rust
// Python:  ambient_event: str | None = None
// TS:      ambientEvent?: string
// Rust:
pub ambient_event: Option<String>,
```

When serde deserializes JSON, a missing field or `null` becomes `None`, and a present value becomes `Some("the value")`. You access it with pattern matching:

```rust
match &response.ambient_event {
    Some(event) => println!("  * {event}"),
    None => {} // nothing to show
}

// Or more concisely:
if let Some(event) = &response.ambient_event {
    println!("  * {event}");
}
```

### Retry on Parse Failure

AI models occasionally return malformed JSON. A simple retry strategy:

```rust
/// Try calling the AI up to `max_attempts` times, retrying on parse failures.
pub async fn call_ai_with_retry(
    client: &Client,
    system_prompt: &str,
    user_message: &str,
    history: &[Message],
    max_attempts: u32,
) -> Result<AiResponse, String> {
    for attempt in 1..=max_attempts {
        match call_ai(client, system_prompt, user_message, history).await {
            Ok(response) => return Ok(response),
            Err(e) if attempt < max_attempts => {
                eprintln!("Attempt {attempt} failed: {e}\nRetrying...");
            }
            Err(e) => return Err(e),
        }
    }
    Err("Unreachable".into())
}
```

> [!warning] Common Mistakes
> **Struct field names must match JSON keys** — If the AI returns `"primary_stat"` but your struct has `primary_stats` (with an `s`), deserialization silently fails. Use `#[serde(rename = "...")]` if names differ.
>
> **Forgetting `Option` for nullable fields** — If `ambient_event` can be `null` in JSON but your struct has `pub ambient_event: String`, parsing fails on `null`. Always use `Option<T>` for fields that might be absent.
>
> **Not handling code fences** — Claude often wraps JSON in ` ```json ... ``` ` blocks. The `strip_code_fences` function handles this, but forgetting it means `serde_json::from_str` fails on the backticks.

We can parse the AI's words into typed data now, but there's no loop — no way for the player to choose, roll dice, and hear what happens next. Next stage, we'll wire everything into a playable game loop.

### Checkpoint

- [ ] `parse_ai_response` successfully parses a sample JSON string into `AiResponse`
- [ ] `Option<String>` fields handle both `null` and present values
- [ ] `strip_code_fences` removes markdown wrapping
- [ ] You understand the difference between `Some("value")` and `None`

---

## Stage 12 — The Game Loop: A Playable CLI Adventure

> **Difficulty: Hard**

We have all the ingredients — AI calls, structured responses, dice rolls, stat checks — but they're scattered across separate functions with no orchestration. There's no way for a player to sit down and *play*. We need the game loop: the heartbeat of every game ever made, from Pong to Elden Ring. This stage wires everything together into a real, playable CLI adventure.

> [!info] What You'll Learn
> - Reading user input with `tokio::io` (async stdin)
> - The game loop pattern: prompt → narrate → choose → resolve → repeat
> - Wiring together the quest engine, stat checks, and AI calls
> - Managing conversation history for multi-turn AI context
> - Ownership challenges when passing data between async functions

### The Loop

Every game, from Pong to Elden Ring, has a loop:

```
1. Get input
2. Update state
3. Render output
4. Repeat
```

Ours is:
```
1. AI narrates the scene (Bedrock call)
2. Player reads narration and picks a choice (stdin)
3. Roll dice against the choice's DC (stat check)
4. Feed the result back to the AI
5. Repeat until quest_beat == "resolution"
```

### Reading Input

```rust
use std::io::{self, Write};

/// Read a line from stdin. Returns None on EOF (Ctrl+D).
fn read_input(prompt: &str) -> Option<String> {
    print!("{prompt}");
    io::stdout().flush().ok(); // flush so the prompt appears before input

    let mut input = String::new();
    match io::stdin().read_line(&mut input) {
        Ok(0) => None,       // EOF
        Ok(_) => Some(input.trim().to_string()),
        Err(_) => None,
    }
}
```

We use synchronous `stdin` here — it's simpler and fine for a CLI game. Async stdin is only needed when you must handle input and network calls simultaneously (we don't — we alternate).

### The Stat Check

From Act 1, you have dice rolling. Now we resolve a choice against its DC:

```rust
use rand::Rng;

/// Result of a stat check against a DC.
#[derive(Debug)]
pub struct CheckResult {
    pub roll: i32,
    pub modifier: i32,
    pub total: i32,
    pub dc: i32,
    pub margin: i32,          // total - dc
    pub success: bool,
    pub secondary_hit: bool,  // true if margin >= 3 (secondary stat bonus)
}

/// Roll a d20 + stat modifier against a difficulty class.
pub fn stat_check(stat_value: i32, dc: i32) -> CheckResult {
    let mut rng = rand::thread_rng();
    let roll = rng.gen_range(1..=20);
    let modifier = (stat_value - 10) / 2; // D&D-style modifier
    let total = roll + modifier;
    let margin = total - dc;

    CheckResult {
        roll,
        modifier,
        total,
        dc,
        margin,
        success: margin >= 0,
        secondary_hit: margin >= 3,
    }
}

/// Look up a character's stat value by name.
pub fn get_stat(character: &Character, stat_name: &str) -> i32 {
    match stat_name.to_uppercase().as_str() {
        "STR" => character.stats.strength,
        "DEX" => character.stats.dexterity,
        "CON" => character.stats.constitution,
        "WIS" => character.stats.wisdom,
        "INT" => character.stats.intelligence,
        "CHA" => character.stats.charisma,
        _ => 10, // default if AI returns something unexpected
    }
}
```

### The Game Session

```rust
/// Holds all state for a single play session.
pub struct GameSession {
    pub client: Client,
    pub character: Character,
    pub prompt_builder: PromptBuilder,
    pub history: Vec<Message>,       // conversation history for AI context
    pub turn_summaries: Vec<String>, // for the chronicle compiler (Stage 14)
    pub turn: u32,
}

impl GameSession {
    pub fn new(client: Client, character: Character, prompt_builder: PromptBuilder) -> Self {
        Self {
            client,
            character,
            prompt_builder,
            history: Vec::new(),
            turn_summaries: Vec::new(),
            turn: 0,
        }
    }

    /// Run the game loop until the quest resolves or the player quits.
    pub async fn run(&mut self) -> Result<(), String> {
        println!("\n=== Crónica ===");
        println!("Your quest begins. Type a choice number, or 'quit' to end.\n");

        let system_prompt = self.prompt_builder.build_system_prompt(&self.character);

        // --- Opening turn ---
        let opening_msg = self.prompt_builder.build_opening_message();
        let mut ai_response = call_ai_with_retry(
            &self.client, &system_prompt, &opening_msg, &self.history, 3,
        ).await?;

        // Add the opening exchange to history.
        self.push_history(ConversationRole::User, &opening_msg);
        self.push_history(
            ConversationRole::Assistant,
            &serde_json::to_string(&ai_response).unwrap_or_default(),
        );

        loop {
            self.turn += 1;

            // --- Display narration ---
            println!("\n{}", ai_response.narration);

            if let Some(event) = &ai_response.ambient_event {
                println!("\n  * {event}");
            }

            // --- Display choices ---
            println!();
            for (i, choice) in ai_response.choices.iter().enumerate() {
                println!(
                    "  [{}] {} (DC {} {})",
                    i + 1, choice.label, choice.dc, choice.primary_stat
                );
            }

            // --- Check for quest end ---
            if ai_response.quest_beat == "resolution" {
                println!("\n=== Quest Complete ===");
                break;
            }

            // --- Get player input ---
            let input = match read_input("\n> ") {
                Some(s) if s == "quit" => break,
                Some(s) => s,
                None => break,
            };

            // Parse choice number (1-indexed).
            let choice_idx: usize = match input.parse::<usize>() {
                Ok(n) if n >= 1 && n <= ai_response.choices.len() => n - 1,
                _ => {
                    println!("Pick a number between 1 and {}.", ai_response.choices.len());
                    continue;
                }
            };

            let chosen = &ai_response.choices[choice_idx];

            // --- Stat check ---
            let stat_value = get_stat(&self.character, &chosen.primary_stat);
            let result = stat_check(stat_value, chosen.dc);

            println!(
                "\n  Rolling {} check: d20({}) + modifier({}) = {} vs DC {}",
                chosen.primary_stat, result.roll, result.modifier, result.total, result.dc
            );

            if result.success {
                println!("  Success! (margin: +{})", result.margin);
                if result.secondary_hit {
                    if let Some(sec) = &chosen.secondary_stat {
                        println!("  Bonus! {} secondary stat also triggered!", sec);
                    }
                }
            } else {
                println!("  Failed. (margin: {})", result.margin);
            }

            // --- Build the result message for the AI ---
            let outcome = format!(
                "The player chose: \"{}\". Stat check: {} roll {} + {} = {} vs DC {}. {}{}",
                chosen.label,
                chosen.primary_stat,
                result.roll,
                result.modifier,
                result.total,
                result.dc,
                if result.success { "SUCCESS" } else { "FAILURE" },
                if result.secondary_hit {
                    format!(
                        ". Secondary {} also triggered!",
                        chosen.secondary_stat.as_deref().unwrap_or("?")
                    )
                } else {
                    String::new()
                },
            );

            // Save a summary for the chronicle.
            self.turn_summaries.push(format!(
                "Turn {}: {} — {} (margin {})",
                self.turn,
                chosen.label,
                if result.success { "success" } else { "failure" },
                result.margin,
            ));

            // --- Update tension in prompt builder ---
            self.prompt_builder.tension_level = ai_response.tension_level;
            self.prompt_builder.current_beat =
                QuestBeat::from_str(&ai_response.quest_beat);

            // Rebuild system prompt with updated state.
            let system_prompt = self.prompt_builder.build_system_prompt(&self.character);

            // --- Call AI for next turn ---
            ai_response = call_ai_with_retry(
                &self.client, &system_prompt, &outcome, &self.history, 3,
            ).await?;

            // Update history.
            self.push_history(ConversationRole::User, &outcome);
            self.push_history(
                ConversationRole::Assistant,
                &serde_json::to_string(&ai_response).unwrap_or_default(),
            );
        }

        Ok(())
    }

    /// Add a message to conversation history.
    fn push_history(&mut self, role: ConversationRole, text: &str) {
        if let Ok(msg) = Message::builder()
            .role(role)
            .content(ContentBlock::Text(text.into()))
            .build()
        {
            self.history.push(msg);
        }
    }
}
```

### The Main Function

```rust
#[tokio::main]
async fn main() {
    let config = aws_config::defaults(BehaviorVersion::latest())
        .region(aws_config::Region::new("us-east-1"))
        .load()
        .await;
    let client = Client::new(&config);

    // Create a character (from Act 1).
    let character = Character::new("Kael", "Ranger", Stats {
        strength: 12, dexterity: 16, constitution: 14,
        wisdom: 13, intelligence: 10, charisma: 8,
    });

    let prompt_builder = PromptBuilder {
        realm: "Ashenmoor, a plague-scarred marshland".into(),
        language: "English".into(),
        quest_archetype: "rescue".into(),
        current_beat: QuestBeat::Introduction,
        tension_level: 2,
    };

    let mut session = GameSession::new(client, character, prompt_builder);

    if let Err(e) = session.run().await {
        eprintln!("Game error: {e}");
    }
}
```

### Ownership in the Game Loop

Notice how `self.prompt_builder` is mutated each turn (tension, beat) while `self.client` is borrowed for API calls. Rust's borrow checker ensures you don't accidentally alias mutable state. The key pattern: **rebuild the system prompt string each turn** rather than trying to mutate a shared reference.

```rust
// This works — we create a new String each turn:
let system_prompt = self.prompt_builder.build_system_prompt(&self.character);

// This would NOT work — can't hold a &str reference while mutating prompt_builder:
// let system_prompt = &self.cached_prompt; // borrow
// self.prompt_builder.tension_level = 3;   // mutate — ERROR: already borrowed
```

> [!warning] Common Mistakes
> **Holding references across `.await`** — If you borrow `&self.character` and then `.await` an API call, the borrow must live across the await point. This works for `&self` borrows in `async fn` methods, but can cause issues with temporary references. When in doubt, clone the data before the await.
>
> **Growing history without limit** — Each turn adds 2 messages to history. After 50 turns, that's 100 messages. Bedrock has token limits. In production, you'd trim old history or summarize it. For now, games are short enough that this isn't a problem.
>
> **Parsing "1" vs "01"** — `input.parse::<usize>()` handles both. But empty input or letters return `Err`, which our match catches gracefully.

We have a playable adventure now — but combat is still just a stat check with a single outcome. Real combat needs multiple exchanges, a margin band system, and the tension of not knowing whether your next swing will be a crushing blow or a catastrophic fumble. Next stage, we'll forge the combat system.

### Checkpoint

- [ ] `cargo run` starts an interactive game session
- [ ] AI narrates scenes and presents 3 choices
- [ ] Typing `1`, `2`, or `3` triggers a stat check and advances the story
- [ ] Typing `quit` exits cleanly
- [ ] The game loop continues until `quest_beat == "resolution"`

---

## Stage 13 — Combat: Narrative Exchanges and the Margin Band

> **Difficulty: Hard**

Our game loop handles exploration and choices, but combat is a gaping hole — a single stat check that either succeeds or fails, with no drama, no back-and-forth, no sense of danger. Real combat needs multiple exchanges where the tide can turn, where a desperate defend might save your life, and where the margin between triumph and catastrophe is measured in a single die roll. This stage builds the combat engine.

> [!info] What You'll Learn
> - The 4-tier margin band system from spec §6
> - Modeling combat state with `CombatState` and `Enemy`
> - Implementing 3-5 exchange fights with narrative resolution
> - Damage calculation: weapon die x margin tier multiplier
> - Defend, Item, Flee, and Special actions

### Combat Philosophy

Crónica doesn't use traditional turn-based RPG combat with initiative rolls and attack bonuses. Instead, combat is a series of **narrative exchanges** — each one a dramatic moment where the player acts and the outcome is determined by a single roll against the enemy's **threat DC**. This design exists because traditional RPG combat (roll to hit, roll damage, next turn) is tedious in a text-based game — it generates dozens of mechanical steps with no narrative payoff. Exchange-based combat compresses each round into a single dramatic moment with a clear outcome.

The result falls on a **4-tier margin band** that maps the gap between your roll and the DC to narrative intensity — the wider the margin, the more dramatic the outcome:

| Tier | Margin | Name | Effect |
|------|--------|------|--------|
| 1 | >= +5 | Crushing | Full weapon damage, bonus effect |
| 2 | 0 to +4 | Clean | Full weapon damage |
| 3 | -1 to -4 | Mixed | Half damage dealt, half damage taken |
| 4 | <= -5 | Failure | No damage dealt, full damage taken |

### The Enemy

Right now we have a margin band system on paper, but no data type to represent the creatures our heroes will face. We need an enemy struct — deliberately simple, because complexity in the enemy model would slow down the narrative pace.

Enemies are simple — a single threat DC, HP, and damage die:

```rust
/// An enemy in narrative combat. No attack bonus or AC —
/// just a threat DC that the player rolls against.
#[derive(Debug, Clone)]
pub struct Enemy {
    pub name: String,
    pub threat_dc: i32,   // the DC for all checks against this enemy
    pub hp: i32,
    pub max_hp: i32,
    pub damage_die: i32,  // e.g., 8 means d8 damage to the player
}

impl Enemy {
    pub fn is_alive(&self) -> bool {
        self.hp > 0
    }
}
```

### The Margin Band

```rust
/// The four combat outcome tiers.
#[derive(Debug, Clone, Copy)]
pub enum MarginTier {
    Crushing,  // margin >= +5
    Clean,     // margin 0 to +4
    Mixed,     // margin -1 to -4
    Failure,   // margin <= -5
}

impl MarginTier {
    /// Determine the tier from a roll margin (total - DC).
    pub fn from_margin(margin: i32) -> Self {
        match margin {
            m if m >= 5 => MarginTier::Crushing,
            m if m >= 0 => MarginTier::Clean,
            m if m >= -4 => MarginTier::Mixed,
            _ => MarginTier::Failure,
        }
    }

    /// Multiplier for player damage: crushing=1.5, clean=1.0, mixed=0.5, failure=0.
    pub fn damage_multiplier(&self) -> f64 {
        match self {
            MarginTier::Crushing => 1.5,
            MarginTier::Clean => 1.0,
            MarginTier::Mixed => 0.5,
            MarginTier::Failure => 0.0,
        }
    }

    /// Multiplier for enemy damage: crushing=0, clean=0, mixed=0.5, failure=1.0.
    pub fn enemy_damage_multiplier(&self) -> f64 {
        match self {
            MarginTier::Crushing => 0.0,
            MarginTier::Clean => 0.0,
            MarginTier::Mixed => 0.5,
            MarginTier::Failure => 1.0,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            MarginTier::Crushing => "CRUSHING",
            MarginTier::Clean => "CLEAN",
            MarginTier::Mixed => "MIXED",
            MarginTier::Failure => "FAILURE",
        }
    }
}
```

### Combat Actions

The player doesn't just attack — they can defend, use items, flee, or try something special:

```rust
/// What the player chooses to do in a combat exchange.
#[derive(Debug, Clone)]
pub enum CombatAction {
    Attack { stat: String },       // standard attack using a stat
    Defend,                        // halve incoming damage this exchange
    UseItem { item_name: String }, // use an inventory item
    Flee,                          // attempt to escape (DEX check)
    Special { description: String }, // creative action (GM/AI decides stat + DC)
}
```

### The Combat State

```rust
use rand::Rng;

/// Tracks the state of an ongoing combat encounter.
pub struct CombatState {
    pub enemy: Enemy,
    pub exchange: u32,       // current exchange number (1-indexed)
    pub max_exchanges: u32,  // 3-5 per fight
    pub player_weapon_die: i32, // e.g., 8 for a d8 weapon
    pub defending: bool,     // true if player chose Defend this exchange
    pub fled: bool,          // true if player successfully fled
}

impl CombatState {
    pub fn new(enemy: Enemy, player_weapon_die: i32) -> Self {
        let mut rng = rand::thread_rng();
        Self {
            enemy,
            exchange: 0,
            max_exchanges: rng.gen_range(3..=5),
            player_weapon_die,
            defending: false,
            fled: false,
        }
    }

    /// Resolve one exchange of combat. Returns a narrative summary.
    pub fn resolve_exchange(
        &mut self,
        action: &CombatAction,
        character: &mut Character,
    ) -> ExchangeResult {
        self.exchange += 1;
        self.defending = false;
        let mut rng = rand::thread_rng();

        match action {
            CombatAction::Attack { stat } => {
                let stat_value = get_stat(character, stat);
                let check = stat_check(stat_value, self.enemy.threat_dc);
                let tier = MarginTier::from_margin(check.margin);

                // Player damage to enemy.
                let raw_damage = rng.gen_range(1..=self.player_weapon_die);
                let player_damage =
                    (raw_damage as f64 * tier.damage_multiplier()).round() as i32;
                self.enemy.hp -= player_damage;

                // Enemy damage to player.
                let raw_enemy_dmg = rng.gen_range(1..=self.enemy.damage_die);
                let enemy_damage =
                    (raw_enemy_dmg as f64 * tier.enemy_damage_multiplier()).round() as i32;
                character.hp -= enemy_damage;

                ExchangeResult {
                    exchange: self.exchange,
                    action_desc: format!("Attack with {stat}"),
                    roll: check.roll,
                    total: check.total,
                    dc: check.dc,
                    margin: check.margin,
                    tier,
                    player_damage,
                    enemy_damage,
                    enemy_hp: self.enemy.hp,
                    player_hp: character.hp,
                    combat_over: !self.enemy.is_alive()
                        || character.hp <= 0
                        || self.exchange >= self.max_exchanges,
                }
            }

            CombatAction::Defend => {
                self.defending = true;
                // Enemy still attacks, but damage is halved.
                let raw_enemy_dmg = rng.gen_range(1..=self.enemy.damage_die);
                let enemy_damage = raw_enemy_dmg / 2; // integer division rounds down
                character.hp -= enemy_damage;

                ExchangeResult {
                    exchange: self.exchange,
                    action_desc: "Defend".into(),
                    roll: 0, total: 0, dc: self.enemy.threat_dc,
                    margin: 0,
                    tier: MarginTier::Clean,
                    player_damage: 0,
                    enemy_damage,
                    enemy_hp: self.enemy.hp,
                    player_hp: character.hp,
                    combat_over: character.hp <= 0
                        || self.exchange >= self.max_exchanges,
                }
            }

            CombatAction::Flee => {
                let check = stat_check(
                    get_stat(character, "DEX"),
                    self.enemy.threat_dc,
                );
                if check.success {
                    self.fled = true;
                    ExchangeResult {
                        exchange: self.exchange,
                        action_desc: "Flee (success)".into(),
                        roll: check.roll, total: check.total,
                        dc: check.dc, margin: check.margin,
                        tier: MarginTier::Clean,
                        player_damage: 0, enemy_damage: 0,
                        enemy_hp: self.enemy.hp,
                        player_hp: character.hp,
                        combat_over: true,
                    }
                } else {
                    // Failed flee — enemy gets a free hit.
                    let enemy_damage = rng.gen_range(1..=self.enemy.damage_die);
                    character.hp -= enemy_damage;
                    ExchangeResult {
                        exchange: self.exchange,
                        action_desc: "Flee (failed)".into(),
                        roll: check.roll, total: check.total,
                        dc: check.dc, margin: check.margin,
                        tier: MarginTier::Failure,
                        player_damage: 0, enemy_damage,
                        enemy_hp: self.enemy.hp,
                        player_hp: character.hp,
                        combat_over: character.hp <= 0
                            || self.exchange >= self.max_exchanges,
                    }
                }
            }

            CombatAction::UseItem { item_name } => {
                // Simplified: items heal 2d6 HP.
                let heal = rng.gen_range(1..=6) + rng.gen_range(1..=6);
                character.hp += heal;
                if character.hp > character.max_hp {
                    character.hp = character.max_hp;
                }
                ExchangeResult {
                    exchange: self.exchange,
                    action_desc: format!("Use {item_name} (healed {heal} HP)"),
                    roll: 0, total: 0, dc: 0, margin: 0,
                    tier: MarginTier::Clean,
                    player_damage: 0, enemy_damage: 0,
                    enemy_hp: self.enemy.hp,
                    player_hp: character.hp,
                    combat_over: self.exchange >= self.max_exchanges,
                }
            }

            CombatAction::Special { description } => {
                // Special actions use WIS check at threat_dc + 2.
                let check = stat_check(
                    get_stat(character, "WIS"),
                    self.enemy.threat_dc + 2,
                );
                let tier = MarginTier::from_margin(check.margin);
                let raw_damage = rng.gen_range(1..=self.player_weapon_die);
                // Specials do 1.5x on success, 0 on failure.
                let player_damage = if check.success {
                    (raw_damage as f64 * 1.5).round() as i32
                } else {
                    0
                };
                self.enemy.hp -= player_damage;

                ExchangeResult {
                    exchange: self.exchange,
                    action_desc: format!("Special: {description}"),
                    roll: check.roll, total: check.total,
                    dc: check.dc, margin: check.margin,
                    tier,
                    player_damage,
                    enemy_damage: 0,
                    enemy_hp: self.enemy.hp,
                    player_hp: character.hp,
                    combat_over: !self.enemy.is_alive()
                        || character.hp <= 0
                        || self.exchange >= self.max_exchanges,
                }
            }
        }
    }
}

/// The result of a single combat exchange.
#[derive(Debug)]
pub struct ExchangeResult {
    pub exchange: u32,
    pub action_desc: String,
    pub roll: i32,
    pub total: i32,
    pub dc: i32,
    pub margin: i32,
    pub tier: MarginTier,
    pub player_damage: i32,
    pub enemy_damage: i32,
    pub enemy_hp: i32,
    pub player_hp: i32,
    pub combat_over: bool,
}

impl ExchangeResult {
    pub fn display(&self, enemy_name: &str) {
        println!("\n--- Exchange {} ---", self.exchange);
        println!("  Action: {}", self.action_desc);
        if self.roll > 0 {
            println!(
                "  Roll: d20({}) + mod = {} vs DC {} => {} [{}]",
                self.roll, self.total, self.dc, self.margin,
                self.tier.as_str()
            );
        }
        if self.player_damage > 0 {
            println!("  You deal {} damage to {}", self.player_damage, enemy_name);
        }
        if self.enemy_damage > 0 {
            println!("  {} deals {} damage to you", enemy_name, self.enemy_damage);
        }
        println!(
            "  HP: You {}/{} | {} {}/{}",
            self.player_hp, self.player_hp, // max_hp not tracked here, display approx
            enemy_name, self.enemy_hp.max(0),
            self.dc // using dc as placeholder; in real code use enemy.max_hp
        );
    }
}
```

### Running a Combat Encounter

```rust
/// Run a combat encounter in the CLI.
pub fn run_combat(character: &mut Character, enemy: Enemy) -> String {
    let weapon_die = 8; // d8 weapon — could come from inventory
    let mut combat = CombatState::new(enemy.clone(), weapon_die);

    println!("\n=== COMBAT: {} ===", enemy.name);
    println!(
        "  Threat DC: {} | Enemy HP: {} | Exchanges: {}",
        enemy.threat_dc, enemy.hp, combat.max_exchanges
    );

    loop {
        println!("\n  [1] Attack (STR)  [2] Attack (DEX)  [3] Defend  [4] Flee");
        let input = match read_input("  Combat> ") {
            Some(s) => s,
            None => break,
        };

        let action = match input.as_str() {
            "1" => CombatAction::Attack { stat: "STR".into() },
            "2" => CombatAction::Attack { stat: "DEX".into() },
            "3" => CombatAction::Defend,
            "4" => CombatAction::Flee,
            _ => {
                println!("  Pick 1-4.");
                continue;
            }
        };

        let result = combat.resolve_exchange(&action, character);
        result.display(&enemy.name);

        if result.combat_over {
            break;
        }
    }

    // Return a summary for the AI / chronicle.
    if combat.fled {
        format!("COMBAT: Player fled from {}", enemy.name)
    } else if character.hp <= 0 {
        format!("COMBAT: Player was defeated by {}", enemy.name)
    } else if !combat.enemy.is_alive() {
        format!("COMBAT: Player defeated {}", enemy.name)
    } else {
        format!(
            "COMBAT: Stalemate with {} after {} exchanges",
            enemy.name, combat.exchange
        )
    }
}
```

### Integrating Combat into the Game Loop

In Stage 12's game loop, when the AI's narration triggers combat (you could detect keywords like "combat" in the `quest_beat`, or add a `combat` field to `AiResponse`), call `run_combat` and feed the result back to the AI:

```rust
// Inside the game loop, after parsing ai_response:
if ai_response.quest_beat == "combat" {
    let enemy = Enemy {
        name: "Marsh Wraith".into(),
        threat_dc: 13,
        hp: 20,
        max_hp: 20,
        damage_die: 6,
    };
    let combat_summary = run_combat(&mut self.character, enemy);
    // Feed combat result to AI for next narration.
    ai_response = call_ai_with_retry(
        &self.client, &system_prompt, &combat_summary, &self.history, 3,
    ).await?;
}
```

> [!warning] Common Mistakes
> **Mutable borrow conflicts in combat** — `resolve_exchange` takes `&mut character` and `&mut self`. Since `character` is a field of the game session, you can't call `self.combat.resolve_exchange(&action, &mut self.character)` — that's two mutable borrows of `self`. Solution: pass `character` separately, or extract combat into a standalone function (as we did with `run_combat`).
>
> **Integer overflow on negative HP** — `character.hp -= enemy_damage` can go negative. That's fine for i32, but display it as `hp.max(0)` to avoid showing "-3 HP".
>
> **Forgetting the exchange limit** — Without `max_exchanges`, combat could loop forever if neither side dies. Always cap at 3-5 exchanges.

Combat sings with steel and consequence now — but when the quest ends, the story evaporates. No record, no legend, no proof the adventure happened. Next stage, we'll build the chronicle compiler that transforms raw session logs into literary prose.

### Checkpoint

- [ ] Combat runs as a sub-loop within the game
- [ ] The 4-tier margin band correctly categorizes rolls
- [ ] Damage scales with the margin tier (crushing > clean > mixed > failure)
- [ ] Defend halves incoming damage, Flee requires a DEX check
- [ ] Combat ends when HP hits 0, exchanges run out, or the player flees

---

## Stage 14 — The Chronicle Compiler: Writing Your Story

> **Difficulty: Medium**

The quest ends, the hero survives (or doesn't), and then... nothing. The raw session log reads like a spreadsheet: "Turn 3: Kick down the door — success (margin +7)." That's not a legend — that's bookkeeping. We need a compiler that takes those mechanical summaries and transforms them into a literary short story worthy of the chronicle. This stage also introduces the multi-model strategy: fast and cheap for gameplay, slow and beautiful for the final record.

> [!info] What You'll Learn
> - Calling a different Bedrock model (Sonnet for quality writing)
> - Assembling session data into a compilation prompt
> - Formatting the output as a chronicle entry (spec §9.2)
> - Reusing the `call_ai` pattern with different parameters

### The Concept

Throughout the game, we've been collecting `turn_summaries` — short strings like "Turn 3: Kick down the door — success (margin +7)". After the quest ends, we send all of these to a **more capable model** (Claude Sonnet) and ask it to compile them into a 500-1000 word short story.

This is the **chronicle** — a permanent record of the player's adventure, written in literary prose.

### The Sonnet Model

We use Claude Haiku for gameplay (fast, cheap, good enough for structured JSON) and Claude Sonnet for the chronicle (slower, more expensive, but writes beautifully):

```rust
/// Model IDs for different tasks.
const HAIKU_MODEL: &str = "anthropic.claude-3-5-haiku-20241022-v1:0";
const SONNET_MODEL: &str = "anthropic.claude-sonnet-4-20250514-v1:0";
```

### The Chronicle Compiler

```rust
/// Compile turn summaries into a literary short story.
pub async fn compile_chronicle(
    client: &Client,
    character: &Character,
    realm: &str,
    turn_summaries: &[String],
) -> Result<String, String> {
    if turn_summaries.is_empty() {
        return Ok("No adventures to chronicle.".into());
    }

    // Build the session log from turn summaries.
    let session_log = turn_summaries
        .iter()
        .enumerate()
        .map(|(i, s)| format!("{}. {s}", i + 1))
        .collect::<Vec<_>>()
        .join("\n");

    let system_prompt = format!(
        r#"You are a literary chronicler. You transform game session logs into
evocative short stories (500-1000 words).

Write in third person past tense. Use vivid sensory details.
The protagonist is {name}, a {class} adventuring in {realm}.

Style: dark fantasy, literary fiction. Think Ursula K. Le Guin meets Joe Abercrombie.
Do NOT include game mechanics (dice rolls, DCs, stats) in the story.
Transform mechanical outcomes into narrative moments."#,
        name = character.name,
        class = character.class,
        realm = realm,
    );

    let user_message = format!(
        "Compile this session log into a short story:\n\n{session_log}"
    );

    // Build the message for Sonnet.
    let message = Message::builder()
        .role(ConversationRole::User)
        .content(ContentBlock::Text(user_message))
        .build()
        .map_err(|e| format!("Failed to build message: {e}"))?;

    let response = client
        .converse()
        .model_id(SONNET_MODEL) // Sonnet for quality writing
        .system(SystemContentBlock::Text(system_prompt))
        .messages(message)
        .send()
        .await
        .map_err(|e| format!("Chronicle compilation failed: {e}"))?;

    Ok(extract_text(response))
}
```

### The Chronicle Entry Format

Per spec §9.2, the chronicle is formatted as a dated entry. The box-drawing border and formal structure exist because chronicles are meant to be *shared* — posted in Discord's `#the-chronicle` channel (Act 3) where other players can read them. A plain text dump wouldn't feel like a legend worth reading:

```rust
use chrono::Local; // or just use a simple date string

/// Format the compiled story as a chronicle entry.
pub fn format_chronicle(
    character_name: &str,
    realm: &str,
    story: &str,
) -> String {
    // Simple date without adding chrono as a dependency.
    let date = "the Age of Ash"; // thematic placeholder

    format!(
        r#"
╔══════════════════════════════════════════════════════╗
║              THE CHRONICLES OF CRÓNICA               ║
╠══════════════════════════════════════════════════════╣

  {character_name} — {realm}
  Recorded in {date}

──────────────────────────────────────────────────────

{story}

──────────────────────────────────────────────────────
  End of Chronicle Entry
╚══════════════════════════════════════════════════════╝
"#
    )
}
```

### Wiring It Into the Game Session

Add the chronicle compilation at the end of `GameSession::run()`:

```rust
// At the end of the run() method, after the game loop breaks:

println!("\nCompiling your chronicle...\n");

match compile_chronicle(
    &self.client,
    &self.character,
    &self.prompt_builder.realm,
    &self.turn_summaries,
).await {
    Ok(story) => {
        let chronicle = format_chronicle(
            &self.character.name,
            &self.prompt_builder.realm,
            &story,
        );
        println!("{chronicle}");

        // Optionally save to file.
        let filename = format!("chronicle_{}.txt", self.character.name.to_lowercase());
        if std::fs::write(&filename, &chronicle).is_ok() {
            println!("Chronicle saved to {filename}");
        }
    }
    Err(e) => {
        eprintln!("Failed to compile chronicle: {e}");
        // Fall back to raw summaries.
        println!("\n--- Raw Session Log ---");
        for summary in &self.turn_summaries {
            println!("  {summary}");
        }
    }
}
```

### Why Two Models?

| | Haiku | Sonnet |
|---|---|---|
| **Speed** | ~200ms | ~2-5s |
| **Cost** | ~$0.001/turn | ~$0.01/call |
| **Use** | Gameplay (many calls) | Chronicle (one call) |
| **Strength** | Fast structured JSON | Beautiful prose |

During a 20-turn quest, Haiku handles 20+ API calls quickly and cheaply. The chronicle is a single call at the end where quality matters more than speed.

### The Complete Flow

```
Game Start
  │
  ├─ Turn 1: AI narrates (Haiku) → player chooses → stat check → summary saved
  ├─ Turn 2: AI narrates (Haiku) → player chooses → stat check → summary saved
  ├─ ...
  ├─ Turn N: quest_beat == "resolution"
  │
  └─ Chronicle Compiler (Sonnet)
       │
       ├─ Input: all turn summaries + character context
       ├─ Output: 500-1000 word short story
       └─ Saved to chronicle_{name}.txt
```

> [!warning] Common Mistakes
> **Using Sonnet for gameplay** — It's 10-25x slower and more expensive than Haiku. The structured JSON responses don't need Sonnet's writing quality. Save it for the chronicle.
>
> **Sending raw game mechanics to the chronicler** — The prompt explicitly says "Do NOT include dice rolls, DCs, stats." But if your turn summaries contain "DC 14 STR check margin +3", the AI might echo them. Keep summaries narrative: "Kicked down the door — success" not "STR check DC 14 roll 17 margin +3".
>
> **Not handling empty sessions** — If the player quits immediately, `turn_summaries` is empty. The early return handles this gracefully.

The voice has spoken and the chronicle is written — but only you can hear it, alone in a terminal. In Act 3, we'll give Crónica a gateway to the world: a Discord bot where players summon heroes with slash commands and write legends that echo across channels.

### Checkpoint

- [ ] After a quest ends, the chronicle compiler runs automatically
- [ ] The output is a readable short story, not a game log
- [ ] The chronicle is formatted with the box-drawing border
- [ ] The story is saved to a `.txt` file
- [ ] You understand why Haiku handles gameplay and Sonnet handles the chronicle

---

## Act 2 Complete

You now have a fully playable CLI RPG powered by AI. Here's what you built:

| Stage | What | Key Concept |
|-------|------|-------------|
| 9 | First Bedrock call | async/await, tokio runtime, AWS SDK |
| 10 | System prompt | PromptBuilder, format!, game context injection |
| 11 | JSON parsing | serde deserialization, Option, error recovery |
| 12 | Game loop | stdin, state management, multi-turn AI conversation |
| 13 | Combat | Margin bands, exchange resolution, mutable borrows |
| 14 | Chronicle | Multi-model strategy, literary compilation |

**In Act 3**, Crónica gets a body — a Discord bot. You'll learn the `poise` framework, slash commands, and how to run the game loop inside Discord's event system. The AI narrator will speak through Discord messages, and multiple players can run quests simultaneously.

> *The voice has spoken. The chronicle is written. Now it's time to give Crónica a gateway to the world.*
