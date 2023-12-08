---
title: Rollup Circuits
sidebar_position: 99
---

## Overview

Together with the [validating light node](./../contracts/index.md) the rollup circuits is was must ensure that incoming blocks are valid, that state is progressed correctly and that anyone can rebuild the state.

To support this, we construct a single proof for the entire block, which is then verified by the validating light node. This single proof is constructed by recursively merging proofs together in a binary tree structure. This structure  allows us to keep the workload of the individual proof small, while making it very parallelizable. This works very well for case where we want many actors to be able to participate in the proof generation.

The tree structure is outlined below, but the general idea is that we have a tree where all the leaves are transactions (kernel proofs) and through $\log n$ steps we can then "compress" them down to just a single root proof. Note that we have three (3) different types of "merger" circuits, namely:
- The base rollup
  - Merges two kernel proofs
- The merge rollup
  - Merges two base rollup proofs OR two merge rollup proofs
- The root rollup
  - Merges two merge rollup proofs 

In the diagram the size of the tree is limited for show, but a larger tree will have more layers of merge rollups proofs. Circles mark the different types of proofs, while squares mark the different circuit types.

```mermaid
graph BT
    R_p((Root))
    R_c[Root]

    R_c --> R_p

    M0_p((Merge 0))
    M1_p((Merge 1))
    M0_p --> R_c
    M1_p --> R_c

    M0_c[Merge 0]
    M1_c[Merge 1]
    M0_c --> M0_p
    M1_c --> M1_p

    B0_p((Base 0))
    B1_p((Base 1))
    B2_p((Base 2))
    B3_p((Base 3))
    B0_p --> M0_c
    B1_p --> M0_c
    B2_p --> M1_c
    B3_p --> M1_c


    B0_c[Base 0]
    B1_c[Base 1]
    B2_c[Base 2]
    B3_c[Base 3]
    B0_c --> B0_p
    B1_c --> B1_p
    B2_c --> B2_p
    B3_c --> B3_p

    K0((Kernel 0))
    K1((Kernel 1))
    K2((Kernel 2))
    K3((Kernel 3))
    K4((Kernel 4))
    K5((Kernel 5))
    K6((Kernel 6))
    K7((Kernel 7))
    K0 --> B0_c
    K1 --> B0_c
    K2 --> B1_c
    K3 --> B1_c
    K4 --> B2_c
    K5 --> B2_c
    K6 --> B3_c
    K7 --> B3_c

    style R_p fill:#1976D2;
    style M0_p fill:#1976D2;
    style M1_p fill:#1976D2;
    style B0_p fill:#1976D2;
    style B1_p fill:#1976D2;
    style B2_p fill:#1976D2;
    style B3_p fill:#1976D2;
    style K0 fill:#1976D2;
    style K1 fill:#1976D2;
    style K2 fill:#1976D2;
    style K3 fill:#1976D2;
    style K4 fill:#1976D2;
    style K5 fill:#1976D2;
    style K6 fill:#1976D2;
    style K7 fill:#1976D2;
```

To understand what the circuits are doing and what checks they need to apply it is useful to understand what data is going into the circuits and what data is coming out. 

Below is a figure of the data structures thrown around for the block proof creation. Note that the diagram does not include much of the operations for kernels, but mainly the data structures that are used for the rollup circuits.

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
    start_public_data_root: Fr
    end_public_data_root: Fr
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
  nullifier_subtree_sibling_path: List~Fr~,
  contract_subtree_sibling_path: List~Fr~,
  public_data_sibling_path: List~Fr~,
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

:::info CombinedAccumulatedData
Note that the `CombinedAccumulatedData` contains elements that we won't be using throughout the rollup circuits. However, as the data is used for the kernel proofs (when it is build recursively), we will include it here anyway.
:::

Since the diagram can be quite overwhelming, we will go through the different data structures and what they are used for along with the three (3) different rollup circuits.

### Higher-level tasks
Before looking at the circuits individually, it can however be a good idea to recall the reason we had them in the first place. For this, we are especially interested in the tasks that goes across multiple circuits and proofs.

#### State consistency
While the individual kernels are validated on their own, they might rely on state changes earlier in the block. For the block to be correctly validated, this means that when validating kernel $n$, it must be executed on top of the state after all kernels $<n$ have been applied. For example, when kernel $3$ is executed, it must be executed on top of the state after kernel $0$, $1$ and $2$ has been applied. If this is not the case, the kernel proof might be valid, but the state changes invalid which could lead to double spends. 

