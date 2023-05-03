# World State

## Overview

The primary functions of the world state package are to maintain the collection of Merkle Trees comprising the global state of the system and to offer an interface with which the trees can be queried.

The following components enable the package to perform it's role.

### The Merkle Tree DB, a collection of Merkle Trees of varying types.

- Append only 'Standard' merkle trees. New values are inserted into the next available leaf index. Values are never updated.
- Indexed trees are also append only from an external perspective but prior values can be updated internally. The reason for this is that the Indexed Tree leaves not only store the value but the index of the next highest leaf. New insertions can require prior leaves to be updated.
- Sparse trees that can be updated at any index. The 'size' of the tree is defined by the number of non-empty leaves, not by the highest populated leaf index as is the case with a Standard Tree.

All Merkle Trees have commit/rollback semantics. Modifications to the trees are cached until 'committed'. The modifications can be discarded by calling 'rollback' which will return the tree to the last committed state.

### The Synchroniser

The synchroniser's role is to periodically poll for new block information and reconcile that information with the current state of the Merkle Trees.

Onc a new block is received, the synchroniser checks the uncommitted root values of all of the trees against the roots published as part of the block. If they are all equal, the tree state is committed. If they are not equal, the tree states are rolled back to the last committed state before the published data is inserted and committed.

### The Merkle Tree Interface

The interface to the Merkle Tree DB offers a unified asynchronous API to the set of trees available. Reads from the Merkle Trees need to be marked as to whether they should include uncommitted state. For this reason, the MerkleTreeOperationsFacade exist to abstract this details away from the end consumer.

# Building/Testing

Building the package is as simple as calling `yarn build` from the package root.

Running `yarn test` will execute the packages unit tests.
