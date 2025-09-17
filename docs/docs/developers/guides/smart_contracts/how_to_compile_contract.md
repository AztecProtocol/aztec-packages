---
title: Compiling Contracts
tags: [contracts]
sidebar_position: 1
description: Compile your Aztec smart contracts into deployable artifacts using aztec-nargo.
---

This guide shows you how to compile your Aztec contracts into artifacts ready for deployment and interaction.

## Prerequisites

- An Aztec contract written in Aztec.nr
- `aztec-nargo` installed (included with the sandbox)
- Contract project with proper `Nargo.toml` configuration

## Compile your contract

### Step 1: Compile to JSON artifacts

Compile your Noir contracts to generate JSON artifacts:

```bash
aztec-nargo compile
```

This outputs contract artifacts to the `target` folder.

### Step 2: Process for Aztec

Process the artifacts for Aztec compatibility:

```bash
aztec-postprocess-contract
```

This step:
- Transpiles functions for the Aztec VM
- Generates verification keys for private functions
- Caches keys for faster subsequent compilations

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

## Use generated interfaces

The compiler automatically generates type-safe interfaces for contract interaction.

### Import and use contract interfaces

Use generated interfaces instead of manual function calls:

```rust
contract FPC {
    use dep::token::Token;

    #[private]
    fn fee_entrypoint_private(amount: Field, asset: AztecAddress, secret_hash: Field, nonce: Field) {
        assert(asset == storage.other_asset.read());
        Token::at(asset).transfer_to_public(context.msg_sender(), context.this_address(), amount, nonce).call(&mut context);
        FPC::at(context.this_address()).pay_fee_with_shielded_rebate(amount, asset, secret_hash).enqueue(&mut context);
    }
}
```

:::warning
Do not import generated interfaces from the same project as the source contract to avoid circular references.
:::

## Next steps

After compilation, use the generated artifacts to:

- Deploy contracts with the `Contract` class from `aztec.js`
- Interact with deployed contracts using type-safe interfaces
- Import contracts in other Aztec.nr projects
