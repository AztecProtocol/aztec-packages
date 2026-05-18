---
title: Noir VSCode Extension
sidebar_position: 1
tags: [local network, sandbox]
description: Learn how to install and configure the Noir Language Server for a better development experience.
---

Install the [Noir Language Support extension](https://marketplace.visualstudio.com/items?itemName=noir-lang.vscode-noir) to get syntax highlighting, syntax error detection, and go-to definitions for your Aztec contracts.

The extension drives its language server with `nargo`. The Aztec installer ships a bundled `nargo` and exposes it as the `aztec-nargo` symlink on your `PATH`. Bare `nargo` is intentionally not provided so it does not shadow your own install (if any). Verify the symlink is on your `PATH`:

```bash
which aztec-nargo
# expected: $HOME/.aztec/current/bin/aztec-nargo
```

If you have not installed the Aztec toolchain yet, follow [Getting Started on Local Network](../../getting_started_on_local_network.md) first.

## Configure the extension

Set the extension's `Noir: Nargo Path` setting to the absolute path printed by `which aztec-nargo` (for example `$HOME/.aztec/current/bin/aztec-nargo`), then reload the window. `aztec-nargo` is a symlink to the bundled `nargo`, so any tool that invokes it speaks plain `nargo` (LSP included).

To confirm the extension is using the bundled toolchain, hover over **Nargo** in the VSCode status bar in the bottom right corner: it should show the path you set.

If you have your own `nargo` install and want the extension to use that instead, leave `Noir: Nargo Path` empty so the extension auto-discovers `nargo` from your `PATH`.

## Troubleshooting

- **LSP reports `startFailed` after setting a custom path**: confirm `aztec-nargo` is executable and that the path is correct, reload the window, and check the **Output** panel for the language server log.
- **Extension picks up the wrong `nargo`**: the Aztec installer no longer puts bare `nargo` on `PATH`. Set `Noir: Nargo Path` explicitly to `aztec-nargo` (for the bundled version) or to your own install (for any other version).
