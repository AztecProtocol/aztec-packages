# Re-implement partial notes on FactStore — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-express the recipient-side partial-note pending/completion flow on top of the `FactStore`, replacing the bespoke `CapsuleArray` with a per-partial-note fact collection that is reorg-safe and self-terminating.

**Architecture:** Mirror `OffchainReception` (`messages/processing/offchain/reception.nr`): each pending partial note becomes a fact collection holding a retractable `delivered` fact (anchored to the delivery block A) and, once completed, a retractable `completed` fact (anchored to the completion-log block B). Status is folded from the canonical fact set. Reorgs of A or B are handled transparently by PXE; the collection is deleted once block B finalizes. To anchor the facts, the shared `MessageContext` and `LogRetrievalResponse` structures each gain an origin block, populated from data PXE already has.

**Tech Stack:** Noir (aztec-nr), TypeScript (PXE / stdlib), Noir↔TS serialization parity tests.

**Spec:** `docs/plans/2026-06-29-partial-notes-on-factstore-design.md`

## Global Constraints

- Noir: lines ≤ 120 chars; use `panic("…")` not `assert(false, …)`; no early `return` (use if/else); use `crate::logging::aztecnr_*` log macros. (`noir-projects/aztec-nr/CLAUDE.md`)
- TS: build via `yarn build` from `yarn-project/` (never `tsgo`); format/lint with `yarn format` / `yarn lint`; line width 120. (`yarn-project/CLAUDE.md`)
- `$NARGO` must be `noir/noir-repo/target/release/nargo` (do not use a global nargo). (root `CLAUDE.md`)
- Noir aztec-nr tests run with: `cd noir-projects/aztec-nr && $NARGO test --package aztec <filter>` (see existing usage). Confirm the exact invocation from `noir-projects/aztec-nr/bootstrap.sh` before first run.
- Reuse `crate::facts::OriginBlock` for the new origin-block fields; do not define a parallel type. (root `CLAUDE.md` reuse rule)
- Stage only named files in commits; never `git add -A`/`.` (the untracked `docs/plans/2026-06-26-getpublicevents-pagination-design.md` must not be swept in).
- Base branch for this work: `martin/f-762-fact-origin-block-state-in-offchain-receive`.

## Reference shapes (already on this branch)

```noir
// crate::facts
pub struct OriginBlock { pub block_number: u32, pub block_hash: Field }
pub struct RetractableFactOrigin { pub block_number: u32, pub block_hash: Field, pub block_state: OriginBlockState }
pub struct Fact { pub fact_type_id: Field, pub payload: EphemeralArray<Field>, pub origin_block: Option<RetractableFactOrigin> }
pub struct FactCollection { pub contract_address: AztecAddress, pub scope: AztecAddress,
                            pub fact_collection_type_id: Field, pub fact_collection_id: Field, pub facts: EphemeralArray<Fact> }
// OriginBlockState::{pending(),proven(),finalized()} + is_pending()/is_proven()/is_finalized()

pub unconstrained fn record_retractable_fact(contract, scope, type_id, collection_id, fact_type_id, payload: EphemeralArray<Field>, origin_block: OriginBlock);
pub unconstrained fn record_non_retractable_fact(contract, scope, type_id, collection_id, fact_type_id, payload: EphemeralArray<Field>);
pub unconstrained fn delete_fact_collection(contract, scope, type_id, collection_id);
pub unconstrained fn get_fact_collection(contract, scope, type_id, collection_id) -> Option<FactCollection>;
pub unconstrained fn get_fact_collections_by_type(contract, scope, type_id) -> EphemeralArray<FactCollection>;
```

---

## Task 1: Add an origin block to `MessageContext` (Noir + TS)

Adds `origin_block: OriginBlock` to the shared message context so downstream processing knows the
block a message was found in. Defaults to a zero block; later tasks populate it. This is an
interface change with a Noir↔TS serialization parity test.

**Files:**
- Modify: `noir-projects/aztec-nr/aztec/src/messages/processing/message_context.nr`
- Modify: `yarn-project/stdlib/src/logs/message_context.ts`
- Modify: `yarn-project/stdlib/src/logs/pending_tagged_log.ts` (constructs `MessageContext`)
- Test: the existing `message_context_serialization_matches_typescript` test in `message_context.nr`

**Interfaces:**
- Produces (Noir): `MessageContext { tx_hash, unique_note_hashes_in_tx, first_nullifier_in_tx, origin_block: OriginBlock }`
- Produces (TS): `new MessageContext(txHash, uniqueNoteHashesInTx, firstNullifierInTx, blockNumber: Fr, blockHash: Fr)`; `toFields()` appends `[blockNumber, blockHash]`.

- [ ] **Step 1: Update the Noir parity test to expect the new fields (red)**

In `message_context.nr`, change the test to build a context with a known origin block and append its
two fields to the expected serialization (serialization order = struct field order, origin block last):

