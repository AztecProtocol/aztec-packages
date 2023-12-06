---
title: Logs
---

Logs on Aztec are similar to logs on Ethereum and their goal is to allow smart contracts to communicate arbitrary data to the outside world.
Logs are events which are emitted during contract function execution.

There are 2 kinds of logs in Aztec protocol: unencrypted and encrypted.

## Unencrypted logs
Unencrypted logs are used to communicate public information out of smart contracts.
Unencrypted logs can be emitted from both public and private functions.

:::info
Emitting unencrypted logs from private functions can be a privacy leak but we decided to not forbid it because it might allow for interesting usecases like custom encryption schemes using FHE etc.
:::

## Encrypted logs
Encrypted logs can be emitted only from private functions.
This is because to encrypt the log we need to get a secret and it's impossible to privately manage secrets in public domain.