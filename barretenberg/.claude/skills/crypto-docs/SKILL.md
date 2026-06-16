---
name: crypto-docs
description: Principles for writing and reviewing cryptography/protocol documentation in barretenberg — PROTOCOL.md spec files, algorithm/implementation notes, and doc-comments on prover/verifier code. Use when authoring or editing a protocol spec, a design/algorithm note, or substantial math-bearing doc-comments, or when asked to review such a doc for clarity and consistency.
---

# Writing crypto/protocol docs

Covers the prose, math, and structure of crypto documentation: `PROTOCOL.md` specs,
algorithm/implementation notes, and math-heavy doc-comments on prover/verifier code. Not the
Docusaurus developer-docs site (see `docs/CLAUDE.md`).

## Structure and narrative

- **Lead with the why, then what, then how.** Open with the fact the rest depends on — a cost
  model, an invariant, or the security property — then the construction, then the implementation.
  The implementation section is detail behind the concept, not a parallel restatement of it.
- **One canonical home per fact.** A formula, table, or derivation appears once; elsewhere,
  reference it. Repetition is the usual cause of a doc that reads as fragmented.
- **Bridge concept to implementation** with an explicit transition sentence; overview diagram, then
  prose.

## Bind the doc to the code

- **Name the implementing symbol for each step** as a plain code reference (`` `Type::method` ``),
  so a reader jumps from the math to the function and a rename surfaces as a stale reference.
- **Use the code's identifiers for named quantities** — the exact source variable names — so every
  symbol is greppable. This is what keeps a doc consistent with the code as it changes.

## Conventions for a protocol spec

- **State the claims up front** as labelled identities, before the mechanism that establishes them.
- **Define all notation up front** in a parameters table (symbol, meaning, bound); introduce each
  variable at first use.
- **Give the prover and verifier algorithms separately**, one subsection per step in implementation
  order, each naming its method and indexing the loop explicitly.
- **Document the transcript schedule:** the Fiat–Shamir order, the literal label strings, and the
  preconditions (what is already in the transcript and is not re-sent).
- **Write math as displayed equations**, not prose paraphrases.
- **Quantify costs in a prover/verifier table** (group ops, field ops, pairings, proof size).
- **Ground each abstraction with a small worked example.**
- **Keep a numbered references list** (title, authors, link), cited inline; flag a linked resource
  that predates the implementation.

## Precision and word choice

- **Define a term before using it;** don't lean on undefined words.
- **Dry, mathematical prose.** Name the loop ("round $r$"), name the object (the challenge
  polynomial $h$), and write what is computed as an equation — not action-verb narration. Verbs that
  gesture instead of naming ("walks", "contracts", "discharges") are out; precise verbs (computes,
  evaluates, checks, equals) are fine.
- **Name the concrete thing, don't gesture** — the actual object, not "nothing downstream sees it".
- **Separate distinct rationales** — if a thing holds for two reasons, give both, not one "because".
- **Cut what the reader can infer.** State a failure-mode direction once (completeness vs soundness)
  without then spelling out the obvious version.
- **Avoid the repo AI-isms** (root `CLAUDE.md` `<jargon>`): "load bearing", "seam", "north star",
  "sharpening", effusive openers.

## Present tense — describe the artifact as it is

- **No retroactive framing in permanent files.** No "used to be", "previously", "old | new" tables.
  The delta belongs in the PR and commit message; the doc states the current truth. (Extends
  `barretenberg/cpp/CLAUDE.md`'s comment rule to docs.)
- **A pure delta doc usually should not land.** Fold its durable content into the spec and code
  comments, and keep the before/after in the PR description.

## Consistency

- **Propagate a convention change everywhere** — sweep every formula, closed form, and comment; a
  partial edit leaves contradictions.
- **Cross-check formulas against the code and against each other.**
- **Resolve every `§` cross-reference**, especially after renumbering.

## Claims and evidence

- **Quantify performance claims** with a count, not an analogy, and state the scope (local vs
  end-to-end).

## Math and diagrams

- **LaTeX, kept renderable.** Plain display math and basic environments (`array`, `aligned`,
  `cases`); no TikZ or engine-specific packages. Prefer display math over a picture environment for
  flow diagrams, and keep them simple.

## Doc-comments and inline math

General comment hygiene — when to comment, no "what" comments, public-API docs, and not deleting
comments — is in the root `CLAUDE.md` (`<writing_comments>`, `<preserve_todos>`) and
`barretenberg/cpp/CLAUDE.md`; follow those. The prose rules above apply to comment text too. The
crypto-specific points:

- **Use Unicode math in code comments, not LaTeX markup.** A comment is read as source, not
  rendered, so `u⁻¹`, `∏ᵢ(αᵢ + Xˢ)`, `⟨a, b⟩` read better inline than `\f$...\f$` or `$...$`. (In
  `.md` files it is the reverse — use LaTeX; see Math and diagrams.)
- **One source of truth for the algebra.** Keep the derivation in the spec and cross-reference it
  from comments (`see PROTOCOL.md §4.1`) instead of re-deriving; re-derived algebra in a comment is
  what drifts.
- **Match the spec's notation** so code, comment, and spec share one symbol set.
- **Put protocol-level math in a block comment at the entry point** (the prover/verifier class or
  round method), not scattered line-by-line.
- **Don't delete existing comments without cause.** A math or derivation comment is expensive to
  reconstruct; remove one only when it is wrong or the change makes it obsolete — not to shrink a
  diff or tidy.

## Pre-finish checklist (mechanical checks)

1. No retroactive framing in a permanent file.
2. After any algebra change, all formulas and comments agree with each other and the code.
3. Every `§` cross-reference resolves.
4. Each algorithm step names its implementing symbol; named quantities use the code's identifiers.
5. Claims and the transcript schedule appear before the mechanism.
6. Performance claims carry a count and a scope caveat.
7. All math/diagrams render in a plain markdown engine (no TikZ); code comments use Unicode math,
   not LaTeX markup.