```noir
let message_context = MessageContext {
    tx_hash,
    unique_note_hashes_in_tx: unique_note_hashes,
    first_nullifier_in_tx: first_nullifier,
    origin_block: crate::facts::OriginBlock { block_number: 9, block_hash: 0xfeed },
};
```

Append two entries to `serialized_message_context_from_typescript` after the `first_nullifier`
entry (`…06`): `0x…09` (block_number) then `0x…feed` (block_hash).

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd noir-projects/aztec-nr && $NARGO test --package aztec message_context`
Expected: FAIL — struct literal missing `origin_block` field / length mismatch.

- [ ] **Step 3: Add the field to the Noir struct**

```noir
use crate::facts::OriginBlock;
use crate::protocol::{constants::MAX_NOTE_HASHES_PER_TX, traits::{Deserialize, Serialize}};

#[derive(Serialize, Deserialize, Eq)]
pub struct MessageContext {
    pub tx_hash: Field,
    pub unique_note_hashes_in_tx: BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>,
    pub first_nullifier_in_tx: Field,
    pub origin_block: OriginBlock,
}
```

- [ ] **Step 4: Mirror the field in the TS class**

In `message_context.ts` add the two fields and extend serialization (append at the end so the order
matches the Noir struct):

```typescript
constructor(
  public txHash: TxHash,
  public uniqueNoteHashesInTx: Fr[],
  public firstNullifierInTx: Fr,
  public blockNumber: Fr,
  public blockHash: Fr,
) {}

toFields(): Fr[] {
  return [
    this.txHash.hash,
    ...serializeBoundedVec(this.uniqueNoteHashesInTx, MAX_NOTE_HASHES_PER_TX),
    this.firstNullifierInTx,
    this.blockNumber,
    this.blockHash,
  ];
}

toNoirStruct() {
  /* eslint-disable camelcase */
  return {
    tx_hash: this.txHash.hash,
    unique_note_hashes_in_tx: this.uniqueNoteHashesInTx,
    first_nullifier_in_tx: this.firstNullifierInTx,
    origin_block: { block_number: this.blockNumber, block_hash: this.blockHash },
  };
  /* eslint-enable camelcase */
}

static empty(): MessageContext {
  return new MessageContext(TxHash.zero(), [], Fr.ZERO, Fr.ZERO, Fr.ZERO);
}
```

Update `toEmptyFields()`'s `serializationLen` to add `+ 2 /* blockNumber + blockHash */`.

- [ ] **Step 5: Fix the `PendingTaggedLog` TS construction site so it compiles**

In `pending_tagged_log.ts`, wherever it builds a `MessageContext`, pass `Fr.ZERO, Fr.ZERO` for the
new args for now (Task 3 supplies real values). Build TS: `yarn build`. Expected: compiles.

- [ ] **Step 6: Regenerate/verify the Noir golden values and run the test (green)**

The two appended values are deterministic (`block_number=9`, `block_hash=0xfeed`), so the Step 1
edits already encode them. Run: `cd noir-projects/aztec-nr && $NARGO test --package aztec message_context`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add noir-projects/aztec-nr/aztec/src/messages/processing/message_context.nr \
        yarn-project/stdlib/src/logs/message_context.ts \
        yarn-project/stdlib/src/logs/pending_tagged_log.ts
git commit -m "feat(aztec-nr): add origin block to MessageContext"
```

---

## Task 2: Add an origin block to `LogRetrievalResponse` (Noir + TS)

Same treatment for the completion-log response, so block B can anchor the `completed` fact.

**Files:**
- Modify: `noir-projects/aztec-nr/aztec/src/messages/processing/log_retrieval_response.nr`
- Modify: `yarn-project/pxe/src/contract_function_simulator/noir-structs/log_retrieval_response.ts`
- Test: `yarn-project/pxe/.../log_retrieval_response.test.ts` (golden generator) + the parity test in `log_retrieval_response.nr`

**Interfaces:**
- Produces (Noir): `LogRetrievalResponse { log_payload, tx_hash, unique_note_hashes_in_tx, first_nullifier_in_tx, origin_block: OriginBlock }`
- Produces (TS): `new LogRetrievalResponse(logPayload, txHash, uniqueNoteHashesInTx, firstNullifierInTx, blockNumber: Fr, blockHash: Fr)`

- [ ] **Step 1: Update the Noir parity test to expect the new fields (red)**

In `log_retrieval_response.nr`, add `origin_block: crate::facts::OriginBlock { block_number: 8, block_hash: 0xbeef }`
to the `some_response` literal and append `0x…08` then `0x…beef` to
`serialized_some_log_retrieval_response_from_typescript`. For the `none` case, the serialization
length grows by 2 — add two trailing `0x…00` entries to the `none` golden array.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd noir-projects/aztec-nr && $NARGO test --package aztec log_retrieval_response`
Expected: FAIL — missing field / length mismatch.

- [ ] **Step 3: Add the field to the Noir struct**

```noir
use crate::facts::OriginBlock;

