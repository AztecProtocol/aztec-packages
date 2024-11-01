---
title: Installing the Noir LSP
sidebar_position: 1
tags: [sandbox]
---

Install the [Noir Language Support extension](https://marketplace.visualstudio.com/items?itemName=noir-lang.vscode-noir) to get syntax highlighting, syntax error detection and go-to definitions for your Aztec contracts.

Once the extension is installed, check your nargo binary by hovering over Nargo in the status bar on the bottom right of the application window. Click to choose the path to aztec-nargo (or regular nargo, if you have that installed).

You can print the path of your `aztec-nargo` executable by running:

```bash
which aztec-nargo
```

To specify a custom nargo executable, go to the VSCode settings and search for "noir", or click extension settings on the `noir-lang` LSP plugin. Update the `Noir: Nargo Path` field to point to your desired `aztec-nargo` executable.