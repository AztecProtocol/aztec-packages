# Re-implement partial notes on FactStore (F-771)

- **Issue:** [F-771](https://linear.app/aztec-labs/issue/F-771/re-implement-partial-notes-on-factstore)
- **Project:** [Time-Travelling DB](https://linear.app/aztec-labs/project/time-travelling-db-68efe93f7a03)
- **Branch:** `martin/f-711-reimplement-partial-notes` (based on `martin/f-762-fact-origin-block-state-in-offchain-receive`)
- **Date:** 2026-06-29
- **Status:** Design approved; pending written-spec review.

## 1. Background

Partial notes are notes whose private part is delivered first (owner, randomness, a
completion-log tag, note type, and the packed *private* content) and whose public part arrives
later as a public *completion log* (storage slot + packed *public* content). Only once both parts
are combined can the note be discovered (nonce discovery) and stored.

### Current mechanism (capsule-backed)

`noir-projects/aztec-nr/aztec/src/messages/discovery/partial_notes.nr`:

- **`process_partial_note_private_msg`** — on discovery of a partial-note private message, pushes a
  `DeliveredPendingPartialNote` into a `CapsuleArray` keyed by `(contract_address, scope)`.
- **`fetch_and_process_partial_note_completion_logs`** — on every sync, batch-fetches completion
  logs for all pending entries (one concurrent round-trip), and for each found log: combines
  private+public content, runs nonce discovery, enqueues the note, and removes the pending entry.

Driven from `messages/discovery/mod.nr::sync_state_with_secrets`.

### Gaps this re-implementation closes

The capsule mechanism is **not reorg-aware** and **never terminates**:

- If the **delivery** block reorgs, the stale pending entry persists (no cleanup).
- If the **completion** block reorgs *after* the entry was removed, the note silently never
  re-completes (the pending entry is gone).
- An uncompleted partial note is searched for on every sync **forever** (acknowledged wart;
  `partial_notes.nr:113-115`).

The `FactStore` (`noir-projects/aztec-nr/aztec/src/facts/mod.nr`) plus the origin-block-state work
on this branch (F-715/F-762) give us the primitives to fix the reorg cases for free and add a
principled termination, exactly as F-682 did for offchain reception
(`messages/processing/offchain/reception.nr`).

## 2. Goals / Non-goals

**Goals**

- Express a single partial note's lifecycle as a fact-backed state machine, mirroring
  `OffchainReception`.
- Make the **delivery** phase reorg-safe: a reorg of the delivery block auto-prunes the pending
  partial note.
- Make the **completion** phase reorg-safe: a reorg of the completion block folds the entity back
  to pending and re-attempts completion.
- Terminate (and reclaim storage for) a partial note once its completion block is finalized.
- Preserve the batched, concurrent completion-log fetch (a performance property of the current
  code).

**Non-goals**

- No give-up rule for never-completed partial notes — completion is **open-ended** by design. A
  pending partial note is searched for as long as its delivery block stays canonical (no regression
  vs today, now reorg-safe). [decision: answer 1]
- No change to how partial notes are *created/emitted* by contracts, nor to nonce discovery or
  note validation/storage.
- No new give-up TTL (unlike offchain reception, partial-note completion has no protocol deadline).

## 3. State machine

```text
        partial-note private message discovered  →  record `delivered` fact (retractable @ block A)
                            │
                            ▼
                      ┌───────────┐  completion log found →      ┌───────────┐
                      │           │  discover+enqueue note,      │           │
                      │  PENDING  │  record `completed` (retr.@B)│ COMPLETED │
                      │           │ <──────────────────────────  │           │
                      └───────────┘  block B reorged (auto)      └───────────┘
                            │                                        │
              block A reorged (auto-prune)                  block B finalized
                            │                                        │
                            ▼                                        ▼
                      ┌──────────────────────────────────────────────────────┐
                      │                     TERMINATED                          │
                      └──────────────────────────────────────────────────────┘
```

### States

- **Pending** — the private part has been delivered; on each sync PXE searches for the public
  completion log. No note in the DB yet.
- **Completed** — the completion log was found, combined with the private part, and the resulting
  note discovered and enqueued for storage. *Not* terminal: a reorg of the completion block sends
  it back to Pending (mirrors `Processed → Received`).
- **Terminated** — the process has ended and its fact collection is deleted.

### Transitions

| From → To | Trigger | Mechanism |
|---|---|---|
| (init) → Pending | partial-note private message discovered | record retractable `delivered` fact anchored to **block A** (delivery block); idempotent per partial note |
| Pending → Completed | completion log found | combine content, nonce discovery, enqueue note; record retractable `completed` fact anchored to **block B** (completion log's block) |
| Completed → Pending | block B reorged | PXE auto-retracts `completed`; note retracted by note-store canonicality (F-681); resume searching *(transparent)* |
| Completed → Terminated | block B finalized | `completed.origin_block.block_state.is_finalized()` ⇒ reorg-proof ⇒ delete collection |
| Pending → Terminated | block A reorged | PXE auto-prunes the `delivered` fact ⇒ collection disappears *(transparent)* |

There is deliberately **no** `Pending → Terminated` edge other than the delivery-block reorg.

## 4. Fact model

Mirrors `OffchainReception`'s "entity = fact collection, facts folded to a status" shape.

- **One fact collection per pending partial note.**
  - `fact_collection_type_id` = a new `PARTIAL_NOTE_RECEPTION_TYPE_ID` global
    (`sha256_to_field("AZTEC_NR::PARTIAL_NOTE_RECEPTION_TYPE_ID")`).
  - `fact_collection_id` = `poseidon2_hash` of the `DeliveredPendingPartialNote` content, so
    re-delivery of the same partial note collapses onto the same collection (idempotent init).
- **`delivered` fact** (`PARTIAL_NOTE_DELIVERED`): **retractable**, anchored to **block A**.
  Payload = serialized `DeliveredPendingPartialNote` (owner, randomness, completion-log tag, note
  type id, packed private content). Carries all data needed to search for and apply the completion
  log.
- **`completed` fact** (`PARTIAL_NOTE_COMPLETED`): **retractable**, anchored to **block B**, empty
  payload (the note already lives in the note store; this fact only marks the state and anchors
  finality/reorg).

**Status fold:** `delivered` only ⇒ Pending; `delivered` + canonical `completed` ⇒ Completed. A
reorg retracting either fact folds the entity accordingly.

> Note vs offchain reception: there the birth (`Received`) fact is **non-retractable** because the
> message arrives offchain. Here the birth (`delivered`) fact **is** retractable, because the
> private part always originates from an on-chain tx (whether discovered via tagged log or via a
> resolved offchain message), and a reorg of that block means the partial note never existed.

## 5. Required plumbing — block anchors

Neither anchor exists in the data Noir sees today. This is the bulk of the new work.

| Anchor | Available where today | Change |
|---|---|---|
| **Block A** — on-chain delivery | `get_pending_tagged_logs` (PXE knows the block; dropped) | add origin block to `MessageContext`, populated by the tagged-logs oracle |
| **Block A** — offchain delivery | `reception.nr` has `resolved.block_number/hash` (dropped at `reception.nr:216-220`) | propagate into the `MessageContext` it builds — **same block that anchors the offchain `Processed` fact, so the two move together** [decision: answer 3] |
| **Block B** — completion | `get_logs_by_tag` / `LogRetrievalResponse` (no block) | add origin block to `LogRetrievalResponse`, populated by the log-retrieval oracle |

Design choice (confirmed): carry block A on the shared `MessageContext` rather than a
partial-note-only side channel. It is the natural per-message context and both delivery paths
populate it; other consumers may benefit later.

`OriginBlock` here means `{ block_number: u32, block_hash: Field }` (as recorded). PXE injects
`block_state` only when facts are read back (`RetractableFactOrigin`).

## 6. Component changes

### Noir (`noir-projects/aztec-nr/aztec/src/`)

1. **`messages/processing/message_context.nr`** — add an origin block (`block_number`,
   `block_hash`) to `MessageContext`. Update the TS-parity serialization test golden values.
2. **`messages/processing/log_retrieval_response.nr`** — add an origin block to
   `LogRetrievalResponse`. Update its TS-parity golden values.
3. **New fact-backed FSM** for a single partial note (working name `PartialNoteReception`, beside
   `OffchainReception` in spirit) — `init` / `load_all` / fold-status / `complete` / `terminate`,
   backed by a `FactCollection`. Likely a new module under `messages/processing/` (final location
   decided in the plan); the `DeliveredPendingPartialNote` struct moves/aligns here.
4. **`messages/discovery/partial_notes.nr`** — rewrite:
   - `process_partial_note_private_msg`: instead of pushing to a `CapsuleArray`, `init` the
     partial-note fact collection with a retractable `delivered` fact anchored to
     `message_context`'s block A. Signature gains the origin block (or the full `MessageContext`).
   - `fetch_and_process_partial_note_completion_logs`: `load_all` active partial-note collections;
     fold each to a status; for **Pending** ones batch-fetch completion logs (preserve the single
     concurrent round-trip), and on a found log apply completion (nonce discovery + enqueue) and
     record the retractable `completed` fact anchored to block B; for **Completed** ones, terminate
     if `completed.origin_block.block_state.is_finalized()`.
5. **`messages/discovery/process_message.nr`** — thread the origin block from `message_context`
   into `process_partial_note_private_msg`.
6. **`messages/processing/offchain/reception.nr`** — when building the `MessageContext` for a
   resolved offchain message (`step`, line ~216), populate block A from `resolved.block_number/hash`
   (the same block used for `mark_processed`).
7. Remove the now-unused `DELIVERED_PENDING_PARTIAL_NOTE_ARRAY_LENGTH_CAPSULES_SLOT` capsule and
   any dead helpers.

### TypeScript (`yarn-project/`)

8. **`stdlib/src/logs/message_context.ts`** — add the origin-block fields; update `toFields`/from
   and any golden test data referenced by the Noir parity test.
9. **`pxe/src/contract_function_simulator/noir-structs/log_retrieval_response.ts`** — add origin
   block; update `log_retrieval_response.test.ts` golden data (regenerate with
   `AZTEC_GENERATE_TEST_DATA=1`).
10. **Tagged-log oracle path** (`pxe/src/tagging/get_all_logs_by_tags.ts`,
    `pxe/src/logs/log_service.ts`, `contract_function_simulator/oracle/utility_execution_oracle.ts`,
    `oracle_type_mappings.ts`) — include each log's block number/hash in the `MessageContext` it
    returns for `get_pending_tagged_logs`, and in the `LogRetrievalResponse` for `get_logs_by_tag`.

## 7. Data flow

- **On-chain delivery → completion (happy path).** Tagged-log sync surfaces the partial-note
  private log with its block A in `MessageContext`. `process_partial_note_private_msg` inits the
  collection (`delivered` @ A) ⇒ Pending. A later sync finds the public completion log (block B),
  applies completion, records `completed` @ B ⇒ Completed. Once B finalizes, the collection is
  deleted ⇒ Terminated.
- **Offchain delivery.** The offchain message is received and, once its tx resolves at block A,
  `reception.nr` hands the ciphertext downstream with block A in `MessageContext`. The partial
  note's `delivered` fact anchors to the same A as the offchain `Processed` fact ⇒ they retract
  together on a reorg of A.
- **Delivery-block reorg (Pending).** PXE auto-retracts `delivered` ⇒ collection gone. If the
  delivering tx reappears, discovery re-inits it.
- **Completion-block reorg (Completed).** PXE auto-retracts `completed`; the note is retracted by
  note-store canonicality (F-681) ⇒ folds to Pending ⇒ next sync re-searches for the completion
  log.

## 8. Edge cases & error handling

- **No completion log found for a Pending note** — stays Pending; searched again next sync
  (open-ended). Unchanged from today.
- **Completion log found but yields no note** — current code `panic`s ("should never happen").
  Preserve that behavior.
- **>1 completion log for a tag** — current code asserts exactly one. Preserve.
- **Re-delivery of the same partial note** — idempotent: same collection id; re-recording an
  identical `delivered` fact is a no-op (per `facts/mod.nr`).
- **Completed fact present but block B not yet final** — linger in Completed across syncs; do
  nothing (mirrors `reception.nr`).

## 9. Testing

- **Noir unit tests** mirroring `reception.nr`'s `mod test` (using `TestEnvironment`,
  `ResolvedTx`-style fixtures, and `OriginBlockState` finalized/pending blocks): Pending after
  init; Pending→Completed on completion; Completed→Pending on completion-block reorg;
  Completed→Terminated on finalization; idempotent re-delivery; delivery-block reorg prunes.
- **Noir↔TS serialization parity** for the extended `MessageContext` and `LogRetrievalResponse`
  (regenerate golden values).
- **Existing partial-note e2e/integration coverage** must stay green (e.g. uint-note transfer
  flows); add a reorg-oriented case if a harness exists for partial-note completion across a reorg.
- Follow red/green: establish the baseline (existing partial-note tests pass) before the rewrite.

## 10. Dependencies & sequencing

- Builds on **F-715/F-762** (origin-block state + finality-driven termination), already present on
  this branch via the rebase. Upstream, F-715 must merge before F-771 can merge to the main line.
- Independent of **F-756** (`Option<Field>` tx-resolution) and **F-755** (cache auto-invalidation).
- The `MessageContext` / `LogRetrievalResponse` extensions are shared surfaces — coordinate so the
  Noir and TS sides land together (golden tests fail otherwise).

## 11. Out of scope / future

- A give-up rule for never-completed partial notes (intentionally omitted; completion is
  open-ended).
- Generalizing block-anchored `MessageContext` for other consumers (notes/events) beyond what
  partial notes require.