#[derive(Deserialize, Eq)]
pub struct LogRetrievalResponse {
    pub log_payload: BoundedVec<Field, MAX_LOG_CONTENT_LEN>,
    pub tx_hash: Field,
    pub unique_note_hashes_in_tx: BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>,
    pub first_nullifier_in_tx: Field,
    pub origin_block: OriginBlock,
}
```

- [ ] **Step 4: Mirror the field in the TS class**

In `log_retrieval_response.ts`, add `public blockNumber: Fr, public blockHash: Fr` to the
constructor, append `this.blockNumber, this.blockHash` to `toFields()`, and add
`+ 2 /* blockNumber + blockHash */` to `toEmptyFields()`'s `serializationLen`.

- [ ] **Step 5: Update the construction site so it compiles**

In `yarn-project/pxe/src/logs/log_service.ts` `#toLogRetrievalResponse` (`:161`), pass `Fr.ZERO, Fr.ZERO`
for now (Task 5 supplies real values). `yarn build`. Expected: compiles.

- [ ] **Step 6: Regenerate the TS golden values and run both tests (green)**

Run: `AZTEC_GENERATE_TEST_DATA=1 yarn workspace @aztec/pxe test src/contract_function_simulator/noir-structs/log_retrieval_response.test.ts`
Then copy the regenerated arrays into `log_retrieval_response.nr` (replacing the Step 1 placeholders
if they differ) and run: `cd noir-projects/aztec-nr && $NARGO test --package aztec log_retrieval_response`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add noir-projects/aztec-nr/aztec/src/messages/processing/log_retrieval_response.nr \
        yarn-project/pxe/src/contract_function_simulator/noir-structs/log_retrieval_response.ts \
        yarn-project/pxe/src/contract_function_simulator/noir-structs/log_retrieval_response.test.ts \
        yarn-project/pxe/src/logs/log_service.ts
git commit -m "feat(aztec-nr): add origin block to LogRetrievalResponse"
```

---

## Task 3: Populate block A in the tagged-log path (TS)

Thread each tagged log's block (already on `LogResult`) into the `MessageContext` it produces, so
on-chain-delivered partial notes anchor their `delivered` fact to the delivery block.

**Files:**
- Modify: `yarn-project/stdlib/src/logs/pending_tagged_log.ts`
- Modify: `yarn-project/pxe/src/logs/log_service.ts:196`
- Test: `yarn-project/pxe/src/logs/log_service.test.ts` (or the nearest existing log-service test)

**Interfaces:**
- Consumes: `LogResult.blockNumber: BlockNumber`, `LogResult.blockHash: BlockHash`; `MessageContext(…, blockNumber, blockHash)` from Task 1.

- [ ] **Step 1: Write a failing test asserting the block is carried through**

In the log-service test, build a `LogResult` (use `randomLogResult` / the factory in
`stdlib/src/tests/factories.ts`) with a known `blockNumber`/`blockHash`, run `fetchTaggedLogs`, and
assert the returned `PendingTaggedLog.context.blockNumber` / `.blockHash` equal them.

```typescript
const log = randomLogResult({ blockNumber: BlockNumber(7), blockHash: BlockHash.fromField(new Fr(0x1234)) });
// …drive fetchTaggedLogs so it yields this log…
expect(result[0].context.blockNumber).toEqual(new Fr(7));
expect(result[0].context.blockHash).toEqual(new Fr(0x1234));
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn workspace @aztec/pxe test src/logs/log_service.test.ts -t 'block'`
Expected: FAIL — block fields are `Fr.ZERO`.

- [ ] **Step 3: Pass the block through `PendingTaggedLog` → `MessageContext`**

Update `PendingTaggedLog`'s constructor (in `pending_tagged_log.ts`) to accept `blockNumber: Fr`,
`blockHash: Fr` and forward them into the `MessageContext` it builds. Then at `log_service.ts:196`:

```typescript
return new PendingTaggedLog(log.logData, log.txHash, noteHashes, nullifiers[0],
  new Fr(log.blockNumber), log.blockHash.toField());
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn workspace @aztec/pxe test src/logs/log_service.test.ts -t 'block'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add yarn-project/stdlib/src/logs/pending_tagged_log.ts \
        yarn-project/pxe/src/logs/log_service.ts \
        yarn-project/pxe/src/logs/log_service.test.ts
git commit -m "feat(pxe): carry tagged-log origin block into MessageContext"
```

---

## Task 4: Populate block A for offchain-delivered messages (Noir)

When a resolved offchain message is handed downstream, set its `MessageContext.origin_block` to the
same block that anchors the offchain `Processed` fact, so a partial note delivered offchain and its
offchain reception move together on a reorg.

**Files:**
- Modify: `noir-projects/aztec-nr/aztec/src/messages/processing/offchain/reception.nr` (`step`, ~line 216)
- Test: extend `reception.nr`'s `mod test`

**Interfaces:**
- Consumes: `ResolvedTx { …, block_number: u32, block_hash: Field }`; `MessageContext.origin_block` from Task 1.

- [ ] **Step 1: Strengthen an existing reception test (red)**

In `resolved_reception_is_ready_to_process`, assert the handed-off context carries the resolved
block:

```noir
let processable = reception.step(Option::some(resolved_tx_at_block(tx_hash, 5)), 100).unwrap();
assert_eq(processable.message_context.origin_block.block_number, 5);
```

(Reuse the existing `resolved_tx_at_block` helper if present, else `resolved_tx` which uses block 1.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd noir-projects/aztec-nr && $NARGO test --package aztec reception`
Expected: FAIL — `origin_block` is zero.

