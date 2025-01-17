---
title: Inner Workings of Functions
sidebar_position: 3
tags: [functions]
---

Below, we go more into depth of what is happening under the hood when you create a function in an Aztec contract. The [next page](./attributes.md) will give you more information about what the attributes are really doing.


## Function transformation

When you define a function in an Aztec contract, it undergoes several transformations when it is compiled. These transformations prepare the function for execution. These transformations include:

- [Creating a context for the function](#context-creation)
- [Handling function inputs](#private-and-public-input-injection)
- [Processing return values](#return-value-handling)
- [Computing note hashes and nullifiers](#computing-note-hash-and-nullifier)
- [Generating function signatures](#function-signature-generation)
- [Generating contract artifacts](#contract-artifacts)

Let's explore each of these transformations in detail.

## Context creation

Every function in an Aztec contract operates within a specific context which provides some extra information and functionality. This is either a `PrivateContext` or `PublicContext` object, depending on whether it is a private or public function. For private functions, it creates a hash of all input parameters to ensure privacy.

### Private functions

For private functions, the context creation involves hashing all input parameters:

```rust
let mut args_hasher = ArgsHasher::new();
// Hash each parameter
args_hasher.add(param1);
args_hasher.add(param2);
// add all parameters

let mut context = PrivateContext::new(inputs, args_hasher.hash());
```

This hashing process is important because it is used to verify the function's execution without exposing the input data.

### Public functions

For public functions, context creation is simpler:

```rust
let mut context = PublicContext::new(inputs);
```

These `inputs` are explained in the [private and public input injection](#private-and-public-input-injection) further down on this page.

### Using the context in functions

Once created, the context object provides various useful methods. Here are some common use cases:

#### Accessing storage

The context allows you to interact with contract storage. eg if you have a function that calls storage like this:

```rust
let sender_balance = storage.balances.at(owner);
```

This calls the context to read from the appropriate storage slot.

#### Interacting with other contracts

The context provides methods to call other contracts:

```rust
let token_contract = TokenContract::at(token);
```

Under the hood, this creates a new instance of the contract interface with the specified address.

## Private and public input injection

An additional parameter is automatically added to every function.

The injected input is always the first parameter of the transformed function and is of type `PrivateContextInputs` for private functions or `PublicContextInputs` for public functions.

Original function definition
   ```rust
   fn my_function(param1: Type1, param2: Type2) { ... }
   ```

Transformed function with injected input
   ```rust
   fn my_function(inputs: PrivateContextInputs, param1: Type1, param2: Type2) { ... }
   ```

The `inputs` parameter includes:

- msg sender, ie the address of the account calling the function
- contract address
- chain ID
- block context, eg the block number & timestamp
- function selector of the function being called

This makes these inputs available to be consumed within private annotated functions.

## Return value handling

Return values in Aztec contracts are processed differently from traditional smart contracts when using private functions.

### Private functions

- The original return value is assigned to a special variable:
   ```rust
   let macro__returned__values = original_return_expression;
   ```

- A new `ArgsHasher` is created for the return values:
   ```rust
   let mut returns_hasher = ArgsHasher::new();
   ```

- The hash of the return value is set in the context:
   ```rust
   context.set_return_hash(returns_hasher);
   ```

- The function's return type is changed to `PrivateCircuitPublicInputs`, which is returned by calling `context.finish()` at the end of the function.

This process allows the return values to be included in the function's computation result while maintaining privacy.

### Public functions

In public functions, the return value is directly used, and the function's return type remains as specified by the developer.

## Computing note hash and nullifier

A function called `compute_note_hash_and_optionally_a_nullifier` is automatically generated and injected into all contracts that use notes. This function tells Aztec how to compute hashes and nullifiers for notes used in the contract. You can optionally write this function yourself if you want notes to be handled a specific way.

The function is automatically generated based on the note types defined in the contract. Here's how it works:

- The function takes several parameters:
   ```rust
   fn compute_note_hash_and_optionally_a_nullifier(
       contract_address: AztecAddress,
       nonce: Field,
       storage_slot: Field,
       note_type_id: Field,
       compute_nullifier: bool,
       serialized_note: [Field; MAX_NOTE_FIELDS_LENGTH],
   ) -> [Field; 4]
   ```

- It creates a `NoteHeader` using the provided args:
   ```rust
   let note_header = NoteHeader::new(contract_address, nonce, storage_slot);
   ```

- The function then checks the `note_type_id` against all note types defined in the contract. For each note type, it includes a condition like this:
   ```rust
   if (note_type_id == NoteType::get_note_type_id()) {
       aztec::note::utils::compute_note_hash_and_optionally_a_nullifier(
           NoteType::deserialize_content,
           note_header,
           compute_nullifier,
           serialized_note
       )
   }
   ```

- The function returns an array of 4 Field elements, which represent the note hash and, if computed, the nullifier.

## Function signature generation

Unique function signatures are generated for each contract function.

The function signature is computed like this:

```rust
fn compute_fn_signature_hash(fn_name: &str, parameters: &[Type]) -> u32 {
    let signature = format!(
        "{}({})",
        fn_name,
        parameters.iter().map(signature_of_type).collect::<Vec<_>>().join(",")
    );
    let mut keccak = Keccak::v256();
    let mut result = [0u8; 32];
    keccak.update(signature.as_bytes());
    keccak.finalize(&mut result);
    // Take the first 4 bytes of the hash and convert them to an integer
    // If you change the following value you have to change NUM_BYTES_PER_NOTE_TYPE_ID in l1_note_payload.ts as well
    let num_bytes_per_note_type_id = 4;
    u32::from_be_bytes(result[0..num_bytes_per_note_type_id].try_into().unwrap())
}
```

- A string representation of the function is created, including the function name and parameter types
- This signature string is then hashed using Keccak-256
- The first 4 bytes of the resulting hash are coverted to a u32 integer

### Integration into contract interface

The computed function signatures are integrated into the contract interface like this:

- During contract compilation, placeholder values (0) are initially used for function selectors

- After type checking, the `update_fn_signatures_in_contract_interface()` function is called to replace these placeholders with the actual computed signatures

- For each function in the contract interface:
   - The function's parameters are extracted
   - The signature hash is computed using `compute_fn_signature_hash`
   - The placeholder in the contract interface is replaced with the computed hash

This process ensures that each function in the contract has a unique, deterministic signature based on its name and parameter types. They are inspired by Solidity's function selector mechanism.

## Contract artifacts

Contract artifacts in Aztec are automatically generated structures that describe the contract's interface. They provide information about the contract's functions, their parameters, and return types.

### Contract artifact generation process

For each function in the contract, an artifact is generated like this:

- A struct is created to represent the function's parameters:

   ```rust
   struct {function_name}_parameters {
       // Function parameters are listed here
   }
   ```

   This struct is only created if the function has parameters.

- An ABI struct is generated for the function:

```rust
 let export_struct_source = format!(
        "
        #[abi(functions)]
        struct {}_abi {{
            {}{}
        }}",
        func.name(),
        parameters,
        return_type
    );
```

- These structs are added to the contract's types.

### Content of artifacts

The artifacts contain:

- Function name
- Parameters (if any), including their names and types
- Return type (if the function has returns)

For example, for a function `transfer(recipient: Address, amount: Field) -> bool`, the artifact would look like:

```rust
struct transfer_parameters {
    recipient: Address,
    amount: Field,
}

#[abi(functions)]
struct transfer_abi {
    parameters: transfer_parameters,
    return_type: bool,
}
```

Contract artifacts are important because:

- They provide a machine-readable description of the contract
- They can be used to generate bindings for interacting with the contract (read [here](../../../developers/guides/smart_contracts/how_to_compile_contract.md) to learn how to create TypeScript bindings)
- They help decode function return values in the simulator

## Further reading
- [Function attributes and macros](./attributes.md)