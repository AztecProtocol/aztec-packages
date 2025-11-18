---
title: Compiling Contracts
tags: [contracts]
sidebar_position: 2
description: Compile your Aztec smart contracts into deployable artifacts using aztec command.
---

This guide shows you how to compile your Aztec contracts into artifacts ready for deployment and interaction.

## Prerequisites

- An Aztec contract written in Aztec.nr
- `aztec` installed
- Contract project with proper `Nargo.toml` configuration

## Compile your contract

Compile your Noir contracts to generate JSON artifacts:

```bash
aztec compile
```

This outputs contract artifacts to the `target` folder.

## Use generated interfaces

The compiler automatically generates type-safe interfaces for contract interaction.

### Import and use contract interfaces

Use generated interfaces instead of manual function calls:

```rust
contract FPC {
    use dep::token::Token;

    #[external("private")]
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