- [ ] **Step 3: Populate `origin_block` in `step`**

In `reception.nr` `step`, where the `MessageContext` is built for the resolved tx:

```noir
let message_context = MessageContext {
    tx_hash: resolved.tx_hash,
    unique_note_hashes_in_tx: resolved.unique_note_hashes_in_tx,
    first_nullifier_in_tx: resolved.first_nullifier_in_tx,
    origin_block: OriginBlock { block_number: resolved.block_number, block_hash: resolved.block_hash },
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd noir-projects/aztec-nr && $NARGO test --package aztec reception`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add noir-projects/aztec-nr/aztec/src/messages/processing/offchain/reception.nr
git commit -m "feat(aztec-nr): anchor offchain message context to the resolved block"
```

---

## Task 5: Populate block B for completion logs (TS)

Thread the completion log's block into `LogRetrievalResponse`.

**Files:**
- Modify: `yarn-project/pxe/src/logs/log_service.ts:161`
- Test: `yarn-project/pxe/src/logs/log_service.test.ts`

**Interfaces:**
- Consumes: `LogResult.blockNumber/blockHash`; `LogRetrievalResponse(…, blockNumber, blockHash)` from Task 2.

- [ ] **Step 1: Write a failing test (red)**

Assert that the `LogRetrievalResponse` produced from a `LogResult` with a known block carries that
block in `blockNumber`/`blockHash` (analogous to Task 3's test, against the log-retrieval path).

- [ ] **Step 2: Run to verify it fails**

Run: `yarn workspace @aztec/pxe test src/logs/log_service.test.ts -t 'retrieval block'`
Expected: FAIL.

- [ ] **Step 3: Pass the block through**

At `log_service.ts:161`:

```typescript
return new LogRetrievalResponse(
  log.logData.slice(1),
  log.txHash,
  noteHashes,
  nullifiers[0],
  new Fr(log.blockNumber),
  log.blockHash.toField(),
);
```

- [ ] **Step 4: Run to verify it passes**

Run: `yarn workspace @aztec/pxe test src/logs/log_service.test.ts -t 'retrieval block'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add yarn-project/pxe/src/logs/log_service.ts yarn-project/pxe/src/logs/log_service.test.ts
git commit -m "feat(pxe): carry completion-log origin block into LogRetrievalResponse"
```

---

## Task 6: Partial-note fact FSM module (Noir)

The core: a `PartialNoteReception` backed by a `FactCollection`, mirroring `OffchainReception`. Holds
the `DeliveredPendingPartialNote`, provides init / load-all / completion-status / mark-completed /
terminate. Unit-tested in isolation against `TestEnvironment` with fabricated origin blocks.

**Files:**
- Create: `noir-projects/aztec-nr/aztec/src/messages/processing/partial_notes/mod.nr`
- Create: `noir-projects/aztec-nr/aztec/src/messages/processing/partial_notes/reception.nr`
- Modify: `noir-projects/aztec-nr/aztec/src/messages/processing/mod.nr` (add `pub(crate) mod partial_notes;`)

**Interfaces:**
- Consumes: `crate::facts::*`, `DeliveredPendingPartialNote` (moved here from `discovery/partial_notes.nr` — see Task 7), `OriginBlock`.
- Produces:
  - `PARTIAL_NOTE_RECEPTION_TYPE_ID: Field`
  - `PartialNoteReception { collection: FactCollection }`
  - `PartialNoteReception::init(contract_address: AztecAddress, scope: AztecAddress, pending: DeliveredPendingPartialNote, origin_block: OriginBlock)`
  - `PartialNoteReception::load_all(contract_address, scope) -> EphemeralArray<PartialNoteReception>`
  - `self.read_pending() -> DeliveredPendingPartialNote`
  - `self.is_completed() -> bool`
  - `self.completed_origin() -> Option<RetractableFactOrigin>`
  - `self.mark_completed(origin_block: OriginBlock)`
  - `self.terminate()`

- [ ] **Step 1: Write the failing module test (red)**

Create `reception.nr` with only the test module first (so it fails to compile/find symbols):

```noir
mod test {
    use crate::ephemeral::EphemeralArray;
    use crate::facts::{OriginBlock};
    use crate::messages::processing::partial_notes::reception::PartialNoteReception;
    use crate::messages::discovery::partial_notes::DeliveredPendingPartialNote;
    use crate::protocol::address::AztecAddress;
    use crate::test::helpers::test_environment::TestEnvironment;

