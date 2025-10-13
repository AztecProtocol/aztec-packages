---
title: Noir VSCode Extension
description: Learn how to install and configure the Noir Language Server for a better development experience.
tags: [sandbox]
source: "developers/docs/guides/local_env/installing_noir_lsp.md"
---

## Level Up Your Coding Experience

Writing smart contracts should feel smooth and productive, not frustrating. That's where the Noir Language Server comes in! Think of it as your helpful coding assistant that catches errors as you type, provides autocomplete suggestions, and helps you navigate your code.

If you've ever used TypeScript or Rust with an IDE, you know how helpful these features are. Let's get that same great experience set up for writing Aztec contracts in Noir!

## What You'll Get

Once installed, the Noir Language Server gives you:

- **✨ Syntax highlighting** - Your code becomes colorful and easier to read
- **🔍 Error detection** - Catch mistakes as you type, before you even compile
- **🚀 Auto-complete** - Type hints and suggestions for functions and variables
- **📍 Go-to-definition** - Jump to function definitions with a single click
- **🎯 Hover documentation** - See function signatures and docs by hovering
- **⚡ Code snippets** - Quick templates for common patterns

This transforms VS Code into a proper Noir IDE, making you significantly more productive!

## Prerequisites

Before installing the extension, make sure you have:

- ✅ **VS Code installed** - Download from [code.visualstudio.com](https://code.visualstudio.com/)
- ✅ **Aztec tools installed** - You should have `aztec-nargo` from the [Introduction lesson](./1_intro.md)
- ✅ **A terminal open** - We'll need to find your `aztec-nargo` path

:::tip Why aztec-nargo?
For Aztec contracts, you need `aztec-nargo` (not regular `nargo`). This is Aztec's fork of the Noir compiler with special features for privacy-preserving smart contracts.
:::

---

#include_code installing_noir_lsp /docs/docs/developers/docs/guides/local_env/installing_noir_lsp.md raw

---

## Verifying Your Setup

Let's make sure everything is working correctly! Here's how to verify your installation:

### 1. Check the Status Bar

Look at the bottom-right of VS Code. You should see "Nargo" in the status bar:

- ✅ **Good**: Shows "Nargo" with a checkmark
- ⚠️ **Needs attention**: Shows "Nargo" with a warning icon
- ❌ **Problem**: No "Nargo" indicator visible

### 2. Test with a Simple Contract

Create a test file to verify the LSP is working:

```rust
// test.nr
fn main() {
    let x: Field = 5;
    let y: Field = "this should error"; // Type error - string not Field
}
```

You should see:
- **Red squiggly lines** under the type error
- **Syntax highlighting** with colors for keywords, types, and values
- **Hover information** when you mouse over `Field` or function names

### 3. Test Auto-complete

Start typing in a new file:

```rust
use aztec::
```

After typing `::`, you should see a dropdown with available imports like:
- `context`
- `macros`
- `protocol_types`
- etc.

If you see these completions, congratulations - your LSP is working perfectly!

## Troubleshooting

**"Can't find Nargo" or "Nargo not detected"**

1. Make sure `aztec-nargo` is installed:
   ```bash
   which aztec-nargo
   ```

2. Copy that path and set it in VS Code settings:
   - Open Settings (Ctrl/Cmd + ,)
   - Search for "noir nargo path"
   - Paste the full path to `aztec-nargo`

3. Reload VS Code:
   - Press Ctrl/Cmd + Shift + P
   - Type "Reload Window"
   - Press Enter

**"LSP shows errors but code compiles fine"**

This usually means the LSP is using regular `nargo` instead of `aztec-nargo`. Double-check the Nargo Path setting points to `aztec-nargo`.

**"Extension not loading"**

1. Check you installed the correct extension:
   - Extension ID: `noir-lang.vscode-noir`
   - Verify on [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=noir-lang.vscode-noir)

2. Try restarting VS Code completely

3. Check the extension is enabled (not disabled by accident)

**"Slow or unresponsive"**

If the LSP feels slow on large projects:
1. Close unnecessary files/tabs
2. Reload the window (Ctrl/Cmd + Shift + P → "Reload Window")
3. Check your `aztec-nargo` version matches your project's Aztec version

## Pro Tips for Power Users

**Keyboard Shortcuts:**
- `F12` - Go to definition
- `Shift + F12` - Find all references
- `Ctrl/Cmd + Space` - Trigger auto-complete manually
- `Ctrl/Cmd + .` - Quick fix suggestions

**Useful Settings:**
- **Format on Save** - Automatically format your code when saving
- **Auto Save** - Enable autosave so you don't lose work
- **Minimap** - Toggle the code minimap on the right side

**Extensions That Work Great Together:**
- **Error Lens** - Shows errors inline in your code
- **GitLens** - Enhanced Git integration
- **Better Comments** - Color-coded comments
- **Bracket Pair Colorizer** - Matches bracket pairs with colors

## What's Next?

Awesome! You now have a professional development setup for writing Aztec contracts. Your editor is ready to help you write clean, error-free code.

**Next Steps:**

1. **Try the Boilerplate** - Get a pre-configured project with example contracts
2. **Start Module 5** - Begin writing your own Aztec contracts with your new IDE superpowers!

As you write contracts in the upcoming modules, you'll really appreciate having the LSP set up. Those red squiggly lines catching errors before you compile will save you so much time!

---

**Ready to see a complete contract?** Continue to [Aztec Boilerplate](./5_aztec_boilerplate.md) to explore a pre-configured project with best practices built in.