It is therefore of the highest importance that the circuits ensure that the state is progressed correctly across circuit types and proofs. Logically, taking a few of the kernels from the above should be executed/proven as butchered below, $k_n$ applied on top of the state that applied $k_{n-1}$

```mermaid
graph LR
    SM[State Machine]
    S0((State 0))
    K0((Kernel 0))
    S1((State 1))

    S0 --> SM
    K0 --> SM
    SM --> S1


    SM_2[State Machine]
    K1((Kernel 1))
    S2((State 2))

    S1 --> SM_2
    K1 --> SM_2
    SM_2 --> S2

    style K0 fill:#1976D2;
    style K1 fill:#1976D2;
```

#### State availability
To ensure that state is made available, we could rely on the full block body as public inputs, but this would be very expensive. Instead we rely on a commitment to the body (the `ContentHash`) which we build upon throughout proof generation as needed.

To check that this body is published a node can reconstruct the `ContentHash` from available data. Since we define finality as the point where the block is validated and included in the state of the [validating light node](./../contracts/index.md), we can define "available" at the level of this node, e.g., if the validating light node can reconstruct the commitment then it is available.

Since we strive to minimize the compute requirements to prove blocks, we amortize the commitment cost across the full three. We can do so by building merkle trees of partial "commitments" that are then finished at the root. Below, we outline the `TxsHash` merkle tree that is based on the `TxEffect`s and a `OutHash` which is based on the `l2_to_l1_msgs` (cross-chain messages) for each transaction. While the `TxsHash` implicitly include the `l2_to_l1_msgs` we construct it separately since the `l2_to_l1_msgs` must be known to the contract directly and not just proven available. This is not a concern when using calldata as the data layer, but is a concern when using alternative data layers such as [Celestia](https://celestia.org/) or [Blobs](https://eips.ethereum.org/EIPS/eip-4844).

```mermaid
graph BT
    R[TxsHash]
    M0[Hash 0-1]
    M1[Hash 2-3]
    B0[Hash 0.0-0.1]
    B1[Hash 1.0-1.1]
    B2[Hash 2.0-2.1]
    B3[Hash 3.0-3.1]
    K0[TxEffect 0.0]
    K1[TxEffect 0.1]
    K2[TxEffect 1.0]
    K3[TxEffect 1.1]
    K4[TxEffect 2.0]
    K5[TxEffect 2.1]
    K6[TxEffect 3.0]
    K7[TxEffect 3.1]

    M0 --> R
    M1 --> R
    B0 --> M0
    B1 --> M0
    B2 --> M1
    B3 --> M1
    K0 --> B0
    K1 --> B0
    K2 --> B1
    K3 --> B1
    K4 --> B2
    K5 --> B2
    K6 --> B3
    K7 --> B3
```


```mermaid
graph BT
    R[OutHash]
    M0[Hash 0-1]
    M1[Hash 2-3]
    B0[Hash 0.0-0.1]
    B1[Hash 1.0-1.1]
    B2[Hash 2.0-2.1]
    B3[Hash 3.0-3.1]
    K0[l2_to_l1_msgs 0.0]
    K1[l2_to_l1_msgs 0.1]
    K2[l2_to_l1_msgs 1.0]
    K3[l2_to_l1_msgs 1.1]
    K4[l2_to_l1_msgs 2.0]
    K5[TxEffect 2.1]
    K6[l2_to_l1_msgs 3.0]
    K7[l2_to_l1_msgs 3.1]

    M0 --> R
    M1 --> R
    B0 --> M0
    B1 --> M0
    B2 --> M1
    B3 --> M1
    K0 --> B0
    K1 --> B0
    K2 --> B1
    K3 --> B1
    K4 --> B2
    K5 --> B2
    K6 --> B3
    K7 --> B3
```

 The roots of these tree together with incoming messages makes up the `ContentHash`. 
```python
def content_hash(body: Body):
    txs_hash = merkle_tree(body.txs, SHA256).root
    out_hash = merkle_tree([tx.l1_to_l2_msgs for tx in body.txs], SHA256).root
    in_hash = SHA256(body.l1_to_l2_messages)
    return SHA256(txs_hash, out_hash, in_hash)
```

:::info SHA256
SHA256 is used since as the hash function since it will likely be reconstructed outside the circuit in a resource constrained environment (Ethereum L1).
:::

## Next Steps

import DocCardList from '@theme/DocCardList';

<DocCardList />