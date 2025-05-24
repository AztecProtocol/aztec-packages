---
title: Node.js app that interacts with contracts
sidebar_position: 1
---

In this tutorial we'll go through the steps for building a simple application that interacts with the Aztec Sandbox. We'll be building a console application using Javascript and NodeJS, but you may reuse the same concepts here for a web-based app. All Aztec libraries are written in Typescript and fully typed, so you can use Typescript instead of Javascript to make the most out of its type checker.

:::note
This tutorial is for the sandbox and will need adjustments if deploying to testnet. Install the sandbox [here](../../../../getting_started.md).
:::

This tutorial will focus on environment setup, including creating accounts and deployments, as well as interacting with your contracts. It will not cover [how to write contracts in Noir](../../../../../aztec/smart_contracts_overview.md).

The full code for this tutorial is [available on the `aztec-packages` repository](https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/yarn-project/end-to-end/src/sample-dapp).

## Dependencies

- Linux or OSX environment
- [NodeJS](https://nodejs.org/) version 22.15.0 (minimum ver 20)
- [Aztec Sandbox](../../../../getting_started.md)

## Prerequisites

Basic understanding of NodeJS and Javascript should be enough to follow this tutorial. Along the way, we'll provide links to dig deeper into Aztec concepts as we introduce them.
