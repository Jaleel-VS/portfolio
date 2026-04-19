# Cartógrafo — Build a DNS Resolver From Scratch in Rust

> *Every time you type a name, something translates it into an address. That something is DNS — the internet's oldest and most critical naming system. You're going to build it yourself, byte by byte, packet by packet, from the root of the internet to the final answer.*

*Cartógrafo* means "cartographer" in Spanish and Portuguese — a mapmaker. DNS is the internet's map: it translates human names (`google.com`) into machine addresses (`142.250.80.46`). Your resolver will start from the 13 root servers that anchor the entire system and walk the hierarchy until it finds the answer.

**Project:** `~/juk/cartografo/` (Rust 2024 edition)

**Prerequisites:** Python experience. No Rust or networking knowledge required. You should know what an IP address is and have used `ping` or `curl` before. Everything else is taught from scratch.

**What makes this different from your other Rust courses:** This is the first course where you work with **raw bytes and network protocols**. No JSON, no text formats — you'll read and write binary data at the bit level, send UDP packets to real servers on the internet, and parse the responses byte by byte. By the end, binary protocols will feel as natural as reading JSON.

> [!warning] Not for production use
> This is a learning project. For real-world DNS resolution, use established resolvers like [Unbound](https://nlnetlabs.nl/projects/unbound/about/), [CoreDNS](https://coredns.io/), or [hickory-dns](https://github.com/hickory-dns/hickory-dns). Our resolver lacks DNSSEC validation, proper source port randomization, and many edge cases that production resolvers handle. Rolling your own DNS resolver for production use can introduce security vulnerabilities (cache poisoning, amplification attacks) that established software has spent years hardening against.

---

## Design Decisions

### Why DNS?

DNS is the protocol that makes the internet usable. Without it, you'd need to memorize `142.250.80.46` instead of typing `google.com`. It's also one of the simplest binary protocols — a DNS packet is just 512 bytes of structured data. Simple enough to understand completely, complex enough to teach real protocol engineering.

Every developer interacts with DNS hundreds of times a day (every HTTP request starts with a DNS lookup) but almost nobody knows what actually happens. Building a resolver demystifies it.

### Why bytes matter

Most programming happens at the text level — JSON, YAML, SQL, HTTP headers. But underneath, everything is bytes. Network packets, file formats, encryption, compression — they all operate on raw binary data. This course teaches you to think in bytes, which unlocks an entire layer of computing that text-level programming hides.

After this course, when someone says "the TTL is a 32-bit unsigned integer at offset 6," you'll know exactly what that means and how to read it.

### The project

The learner builds a recursive DNS resolver called `cartografo`. It can:

1. Send DNS queries over UDP
2. Parse DNS response packets (binary format)
3. Recursively resolve names starting from the root servers
4. Cache answers to avoid redundant lookups
5. Handle common record types (A, AAAA, CNAME, MX, NS, TXT)
6. Run as a local DNS server that other programs can use

### Tone

Exploratory and wonder-driven. You're mapping unknown territory — each query is a journey from the root of the internet to the answer. The tone is curious, precise, and occasionally amazed at how elegantly DNS works despite being designed in 1983.

---

## Course Map

### [[Act 1 - The First Query]] — Bytes, Packets, and UDP (Stages 1-8)

You learn to think in bytes. You build a DNS query packet by hand — placing each field at the correct offset, encoding a domain name into the wire format, and sending it over UDP. Then you parse the response, byte by byte, extracting the answer. Along the way you learn the Rust module system, write your first tests, and start using `Result` for error handling.

| # | Stage | Concept | Difficulty | ~Time |
|---|---|---|---|---|
| 1 | The Cartographer's Desk | `cargo new`, project setup, sending your first UDP packet | Very Easy | 25 min |
| 2 | Thinking in Bytes | Bits, bytes, endianness — `u8`, `u16`, `u32`, big-endian vs little-endian, `to_be_bytes()` | Easy | 50 min |
| 3 | The DNS Header | 12 bytes that control everything — ID, flags, counts. Module system, first tests, `Result<T,E>` | Easy | 60 min |
| 4 | Encoding a Name | DNS wire format for domain names — length-prefixed labels, `&str` vs `String` | Easy | 45 min |
| 5 | The Question Section | Combining header + name + query type into a complete DNS query packet. Enums | Medium | 50 min |
| 6 | Sending the Query | `UdpSocket`, sending to `8.8.8.8:53`, receiving the response | Medium | 45 min |
| 7 | Parsing the Response Header | `PacketParser` cursor pattern, lifetimes (`'a`), `?` operator chaining | Medium | 60 min |
| 8 | Reading the Answer | Resource records, IPv4 from 4 bytes, ownership and `.to_vec()` | Medium | 60 min |

### [[Act 2 - The Hierarchy]] — Recursive Resolution (Stages 9-15)

You stop asking Google (`8.8.8.8`) and start asking the internet directly. Starting from the 13 root servers, you follow referrals down the hierarchy: root → TLD → authoritative → answer. This is how DNS actually works.

| # | Stage | Concept | Difficulty | ~Time |
|---|---|---|---|---|
| 9 | The Root of Everything | The 13 root servers, hardcoded root hints, querying a root server | Easy | 45 min |
| 10 | Following Referrals | NS records and glue records, multi-module projects, `crate::` paths | Medium | 60 min |
| 11 | The Recursive Walk | Building the full recursive resolver — loop until answer or error | Hard | 75 min |
| 12 | Name Compression | DNS pointer compression — the `0xC0` trick that saves bandwidth | Medium | 55 min |
| 13 | CNAME Chains | Following aliases, ownership with `String` vs `&str` in loops | Medium | 50 min |
| 14 | Record Types | A, AAAA, CNAME, MX, NS, TXT, SOA — parsing each type's RDATA | Medium | 60 min |
| 15 | Error Handling | Custom error enums, `ResolveError`, `Display` trait, retries | Medium | 50 min |

### [[Act 3 - The Cache]] — Performance and Correctness (Stages 16-21)

A resolver that queries the root for every lookup is slow and rude (root servers handle billions of queries daily). Caching stores answers so repeated lookups are instant. But caching introduces complexity: TTLs, negative caching, cache poisoning.

| # | Stage | Concept | Difficulty | ~Time |
|---|---|---|---|---|
| 16 | The Map Room | In-memory cache with TTL expiry — `HashMap`, `Instant`, `&mut self` | Medium | 55 min |
| 17 | Negative Caching | Caching NXDOMAIN — enum variants with data, SOA minimum TTL | Medium | 40 min |
| 18 | Cache Poisoning | Transaction ID randomization, bailiwick checking, why DNSSEC exists | Medium | 45 min |
| 19 | Measuring Performance | `Instant::now()` timing, cache hit rates, cold vs warm comparison | Easy | 30 min |
| 20 | Concurrent Queries | `tokio` async runtime, `Arc<Mutex<>>`, async UDP | Hard | 75 min |
| 21 | The Local Server | Binding to `127.0.0.1:5353`, accepting queries from `dig`, building responses | Medium | 55 min |

### [[Act 4 - The Complete Map]] — Production Features (Stages 22-27)

The resolver works but it's a single-threaded toy. Act 4 makes it production-grade: TCP fallback for large responses, EDNS for modern DNS features, a CLI that's actually pleasant to use, and a comprehensive integration test.

| # | Stage | Concept | Difficulty | ~Time |
|---|---|---|---|---|
| 22 | TCP Fallback | TC flag, TCP DNS framing (2-byte length prefix), `TcpStream` | Medium | 50 min |
| 23 | EDNS(0) | OPT pseudo-record, 4096-byte UDP, DO flag | Medium | 50 min |
| 24 | The CLI | `clap` derive macros, subcommands, `--type`, `--trace` flags | Easy | 40 min |
| 25 | Pretty Output | `colored` crate, trace mode, `dig`-like formatting | Easy | 35 min |
| 26 | Configuration | TOML config with `serde`, `#[serde(default)]`, `Config::load` | Medium | 45 min |
| 27 | The Complete Cartógrafo | Integration tests, shell test script, comparison against `dig` | Medium | 50 min |

### [[Reference Guide]]

DNS packet format (RFC 1035), record type reference, header flags, name encoding, compression pointers, common response codes, byte manipulation patterns in Rust, UDP/TCP socket patterns, `tokio` async patterns, module system reference, testing patterns, error handling patterns.

---

## Totals

| Act | Stages | Est. Time |
|---|---|---|
| The First Query | 8 | ~6.5 hrs |
| The Hierarchy | 7 | ~6.5 hrs |
| The Cache | 6 | ~5 hrs |
| The Complete Map | 6 | ~4.5 hrs |
| **Total** | **27** | **~22.5 hrs** |

## Tech Stack

| Crate | Version | Introduced |
|---|---|---|
| (std::net) | — | Stage 1 |
| tokio | 1 | Stage 20 |
| clap | 4 | Stage 24 |
| colored | 2 | Stage 25 |
| serde | 1 | Stage 26 |
| toml | 0.8 | Stage 26 |

Deliberately minimal. The entire DNS protocol is implemented by hand — no `trust-dns` or `hickory-dns`. The standard library's `UdpSocket` and `TcpStream` are all you need for networking.

## What You'll Understand After This Course

- What actually happens between typing `google.com` and getting a webpage
- How to read and write binary protocols (not just DNS — the skills transfer to any protocol)
- Why DNS uses UDP (speed) and when it falls back to TCP (large responses)
- What the 13 root servers are and why there are exactly 13
- Why DNS caching exists and how TTLs work
- What a CNAME is and why `www.` sometimes breaks things
- How DNS cache poisoning works and how to prevent it
- Why `dig +trace` shows the full resolution path
- How to think in bytes — `u16::from_be_bytes([buf[0], buf[1]])` will feel natural
- What big-endian means and why network protocols use it
- How Rust's ownership system prevents bugs in network code
- How to write tests that verify binary protocol implementations
- How to structure a multi-module Rust project
