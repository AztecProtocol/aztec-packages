---
title: Importing Aztec.nr
description: Learn how to manage dependencies in your Aztec smart contract projects.
tags: [contracts]
sidebar_position: 2
---

On this page you will find information about Aztec.nr libraries and up-to-date paths for use in your `Nargo.toml`.

## Aztec

```toml
aztec = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="noir-projects/aztec-nr/aztec" }
```

This is the core Aztec library that is required for every Aztec.nr smart contract.

## Address note

```toml
address_note = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="noir-projects/aztec-nr/address-note" }
```

This is a library for utilizing notes that hold addresses. Find it on [GitHub](https://github.com/AztecProtocol/aztec-packages/tree/master/noir-projects/aztec-nr/address-note/src).

## Balance Set

```toml
balance_set = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="noir-projects/aztec-nr/balance-set" }
```

This is an abstraction library for managing private balances using `BalanceSet`, which handles note creation and coin selection automatically. Find it on [GitHub](https://github.com/AztecProtocol/aztec-packages/tree/master/noir-projects/aztec-nr/balance-set/src).

## Protocol Types

```toml
protocol_types = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="noir-projects/noir-protocol-circuits/crates/types"}
```

This library contains types that are used in the Aztec protocol. Find it on [GitHub](https://github.com/AztecProtocol/aztec-packages/tree/master/noir-projects/noir-protocol-circuits/crates/types/src).

## Field Note

```toml
field_note = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="noir-projects/aztec-nr/field-note" }
```

This is a library for notes that store a single `Field` value. Find it on [GitHub](https://github.com/AztecProtocol/aztec-packages/tree/master/noir-projects/aztec-nr/field-note/src).

## Uint Note

```toml
uint_note = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="noir-projects/aztec-nr/uint-note" }
```

This is a library for notes that store unsigned integer values (`u128`). Find it on [GitHub](https://github.com/AztecProtocol/aztec-packages/tree/master/noir-projects/aztec-nr/uint-note/src).
