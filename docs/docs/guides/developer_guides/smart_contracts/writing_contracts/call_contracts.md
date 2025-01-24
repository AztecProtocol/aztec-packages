---
title: Calling Other Contracts
sidebar_position: 4
tags: [functions, contracts]
---

A contract is a collection of persistent state variables and functions which may manipulate these variables.

Functions and state variables within a contract's scope are said to belong to that contract. A contract can only access and modify its own state.

If a contract wishes to access or modify another contract's state, it must make a call to an external function of the other contract. For anything to happen on the Aztec network, an external function of a contract needs to be called.

### Add Contract as a Dependency

Import the contract that you want to call into your `Nargo.toml` under `dependencies` like this:

```toml
token = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="noir-projects/noir-contracts/contracts/token_contract" }
```

### Import into your contract

At the top of your contract, import the contract you want to call like this:

```rust
use token::Token;
```

### Call the function

To call the function, you need to

- Specify the address of the contract with `Contract::at(contract_address)`
- Call the function name with `.function_name()`
- Pass the parameters into the function call, like `.function_name(param1,param2)`
- Specify the type of call you want to make and pass a mut reference to the context, like `.call(&mut context)`

#### Private calls

To call a private function, you can just use `call()` like this:

#include_code call_function noir-projects/noir-contracts/contracts/escrow_contract/src/main.nr rust

#### Public -> Public calls

To call a public function from a public function, it is the same as above. You can just use `call()` like this:

#include_code public_to_public_call noir-projects/noir-contracts/contracts/lending_contract/src/main.nr rust

#### Private -> Public calls

To call a public function from private, you will need to enqueue it like this:

#include_code enqueue_public /noir-projects/noir-contracts/contracts/lending_contract/src/main.nr rust

Public functions are always executed after private execution. To learn why, read the [concepts overview](../../../../aztec/concepts_overview.md).

#### Other call types

There are other call types, for example to ensure no state changes are made. You can learn more about them in the [call types glossary](../../../../aztec/glossary/call_types.md).
