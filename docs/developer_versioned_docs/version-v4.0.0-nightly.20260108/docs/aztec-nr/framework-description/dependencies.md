---
title: Aztec.nr Dependencies
description: Reference list of available Aztec.nr libraries and their Nargo.toml dependency paths.
tags: [contracts]
sidebar_position: 2
---

This page lists the available Aztec.nr libraries. Add dependencies to the `[dependencies]` section of your `Nargo.toml`:

```toml
[dependencies]
aztec = { git="https://github.com/AztecProtocol/aztec-nr/", tag="v4.0.0-nightly.20260108", directory="aztec" }
# Add other libraries as needed
```

## Core

### Aztec (required)

```toml
aztec = { git="https://github.com/AztecProtocol/aztec-packages/", tag="v4.0.0-nightly.20260108", directory="noir-projects/aztec-nr/aztec" }
```

The core Aztec library required for every Aztec.nr smart contract.

### Protocol Types

```toml
protocol_types = { git="https://github.com/AztecProtocol/aztec-packages/", tag="v4.0.0-nightly.20260108", directory="noir-projects/noir-protocol-circuits/crates/types"}
```

Contains types used in the Aztec protocol (addresses, constants, hashes, etc.).

## Note Types

### Address Note

```toml
address_note = { git="https://github.com/AztecProtocol/aztec-packages/", tag="v4.0.0-nightly.20260108", directory="noir-projects/aztec-nr/address-note" }
```

Provides `AddressNote`, a note type for storing `AztecAddress` values.

### Field Note

```toml
field_note = { git="https://github.com/AztecProtocol/aztec-nr/", tag="v4.0.0-nightly.20260108", directory="field-note" }
```

Provides `FieldNote`, a note type for storing a single `Field` value.

### Uint Note

```toml
uint_note = { git="https://github.com/AztecProtocol/aztec-nr/", tag="v4.0.0-nightly.20260108", directory="uint-note" }
```

Provides `UintNote`, a note type for storing `u128` values. Also includes `PartialUintNote` for partial note workflows where the value is completed in public execution.

## State Variables

### Balance Set

```toml
balance_set = { git="https://github.com/AztecProtocol/aztec-nr/", tag="v4.0.0-nightly.20260108", directory="balance-set" }
```

Provides `BalanceSet`, a state variable for managing private balances. Includes helper functions for adding, subtracting, and querying balances.

## Utilities

### Compressed String

```toml
compressed_string = { git="https://github.com/AztecProtocol/aztec-nr/", tag="v4.0.0-nightly.20260108", directory="compressed-string" }
```

Provides `CompressedString` and `FieldCompressedString` utilities for working with compressed string data.
