# Protocol Circuits

This file describes how the protocol circuits connect: for each circuit, which proofs it verifies, which circuit verifies its proof, and what it checks. It is written for auditors and circuit engineers.

The code is the source of truth. To re-check a claim here, read:

- The VK index table in `crates/types/src/constants.nr` ("VK TREE CONSTANTS").
- The `ALLOWED_*_VK_INDICES` / `ALLOWED_PREVIOUS_CIRCUITS` list at the top of each circuit's file in `crates/rollup-lib/src/` and `crates/private-kernel-lib/src/`.
- The `rollup_structure_tests.nr` file in each circuit's `tests/` directory under `crates/rollup-lib/src/` for the valid left/right combinations.

Headings below use short circuit names. The crate for each circuit is in `crates/`, as listed in the tree.

```text
App circuits
private kernels (client side)
    private-kernel-init                  first app call
    private-kernel-init-{2,3,4,5}        first N app calls in one proof
    private-kernel-inner                 next app call
    private-kernel-inner-{2,3,4,5}       next N app calls in one proof
    private-kernel-reset                 mid-tx reset (no siloing)
    private-kernel-reset-tail            final reset + tail, private-only txs
    private-kernel-reset-tail-to-public  final reset + tail, txs with public calls
    hiding-kernel-to-rollup              private-only txs
    hiding-kernel-to-public              txs with public calls
rollup (sequencer and prover side)
    tx
        rollup-tx-base-private           private-only txs
        chonk-verifier-public            txs with public calls
        avm                              txs with public calls (circuit in barretenberg/cpp/src/barretenberg/vm2)
        rollup-tx-base-public            txs with public calls
        rollup-tx-merge
    block
        rollup-block-root                two tx proofs
        rollup-block-root-single-tx      one tx proof
        rollup-block-root-no-txs         no tx proofs
    checkpoint
        rollup-block-merge
        inbox-parity-{4,16,64,256,1024}
        rollup-checkpoint-root           two block proofs
        rollup-checkpoint-root-single-block
        rollup-checkpoint-padding
    epoch
        rollup-checkpoint-merge
        rollup-root
```

Crates ending in `-simulated` are unconstrained copies used for simulation. They get no VK.

## Diagram

This diagram shows how the circuits connect. It predates the current block-root and inbox-parity circuits, so check it against the tree above.

https://drive.google.com/drive/folders/1odV663TQs1DULL1-CIX7SNEH5iEKPa9g?usp=sharing

> It uses draw.io because it's open source and easier to share. The link gives public, view-only access.

## General circuit pattern

Most circuits split their work between a `...Validator` and a `...Composer`. `README.md` ("Naming Conventions") defines both terms.

Some composers also perform validation, where splitting the check out would be awkward. Such code should carry a comment that justifies it.

A composer sometimes generates outputs in an unconstrained function, for efficiency. Constrained code must then check those outputs against the circuit's private inputs. Auditors should check that every unconstrained output is constrained.

## Unravelling a circuit's private inputs and public inputs

The input and output structs of a circuit are large and span many files. To read them more easily, use `scripts/unravel_struct.js` and `scripts/unravel_favourite_structs.sh` (see `README.md`).

## Client-side proving

The private kernels run on the user's device. See `crates/private-kernel-lib/src/components/README.md` for the kernel components, and `crates/private-kernel-lib/src/accumulated_data/accumulated_data.md` for how side-effect arrays move through the kernels.

## Sequencer-side proving

### Shared checks

The sections below refer to these checks by name.

**Tx chain-state checks.** The tx's public inputs make claims about chain state, such as historic tree roots and nullifier non-existence. The tx-base circuit takes the current chain state as input: the state at the end of the previous tx. It checks the tx's claims against that state:

- **Performs a membership check to ensure that the claimed anchor block header used during the tx's execution exists as a leaf of the latest archive tree.**
- Asserts equality (between the tx and current chain) of the chain_id, version, vk_tree_root, protocol_contracts_hash.
- Asserts that the tx's chosen gas prices are sufficiently high, relative to the block's minimum requirements.
- Asserts that the tx doesn't exceed the L2 gas limit.
- Asserts that the tx's `expiration_timestamp` hasn't already passed, relative to the block's timestamp.

The code is in `crates/rollup-lib/src/tx_base/components/private_tail_validator.nr`.

**Tx effect absorption** (composer `.finish()` in both tx-base circuits):

