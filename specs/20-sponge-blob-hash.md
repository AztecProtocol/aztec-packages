# Sponge Blob Hash

## Overview

This specification defines the `sponge_blob_hash` field carried in every Aztec block header. The sponge blob hash is a Poseidon2-based incremental commitment to all blob data published for a checkpoint up to and including the current block. It is the cryptographic anchor that binds an L2 block header to the EIP-4844 blob fields used for data availability, and is reused (after one further absorption) as the input to the per-checkpoint blob accumulator that drives the KZG batched evaluation proof.

The construction differs from the standard Poseidon2 sponge documented in Spec #3 (Cryptographic Primitives) in two ways:

1. The initialization vector is fixed for the entire checkpoint (it is the maximum capacity, not the actual message length). The sponge is created once at the start of the first transaction of the first block and kept alive across multiple circuits and multiple blocks.
2. The hash exposed in the block header is the result of squeezing a *clone* of the sponge — the sponge that propagates onward into the next block stays in absorb mode.

Implementations of the rollup protocol — Noir circuits, the TypeScript prover orchestrator, and any independent verifier reconstructing block headers from L1 calldata — MUST reproduce this construction bit-for-bit. The Noir source under `noir-projects/noir-protocol-circuits/crates/types/src/blob_data/` is the canonical reference; the TypeScript port under `yarn-project/blob-lib/src/` MUST match it.

This specification depends on:

- Spec #2 (Constants) — `FIELDS_PER_BLOB`, `BLOBS_PER_CHECKPOINT`, `TWO_POW_64`, `SPONGE_BLOB_LENGTH`, `TX_START_PREFIX`, `BLOCK_END_PREFIX`, `CHECKPOINT_END_PREFIX`.
- Spec #3 (Cryptographic Primitives) — Poseidon2 permutation parameters and the standard sponge.
- Spec #6 (Block Format) — the consumer of `sponge_blob_hash`.
- Spec #12 (Data Availability) — the broader blob encoding and accumulator pipeline.

## Requirements

### R1: Cross-Implementation Determinism

All implementations (Noir, TypeScript, and any future reimplementation) MUST produce byte-identical `sponge_blob_hash` values for identical block contents. Divergence causes the block header hash to differ across nodes and breaks proof verification.

