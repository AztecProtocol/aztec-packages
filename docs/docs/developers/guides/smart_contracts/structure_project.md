---
title: Project Structure
tags: [contracts]
sidebar_position: 0
description: Learn how to set up and structure your project for Aztec smart contracts.
---

This guide explains how to set up and structure your project for Aztec smart contracts.

## Before you start

You should have installed the sandbox, which includes local development tools, as described in [the getting started guide](../../getting_started/getting_started.md).

## Setup

To create a new project, run the following command:

```bash
aztec-nargo new new_project --contract
```

This will create a new project with a `Nargo.toml` file and a `src` directory with a `main.nr` file where your contract will be written.

## Dependencies

Define Aztec.nr as a dependency in your `Nargo.toml` file. Aztec.nr is a package that contains the core functionality for writing Aztec smart contracts.

```toml
[dependencies]
aztec = { git = "https://github.com/AztecProtocol/aztec-packages", tag = "#include_aztec_version", directory = "noir-projects/aztec-nr/aztec" }
```

## Writing a contract

To write a contract:

1. Import aztec.nr into your contract in the `src/main.nr` file and declare your contract

```rust
#include_code setup /noir-projects/noir-contracts/contracts/test/counter_contract/src/main.nr raw
```

2. Define imports in your contract block

For example, these are the imports for the example counter contract:

#include_code imports /noir-projects/noir-contracts/contracts/test/counter_contract/src/main.nr rust

3. Declare your contract storage below your imports

#include_code storage_struct /noir-projects/noir-contracts/contracts/test/counter_contract/src/main.nr rust

4. Declare a constructor with `#[initializer]`. Constructors can be private or public functions.

#include_code constructor /noir-projects/noir-contracts/contracts/test/counter_contract/src/main.nr rust

5. Declare your contract functions

#include_code increment /noir-projects/noir-contracts/contracts/test/counter_contract/src/main.nr rust

There is a lot more detail and nuance to writing contracts, but this should give you a good starting point.
Read contents of this section for more details about authorizing contract to act on your behalf (authenticaion witnesses),
emitting events, calling functions on other contracts and other common patterns.
