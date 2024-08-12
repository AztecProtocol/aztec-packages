---
title: Understanding Function Context
sidebar_position: 1
tags: [functions, context]
---

## What is the context

The context is an object that is made available within every function in `Aztec.nr`. As mentioned in the [kernel circuit documentation](../../concepts/circuits/kernels/private_kernel.md). At the beginning of a function's execution, the context contains all of the kernel information that application needs to execute. During the lifecycle of a transaction, the function will update the context with each of it's side effects (created notes, nullifiers etc.). At the end of a function's execution the mutated context is returned to the kernel to be checked for validity.

Behind the scenes, Aztec.nr will pass data the kernel needs to and from a circuit, this is abstracted away from the developer. In an developer's eyes; the context is a useful structure that allows access and mutate the state of the `Aztec` blockchain.

On this page, you'll learn

- The details and functionalities of the private context in Aztec.nr
- Difference between the private and public contexts and their unified APIs
- Components of the private context, such as inputs and block header.
- Elements like return values, read requests, new note hashes, and nullifiers in transaction processing
- Differences between the private and public contexts, especially the unique features and variables in the public context

## Two contexts, one API

The `Aztec` blockchain contains two environments - public and private.

- Private, for private transactions taking place on user's devices.
- Public, for public transactions taking place on the network's sequencers.

As there are two distinct execution environments, they both require slightly differing execution contexts. Despite their differences; the API's for interacting with each are unified. Leading to minimal context switch when working between the two environments.

The following section will cover both contexts.

## The Private Context

The code snippet below shows what is contained within the private context.
#include_code private-context /noir-projects/aztec-nr/aztec/src/context/private_context.nr rust

### Private Context Broken Down

#### Inputs

The context inputs includes all of the information that is passed from the kernel circuit into the application circuit. It contains the following values.

#include_code private-context-inputs /noir-projects/aztec-nr/aztec/src/context/inputs/private_context_inputs.nr rust

As shown in the snippet, the application context is made up of 4 main structures. The call context, the block header, and the private global variables.

First of all, the call context.

#include_code call-context /noir-projects/noir-protocol-circuits/crates/types/src/abis/call_context.nr rust

The call context contains information about the current call being made:

1. Msg Sender
   - The message sender is the account (Aztec Contract) that sent the message to the current context. In the first call of the kernel circuit (often the account contract call), this value will be empty. For all subsequent calls the value will be the previous call.

> The graphic below illustrates how the message sender changes throughout the kernel circuit iterations.

<img src="/img/context/sender_context_change.png" />

2. Storage contract address

   - This value is the address of the current context's contract address. This value will be the value of the current contract that is being executed except for when the current call is a delegate call (Warning: This is yet to be implemented). In this case the value will be that of the sending contract.

3. Flags
   - Furthermore there are a series of flags that are stored within the application context:
     - is_delegate_call: Denotes whether the current call is a delegate call. If true, then the storage contract address will be the address of the sender.
     - is_static_call: This will be set if and only if the current call is a static call. In a static call, state changing altering operations are not allowed.

### Header

Another structure that is contained within the context is the Header object.
In the private context this is a header of a block which used to generate proofs against.
In the public context this header is set by sequencer (sequencer executes public calls) and it is set to 1 block before the block in which the transaction is included.

#include_code header /noir-projects/noir-protocol-circuits/crates/types/src/header.nr rust

### Transaction Context

The private context provides access to the transaction context as well, which are user-defined values for the transaction in general that stay constant throughout its execution.

#include_code tx-context /noir-projects/noir-protocol-circuits/crates/types/src/transaction/tx_context.nr rust

### Args Hash

To allow for flexibility in the number of arguments supported by Aztec functions, all function inputs are reduced to a singular value which can be proven from within the application.

The `args_hash` is the result of pedersen hashing all of a function's inputs.

### Return Values

The return values are a set of values that are returned from an applications execution to be passed to other functions through the kernel. Developers do not need to worry about passing their function return values to the `context` directly as `Aztec.nr` takes care of it for you. See the documentation surrounding `Aztec.nr` [macro expansion](./inner_workings.md) for more details.

    return_values : BoundedVec\<Field, RETURN_VALUES_LENGTH\>,

## Max Block Number

Some data structures impose time constraints, e.g. they may make it so that a value can only be changed after a certain delay. Interacting with these in private involves creating proofs that are only valid as long as they are included before a certain future point in time. To achieve this, the `set_tx_max_block_number` function can be used to set this property:

#include_code max-block-number /noir-projects/aztec-nr/aztec/src/context/private_context.nr rust

A transaction that requests a maximum block number will never be included in a block with a block number larger than the requested value, since it would be considered invalid. This can also be used to make transactions automatically expire after some time if not included.

### Read Requests

<!-- TODO(maddiaa): leaving as todo until their is further clarification around their implementation in the protocol -->

### New Note Hashes

New note hashes contains an array of all of the note hashes created in the current execution context.

### New Nullifiers

New nullifiers contains an array of the new nullifiers emitted from the current execution context.

### Nullified Note Hashes

Nullified note hashes is an optimization for introduced to help reduce state growth. There are often cases where note hashes are created and nullified within the same transaction.
In these cases there is no reason that these note hashes should take up space on the node's commitment/nullifier trees. Keeping track of nullified note hashes allows us to "cancel out" and prove these cases.

### Private Call Stack

The private call stack contains all of the external private function calls that have been created within the current context. Any function call objects are hashed and then pushed to the execution stack.
The kernel circuit will orchestrate dispatching the calls and returning the values to the current context.

### Public Call Stack

The public call stack contains all of the external function calls that are created within the current context. Like the private call stack above, the calls are hashed and pushed to this stack. Unlike the private call stack, these calls are not executed client side. Whenever the function is sent to the network, it will have the public call stack attached to it. At this point the sequencer will take over and execute the transactions.

### New L2 to L1 msgs

New L2 to L1 messages contains messages that are delivered to the [l1 outbox](../../../protocol-specs/l1-smart-contracts/index.md) on the execution of each rollup.

## Public Context

The Public Context includes all of the information passed from the `Public VM` into the execution environment. Its interface is very similar to the [Private Context](#the-private-context), however it has some minor differences (detailed below).

### Public Global Variables

The public global variables are provided by the rollup sequencer and consequently contain some more values than the private global variables.

#include_code global-variables /noir-projects/noir-protocol-circuits/crates/types/src/abis/global_variables.nr rust
