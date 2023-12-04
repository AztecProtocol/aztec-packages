---
title: Rollup Circuits
---
:::warning
This part is not yet complete, only just started. I'm considering whether to create some of the types that @benesjan and I discussed to improve clarity on the snapshots etc a bit more. Should make it a bit easier to follow what is going on.
:::

# Rollup Circuits

## Overview

## Base Rollup

### Inputs

| Field | Type | Description | Provided by |
|----------|----------|----------|----------|
| KernelData | KernelData[] | Kernel data for the two transactions being merged. Sequencer helps with public execution + global variables| Users (+ help from sequencer) |  
| StartNoteHashTreeSnapshot | AppendOnlyTreeSnapshot | Snapshot of the note hash tree at the start of the two transactions | Sequencer |
| StartNullifierTreeSnapshot | AppendOnlyTreeSnapshot | Snapshot of the nullifier hash tree at the start of the two transactions | Sequencer |
| StartContractTreeSnapshot | AppendOnlyTreeSnapshot | Snapshot of the contract tree at the start of the two transactions | Sequencer |
| StartPublicDataTreeRoot | Field | Root of the public data tree at the start of the two transactions | Sequencer |
| StartL1ToL2MessagesTreeSnapshot | AppendOnlyTreeSnapshot | Snapshot of the L1 to L2 messages tree at the start of the two transactions | Sequencer |
| StartBlocksTreeSnapshot | AppendOnlyTreeSnapshot | Snapshot of the blocks tree at the start of the two transactions | Sequencer |
| SortedNewNullifiers | Field[] | Sorted list of new nullifiers | Sequencer |
| SortedNewNullifiersIndexes | Field[] | Sorted list of new nullifiers indexes | Sequencer |
| LowNullifierLeafPreimages | NullifierLeafPreimage[] | Low nullifier leaf preimages | Sequencer |
| LowNullifierMembershipWitness | MembershipWitness[] | Low nullifier membership witness | Sequencer |
| NewNoteHashSubtreeSiblingPath | SiblingPath | Sibling path for the new note hash subtree | Sequencer |
| NewNullifierSubtreeSiblingPath | SiblingPath | Sibling path for the new nullifier subtree | Sequencer |
| NewContractSubtreeSiblingPath | SiblingPath | Sibling path for the new contract subtree | Sequencer |
| NewPublicDataUpdateRequestsSiblingPaths | SiblingPath[] | Sibling paths for the new public data update requests | Sequencer |
| PublicDataReadsSiblingPaths | SiblingPath[] | Sibling paths for the public data reads | Sequencer |
| BlocksTreeRootMembershipWitnesses | MembershipWitness[] | Membership witnesses for the blocks tree root, one for each kernel | Sequencer |
| Constants | ConstantRollupData | Data that is consistent for all transactions in the block such as verification keys, parent block and global variables | Sequencer |

:::warning
- Are the `sorted_new_nullifiers` expected to be sorted, where is it then checked that they are sorted? And where is it sorted? What is the reasoning for them being sorted? -> Seems like the permutation is checked inside the `batch_insert` function. Sorted to make the strategy simpler for the batch-insertion.
- Why are the public reads called new in the code?
- Needs to have their names reconsidered @benesjan might have some ideas.
  - `BlocksTreeRootMembershipWitnesses`
  - `ConstantRollupData.start_blocks_tree_snapshot`
:::

### Public Inputs (outputs)
| Field | Type | Description |
|----------|----------|----------|
| RollupType | Field | Type of the rollup: (merge, base or root) |
| RollupSubtreeHeigh| Field | The height of in the block subtree, `base = 0` |
| AggregationObject | AggregationObject | Aggregated proof of all the previous kernel iterations. |
| Constants | ConstantRollupData | Data that is consistent for all transactions in the block such as verification keys, parent block and global variables | 
| StartNoteHashTreeRoot | Field | Root of the note hash tree at the start of the two transactions |
| EndNoteHashTreeRoot | Field | Root of the note hash tree at the end of the two transactions |
| StartNullifierTreeRoot | Field | Root of the nullifier tree at the start of the two transactions |
| EndNullifierTreeRoot | Field | Root of the nullifier tree at the end of the two transactions |
| StartContractTreeRoot | Field | Root of the contract tree at the start of the two transactions |
| EndContractTreeRoot | Field | Root of the contract tree at the end of the two transactions |
| StartPublicDataTreeRoot | Field | Root of the public data tree at the start of the two transactions |
| EndPublicDataTreeRoot | Field | Root of the public data tree at the end of the two transactions |
| ContentHash | Sha256 | Hash of the transaction data | 

:::info Content Hash
Fill in the computation of this. The short explanation is that it is SHA256 hash of the state diff caused by the transactions in the base.
:::

### Validity Conditions

- **Individual Transaction Validity**: For each of the 2 transaction in the base:
  - Kernel Proof MUST be valid
  - Pending private call stack MUST be empty
  - The `maxBlockNum` MUST be smaller or equal to the `globalVariables.block_number`
  - `chainid` of kernel MUST match `globalVariables.chainid`
  - `version` of kernel MUST match `globalVariables.version`
  - The `Base.constants` MUST be equal to the `KernelData.constants`
  - **Public State**:
    - Reads and writes MUST be ordered by causality, e.g., reading after a write MUST return the value written
  - The provided `header` MUST be in the `blocksTree`. THIS NAMING GOTTA BE FIXED.
- **Aggregate proof**: Must aggregate the two proofs into a single proof
- **State Manipulation**: All state changes are grouped into a single ref
  - All new note hashes MUST be inserted into the note hash tree
    - The starting snapshot MUST be `StartNoteHashTreeSnapshot`
    - The result MUST be `EndNoteHashTreeSnapshot`
  - All new nullifiers MUST be inserted into the nullifier hash tree
    - There MUST be no duplicate nullifiers due to these insertions
    - The starting snapshot MUST be `StartNullifierTreeSnapshot`
    - The result MUST be `EndNullifierTreeSnapshot`
  - All new contract notes MUST be inserted into the contract tree
    - The starting snapshot MUST be `StartContractTreeSnapshot`
    - The result MUST be `EndContractTreeSnapshot`
  - All public state changes MUST be applied to the public data tree
    - The starting root MUST be `StartPublicDataTreeRoot`
    - The result MUST be `EndPublicDataTreeRoot`
- **ContentHash**: The content hash MUST be equal to the hash of the state diff caused by the transactions.

## Merge Rollup

## Root Rollup
