---
title: How to Compile a Contract
sidebar_position: 3
tags: [contracts]
---

Once you have written a contract in Aztec.nr, you will need to compile it into an artifact in order to use it.

In this guide we will cover how to do so, both using the `aztec-nargo` command and programmatically.

We'll also cover how to generate a helper [TypeScript interface](#typescript-interfaces) and an [Aztec.nr interface](#aztecnr-interfaces) for easily interacting with your contract from your typescript app and from other Aztec.nr contracts, respectively.

## Compile using aztec-nargo

To compile a contract using the Aztec's build of nargo.

Run the `aztec-nargo compile` command within your contract project folder (the one that contains the `Nargo.toml` file):

```bash
aztec-nargo compile
```

This will output a JSON artifact for each contract in the project to a `target` folder containing the Noir ABI artifacts.

:::note
This command looks for `Nargo.toml` files by ascending up the parent directories, and will compile the top-most Nargo.toml file it finds.
Eg: if you are in `/hobbies/cool-game/contracts/easter-egg/`, and both `cool-game` and `easter-egg` contain a Nargo.toml file, then `aztec-nargo compile` will be performed on `cool-game/Nargo.toml` and compile the project(s) specified within it. Eg

```
[workspace]
members = [
    "contracts/easter-egg",
]
```

:::

### Typescript Interfaces

You can use the code generator to autogenerate type-safe typescript classes for each of your contracts. These classes define type-safe methods for deploying and interacting with your contract based on their artifact.

```bash
aztec codegen ./aztec-nargo/output/target/path -o src/artifacts
```

Read more about interacting with contracts using `aztec.js` [by following this tutorial](../../tutorials/codealong/js_tutorials/aztecjs-getting-started.md).

### Aztec.nr interfaces

An Aztec.nr contract can [call a function](./writing_contracts/call_contracts.md) in another contract via `context.call_private_function` or `context.call_public_function`. However, this requires manually assembling the function selector and manually serializing the arguments, which is not type-safe.

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

Read more about how to use the Aztec.nr interfaces [here](../../../aztec/smart_contracts/functions/index.md).

:::info
At the moment, the compiler generates these interfaces from already compiled ABIs, and not from source code. This means that you should not import a generated interface from within the same project as its source contract, or you risk circular references.
:::

## Next steps

Once you have compiled your contracts, you can use the generated artifacts via the `Contract` class in the `aztec.js` package to deploy and interact with them, or rely on the type-safe typescript classes directly.
