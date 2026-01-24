---
title: Attributes and Macros
sidebar_position: 6
tags: [functions]
description: Reference for Aztec contract attributes that control function visibility, execution context, storage, and notes.
references: ["noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr"]
---

This page documents the attributes (macros) available in Aztec.nr for defining contract functions, storage, and notes.

## Quick reference

| Attribute | Applies to | Purpose |
|-----------|-----------|---------|
| `#[external("private")]` | functions | Client-side private execution with proofs |
| `#[external("public")]` | functions | Sequencer-side public execution |
| `#[external("utility")]` | functions | Unconstrained queries, not included in transactions |
| `#[internal("private")]` | functions | Private helper functions, inlined at call sites |
| `#[internal("public")]` | functions | Public helper functions, inlined at call sites |
| `#[view]` | functions | Prevents state modification |
| `#[initializer]` | functions | Contract constructor |
| `#[noinitcheck]` | functions | Callable before contract initialization |
| `#[nophasecheck]` | functions | Skips transaction phase validation |
| `#[only_self]` | functions | Only callable by the same contract |
| `#[authorize_once]` | functions | Requires authwit authorization with replay protection |
| `#[note]` | structs | Defines a private note type |
| `#[custom_note]` | structs | Defines a note with custom hash/nullifier logic |
| `#[storage]` | structs | Defines contract storage layout |
| `#[storage_no_init]` | structs | Storage with manual slot allocation |

For macro internals, see the [macros reference](../macros.md).

# External functions #[external("...")]

Like in Solidity, external functions can be called from outside the contract.
There are 3 types of external functions differing in the execution environment they are executed in: private, public, and utility.
We will describe each type in the following sections.

## Private functions #[external("private")]

A private function operates on private information, and is executed by the user on their device. Annotate the function with the `#[external("private")]` attribute to tell the compiler it's a private function. This will make the [private context](./context.md#the-private-context) available within the function's execution scope. The compiler will create a circuit to define this function.

`#[external("private")]` is just syntactic sugar. At compile time, the Aztec.nr framework inserts code that allows the function to interact with the [kernel](../../../foundational-topics/advanced/circuits/private_kernel.md).

If you are interested in what exactly the macros are doing we encourage you to run `nargo expand` on your contract.
This will display your contract's code after the transformations are performed.

(If you are using VSCode you can display the expanded code by pressing `CMD + Shift + P` and typing `nargo expand` and selecting `Noir: nargo expand on current package`.)

Under the hood, the macro:

- Creates a `PrivateContext` from kernel-provided inputs (chain ID, block data, etc.)
- Initializes the `self` object with context and storage
- Hashes function inputs for the kernel (enabling variable argument counts)
- Returns execution results via `PrivateCircuitPublicInputs` (nullifiers, messages, return values)

## Utility functions #[external("utility")]