    unconstrained fn setup() -> (TestEnvironment, AztecAddress) {
        let mut env = TestEnvironment::new();
        let scope = env.create_light_account();
        (env, scope)
    }

    unconstrained fn make_pending() -> DeliveredPendingPartialNote {
        DeliveredPendingPartialNote {
            owner: AztecAddress::from_field(1), randomness: 2, note_completion_log_tag: 3,
            note_type_id: 4, packed_private_note_content: BoundedVec::from_array([5, 6]),
        }
    }

    #[test]
    unconstrained fn init_creates_a_pending_reception() {
        let (env, scope) = setup();
        env.private_context(|context| {
            let addr = context.this_address();
            let pending = make_pending();
            PartialNoteReception::init(addr, scope, pending, OriginBlock { block_number: 5, block_hash: 0xa });
            let all = PartialNoteReception::load_all(addr, scope);
            assert_eq(all.len(), 1);
            assert(!all.get(0).is_completed());
            assert_eq(all.get(0).read_pending().randomness, 2);
        });
    }

    #[test]
    unconstrained fn mark_completed_moves_to_completed() {
        let (env, scope) = setup();
        env.private_context(|context| {
            let addr = context.this_address();
            PartialNoteReception::init(addr, scope, make_pending(), OriginBlock { block_number: 5, block_hash: 0xa });
            let r = PartialNoteReception::load_all(addr, scope).get(0);
            r.mark_completed(OriginBlock { block_number: 6, block_hash: 0xb });
            let reloaded = PartialNoteReception::load_all(addr, scope).get(0);
            assert(reloaded.is_completed());
        });
    }

    #[test]
    unconstrained fn terminate_deletes_the_collection() {
        let (env, scope) = setup();
        env.private_context(|context| {
            let addr = context.this_address();
            PartialNoteReception::init(addr, scope, make_pending(), OriginBlock { block_number: 5, block_hash: 0xa });
            PartialNoteReception::load_all(addr, scope).get(0).terminate();
            assert_eq(PartialNoteReception::load_all(addr, scope).len(), 0);
        });
    }

