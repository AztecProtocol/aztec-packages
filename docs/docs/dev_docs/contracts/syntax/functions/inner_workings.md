---
title: Inner Workings of Functions
---

Below, we go more into depth of what is happening under the hood when you create a function in Aztec.nr and what the attributes are really doing.

## Private functions

Aztec.nr uses an attribute system to annotate a function's type. Annotating a function with the `#[aztec(private)]` attribute tells the framework that this will be a private function that will be executed on a users device. Thus the compiler will create a circuit to define this function.

However; `#aztec(private)` is just syntactic sugar. At compile time, the framework inserts code that allows the function to interact with the [kernel](../../../../concepts/advanced/circuits/kernels/private_kernel.md).

To help illustrate how this interacts with the internals of Aztec and its kernel circuits, we can take an example private function, and explore what it looks like after Aztec.nr's macro expansion.

#### Before expansion

#include_code simple_macro_example /yarn-project/noir-contracts/contracts/docs_example_contract/src/main.nr rust

#### After expansion

#include_code simple_macro_example_expanded /yarn-project/noir-contracts/contracts/docs_example_contract/src/main.nr rust

#### The expansion broken down?

Viewing the expanded noir contract uncovers a lot about how noir contracts interact with the [kernel](../../../../concepts/advanced/circuits/kernels/private_kernel.md). To aid with developing intuition, we will break down each inserted line.

**Receiving context from the kernel.**
#include_code context-example-inputs /yarn-project/noir-contracts/contracts/docs_example_contract/src/main.nr rust

Private function calls are able to interact with each other through orchestration from within the [kernel circuit](../../../../concepts/advanced/circuits/kernels/private_kernel.md). The kernel circuit forwards information to each app circuit. This information then becomes part of the private context.
For example, within each circuit we can access some global variables. To access them we can call `context.chain_id()`. The value of this chain ID comes from the values passed into the circuit from the kernel.

The kernel can then check that all of the values passed to each circuit in a function call are the same.

**Returning the context to the kernel.**
#include_code context-example-return /yarn-project/noir-contracts/contracts/docs_example_contract/src/main.nr rust

Just as the kernel passes information into the app circuits, the application must return information about the executed app back to the kernel. This is done through a rigid structure we call the `PrivateCircuitPublicInputs`.

> _Why is it called the `PrivateCircuitPublicInputs`_  
> It is commonly asked why the return values of a function in a circuit are labeled as the `Public Inputs`. Common intuition from other programming paradigms suggests that the return values and public inputs should be distinct.  
> However; In the eyes of the circuit, anything that is publicly viewable (or checkable) is a public input. Hence in this case, the return values are also public inputs.

This structure contains a host of information about the executed program. It will contain any newly created nullifiers, any messages to be sent to l2 and most importantly it will contain the actual return values of the function!

**Hashing the function inputs.**
#include_code context-example-hasher /yarn-project/noir-contracts/contracts/docs_example_contract/src/main.nr rust

_What is the hasher and why is it needed?_

Inside the kernel circuits, the inputs to functions are reduced to a single value; the inputs hash. This prevents the need for multiple different kernel circuits; each supporting differing numbers of inputs. The hasher abstraction that allows us to create an array of all of the inputs that can be reduced to a single value.

**Creating the function's context.**
#include_code context-example-context /yarn-project/noir-contracts/contracts/docs_example_contract/src/main.nr rust

Each Aztec function has access to a [context](../context.mdx) object. This object although ergonomically a global variable, is local. It is initialized from the inputs provided by the kernel, and a hash of the function's inputs.

#include_code context-example-context-return /yarn-project/noir-contracts/contracts/docs_example_contract/src/main.nr rust

As previously mentioned we use the kernel to pass information between circuits. This means that the return values of functions must also be passed to the kernel (where they can be later passed on to another function).
We achieve this by pushing return values to the execution context, which we then pass to the kernel.

**Making the contract's storage available**
#include_code storage-example-context /yarn-project/noir-contracts/contracts/docs_example_contract/src/main.nr rust

When a [`Storage` struct](../storage/main.md) is declared within a contract, the `storage` keyword is made available. As shown in the macro expansion above, this calls the init function on the storage struct with the current function's context.

Any state variables declared in the `Storage` struct can now be accessed as normal struct members.

**Returning the function context to the kernel.**
#include_code context-example-finish /yarn-project/noir-contracts/contracts/docs_example_contract/src/main.nr rust

This function takes the application context, and converts it into the `PrivateCircuitPublicInputs` structure. This structure is then passed to the kernel circuit.

## Unconstrained functions

Defining a function as `unconstrained` tells Aztec to simulate it completely client-side in the [ACIR simulator](../../../../concepts/advanced/acir_simulator.md) without generating proofs. They are useful for extracting information from a user through an [oracle](./oracles.md).

When an unconstrained function is called, it prompts the ACIR simulator to 

1. generate the execution environment
2. execute the function within this environment

To generate the environment, the simulator gets the blockheader from the [PXE database](../../../../concepts/advanced/private_execution_environment.md#database) and passes it along with the contract address to `ViewDataOracle`. This creates a context that simulates the state of the blockchain at a specific block, allowing the unconstrained function to access and interact with blockchain data as it would appear in that block, but without affecting the actual blockchain state.

Once the execution environment is created, `execute_unconstrained_function` is invoked:

#include_code execute_unconstrained_function yarn-project/acir-simulator/src/client/unconstrained_execution.ts typescript

This:

1. Prepares the ACIR for execution
2. Converts `args` into a format suitable for the ACVM (Aztec's virtual machine), creating an initial witness (witness = set of inputs required to compute the function). `args` might be an oracle to request a user's balance
3. Executes the function in the ACVM, which involves running the ACIR with the initial witness and the context. If requesting a user's balance, this would query the balance from the PXE database
4. Extracts the return values from the `partialWitness` and decodes them based on the artifact to get the final function output. The [artifact](../../artifacts.md) is the compiled output of the contract, and has information like the function signature, parameter types, and return types




