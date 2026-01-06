# Protocol Circuits

- App circuits
- private-kernel
    - init
    - inner
    - reset
    - private only:
        - tail
        - hiding
    - public fns:
        - tail-to-public
        - hiding-to-public
- rollup
    - tx
        - private only:
            - tx-base-private
        - public fns:
            - chonk-verifier-public
            - avm
            - tx-base-public
    - block
        - tx-merge
        - block-root
        - First block:
            - parity
                - base
                - root
            - block-root-first
    - checkpoint
        - block-merge
        - checkpoint-root
    - epoch
        - checkpoint-merge
        - root

## Diagram

I recommend looking at this diagram first, to understand the topology of how the circuits knit together. Keep it open as you read the circuits.

https://drive.google.com/drive/folders/1odV663TQs1DULL1-CIX7SNEH5iEKPa9g?usp=sharing

> It uses draw.io because it's open source and easier to share.
> That link is for public, view-only access. Ping Mike if you want to make edits and we'll figure out how to get you a link with edit rights.

## General circuit pattern

A circuit-specific `validator` validates the consistency of all private inputs to the circuit without mutating any of the input data.

A circuit-specific public inputs `composer` then generates the outputs (public inputs) of the circuit from the private inputs.

Sometimes, the `composer` will perform validation (which should really be the job of the `validator`), simply because it was too cumbersome to build the circuits the "proper" way. In such cases, there should be a comment highlighting and justifying that deviation from the norm.

Generation of the outputs is sometimes done through an unconstrained function for efficiency reasons. The composer then efficiently constrains the correctness of those generated outputs relative to the circuit's private inputs. Auditors should pay extra attention to ensure such unconstrained outputs are being constrained.

## Unravelling a circuit's private inputs and public inputs

Many of the input/output structs of a circuit are huge, spanning many many files. If your human brain wants to read them more easily, there's a couple of janky scripts at `noir-protocol-circuits/scripts/unravel_struct.js` and `noir-protocol-circuits/scripts/unravel_favourite_structs.js`.

## Client-side proving

## Sequencer-side proving

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
- `block-root` <-- BUG?
- `block-root-single-tx` (if the only tx in the block) or
- `block-root-first-single-tx` (if it's the only tx in the block and it's the first block of a checkpoint).

If a tx makes no public function calls, then the tx in the mempool will contain:
- A `hiding-kernel-to-rollup` proof and public inputs.
- `contract_class_log_fields` - if applicable, the underlying fields of a new contract class that are being published by this tx. Only a hash of the contract class log fields is exposed as a public input of the proof, to reduce client-side constraints.

Some of those public inputs of the tx make claims about the state of the blockchain, such as historic tree roots, or the non-existence of nullifiers. This `tx-base-private` circuit therefore also takes-in arguments about the _current_ state of the chain; as at the moment just before this tx is to be processed (i.e. the state as at the end of the previous tx). This circuit ensures the tx's claims are consistent with the current state of the chain.

Validator:
- Verifies the `hiding-kernel-to-rollup` proof.
    - Validates that the vk used for verification exists at `HIDING_KERNEL_TO_ROLLUP_VK_INDEX` in the vk tree.
- Validates the public inputs of the `hiding-kernel-to-rollup` proof against arguments relating to the current state of the chain:
    - **Performs a membership check to ensure that the claimed anchor block header used during the tx's execution exists as a leaf of the latest archive tree.**
    - Asserts equality (between the tx and current chain) of the chain_id, version, vk_tree_root, protocol_contracts_hash.
    - Asserts that the tx's chosen gas prices are sufficiently high, relative to the block's minimum requirements.
    - Asserts that the tx doesn't exceed the L2 gas limit.
    - Asserts that the tx's `include_by_timestamp` hasn't already passed, relative to the block's timestamp.
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

