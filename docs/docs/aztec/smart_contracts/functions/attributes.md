---
title: Function Attributes and Macros
sidebar_position: 4
tags: [functions]
---

On this page you will learn about function attributes and macros.

If you are looking for a reference of function macros, go [here](../../../developers/reference/smart_contract_reference/macros.md).

## Private functions #[private]

A private function operates on private information, and is executed by the user on their device. Annotate the function with the `#[private]` attribute to tell the compiler it's a private function. This will make the [private context](./context.md#the-private-context) available within the function's execution scope. The compiler will create a circuit to define this function.

`#[private]` is just syntactic sugar. At compile time, the Aztec.nr framework inserts code that allows the function to interact with the [kernel](../../../aztec/concepts/advanced/circuits/kernels/private_kernel.md).

To help illustrate how this interacts with the internals of Aztec and its kernel circuits, we can take an example private function, and explore what it looks like after Aztec.nr's macro expansion.

#### Before expansion

#include_code simple_macro_example /noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr rust

#### After expansion

#include_code simple_macro_example_expanded /noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr rust

#### The expansion broken down

Viewing the expanded Aztec contract uncovers a lot about how Aztec contracts interact with the kernel. To aid with developing intuition, we will break down each inserted line.

**Receiving context from the kernel.**
#include_code context-example-inputs /noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr rust

Private function calls are able to interact with each other through orchestration from within the kernel circuits. The kernel circuit forwards information to each contract function (recall each contract function is a circuit). This information then becomes part of the private context.
For example, within each private function we can access some global variables. To access them we can call on the `context`, e.g. `context.chain_id()`. The value of the chain ID comes from the values passed into the circuit from the kernel.

The kernel checks that all of the values passed to each circuit in a function call are the same.

**Returning the context to the kernel.**
#include_code context-example-return /noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr rust

The contract function must return information about the execution back to the kernel. This is done through a rigid structure we call the `PrivateCircuitPublicInputs`.

> _Why is it called the `PrivateCircuitPublicInputs`?_
> When verifying zk programs, return values are not computed at verification runtime, rather expected return values are provided as inputs and checked for correctness. Hence, the return values are considered public inputs.

This structure contains a host of information about the executed program. It will contain any newly created nullifiers, any messages to be sent to l2 and most importantly it will contain the return values of the function.

**Hashing the function inputs.**
#include_code context-example-hasher /noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr rust

_What is the hasher and why is it needed?_

Inside the kernel circuits, the inputs to functions are reduced to a single value; the inputs hash. This prevents the need for multiple different kernel circuits; each supporting differing numbers of inputs. The hasher abstraction that allows us to create an array of all of the inputs that can be reduced to a single value.

**Creating the function's context.**
#include_code context-example-context /noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr rust

Each Aztec function has access to a [context](context) object. This object, although labelled a global variable, is created locally on a users' device. It is initialized from the inputs provided by the kernel, and a hash of the function's inputs.

#include_code context-example-context-return /noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr rust

We use the kernel to pass information between circuits. This means that the return values of functions must also be passed to the kernel (where they can be later passed on to another function).
We achieve this by pushing return values to the execution context, which we then pass to the kernel.

**Making the contract's storage available**
#include_code storage-example-context /noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr rust

When a `Storage` struct is declared within a contract, the `storage` keyword is made available. As shown in the macro expansion above, this calls the init function on the storage struct with the current function's context.

Any state variables declared in the `Storage` struct can now be accessed as normal struct members.

**Returning the function context to the kernel.**
#include_code context-example-finish /noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr rust

This function takes the application context, and converts it into the `PrivateCircuitPublicInputs` structure. This structure is then passed to the kernel circuit.

## Utility functions #[utility]

