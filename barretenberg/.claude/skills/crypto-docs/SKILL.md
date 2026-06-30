---
name: crypto-docs
description: Principles for writing and reviewing cryptography/protocol documentation in barretenberg — PROTOCOL.md spec files, algorithm/implementation notes, and doc-comments on prover/verifier code. Use when authoring or editing a protocol spec, a design/algorithm note, a substantial math-bearing doc-comment, or an optimization/cost-rationale comment in prover/verifier/relation code, or when asked to review such a doc or comment for clarity and consistency.
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

## When the detail lives elsewhere

A note can be a *sketch* or *summary* whose full detail — the heavy algebra, the exhaustive case
analysis, the complete proof — is carried by an authoritative companion: a formalization (Lean/Coq),
a paper, or a reference implementation. Then:

- **State the claim and the reduction path; delegate the detail.** Give the statement, the chain of
  intermediate claims, and why each step holds — don't reproduce derivations the companion already
  carries. Point each step to where the companion proves it, and still give its mechanism (*why* it
  holds), not just an assertion.
  Present formulas when necessary, do not re-prove them.
- **Collect the external references in one correspondence map, not in the prose.** Lemma names,
  theorem numbers, and file paths (`foo_of_bar`, "Thm 4.2") in running text break the mathematics.
  Keep the body free of them and gather `body statement → source location` in a single table (an
  instance of *One canonical home per fact*).
- **Source identifiers are not math prose.** The greppability rule of *Bind the doc to the code* is
  served in the map and in references, not the prose. In prose use conventional terms — write
  "block-triangular reduction", not the source's `triangularRows` — and rename or explain a lifted
  identifier at first use.

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
- **One claim per sentence.** Split a sentence that stacks clauses with semicolons, several
  em-dashes, or nested parentheticals; short sentences read.
- **Name the concrete thing, don't gesture** — the actual object, not "nothing downstream sees it".
- **Keep the editor's intent out of the text.** Write the fact, not your reasoning about how you
  chose to present it ("to keep this readable…", "for clarity…", "we now…"); that belongs in the PR
  thread.
- **Separate distinct rationales** — if a thing holds for two reasons, give both, not one "because".
- **Cut what the reader can infer.** State a failure-mode direction once (completeness vs soundness)
  without then spelling out the obvious version. Don't restate a displayed equation, set, or table
  in prose.
- **Quantify a performance claim** with a count, not an analogy, and state its scope (local vs
  end-to-end).
- **Avoid the repo AI-isms** (root `CLAUDE.md` `<jargon>`): "load bearing", "seam", "north star",
  "sharpening", effusive openers.

## Present tense — describe the artifact as it is

- **No retroactive framing in permanent files.** No "used to be", "previously", "old | new" tables.
  Don't define the artifact by contrast with an approach the reader never saw ("there is no X step",
  "unlike the naive Y") — state what it is, positively. The delta belongs in the PR and commit
  message; the doc states the current truth. (Extends `barretenberg/cpp/CLAUDE.md`'s comment rule to
  docs.)
- **A pure delta doc usually should not land.** Fold its durable content into the spec and code
  comments, and keep the before/after in the PR description.

## Consistency

- **Propagate a convention change everywhere** — sweep every formula, closed form, and comment; a
  partial edit leaves contradictions.
- **Cross-check formulas against the code and against each other.**
- **Resolve every `§` cross-reference**, especially after renumbering.

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
- **Keep a comment at its call site's altitude.** A comment explains the code it sits on. A property
  of code defined elsewhere is documented at that definition and referenced, not re-explained here —
  re-explained, it rots silently when the other code changes.
- **Match the spec's notation** so code, comment, and spec share one symbol set.
- **Put protocol-level math in a block comment at the entry point** (the prover/verifier class or
  round method), not scattered line-by-line.
- **Don't delete existing comments without cause.** A math or derivation comment is expensive to
  reconstruct; remove one only when it is wrong or the change makes it obsolete — not to shrink a
  diff or tidy.

## Reviewing

Two modes, applied to a draft: a qualitative lens, then a binary sweep.

### Coarse to fine

Not a fixed recipe, a lens. Fixing prose inside a paragraph you later move or cut is wasted, so
review tends to go best from structure down to sentences:

- **Scope.** Is the doc (or section) at the right altitude, and not a pure delta that shouldn't land?
  (*Present tense*)
- **Structure**, reading headings and topic sentences alone: does anything depend on what comes
  later, or re-explain what came earlier? Is a fact stated twice, or sitting somewhere other than the
  section whose job it is? (*Structure and narrative*; *One canonical home per fact*)
- **Sentences**, once the structure has settled. For each, it is worth asking whether it restates
  something already shown (a displayed equation, an earlier line), asserts what nothing backs,
  contradicts the code or another section, narrates an editorial choice, leans on an undefined term,
  frames by contrast with the past, or gestures instead of naming. Several of these — *does it match
  the code?*, *is the claim backed?* — are settled only by checking the source, not by rereading the
  prose.

### Mechanical checks (final sweep)

1. No retroactive framing in a permanent file.
2. After any algebra change, all formulas and comments agree with each other and the code.
3. Every `§` cross-reference resolves.
4. Each algorithm step names its implementing symbol; named quantities use the code's identifiers.
5. Claims and the transcript schedule appear before the mechanism.
6. Performance claims carry a count and a scope caveat.
7. All math/diagrams render in a plain markdown engine (no TikZ); code comments use Unicode math,
   not LaTeX markup.
8. Prose uses conventional math terms, not source identifiers; external references (lemma names,
   theorem numbers, file paths) appear only in the correspondence map.
9. No editor's intent narrating a presentation choice ("to keep this readable…", "for clarity…");
   the text carries only the content.
