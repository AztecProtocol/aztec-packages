---
title: Aztec Sandbox Errors
---

This section contains a list of errors you may encounter when using Aztec Sanbox and an explanation of each of them.

## Circuit Errors
**To prevent bloating this doc, here is a list of some of the common errors. Feel free to have a look at [circuit_errors.hpp](https://github.com/AztecProtocol/aztec-packages/blob/master/circuits/cpp/src/aztec3/utils/circuit_errors.hpp) for a list of all possible circuit errors.**

### Kernel Circuits
We have several versions of public and private kernels as explained in [our circuits section](../../protocol/circuits/circuits.md). Certain things are only possible in certain versions of the circuits. So always ensure that the right version is being used for proof generation. For example, there is a specific version of the public kernel that only works if the previous kernel iteration was a private kernel. Similarly there is one that only works if the previous kernel was public. 

Remember that for each function call (i.e. each item in the call stack), there is a new kernel iteration that gets run. 

#### 2002 - PRIVATE_KERNEL__INVALID_CONTRACT_ADDRESS
Cannot call contract at address(0x0) privately. 
This error may also happen when you deploy a new contract and the contract data hash is inconsistent to the expected contract address.

#### 2005 - PRIVATE_KERNEL__NEW_COMMITMENTS_PROHIBITED_IN_STATIC_CALL
For static calls, new commitments aren't allowed

#### 2006 - PRIVATE_KERNEL__NEW_NULLIFIERS_PROHIBITED_IN_STATIC_CALL
For static calls, new nullifiers aren't allowed

#### 2009 - PRIVATE_KERNEL__NON_PRIVATE_FUNCTION_EXECUTED_WITH_PRIVATE_KERNEL
You cannot execute a public noir function in the private kernel

#### 2011 - PRIVATE_KERNEL__UNSUPPORTED_OP
You are trying to do something that is currently unsupported in the private kernel. If this is a blocker feel free to open up an issue on our monorepo [aztec3-packages](https://github.com/AztecProtocol/aztec3-packages/tree/master) or reach out to us on discord

Note that certain operations are unsupported on certain versions of the private kernel. Eg static calls are allowed for all but the initial iteration of the private kernel (which initialises the kernel for subsequent function calls).

#### 2012 - PRIVATE_KERNEL__CONTRACT_ADDRESS_MISMATCH
For the initial iteration of the private kernel, only the expected noir contract should be the entrypoint. Static and delegate calls are not allowed in the initial iteration.

#### 2013 - PRIVATE_KERNEL__NON_PRIVATE_KERNEL_VERIFIED_WITH_PRIVATE_KERNEL
The previous kernel iteration within the private kernel must also be private

#### 2014 - PRIVATE_KERNEL__CONSTRUCTOR_EXECUTED_IN_RECURSION
A constructor must be executed as the first tx in the recursion i.e. a constructor call must be the first item in the call stack i.e. it can be executed in the first kernel iteration but not in subsequent ones. This also means you can't have a contract deploy another contract yet on Aztec.

#### 2017 - PRIVATE_KERNEL__USER_INTENT_MISMATCH_BETWEEN_TX_REQUEST_AND_CALL_STACK_ITEM
Confirms that the TxRequest (user's intent) matches the private call being executed. This error may happen when:
* origin address of tx_request doesn't match call_stack_item's contract_address
* tx_request.function_data doesn't match call_stack_item.function_data
* noir function args passed to tx_request doesn't match args in the call_stack_item

#### 2018 - PRIVATE_KERNEL__READ_REQUEST_PRIVATE_DATA_ROOT_MISMATCH
Given a read request and provided witness, we check that the merkle root obtained from the witness' sibling path and it's leaf is similar to the historic state root we want to read against. This is a sanity check to ensure we are reading from the right state. 
For a non transient read, we fetch the merkle root from the membership witnesses and the leaf index 

#### 2019 - PRIVATE_KERNEL__TRANSIENT_READ_REQUEST_NO_MATCH
A pending commitment is the one that is not yet added to private data tree.
A transient read is when we try to "read" a pending commitment.
This error happens when you try to read a pending commitment that doesn't exist.

#### 2021 - PRIVATE_KERNEL__UNRESOLVED_NON_TRANSIENT_READ_REQUEST
For a transient read request we skip merkle membership checks since pending commitments aren't inserted into the private data tree yet.
But for non transient reads, we do a merkle membership check. Redas are done at the kernel circuit. So this checks that there are no already unresolved reads from a previous kernel iteration (other than non transient ones).

#### 3001 - PUBLIC_KERNEL__UNSUPPORTED_OP
You are trying to do something that is currently unsupported in the public kernel. If this is a blocker feel free to open up an issue on our monorepo [aztec3-packages](https://github.com/AztecProtocol/aztec3-packages/tree/master) or reach out to us on discord

#### 3002 - PUBLIC_KERNEL__PRIVATE_FUNCTION_NOT_ALLOWED
Calling a private noir function in a public kernel is not allowed. 

#### 3005 - PUBLIC_KERNEL__NON_EMPTY_PRIVATE_CALL_STACK
Public functions are executed after all the private functions are (see [private-public execution](../../how-it-works/private-public-execution.mdx)). As such, private call stack must be empty when executing in the public kernel.

#### 3011 - PUBLIC_KERNEL__CALCULATED_PRIVATE_CALL_HASH_AND_PROVIDED_PRIVATE_CALL_HASH_MISMATCH
When the hash stored at the top most of the call stack is different to the call stack item expected by the public kernel's inputs.

#### 3012 - PUBLIC_KERNEL__PUBLIC_CALL_STACK_MISMATCH
Similar to above, except here we actually have the preimages to the call stack and hash to ensure they match.

#### 3013 - PUBLIC_KERNEL__CONTRACT_DEPLOYMENT_NOT_ALLOWED
Public kernel doesn't allow contract deployments

#### 3014 - PUBLIC_KERNEL__CONSTRUCTOR_NOT_ALLOWED
Aztec doesn't support public constructors.

#### 3015 - PUBLIC_KERNEL__CONTRACT_ADDRESS_INVALID
Calling `address(0x0)` publicly is not permitted.

#### 3016 - PUBLIC_KERNEL__FUNCTION_SIGNATURE_INVALID
Cannot call a contract with no function (i.e. function signature of 0) publicly. 

#### 3022 - PUBLIC_KERNEL__PUBLIC_CALL_STACK_CONTRACT_STORAGE_UPDATES_PROHIBITED_FOR_STATIC_CALL
For static calls, no contract storage change requests are allowed. 

#### 3024 - PUBLIC_KERNEL__CALL_CONTEXT_CONTRACT_STORAGE_UPDATE_REQUESTS_PROHIBITED_FOR_STATIC_CALL
Same as [3022](#3022---public_kernel__public_call_stack_contract_storage_updates_prohibited_for_static_call), no contract changes are allowed for static calls.

#### 3026 - PUBLIC_KERNEL__NEW_COMMITMENTS_PROHIBITED_IN_STATIC_CALL
For static calls, no new commitments or nullifiers can be added to the state.

#### 3027 - PUBLIC_KERNEL__NEW_NULLIFIERS_PROHIBITED_IN_STATIC_CALL
For static calls, no new commitments or nullifiers can be added to the state.

### Rollup circuit errors
These are errors that occur when kernel proofs (transaction proofs) are sent to the rollup circuits to create an L2 block. See [rollup circuits](../../protocol/circuits/rollup.md) for more information.

#### 4007 - BASE__INVALID_CHAIN_ID
The L1 chain ID you used in your proof generation (for your private transaction) is different to what the rollup circuits expected. Double check against the global variables passed to noir and the config set in [Aztec's rollup contract](https://github.com/AztecProtocol/aztec-packages/blob/master/l1-contracts/src/core/Rollup.sol) which are [read in by sequencer](https://github.com/AztecProtocol/aztec3-packages/blob/master/yarn-project/sequencer-client/src/global_variable_builder/global_builder.ts#L32) and subsequently passed in as inputs to the base rollup. When the sequencer submits the block to the rollup contracts, this is again sanity checked so ensure this is the same everywhere. 

#### 4008 - BASE__INVALID_VERSION
Same as [section 4007](#4007---base__invalid_chain_id) except the `version` refers to the version of the Aztec L2 instance.

Some scary bugs like `4003 - BASE__INVALID_NULLIFIER_SUBTREE` and `4004 - BASE__INVALID_NULLIFIER_RANGE` which are to do malformed nullifier trees (see [Indexed Merkle Trees](../../protocol/trees/indexed-merkle-tree.mdx)) etc may seem unrelated at a glance, but at a closer look may be because of some bug in an application's Noir code. Same is true for certain instances of `7008 - MEMBERSHIP_CHECK_FAILED`.


### Generic circuit errors

#### 7009 - ARRAY_OVERFLOW
Circuits work by having a fixed size array. As such, we have limits on how many UTXOs can be created (aka "commitments") or destroyed/nullified (aka "nullifiers") in a transaction. Similarly we have limits on many reads or writes you can do, how many contracts you can create in a transaction. This error typically says that you have reached the current limits of what you can do in a transaction. Some examples when you may hit this error are:

* too many new commitments in one tx
* too many new nullifiers in one tx
    - Note: Nullifiers may be created even outside the context of your noir code. Eg, when creating a contract, we add a nullifier for its address to prevent same address from ever occurring. Similarly, we add a nullifier for your transaction hash too. 
* too many private function calls in one tx (i.e. call stack size exceeded)
* too many public function calls in one tx (i.e. call stack size exceeded)
* too many new L2 to L1 messages in one tx
* too many contracts created in one tx
* too many public data update requests in one tx
* too many public data reads in one tx
* too many transient read requests in one tx
* too many transient read request membership witnesses in one tx

You can have a look at our current constants/limitations in [constants.hpp](https://github.com/AztecProtocol/aztec-packages/blob/master/circuits/cpp/src/aztec3/constants.hpp)

#### 7008 - MEMBERSHIP_CHECK_FAILED
Users may create a proof against a historic state in Aztec. The rollup circuits performs a merkle membership check to ensure this state existed at some point. If the historic state doesn't exist, you get this error. Some examples when you may hit this error are:

* using invalid historic private data tree state (aka historic commitments tree)
* using invalid historic contracts data tree state 
* using invalid historic L1 to L2 message data tree state 
* inserting a subtree into the greater tree 
    - we make a smaller merkle tree of all the new commitments/nullifiers etc that were created in a transaction or in a rollup and add it to the bigger state tree. Before inserting, we do a merkle membership check to ensure that the index to insert at is indeed an empty subtree (otherwise we would be overwriting state). This can happen when `next_available_leaf_index` in the state tree's snapshot is wrong (it is fetched by the sequencer from the archiver). The error message should reveal which tree is causing this issue
    - nullifier tree related errors - The nullifier tree uses an [Indexed Merkle Tree](../../protocol/trees/indexed-merkle-tree.mdx). It requires additional data from the archiver to know which is the nullifier in the tree that is just below the current nullifier before it can perform batch insertion. If the low nullifier is wrong, or the nullifier is in incorrect range, you may receive this error.

---

## Archiver Errors
* "L1 to L2 Message with key ${messageKey.toString()} not found in the confirmed messages store" - happens when the L1 to L2 message doesn't exist or is "pending", when the user has sent a message on L1 via the Inbox contract but it has yet to be included in an L2 block by the sequencer - user has to wait for sequencer to pick it up and the archiver to sync the respective L2 block. You can get the sequencer to pick it up by doing an arbitary transaction on L2 (eg send DAI to yourself). This would give the sequencer a transaction to process and as a side effect it would look for any pending messages it should include.

* "Unable to remove message: L1 to L2 Message with key ${messageKeyBigInt} not found in store" - happens when trying to confirm a non-existent pending message or cancelling such a message. Perhaps the sequencer has already confirmed the message?

* "Block number mismatch: expected ${l2BlockNum} but got ${block.number}" - The archiver keeps track of the next expected L2 block number. It throws this error if it got a different one when trying to sync with the rollup contract's events on L1.

## Sequencer Errors
* "Calldata hash mismatch" - the sequencer assembles a block and sends it to the rollup circuits for proof generation. Along with the proof, the circuits return the hash of the calldata that must be sent to the Rollup contract on L1. Before doing so, the sequencer sanity checks that this hash is equivalent to the calldata hash of the block that it submitted. This could be a bug in our code e.g. if we are ordering things differently in circuits and in our transaction/block (e.g. incorrect ordering of encrypted logs or queued public calls). Easiest way to debug this is by printing the calldata of the block both on the TS (in l2Block.getCalldataHash()) and C++ side (in the base rollup)

* "${treeName} tree root mismatch" - like with calldata mismatch, it validates that the root of the tree matches the output of the circuit simulation. The tree name could be Public data tree, Private Data tree, Contract tree, Nullifier tree or the L1ToL2Message tree, 

* "${treeName} tree next available leaf index mismatch" - validating a tree's root is not enough. It also checks that the `next_avaliable_leaf_index` is as expected. This is the next index we can insert new values into. Note that for the public data tree, this test is skipped since as it is a sparse tree unlike the others. 

* "Public call stack size exceeded" - In Aztec, the sequencer executes all enqueued public functions in a transaction (to prevent race conditions - see [private-public execution](../../how-it-works/private-public-execution.mdx)). This error says there are too many public functions requested. 

* "Array size exceeds target length" - happens if you add more items than allowed by the constants set due to our circuit limitations (eg sending too many L2 to L1 messages or creating a function that exceeds the call stack length or return more values than what Noir functions allows)

* "Failed to publish block" - Happens when sequencer tries to submit its L2 block + proof to the rollup contract. Use the CLI to find any solidity error and then refer the [Contract errors section](#l1-aztec-contract-errors).

## L1 Aztec Contract Errors
Aztec's L1 contracts use custom errors in solidity. While it saves gas, it has a side effect of making it harder to decode when things go wrong. If you get an error when submitting an L2Block into our rollup contract or when interacting with our Inbox/Outbox contracts, you can use the [Errors.sol library](https://github.com/AztecProtocol/aztec-packages/blob/master/l1-contracts/src/core/libraries/Errors.sol) to match the hex encoded error to the error name. 


import Disclaimer from '../../common/\_disclaimer.mdx';
<Disclaimer/>