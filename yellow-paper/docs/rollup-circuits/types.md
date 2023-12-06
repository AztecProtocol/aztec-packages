---
title: Types
sidebar_position: 1
---

# Types


## State


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
Header *.. Header : parentHash
Header *.. Body : contentHash
Header *-- StateReference : state
Header *-- GlobalVariables : globalVariables

class Logs {
    private: EncryptedLogs
    public: UnencryptedLogs
}


class PublicDataWrite {
    index: Fr
    value: Fr
}


class ContractData {
    leaf: Fr
    address: Address
    portal: EthAddress
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

class Archive {
  type: AppendOnlyMerkleTree
}
Archive *-- "m" Header : leaves


class NoteHashTree {
  type: AppendOnlyMerkleTree
  leaves: List~Fr~
}

class ContractTree {
  type: AppendOnlyMerkleTree
}
ContractTree *.. "m" ContractData : leaves 

class PublicDataTree {
  type: SparseMerkleTree
}
PublicDataTree *.. "m" PublicDataWrite : leaves 

class L1ToL2MessageTree {
  type: AppendOnlyMerkleTree
  leaves: List~Fr~
}

class NullifierPreimage {
  value: Fr
  successor_index: Fr
  successor_value: Fr
}

class NullifierTree {
  type: SuccessorMerkleTree
}
NullifierTree *.. "m" NullifierPreimage : leaves

class State { }
State *-- NoteHashTree : noteHashTree
State *-- NullifierTree : nullifierTree
State *-- L1ToL2MessageTree : l1ToL2MessageTree
State *-- PublicDataTree : publicDataTree
State *-- ContractTree : contractTree
State *-- Archive : archive
```

## Overview
Below is a partial diagram of all the types and how they are connected. This is particularly interested in the data that go into and comes out of the rollup circuits and don't care particularly about the data for kernels right now.

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
Header *.. Header : parentHash
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
CombinedAccumulatedData *-- "m" ContractData: contracts
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

    last_archive: Snapshot
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