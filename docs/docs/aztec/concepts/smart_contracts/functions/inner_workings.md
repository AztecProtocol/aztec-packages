---
title: Inner Workings of Functions and Macros
sidebar_position: 3
tags: [functions]
---

Below, we go more into depth of what is happening under the hood when you create a function in an Aztec contract and what the attributes are really doing.

## Private functions (#[aztec(private)])

A private function operates on private information, and is executed by the user on their device. Annotate the function with the `#[aztec(private)]` attribute to tell the compiler it's a private function. This will make the [private context](./context.md#the-private-context) available within the function's execution scope. The compiler will create a circuit to define this function.

`#aztec(private)` is just syntactic sugar. At compile time, the Aztec.nr framework inserts code that allows the function to interact with the [kernel](../../circuits/kernels/private_kernel.md).

To help illustrate how this interacts with the internals of Aztec and its kernel circuits, we can take an example private function, and explore what it looks like after Aztec.nr's macro expansion.

#### Before expansion

#include_code simple_macro_example /noir-projects/noir-contracts/contracts/docs_example_contract/src/main.nr rust

#### After expansion

#include_code simple_macro_example_expanded /noir-projects/noir-contracts/contracts/docs_example_contract/src/main.nr rust

#### The expansion broken down?

Viewing the expanded Aztec contract uncovers a lot about how Aztec contracts interact with the [kernel](../../circuits/kernels/private_kernel.md). To aid with developing intuition, we will break down each inserted line.

**Receiving context from the kernel.**
#include_code context-example-inputs /noir-projects/noir-contracts/contracts/docs_example_contract/src/main.nr rust

Private function calls are able to interact with each other through orchestration from within the [kernel circuit](../../circuits/kernels/private_kernel.md). The kernel circuit forwards information to each contract function (recall each contract function is a circuit). This information then becomes part of the private context.
For example, within each private function we can access some global variables. To access them we can call on the `context`, e.g. `context.chain_id()`. The value of the chain ID comes from the values passed into the circuit from the kernel.

The kernel checks that all of the values passed to each circuit in a function call are the same.

**Returning the context to the kernel.**
#include_code context-example-return /noir-projects/noir-contracts/contracts/docs_example_contract/src/main.nr rust

The contract function must return information about the execution back to the kernel. This is done through a rigid structure we call the `PrivateCircuitPublicInputs`.

> _Why is it called the `PrivateCircuitPublicInputs`?_
> When verifying zk programs, return values are not computed at verification runtime, rather expected return values are provided as inputs and checked for correctness. Hence, the return values are considered public inputs.

This structure contains a host of information about the executed program. It will contain any newly created nullifiers, any messages to be sent to l2 and most importantly it will contain the return values of the function.

**Hashing the function inputs.**
#include_code context-example-hasher /noir-projects/noir-contracts/contracts/docs_example_contract/src/main.nr rust

_What is the hasher and why is it needed?_

Inside the kernel circuits, the inputs to functions are reduced to a single value; the inputs hash. This prevents the need for multiple different kernel circuits; each supporting differing numbers of inputs. The hasher abstraction that allows us to create an array of all of the inputs that can be reduced to a single value.

**Creating the function's context.**
#include_code context-example-context /noir-projects/noir-contracts/contracts/docs_example_contract/src/main.nr rust

Each Aztec function has access to a [context](context) object. This object, although labelled a global variable, is created locally on a users' device. It is initialized from the inputs provided by the kernel, and a hash of the function's inputs.

#include_code context-example-context-return /noir-projects/noir-contracts/contracts/docs_example_contract/src/main.nr rust

We use the kernel to pass information between circuits. This means that the return values of functions must also be passed to the kernel (where they can be later passed on to another function).
We achieve this by pushing return values to the execution context, which we then pass to the kernel.

**Making the contract's storage available**
#include_code storage-example-context /noir-projects/noir-contracts/contracts/docs_example_contract/src/main.nr rust

When a [`Storage` struct](../../../../guides/smart_contracts/writing_contracts/storage) is declared within a contract, the `storage` keyword is made available. As shown in the macro expansion above, this calls the init function on the storage struct with the current function's context.

Any state variables declared in the `Storage` struct can now be accessed as normal struct members.

**Returning the function context to the kernel.**
#include_code context-example-finish /noir-projects/noir-contracts/contracts/docs_example_contract/src/main.nr rust

This function takes the application context, and converts it into the `PrivateCircuitPublicInputs` structure. This structure is then passed to the kernel circuit.

## Unconstrained functions (#[aztec(unconstrained)])

Unconstrained functions are an underlying part of Noir. In short, they are functions which are not directly constrained and therefore should be seen as un-trusted. That they are un-trusted means that the developer must make sure to constrain their return values when used. Note: Calling an unconstrained function from a private function means that you are injecting unconstrained values.

Defining a function as `unconstrained` tells Aztec to simulate it completely client-side in the [ACIR simulator](../../pxe/acir_simulator.md) without generating proofs. They are useful for extracting information from a user through an [oracle](../oracles).

When an unconstrained function is called, it prompts the ACIR simulator to

1. generate the execution environment
2. execute the function within this environment

To generate the environment, the simulator gets the blockheader from the [PXE database](../../pxe/index.md#database) and passes it along with the contract address to `ViewDataOracle`. This creates a context that simulates the state of the blockchain at a specific block, allowing the unconstrained function to access and interact with blockchain data as it would appear in that block, but without affecting the actual blockchain state.

Once the execution environment is created, `execute_unconstrained_function` is invoked:

#include_code execute_unconstrained_function yarn-project/simulator/src/client/unconstrained_execution.ts typescript

This:

1. Prepares the ACIR for execution
2. Converts `args` into a format suitable for the ACVM (Abstract Circuit Virtual Machine), creating an initial witness (witness = set of inputs required to compute the function). `args` might be an oracle to request a user's balance
3. Executes the function in the ACVM, which involves running the ACIR with the initial witness and the context. If requesting a user's balance, this would query the balance from the PXE database
4. Extracts the return values from the `partialWitness` and decodes them based on the artifact to get the final function output. The [artifact](../../../../reference/smart_contract_reference/contract_artifact.md) is the compiled output of the contract, and has information like the function signature, parameter types, and return types

Beyond using them inside your other functions, they are convenient for providing an interface that reads storage, applies logic and returns values to a UI or test. Below is a snippet from exposing the `balance_of_private` function from a token implementation, which allows a user to easily read their balance, similar to the `balanceOf` function in the ERC20 standard.

#include_code balance_of_private /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

:::info
Note, that unconstrained functions can have access to both public and private data when executed on the user's device. This is possible since it is not actually part of the circuits that are executed in contract execution.
:::

## `Public` Functions (#[aztec(public)])

A public function is executed by the sequencer and has access to a state model that is very similar to that of the EVM and Ethereum. Even though they work in an EVM-like model for public transactions, they are able to write data into private storage that can be consumed later by a private function.

:::note
All data inserted into private storage from a public function will be publicly viewable (not private).
:::

To create a public function you can annotate it with the `#[aztec(public)]` attribute. This will make the [public context](./context.md) available within the function's execution scope.

#include_code set_minter /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

## Further reading
- [How do macros work](./function_types_macros.md)
- [Macros reference](../../../../reference/smart_contract_reference/macros.md)