Composer `.finish()`:
- **Appends the tx effects to the next available position of a blob.**
    - Tx effects meaning: (tx_hash, revert_code, tx_fee, note_hashes, nullifiers, l2_to_l1_msgs, public_data_writes, private_logs, public_logs, contract_class_logs)
    - The way it "appends" is by absorbing all of those fields into a gigantic poseidon2 sponge ("SpongeBlob"), which will only get squeezed within the checkpoint root circuit.
    - There is a large, dedicated hackmd describing the blobs subprotocol here: https://hackmd.io/pC2DcVNQSpGZMnPUvfv85g
- **Computes the out_hash for this tx**: a subtree root of a sha256 greedy merkle tree, whose unbalanced leaves are the L2-to-L1 messages emitted by this tx. As we recursively prove the binary tree of rollup proofs, we'll progressively build a larger L2-to-L1 messages subtree, whose root will be called the `out_hash`, and which will be stored on L1.
- Propagates public inputs which will be read by the next circuit.

#### `tx-base-public`

**Valid previous circuits:** both `avm` and `chonk-verifier-public` proofs are input.
**Valid next circuits:**
- `tx-merge` (if there are multiple )
- `block-root` <-- BUG?
- `block-root-single-tx` (if the only tx in the block) or
- `block-root-first-single-tx` (if it's the only tx in the block and it's the first block of a checkpoint).

If a tx makes public function calls, then the tx in the mempool will contain:
- A `hiding-kernel-to-public` proof and public inputs.
- `contract_class_log_fields` - if applicable, the underlying fields of a new contract class that are being published by this tx. Only a hash of the contract class log fields is exposed as a public input of the proof, to reduce client-side constraints.

Before reaching this circuit, the tx's enqueued public function calls are all processed by a single `avm` circuit instance, and -- in parallel -- the `hiding-kernel-to-public` proof is verified within a `chonk-verifier-public` circuit and its public inputs are propagated.

Whereas for private-function-only txs much of the tree-insertion and fee-payment logic happens in the `tx-base-private` circuit, for a tx with public functions the AVM circuit handles most of that logic for us.

> Note: if you're comparing this circuit's bullet points against those of the `tx-base-private`, many of the checks and computations that exist in the latter are likely being done by the `avm` when there are public functions to be processed. It's always worth questioning seemingly missing checks, though!

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
    - Validates that the vk used for verification exists at `AVM_VK_INDEX` in the vk tree.
