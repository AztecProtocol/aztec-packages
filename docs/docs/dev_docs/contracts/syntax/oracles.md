---
title: Oracles
---

On this page you will learn:

1. [A list of inbuilt oracles](#inbuilt-oracles)
3. [How to use the debug_log oracle](#how-to-use-the-debug-oracle)
3. [How to use the auth_witness oracle](#how-to-use-the-auth_witness-oracle)
4. [How to use the pop_capsule oracle for arbitrary data](#how-to-use-the-pop_capsule-oracle)
4. [Reference](#oracles-reference)

## Inbuilt oracles

- [`debug_log`](https://github.com/AztecProtocol/aztec-packages/blob/master/yarn-project/aztec-nr/aztec/src/oracle/debug_log.nr) - Provides a couple of debug functions that can be used to log information to the console.
- [`auth_witness`](https://github.com/AztecProtocol/aztec-packages/blob/master/yarn-project/aztec-nr/authwit/src/auth_witness.nr) - Provides a way to fetch the authentication witness for a given address. This is useful when building account contracts to support approve-like functionality.
- [`get_l1_to_l2_message`](https://github.com/AztecProtocol/aztec-packages/blob/master/yarn-project/aztec-nr/aztec/src/oracle/get_l1_to_l2_message.nr) - Useful for application that receive messages from L1 to be consumed on L2, such as token bridges or other cross-chain applications.
- [`notes`](https://github.com/AztecProtocol/aztec-packages/blob/master/yarn-project/aztec-nr/aztec/src/oracle/notes.nr) - Provides a lot of functions related to notes, such as fetches notes from storage etc, used behind the scenes for value notes and other pre-build note implementations.
- [`logs`](https://github.com/AztecProtocol/aztec-packages/blob/master/yarn-project/aztec-nr/aztec/src/oracle/logs.nr) - Provides the to log encrypted and unencrypted data.

## How to use the debug oracle

## How to use the auth_witness oracle

## How to use the pop_capsule oracle

## Oracles reference