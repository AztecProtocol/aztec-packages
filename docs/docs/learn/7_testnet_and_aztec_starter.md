---
title: "Testnet and Aztec Starter"
description: "Learn about the testnet and Aztec Starter."
tags: [testnet, aztec-starter]
---

Now that you've learned the fundamentals of Aztec development, you're ready to deploy your contracts and interact with the live network. Let's explore two essential resources: the Aztec testnet and the aztec-starter repository.

## What is the Testnet?

The Aztec testnet is a live test network where you can deploy and test your contracts in a real-world environment before deploying to mainnet. It's a fully functional Aztec network running on Ethereum's Sepolia testnet, allowing you to:

- Deploy and interact with contracts without using real funds
- Test your applications in a production-like environment
- Experiment with network features and transaction flows
- Get familiar with deployment processes and tooling

You can explore the testnet and find connection details in the [testnet guide](../try_testnet.md).

## The Aztec Starter Repository

The [aztec-starter repository](https://github.com/AztecProtocol/aztec-starter) is your go-to reference for building on Aztec. Think of it as a comprehensive starter kit that demonstrates best practices and provides ready-to-use examples for common development tasks.

### What's Inside

The repository includes:

- **Example Contract**: An Easy Private Voting contract (`src/main.nr`) that demonstrates private state management and contract interactions
- **Comprehensive Scripts**: Ready-to-use TypeScript scripts for common operations like:
  - Deploying Schnorr accounts
  - Deploying contracts to both sandbox and testnet
  - Demonstrating different fee payment methods
  - Profiling transaction performance
  - Interacting with deployed contracts
- **Complete Tests**: Integration tests showing how to test your contracts properly
- **Environment Configuration**: Examples of how to configure your project for both local sandbox and testnet deployments

### Using the Aztec Starter

The aztec-starter is designed to be both a learning resource and a practical template. You can:

1. **Reference it** when you're unsure how to implement a specific feature
2. **Copy scripts** to bootstrap common operations in your own project
3. **Study the contracts** to understand best practices for private contract development
4. **Use it as a template** by forking it and building your own project on top

For testnet deployments specifically, check out the [`testnet` branch](https://github.com/AztecProtocol/aztec-starter/tree/testnet), which includes configuration and examples tailored for deploying to the live testnet.

### Next Steps

Ready to try it out? Head over to the [getting started on testnet guide](../developers/getting_started_on_testnet.md) to deploy your first contract to the Aztec testnet.
