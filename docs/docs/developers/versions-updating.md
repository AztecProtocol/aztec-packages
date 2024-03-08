---
title: Versions and Updating
---


## Versions
Aztec tools (sandbox, cli, nargo), dependencies (aztec-nr), and sample contracts are constantly being improved.
When developing and referring to example .nr files/snippets, it is helpful to verify the versions of different components (below), and if required keep them in lock-step by [updating](#updating).

### Checking tool versions
To check your version of Aztec tools, you can use `aztec-cli -V`

:::note
The `aztec-nargo` versions follow `nargo` versions, which is different to the Aztec tool versions.
:::note

The latest version of the Aztec tooling is currently `#include_aztec_version` , updating roughly every week.

### Dependency versions
Dependency versions in a contract's `Nargo.toml` file correspond to the `aztec-packages` repository tag `aztec-packages` (filter tags by `aztec`...)

If you get an error like: `Cannot read file ~/nargo/github.com/AztecProtocol/aztec-packages/...`
Check the `git=` github url, tag, and directory.

:::note
The folder structure changed at **0.24.0** from `yarn-project/aztec-nr` to `noir-projects/aztec-nr`.  More details [here](https://docs.aztec.network/misc/migration_notes#aztecnr-aztec-nr-contracts-location-change-in-nargotoml)
:::note

### Example contract versions
Example contracts serve as a helpful reference between versions of the aztec-nr framework since they are strictly maintained with each release.

Code referenced in the documentation is sourced from contracts within [this directory](https://github.com/AztecProtocol/aztec-packages/tree/#include_aztec_version/noir-projects/noir-contracts/contracts).

As in the previous section, the location of the noir contracts moved at version `0.24.0`, from `yarn-project/noir-contracts` before, to `noir-projects/noir-contracts`.

:::tip
Notice the difference between the sample Counter contract from `0.23.0` to `0.24.0` shows the `note_type_id` was added.
```shell
diff ~/nargo/github.com/AztecProtocol/aztec-packages-v0.23.0/yarn-project/noir-contracts/contracts/counter_contract/src/main.nr ~/nargo/github.com/AztecProtocol/aztec-packages-v0.24.0/noir-projects/noir-contracts/contracts/counter_contract/src/main.nr
```

```
57a58
>         note_type_id: Field,
```
:::tip

### Language server version (aztec-nargo)
The [Noir LSP](https://docs.aztec.network/developers/contracts/main#install-noir-lsp-recommended) uses your local version of `aztec-nargo`, and thus also `aztec-nargo compile`.
The path of the former (once installed) can be seen by hovering over "Nargo" in the bottom status bar of VS Code, and the latter via the `which aztec-nargo` command.

:::caution
For Aztec contract files, this should be `aztec-nargo` and for noir-only files this should be `nargo`. Mismatching tools and file types will generate misleading syntax and compiler errors.
:::caution

This can present confusion when opening older contracts (and dependencies) written in older version of noir, such as:
- Logs filled with errors from the dependencies
- Or the LSP fails (re-runs automatically then stops)
The second point requires a restart of the extension, which you can trigger with the command palette (Ctrl + Shift + P) and typing "Reload Window".

## Updating
### TL;DR

1. Updating the sandbox and CLI:

```shell
aztec-up
```

2. Updating aztec-nr and individual @aztec dependencies:

Inside your project run:

```shell
cd your/aztec/project
aztec-cli update . --contract src/contract1 --contract src/contract2
```

The sandbox must be running for the update command to work. Make sure it is [installed and running](../developers/sandbox/references/sandbox-reference.md).

3. Refer [Migration Notes](../misc/migration_notes.md) on any breaking changes that might affect your dapp

---

There are four components whose versions need to be kept compatible:

1. Aztec Sandbox
2. Aztec CLI
3. aztec-nargo
4. `Aztec.nr`, the Noir framework for writing Aztec contracts

First three are packaged together in docker and are kept compatible by running `aztec-up`.
But you need to update your Aztec.nr version manually or using `aztec-cli update`.

## Updating Aztec.nr packages

### Automatic update

`aztec-cli` will update your Aztec.nr packages to the appropriate version with the `aztec-cli update` command. Run this command from the root of your project and pass the paths to the folders containing the Nargo.toml files for your projects like so:

```shell
aztec-cli update . --contract src/contract1 --contract src/contract2
```

### Manual update

To update the aztec.nr packages manually, update the tags of the `aztec.nr` dependencies in the `Nargo.toml` file.

```diff
[dependencies]
-aztec = { git="https://github.com/AztecProtocol/aztec-packages", tag="aztec-packages-v0.7.5", directory="noir-projects/aztec-nr/aztec" }
+aztec = { git="https://github.com/AztecProtocol/aztec-packages", tag="#include_aztec_version", directory="noir-projects/aztec-nr/aztec" }
-value_note = { git="https://github.com/AztecProtocol/aztec-packages", tag="aztec-packages-v0.7.5", directory="noir-projects/aztec-nr/value-note" }
+value_note = { git="https://github.com/AztecProtocol/aztec-packages", tag="#include_aztec_version", directory="noir-projects/aztec-nr/value-note" }
```

Go to the contract directory and try compiling it with `aztec-nargo compile` to verify that the update was successful:

```shell
cd /your/contract/directory
aztec-nargo compile
```

If the dependencies fail to resolve ensure that the tag matches a tag in the [aztec-packages repository](https://github.com/AztecProtocol/aztec-packages/tags).

## Updating `aztec-nargo`

`aztec-nargo` is updated by running:

```bash
aztec-up
```
