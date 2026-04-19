# Cartógrafo — Build a DNS Resolver From Scratch in Rust

> *Every time you type a name, something translates it into an address. That something is DNS — the internet's oldest and most critical naming system. You're going to build it yourself, byte by byte, packet by packet, from the root of the internet to the final answer.*

*Cartógrafo* means "cartographer" in Spanish and Portuguese — a mapmaker. DNS is the internet's map: it translates human names (`google.com`) into machine addresses (`142.250.80.46`). Your resolver will start from the 13 root servers that anchor the entire system and walk the hierarchy until it finds the answer.

**Project:** `~/juk/cartografo/` (Rust 2024 edition)

**Prerequisites:** Python experience. No Rust or networking knowledge required. You should know what an IP address is and have used `ping` or `curl` before. Everything else is taught from scratch.

**What makes this different from your other Rust courses:** This is the first course where you work with **raw bytes and network protocols**. No JSON, no text formats — you'll read and write binary data at the bit level, send UDP packets to real servers on the internet, and parse the responses byte by byte. By the end, binary protocols will feel as natural as reading JSON.

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

You learn to think in bytes. You build a DNS query packet by hand — placing each field at the correct offset, encoding a domain name into the wire format, and sending it over UDP. Then you parse the response, byte by byte, extracting the answer.

| # | Stage | Concept | Difficulty | ~Time |
|---|---|---|---|---|
| 1 | The Cartographer's Desk | `cargo new`, project setup, sending your first UDP packet | Very Easy | 15 min |
| 2 | Thinking in Bytes | Bits, bytes, endianness — `u8`, `u16`, `u32`, big-endian vs little-endian, `to_be_bytes()` | Easy | 35 min |
| 3 | The DNS Header | 12 bytes that control everything — ID, flags, counts. Building a header struct from the RFC | Easy | 40 min |
| 4 | Encoding a Name | The DNS wire format for domain names — length-prefixed labels, the trailing zero | Easy | 30 min |
| 5 | The Question Section | Combining header + name + query type into a complete DNS query packet | Medium | 40 min |
| 6 | Sending the Query | `UdpSocket`, sending to `8.8.8.8:53`, receiving the response | Medium | 35 min |
| 7 | Parsing the Response Header | Reading 12 bytes back into a struct — `from_be_bytes()`, bitwise flag extraction | Medium | 45 min |
| 8 | Reading the Answer | Parsing resource records — name, type, class, TTL, data length, IP address | Medium | 50 min |

### [[Act 2 - The Hierarchy]] — Recursive Resolution (Stages 9-15)

You stop asking Google (`8.8.8.8`) and start asking the internet directly. Starting from the 13 root servers, you follow referrals down the hierarchy: root → TLD → authoritative → answer. This is how DNS actually works.

| # | Stage | Concept | Difficulty | ~Time |
|---|---|---|---|---|
| 9 | The Root of Everything | The 13 root servers, hardcoded root hints, querying a root server | Easy | 30 min |
| 10 | Following Referrals | NS records and glue records — the root says "ask .com", .com says "ask google.com's server" | Medium | 50 min |
| 11 | The Recursive Walk | Building the full recursive resolver — loop until you get an answer or an error | Hard | 60 min |
| 12 | Name Compression | DNS pointer compression — the `0xC0` trick that saves bandwidth by referencing earlier names | Medium | 45 min |
| 13 | CNAME Chains | Following aliases — `www.example.com` → `example.com` → IP address | Medium | 40 min |
| 14 | Record Types | A, AAAA, CNAME, MX, NS, TXT, SOA — parsing each type's RDATA format | Medium | 50 min |
| 15 | Error Handling | NXDOMAIN, SERVFAIL, timeouts, retries, truncation (TC flag) | Medium | 40 min |

### [[Act 3 - The Cache]] — Performance and Correctness (Stages 16-21)

A resolver that queries the root for every lookup is slow and rude (root servers handle billions of queries daily). Caching stores answers so repeated lookups are instant. But caching introduces complexity: TTLs, negative caching, cache poisoning.

| # | Stage | Concept | Difficulty | ~Time |
|---|---|---|---|---|
| 16 | The Map Room | In-memory cache with TTL expiry — `HashMap` with timestamps | Medium | 45 min |
| 17 | Negative Caching | Caching "this domain doesn't exist" (NXDOMAIN) — SOA minimum TTL | Medium | 35 min |
| 18 | Cache Poisoning | Why trusting any response is dangerous — bailiwick checking, transaction IDs | Medium | 40 min |
| 19 | Measuring Performance | Timing queries, cache hit rates, comparing cached vs uncached resolution | Easy | 25 min |
| 20 | Concurrent Queries | `tokio` for async UDP, handling multiple queries in flight | Hard | 60 min |
| 21 | The Local Server | Binding to `127.0.0.1:5353`, accepting queries from `dig` and `nslookup` | Medium | 45 min |

### [[Act 4 - The Complete Map]] — Production Features (Stages 22-27)

The resolver works but it's a single-threaded toy. Act 4 makes it production-grade: async I/O, TCP fallback for large responses, EDNS for modern DNS features, and a CLI that's actually pleasant to use.

| # | Stage | Concept | Difficulty | ~Time |
|---|---|---|---|---|
| 22 | TCP Fallback | When UDP isn't enough — the TC flag, TCP DNS framing (2-byte length prefix) | Medium | 40 min |
| 23 | EDNS(0) | Extended DNS — larger packets, DO flag for DNSSEC awareness, OPT pseudo-record | Medium | 45 min |
| 24 | The CLI | `clap` subcommands — `cartografo resolve`, `cartografo server`, `cartografo cache` | Easy | 30 min |
| 25 | Pretty Output | Colored output, query tracing (show each step of the recursive walk), timing | Easy | 30 min |
| 26 | Configuration | Config file for upstream servers, cache size, bind address, logging | Medium | 35 min |
| 27 | The Complete Cartógrafo | Integration test — resolve 100 domains, verify against `dig`, measure performance | Medium | 40 min |

### [[Reference Guide]]

DNS packet format (RFC 1035), record type reference, header flags, name encoding, compression pointers, common response codes, byte manipulation patterns in Rust, UDP/TCP socket patterns, `tokio` async patterns.

---

## Totals

| Act | Stages | Est. Time |
|---|---|---|
| The First Query | 8 | ~4.5 hrs |
| The Hierarchy | 7 | ~5 hrs |
| The Cache | 6 | ~4 hrs |
| The Complete Map | 6 | ~3.5 hrs |
| **Total** | **27** | **~17 hrs** |

## Tech Stack

| Crate | Version | Introduced |
|---|---|---|
| (std::net) | — | Stage 1 |
| tokio | 1 | Stage 20 |
| clap | 4 | Stage 24 |
| colored | 2 | Stage 25 |
| chrono | 0.4 | Stage 16 |

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