- **Appends the tx effects to the next available position of a blob.**
    - Tx effects meaning: (tx_hash, revert_code, tx_fee, note_hashes, nullifiers, l2_to_l1_msgs, public_data_writes, private_logs, public_logs, contract_class_logs)
    - The way it "appends" is by absorbing all of those fields into a gigantic poseidon2 sponge ("SpongeBlob"), which will only get squeezed within the checkpoint root circuit.
    - See "Blob batching" below.
- **Computes the out_hash for this tx**: a subtree root of a sha256 greedy merkle tree, whose unbalanced leaves are the L2-to-L1 messages emitted by this tx. As we recursively prove the binary tree of rollup proofs, we'll progressively build a larger L2-to-L1 messages subtree, whose root will be called the `out_hash`, and which will be stored on L1.
- Propagates public inputs which will be read by the next circuit.

**Merge consecutiveness checks** (every circuit that takes a left and a right proof):

- That the left and right subtrees follow the "greedy tree" rules (`assert_rollups_filled_greedily`): the left subtree is full, and the right subtree is no larger than the left.
- That constants used in the left and right proofs' public inputs are equal.
- That the end states of the left subtree are equal to the start states of the right subtree.

Each circuit's section lists the extra checks it adds.

**Blob batching.** The tx effects of a checkpoint are published to L1 as blobs. The rollup circuits prove that the blob data matches the tx effects they processed, and accumulate a batched KZG opening of all blobs in the epoch. `crates/blob/src/abis/blob_accumulator.nr` describes the scheme. A longer write-up is at https://hackmd.io/pC2DcVNQSpGZMnPUvfv85g (it may need a HackMD login).

### Tx-level circuits

#### `chonk-verifier-public`

**Valid previous circuits:** `hiding-kernel-to-public`
**Valid next circuits:** `tx-base-public`

- Verifies the `hiding-kernel-to-public` proof.
- Validates that the vk used for verification exists at `HIDING_KERNEL_TO_PUBLIC_VK_INDEX` in the vk tree.
- Propagates the public inputs of the `hiding-kernel-to-public` proof.


#### `tx-base-private`

**Valid previous circuits:** `hiding-kernel-to-rollup`
**Valid next circuits:**
- `tx-merge`
- `block-root` (as one of its two children)
- `block-root-single-tx` (if it is the only tx in the block)

If a tx makes no public function calls, then the tx in the mempool will contain:
- A `hiding-kernel-to-rollup` proof and public inputs.
- `contract_class_log_fields` - if applicable, the underlying fields of a new contract class that are being published by this tx. Only a hash of the contract class log fields is exposed as a public input of the proof, to reduce client-side constraints.

Validator:
- Verifies the `hiding-kernel-to-rollup` proof.
    - Validates that the vk used for verification exists at `HIDING_KERNEL_TO_ROLLUP_VK_INDEX` in the vk tree.
- Runs the tx chain-state checks (see "Shared checks").
- Hashes the `contract_class_log_fields` and compares them against the tx's claimed contract class log hash.

Composer:
- **Computes siloed L2-to-L1 message hashes** (siloed with the contract address of the function that emitted the message).
- **Computes the tx fee**, given the tx's gas settings and the gas used.
- **Decrements the tx fee from the fee_payer's FeeJuice balance.**
    - This is a rare example of a protocol circuit directly mutating the state of a smart contract. It's ugly, but the FeeJuice contract is considered a "protocol contract".
    - A "public data write" for the decremented FeeJuice balance is computed.
    - Validation that the claimed public data tree leaf _actually represents_ the FeeJuice balance of the fee_payer is deferred until a later Validation step in this circuit (see below).
- **Computes the tx_hash**: a hash of the `PrivateToRollupKernelCircuitPublicInputs`; the public inputs of the tx.
- Computes the array lengths of the tx effects:
    - Asserts that the array of private log arrays is left-packed with any nonempty private logs.
    - Asserts that the array of contract class log arrays (which at the time of writing is an array of length 1) is left-packed with any nonempty contract class logs.
    - Validates the array lengths of other tx effects.
- **Builds the end tree snapshots, by inserting the tx effects into the trees:**
    - Note Tree:
        - Computes a subtree from the tx's new note_hashes.
        - Inserts that subtree into the next available position in the append-only note hash tree.
    - Nullifiers:
        - Computes a subtree from the tx's new nullifiers. (Note: the nullifier tree is an indexed merkle tree, where new leaves are inserted from left to right, so it does support batch insertion).
        - Checks for non-existence of the new nullifiers in the tree.
        - Inserts the subtree into the next available position in the nullifier tree.
    - Public Data Tree:
        - Checks that the claimed leaf of the fee_payer's FeeJuice balance actually exists in the public data tree.
        - Updates the relevant public data tree leaf with the fee_payer's just-decremented FeeJuice balance.