**Rationale:** `sponge_blob_hash` is committed to inside `BlockHeader` (Spec #6); any disagreement causes archive root divergence and a chain fork.

### R2: Cumulative Within a Checkpoint

The sponge MUST be initialized exactly once per checkpoint and threaded across every block, transaction merge, and circuit boundary within that checkpoint. The `sponge_blob_hash` of block `N` MUST commit to all blob fields contributed by blocks `1..=N` of the checkpoint (in order), the transactions within them (in order), and the per-block end-region fields. It is not a per-block-only commitment.

**Rationale:** Decoders recover blob fields for the entire checkpoint at once; the sponge mirrors that hierarchical layout.

### R3: Block-End Region Inclusion

For every block in a checkpoint, the sponge MUST absorb, after the block's transaction blob fields, a 7-field block-end region (or 6 fields for blocks other than the first in the checkpoint, see Section "Absorption" below). The `sponge_blob_hash` exposed in the header is squeezed *after* this region has been absorbed.

**Rationale:** The block-end region carries the post-block tree roots and the block-end marker. Including it in the sponge — and re-squeezing on every block — gives every block header a unique, recoverable commitment to its own state transition without requiring a separate Merkle root computation.

### R4: Capacity Bound

The total number of fields absorbed into a single checkpoint's sponge MUST NOT exceed `BLOBS_PER_CHECKPOINT * FIELDS_PER_BLOB = 6 * 4096 = 24576`. The 1-field checkpoint-end marker is included in this count.

**Rationale:** Fields beyond this limit cannot fit in EIP-4844 blobs; the constant `MAX_FIELDS = 24576` is enforced inside `absorb_checkpoint_end_marker` (`sponge_blob.nr:160`) and inside the TypeScript `SpongeBlob.absorb` (`sponge_blob.ts:64`).

### R5: One-Shot Squeeze

A `SpongeBlob` MUST be in absorb mode when `squeeze` is invoked. After `squeeze`, the sponge transitions to squeeze mode and MUST NOT absorb further input. To produce a per-block `sponge_blob_hash` while keeping the sponge alive for subsequent blocks, implementations MUST clone the sponge before squeezing.

**Rationale:** The Poseidon2 permutation is invoked once during the squeeze (the final duplex). Re-using a squeezed sponge would reapply the duplex incorrectly. This is enforced by the `assert(!self.squeeze_mode)` guards in `poseidon2.nr:45,59` and the `squeezeMode` checks in `sponge_blob.ts:153,168`.

## Specification

### Underlying Primitive

`sponge_blob_hash` is built on the Poseidon2 permutation over the BN254 scalar field defined in Spec #3. It uses the same `Poseidon2Sponge` state shape (rate 3, capacity 1, state width 4), but with a different IV scheme and a different absorb cadence than `poseidon2_hash`.

The sponge is *not* a domain-separated standard sponge; the IV plays the role of an implicit domain separator. The final hash is therefore not interchangeable with `poseidon2_hash` of the same inputs, even if the message length matched. See "Security Considerations" for analysis of this gap.

### `SpongeBlob` Structure

The `SpongeBlob` carried as a public input across rollup circuits is defined in `noir-projects/noir-protocol-circuits/crates/types/src/blob_data/sponge_blob.nr`:

```
SpongeBlob {
    sponge: Poseidon2Sponge,
    num_absorbed_fields: u32,
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `sponge.cache` | `[Field; 3]` | Rate buffer, holds at most `RATE = 3` fields awaiting a duplex. |
| `sponge.state` | `[Field; 4]` | The 4-element Poseidon2 state. `state[3]` is the capacity element initially set to the IV. |
| `sponge.cache_size` | `u32` | Number of valid entries in `cache` (`0..=3`). |
| `sponge.squeeze_mode` | `bool` | `false` while absorbing, `true` after `squeeze`. |
| `num_absorbed_fields` | `u32` | Running count of fields absorbed (used for the checkpoint-end marker and for capacity enforcement). |

The total serialization length is `SPONGE_BLOB_LENGTH = 10` field elements (`constants.nr:306`), broken down as 3 cache + 4 state + 1 `cache_size` + 1 `squeeze_mode` + 1 `num_absorbed_fields`.

### Initialization

A fresh checkpoint sponge is constructed by `SpongeBlob::init` (`sponge_blob.nr:50-53`):

```
fn init() -> SpongeBlob {
    let iv = (BLOBS_PER_CHECKPOINT * FIELDS_PER_BLOB) as Field * TWO_POW_64
    SpongeBlob {
        sponge: Poseidon2Sponge::new(iv),  // state = [0,0,0,iv], cache = [0,0,0]
        num_absorbed_fields: 0,
    }
}
```

The IV is the *constant* `24576 * 2^64`. It does NOT depend on the actual number of fields that will eventually be absorbed. Concretely:

| Quantity | Value |
|----------|-------|
| `BLOBS_PER_CHECKPOINT` | 6 |
| `FIELDS_PER_BLOB` | 4096 |
| `TWO_POW_64` | `18446744073709551616` (`= 2^64`) |
| IV (decimal) | `453347182355485940514816` |
| IV (hex) | `0x60000000000000000000` (= `0x6000` followed by 16 hex zeros, i.e. `24576 << 64`) |

This differs from the standard Poseidon2 sponge IV used by `poseidon2_hash` (Spec #3 §V8), which encodes the *actual* `message_length`. The blob sponge uses the maximum capacity so that the IV is fixed throughout the entire checkpoint; this lets proposers begin signing block headers before they know how many transactions a checkpoint will ultimately contain (`sponge_blob.nr:48-49`).

`Poseidon2Sponge::new(iv)` (`poseidon2.nr:25-30`) constructs a sponge with `cache = [0,0,0]`, `state = [0, 0, 0, iv]`, `cache_size = 0`, `squeeze_mode = false`. Note that the IV occupies `state[RATE]` (i.e. `state[3]`), the capacity slot.

### Absorption

The sponge absorbs three categories of input, in this order, for each block of the checkpoint:

1. Per-transaction blob data (one block of fields per transaction, in transaction order).
2. The block-end region (6 or 7 fields, see below).
3. Once per checkpoint, after the last block: the checkpoint-end marker (1 field).

#### Per-Transaction Blob Data

For each transaction in the block (in order), the sponge absorbs the transaction's `TxBlobData` field sequence as built by `create_tx_blob_data` and described in `sponge_blob.nr:55-91`. The first field of every transaction is a tx-start marker that bit-packs `TX_START_PREFIX` (`0x9c707518`) together with effect counts (see Spec #12 §"Transaction Blob Encoding"). The remaining fields contain `tx_hash`, `transaction_fee`, note hashes, nullifiers, L2-to-L1 messages, public data writes, private logs (length-prefixed), public logs, and contract class logs.

Implementations MUST absorb every field in `TxBlobData` as a single contiguous sequence; they MUST NOT absorb structural framing (per-array length prefixes other than those baked into the encoding above).

#### Block-End Region

After absorbing all transactions of a block, the sponge absorbs a 7-field array constructed by `create_block_end_blob_data` (`block_blob_data.nr:15-31`):

```
[
  block_end_marker,           // 1 Field — bit-packed (see below)
  block_end_state_field,      // 1 Field — bit-packed (see below)
  last_archive.root,          // 1 Field — pre-block archive tree root
  state.partial.note_hash_tree.root,
  state.partial.nullifier_tree.root,
  state.partial.public_data_tree.root,
  state.l1_to_l2_message_tree.root,   // omitted for non-first blocks
]
```

For blocks other than the first in the checkpoint, the trailing `l1_to_l2_message_tree.root` MUST be omitted, leaving a 6-field absorption. The decision is driven by the `is_first_block_in_checkpoint` flag in `absorb_block_end_data` (`sponge_blob.nr:142-148`); the flag is set if and only if the block's `in_hash` is non-zero (`block_rollup_public_inputs_composer.nr:225`). The first-block-only inclusion is enforced at the circuit level by `block_root_rollup_inputs_validator.nr` (the L1-to-L2 subtree insertion only runs in the first-block code path); subsequent blocks rely on state continuity asserted by the block-merge step. The current spec does not establish that the L1-to-L2 message tree is invariant across blocks within a checkpoint as a code-enforced sponge-level property — see Open Question 6.

The TypeScript mirror (`yarn-project/blob-lib/src/encoding/block_blob_data.ts:46-56`) produces the same 6- or 7-field array via `encodeBlockEndBlobData`. The constants `NUM_BLOCK_END_BLOB_FIELDS = 6` and `NUM_FIRST_BLOCK_END_BLOB_FIELDS = 7` (same file, lines 20-21) match Noir.

##### Block-End Marker (Field 0)

Constructed by `create_block_end_marker` (`block_blob_data.nr:45-63`). The field's least-significant bits hold `num_txs`, then `block_number`, then `timestamp`, then the prefix:

| Bit range (LSB → MSB) | Width | Component |
|-----------------------|-------|-----------|
| 0..16 | 16 | `num_txs` |
| 16..48 | 32 | `block_number` |
| 48..112 | 64 | `timestamp` |
| 112..(prefix MSBs) | remaining | `BLOCK_END_PREFIX = 0xeb8dcdbf` |

Each component is bit-bound by `assert_max_bit_size` before composition. `BLOCK_END_PREFIX` is shifted by `2^112` (`16 + 32 + 64 = 112`).

##### Block-End State Field (Field 1)

Constructed by `create_block_end_state_field` (`block_blob_data.nr:71-100`). Bit-packs (LSB → MSB):

| Bit range | Width | Component |
|-----------|-------|-----------|
| 0..48 | 48 | `total_mana_used` (`TOTAL_MANA_USED_BIT_SIZE`) |
| 48..88 | 40 | `public_data_tree.next_available_leaf_index` (`PUBLIC_DATA_TREE_HEIGHT`) |
| 88..130 | 42 | `nullifier_tree.next_available_leaf_index` (`NULLIFIER_TREE_HEIGHT`) |
| 130..172 | 42 | `note_hash_tree.next_available_leaf_index` (`NOTE_HASH_TREE_HEIGHT`) |
| 172..208 | 36 | `l1_to_l2_message_tree.next_available_leaf_index` (`L1_TO_L2_MSG_TREE_HEIGHT`) |

Total: 208 bits, well below the BN254 field's 254-bit capacity. Each component is range-checked by `assert_max_bit_size` against the listed width.

#### Checkpoint-End Marker

After all blocks of the checkpoint have absorbed their transactions and block-end regions, the checkpoint-root circuit absorbs exactly one additional field — the checkpoint-end marker (`checkpoint_blob_data.nr:10-17`):

| Bit range (LSB → MSB) | Width | Component |
|-----------------------|-------|-----------|
| 0..32 | 32 | `num_blob_fields` (the post-increment value of `num_absorbed_fields`) |
| 32..(prefix MSBs) | remaining | `CHECKPOINT_END_PREFIX = 0x8c637443` |

The checkpoint-end marker is absorbed via `SpongeBlob::absorb_checkpoint_end_marker` (`sponge_blob.nr:155-166`), which:

1. Increments `num_absorbed_fields` by 1 *first*.
2. Asserts `num_absorbed_fields <= FIELDS_PER_BLOB * BLOBS_PER_CHECKPOINT`.
3. Builds the marker using the *post-increment* count.
4. Absorbs the marker into the sponge.

Order-of-operations matters: `num_blob_fields` carried in the checkpoint-end marker INCLUDES the marker itself.

#### The `absorb` Primitive

`SpongeBlob::absorb` (`sponge_blob.nr:169-173`) delegates to `poseidon2_absorb_in_chunks_existing_sponge` (`hash/poseidon2_chunks.nr:132-141`). The function:

- MUST reject `squeeze_mode = true` (`hash/poseidon2_chunks.nr:138`).
- MUST reject `in_len > N`, where `N` is the static array length (`hash/poseidon2_chunks.nr:137`).
- Increments `num_absorbed_fields` by `in_len` *after* successful absorption.

The chunked implementation is a circuit-gate optimization (described in `hash/poseidon2_chunks.nr:79-86`); it is observationally equivalent to the simple per-field absorb of `Poseidon2Sponge::absorb` (`poseidon2.nr:44-56`). Both forms MUST produce identical sponges for identical inputs. The TypeScript reference uses the simple per-field absorb (`sponge_blob.ts:152-165`); fuzz tests in `poseidon2_chunks.nr:413-458` confirm equivalence.

### Multi-Block Threading

Each block-root circuit produces, as a public input, an `(start_sponge_blob, end_sponge_blob)` pair (`block_rollup_public_inputs_composer.nr:27-28`). The `block_merge` step enforces, for any two consecutive block rollups `(left, right)` within the same checkpoint, the equality

```
left.end_sponge_blob == right.start_sponge_blob
```

(`validate_consecutive_block_rollups.nr:32-36`). Coupled with the requirement that the very first block-root in a checkpoint MUST start from `SpongeBlob::init()` (`checkpoint_root_inputs_validator.nr:66-71`), this chains the sponge across the entire checkpoint without any per-block re-initialization.

### Squeeze and `sponge_blob_hash`

Inside `BlockRollupPublicInputsComposer::create_block_header_and_end_sponge_blob` (`block_rollup_public_inputs_composer.nr:176-251`):

1. The block's `end_sponge_blob` is the running sponge after absorbing the per-tx data.
2. `absorb_block_end_data` is called with `is_first_block_in_checkpoint`, absorbing the 6 or 7 block-end-region fields.
3. The resulting sponge is *cloned* (`block_rollup_public_inputs_composer.nr:236-238`).
4. The clone is squeezed; its `state[0]` becomes `sponge_blob_hash`.
5. The original (pre-squeeze, post-absorb) sponge is returned as `block_end_sponge_blob` and propagates as `end_sponge_blob` into the next block.

The TypeScript orchestrator follows the same clone-then-squeeze pattern (`yarn-project/prover-client/src/orchestrator/block-building-helpers.ts:292`, `:348-350`).

`Poseidon2Sponge::squeeze` (`poseidon2.nr:58-66`) performs:

```
fn squeeze(&mut self) -> Field {
    assert(!self.squeeze_mode);
    self.perform_duplex();      // adds cache (zero-extended) to state, applies permutation
    self.squeeze_mode = true;
    self.state[0]
}
```

This is the standard Poseidon2 squeeze (cf. Spec #3 §"Squeeze"), with one consequence: if at squeeze time `cache_size < 3`, the unfilled cache slots are implicitly zero-padded by `perform_duplex` because the `if i < self.cache_size` guard skips them (`poseidon2.nr:36-39`). No length-tag is appended at squeeze time.

The `sponge_blob_hash` exposed in the block header is therefore:

```
sponge_blob_hash = clone(running_sponge_after_block_end_absorb).squeeze()
                 = state[0] of state' = poseidon2_permutation(state + zero_pad(cache))
```

where the `+` is element-wise field addition for indices `< cache_size`.

### Checkpoint-Level Squeeze (Distinct from Block Header Field)

The checkpoint-root circuit performs a *second*, independent squeeze on the same sponge after absorbing the checkpoint-end marker (`checkpoint_rollup_public_inputs_composer.nr:134-165`). The resulting hash feeds the per-checkpoint blob accumulator and the KZG batched evaluation. This hash is NOT the `sponge_blob_hash` written into any block header; it is a separate value carried in the checkpoint public inputs. Implementations MUST NOT confuse the two.

The checkpoint-root *composer* additionally re-runs the entire absorption from a flat blob-fields array hint and asserts the sponge matches the propagated `end_sponge_blob` (`checkpoint_rollup_public_inputs_composer.nr:141-161`), and asserts every field at index `>= num_absorbed_fields` of the hinted array is zero (`assert_trailing_zeros`, `checkpoint_rollup_public_inputs_composer.nr:163`; implementation in `types/src/utils/arrays/assert_trailing_zeros.nr`). The checkpoint-root *validator* (`checkpoint_root_inputs_validator.nr`) is a different unit and only checks the initial sponge equality at the start of the checkpoint.

## Validation Rules

### V1: Initial Sponge Equality

The `start_sponge_blob` of the first transaction's tx-base rollup of the first block of a checkpoint MUST equal `SpongeBlob::init()` element-wise (cache `[0,0,0]`, state `[0, 0, 0, IV]`, `cache_size = 0`, `squeeze_mode = false`, `num_absorbed_fields = 0`). Enforced in `checkpoint_root_inputs_validator.nr:66-71`.

### V2: Consecutive Block Sponge Continuity

For any two consecutive block rollups `(left, right)` within a checkpoint, `left.end_sponge_blob == right.start_sponge_blob` (full struct equality, including all sub-fields and `num_absorbed_fields`). Enforced in `validate_consecutive_block_rollups.nr:32-36`.

### V3: First-Block L1-to-L2 Inclusion

Exactly one block per checkpoint — the first — MUST absorb the trailing `l1_to_l2_message_tree.root` of the block-end region. This is gated on `is_first_block_in_checkpoint`, derived from `in_hash != 0` (`block_rollup_public_inputs_composer.nr:225`). The block-merge rule asserts `right.in_hash == 0` for every non-first rollup (`validate_consecutive_block_rollups.nr:51`); the checkpoint-root validator asserts `first_rollup.in_hash != 0` (`checkpoint_root_inputs_validator.nr:95-98`).

### V4: Capacity Bound After Checkpoint-End Marker

`num_absorbed_fields` after absorbing the checkpoint-end marker MUST be `<= BLOBS_PER_CHECKPOINT * FIELDS_PER_BLOB = 24576`. Enforced in `sponge_blob.nr:160-163`.

### V5: Checkpoint-End Marker Count Self-Consistency

The `num_blob_fields` value bit-packed into the checkpoint-end marker MUST equal `num_absorbed_fields` *after* the marker has been counted (i.e., the value used to construct the marker is the post-increment count). Enforced by the order of operations in `absorb_checkpoint_end_marker` (`sponge_blob.nr:158-165`).

### V6: Trailing-Zero Invariant on Hinted Blob Fields

The flat blob-fields hint provided to the checkpoint-root circuit MUST have all entries from index `num_absorbed_fields` (inclusive) to `BLOBS_PER_CHECKPOINT * FIELDS_PER_BLOB` (exclusive) equal to zero. Enforced by `assert_trailing_zeros` (`checkpoint_rollup_public_inputs_composer.nr:163`).

### V7: Squeeze-Mode Discipline

A `SpongeBlob` whose `squeeze_mode == true` MUST NOT be passed to `absorb` or `squeeze`. To produce a `sponge_blob_hash` for a block header, implementations MUST clone the sponge before squeezing. Enforced by `assert(!self.squeeze_mode)` in `poseidon2.nr:45,59` and the `squeezeMode` checks in `sponge_blob.ts:153,168`.

### V8: Bit-Packing Range Checks

Every component packed into the block-end marker, block-end state field, and checkpoint-end marker MUST satisfy its declared bit width (`assert_max_bit_size` calls in `block_blob_data.nr:47,52,57,72,78,84,90,96` and `checkpoint_blob_data.nr:12`). A violation MUST cause circuit failure.

## Constants

All values from `noir-projects/noir-protocol-circuits/crates/types/src/constants.nr`.

| Constant | Value | Source line |
|----------|-------|-------------|
| `FIELDS_PER_BLOB` | 4096 | 163 |
| `BLOBS_PER_CHECKPOINT` | 6 | 164 |
| `MAX_FIELDS_PER_CHECKPOINT` | 24576 (= 6 × 4096) | derived |
| `SPONGE_BLOB_LENGTH` | 10 | 306 |
| `TWO_POW_64` | 18446744073709551616 | 1192 |
| Sponge IV | `24576 * 2^64` = `0x1800000000000000000000` | derived |
| `TX_START_PREFIX` | `0x9c707518` | 1173 |
| `BLOCK_END_PREFIX` | `0xeb8dcdbf` | 1174 |
| `CHECKPOINT_END_PREFIX` | `0x8c637443` | 1175 |
| `RATE` (Poseidon2 sponge) | 3 | `poseidon2.nr:9` |
| Capacity (Poseidon2 sponge) | 1 | implicit (state width 4) |
| State width | 4 | `poseidon2.nr:14` |

### Block-End Marker Bit Layout

Total 254 bits (BN254 field width). Components packed LSB → MSB:

| Component | Width (bits) | Source |
|-----------|--------------|--------|
| `num_txs` | 16 | `block_blob_data.nr:35` (`NUM_TXS_BIT_SIZE`) |
| `block_number` | 32 | `block_blob_data.nr:34` (`BLOCK_NUMBER_BIT_SIZE`) |
| `timestamp` | 64 | `block_blob_data.nr:33` (`TIMESTAMP_BIT_SIZE`) |
| `BLOCK_END_PREFIX` | remaining (≤ 142) | `constants.nr:1174` |

### Block-End State Field Bit Layout

| Component | Width (bits) | Source |
|-----------|--------------|--------|
| `total_mana_used` | 48 | `block_blob_data.nr:36` |
| `public_data_tree.next_available_leaf_index` | 40 | `PUBLIC_DATA_TREE_HEIGHT` (`constants.nr:39`) |
| `nullifier_tree.next_available_leaf_index` | 42 | `NULLIFIER_TREE_HEIGHT` (`constants.nr:40`) |
| `note_hash_tree.next_available_leaf_index` | 42 | `NOTE_HASH_TREE_HEIGHT` (`constants.nr:38`) |
| `l1_to_l2_message_tree.next_available_leaf_index` | 36 | `L1_TO_L2_MSG_TREE_HEIGHT` (`constants.nr:41`) |

Total: 208 bits.

### Checkpoint-End Marker Bit Layout

| Component | Width (bits) | Source |
|-----------|--------------|--------|
| `num_blob_fields` | 32 | `checkpoint_blob_data.nr:3` |
| `CHECKPOINT_END_PREFIX` | remaining | `constants.nr:1175` |

## Test Vectors

From the canonical Noir tests (`sponge_blob.nr:228-262`) and TypeScript counterparts (`yarn-project/blob-lib/src/sponge_blob.test.ts`):

**Test 1 — Small sponge:** Three independent absorb calls of length 1 each, with inputs `[1, 4, 7]`, then squeeze.

```
sponge_blob_hash = 0x142a2d54d67841d1ab00580036a6bb63e7ff8c1bc4ca5232628a9dde48bd55ae
```

**Test 2 — Full capacity:** Absorb `BLOBS_PER_CHECKPOINT * FIELDS_PER_BLOB = 24576` fields where `fields[i] = i + 123`, then squeeze.

```
sponge_blob_hash = 0x23f78d3bf4a9e4a96e28d05f4daaa32a91c93dac6e9903246dc69c2290e7a000
```

**Test 3 — Block-end marker (`block_blob_data.nr:125-149`):** With `block_number = 123`, `timestamp = 456789`, `num_txs = 99`:

```
block_end_marker = 0x0000000000000000000000000000eb8dcdbf000000000006f8550000007b0063
```

**Test 4 — Block-end state field (`block_blob_data.nr:180-208`):** With `l1_to_l2 = 4466`, `note_hash = 3377`, `nullifier = 2288`, `public_data = 1199`, `total_mana_used = 87654321`:

```
block_end_state_field = 0x000000000000000001172000000034c400000008f000000004af000005397fb1
```

**Test 5 — Checkpoint-end marker (`checkpoint_blob_data.nr:19-28`):** With `num_blob_fields = 1234`:

```
checkpoint_end_marker = 0x0000000000000000000000000000000000000000000000008c637443000004d2
```

## Cross-References

- **Spec #2 (Constants):** authoritative source for `FIELDS_PER_BLOB`, `BLOBS_PER_CHECKPOINT`, `TWO_POW_64`, `TX_START_PREFIX`, `BLOCK_END_PREFIX`, `CHECKPOINT_END_PREFIX`, and tree heights.
- **Spec #3 (Cryptographic Primitives) §Poseidon2:** the underlying permutation; standard sponge IV (`message_length * 2^64`) is contrasted with the blob sponge IV (`MAX_FIELDS * 2^64`).
- **Spec #6 (Block Format) §Block Header:** the `sponge_blob_hash` field of `BlockHeader` and its V9 (Sponge Blob Consistency) validation rule.
- **Spec #9 (Rollup Circuits):** propagation of `start_sponge_blob` / `end_sponge_blob` through tx-base, tx-merge, block-root, block-merge, and checkpoint-root circuits.
- **Spec #12 (Data Availability):** the EIP-4844 blob layout, encoding hierarchy (tx → block → checkpoint), prefix sentinels, and downstream blob accumulator.

## Security Considerations

### Implicit Domain Separation via the IV

The blob sponge does not use the `DOM_SEP__*` mechanism described in Spec #3 §Domain Separation. Domain separation is implicit in the IV: the constant `24576 * 2^64` is unique to this construction. Because `poseidon2_hash` IVs are `(actual_message_length) * 2^64` for `message_length < 2^32`, and `24576 = 2^14.58 < 2^32`, an adversary could in principle construct a `poseidon2_hash` over a 24576-element message that produces the same first-permutation state as the blob sponge over a different message. However, the absorbed contents (which include the `BLOCK_END_PREFIX` and `CHECKPOINT_END_PREFIX` sentinels, both of which sit in the high bits of their respective fields and cannot occur naturally in tx-data fields) make a meaningful collision implausible. This implicit separation should be considered a design limitation rather than a vulnerability and is flagged in Open Questions below.

### Cumulative Commitment vs. Per-Block Soundness

`sponge_blob_hash` in block `N` commits to blocks `1..=N`, not block `N` alone. To prove that block `N`'s payload alone was absorbed, a verifier MUST compare `sponge_blob_hash_N` to `sponge_blob_hash_{N-1}` and reconstruct the block-`N` blob fields whose absorption transforms the latter into the former. Spec #6 makes this explicit; verifiers MUST NOT treat `sponge_blob_hash_N` as a stand-alone commitment to block `N`.

### Squeeze on Clone Preserves Forward Absorption

Because every block header's `sponge_blob_hash` comes from a *clone* squeeze, the propagating sponge is never poisoned by the squeeze-mode flag. Implementations that fail to clone (e.g., a hypothetical implementer who calls `squeeze()` on the propagating sponge) will fail the `assert(!self.squeeze_mode)` guard the moment the next block tries to absorb, producing a circuit failure rather than a silent divergence. This is a robust failure mode but is worth highlighting because it is a non-obvious source of bugs in non-canonical reimplementations.

### Capacity Enforcement

The `MAX_FIELDS = 24576` check is performed only inside `absorb_checkpoint_end_marker`. Per-block absorbs do not enforce the bound; instead, the chunked absorb relies on the static array length `N` of the input. An implementation that accidentally over-absorbs will be caught at the checkpoint-end step or by the per-checkpoint blob-accumulator interpolation. Implementations that diverge from this lazy enforcement (e.g., by checking on every absorb) MUST still produce the same final hash on valid inputs.

### No Length Tag at Squeeze

Unlike the standard Poseidon2 sponge in some other libraries, this construction does NOT append a length tag at squeeze time. The "length" is committed via two channels: (a) the IV (which encodes the *maximum* capacity, i.e. is not a length tag), and (b) the post-increment `num_blob_fields` carried in the checkpoint-end marker. Per-block `sponge_blob_hash` values therefore do NOT encode the actual number of fields absorbed at squeeze time; that information is recoverable only by replaying absorption from blob data, or by inspecting `num_absorbed_fields` of the propagated `SpongeBlob` (which is a public input, but not reflected in the squeezed hash itself).

## Open Questions

1. **Lack of an explicit domain separator.** The construction relies on a fixed IV and on the prefix sentinels carried in the bit-packed markers. Should a `DOM_SEP__SPONGE_BLOB` be added (absorbed as the first field, or XORed into the IV) for defense-in-depth and cross-implementation legibility? Today this is implicit and undocumented in Spec #3.
2. **Per-block capacity enforcement.** Capacity is checked only at the checkpoint-end step. Should `SpongeBlob::absorb` also bound `num_absorbed_fields + in_len <= MAX_FIELDS` for defense-in-depth, matching the TypeScript implementation (`sponge_blob.ts:64-68`) which already does this?
3. **TypeScript-Noir absorb-cadence equivalence.** The Noir circuit uses a chunked absorb (`poseidon2_absorb_in_chunks_existing_sponge`) for gate efficiency; TypeScript uses the simple per-field absorb. Equivalence is asserted by fuzz tests (`poseidon2_chunks.nr:413-458`) but not formally proven; should the spec mandate the simple form as canonical and treat the chunked form as an optimization?
4. **Empty-block sponge semantics.** `BlockRollupPublicInputsComposer::new_from_no_rollups` initializes the start *and* end sponges to the empty-init sponge (`block_rollup_public_inputs_composer.nr:46-57`), but no path in the current rollup circuits actually emits empty blocks. The empty-block code path's interaction with this spec — particularly the V2 chain rule when an empty block sits between two non-empty blocks — should be documented or removed.
5. **`Empty::empty()` for SpongeBlob.** `SpongeBlob::empty()` returns `Poseidon2Sponge::new(0)` with IV = 0 (`sponge_blob.nr:181-185`), which is NOT a valid initialized blob sponge. This sentinel is used for serialization defaults. Specifying when `empty` is permitted as a public input would prevent accidental misuse.
6. **Per-block L1-to-L2 root invariance.** The block-end region structurally only includes `l1_to_l2_message_tree.root` in the first block, but the spec does not pin down a single, sponge-level enforcement that the root is the same for every block within a checkpoint. The protection comes from a combination of `block_root_rollup_inputs_validator.nr` (only the first block updates the L1-to-L2 snapshot from `parity` data) and the block-merge state-continuity rule. A consolidated invariant (and citation) would close a documentation gap.

## References

- **Source files (Noir, canonical):**
  - `noir-projects/noir-protocol-circuits/crates/types/src/blob_data/sponge_blob.nr` — `SpongeBlob` struct, init, absorb, squeeze.
  - `noir-projects/noir-protocol-circuits/crates/types/src/blob_data/block_blob_data.nr` — block-end region encoding.
  - `noir-projects/noir-protocol-circuits/crates/types/src/blob_data/checkpoint_blob_data.nr` — checkpoint-end marker.
  - `noir-projects/noir-protocol-circuits/crates/types/src/poseidon2.nr` — `Poseidon2Sponge`.
  - `noir-projects/noir-protocol-circuits/crates/types/src/hash/poseidon2_chunks.nr` — chunked absorb optimization.
  - `noir-projects/noir-protocol-circuits/crates/types/src/constants.nr` — every named constant in this spec.
  - `noir-projects/noir-protocol-circuits/crates/rollup-lib/src/block_root/components/block_rollup_public_inputs_composer.nr` — clone-then-squeeze pattern, block-end absorption.
  - `noir-projects/noir-protocol-circuits/crates/rollup-lib/src/block_merge/utils/validate_consecutive_block_rollups.nr` — V2 (consecutive block sponge continuity).
  - `noir-projects/noir-protocol-circuits/crates/rollup-lib/src/checkpoint_root/components/checkpoint_rollup_public_inputs_composer.nr` — checkpoint-end absorption, blob-fields hint check.
  - `noir-projects/noir-protocol-circuits/crates/rollup-lib/src/checkpoint_root/components/checkpoint_root_inputs_validator.nr` — V1 (initial sponge equality), V3 (first-block in_hash).
- **Source files (TypeScript, mirror):**
  - `yarn-project/blob-lib/src/sponge_blob.ts` — `SpongeBlob` and `Poseidon2Sponge` ports.
  - `yarn-project/blob-lib/src/encoding/block_blob_data.ts` — block-end encoding.
  - `yarn-project/blob-lib/src/encoding/block_end_marker.ts` / `block_end_state_field.ts` — bit-packed markers.
  - `yarn-project/blob-lib/src/encoding/checkpoint_blob_data.ts` / `checkpoint_end_marker.ts` — checkpoint-end encoding and zero-padding decoder check.
  - `yarn-project/prover-client/src/orchestrator/block-building-helpers.ts` — clone-then-squeeze pattern in TS.
- **Related specifications:**
  - Spec #2 (Constants).
  - Spec #3 (Cryptographic Primitives) — Poseidon2 permutation and standard sponge.
  - Spec #6 (Block Format & Header) — `BlockHeader.sponge_blob_hash`.
  - Spec #9 (Rollup Circuits) — sponge propagation.
  - Spec #12 (Data Availability) — blob encoding and accumulator.
