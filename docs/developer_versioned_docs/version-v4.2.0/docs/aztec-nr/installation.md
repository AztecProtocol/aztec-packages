---
title: Noir VSCode Extension
sidebar_position: 1
tags: [local network, sandbox]
description: Learn how to install and configure the Noir Language Server for a better development experience.
---

Install the [Noir Language Support extension](https://marketplace.visualstudio.com/items?itemName=noir-lang.vscode-noir) to get syntax highlighting, syntax error detection, and go-to definitions for your Aztec contracts.

The extension drives its language server with `nargo`. The Aztec installer installs its own version of `nargo` and adds that directory to your `PATH`, so in most cases you do not need to configure anything else. Verify the binary is on your `PATH`:

```bash
which nargo
# expected: $HOME/.aztec/<path to nargo binary>
```

If you have not installed the Aztec toolchain yet, follow [Getting Started on Local Network](../../getting_started_on_local_network.md) first.

## Configure the extension

Leave the extension's `Noir: Nargo Path` setting empty so it auto-discovers `nargo` from your `PATH`. To confirm, hover over **Nargo** in the VSCode status bar in the bottom right corner — it should show the path under the result from `which nargo`.

If auto-discovery fails, set `Noir: Nargo Path` to the absolute path printed by `which nargo`, then reload the window.

## Troubleshooting

- **LSP reports `startFailed` after setting a custom path**: clear `Noir: Nargo Path`, reload the window, and let auto-discovery take over.
- **`which nargo` points outside `$HOME/.aztec/current/bin`**: another `nargo` earlier on your `PATH` is shadowing the Aztec-provided one. Either remove it or set `Noir: Nargo Path` explicitly to the Aztec-provided `nargo`.
