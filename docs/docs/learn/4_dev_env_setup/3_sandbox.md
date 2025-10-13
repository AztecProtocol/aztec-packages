---
title: Run Aztec in a Sandbox
description: Information about running the Aztec sandbox development environment.
tags: [sandbox, PXE]
source: "developers/docs/guides/local_env/sandbox.md"
---

## Mastering Your Development Environment

You've installed the Sandbox and completed your first deployment. Awesome! Now let's dive deeper into how the Sandbox actually works and learn some powerful features you'll use throughout your Aztec development journey.

Think of this lesson as your Sandbox user manual - the reference guide you'll come back to when you need to update versions, troubleshoot issues, or enable advanced features like client-side proving.

## What This Lesson Covers

In this reference guide, you'll learn:

1. **Version management** - Understanding how Aztec versions work and keeping everything in sync
2. **Updating your tools** - How to update the Sandbox, aztec-nargo, and package dependencies
3. **Client-side proving** - Enabling proof generation to test real transaction performance
4. **Advanced configurations** - Running multiple PXEs and custom setups

:::note Reference Material
This page contains reference information you'll want to bookmark. You don't need to memorize everything here - just know where to find it when you need it! The most important sections for now are **Versions** and **Updating**.
:::

## Why This Matters

As you develop on Aztec, you'll encounter situations like:

- **"My contract won't compile"** → Check versions are in sync
- **"How do I test real proof generation times?"** → Enable client-side proving
- **"I want to test multi-user scenarios"** → Run multiple PXEs
- **"How do I update to the latest Aztec version?"** → Follow the update guide

This lesson gives you the knowledge to handle these situations confidently.

---

#include_code sandbox /docs/docs/developers/docs/guides/local_env/sandbox.md raw

---

## Key Takeaways

Let's summarize the most important points from this reference guide:

### Essential Knowledge

**Version Management:**
- ✅ Use `aztec-up` to keep your Sandbox and tools in sync
- ✅ Update Aztec.nr packages with `aztec update` or manually in Nargo.toml
- ✅ Update Aztec.js packages in your package.json
- ✅ Check example contracts match your version for accurate reference

**Updating Workflow:**
```bash
# 1. Update tools (Sandbox, aztec-nargo, etc.)
aztec-up

# 2. Update your project dependencies
cd your-project
aztec update . --contract src/contract1 --contract src/contract2

# 3. Check migration notes for breaking changes
```

**When to Enable Proving:**
- 🚫 **Don't** enable during rapid development (too slow!)
- ✅ **Do** enable occasionally to measure real performance
- ✅ **Do** use `PXE_PROVER_ENABLED=1` for one-off transactions
- ✅ **Do** enable when preparing for production deployment

### Common Workflows

**Starting Fresh:**
```bash
# Stop existing sandbox
# Ctrl+C in the sandbox terminal

# Update to latest version
aztec-up

# Start clean sandbox
aztec start --sandbox
```

**Testing Proof Times:**
```bash
# One-off proven transaction
PXE_PROVER_ENABLED=1 aztec-wallet send my_function --from accounts:test0 --contract my_contract

# Or start sandbox in proving mode
PXE_PROVER_ENABLED=1 aztec start --sandbox
```

**Multiple Users Testing:**
```bash
# Terminal 1: Sandbox without PXE
NO_PXE=true aztec start --sandbox

# Terminal 2: First PXE
aztec start --port 8081 --pxe --pxe.nodeUrl=http://localhost:8080/

# Terminal 3: Second PXE
aztec start --port 8082 --pxe --pxe.nodeUrl=http://localhost:8080/
```

## Troubleshooting Tips

**"My contract won't compile"**
1. Check `aztec-nargo` version: `aztec-nargo --version`
2. Check Sandbox version matches your Nargo.toml dependencies
3. Run `aztec-up` to sync everything
4. Check [migration notes](../../../migration_notes.md) for breaking changes

**"LSP shows errors but contract compiles"**
1. Check VS Code is using `aztec-nargo`, not regular `nargo`
2. Verify LSP path: Hover over "Nargo" in VS Code status bar
3. Reload VS Code window (Ctrl+Shift+P → "Reload Window")

**"Can't resolve dependencies"**
1. Check Git tags exist: Visit [aztec-packages tags](https://github.com/AztecProtocol/aztec-packages/tags)
2. Verify tag format in Nargo.toml: `tag="aztec-packages-v0.X.X"`
3. Run `aztec-nargo check` for detailed error messages

## When to Refer Back to This Guide

Bookmark this page and come back when you:

- 📌 Need to update your Aztec installation
- 📌 Want to enable client-side proving for performance testing
- 📌 Need to set up multiple PXEs for multi-user testing
- 📌 Encounter version mismatch errors
- 📌 Want to check what version of example contracts to reference

## Next Steps

Now that you understand how to manage your Sandbox environment, let's make your coding experience even better:

**Up Next:**
- **Install Noir LSP** - Get syntax highlighting, error checking, and autocomplete in your editor
- **Try the Boilerplate** - Start with a pre-configured project structure

**Remember:** The Sandbox is your development playground. Don't be afraid to experiment, break things, and reset! That's exactly what it's designed for.

---

**Ready to enhance your editor?** Continue to [Installing the Noir Language Server](./4_installing_noir_lsp.md) to set up your IDE for writing Aztec contracts.