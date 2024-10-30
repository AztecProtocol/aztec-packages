---
title: Importing Aztec.nr
tags: [contracts]
sidebar_position: 5
---

On this page you will find information about Aztec.nr libraries and up-to-date paths for use in your `Nargo.toml`.

## Aztec

```toml
aztec = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="noir-projects/aztec-nr/aztec" }
```

This is the core Aztec library that is required for every Aztec.nr smart contract.

## Authwit

```toml
authwit = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="noir-projects/aztec-nr/authwit"}
```

This allows you to use authentication witnesses in your contract. Read a guide of how to use it [here](../../../guides/developer_guides/smart_contracts/writing_contracts/authwit.md).

## Address note

```toml
address_note = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="noir-projects/aztec-nr/address-note" }
```

This is a library for utilizing notes that hold addresses. Find it on [GitHub](https://github.com/AztecProtocol/aztec-packages/tree/master/noir-projects/aztec-nr/address-note/src).

## Easy private state

```toml
easy_private_state = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="noir-projects/aztec-nr/easy-private-state" }
```

This is an abstraction library for using private variables like [`EasyPrivateUint` (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/6c20b45993ee9cbd319ab8351e2722e0c912f427/noir-projects/aztec-nr/easy-private-state/src/easy_private_state.nr#L17).

## Protocol Types

```toml
protocol_types = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="noir-projects/noir-protocol-circuits/crates/types"}
```

This library contains types that are used in the Aztec protocol. Find it on [GitHub](https://github.com/AztecProtocol/aztec-packages/tree/master/noir-projects/noir-protocol-circuits/crates/types/src).

## Value note

```toml
value_note = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="noir-projects/aztec-nr/value-note" }
```

This is a library for a note that stores one arbitrary value. You can see an example of how it might be used in the [token contract codealong tutorial](../../../tutorials/codealong/contract_tutorials/token_contract.md).
