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
token = { git="https://github.com/AztecProtocol/aztec-packages/", tag="v0.87.8", directory="noir-projects/noir-contracts/contracts/app/token_contract" }
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

```rust title="call_function" showLineNumbers 
Token::at(token).transfer(recipient, amount).call(&mut context);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.87.8/noir-projects/noir-contracts/contracts/app/escrow_contract/src/main.nr#L45-L47" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/escrow_contract/src/main.nr#L45-L47</a></sub></sup>


#### Public -> Public calls

To call a public function from a public function, it is the same as above. You can just use `call()` like this:

```rust title="public_to_public_call" showLineNumbers 
let _ = Token::at(collateral_asset)
    .transfer_in_public(context.msg_sender(), context.this_address(), amount, nonce)
    .call(&mut context);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.87.8/noir-projects/noir-contracts/contracts/app/lending_contract/src/main.nr#L133-L137" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/lending_contract/src/main.nr#L133-L137</a></sub></sup>


#### Private -> Public calls

To call a public function from private, you will need to enqueue it like this:

```rust title="enqueue_public" showLineNumbers 
Lending::at(context.this_address())
    ._deposit(AztecAddress::from_field(on_behalf_of), amount, collateral_asset)
    .enqueue(&mut context);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.87.8/noir-projects/noir-contracts/contracts/app/lending_contract/src/main.nr#L119-L123" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/lending_contract/src/main.nr#L119-L123</a></sub></sup>


Public functions are always executed after private execution. To learn why, read the [concepts overview](../../../../aztec/index.md).

#### Other call types

There are other call types, for example to ensure no state changes are made. You can learn more about them in the [call types glossary](../../../../aztec/concepts/call_types.md).