Validator (continued):
- Validates the claimed public data tree leaf of the fee_payer _actually_ represents the fee_payer's FeeJuice balance.
- Validates that the starting FeeJuice balance is >= the earlier-calculated tx fee.

Composer `.finish()`: tx effect absorption (see "Shared checks").

#### `tx-base-public`

**Valid previous circuits:** both `avm` and `chonk-verifier-public` proofs are input.
**Valid next circuits:**
- `tx-merge` (when the block has more than two txs)
- `block-root` (as one of its two children)
- `block-root-single-tx` (if it is the only tx in the block)

If a tx makes public function calls, then the tx in the mempool will contain:
- A `hiding-kernel-to-public` proof and public inputs.
- `contract_class_log_fields`, as for `tx-base-private`.

Before reaching this circuit, the tx's enqueued public function calls are all processed by a single `avm` circuit instance, and -- in parallel -- the `hiding-kernel-to-public` proof is verified within a `chonk-verifier-public` circuit and its public inputs are propagated.

Whereas for private-function-only txs much of the tree-insertion and fee-payment logic happens in the `tx-base-private` circuit, for a tx with public functions the AVM circuit handles most of that logic for us.

> Note: many checks and computations of `tx-base-private` are absent here because the `avm` does them for txs with public calls. When a check seems to be missing, confirm that the `avm` performs it.

