---
title: Run Aztec in a Sandbox
sidebar_position: 0
tags: [sandbox, PXE]
description: Information about running the Aztec sandbox development environment.
---

- Current version: `v3.0.0-nightly.20251007`
- Update with `aztec-up`

On this page you will find

- [Understanding versions](#versions)
- [How to automatically update Aztec sandbox and aztec-nargo](#updating)
- [How to update Aztec.nr packages](#updating-aztecnr-packages)
- [How to update Aztec.js packages](#updating-aztecjs-packages)
- [How to enable client-side proving](#sandbox-pxe-proving)
- [How to run multiple PXEs](#running-multiple-pxes-in-the-sandbox)

## Versions

Aztec tools (sandbox, nargo), dependencies (Aztec.nr), and sample contracts are constantly being improved.
When developing and referring to example .nr files/snippets, it is helpful to verify the versions of different components (below), and if required keep them in lock-step by [updating](#updating).

### Checking tool versions

:::note
The `aztec-nargo` versions follow `nargo` versions, which is different to the Aztec tool versions.
:::

### Dependency versions

Dependency versions in a contract's `Nargo.toml` file correspond to the `aztec-packages` repository tag `aztec-packages` (filter tags by `aztec`...)

If you get an error like: `Cannot read file ~/nargo/github.com/AztecProtocol/aztec-packages/...`
Check the `git=` github url, tag, and directory.

### Example contract versions

Example contracts serve as a helpful reference between versions of the Aztec.nr framework since they are strictly maintained with each release.

Code referenced in the documentation is sourced from contracts within [this directory (GitHub link)](https://github.com/AztecProtocol/aztec-packages/tree/v3.0.0-nightly.20251007/noir-projects/noir-contracts/contracts).

As in the previous section, the location of the noir contracts moved at version `0.24.0`, from `yarn-project/noir-contracts` before, to `noir-projects/noir-contracts`.

:::tip
Notice the difference between the sample Counter contract from `0.23.0` to `0.24.0` shows the `note_type_id` was added.

```shell
diff ~/nargo/github.com/AztecProtocol/v0.23.0/yarn-project/noir-contracts/contracts/test/counter_contract/src/main.nr ~/nargo/github.com/AztecProtocol/v0.24.0/noir-projects/noir-contracts/contracts/test/counter_contract/src/main.nr
```

```
57a58
>         note_type_id: Field,
```

:::

### Language server version (aztec-nargo)

The [Noir LSP](../local_env/installing_noir_lsp.md) uses your local version of `aztec-nargo`, and thus also `aztec-nargo compile`.
The path of the former (once installed) can be seen by hovering over "Nargo" in the bottom status bar of VS Code, and the latter via the `which aztec-nargo` command.

:::caution
For Aztec contract files, this should be `aztec-nargo` and for noir-only files this should be `nargo`. Mismatching tools and file types will generate misleading syntax and compiler errors.
:::

This can present confusion when opening older contracts (and dependencies) written in older version of noir, such as:

- Logs filled with errors from the dependencies
- Or the LSP fails (re-runs automatically then stops)
  The second point requires a restart of the extension, which you can trigger with the command palette (Ctrl + Shift + P) and typing "Reload Window".

## Updating

### Steps to keep up to date

1. Update the Aztec sandbox to the latest version (includes `aztec-nargo`, pxe, etc):

```shell
aztec-up
```

To update to a specific version, pass the version number after the `aztec-up` command, or set `VERSION` for a particular git tag, eg for [v**0.77.0**](https://github.com/AztecProtocol/aztec-packages/tree/v0.77.0)

```shell
aztec-up 0.77.0
# or
VERSION=0.77.0 aztec-up
```

2. Update Aztec.nr and individual @aztec dependencies:

Inside your project run:

```shell
cd your/aztec/project
aztec update . --contract src/contract1 --contract src/contract2
```

The sandbox must be running for the update command to work. Make sure it is [installed and running](../../reference/environment_reference/sandbox-reference.md).

Follow [updating Aztec.nr packages](#updating-aztecnr-packages) and [updating JavaScript packages](#updating-aztecjs-packages) guides.

3. Refer to [Migration Notes](../../../migration_notes.md) on any breaking changes that might affect your dapp

---

There are four components whose versions need to be kept compatible:

1. Aztec Sandbox
2. aztec-nargo
3. `Aztec.nr`, the Noir framework for writing Aztec contracts

First three are packaged together in docker and are kept compatible by running `aztec-up`.
But you need to update your Aztec.nr version manually or using `aztec update`.

## Updating Aztec.nr packages

### Automatic update

You can update your Aztec.nr packages to the appropriate version with the `aztec update` command. Run this command from the root of your project and pass the paths to the folders containing the Nargo.toml files for your projects like so:

```shell
aztec update . --contract src/contract1 --contract src/contract2
```

### Manual update

To update the aztec.nr packages manually, update the tags of the `aztec.nr` dependencies in the `Nargo.toml` file.

```diff
[dependencies]
-aztec = { git="https://github.com/AztecProtocol/aztec-packages", tag="v0.7.5", directory="noir-projects/aztec-nr/aztec" }
+aztec = { git="https://github.com/AztecProtocol/aztec-packages", tag="v3.0.0-nightly.20251007", directory="noir-projects/aztec-nr/aztec" }
-value_note = { git="https://github.com/AztecProtocol/aztec-packages", tag="v0.7.5", directory="noir-projects/aztec-nr/value-note" }
+value_note = { git="https://github.com/AztecProtocol/aztec-packages", tag="v3.0.0-nightly.20251007", directory="noir-projects/aztec-nr/value-note" }
```

Go to the contract directory and try compiling it to verify that the update was successful:

```shell
cd /your/contract/directory
aztec-nargo compile        # generate contract artifacts
aztec-postprocess-contract # transpile contract and generate verification keys
```

If the dependencies fail to resolve ensure that the tag matches a tag in the [aztec-packages repository (GitHub link)](https://github.com/AztecProtocol/aztec-packages/tags).

## Updating Aztec.js packages

To update Aztec.js packages, go to your `package.json` and replace the versions in the dependencies.

```diff
[dependencies]
-"@aztec/accounts": "0.7.5",
+"@aztec/accounts": "v3.0.0-nightly.20251007",
-"@aztec/noir-contracts.js": "0.35.1",
+"@aztec/accounts": "v3.0.0-nightly.20251007",
```

## Sandbox PXE Proving

The Sandbox does not have client-side proving in the PXE enabled by default. This reduces testing times and increases development speed by allowing for rapid iteration.

You may want to enable client-side proving in the Sandbox to better understand how long it takes to execute Aztec transactions. There are 2 ways of doing this:

1. Run the sandbox in proving mode (every transaction wil be proved) or
2. Use `aztec-wallet` cli to prove a one-off transaction

:::note
Proving is much slower and should only be used sparingly to analyze real proving times of executing private functions of a contract.
:::

### Sandbox in Proving Mode

Here every transaction, contract deployment will be proved. If you want to just prove a single transaction, follow [proving with aztec-wallet cli](#proving-with-aztec-wallet).

#### Usage

To enable client-side proving:

```bash
PXE_PROVER_ENABLED=1 aztec start --sandbox
```

The sandbox will take much longer to start. The first time it starts, it will need to download a large crs file, which can take several minutes even on a fast internet connection. This is a one-time operation, you will not need to download it again until you update to a new Aztec version.

The sandbox will also deploy 3 Schnorr account contracts on startup. The sandbox will need to generate transaction proofs for deployment, which will take additional time.

Once everything has been set up, you will see that the PXE is listening on `localhost:8080` as you would see with the sandbox running in the default mode. At this point you can use the sandbox as you would without client-side proving enabled.

### Proving with `aztec-wallet`

You can enable proving on a per-transaction basis using the `aztec-wallet` CLI by setting the `PXE_PROVER_ENABLED` environment variable to `1`. This will use your local `bb` binary to prove the transaction.

```bash
PXE_PROVER_ENABLED=1 aztec-wallet create-account -a test
```

Check the [Quickstart](../../../getting_started_on_sandbox.md) for a refresher on how to send transactions using `aztec-wallet` or check the [reference here](../../reference/environment_reference/cli_wallet_reference.md)

Note that you do not need to restart the sandbox in order to start sending proven transactions. You can optionally set this for one-off transactions.

If this is the first time you are sending transactions with proving enabled, it will take a while to download a CRS file (which is several MBs) that is required for proving.

:::note
You can also profile your transactions to get gate count, if you don't want to prove your transactions but check how many constraints it is. Follow the [guide here](../../guides/smart_contracts/advanced/how_to_profile_transactions.md)
:::

## Running Multiple PXEs in the Sandbox

When you run the sandbox, the Aztec node and PXE have their own http server. This makes it possible to run two PXEs on your local machine, which can be useful for testing that notes are accurately stored and remaining private in their respective PXEs.

We are working on a better solution for this so expect an update soon, but currently you can follow this guide.

### Run the sandbox in one terminal

Rather than use the usual command, run:

```bash
NO_PXE=true aztec start --sandbox
```

This removes any other arguments, allowing you to ensure an isolated environment for the sandbox so it doesn't interfere with another PXE. By default, the sandbox will run on port `8080`.

### Run PXE mode in another terminal

In another terminal, run:

```bash
aztec start --port 8081 --pxe --pxe.nodeUrl=http://localhost:8080/
```

This command uses the default ports, so they might need to be changed depending on your configuration. It will run the PXE on port `8081`.

You should see something like this:

```bash
[14:01:53.181] INFO: pxe:data:lmdb Starting data store with maxReaders 16
[14:01:53.677] INFO: pxe:service Started PXE connected to chain 31337 version 1
[14:01:53.681] INFO: cli Aztec Server listening on port 8081 {"l1ChainId":31337,"l2ChainVersion":1,"l2ProtocolContractsTreeRoot":"0x093cc9324e5a7b44883f515ac490e7294ef8cb1e6d2d8c503255b1b3a9409262","l2CircuitsVkTreeRoot":"0x007c3b32ae1b8b3ed235f158e554d92710b5f126a8b2ed38a0874f6294299b95"}
```

You can learn more about custom commands in the [sandbox reference](../../reference/environment_reference/sandbox-reference.md).
