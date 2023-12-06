---
title: Root Rollup
sidebar_position: 4
---


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


:::warning TODO
The L1 contract must compute the `contentHash` outside the circuits. Essentially, this must include the cross-chain messages and the transactions.
Must be updated for clarity in the contracts
:::