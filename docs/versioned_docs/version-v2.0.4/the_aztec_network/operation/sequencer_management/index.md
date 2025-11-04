---
sidebar_position: 3
id: sequencer_management_overview
title: Sequencer Management
description: Learn how to manage your sequencer operations including governance participation, delegated stake, and contract queries.
---

## Overview

Once your sequencer is running, you need to manage its ongoing operations. This guide covers sequencer management tasks including participating in governance, running with delegated stake, and querying contract state to monitor your sequencer's health and performance.

## Prerequisites

Before proceeding, you should:

- Have a running sequencer node (see [Sequencer Setup Guide](../../setup/sequencer_management.md))
- Be familiar with basic sequencer operations
- Have access to Foundry's `cast` tool for contract queries
- Understand your sequencer's role in the network

## Understanding Sequencer Operations

As a sequencer operator, your responsibilities extend beyond simply running a node. You participate in network governance, manage your stake (whether self-funded or delegated), and monitor your sequencer's performance and status on the network.

### Key Management Areas

**Governance Participation**: Sequencers play a crucial role in protocol governance. You signal support for protocol upgrades, vote on proposals, and help shape the network's evolution. Active participation ensures your voice is heard in decisions that affect the protocol.

**Stake Management**: Whether you're using your own stake or operating with delegated stake from others, you need to understand how staking works, monitor your balances, and ensure you maintain sufficient funds for operations.

**Operational Monitoring**: Regular monitoring of your sequencer's status, performance metrics, and onchain state helps you catch issues early and maintain optimal operations.

## What This Guide Covers

This guide walks you through sequencer management in three parts:

### 1. Governance and Proposal Process

Learn how to participate in protocol governance:

- Understanding payloads and the governance lifecycle
- Signaling support for protocol upgrades
- Creating and voting on proposals
- Executing approved changes
- Upgrading your node after governance changes

See [Governance and Proposal Process](./creating_and_voting_on_proposals.md) for detailed instructions.

### 2. Running Delegated Stake

If you're operating a sequencer with delegated stake:

- Understanding the delegated stake model
- Registering as a provider with the Staking Registry
- Managing sequencer identities for delegation
- Updating provider configuration and commission rates
- Monitoring delegator relationships

See [Running Delegated Stake](./running_delegated_stake.md) for setup instructions.

### 3. Useful Commands

Essential contract query commands for operators:

- Finding contract addresses (Registry, Rollup, Governance)
- Querying the sequencer set and individual sequencer status
- Checking governance signals and proposal counts
- Monitoring stake balances and voting power
- Troubleshooting common query issues

See [Useful Commands](./useful_commands.md) for a complete reference.

## Getting Started

Start with the [Useful Commands](./useful_commands.md) guide to learn how to query your sequencer's status and verify it's operating correctly. This helps you establish a baseline for monitoring.

If you're participating in governance, review the [Governance and Proposal Process](./creating_and_voting_on_proposals.md) guide to understand how to signal, vote, and execute proposals.

For operators running with delegated stake, the [Running Delegated Stake](./running_delegated_stake.md) guide walks you through provider registration and management.

## Best Practices

**Monitor Regularly**: Check your sequencer's status, balance, and attestation activity regularly. Set up alerts for critical thresholds like low balances or missed attestations.

**Participate in Governance**: Stay informed about governance proposals and participate in votes that affect your operations. Join the community discussions on Discord to understand proposed changes.

**Maintain Adequate Balances**: Ensure your publisher account always has sufficient ETH (at least 0.1 ETH) to avoid being slashed. Monitor balances and set up automated top-ups if possible.

**Keep Your Node Updated**: When governance proposals pass that require node upgrades, prepare during the execution delay period. Have a plan for coordinated upgrades to minimize downtime.

**Communicate with Delegators**: If you're running with delegated stake, maintain open communication with your delegators about performance, commission changes, and planned maintenance.

## Next Steps

- Query your sequencer status using the [Useful Commands](./useful_commands.md)
- Learn about [governance participation](./creating_and_voting_on_proposals.md) to vote on protocol changes
- Set up [monitoring](../monitoring.md) to track your sequencer's performance
- Join the [Aztec Discord](https://discord.gg/aztec) for operator support and community discussions
