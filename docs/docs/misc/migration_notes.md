---
title: Migration notes
description: Read about migration notes from previous versions, which could solve problems while updating
keywords: [sandbox, cli, aztec, notes, migration, updating, upgrading]
---

Aztec is in full-speed development. Literally every version breaks compatibility with the previous ones. This page attempts to target errors and difficulties you might encounter when upgrading, and how to resolve them.

## ≥0.17

### Importing contracts in JS

Contracts are now imported from a file with the type's name.

For example:

```js
import { TokenContract } from "@aztec/noir-contracts/Token";
```

instead of

```js
import { TokenContract } from "@aztec/noir-contracts/types";
```

### Importing contracts in Nargo.toml

Aztec contracts are now moved outside of the `src` folder, so you need to update your imports.

For example, for `easy_private_token_contract`, you'd import them like this:

```rust
easy_private_token_contract = {git = "https://github.com/AztecProtocol/aztec-packages/", tag ="v0.16.9", directory = "yarn-project/noir-contracts/src/contracts/easy_private_token_contract"}
```

Now, just remove the `src` folder, as such:

```rust
easy_private_token_contract = {git = "https://github.com/AztecProtocol/aztec-packages/", tag ="v0.17.0", directory = "yarn-project/noir-contracts/contracts/easy_private_token_contract"}
```
