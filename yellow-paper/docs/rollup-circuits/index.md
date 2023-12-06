---
title: Rollup Circuits
sidebar_position: 99
---


:::warning
This part is not yet complete, only just started. I'm considering whether to create some of the types that @benesjan and I discussed to improve clarity on the snapshots etc a bit more. Should make it a bit easier to follow what is going on.
:::

## Overview

Our block proofs are build in a binary tree structure, rolling two proofs into one at every layer. This rolling allows us to keep the workload of the individual proof small, while making it very parallelizable. This works very well for case where we want many actors to be able to participate in the proof generation.

The tree structure is outlined below, but the general idea is that we have a tree where all the leafs are transactions (kernel proofs) and through $\log n$ steps we can then "compress" it down to just a single root proof. Note that we have three (3) different types of "merger" circuits, namely:
- The base rollup
  - Merges two kernel proofs
- The merge rollup
  - Merges two base rollup proofs OR two merge rollup proofs
- The root rollup
  - Merges two merge rollup proofs 

In the diagram the size of the tree is limited for show, but a larger tree will have more layers of merge rollups proofs.

```mermaid
graph TD
    R[Root] --> M0[Merge 0]
    R --> M1[Merge 1]
    
    M0 --> B0[Base 0]
    M0 --> B1[Base 1]
    M1 --> B2[Base 2]
    M1 --> B3[Base 3]

    B0 --> K0[Kernel 0]
    B0 --> K1[Kernel 1]
    B1 --> K2[Kernel 2]
    B1 --> K3[Kernel 3]
    B2 --> K4[Kernel 4]
    B2 --> K5[Kernel 5]
    B3 --> K6[Kernel 6]
    B3 --> K7[Kernel 7]
```

To understand what the circuits are doing and what checks they need to apply it is useful to understand what data is going into the circuits and what data is coming out. Below is a figure of the data structures thrown around for the block proof creation. Note that the diagram does not include much of the operations for kernels, but mainly the data structures that are used for the rollup circuits.

