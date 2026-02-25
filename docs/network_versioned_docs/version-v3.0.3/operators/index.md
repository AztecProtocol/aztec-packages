---
title: Operator Guides
description: Run Aztec network infrastructure - nodes, sequencers, provers, and monitoring.
displayed_sidebar: operatorsSidebar
---

# Operating Aztec Infrastructure

This section covers everything you need to run and maintain Aztec network infrastructure. Whether you're running a full node for personal use or operating a professional sequencer, you'll find the guides you need here.

## Getting Started

1. Review the [Prerequisites](./prerequisites.md) to ensure you have the necessary hardware and software
2. [Run a Full Node](./setup/running-a-node.md) - the foundation for all other roles
3. Choose your path: [Sequencer](./setup/sequencer-setup.md) or [Prover](./setup/running-a-prover.md)

## Roles

### Full Node Operator
Run a node to interact with the network, submit transactions, and maintain a copy of the state.
- [Running a Node](./setup/running-a-node.md)
- [Syncing Best Practices](./setup/syncing-best-practices.md)

### Sequencer Operator
Produce blocks, participate in consensus, and earn rewards.
- [Sequencer Setup](./setup/sequencer-setup.md)
- [Registration](./setup/registering-sequencer.md)
- [Governance Participation](./sequencer-management/governance-participation.md)

### Prover Operator
Generate cryptographic proofs for the network.
- [Running a Prover](./setup/running-a-prover.md)

### Staking Provider
Accept delegated stake and operate sequencers on behalf of token holders.
- [Becoming a Staking Provider](./setup/staking-provider.md)

## Operations

- [Monitoring](./monitoring/index.md) - Set up observability for your infrastructure
- [Keystore Management](./keystore/index.md) - Secure key handling
- [Sequencer Management](./sequencer-management/index.md) - Day-to-day operations

## Reference

- [CLI Reference](./reference/cli-reference.md)
- [Node API Reference](./reference/node-api-reference.md)
- [Changelog](./reference/changelog/index.md)

---

:::info Conceptual Background
For background on how the network works, see the [Participate section](/participate).
:::
