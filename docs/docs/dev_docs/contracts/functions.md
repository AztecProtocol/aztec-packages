# Functions

## `constructor`

- A special `constructor` function MUST be declared within a contract's scope.
- A constructor doesn't have a name, because its purpose is clear: to initialise state.
- In Aztec terminology, a constructor is always a 'private function' (i.e. it cannot be an `open` function).
- A constructor behaves almost identically to any other function. It's just important for Aztec to be able to identify this function as special: it may only be called once, and will not be deployed as part of the contract.

## secret functions

> a.k.a. "private" functions
To create a private function you can annotate it with the `#[aztec(private)]` attribute. This will make the private context (INCLUDE LINK TO COVERAGE OF PRIVATE CONTEXT) available within your current function's execution scope.

#include_code functions-SecretFunction /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/main.nr rust

## `open` functions

> a.k.a. "public" functions

To create a public function you can annotate it with the `#[aztec(public)]` attribute. This will make the public context available within your current function's execution scope. (TODO: INCLUDE LINK)

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
<!-- TODO: Make a note to refer to the communication docs section -->
The context available within functions includes the ability to send messages to l1. 



<!-- TODO: Leave links to the whole flow of sending a message to l2, this section should just show 
how the message can be consumed on l2 itself
 -->

#include_code send_to_l2  /yarn-project/noir-contracts/src/contracts/non_native_token_contract/src/main.nr rust

### What happens behind the scenes?
When a user sends a message from a portal contract (INCLUDE LINK HERE) to the rollup's inbox it gets processed and added to the `l1 to l2 messages tree` (INCLUDE LINK TO WHERE THIS IS DISCUSSED). The l1 to l2 messages tree contains all messages that have been sent from l1 to the l2. The good thing about this tree is that it does not reveal when it's messages have been spent, as consuming a message from the l1 to l2 messages tree is done by nullifing a message, rather than directly marking it as consumed. 

When calling the `consume_l1_to_l2_message` function on a contract; a number of actions are performed.

<!-- TODO: buff out these bullet points -->
1. As the consume message function is passed a `msgKey` value, we can look up on l1 what the full contents of the message by making an oracle call to get the data. 
2. We check that the message recipient is the contract of the current calling context.
3. We check that the message content matches the content reproduced earlier on. 
4. We validate that we know the preimage to the message's `secretHash` field. (TODO: SEE MORE ON THIS FOLLOWING A LINK)
5. We compute the nullifier for the message. 
#include_code l1_to_l2_message_compute_nullifier  /yarn-project/noir-libs/noir-aztec/src/messaging/l1_to_l2_message.nr rust
6. Finally we push the nullifier to the context. Allowing it to be checked for validity by the kernel and rollup circuits. 

#include_code consume_l1_to_l2_message  /yarn-project/noir-libs/noir-aztec/src/context.nr rust

The emitted nullifier prevents our message from being consumed again. Users cannot re consume a message as the nullifier would already exist.

## L2 --> L1

## Delegatecall

Talk a about the dangers of delegatecall too!


## Deep dive
<!-- TODO: all of the below an be considered as rough notes, and needs to be proof read and proof read and updated! -->
### Function type attributes explained.
Aztec.nr uses an attribute system to annotate a function's type. Annotating a function with the `#[aztec(private)]` attribute tells the framework that this will be a private function that will be executed on a users device. Thus the compiler will create a circuit to define this function. 

However; `#aztec(private)` is just syntactic sugar. At compile time, the framework inserts some code that initializes the application context. 

To help illustrate how this interacts with the internals of Aztec and its kernel circuits, we can take an example private function, and explore what it looks like after Aztec.nr's macro expansion.

#### The before
#include_code simple_macro_example /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/main.nr rust


#### The expanded
#include_code simple_macro_example_expanded /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/main.nr rust

#### What does the expansion do?
Seeing an expanded noir contract reveals a lot about how noir contracts interact with the kernel. Let's run down the changes and dive into what each part does.

<!-- Comment on what each of the lines do -> make a nice way to the processor to copy sub snippets / ignore sub snippets -->
`inputs: PrivateContextInputs`  
As discussed in (INSeRT SECTION HERE) private function calls are stitched together from within the kernel circuit. The kernel circuit forwards information to each app circuit. This information then becomes the private context. 
For example, within each circuit we can access some global variables. To access them we can call `context.chain_id()`. The value of this chain ID comes from the values passed into the circuit from the kernel. 

<!-- NOTE: THIS ALL NEEDS A BIT MORE WORK, maybe dog food it with some other devs -->
The kernel can then check that all of the values passed to each circuit in a function call are the same. 

`-> distinct pub abi::PrivateCircuitPublicInputs`
Just as the kernel passes information into the the app circuits, the application must return information about the executed app back to the kernel. This is done through a rigid structure we call the `PrivateCircuitPublicInputs`. 
<!-- TODO: maybe break down the naming convention of Private Circuit Public Inputs -->

This structure contains a host of information about the executed program. It will contain any newly created nullifiers, any messages to be sent to l2 and most importantly it will contain the actual return values of the function!

`hasher`
What is the hasher and why is it needed? 

Inside the kernel circuits, the inputs to functions are reduced to a single value; the inputs hash. This prevents there needing to be multiple different kernel circuits which support differing numbers of inputs to each function. The is an abstraction that allows us to create an array of all of the inputs that we can then hash to a single point. 

<!-- TODO: include links -->

`let mut context = PrivateContext::new(inputs, hasher.hash())`
Creating the function's context. 
Within each Aztec function we have access to a context object that feels like a global object. This is in-fact NOT global but rather is initialized from the inputs provided by the kernel, and a hash of the function's inputs.

<!-- TODO: include a link here to where people can learn more about what the context is and what it contains -->

`context.return_values.push(result)`
As mentioned in the kernel circuit section *(INCLUDE LINK)* we use the kernel to pass information between circuits. This means that the return values of functions must also be passed to the kernel to pass the value on to another function call. 
This is done by pushing our return values to the execution context, which can then in turn pass the values to the kernel. 

`context.finish()`
This function takes the application context, and converts it into the `PrivateCircuitPublicInputs` structure. This structure is what is passed to the kernel circuit to enable cross communication between applications.