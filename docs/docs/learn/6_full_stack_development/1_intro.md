---
title: "Introduction to Full-Stack Development"
description: "Learn how to build complete full-stack applications on Aztec by connecting frontend interfaces to your smart contracts"
tags: [full-stack, development, aztec.js, wallet]
sidebar_position: 1
---

Congratulations on making it this far in your learning journey! You've mastered the concepts of privacy, understood how Aztec works under the hood, set up your development environment, and learned to write smart contracts in Noir. Now comes the exciting part - bringing your contracts to life by building full-stack applications that users can actually interact with!

Think back to when you learned to write smart contracts. You could deploy them and call functions using command-line tools or test scripts, but that's not how real users want to interact with your application. They want intuitive interfaces, wallet connections, transaction confirmations, and smooth user experiences. That's exactly what you'll learn to build in this module.

## What You'll Learn

In this module, you'll bridge the gap between your Aztec smart contracts and real-world user interfaces. You'll discover how to use Aztec.js - the TypeScript library that makes interacting with Aztec as straightforward as working with any modern web API.

By the end of this module, you'll be able to:

1. **Connect to the Aztec Network** - Set up your application to communicate with the Aztec sandbox or testnet, creating the foundation for all user interactions.

2. **Connect to Wallets** - Integrate with Aztec-compatible wallets, allowing users to authenticate and authorize transactions without exposing their private keys to your application.

3. **Manage User Accounts** - Create new accounts, retrieve account information, and handle the complexities of Aztec's account abstraction system seamlessly.

4. **Send Transactions** - Execute both private and public functions from your frontend, handling the full transaction lifecycle from submission to confirmation.

5. **Simulate Functions** - Query contract state and preview transaction results without actually executing transactions, providing users with instant feedback.

6. **Handle Fee Payments** - Implement various fee payment strategies, from simple user-paid fees to sophisticated sponsored transaction patterns that improve user experience.

7. **Use Authentication Witnesses (AuthWit)** - Enable secure delegation of permissions, allowing contracts to act on behalf of users in a controlled, privacy-preserving way.

## Why Full-Stack Development Matters

You might be thinking, "Can't I just use the same patterns I know from Ethereum?" While some concepts transfer over, Aztec's privacy features require some new approaches:

- **Privacy Considerations**: Your frontend needs to handle encrypted notes, private state, and ensure sensitive information doesn't leak through UI/UX patterns.

- **Wallet Integration**: Unlike Ethereum where everything happens onchain, your application needs to coordinate with the user's wallet for private operations. Wallets are responsible for interacting with the user's private execution environment.

- **Transaction Flow**: The hybrid public/private execution model affects how you structure user interactions and provide feedback.

Don't worry if this sounds complex - we'll guide you through each concept step by step, with practical examples you can experiment with immediately!

## The Tools You'll Use

### Aztec.js

Aztec.js is your primary tool for full-stack development. It's a comprehensive TypeScript/JavaScript library that provides:

- **Wallet Abstractions**: Work with different wallet types through a unified interface and manages interactions with the Private Execution Environment
- **Contract Interaction**: Deploy contracts and call functions with a clean, promise-based API
- **Type Safety**: Full TypeScript support with auto-generated contract types

Think of Aztec.js as your bridge between the user's browser and the Aztec network. It handles all the complexity of zero-knowledge proofs, encryption, and network communication, letting you focus on building great user experiences.

### Development Flow

Here's the typical flow for building a full-stack Aztec application:

1. **Write and Deploy Contracts** (You've already learned this in Module 5!)
2. **Generate TypeScript Bindings** - Automatically create type-safe contract interfaces
3. **Connect Your Frontend** - Use Aztec.js to establish network connections
4. **Implement User Features** - Build UI components that interact with your contracts
5. **Test Thoroughly** - Ensure your application handles all edge cases gracefully
6. **Deploy to a network** - Test your application on the sandbox or take your application live on the Aztec testnet

Throughout this module, we'll follow this flow, showing you not just the "what" but also the "why" and "when" of each step.

## What This Module Covers

We've structured this module to take you from connection basics to advanced patterns:

**Getting Connected** - First, you'll learn how to connect to the sandbox and testnet, establishing the foundation for all further development.

**Wallet Integration** - Next, you'll integrate with Aztec wallets, enabling users to securely authenticate and authorize transactions.

**Account Operations** - You'll learn to create accounts, manage keys, and handle the unique aspects of Aztec's account model.

**Transaction Patterns** - Then you'll master sending transactions, both simple calls and complex multi-step operations.

**Advanced Features** - Finally, you'll explore fee payment strategies, function simulation, and authentication witnesses.

## Learning Approach

This module is hands-on and practical. Each section includes:

- **Working Code Examples**: Real, runnable code you can copy and adapt
- **Common Patterns**: Solutions to typical challenges you'll face
- **Best Practices**: Guidelines for building secure, efficient applications
- **Troubleshooting**: Help with common issues and error messages

We'll use a consistent example throughout - building a simple but complete application that demonstrates each concept in context. This way, you'll see how all the pieces fit together, not just isolated snippets.

## Prerequisites

Before diving into this module, make sure you're comfortable with:

- **Modules 1-5**: You should understand Aztec's architecture and be able to write basic smart contracts
- **TypeScript/JavaScript**: Basic familiarity with modern JavaScript and promises
- **Web Development**: Understanding of how web applications work (HTTP, async operations, etc.)
- **React (helpful but not required)**: Our examples use React, but the patterns apply to any framework

If you're rusty on TypeScript or web development, don't worry! The examples are straightforward, and we'll explain everything as we go.

## Your First Full-Stack Application

By the end of this module, you'll have built a complete application that:

- Connects to the Aztec network
- Allows users to connect their wallets
- Displays private balances (that only the user can see!)
- Enables private transfers between accounts
- Handles public state updates
- Provides clear feedback throughout the transaction lifecycle

This might sound ambitious, but remember - you've already learned the hard parts! Understanding how Aztec works (Modules 1-3) and writing smart contracts (Module 5) were the challenging conceptual leaps. Now you're applying that knowledge with practical tools that are designed to make development straightforward.

## Getting Help

As you work through this module, remember:

- **Experiment Freely**: The sandbox environment is perfect for trying things without risk
- **Check the Aztec.js Documentation**: Comprehensive API reference is always available
- **Join the Community**: Other developers in Discord are happy to help with questions
- **Reference the Aztec Starter**: The aztec-starter repository has complete examples

Let's get started! Your first step is learning how to connect your application to the Aztec network. Click through to the next section, and let's build something amazing together!
