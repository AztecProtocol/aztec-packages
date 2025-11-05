---
title: Compile Contracts
tags: [contracts]
sidebar_position: 9
description: Learn how to compile your Noir smart contracts for deployment on Aztec.
---

Once you have written a contract in Aztec.nr, you will need to compile it into an artifact in order to use it.

In this guide we will cover how to do so, both using the `aztec-nargo` command and programmatically.

We'll also cover how to generate a helper [TypeScript interface](#typescript-interfaces) and an [Aztec.nr interface](#aztecnr-interfaces) for easily interacting with your contract from your typescript app and from other Aztec.nr contracts, respectively.

## Compile using aztec-nargo

To compile a contract for Aztec, you need to run two commands:

1. First, compile your Noir contracts:

```bash
aztec-nargo compile
```

This will output JSON artifacts for each contract in the project to a `target` folder.

2. Then, run the postprocessing step to prepare contracts for Aztec:

```bash
aztec-postprocess-contract
```

This command will find all contract artifacts in `target` directories and process them for use with Aztec. The postprocessing includes:
- Transpiling functions for the Aztec VM
- Generating verification keys for private functions
- Caching verification keys to speed up subsequent compilations

:::note
The `aztec-nargo compile` command looks for `Nargo.toml` files by ascending up the parent directories, and will compile the top-most Nargo.toml file it finds.
Eg: if you are in `/hobbies/cool-game/contracts/easter-egg/`, and both `cool-game` and `easter-egg` contain a Nargo.toml file, then `aztec-nargo compile` will be performed on `cool-game/Nargo.toml` and compile the project(s) specified within it. Eg

```
[workspace]
members = [
    "contracts/easter-egg",
]
```

The `aztec-postprocess-contract` command will process all contract artifacts it finds in `target` directories within the current directory tree.
:::

### Aztec.nr interfaces

An Aztec.nr contract can [call a function](./call_contracts.md) in another contract via `context.call_private_function` or `context.call_public_function`. However, this requires manually assembling the function selector and manually serializing the arguments, which is not type-safe.

To make this easier, the compiler automatically generates interface structs that expose a convenience method for each function listed in a given contract artifact. These structs are intended to be used from another contract project that calls into the current one.

Below is an example of interface usage generated from the [Token (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/master/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr) contract, used from the [FPC (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/master/noir-projects/noir-contracts/contracts/fees/fpc_contract/src/main.nr):

```rust
contract FPC {

    ...

    use dep::token::Token;

    ...


   #[private]
    fn fee_entrypoint_private(amount: Field, asset: AztecAddress, secret_hash: Field, nonce: Field) {
        assert(asset == storage.other_asset.read());
        Token::at(asset).transfer_to_public(context.msg_sender(), context.this_address(), amount, nonce).call(&mut context);
        FPC::at(context.this_address()).pay_fee_with_shielded_rebate(amount, asset, secret_hash).enqueue(&mut context);
    }

    #[private]
    fn fee_entrypoint_public(amount: Field, asset: AztecAddress, nonce: Field) {
        FPC::at(context.this_address()).prepare_fee(context.msg_sender(), amount, asset, nonce).enqueue(&mut context);
        FPC::at(context.this_address()).pay_fee(context.msg_sender(), amount, asset).enqueue(&mut context);
    }

    ...

}
```

Read more about how to use the Aztec.nr interfaces [here](../../concepts/smart_contracts/functions/index.md).

:::info
At the moment, the compiler generates these interfaces from already compiled ABIs, and not from source code. This means that you should not import a generated interface from within the same project as its source contract, or you risk circular references.
:::

## Next steps

Once you have compiled your contracts, you can use the generated artifacts via the `Contract` class in the `aztec.js` package to deploy and interact with them, or rely on the type-safe typescript classes directly.