Composer:
- **Computes siloed L2-to-L1 message hashes** (siloed with the contract address of the function that emitted the message).
- If any of the public functions reverted within the `avm`, then the tx is considered to have reverted, and no revertible side-effects will be broadcast nor inserted into trees. But, the protocol allows _non-revertible_ side-effects to still be broadcast / inserted.
    - **Conditionally discards the revertible private logs**
    - **Conditionally discards the revertible contract class logs.**
    - (The former two items come directly from the hiding proof, and are not passed into the avm, so the avm isn't able to discard them).
- Hashes the `contract_class_log_fields` and compares them against the tx's claimed contract class log hash.
    - Inconsistent location versus `tx-base-private`, because we needed to conditionally discard revertible contract class logs first.
- **Computes the tx_hash**: a hash of the `PrivateToRollupKernelCircuitPublicInputs`; the public inputs of the tx.
- Computes the array lengths of the tx effects:
    - Asserts that the array of private log arrays is left-packed with any nonempty private logs.
    - Asserts that the array of contract class log arrays (which at the time of writing is an array of length 1) is left-packed with any nonempty contract class logs.

Validator:
- Verifies the `chonk-verifier-public` proof.
    - Validates that the vk used for verification exists at `PUBLIC_CHONK_VERIFIER_VK_INDEX` in the vk tree.
- Verifies the `avm` proof.
    - The AVM verification key is fixed inside the verifier, so there is no VK-tree check.
- Runs the tx chain-state checks (see "Shared checks") against the public inputs of the `chonk-verifier-public` proof. Some of the chain-state values are copied from the avm's public inputs.

Composer `.finish()`: tx effect absorption (see "Shared checks").

#### `tx-merge`

**Valid previous circuits:** two of `tx-base-private`, `tx-base-public`, `tx-merge` (`ALLOWED_PREVIOUS_CIRCUITS` in `tx_merge_rollup.nr`)
**Valid next circuits:**
- `tx-merge`
- `block-root`

Validator:
- Verifies the two previous proofs and validates their vks against the allowed list and the vk tree.
- Runs the merge consecutiveness checks. The end/start states compared are the note hash, nullifier and public data tree snapshots, and the sponge blob.

Composer:
- **Merges the left and right input subtrees**:
    - Sum the num txs.
    - sha256-hash the left and right out_hashes (a zero out_hash is skipped).
    - Accumulate the tx effects tree root.
    - Sum the left and right accumulated fees.
    - Sum the left and right accumulated mana used.

### Block-level circuits

#### `block-root` / `block-root-single-tx` / `block-root-no-txs`

Each variant works at any position in the checkpoint. Only the checkpoint root's start-state checks make the leftmost block the checkpoint's first block (see `checkpoint-root`).

**Valid previous circuits:**
- For `block-root`, two proofs. There are valid pairs of left and right vks. Not all pairs are valid.
    ```
    global ALLOWED_PREVIOUS_VK_INDICES: [u32; 3] =
        [TX_MERGE_ROLLUP_VK_INDEX, PRIVATE_TX_BASE_ROLLUP_VK_INDEX, PUBLIC_TX_BASE_ROLLUP_VK_INDEX];
    ```
- For `block-root-single-tx`, one proof:
    ```
    global ALLOWED_PREVIOUS_VK_INDICES: [u32; 2] =
        [PRIVATE_TX_BASE_ROLLUP_VK_INDEX, PUBLIC_TX_BASE_ROLLUP_VK_INDEX];
    ```
- For `block-root-no-txs`: none.

**Valid next circuits** (all three variants):
- `block-merge`
- `checkpoint-root`
- `checkpoint-root-single-block`

##### `block-root`, `block-root-single-tx`

Validator:
- Verifies the previous proof(s) (see valid previous circuits above).
    - For `block-root-single-tx`, that means verifying a single tx-base proof.
    - For `block-root`, that means verifying two proofs: some combination of tx-merge proofs and/or tx-base proofs.
    - Validates that the vk(s) used for verification exist(s) in the circuit's hard-coded list of valid vk indices, and within the vk tree.
- For `block-root`: runs the merge consecutiveness checks on the two proofs.
- Asserts that the block number in the tx constants equals the next available leaf index of the archive tree.
- Asserts that the L1-to-L2 message tree snapshot in the tx constants equals this block's snapshot after its message bundle is appended. This lets the block's txs read messages that the same block inserts.

Composer (`block-root` only):
- **Merges the left and right input subtrees**, as `tx-merge` does.

##### `block-root-no-txs`

For a block with no txs. The block may still insert an L1-to-L2 message bundle, so a proposer can keep draining the Inbox when the tx pool is empty. It may also be fully empty.

- Propagates zero values: num_txs, out_hash, tx effects tree root, accumulated fees and mana.
- Propagates the tree state unchanged, except for the L1-to-L2 message tree (see "All variants").
- Takes the checkpoint constants, the timestamp and the start sponge blob as free inputs. The block merge or the checkpoint root pins them through its consecutiveness and start-state checks.

The cap on blocks per checkpoint (`MAX_BLOCKS_PER_CHECKPOINT`, checked in the checkpoint root) bounds the prover cost of empty blocks.

##### All variants

Composer:
- **Appends the block's L1-to-L2 message bundle** to the L1-to-L2 message tree at its next available index, and absorbs the same messages into the message sponge. The message sponge starts from the previous block's end sponge, or from the empty sponge for the checkpoint's first block.
- **Absorbs Block End Data of one block into the SpongeBlob** (see "Blob batching").
- Squeezes a copy of this SpongeBlob, and inserts that squeezed sponge into the block's BlockHeader
    - as a record of the emitted data of that block.
- Propagates the unsqueezed SpongeBlob, so that the next block can continue to absorb data into it.
- Asserts that the archive tree's next available leaf index fits in 32 bits, so the block number cannot be truncated.
- **Creates the block header**.
- **Inserts the block header's leaf** (block header hash) into the next available leaf index of the Archive Tree.

### Checkpoint-level circuits

#### `block-merge`

**Valid previous circuits:**
```
global ALLOWED_PREVIOUS_VK_INDICES: [u32; 4] = [
    BLOCK_ROOT_ROLLUP_VK_INDEX,
    BLOCK_ROOT_SINGLE_TX_ROLLUP_VK_INDEX,
    BLOCK_ROOT_NO_TXS_ROLLUP_VK_INDEX,
    BLOCK_MERGE_ROLLUP_VK_INDEX,
];
```

**Valid next circuits:**
- `block-merge`
- `checkpoint-root`

Validator:
- Verifies the two previous proofs and validates their vks against the allowed list and the vk tree.
- Runs the merge consecutiveness checks (`validate_consecutive_block_rollups`). The end/start values compared are the archive, the state, the sponge blob and the message sponge. It also asserts:
    - That the left and right timestamps are equal. All blocks in a checkpoint share one timestamp.

Composer:
- **Merges the left and right input subtrees**:
    - Accumulate the `block_headers_hash` (poseidon2).
    - sha256-hash the left and right out_hashes.
        - Recall: `out_hash` is the root of a subtree containing L2->L1 messages.
    - Sum the left and right accumulated fees.
    - Sum the left and right accumulated mana used.
    - Take the message sponge range from the left start to the right end.

#### `inbox-parity-<S>`

`S` is one of 4, 16, 64, 256 or 1024. The prover picks the smallest `S` that holds the checkpoint's L1-to-L2 messages. There is one inbox-parity proof per checkpoint.

**Valid previous circuits:** None.
**Valid next circuits:**
- `checkpoint-root`
- `checkpoint-root-single-block`

- Asserts that the message slots past `num_msgs` are zero.
- Chains the real messages into the Inbox rolling hash, starting from the previous checkpoint's end value. This matches the rolling hash that the L1 Inbox accumulates.
- Absorbs the same messages into an empty message sponge.
- Outputs the start and end rolling hashes, the end sponge and the `prover_id`.

#### `checkpoint-root` / `checkpoint-root-single-block`

**Valid previous circuits:**
- One `inbox-parity-<S>` proof. Its vk index must be one of `INBOX_PARITY_{4,16,64,256,1024}_VK_INDEX`.
- For `checkpoint-root`, two block proofs:
    ```
    global ALLOWED_PREVIOUS_VK_INDICES: [u32; 4] = [
        BLOCK_ROOT_ROLLUP_VK_INDEX,
        BLOCK_ROOT_SINGLE_TX_ROLLUP_VK_INDEX,
        BLOCK_ROOT_NO_TXS_ROLLUP_VK_INDEX,
        BLOCK_MERGE_ROLLUP_VK_INDEX,
    ];
    ```
- For `checkpoint-root-single-block`, one block proof. A block merge is not allowed, because a merge means the checkpoint has more than one block:
    ```
    global ALLOWED_PREVIOUS_VK_INDICES: [u32; 3] = [
        BLOCK_ROOT_ROLLUP_VK_INDEX,
        BLOCK_ROOT_SINGLE_TX_ROLLUP_VK_INDEX,
        BLOCK_ROOT_NO_TXS_ROLLUP_VK_INDEX,
    ];
    ```

**Valid next circuits:**
- `checkpoint-merge`
- `root`

Validator:

- Verifies the previous block proof(s) (see valid previous circuits above).
    - Validates that the vk(s) used for verification exist(s) in the circuit's hard-coded list of valid vk indices, and within the vk tree.
- For `checkpoint-root`: runs the same consecutiveness checks as `block-merge`.
- Asserts that the checkpoint has at most `MAX_BLOCKS_PER_CHECKPOINT` blocks.
- Verify that the left start states are the expected initial values. These checks are the only thing that anchors the checkpoint to its start:
    - Empty start SpongeBlob (`SpongeBlob::init()`).
    - Start state as per the previous block header (i.e. the last block header of the previous checkpoint).
    - Timestamp of the first block of this checkpoint is > the timestamp of the last block of the previous checkpoint.
        - Note: blocks in the same checkpoint share one timestamp (checked by `block-merge`), so timestamps strictly increase only across checkpoints.
    - Empty start message sponge.
    - Validate that the claimed previous_block_header is indeed the last nonempty leaf of the claimed previous archive tree.
        - Note: the correctness of the claimed previous archive tree will be checked when this epoch's proof is submitted to L1.
- Verifies the inbox-parity proof, and asserts that its `prover_id` equals the one in the checkpoint constants.

Composer:

- **Merges the left and right input subtrees**, as `block-merge` does.
- Asserts that the blocks' end message sponge equals the inbox-parity end sponge. Together with the empty start sponge and the block-merge continuity checks, this proves that the blocks inserted exactly the messages that the parity proof committed to, in order.
- Takes the start and end Inbox rolling hashes from the inbox-parity proof. Block headers carry no rolling hash.
- Appends the checkpoint's out_hash to the epoch out hash tree (a sha256 append-only tree with one leaf per checkpoint).
- Blob stuff (see "Blob batching")
    - Computes the Checkpoint End marker.
    - Absorbs the Checkpoint End marker into the SpongeBlob.
    - Ensures the number of absorbed fields is `<=` the max amount of blob data for a checkpoint (`BLOBS_PER_CHECKPOINT * FIELDS_PER_BLOB` = 6 * 4096 fields).
    - Squeezes the sponge (which represents all blobs of this checkpoint), finally.
    - Takes as a private input hint the entire stream of 6 * 4096 fields of the checkpoint (`blobs_fields`)
    - Ensures these fields are all zero after the computed length.
    - It poseidon2-hashes these fields to make sure the result matches the sponge we just squeezed. I.e. it makes sure this stream of `blobs_fields` matches the data that the earlier circuits "saw".
    - For each of those 6 $blob_i$'s of 4096 fields:
        - Evaluates the interpolated polynomial $p_i(X)$ at $z$ to yield the evaluation $y_i$.
        - Adds the next summand in the incremental computations of the batched kzg commitment $C$, and the batched evaluation $y$.
        - Adds the next contribution to the incremental computations of the batch challenges $z$ and $\gamma$.
        - Adds the next contribution to the incremental computation of the $\texttt{blobCommitmentsHash}_M$ that was stored on L1 when checkpoint $M$ was proposed.
            - We do this to prove that the $C_i$'s "seen" by the circuits match the $C_i$'s that were submitted to L1 as part of checkpoint proposals.
    - Propagates the accumulated blob data to the next circuit.
- Computes a Checkpoint Header, including the end Inbox rolling hash and the epoch out hash. Its hash goes in index 0 of `checkpoint_header_hashes`.
- Writes the fee (coinbase and accumulated fees) to index 0 of `fees`.

#### `checkpoint-padding`

**Valid previous circuits:** None.
**Valid next circuits:** `root` (as the right child only)

Outputs empty checkpoint public inputs. The root rollup needs two children, so an epoch with one checkpoint uses this proof as the right child.

### Epoch-level circuits

#### `checkpoint-merge`

**Valid previous circuits**:
```
global ALLOWED_VK_INDICES: [u32; 3] = [
    CHECKPOINT_ROOT_ROLLUP_VK_INDEX,
    CHECKPOINT_ROOT_SINGLE_BLOCK_ROLLUP_VK_INDEX,
    CHECKPOINT_MERGE_ROLLUP_VK_INDEX,
];
```

**Valid next circuits:**
- `checkpoint-merge`
- `root`


(Validator):

- Verifies the previous proofs (see valid previous circuits above).
    - Validates that the vks used for verification exist in the circuit's hard-coded list of valid vk indices, and within the vk tree.
- Runs the merge consecutiveness checks. The end/start values compared are the archive, the epoch out hash tree, the Inbox rolling hash and the blob accumulator. It also asserts:
    - That both subtrees claim the same final blob challenges z & gamma.

(Composer):
- **Merges the left and right input subtrees**:
    - Sum the number of checkpoints of the two input subtrees of checkpoints.
        - Assert that the sum hasn't exceeded the max number of checkpoints in an epoch.
    - Merge the left and right arrays of `checkpoint_header_hashes`.
        - The final array will be propagated to L1 for some further checks.
    - Merge the left and right arrays of `fees`.

#### `root`

**Valid previous circuits**:
```
global ALLOWED_LEFT_ROLLUP_VK_INDICES: [u32; 3] = [
    CHECKPOINT_ROOT_ROLLUP_VK_INDEX,
    CHECKPOINT_ROOT_SINGLE_BLOCK_ROLLUP_VK_INDEX,
    CHECKPOINT_MERGE_ROLLUP_VK_INDEX,
];

global ALLOWED_RIGHT_ROLLUP_VK_INDICES: [u32; 4] = [
    CHECKPOINT_ROOT_ROLLUP_VK_INDEX,
    CHECKPOINT_ROOT_SINGLE_BLOCK_ROLLUP_VK_INDEX,
    CHECKPOINT_MERGE_ROLLUP_VK_INDEX,
    // Padding checkpoint rollup can only be the right child of the root rollup.
    CHECKPOINT_PADDING_ROLLUP_VK_INDEX,
];
```

**Valid next circuits:**

Next stop: L1. The `EpochProofLib.sol` will verify this `root` proof.

(Validator):

- Verifies the previous proofs (see valid previous circuits above).
    - Validates that the vks used for verification exist in the circuit's hard-coded list of valid vk indices, and within the vk tree.
    - If the right proof is a `checkpoint-padding` proof, asserts that the left subtree holds exactly one checkpoint.
- If the right proof is not padding, runs the same consecutiveness checks as `checkpoint-merge`, including:
    - That both subtrees claim the same final blob challenges z & gamma.

(Composer):
- **Merges the left and right input subtrees**, as `checkpoint-merge` does (skipped when the right proof is padding).
- Asserts that the epoch out hash tree started empty.
- Asserts that the starting blob_accumulator of the epoch was empty.
- Validates the final_blob_batching_challenges, comparing the claimed challenges against the accumulated computations of those challenges.
- Compresses the final batched blob commitment.
- Outputs the previous and new archive roots, the epoch out hash, the start and end Inbox rolling hashes, the checkpoint header hashes, the fees and the epoch constants.
