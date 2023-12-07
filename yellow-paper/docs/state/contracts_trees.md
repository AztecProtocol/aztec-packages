# Contracts Trees

Global state includes two trees for contracts: a [_contract classes_](../contract-deployment/classes.md) tree and a [_contract instances_](../contract-deployment/instances.md) tree. These trees store contract class identifiers and contract instance addresses respectively. Both trees are implemented as [indexed Merkle trees](./tree_impls.md#indexed-merkle-trees) in order to support non-membership proofs: 

- A public call to an undeployed contract instance needs to provably fail.
- A re-deployment of the same instance must provably fail.
- A public deployment of an instance with an unregistered contract class need to provably fail.
- A delegate call to an unregistered class must provably fail.

<!-- NOTE: We should be able to turn the contract class into an append-only merkle tree if we don't include delegate calls nor public contract deployments. -->

The identifiers for new classes and instances are emitted by canonical application contracts, which are validated and re-emitted by the kernel circuit. Uniqueness in their respective trees is checked on insertion.