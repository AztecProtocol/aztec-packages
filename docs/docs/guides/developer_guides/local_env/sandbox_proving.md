---
title: Sandbox PXE Proving
tags: [sandbox, PXE]
---

The Sandbox does not have client-side proving in the PXE enabled by default. This reduces testing times and increases development speed by allowing for rapid iteration.

You may want to enable client-side proving in the Sandbox to better understand how long it takes to execute Aztec transactions.

:::note

Running the sandbox with client-side proving is much slower and should only be used sparingly to analyze real proving times of executing private functions of a contract.

:::

## Config

To enable client-side proving, update the docker compose file found at `~/.aztec/docker-compose.sandbox.yml` and add the following configuration settings under the `aztec:environment` scope.

```yml
BB_BINARY_PATH: /usr/src/barretenberg/cpp/build/bin/bb
PXE_PROVER_ENABLED: 1
BB_WORKING_DIRECTORY: ~/bb-temp #any temp directory for writing circuit artifacts
```

## Usage

Once the `docker-compose.sandbox.yml` has been updated, restart the sandbox with:

```bash
aztec start --sandbox
```

The sandbox will take much longer to start. The first time it starts, it will need to download a large crs file, which can take several minutes even on a fast internet connection. This is a one-time operation, you will not need to download it again until you update to a new Aztec version.

The sandbox will also deploy 3 Schnorr account contracts on startup. The sandbox will need to generate transaction proofs for deployment, which will take additional time.

Once everything has been set up, you will see that the PXE is listening on `localhost:8080` as you would see with the sandbox running in the default mode. At this point you can use the sandbox as you would without client-side proving enabled.

## Proving with `aztec-wallet`

Alternatively, you can enable proving on a per-transaction basis using the `aztec-wallet` CLI

Open `~/.aztec/bin/aztec-wallet` and update the `ENV_VARS_TO_INJECT` variable to:

```bash
# ~/.aztec/bin/aztec-wallet
export ENV_VARS_TO_INJECT="WALLET_DATA_DIRECTORY SSH_AUTH_SOCK BB_BINARY_PATH PXE_PROVER_ENABLED BB_WORKING_DIRECTORY"
```

Export the following envnironment variables in the terminal where you will run `aztec-wallet` commands:

```bash
export BB_BINARY_PATH=/usr/src/barretenberg/cpp/build/bin/bb
export PXE_PROVER_ENABLED=1
export BB_WORKING_DIRECTORY=~/bb-temp
```

Now send transactions from `aztec-wallet`, and proving will be enabled.

Note that you do not need to restart the sandbox in order to start sending proven transactions. You can optionally set this for 1 off transactions.

If this is the first time you are sending transactions with proving enabled, you will have to download the CRS (which is several GBs).
