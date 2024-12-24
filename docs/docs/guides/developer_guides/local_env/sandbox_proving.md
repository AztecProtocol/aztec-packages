---
title: Sandbox PXE Proving
tags: [sandbox, PXE]
---

The Sandbox does not have client-side proving in the PXE enabled by default. This reduces testing times and increases development speed by allowing for rapid iteration.

You may want to enable client-side proving in the Sandbox to better understand how long it takes to execute Aztec transactions. There are 2 ways of doing this:
1. Run the sandbox in proving mode (every transaction wil be proved) or
2. Use `aztec-wallet` cli to prove a one-off transaction

:::note
Proving is much slower and should only be used sparingly to analyze real proving times of executing private functions of a contract.
:::

## Sandbox in Proving Mode
Here every transaction, contract deployment will be proved. If you want to just prove a single transaction, follow [proving with aztec-wallet cli](#proving-with-aztec-wallet).

### Config

To enable client-side proving, update the docker compose file found at `~/.aztec/docker-compose.sandbox.yml` and add the following configuration settings under the `aztec:environment` scope.

```yml
BB_BINARY_PATH: /usr/src/barretenberg/cpp/build/bin/bb
PXE_PROVER_ENABLED: 1
BB_WORKING_DIRECTORY: ~/bb-temp #any temp directory for writing circuit artifacts
```

### Usage
Once the `docker-compose.sandbox.yml` has been updated, restart the sandbox with:

```bash
aztec start --sandbox
```

The sandbox will take much longer to start. The first time it starts, it will need to download a large crs file, which can take several minutes even on a fast internet connection. This is a one-time operation, you will not need to download it again until you update to a new Aztec version.

The sandbox will also deploy 3 Schnorr account contracts on startup. The sandbox will need to generate transaction proofs for deployment, which will take additional time.

Once everything has been set up, you will see that the PXE is listening on `localhost:8080` as you would see with the sandbox running in the default mode. At this point you can use the sandbox as you would without client-side proving enabled.

## Proving with `aztec-wallet`
You can enable proving on a per-transaction basis using the `aztec-wallet` CLI by setting the `PXE_PROVER_ENABLED` environment variable to `1`. This will use your local `bb` binary to prove the transaction.

```bash
PXE_PROVER_ENABLED=1 aztec-wallet create-account -a test
```

Check the [Quickstart](../../getting_started.md) for a refresher on how to send transactions using `aztec-wallet` or check the [reference here](../../../reference/developer_references/cli_wallet_reference.md)

Note that you do not need to restart the sandbox in order to start sending proven transactions. You can optionally set this for one-off transactions.

If this is the first time you are sending transactions with proving enabled, it will take a while to download a CRS file (which is several MBs) that is required for proving.

:::note
You can also profile your transactions to get gate count, if you don't want to prove your transactions but check how many constraints it is. Follow the [guide here](../../developer_guides/smart_contracts/profiling_transactions.md)
:::
