---
title: Root Rollup
sidebar_position: 4
---

The root rollup circuit is our top circuit, it apply the state changes passed through its children and the cross-chain messages. It is the one that will communicate with the [validating light node](./../contracts/index.md). 

:::info Squishers
This might practically happen through a series of "squisher" circuits that will wrap the proof in another proof that is cheaper to verify on-chain. For example, wrapping a ultra-plonk proof in a standard plonk proof.
:::

Since the output (public inputs) you will see some overlap with the `ProvenBlock` which is what a node must receive together with a proof to progress the chain. More on this will be covered in the [cross-chain communication](./../contracts/index.md) section.

```mermaid
graph LR
A[RootRollupInputs] --> C[RootRollupCircuit] --> B[RootRollupPublicInputs] --> D[ProvenBlock] --> E[Node]
```

## Overview

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
    txs_hash: Fr[2]
    out_hash: Fr[2]
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

### Validity Conditions

```python
def RootRollupCircuit(
    left: ChildRollupData, 
    right: ChildRollupData, 
    l1_to_l2_msgs: List[Fr],
    l1_to_l2_msgs_sibling_path: List[Fr],
    parent: Header,
    parent_sibling_path: List[Fr],
    archive_sibling_path: List[Fr],
) -> RootRollupPublicInputs:
    assert left.proof.is_valid(left.inputs)
    assert right.proof.is_valid(right.inputs)

    assert left.inputs.constants == right.inputs.constants
    assert right.inputs.start == left.inputs.end
    assert left.inputs.type == right.inputs.type
    assert left.inputs.height_in_block_tree == right.inputs.height_in_block_tree

    assert merkle_inclusion(
        parent.hash(), 
        parent_sibling_path, 
        left.inputs.constants.global_variables.block_number, 
        left.inputs.constants.last_archive.root
    )

    l1_to_l2_msg_subtree = MerkleTree(l1_to_l2_msgs)
    l1_to_l2_msg_tree = merkle_insertion(
        parent.state.l1_to_l2_message_tree, 
        l1_to_l2_msg_subtree.root, 
        l1_to_l2_msgs_sibling_path, 
        L1_TO_L2_SUBTREE_HEIGHT, 
        L1_To_L2_HEIGHT
    )

    txs_hash = SHA256(left.inputs.txs_hash | right.inputs.txs_hash)
    out_hash = SHA256(left.inputs.txs_hash | right.inputs.out_hash)

    header = Header(
        last_archive = left.inputs.constants.last_archive,
        content_hash = SHA256(txs_hash | out_hash | SHA256(l1_to_l2_msgs)),
        state = StateReference(
            l1_to_l2_message_tree = l1_to_l2_msg_tree,
            partial = right.inputs.end,
        ),
        global_variables = left.inputs.constants.global_variables,
    )

    archive = merkle_insertion(
        header.last_archive
        header.hash(), 
        archive_sibling_path, 
        0, 
        ARCHIVE_HEIGHT
    )

    return RootRollupPublicInputs(
        aggregation_object = left.inputs.aggregation_object + right.inputs.aggregation_object,
        archive = archive,
        header: Header,
    )
```

The `RootRollupPublicInputs` can then be used together with `Body` to build a `ProvenBlock` which can be used to convince the [validating light node](./../contracts/index.md) of state progression.