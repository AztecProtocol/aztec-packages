---
title: Compiling Contracts
tags: [contracts]
sidebar_position: 2
description: Compile your Aztec smart contracts into deployable artifacts using aztec command.
references: ["yarn-project/aztec/src/cli/cmds/compile.ts", "noir-projects/labs/aztec-nr/aztec/src/macros/calls_generation/*"]
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
contract MyContract {
    use token::Token;

    #[external("private")]
    fn transfer_tokens(token_address: AztecAddress, recipient: AztecAddress, amount: u128) {
        // Use the generated Token interface to call another contract
        self.call(Token::at(token_address).transfer(recipient, amount));
    }

    #[external("private")]
    fn transfer_then_mint(token_address: AztecAddress, recipient: AztecAddress, amount: u128) {
        // Private call executed immediately
        self.call(Token::at(token_address).transfer(recipient, amount));

        // Public call enqueued for later execution
        self.enqueue(Token::at(token_address).mint_to_public(recipient, amount));
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
