---
title: Getting Started on Sandbox
description: Guide for developers to get started with the Aztec sandbox, including account creation and contract deployment.
tags: [sandbox, testnet]
source: "developers/getting_started_on_sandbox.md"
---

## Welcome to Hands-On Development!

Now that you've installed the Aztec Sandbox in the previous lesson, let's put it to work! In this guide, you'll go from zero to deploying your first smart contract and interacting with it using the Aztec CLI tools.

This is where theory meets practice. You'll use the same tools that professional Aztec developers use every day to build production applications. Don't worry if you don't understand every detail yet - the goal here is to get comfortable with the workflow and see the complete development cycle in action.

## What You'll Learn

By the end of this hands-on guide, you'll know how to:

1. **Create and manage accounts** on your local Aztec Sandbox
2. **Deploy smart contracts** using the Aztec CLI
3. **Interact with contracts** by calling their functions
4. **Work with hybrid state** - moving tokens between public and private state
5. **Use the wallet CLI** to send transactions and query state

This guide uses a Token contract as an example because tokens are familiar, but the workflows you learn here apply to any Aztec smart contract you'll build.

## Prerequisites

Before starting this guide, make sure you have:

- ✅ Completed the [Introduction](./1_intro.md) and installed the Aztec tools
- ✅ Docker running on your machine
- ✅ The Aztec Sandbox running (`aztec start --sandbox`)
- ✅ A terminal window open and ready to go

:::tip Ready to Start?
If your sandbox isn't running yet, open a terminal and run `aztec start --sandbox`. Wait for the message "Aztec Server listening on port 8080" before proceeding.
:::

---

#include_code getting_started_on_sandbox /docs/docs/developers/getting_started_on_sandbox.md raw

---

## What You Just Accomplished

Congratulations! You just completed your first full development cycle on Aztec:

- **Created accounts** - You made both test accounts and your own account
- **Deployed a contract** - The Token contract is now live on your local Aztec network
- **Executed transactions** - You minted tokens and moved them between public and private state
- **Queried state** - You checked balances in both public and private storage
- **Experienced privacy** - You saw hybrid state in action: public minting, private transfers

### Understanding What Happened

Let's connect this to what you learned in Modules 1-3:

**From Module 2 (Privacy Mindset):**

- When you called `transfer_to_private`, you saw the UTXO-based note model in action
- Your private balance uses notes (remember those from Module 2?), not a simple account balance
- The public balance uses the account model - direct read/write like Ethereum

**From Module 3 (Transaction Lifecycle):**

- Each `aztec-wallet send` command triggered the full transaction lifecycle
- Your PXE executed private functions locally and generated proofs
- The sequencer processed transactions and updated state trees
- You experienced both private execution (on your device) and public execution (on the sequencer)

**Hybrid State Magic:**

- Public state: Transparent, everyone can see balances
- Private state: Only you can see your notes
- You moved tokens between these two worlds seamlessly!

## Next Steps in Your Learning Journey

Now that you've experienced the complete workflow, you're ready to dive deeper:

**Immediate Next Steps:**

1. **Explore the Sandbox** - Learn about advanced features like versioning and proving (next lesson)
2. **Set up your editor** - Install the Noir language support for writing contracts (Lesson 4.4)
3. **Try the boilerplate** - Get a pre-configured project to experiment with (Lesson 4.5)

**Coming Up in Module 5:**

- **Contract development** - Learn to write your own smart contracts in Noir
- **Private storage** - Deep dive into notes, commitments, and nullifiers
- **Advanced patterns** - Build more complex applications with privacy guarantees

### Keep Experimenting!

The Sandbox is your playground. Try these experiments to deepen your understanding:

**Easy:**

- Mint more tokens to different amounts
- Transfer tokens between the test accounts
- Check balances after each operation

**Medium:**

- Create multiple accounts and transfer tokens between them
- Try transferring more tokens than you have (what happens?)
- Transfer all your public tokens to private, then back to public

**Challenging:**

- Deploy a second token with different parameters
- Transfer tokens between both token contracts
- Explore the `aztec-wallet` help to discover other commands (`aztec-wallet --help`)

Remember: You can reset everything anytime by stopping and restarting the Sandbox. Experiment freely - that's what local development is for!

---

**Ready to learn more about the Sandbox?** Continue to the next lesson to explore versioning, updates, and advanced features like client-side proving.
