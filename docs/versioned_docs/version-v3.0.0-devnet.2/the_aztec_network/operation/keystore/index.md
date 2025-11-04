---
id: advanced_keystore_guide
sidebar_position: 2
title: Advanced Keystore Usage
description: Learn how to configure keystores with remote signers, mnemonics, JSON V3 keystores, and multiple publishers for enhanced security and flexibility.
---

## Overview

The keystore manages private keys and addresses for your Aztec sequencer or prover. This guide covers advanced keystore configurations including secure key storage methods, multi-account setups, and production deployment patterns.

## Prerequisites

Before proceeding, you should:

- Be familiar with running a sequencer or prover node
- Understand the basic keystore structure from the [sequencer setup guide](../../setup/sequencer_management.md)
- Have access to appropriate key management infrastructure (if using remote signers)

## Understanding Keystore Roles

The keystore manages different types of keys depending on your node type. Understanding these roles helps you configure the right keys for your needs.

### Sequencer Keys

When running a sequencer, you configure these keys and addresses:

- **Attester** (required): Your sequencer's identity. This key signs block proposals and attestations. The corresponding Ethereum address uniquely identifies your sequencer on the network.
- **Publisher** (optional): Submits block proposals to L1. Defaults to using the attester key if not specified. Must be funded with at least 0.1 ETH.
- **Coinbase** (optional): Ethereum address that receives L1 block rewards. Defaults to the attester address if not set.
- **Fee Recipient** (required): Aztec address that receives unburnt L2 transaction fees from blocks you produce.

### Prover Keys

Prover nodes use a simpler configuration:

- **Prover ID**: Ethereum address identifying your prover and receiving rewards.
- **Publisher**: Submits proof transactions to L1. Must be funded with ETH for gas costs.

### Slasher Keys

If you're running a slasher to monitor the network:

- **Slasher**: Key used to create slash payloads on L1 when detecting sequencer misbehavior.

## What This Guide Covers

This guide walks you through advanced keystore configurations in three parts:

### 1. Key Storage Methods

Learn about different ways to store and access private keys:

- Inline private keys (for testing)
- Remote signers with Web3Signer (recommended for production)
- JSON V3 encrypted keystores
- BIP44 mnemonic derivation

See [Key Storage Methods](./storage_methods.md) for detailed instructions.

### 2. Advanced Configuration Patterns

Explore complex deployment scenarios:

- Using multiple publisher accounts for load distribution
- Running multiple sequencers on a single node
- Infrastructure provider configurations
- High availability setups

See [Advanced Configuration Patterns](./advanced_patterns.md) for examples.

### 3. Troubleshooting

Get help with common issues:

- Keystore loading failures
- Key format validation
- Security best practices
- Permission problems

See [Troubleshooting](./troubleshooting.md) for solutions.

## Getting Started

Start with the [Key Storage Methods](./storage_methods.md) guide to understand your options for storing keys securely. Once you're comfortable with the basics, explore the [Advanced Configuration Patterns](./advanced_patterns.md) guide for more complex scenarios.

For production deployments, we strongly recommend using remote signers or encrypted keystores instead of inline private keys.
