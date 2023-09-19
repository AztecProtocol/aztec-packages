# Functions

## `constructor`

- A special `constructor` function MUST be declared within a contract's scope.
- A constructor doesn't have a name, because its purpose is clear: to initialise contract state.
- In Aztec terminology, a constructor is always a '`private` function' (i.e. it cannot be a `public` function, in the current version of the sandbox it cannot call public functions either).
- A constructor behaves almost identically to any other function. It's just important for Aztec to be able to identify this function as special: it may only be called once, and will not be deployed as part of the contract.

An example of a constructor is as follows:
#include_code constructor /yarn-project/noir-contracts/src/contracts/escrow_contract/src/main.nr rust

In this example (taken from an escrow contract), the constructor sets the deployer as an `owner`.

Although constructors are always needed, they are not required to do anything. A empty constructor can be created as follows:

#include_code empty-constructor /yarn-project/noir-contracts/src/contracts/public_token_contract/src/main.nr rust


## `Private` Functions

To create a private function you can annotate it with the `#[aztec(private)]` attribute. This will make the [private context](./context.mdx#private-context-broken-down) available within your current function's execution scope.

#include_code functions-SecretFunction /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/main.nr rust

## `Public` Functions

To create a public function you can annotate it with the `#[aztec(public)]` attribute. This will make the [public context](./context.mdx#public-context) available within your current function's execution scope.

#include_code functions-OpenFunction /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/main.nr rust

## `unconstrained` functions

#include_code functions-UncontrainedFunction /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/main.nr rust

# Calling functions

## Inlining

## Importing Contracts

### Contract Interface

## Constrained --> Unconstrained

E.g. `get()`

## Oracle calls

## Private --> Private

## Public --> Public

## Private --> Public

## `internal` keyword

## Public --> Private

## Recursive function calls

## L1 --> L2
The context available within functions includes the ability to send messages to l1. For more information on how cross chain communication works in Aztec, see the [documentation on communication.](../../concepts/foundation/communication/cross_chain_calls.md)

#include_code non_native_token_withdraw  /yarn-project/noir-contracts/src/contracts/non_native_token_contract/src/main.nr rust

### What happens behind the scenes?
When a user sends a message from a [portal contract](../../concepts/foundation/communication/cross_chain_calls.md#portal) to the rollup's inbox it gets processed and added to the `l1 to l2 messages tree`.

 <-- TODO(Maddiaa): INCLUDE LINK TO WHERE the messages tree is discussed elsewhere in the docs. -->

The l1 to l2 messages tree contains all messages that have been sent from l1 to the l2. The good thing about this tree is that it does not reveal when it's messages have been spent, as consuming a message from the l1 to l2 messages tree is done by nullifing a message.

When calling the `consume_l1_to_l2_message` function on a contract; a number of actions are performed by `Aztec.nr`.

1. The `msgKey` value (passed to the consume message function) is used to look up the contents of the l1 message.
2. Check that the message recipient is the contract of the current calling context.
3. Check that the message content matches the content reproduced earlier on. 
4. Validate that caller know's the preimage to the message's `secretHash`. See more information [here](../../concepts/foundation/communication/cross_chain_calls.md#messages).
5. We compute the nullifier for the message.
#include_code l1_to_l2_message_compute_nullifier  /yarn-project/aztec-nr/aztec/src/messaging/l1_to_l2_message.nr rust
6. Finally we push the nullifier to the context. Allowing it to be checked for validity by the kernel and rollup circuits. 

#include_code consume_l1_to_l2_message  /yarn-project/aztec-nr/aztec/src/context.nr rust

As the same nullifier cannot be created twice. We cannot consume the message again.

## L2 --> L1

## Delegatecall

Talk a about the dangers of delegatecall too!


## Deep dive
### Function type attributes explained.
Aztec.nr uses an attribute system to annotate a function's type. Annotating a function with the `#[aztec(private)]` attribute tells the framework that this will be a private function that will be executed on a users device. Thus the compiler will create a circuit to define this function. 

However; `#aztec(private)` is just syntactic sugar. At compile time, the framework inserts code that allows the function to interact with the [kernel](../../concepts/advanced/circuits/kernels/private_kernel.md).

To help illustrate how this interacts with the internals of Aztec and its kernel circuits, we can take an example private function, and explore what it looks like after Aztec.nr's macro expansion.

#### Before expansion
#include_code simple_macro_example /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/main.nr rust


#### After expansion
#include_code simple_macro_example_expanded /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/main.nr rust

#### The expansion broken down?
Viewing the expanded noir contract uncovers a lot about how noir contracts interact with the [kernel](../../concepts/advanced/circuits/kernels/private_kernel.md). To aid with developing intuition, we will break down each inserted line.

**Receiving context from the kernel.**
#include_code context-example-inputs /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/main.nr rust

Private function calls are able to interact with each other through orchestration from within the [kernel circuit](../../concepts/advanced/circuits/kernels/private_kernel.md). The kernel circuit forwards information to each app circuit. This information then becomes part of the private context. 
For example, within each circuit we can access some global variables. To access them we can call `context.chain_id()`. The value of this chain ID comes from the values passed into the circuit from the kernel. 

The kernel can then check that all of the values passed to each circuit in a function call are the same. 

**Returning the context to the kernel.**
#include_code context-example-return /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/main.nr rust

Just as the kernel passes information into the the app circuits, the application must return information about the executed app back to the kernel. This is done through a rigid structure we call the `PrivateCircuitPublicInputs`. 

> *Why is it called the `PrivateCircuitPublicInputs`*  
> It is commonly asked why the return values of a function in a circuit are labelled as the `Public Inputs`. Common intuition from other programming paradigms suggests that the return values and public inputs should be distinct.  
> However; In the eyes of the circuit, anything that is publicly viewable (or checkable) is a public input. Hence in this case, the return values are also public inputs.   

This structure contains a host of information about the executed program. It will contain any newly created nullifiers, any messages to be sent to l2 and most importantly it will contain the actual return values of the function!

**Hashing the function inputs.**
#include_code context-example-hasher /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/main.nr rust

*What is the hasher and why is it needed?*

Inside the kernel circuits, the inputs to functions are reduced to a single value; the inputs hash. This prevents the need for multiple different kernel circuits; each supporting differing numbers of inputs. The hasher abstraction that allows us to create an array of all of the inputs that can be reduced to a single value. 

**Creating the function's context.**
#include_code context-example-context /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/main.nr rust

Each Aztec function has access to a [context](./context.mdx) object. This object although ergonomically a global variable, is local. It is initialized from the inputs provided by the kernel, and a hash of the function's inputs.

#include_code context-example-context-return /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/main.nr rust

As previously mentioned we use the kernel to pass information between circuits. This means that the return values of functions must also be passed to the kernel (where they can be later passed on to another function). 
We achieve this by pushing return values to the execution context, which we then pass to the kernel. 

**Returning the function context to the kernel.**
#include_code context-example-finish /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/main.nr rust

This function takes the application context, and converts it into the `PrivateCircuitPublicInputs` structure. This structure is then passed to the kernel circuit.