    #[test]
    unconstrained fn re_init_is_idempotent() {
        let (env, scope) = setup();
        env.private_context(|context| {
            let addr = context.this_address();
            PartialNoteReception::init(addr, scope, make_pending(), OriginBlock { block_number: 5, block_hash: 0xa });
            PartialNoteReception::init(addr, scope, make_pending(), OriginBlock { block_number: 5, block_hash: 0xa });
            assert_eq(PartialNoteReception::load_all(addr, scope).len(), 1);
        });
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd noir-projects/aztec-nr && $NARGO test --package aztec partial_notes::reception`
Expected: FAIL — `PartialNoteReception` undefined.

- [ ] **Step 3: Implement the FSM module**

Prepend to `reception.nr`:

```noir
use crate::ephemeral::EphemeralArray;
use crate::facts::{
    delete_fact_collection, Fact, FactCollection, get_fact_collections_by_type, OriginBlock,
    record_retractable_fact, RetractableFactOrigin,
};
use crate::messages::discovery::partial_notes::DeliveredPendingPartialNote;
use crate::protocol::{address::AztecAddress, hash::{poseidon2_hash, sha256_to_field}, traits::{Deserialize, Serialize}};

/// Fact-collection type id shared by every partial-note reception in the fact store.
pub(crate) global PARTIAL_NOTE_RECEPTION_TYPE_ID: Field =
    sha256_to_field("AZTEC_NR::PARTIAL_NOTE_RECEPTION_TYPE_ID".as_bytes());

/// Fact type id for the birth fact carrying the delivered private partial note.
global PARTIAL_NOTE_DELIVERED: Field = sha256_to_field("AZTEC_NR::PARTIAL_NOTE_DELIVERED".as_bytes());

/// Fact type id marking a partial note as completed (note discovered and enqueued).
global PARTIAL_NOTE_COMPLETED: Field = sha256_to_field("AZTEC_NR::PARTIAL_NOTE_COMPLETED".as_bytes());

/// One partial note's reception machine, backed by a [`FactCollection`](crate::facts::FactCollection).
#[derive(Deserialize, Serialize)]
pub(crate) struct PartialNoteReception {
    collection: FactCollection,
}

impl PartialNoteReception {
    /// Records the retractable `delivered` birth fact, anchored to the delivery block. Idempotent per partial note.
    pub(crate) unconstrained fn init(
        contract_address: AztecAddress,
        scope: AztecAddress,
        pending: DeliveredPendingPartialNote,
        origin_block: OriginBlock,
    ) {
        record_retractable_fact(
            contract_address,
            scope,
            PARTIAL_NOTE_RECEPTION_TYPE_ID,
            Self::id_for(pending),
            PARTIAL_NOTE_DELIVERED,
            to_payload(pending),
            origin_block,
        );
    }

    pub(crate) unconstrained fn load_all(
        contract_address: AztecAddress,
        scope: AztecAddress,
    ) -> EphemeralArray<PartialNoteReception> {
        get_fact_collections_by_type(contract_address, scope, PARTIAL_NOTE_RECEPTION_TYPE_ID)
            .map(|collection: FactCollection| PartialNoteReception { collection })
    }

    /// Collection id = hash of the delivered content, so re-delivery collapses onto one reception.
    pub(crate) fn id_for(pending: DeliveredPendingPartialNote) -> Field {
        poseidon2_hash(pending.serialize())
    }

    pub(crate) unconstrained fn read_pending(self) -> DeliveredPendingPartialNote {
        let fact = self.collection.facts.find(|f: Fact| f.fact_type_id == PARTIAL_NOTE_DELIVERED).unwrap();
        let mut fields = [0; <DeliveredPendingPartialNote as Deserialize>::N];
        for i in 0..fields.len() {
            fields[i] = fact.payload.get(i);
        }
        Deserialize::deserialize(fields)
    }

    pub(crate) unconstrained fn is_completed(self) -> bool {
        self.collection.facts.any(|f: Fact| f.fact_type_id == PARTIAL_NOTE_COMPLETED)
    }

    /// The completed marker's origin (with PXE-injected finality state), if present.
    pub(crate) unconstrained fn completed_origin(self) -> Option<RetractableFactOrigin> {
        let maybe = self.collection.facts.find(|f: Fact| f.fact_type_id == PARTIAL_NOTE_COMPLETED);
        if maybe.is_some() {
            maybe.unwrap().origin_block
        } else {
            Option::none()
        }
    }

    /// Records the retractable `completed` marker, anchored to the completion-log block.
    pub(crate) unconstrained fn mark_completed(self, origin_block: OriginBlock) {
        let empty_payload: EphemeralArray<Field> = EphemeralArray::empty();
        record_retractable_fact(
            self.collection.contract_address,
            self.collection.scope,
            self.collection.fact_collection_type_id,
            self.collection.fact_collection_id,
            PARTIAL_NOTE_COMPLETED,
            empty_payload,
            origin_block,
        );
    }

    pub(crate) unconstrained fn terminate(self) {
        delete_fact_collection(
            self.collection.contract_address,
            self.collection.scope,
            self.collection.fact_collection_type_id,
            self.collection.fact_collection_id,
        );
    }
}

unconstrained fn to_payload(pending: DeliveredPendingPartialNote) -> EphemeralArray<Field> {
    let fields = pending.serialize();
    let payload: EphemeralArray<Field> = EphemeralArray::empty();
    for i in 0..fields.len() {
        payload.push(fields[i]);
    }
    payload
}
```

Create `partial_notes/mod.nr` with `pub(crate) mod reception;` and add `pub(crate) mod partial_notes;`
to `messages/processing/mod.nr`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd noir-projects/aztec-nr && $NARGO test --package aztec partial_notes::reception`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add noir-projects/aztec-nr/aztec/src/messages/processing/partial_notes/ \
        noir-projects/aztec-nr/aztec/src/messages/processing/mod.nr
git commit -m "feat(aztec-nr): add fact-backed PartialNoteReception state machine"
```

---

## Task 7: Rewrite discovery to drive the FSM (Noir)

Swap `partial_notes.nr` from `CapsuleArray` to `PartialNoteReception`: `init` on delivery (anchored to
block A from `MessageContext`), and on the sweep — complete Pending receptions (anchored to block B
from `LogRetrievalResponse`) and terminate Completed ones whose completion block is finalized. Thread
the origin block through `process_message.nr`. Preserves the single batched completion-log fetch.

**Files:**
- Modify: `noir-projects/aztec-nr/aztec/src/messages/discovery/partial_notes.nr`
- Modify: `noir-projects/aztec-nr/aztec/src/messages/discovery/process_message.nr` (call site)
- Modify: `noir-projects/aztec-nr/aztec/src/messages/processing/mod.nr` (`get_pending_partial_notes_completion_logs` now takes the pending set, not the capsule)

**Interfaces:**
- Consumes: `PartialNoteReception::*` (Task 6); `MessageContext.origin_block` (Task 1); `LogRetrievalResponse.origin_block` (Task 2); `OriginBlockState::is_finalized()`.
- Keep `DeliveredPendingPartialNote` defined here (Task 6 imports it from here) with `#[derive(Serialize, Deserialize)]`.

- [ ] **Step 1: Rewrite `process_partial_note_private_msg` to init the reception**

```noir
pub(crate) unconstrained fn process_partial_note_private_msg(
    contract_address: AztecAddress,
    msg_metadata: u64,
    msg_content: BoundedVec<Field, MAX_MESSAGE_CONTENT_LEN>,
    message_context: MessageContext,
    scope: AztecAddress,
) {
    let decoded = decode_partial_note_private_message(msg_metadata, msg_content);
    if decoded.is_some() {
        let (owner, randomness, note_completion_log_tag, note_type_id, packed_private_note_content) = decoded.unwrap();
        let pending = DeliveredPendingPartialNote {
            owner, randomness, note_completion_log_tag, note_type_id, packed_private_note_content,
        };
        PartialNoteReception::init(contract_address, scope, pending, message_context.origin_block);
    } else {
        aztecnr_warn_log_format!("Could not decode partial note private message from tx {0}, ignoring")(
            [message_context.tx_hash],
        );
    }
}
```

Remove the `DELIVERED_PENDING_PARTIAL_NOTE_ARRAY_LENGTH_CAPSULES_SLOT` global and the `CapsuleArray`
import.

- [ ] **Step 2: Update the `process_message.nr` call site**

```noir
process_partial_note_private_msg(
    contract_address,
    msg_metadata,
    msg_content,
    message_context,
    recipient,
);
```

- [ ] **Step 3: Rewrite `fetch_and_process_partial_note_completion_logs`**

```noir
pub(crate) unconstrained fn fetch_and_process_partial_note_completion_logs(
    contract_address: AztecAddress,
    compute_note_hash: ComputeNoteHash,
    compute_note_nullifier: ComputeNoteNullifier,
    scope: AztecAddress,
) {
    let receptions = PartialNoteReception::load_all(contract_address, scope);

    // Terminate completed receptions whose completion block has finalized (reorg-proof).
    receptions.for_each(|_i, reception: PartialNoteReception| {
        if reception.is_completed() {
            let origin = reception.completed_origin().unwrap();
            if origin.block_state.is_finalized() {
                reception.terminate();
            }
        }
    });

    // Reload, since terminations above mutate the store, and process the still-pending ones.
    let pending_receptions = PartialNoteReception::load_all(contract_address, scope)
        .filter(|r: PartialNoteReception| !r.is_completed());

    let pending_partial_notes: EphemeralArray<DeliveredPendingPartialNote> =
        pending_receptions.map(|r: PartialNoteReception| r.read_pending());

    let completion_logs = get_pending_partial_notes_completion_logs(contract_address, pending_partial_notes);
    assert_eq(completion_logs.len(), pending_receptions.len());

    let mut i = completion_logs.len();
    while i > 0 {
        i -= 1;
        let logs_for_tag: EphemeralArray<LogRetrievalResponse> = completion_logs.get(i);
        let pending_partial_note = pending_partial_notes.get(i);
        let reception = pending_receptions.get(i);
        let num_logs = logs_for_tag.len();

        if num_logs == 0 {
            aztecnr_debug_log_format!("Found no completion logs for partial note with tag {}")(
                [pending_partial_note.note_completion_log_tag],
            );
        } else {
            assert(num_logs == 1, f"Expected at most 1 completion log per partial note, got {num_logs}");
            let log = logs_for_tag.get(0);

            let storage_slot = log.log_payload.get(0);
            let public_note_content: BoundedVec<Field, MAX_LOG_CONTENT_LEN - 1> = array::subbvec(log.log_payload, 1);
            let complete_packed_note = array::append(
                pending_partial_note.packed_private_note_content, public_note_content,
            );

            let discovered_notes = attempt_note_nonce_discovery(
                log.unique_note_hashes_in_tx, log.first_nullifier_in_tx, compute_note_hash, compute_note_nullifier,
                contract_address, pending_partial_note.owner, storage_slot, pending_partial_note.randomness,
                pending_partial_note.note_type_id, complete_packed_note,
            );

            if discovered_notes.len() == 0 {
                panic(
                    f"A partial note's completion log did not result in any notes being found - this should never happen",
                );
            }

            discovered_notes.for_each(|discovered_note| {
                enqueue_note_for_validation(
                    contract_address, pending_partial_note.owner, storage_slot, pending_partial_note.randomness,
                    discovered_note.note_nonce, complete_packed_note, discovered_note.note_hash,
                    discovered_note.inner_nullifier, log.tx_hash,
                );
            });

            // Record the retractable completed marker, anchored to the completion log's block.
            reception.mark_completed(log.origin_block);
        }
    }
}
```

- [ ] **Step 4: Update `get_pending_partial_notes_completion_logs` signature in `processing/mod.nr`**

Change its parameter from `CapsuleArray<DeliveredPendingPartialNote>` to
`EphemeralArray<DeliveredPendingPartialNote>` and its iteration from `.for_each(|_i, p| …)` to the
`EphemeralArray` equivalent (`for_each(|_i, p| …)` exists on both; adjust the import — drop
`capsules::CapsuleArray`).

- [ ] **Step 5: Build the whole aztec-nr package**

Run: `cd noir-projects/aztec-nr && $NARGO test --package aztec partial_notes`
Expected: PASS (Task 6 tests still green; discovery compiles). Then run the full discovery test:
`$NARGO test --package aztec discovery` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add noir-projects/aztec-nr/aztec/src/messages/discovery/partial_notes.nr \
        noir-projects/aztec-nr/aztec/src/messages/discovery/process_message.nr \
        noir-projects/aztec-nr/aztec/src/messages/processing/mod.nr
git commit -m "refactor(aztec-nr): drive partial-note discovery through the fact store"
```

---

## Task 8: Add reorg/finality coverage and verify the contract-level flow

Add the FSM-level reorg + finality tests that justify the migration, and confirm a real partial-note
contract flow (uint-note) still discovers notes end to end.

**Files:**
- Modify: `noir-projects/aztec-nr/aztec/src/messages/processing/partial_notes/reception.nr` (`mod test`)
- Test (integration): the existing uint-note / partial-note test that exercises completion.

**Interfaces:**
- Consumes everything from Tasks 1–7. Uses `OriginBlockState`-bearing blocks via `TestEnvironment`
  (proven==finalized==latest in TXE, per the `reception.nr` test comment at its `resolved_tx` helper).

- [ ] **Step 1: Add finality-termination + completed-status tests (red→green)**

```noir
#[test]
unconstrained fn completed_reception_terminates_once_block_finalizes() {
    // init + mark_completed against a low (TXE-finalized) block, then assert completed_origin().block_state
    // .is_finalized(); the discovery sweep would terminate it. Assert is_completed() and finalized state.
}
```

Add the body using `make_pending()` and a low block number (TXE reports low blocks as finalized, per
the `reception.nr` offchain test convention). Run:
`cd noir-projects/aztec-nr && $NARGO test --package aztec partial_notes::reception`
Expected: PASS.

- [ ] **Step 2: Locate and run the existing partial-note integration test**

Find it: `grep -rln "partial" noir-projects/noir-contracts/contracts --include=*.nr | grep -i test`
and the TS e2e: `grep -rln "partial" yarn-project/end-to-end/src --include=*.ts`. Run the closest
unit/integration test that completes a partial note (e.g. a uint-note transfer-to-public flow).

- [ ] **Step 3: Build TS and run the targeted e2e**

Run: `yarn build` then the identified e2e, e.g.
`yarn workspace @aztec/end-to-end test:e2e <partial_note_or_token_test>.test.ts`
Expected: PASS — notes from partial-note completion are discovered as before.

- [ ] **Step 4: Commit**

```bash
git add noir-projects/aztec-nr/aztec/src/messages/processing/partial_notes/reception.nr
git commit -m "test(aztec-nr): cover partial-note reorg safety and finality termination"
```

---

## Task 9: Full build, format, lint, and changelog

**Files:**
- Possibly: `noir-projects/aztec-nr/aztec/src/messages/processing/mod.nr` and imports (remove dead
  `DeliveredPendingPartialNote` re-exports if now unused).

- [ ] **Step 1: Full Noir + TS build**

Run from git root: `make yarn-project` (rebuilds bb→noir→l1→yarn-project as needed). If only
aztec-nr changed downstream, regenerate contract artifacts so PXE picks up the new oracle struct
layouts. Expected: clean build.

- [ ] **Step 2: Format & lint TS**

Run (from `yarn-project`): `yarn format && yarn lint`
Expected: no diffs / no errors.

- [ ] **Step 3: Update the changelog**

Invoke the `updating-changelog` skill — the extended `MessageContext` / `LogRetrievalResponse` oracle
struct layouts are a contract-developer-visible serialization change.

- [ ] **Step 4: Commit**

```bash
git add -u noir-projects yarn-project docs
git commit -m "chore: regenerate artifacts and changelog for partial-note fact store"
```

(If `git add -u` would pick up unrelated changes, stage the specific files instead.)

---

## Self-review

**Spec coverage:**
- §3 FSM states/transitions → Tasks 6 (init/load/complete/terminate), 7 (sweep: complete + finalize-terminate), 8 (reorg/finality tests). Reorg edges (Completed→Pending, Pending→prune) are PXE-transparent (retractable facts) — covered by using retractable facts in Task 6, asserted at the integration level in Task 8.
- §4 fact model (per-note collection, delivered/completed facts, empty completed payload, idempotent id) → Task 6.
- §5 plumbing (block A on-chain, block A offchain, block B) → Tasks 1+3, 1+4, 2+5.
- §6 component changes → Tasks 1–9 map 1:1 to the listed files.
- §2 non-goals (no give-up rule) → honored: Task 7 sweep has no TTL/give-up edge; Pending only exits via completion or PXE auto-prune.

**Placeholder scan:** No "TBD/TODO/handle edge cases". Golden-value regeneration (Tasks 1–2) uses
concrete commands; the deterministic appends are spelled out. Two intentional discovery steps remain
("locate the existing partial-note test", Task 8 Step 2) because the exact test path is environment-
specific — each gives the exact `grep` to find it, not a vague instruction.

**Type consistency:** `origin_block: OriginBlock` (recorded) vs `RetractableFactOrigin` (read back,
carries `block_state`) used consistently — `mark_completed` takes `OriginBlock`, `completed_origin`
returns `Option<RetractableFactOrigin>`. `PartialNoteReception` method names
(`init`/`load_all`/`read_pending`/`is_completed`/`completed_origin`/`mark_completed`/`terminate`)
match between Tasks 6 and 7. TS `blockNumber`/`blockHash: Fr` consistent across Tasks 1–5.