- Validates the public inputs of the `chonk-verifier-public` proof against arguments relating to the current state of the chain (some of which are copied-over from the avm's public inputs):
    - **Performs a membership check to ensure that the claimed anchor block header used during the tx's execution exists as a leaf of the latest archive tree.**
    - Asserts equality (between the tx and current chain) of the chain_id, version, vk_tree_root, protocol_contracts_hash.
    - Asserts that the tx's chosen gas prices are sufficiently high, relative to the block's minimum requirements.
    - Asserts that the tx doesn't exceed the L2 gas limit.
    - Asserts that the tx's `include_by_timestamp` hasn't already passed, relative to the block's timestamp.

Composer `.finish()`:
- **Appends the tx effects to the next available position of a blob.**
    - Tx effects meaning: (tx_hash, revert_code, tx_fee, note_hashes, nullifiers, l2_to_l1_msgs, public_data_writes, private_logs, public_logs, contract_class_logs)
    - The way it "appends" is by absorbing all of those fields into a gigantic poseidon2 sponge ("SpongeBlob"), which will only get squeezed within the checkpoint root circuit.
    - There is a large, dedicated hackmd describing the blobs subprotocol here: https://hackmd.io/pC2DcVNQSpGZMnPUvfv85g
- **Computes the out_hash for this tx**: a subtree root of a sha256 greedy merkle tree, whose unbalanced leaves are the L2-to-L1 messages emitted by this tx. As we recursively prove the binary tree of rollup proofs, we'll progressively build a larger L2-to-L1 messages subtree, whose root will be called the `out_hash`, and which will be stored on L1.
- Propagates public inputs which will be read by the next circuit.

### Block-level circuits

#### `tx-merge`

Explanation todo.

#### `block-root-first` (empty or single or regular) / `block-root` (single or regular)

> Note: there is no `block-root-empty-tx`; only a `block-root-first-empty-tx`

**Valid previous circuits:**
- First block in the checkpoint:
    - `parity-root` and one of:
    - For `block-root-first`:
        - There are valid pairs of left and right vks. Not all pairs are valid.
        -   ```
            global ALLOWED_PREVIOUS_VK_INDICES: [u32; 3] = [
                TX_MERGE_ROLLUP_VK_INDEX,
                PRIVATE_TX_BASE_ROLLUP_VK_INDEX,
                PUBLIC_TX_BASE_ROLLUP_VK_INDEX,
            ];
            ```
    - For `block-root-first-single-tx`:
        -   ```
            global ALLOWED_PREVIOUS_VK_INDICES: [u32; 2] = [
                PRIVATE_TX_BASE_ROLLUP_VK_INDEX,
                PUBLIC_TX_BASE_ROLLUP_VK_INDEX
            ];
            ```
    - For `block-root-first-empty-tx`:
        -   None. Empty block.
- Subsequent blocks in the checkpoint:
    - For `block-root`:
        - There are valid pairs of left and right vks. Not all pairs are valid.
        -   ```
            global ALLOWED_PREVIOUS_VK_INDICES: [u32; 3] = [
                TX_MERGE_ROLLUP_VK_INDEX,
                PRIVATE_TX_BASE_ROLLUP_VK_INDEX,
                PUBLIC_TX_BASE_ROLLUP_VK_INDEX,
            ];
            ```
    - For `block-root-single-tx`:
        -   ```
            global ALLOWED_PREVIOUS_VK_INDICES: [u32; 2] = [
                PRIVATE_TX_BASE_ROLLUP_VK_INDEX,
                PUBLIC_TX_BASE_ROLLUP_VK_INDEX
            ];
            ```

**Valid next circuits:**
- First block in the checkpoint:
    - For `block-root-first`:
        - `block-merge`
        - `checkpoint-root`
    - For `block-root-first-single-tx`:
        - `checkpoint-root`
    - For `block-root-first-empty-tx`:
        - `checkpoint-root`
- Subsequent blocks in the checkpoint:
    - For `block-root`:
        - `block-merge`
        - `checkpoint-root`
    - For `block-root-single-tx`:
        - `checkpoint-root`

##### Empty. (`block-root-first-empty-tx` only)

For when there are no txs in the block, but the block proposer still wants block rewards:
Propagates default empty values:
- Empty spongeblob.
- num_txs = 0
- out_hash = 0
- accumulated fees & mana = 0
Propagates unchanged state (except for the L1->L2 msgs which will be appended-to (see below))

##### First (`block-root-first-empty-tx`, `block-root-first-single-tx`, `block-root-first`).

Validator:
- Validate the parity root proof and vk.

Composer:
- **Inserts the "poseidon2 version" of the l1_to_l2_msg subtree** into the next available leaf of the L1-to-L2-msgs tree.

##### `block-root`, `block-root-first`, `block-root-single-tx`, `block-root-first-single-tx`

Validator:
- Verifies the previous proof(s) (see valid previous circuits above).
    - For the "single" variants, that means verifying a single tx-base proof.
    - For the non-single variants, that means verifying two proofs: some combination of tx-merge proofs and/or tx-base proofs.
    - Validates that the vk(s) used for verification exist(s) in the circuit's hard-coded list of valid vk indices, and within the vk tree.

##### `block-root`, `block-root-first`

Validator:
- **Validates the "consecutiveness" of the two input proofs**.
    - That the left and right subtrees follow the "greedy tree" rules.
    - That constants used in the left and right proofs' public inputs are equal.
    - That the end states of the left subtree are equal to the start states of the right subtree.

Composer:
- **Merges the left and right input subtrees**:
    - Sum the num txs.
    - sha256-hash the left and right out_hashes.
        - Recall: `out_hash` is the root of a subtree containing L2->L1 messages.
    - Sum the left and right accumulated fees.
    - Sum the left and right accumulated mana used.

##### All

Composer:
- **Absorbs Block End Data of one block into the SpongeBlob**;
    - There is a large, dedicated hackmd describing the blobs subprotocol here: https://hackmd.io/pC2DcVNQSpGZMnPUvfv85g
- Squeezes a copy of this SpongeBlob, and inserts that squeezed sponge into the block's BlockHeader
    - as a record of the emitted data of that block.
- Propagates the unsqueezed SpongeBlob
    - (to the Block Merge Rollup circuit), so that the next block can continue to absorb data into it.
- Ensures the block number of the block being built matches the next block number (according to the archive tree's next available leaf index).
- **Creates the block header**.
- **Inserts the block header's leaf** (block header hash) into the next available leaf index of the Archive Tree.

#### `parity-base`

**Valid previous circuits:** None.

**Valid next circuits:** `parity-root`


#### `parity-root`

**Valid previous circuits:** `parity-base`

**Valid next circuits:**
- `block-root-first`
- `block-root-first-single-tx`
- `block-root-first-empty-tx` <-- double-check that this is the case, Mike


### Checkpoint-level circuits

#### `block-merge`

**Valid previous circuits:**
- `block-root-first`
- `block-root`
- `block-merge`

**Valid next circuits:**
- `block-merge`
- `checkpoint-root`

#### `checkpoint-root`

**Valid previous circuits:**
-   ```
    global ALLOWED_PREVIOUS_VK_INDICES: [u32; 6] = [
       BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX,
       BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP_VK_INDEX,
       BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP_VK_INDEX,
       BLOCK_ROOT_ROLLUP_VK_INDEX,
       BLOCK_ROOT_SINGLE_TX_ROLLUP_VK_INDEX,
       BLOCK_MERGE_ROLLUP_VK_INDEX,
    ];
    ```
    - Notice:
        - Ordinarily, a Checkpoint will contain multiple blocks, in which case the input proof will be from a `block-merge` circuit.
        - If the checkpoint only contains a single block, then by definition that block is the "first" block of the checkpoint. Valid circuits are then:
            - `BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX`,
            - `BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP_VK_INDEX`,
            - `BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP_VK_INDEX`,
            - depending on the contents of that block.

**Valid next circuits:**
- `checkpoint-merge`
- `root`

Validator:

- Verifies the previous proof(s) (see valid previous circuits above).
    - For the "single" variants, that means verifying a single tx-base proof.
    - For the non-single variants, that means verifying two proofs: some combination of block-merge proofs and/or block-root proofs.
    - Validates that the vk(s) used for verification exist(s) in the circuit's hard-coded list of valid vk indices, and within the vk tree.
- **Validates the "consecutiveness" of the two input proofs**.
    - That the left and right subtrees follow the "greedy tree" rules.
    - That constants used in the left and right proofs' public inputs are equal.
    - That the end states of the left subtree are equal to the start states of the right subtree.
    - That the left timestamp is <= the right timestamp.
        - Note: blocks in the same checkpoint can have equal timestamps.
    - That the right.in_hash == 0.
- Verify that the left start states were the default "empty" values:
    - Empty start SpongeBlob
    - Start state as per the previous block header (i.e. the last block header of the previous checkpoint).
    - Timestamp of the first block of this checkpoint is > the timestamp of the last block of the previous checkpoint.
    - The in_hash (copied as part of the first block) cannot be empty.
    - Validate that the claimed previous_block_header is indeed the last nonempty leaf of the claimed previous archive tree.
        - Note: the correctness of the claimed previous archive tree will be checked with this epoch's proof is submitted to L1.

Composer:

- **Merges the left and right input subtrees**:
    - Accumulate the `block_headers_hash`.
    - Set the accumulated in_hash to simply be the left in_hash.
        - All L1->L2 messages are copied-over as part of the first block in a checkpoint (see the `block-root-first` circuit variants above) (hence coming from the left-most block-root circuit of the checkpoint).
        - Other blocks in the checkpoint have a `0` in_hash.
    - sha256-hash the left and right out_hashes.
        - Recall: `out_hash` is the root of a subtree containing L2->L1 messages.
    - Sum the left and right accumulated fees.
    - Sum the left and right accumulated mana used.
- Blob stuff
    - There is a large, dedicated hackmd describing the blobs subprotocol here: https://hackmd.io/pC2DcVNQSpGZMnPUvfv85g
        - TODO: incorporate this hackmd into a protocol spec.
    - Computes the Checkpoint End marker.
    - Absorbs the Checkpoint End marker into the SpongeBlob.
    - Ensures the number of absorbed fields is `<=` the max amount of blob data for a checkpoint (6 * 4096 fields).
    - Squeezes the sponge (which represents all blobs of this checkpoint), finally.
    - Takes as a private input hint the entire stream of 6 * 4096 fields of the checkpoint (`blob_fields`)
    - Ensures these fields are all zero after the computed length.
    - It poseidon2-hashes these fields to make sure the result matches the sponge we just squeezed. I.e. it makes sure this stream of `blobs_fields` matches the data that the earlier circuits "saw".
    - For each of those 6 $blob_i$'s of 4096 fields:
        - Evaluates the interpolated polynomial $p_i(X)$ at $z$ to yield the evaluation $y_i$.
        - Adds the next summand in the incremental computations of the batched kzg commitment $C$, and the batched evaluation $y$.
        - Adds the next contribution to the incremental computations of the batch challenges $z$ and $\gamma$.
        - Adds the next contribution to the incremental computation of the $\texttt{blobCommitmentsHash}_M$ that was stored on L1 when checkpoint $M$ was proposed.
            - We do this to prove that the $C_i$'s "seen" by the circuits match the $C_i$'s that were submitted to L1 as part of checkpoint proposals.
    - Propagates the accumulated blob data to the next circuit. (See the hackmd).
- Computes a Checkpoint Header.


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
- **Validates the "consecutiveness" of the two input proofs**.
    - That the left and right subtrees follow the "greedy tree" rules.
    - That constants used in the left and right proofs' public inputs are equal.
    - That the end states of the left subtree are equal to the start states of the right subtree.
    - That both subtrees claim the same final blob challenges z & gamma.

(Composer):
- **Merges the left and right input subtrees**:
    - Sum the number of checkpoints of the two input subtrees of checkpoints.
        - Assert that the sum hasn't exceeded the max number of checkpoints in an epoch.
    - Merge the left and right arrays of `checkpoint_header_hashes`.
        - The final array will be propagated to L1 for some further checks.
    - Merge the left and right arrays of `fees`.

#### `root`

#### `checkpoint-merge`

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
    - If the left subtree represents a single checkpoint, the right proof is a special "padding proof" (a dummy proof, of sorts).
        - The circuit checks the conditions that permit a padding proof to be used.
- **Validates the "consecutiveness" of the two input proofs**.
    - That the left and right subtrees follow the "greedy tree" rules.
    - That constants used in the left and right proofs' public inputs are equal.
    - That the end states of the left subtree are equal to the start states of the right subtree.
    - That both subtrees claim the same final blob challenges z & gamma.

(Composer):
- **Merges the left and right input subtrees**:
    - Sum the number of checkpoints of the two input subtrees of checkpoints.
        - Assert that the sum hasn't exceeded the max number of checkpoints in an epoch.
    - Merge the left and right arrays of `checkpoint_header_hashes`.
        - The final array will be propagated to L1 for some further checks.
    - Merge the left and right arrays of `fees`.
- Asserts that the starting blob_accumulator of the epoch was empty.
- Validates the final_blob_batching_challenges, comparing the claimed challenges against the accumulated computations of those challenges.
    - See the blobs hackmd for more detail on what that means.
- Compresses the final batched blob commitment.