```mermaid
classDiagram
direction TB


class PartialStateReference {
    noteHashTree: Snapshot
    nullifierTree: Snapshot
    contractTree: Snapshot
    publicDataTree: Snapshot
}

class StateReference {
    l1ToL2MessageTree: Snapshot
}
StateReference *-- PartialStateReference: partial

class GlobalVariables {
    block_number: Fr
    timestamp: Fr
    version: Fr
    chain_id: Fr
    coinbase: Address
}

class Header {
    last_archive: Snapshot
}
Header *.. Body : contentHash
Header *-- StateReference : state
Header *-- GlobalVariables : globalVariables

class ContractData {
    leaf: Fr
    address: Address
    portal: EthAddress
}

class Logs {
    private: EncryptedLogs
    public: UnencryptedLogs
}

class PublicDataWrite {
    index: Fr
    value: Fr
}

class TxEffect {
    noteHashes: List~Fr~
    nullifiers: List~Fr~
    l2ToL1Msgs: List~Fr~
}
TxEffect *-- "m" ContractData: contracts
TxEffect *-- "m" PublicDataWrite: publicWrites
TxEffect *-- Logs : logs

class Body {
    l1ToL2Messages: List~Fr~
}
Body *-- "m" TxEffect

class ProvenBlock { 
    archive: Snapshot
}

ProvenBlock *-- Header : header
ProvenBlock *-- Body : body

class ConstantRollupData {
  last_archive: Snapshot
  base_rollup_vk_hash: Fr,
  merge_rollup_vk_hash: Fr,
}
ConstantRollupData *-- GlobalVariables : globalVariables

class PublicDataUpdateRequest {
    index: Fr
    old_value: Fr
    new_value: Fr
}

class PublicDataRead {
    index: Fr
    value: Fr
}

class NewContractData {
    function_tree_root: Fr
    address: Address
    portal: EthAddress
}

class CombinedAccumulatedData {
  aggregation_object: AggregationObject
  read_requests: List~Fr~
  pending_read_requests: List~Fr~
  note_hashes: List~Fr~
  nullifiers: List~Fr~
  nullified_note_hashes: List~Fr~
  
  l2_to_l1_messages: List~Fr~

  private_call_stack: List~CallRequest~
  public_call_stack: List~CallRequest~
}
CombinedAccumulatedData *-- "m" NewContractData: contracts
CombinedAccumulatedData *-- "m" PublicDataUpdateRequest: publicUpdateRequests
CombinedAccumulatedData *-- "m" PublicDataRead: publicReads
CombinedAccumulatedData *-- Logs : logs

class ContractDeploymentData {
    deployer_public_key: Point
    constructor_vk_hash: Fr
    constructor_args_hash: Fr
    function_tree_root: Fr
    salt: Fr
    portal_address: Fr
}

class TxContext {
    fee_context: FeeContext
    is_contract_deployment: bool
    chain_id: Fr
    version: Fr
}
TxContext *-- ContractDeploymentData: contract_deployment_data

class CombinedConstantData { }
CombinedConstantData *-- Header : historical_header
CombinedConstantData *-- TxContext : tx_context

class KernelPublicInputs {
  constants: CombinedConstantData
  is_private: bool
}
KernelPublicInputs *-- CombinedAccumulatedData : end
KernelPublicInputs *-- CombinedConstantData : constants

class KernelData {
  proof: Proof
}
KernelData *-- KernelPublicInputs : publicInputs

class StateDiffHints {
  nullifier_predecessor_preimages: List~NullifierLeafPreimage~
  nullifier_predecessor_membership_witnesses: List~NullifierMembershipWitness~
  sorted_nullifiers: List~Fr~
  sorted_nullifier_indexes: List~Fr~
  note_hash_subtree_sibling_path: List~Fr~,
  nullifier_hash_subtree_sibling_path: List~Fr~,
  contracts_subtree_sibling_path: List~Fr~,
  public_data_update_requests_sibling_paths: List~List~Fr~~
  public_data_reads_sibling_paths: List~List~Fr~~
}

class BaseRollupInputs {
  historical_header_membership_witnesses: List~HeaderMembershipWitness~
}
BaseRollupInputs *-- "m" KernelData : kernelData
BaseRollupInputs *-- PartialStateReference : partial
BaseRollupInputs *-- StateDiffHints : stateDiffHints
BaseRollupInputs *-- ConstantRollupData : constants

class BaseOrMergeRollupPublicInputs {
    type: Fr
    height_in_block_tree: Fr
    aggregation_object: AggregationObject
    content_hash: Fr[2]
}
BaseOrMergeRollupPublicInputs *-- ConstantRollupData : constants
BaseOrMergeRollupPublicInputs *-- PartialStateReference : start
BaseOrMergeRollupPublicInputs *-- PartialStateReference : end

class ChildRollupData {
    proof: Proof
}
ChildRollupData *-- BaseOrMergeRollupPublicInputs: inputs

class MergeRollupInputs { }
MergeRollupInputs *-- ChildRollupData: left
MergeRollupInputs *-- ChildRollupData: right

class RootRollupInputs { 
    l1_to_l2_msgs_tree: Snapshot
    l1_to_l2_msgs: List~Fr~
    l1_to_l2_msgs_sibling_path: List~Fr~

    archive_sibling_path: List~Fr~
}
RootRollupInputs *-- ChildRollupData: left
RootRollupInputs *-- ChildRollupData: right


class RootRollupPublicInputs {
    aggregation_object: AggregationObject
    archive: Snapshot
}
RootRollupPublicInputs *--Header : header
```

Since the diagram can be quite overwhelming, we will go through the different data structures and what they are used for along with the three (3) different rollup circuits.


import DocCardList from '@theme/DocCardList';

<DocCardList />

### Types



## Merge Rollup

## Root Rollup
The root rollup output (public inputs) will be the values that make their way onto the validating light node, see **REFERENCE** for more. 

### Updating trees Algorithm gives 
- Given a list of leaves to add, create a Merkle tree of them
- This subtree must be  added to the `StartTreeSnapshot` to generate `EndTreeSnapshot`
  - To add, use `NewSubtreeSiblingPath` provided in BaseRollupInputs for each of the trees (Contract Tree, Note Hash tree etc.)
  - `NewSubtreeSiblingPath` MUST be of same length as the height of the subtree 
  - `StartTreeSnapshot` at the index of insertion of subtree MUST be empty (since we insert a subtree, check that the value at the subtree index is equivalent of an empty subtree)
  - compute new root against the sibling path
  - Compute `NewNextAvailableLeafIndex` to be 2 ^ subtree depth + `StartContractTreeSnapshot.NextAvailableLeafIndex`
  - Create `EndContractTreeSnapshot` = {new root, NewNextAvailableLeafIndex}