Contract functions marked with `#[utility]` are used to perform state queries from an off-chain client (from both private and public state!) or to modify local contract-related PXE state (e.g. when processing logs in Aztec.nr), and are never included in any transaction. No guarantees are made on the correctness of the result since the entire execution is unconstrained and heavily reliant on [oracle calls](https://noir-lang.org/docs/explainers/explainer-oracle).

Any programming language could be used to construct these queries, since all they do is perform arbitrary computation on data that is either publicly available from any node, or locally available from the PXE. Utility functions exist as Noir contract code because they let developers utilize the rest of the contract code directly by being part of the same Noir crate, and e.g. use the same libraries, structs, etc. instead of having to rely on manual computation of storage slots, struct layout and padding, and so on.

A reasonable mental model for them is that of a Solidity `view` function that can never be called in any transaction, and is only ever invoked via `eth_call`. Note that in these the caller assumes that the node is acting honestly by executing the true contract bytecode with correct blockchain state, the same way the Aztec version assumes the oracles are returning legitimate data. Unlike `view` functions however, `utility` functions can modify local off-chain PXE state via oracle calls - this can be leveraged for example to process messages delivered off-chain and then notify PXE of newly discovered notes.

When a utility function is called, it prompts the ACIR simulator to

1. generate the execution environment
2. execute the function within this environment

To generate the environment, the simulator gets the block header from the [PXE database](../../concepts/pxe/index.md#database) and passes it along with the contract address to `UtilityExecutionOracle`. This creates a context that simulates the state of the blockchain at a specific block, allowing the utility function to access and interact with blockchain data as it would appear in that block, but without affecting the actual blockchain state.

Once the execution environment is created, `runUtility` function is invoked on the simulator:

#include_code execute_utility_function yarn-project/pxe/src/contract_function_simulator/contract_function_simulator.ts typescript

This:

1. Prepares the ACIR for execution
2. Converts `args` into a format suitable for the ACVM (Abstract Circuit Virtual Machine), creating an initial witness (witness = set of inputs required to compute the function). `args` might be an oracle to request a user's balance
3. Executes the function in the ACVM, which involves running the ACIR with the initial witness and the context. If requesting a user's balance, this would query the balance from the PXE database
4. Extracts the return values from the `partialWitness` and decodes them based on the artifact to get the final function output. The artifact is the compiled output of the contract, and has information like the function signature, parameter types, and return types

Beyond using them inside your other functions, they are convenient for providing an interface that reads storage, applies logic and returns values to a UI or test. Below is a snippet from exposing the `balance_of_private` function from a token implementation, which allows a user to easily read their balance, similar to the `balanceOf` function in the ERC20 standard.

#include_code balance_of_private /noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr rust

:::info
Note, that utility functions can have access to both private and (historical) public data when executed on the user's device. This is possible since these functions are not invoked as part of transactions, so we don't need to worry about preventing a contract from e.g. accidentally using stale or unverified public state.
:::

## Public functions #[public]

A public function is executed by the sequencer and has access to a state model that is very similar to that of the EVM and Ethereum. Even though they work in an EVM-like model for public transactions, they are able to write data into private storage that can be consumed later by a private function.

:::note
All data inserted into private storage from a public function will be publicly viewable (not private).
:::

To create a public function you can annotate it with the `#[public]` attribute. This will make the public context available within the function's execution scope.

#include_code set_minter /noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr rust

Under the hood:

- Context Creation: The macro inserts code at the beginning of the function to create a`PublicContext` object:

```rust
let mut context = PublicContext::new(args_hasher);
```

This context provides access to public state and transaction information

- Storage Access: If the contract has a storage struct defined, the macro inserts code to initialize the storage:

```rust
let storage = Storage::init(&mut context);
```

- Function Body Wrapping: The original function body is wrapped in a new scope that handles the context and return value
- Visibility Control: The function is marked as pub, making it accessible from outside the contract.
- Unconstrained Execution: Public functions are marked as unconstrained, meaning they don't generate proofs and are executed directly by the sequencer.

## Constrained `view` Functions #[view]

The `#[view]` attribute can be applied to a `#[private]` or a `#[public]` function and it guarantees that the function cannot modify any contract state (just like `view` functions in Solidity).

## `Initializer` Functions #[initializer]

This is used to designate functions as initializers (or constructors) for an Aztec contract. These functions are responsible for setting up the initial state of the contract when it is first deployed. The macro does two important things:

- `assert_initialization_matches_address_preimage(context)`: This checks that the arguments and sender to the initializer match the commitments from the address preimage
- `mark_as_initialized(&mut context)`: This is called at the end of the function to emit the initialization nullifier, marking the contract as fully initialized and ensuring this function cannot be called again

Key things to keep in mind:

- A contract can have multiple initializer functions defined, but only one initializer function should be called for the lifetime of a contract instance
- Other functions in the contract will have an initialization check inserted, ie they cannot be called until the contract is initialized, unless they are marked with [`#[noinitcheck]`](#noinitcheck)

## #[noinitcheck]

In normal circumstances, all functions in an Aztec contract (except initializers) have an initialization check inserted at the beginning of the function body. This check ensures that the contract has been initialized before any other function can be called. However, there may be scenarios where you want a function to be callable regardless of the contract's initialization state. This is when you would use `#[noinitcheck]`.

When a function is annotated with `#[noinitcheck]`:

- The Aztec macro processor skips the [insertion of the initialization check](#initializer-functions-initializer) for this specific function
- The function can be called at any time, even if the contract hasn't been initialized yet

## `Internal` functions #[internal]

This macro inserts a check at the beginning of the function to ensure that the caller is the contract itself. This is done by adding the following assertion:

```rust
assert(context.msg_sender() == context.this_address(), "Function can only be called internally");
```

## Implementing notes

The `#[note]` attribute is used to define notes in Aztec contracts. Learn more about notes [here](../../concepts/storage/index.md).

When a struct is annotated with `#[note]`, the Aztec macro applies a series of transformations and generates implementations to turn it into a note that can be used in contracts to store private data.

1. **Note Interface Implementation**: The macro automatically implements the `NoteType`, `NoteHash` and `Packable<N>` traits for the annotated struct. This includes the following methods:

   - `get_id`
   - `compute_note_hash`
   - `compute_nullifier`
   - `pack`
   - `unpack`

2. **Property Metadata**: A separate struct is generated to describe the note's fields, which is used for efficient retrieval of note data

3. **Export Information**: The note type and its ID are automatically exported

### Before expansion

Here is how you could define a custom note:

```rust
#[note]
struct CustomNote {
    data: Field,
    owner: Address,
}
```

### After expansion

```rust
impl NoteType for CustomNote {
    fn get_id() -> Field {
        // Assigned by macros by incrementing a counter
        2
    }
}

impl NoteHash for CustomNote {
    fn compute_note_hash(self, storage_slot: Field) -> Field {
        let inputs = array_concat(self.pack(), [storage_slot]);
        poseidon2_hash_with_separator(inputs, GENERATOR_INDEX__NOTE_HASH)
    }

    fn compute_nullifier(self, context: &mut PrivateContext, note_hash_for_nullify: Field) -> Field {
        let owner_npk_m_hash = get_public_keys(self.owner).npk_m.hash();
        let secret = context.request_nsk_app(owner_npk_m_hash);
        poseidon2_hash_with_separator(
            [
            note_hash_for_nullify,
            secret
        ],
            GENERATOR_INDEX__NOTE_NULLIFIER as Field
        )
    }

    unconstrained fn compute_nullifier_unconstrained(self, storage_slot: Field, contract_address: AztecAddress, note_nonce: Field) -> Field {
        // We set the note_hash_counter to 0 as the note is not transient and the concept of transient note does
        // not make sense in an unconstrained context.
        let retrieved_note = RetrievedNote { note: self, contract_address, nonce: note_nonce, note_hash_counter: 0 };
        let note_hash_for_nullify = compute_note_hash_for_nullify(retrieved_note, storage_slot);
        let owner_npk_m_hash = get_public_keys(self.owner).npk_m.hash();
        let secret = get_nsk_app(owner_npk_m_hash);
        poseidon2_hash_with_separator(
            [
            note_hash_for_nullify,
            secret
        ],
            GENERATOR_INDEX__NOTE_NULLIFIER as Field
        )
    }
}

impl CustomNote {
    pub fn new(x: [u8; 32], y: [u8; 32], owner: AztecAddress) -> Self {
        CustomNote { x, y, owner }
    }
}

impl Packable<2> for CustomNote {
    fn pack(self) -> [Field; 2] {
        [self.data, self.owner.to_field()]
    }

    fn unpack(packed_content: [Field; 2]) -> CustomNote {
        CustomNote { data: packed_content[0], owner: AztecAddress { inner: packed_content[1] } }
    }
}

struct CustomNoteProperties {
    data: aztec::note::note_getter_options::PropertySelector,
    owner: aztec::note::note_getter_options::PropertySelector,
}
```

Key things to keep in mind:

- Developers can override any of the auto-generated methods by specifying a note interface
- The note's fields are automatically serialized and deserialized in the order they are defined in the struct

## Storage struct #[storage]

The `#[storage]` attribute is used to define the storage structure for an Aztec contract.

When a struct is annotated with `#[storage]`, the macro does this under the hood:

1. **Context Injection**: injects a `Context` generic parameter into the storage struct and all its fields. This allows the storage to interact with the Aztec context, eg when using `context.msg_sender()`

2. **Storage Implementation Generation**: generates an `impl` block for the storage struct with an `init` function. The developer can override this by implementing a `impl` block themselves

3. **Storage Slot Assignment**: automatically assigns storage slots to each field in the struct based on their serialized length

4. **Storage Layout Generation**: a `StorageLayout` struct and a global variable are generated to export the storage layout information for use in the contract artifact

### Before expansion

```rust
#[storage]
struct Storage {
    balance: PublicMutable<Field>,
    owner: PublicMutable<Address>,
    token_map: Map<Address, Field>,
}
```

### After expansion

```rust
struct Storage<Context> {
    balance: PublicMutable<Field, Context>,
    owner: PublicMutable<Address, Context>,
    token_map: Map<Address, Field, Context>,
}

impl<Context> Storage<Context> {
    fn init(context: Context) -> Self {
        Storage {
            balance: PublicMutable::new(context, 1),
            owner: PublicMutable::new(context, 2),
            token_map: Map::new(context, 3, |context, slot| Field::new(context, slot)),
        }
    }
}

struct StorageLayout {
    balance: dep::aztec::prelude::Storable,
    owner: dep::aztec::prelude::Storable,
    token_map: dep::aztec::prelude::Storable,
}

#[abi(storage)]
global CONTRACT_NAME_STORAGE_LAYOUT = StorageLayout {
    balance: dep::aztec::prelude::Storable { slot: 1 },
    owner: dep::aztec::prelude::Storable { slot: 2 },
    token_map: dep::aztec::prelude::Storable { slot: 3 },
};
```

Key things to keep in mind:

- Only one storage struct can be defined per contract
- `Map` types and private `Note` types always occupy a single storage slot

## Further reading

- [Macros reference](../../../developers/reference/smart_contract_reference/macros.md)
- [How do macros work](./attributes.md)
