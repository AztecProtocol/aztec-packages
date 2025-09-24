---
title: Noir VSCode Extension
sidebar_position: 1
tags: [sandbox, development tools]
description: Learn how to install and configure the Noir Language Server for a better development experience.
---

Install the [Noir Language Support extension](https://marketplace.visualstudio.com/items?itemName=noir-lang.vscode-noir) to get syntax highlighting, syntax error detection and go-to definitions for your Aztec contracts.

:::tip
Being able to click through to the definitions of functions and variables is very helpful for learning about how the Aztec.nr framework works.
:::

Once the extension is installed, check your nargo binary by hovering over Nargo in the status bar on the bottom right of the application window. Click to choose the path to aztec-nargo (or regular nargo, if you have that installed).

You can print the path of your `aztec-nargo` executable by running:

```bash
which aztec-nargo
```

To specify a custom nargo executable, go to the VSCode settings and search for "noir", or click extension settings on the `noir-lang` LSP plugin. Update the `Noir: Nargo Path` field to point to your desired `aztec-nargo` executable. For example, in `.vscode/settings.json`:

```json
{
  "noir.nargoPath": "/home/your-username/.aztec/bin/aztec-nargo"
}
```

## Disabling the LSP

The LSP currently re-compiles the contract on changes, which can be slow. Consider enabling the LSP when reading contracts and trying to understand the code, but disabling it when writing code.

The LSP can be disabled by adding the entry `noir.enableLSP`: `false` into your project `.vscode/settings.json`

```json
{
  "noir.enableLSP": false
}
```