Utility functions perform state queries from an offchain client and are never included in transactions. They can access both private and public state, and can modify local PXE state (e.g., processing logs). Since execution is unconstrained and relies on [oracle calls](https://noir-lang.org/docs/explainers/explainer-oracle), no guarantees are made on result correctness.

A reasonable mental model is a Solidity `view` function that can only be invoked via `eth_call`, never in a transaction. Unlike Solidity `view` functions, utility functions can also modify local offchain PXE state.

```rust title="balance_of_private" showLineNumbers 
#[external("utility")]
unconstrained fn balance_of_private(owner: AztecAddress) -> u128 {
    self.storage.balances.at(owner).balance_of()
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260124/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L516-L521" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L516-L521</a></sub></sup>


:::info
Utility functions can access both private and historical public data since they're not part of transactions—there's no risk of using stale or unverified state.
:::

## Public functions #[external("public")]

A public function is executed by the sequencer and has access to a state model that is very similar to that of the EVM and Ethereum. Even though they work in an EVM-like model for public transactions, they are able to write data into private storage that can be consumed later by a private function.

:::note
All data inserted into private storage from a public function will be publicly viewable (not private).
:::

To create a public function you can annotate it with the `#[external("public")]` attribute. This will make the public context available within the function's execution scope.

```rust title="set_minter" showLineNumbers 
#[external("public")]
fn set_minter(minter: AztecAddress, approve: bool) {
    assert(self.storage.admin.read().eq(self.msg_sender()), "caller is not admin");
    self.storage.minters.at(minter).write(approve);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260124/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L147-L153" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L147-L153</a></sub></sup>


Under the hood, the macro:

- Creates a `PublicContext` object that provides access to public state and transaction information
- Initializes the storage struct if one is defined
- Wraps the function body in a scope that handles context setup and return values
- Marks the function as `pub` and `unconstrained`, meaning it doesn't generate proofs and is executed directly by the sequencer

To see the exact generated code, run `nargo expand` on your contract.

## Constrained `view` Functions #[view]

The `#[view]` attribute can be applied to a `#[external("private")]` or a `#[external("public")]` function and it guarantees that the function cannot modify any contract state (just like `view` functions in Solidity).

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

## #[only_self]

External functions marked with #[only_self] attribute can only be called by the contract itself - if other contracts try to make the call it will fail.

This attribute is commonly used when an action starts in private but needs to be completed in public. The public
function must be marked with #[only_self] to restrict access to only the contract itself. A typical example is a private
token mint operation that needs to enqueue a call to a public function to update the publicly tracked total token
supply.

It is also useful in private functions when dealing with tasks of an unknown size but with a large upper bound (e.g. when needing to process an unknown amount of notes or nullifiers) as they allow splitting the work in multiple circuits, possibly resulting in performance improvements for low-load scenarios.

This macro inserts a check at the beginning of the function to ensure that the caller is the contract itself. This is done by adding the following assertion:

```rust
assert(self.msg_sender().unwrap() == self.address, "Function can only be called internally");
```

## #[nophasecheck]

Private functions normally include a check to validate the current transaction phase. The `#[nophasecheck]` attribute skips this validation, allowing the function to handle phase transitions internally.

This is primarily used in account contract entrypoints that need to handle fee payment methods spanning multiple phases:

```rust
#[external("private")]
#[nophasecheck]
fn entrypoint(app_payload: AppPayload, fee_payment_method: u8, cancellable: bool) {
    // Handle different fee payment methods that may span phases
}
```

## #[authorize_once]

The `#[authorize_once]` attribute enables authorization checks via the [authwit mechanism](../../../foundational-topics/advanced/authwit.md) with replay protection. Use this when a function performs actions on behalf of someone who is not the caller.

```rust
#[authorize_once("from", "authwit_nonce")]
#[external("public")]
fn transfer_in_public(from: AztecAddress, to: AztecAddress, amount: u128, authwit_nonce: Field) {
    // Transfer tokens from 'from' to 'to'
}
```

The macro:
- Verifies the caller is authorized to act on behalf of the `from` address
- Emits the authorization request as an offchain effect for wallet verification
- Consumes a nullifier with the provided nonce, preventing replay attacks

## Internal functions #[internal("...")]

Internal functions are callable only from within the same contract and are inlined at call sites (like Solidity's internal functions). Unlike `#[only_self]`, they don't create a separate call—the code is directly inserted where called.

```rust
#[internal("private")]
fn _prepare_private_balance_increase(to: AztecAddress) -> PartialNote {
    // Helper logic for private balance operations
}

#[internal("public")]
fn _finalize_transfer(from: AztecAddress, amount: u128) {
    // Helper logic for public finalization
}
```

Call internal functions via `self.internal`:

```rust
let partial = self.internal._prepare_private_balance_increase(recipient);
```

Key differences from `#[only_self]`:
- **Inlined**: Code is inserted at call site, not a separate circuit/call
- **Private internal**: Can only be called from private external or internal functions
- **Public internal**: Can only be called from public external or internal functions

## Implementing notes

The `#[note]` attribute is used to define notes in Aztec contracts.

When a struct is annotated with `#[note]`, the Aztec macro applies a series of transformations and generates implementations to turn it into a note that can be used in contracts to store private data.

1. **NoteType trait**: Provides a unique identifier for the note type via `get_id()`

2. **NoteHash trait**: Implements note hash and nullifier computation:
   - `compute_note_hash(self, owner, storage_slot, randomness)` - computes the note's hash
   - `compute_nullifier(self, context, owner, note_hash_for_nullification)` - computes the nullifier using the owner's nullifying key
   - `compute_nullifier_unconstrained(self, owner, note_hash_for_nullification)` - unconstrained version for use outside circuits

3. **NoteProperties struct**: A separate struct is generated to describe the note's fields, which is used for efficient retrieval of note data

### Example

```rust
#[note]
struct CustomNote {
    value: Field,
}
```

The `owner` is passed as a runtime parameter to the `compute_note_hash` and `compute_nullifier` functions, not stored as a field on the note.

To see the exact generated code, run `nargo expand` on your contract.

Key things to keep in mind:

- The note struct must implement or derive the `Packable` trait
- Developers can use `#[custom_note]` instead of `#[note]` to provide their own `NoteHash` implementation
- The note's fields are automatically serialized and deserialized in the order they are defined in the struct

## Storage struct #[storage]

The `#[storage]` attribute is used to define the storage structure for an Aztec contract.

When a struct is annotated with `#[storage]`, the macro:

1. **Context Injection**: Injects a `Context` generic parameter into the storage struct and all its fields, allowing storage to interact with the Aztec context

2. **Storage Implementation Generation**: Generates an `impl` block with an `init` function that initializes each storage variable with its assigned slot

3. **Storage Slot Assignment**: Automatically assigns storage slots to each field based on their serialized length

4. **Storage Layout Generation**: Creates a `StorageLayout` struct exported via `#[abi(storage)]` for use in the contract artifact

### Example

```rust
#[storage]
struct Storage {
    balance: PublicMutable<Field>,
    owner: PublicMutable<AztecAddress>,
    token_map: Map<AztecAddress, Field>,
}
```

To see the exact generated code, run `nargo expand` on your contract. Alternatively, use `#[storage_no_init]` if you need manual control over storage slot allocation.

Key things to keep in mind:

- Only one storage struct can be defined per contract, and it must be named `Storage`
- `Map` types and private `Note` types always occupy a single storage slot

## #[storage_no_init]

The `#[storage_no_init]` attribute is an alternative to `#[storage]` that gives you manual control over storage slot allocation. Use this when you need custom slot assignments or want to maintain compatibility with existing storage layouts.

With `#[storage_no_init]`, you must provide your own `init` function:

```rust
#[storage_no_init]
struct Storage<Context> {
    balance: PublicMutable<Field, Context>,
    owner: PublicMutable<AztecAddress, Context>,
}

impl<Context> Storage<Context> {
    fn init(context: Context) -> Self {
        Storage {
            balance: PublicMutable::new(context, 1),  // Explicit slot assignment
            owner: PublicMutable::new(context, 5),    // Non-sequential slot
        }
    }
}
```

Unlike `#[storage]`, this macro does not generate:
- The `init` function (you must implement it)
- The `StorageLayout` struct for the contract artifact

## Further reading

- [Macros reference](../macros.md)
