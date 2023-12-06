---
title: State
sidebar_position: 10
---

# State

Global state in the Aztec Network is represented by a set of Merkle trees: the [Note Hash tree](./note_hash_tree.md), [Nullifier tree](./nullifier_tree.md), and [Public Data tree](./public_data_tree.md) reflect the latest state of the chain, while the L1 to L2 message tree allows for [cross-chain communication](../contracts/#l2-outbox) and the [Archive](./archive.md) allow for historical state access.

Merkle trees are either 
- [append-only](./tree_impls.md#append-only-merkle-trees), for data where we only require inclusion proofs or 
- [indexed](./tree_impls.md#indexed-merkle-trees) for storing data that requires proofs of non-membership.

:::warning Discussion Point
We are using Successor merkle trees (also known as indexed) for data where we rely on proofs of non-membership. Do we want to support the same for the `noteHashTree` and the `l1ToL2MessageTree` as well? It is not used by the protocol circuits, but would let users more easily prove statements like "This note don't exists" or "This message was not included in the rollup". I'm not sure how useful this would be. But we should maybe consider if there are some use cases for this.
:::

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
Archive *.. "m" Header : leaves


class NoteHashTree {
  type: AppendOnlyMerkleTree
  leaves: List~Fr~
}

class NewContractData {
    function_tree_root: Fr
    address: Address
    portal: EthAddress
}

class ContractTree {
  type: AppendOnlyMerkleTree
}
ContractTree *.. "m" NewContractData : leaves 

class PublicDataPreimage {
  key: Fr
  value: Fr
  successor_index: Fr
  successor_value: Fr
}

class PublicDataTree {
  type: SuccessorMerkleTree
}
PublicDataTree *.. "m" PublicDataPreimage : leaves 

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
State *-- L1ToL2MessageTree : l1ToL2MessageTree
State *-- Archive : archive
State *-- NoteHashTree : noteHashTree
State *-- NullifierTree : nullifierTree
State *-- PublicDataTree : publicDataTree
State *-- ContractTree : contractTree
```


import DocCardList from '@theme/DocCardList';

<DocCardList />
