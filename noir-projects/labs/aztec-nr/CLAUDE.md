# aztec-nr Development Guidelines

## Formatting

- Lines should not exceed 120 characters, especially in comments.

## Noir Idioms

- Use `panic("message")` instead of `assert(false, "message")` for unconditional failures. `panic` returns the parent function's return type, making it usable in expression position (e.g. in if/else branches). Even when the return type doesn't matter, `panic` is the idiomatic choice.
- **Early `return` is not supported in Noir.** You cannot use `return` or `return value` to exit a function early. Instead, restructure the code using `if/else` branches so that all paths lead to the end of the function with a single return expression. For example, instead of `if cond { return None; } ... Some(result)`, write `if cond { Option::none() } else { ... Option::some(result) }`.

## Doc Comments

Follow the Rust stdlib style roughly. See `PublicImmutable` in `state_vars/public_immutable.nr` for a thorough example.

### Structure

- **First paragraph is a short summary.** Keep it to a single, concise sentence — this is what shows up in documentation summary lists. E.g. `/// Immutable public values.`
- **Expand in subsequent paragraphs.** After the summary sentence, add more detail about what the thing is and how it works.
- **Use `##` section headings** to organize longer docs. These generate anchors for linking. Common sections and their typical order:
  - `## Access Patterns` — where/how this can be used (public, private, utility)
  - `## Privacy` — what information is leaked and what is kept private
  - `## Use Cases` — when to use this and when to prefer alternatives
  - `## Examples` — code blocks showing declaration, initialization, and usage
  - `## Requirements` — trait bounds or constraints the user must satisfy
  - `## Implementation Details` — how it works under the hood (storage layout, nullifiers, etc.)
  - `## Cost` — AVM opcodes invoked, storage reads/writes (for individual methods)

### Style

- **Link to related items** using doc links like `[`PublicMutable`](crate::state_vars::PublicMutable)` for discoverability, especially from entrypoint methods and when mentioning alternatives.
- **Mention alternatives.** When documenting a type, point to related types that users might want instead (e.g. `PublicImmutable` docs mention `DelayedPublicMutable` as a mutable alternative).
- **Be precise with terminology.** For example, messages sent onchain are "messages that use logs", not "logs" themselves.
- **Show practical patterns in examples.** Don't just show the API call — show it in context (e.g. inside a `#[external("public")]` function with realistic variable names).
- **Document cost for methods.** When relevant, note which AVM opcodes are invoked and how many times (e.g. "`SLOAD` is invoked a number of times equal to `T`'s packed length").

### Brevity and attitude

Write for a caller using the API, not for an implementor or an auditor. State what the item does and any restriction a caller must respect, plus the alternative to reach for — then stop. Leave out the internal mechanism and the security rationale behind a restriction: those belong in code comments messages or design docs, not the rustdoc. A reader who hits a restriction needs to know it exists and where to go next, not the argument for why it holds.

- **State the restriction, not the reason it's sound.** Say "this can only be used for X", not the multi-sentence explanation of what goes wrong otherwise.
- **Don't narrate the mechanism.** Key siloing, tree layouts, hash preimages, and similar internals are implementation detail; mention them only when a caller cannot use the API correctly without knowing (and then put them under `## Implementation Details`).
- **Point to the alternative instead of enumerating trade-offs.** A single "use `[other_fn]` for the other case" beats a paragraph weighing options.

Example — documenting a helper that only works on the executing contract's own notes:

```rust
// Too much: explains the key-siloing mechanism and the failure the guard prevents.
/// The note's nullifier is recomputed using the executing contract's app-siloed nullifier key
/// and then siloed with `confirmed_note.contract_address`. These only agree for the executing
/// contract's own notes; otherwise the non-inclusion proof passes unconditionally and wrongly
/// reports a nullified note as not nullified, so this asserts that
/// `confirmed_note.contract_address == context.this_address()`.

// Right: states the restriction and the alternative, nothing more.
/// ## Local notes only
///
/// This can only be used for notes of the executing contract. Use [`assert_note_existed_by`] to
/// prove existence of another contract's notes.
```

## Testing

- **No messages on assertions inside tests.** Write `assert_eq(actual, expected)` and `assert(cond)`, not `assert_eq(actual, expected, "values should match")`. The test's name and body already make clear what is being checked, so an assertion message is redundant noise. (Library code is the opposite: an `assert`/`panic` there must carry a message, since it explains a runtime failure to a contract developer.)
- `#[test(should_fail_with = "...")]` is not an assertion message and is encouraged. The string matches a substring of the expected failure, pinning down *which* error the failing case must produce so the test can't pass for the wrong reason.

## Logging

- **Always use the prefixed logging functions** from `crate::logging` (e.g. `logging::aztecnr_debug_log!`, `logging::aztecnr_debug_log_format!`). These automatically prepend `[aztec-nr] ` to all messages at compile time.
- **Never use `crate::protocol::logging` directly** — those functions have no prefix, making logs harder to filter and identify.
