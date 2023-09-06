# Functions

## `constructor`

- A special `constructor` function MUST be declared within a contract's scope.
- A constructor doesn't have a name, because its purpose is clear: to initialise state.
- In Aztec terminology, a constructor is always a 'private function' (i.e. it cannot be an `open` function).
- A constructor behaves almost identically to any other function. It's just important for Aztec to be able to identify this function as special: it may only be called once, and will not be deployed as part of the contract.

## secret functions

> a.k.a. "private" functions

#include_code functions-SecretFunction /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/main.nr rust

## `open` functions

> a.k.a. "public" functions

#include_code functions-OpenFunction /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/main.nr rust

## `unconstrained` functions

#include_code functions-UncontrainedFunction /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/main.nr rust

# Calling functions

## Inlining

## Importing Contracts

### Contract Interface
 
## Mixing Constrained and Unconstrained Execution
<!-- Why is constraining a function important
    - what does it look like to not constrain a function
    - what does laying down a constraint actually mean inside a circuit
    - how is best to protect against this. 
    - Give links to talks that detail how to deal with unconstrained functions
 -->


E.g. `get()`

## Oracle calls
### What are oracles?
Oracles are a concept in Noir that enable developers to embed external information into their circuits at proving time. An direct comparison can be seen with Ethereum oracles that are used to get external information into a smart contract (often a price feed). Despite the same naming, oracles are not to be confused with oracles in Noir.

**What is an example of an oracle in Noir**
The `Aztec.nr` framework makes heavy use of Noir's oracles for getting information about note into a circuit, for example, when reading storage at a particular storage slot, an oracle can be used to insert the value into the circuit.  
Oracles introduce `non determinism` into a circuit, and thus are `unconstrained`. It is important that any information that is injected into a circuit through an oracle is later constrained for correctness. Otherwise the circuit will be `under constrained`.

`Aztec.nr` has a module dedicated to its oracles. If you are interested, you can view them by following the link below:
#include_code oracles-module /yarn-project/noir-libs/noir-aztec/src/oracle.nr rust

## Private --> Private Function Calls
In Aztec Private to Private function calls are handled by the [private kernel circuit](../../concepts/advanced/circuits/kernels/private_kernel.md), and take place on the user's device.
Behind the scenes, the `Aztec RPC Server` (the beating heart of Aztec that runs in your wallet) will execute all of the functions in the desired order "simulating" them in sequence. For example, a very common use-case of Private to Private interaction is calling another private function from an `account contract` (Account contracts are a general concept, more information about them can be found [here](../../dev_docs/wallets/writing_an_account_contract.md)).

Take, for example, the following call stack:
```
AccountContract::entrypoint
    |-> A::example_call
        | -> B::nested_call
    |-> C::example_call
```

<!-- TODO(md): better names for these examples-->
In the example above the Account Contract has been instructed to call two external functions. In the first function all, to `ContractA::example_call` a further nested call is performed to `ContractB::nested_call`. Finally the account contract makes one last call to `ContractC::example_call`.

Lets further illustrate what these examples could look like
<!-- TODO: should these move into the docs examples -->
```rust
// Contract A contains a singular function that returns the result of B::nested_call
contract A {
    #[aztec(private)]
    fn example_call(input: Field) -> pub Field {
        B::at(<contract_b_address>).nested_call(input)
    }
}

// Contract B contains a singular function that returns a `input + 1`
contract B {
    #[aztec(private)]
    fn nested_call(input: Field) -> pub Field {
        input + 1
    }
}

// Contract C contains a singular function that simply returns `10`
contract C {
    #[aztec(private)]
    fn example_call() -> pub Field {
        10
    }
}
```

When simulating the following call stack, we can execution flow to continue procedurally. The simulator will begin at the account contract's entry point, find a call to `A::example_call`, then begin to execute the code there. When the simulator executes the code in contract `A`, it will find the further nested call to contract `B::nested_call`. It will execute the code in B, bringing the return value back to contract `A`.
The same process will be followed for contract `C`.

So far the provided example is identical to other executions. Ethereum execution occurs in a similar way, during execution the EVM will execute instructions until it reaches an external call, where it will hop into a new context and execute code there, returning back when it is complete, bringing with it return values from the foreign execution. 

Those of you who have written circuits before may see an issue here. The account contract, contract `A`, `B` and `C` are all distinct circuits, which do not know anything about each other. How is it possible to use a value from contract `B` in contract `A`? This value will not be constrained.

This is where the `kernel` circuit comes in. Once the execution of all of our functions has completed, we can just prove the execution of each of them independently. It is the job of the `kernel` circuit to constrain that the input parameters in a cross function call are correct, as well as the return values. The kernel will constrain that the value returned from `A::example_call` is the same value that is returned from `B::nested_call`, it will also be able to constrain the value returned by `B::nested_call`  is the inputs to `A::example_call` + 1.

The orchestration of these calls has an added benefit. All of the nested calls are **recursively proven**. This means that the kernel circuit essentially gobbles up each of our function's execution proofs. Condensing the size of the final proof to just be one.

<!-- TODO(md): include a diagram displaying how the mental model of a kernel interaction works -->


## Public --> Public Function Calls
The public execution environment in Aztec takes place on the sequencer through a [Public VM](../../concepts/advanced/public_vm.md). This execution model is conceptually much simpler than the private transaction model as code is executed and proven on the sequencer.

Using the same example code and call stack from the section [above](#private----private-function-calls), we will walk through how it gets executed in public.

The first key difference is that public functions are not compiled to circuits, rather they are compiled to `Aztec Bytecode`.
<!-- Note that I am refering to brillig as Aztec bytecode here. ( in protest ;) -->  
This bytecode is run by the sequencer in the `Aztec VM`, which is in turn proven by the [`Aztec VM circuit`](../../concepts/advanced/public_vm.md). 
The mental model for public execution carries many of the same idea as are carried by Ethereum. Programs are compiled into a series of opcodes (known as bytecode). This bytecode is then executed. The extra step for the Aztec VM is that each opcode is then proven for correctness.

**How does a public function call another public function?**
<!-- TODO: include code snippet -->


## Private --> Public Function Calls
As discussed above, private function execution and calls take place on the user's device, while public function execution and calls take place on a sequencer, in two different places at two different times, it is natural to question how we can achieve composability between the two.  

The solution is asynchonsity. Further reading can be found [here](../../concepts/foundation/communication/public_private_calls.md)

Private function execution takes place on the users device, where it keeps track of any public function calls that have been made. Whenever private execution completes, and a kernel proof is produced, the transaction sent to the network will include all of the public calls that were dispatched. 
When the sequencer receives the messages, it will take over and execute the public parts of the transaction.

As a consequence a private function *CANNOT* accept a return value from a public function. It can only dispatch it.

<!-- TODO: drawing illustrating how the proof is handed off -->

## `internal` keyword
The internal function is a way to mark functions (that you don't want to be inlined) to only be callable from within the same contract.

You can mark a function as internal by adding the following to a function definition.

#include_code internal_function_call  /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/main.nr rust

## Public --> Private
<!-- Explain how public to private calling is not possible; 
    - however it IS possible to add commitments to the private data tree from a private function.
    - this in turn makes it possible to consume a message in a private function that was created in a public function
 -->

## Recursive function calls

## L1 --> L2

## L2 --> L1

## Delegatecall

Talk a about the dangers of delegatecall too!
