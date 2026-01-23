---
title: Networks
keywords: [Aztec, Networks, Ignition, Testnet, Devnet, Mainnet]
id: networks
description: "Connect to Aztec Networks: Ignition, Testnet, and Devnet - choose the right network for your use case."
---

# Aztec Networks Overview

The Aztec Protocol operates across multiple networks, each serving specific purposes and audiences. This guide provides essential technical information for connecting to each network.

Not sure which network to use? Jump to our [Network Selection Guide](#network-selection-guide).

## Network Technical Information

| Parameter | Ignition (Mainnet) | Testnet | Devnet |
|-----------|-------------------|---------|--------|
| **Version** | `2.1.9` | TBD | `3.0.0-devnet.6-patch.1` |
| **L1 Chain ID** | `1` (Mainnet) | `11155111` (Sepolia) | `11155111` (Sepolia) |
| **Rollup Version** | `0` | `2500495677` | `1647720761` |
| **RPC Endpoint** | N/A | `https://rpc.testnet.aztec-labs.com` | `https://devnet-6.aztec-labs.com/` |
| **Bootnodes** | [http://static.aztec.network/mainnet/bootnodes.json](http://static.aztec.network/mainnet/bootnodes.json) | [http://static.aztec.network/testnet/bootnodes.json](http://static.aztec.network/testnet/bootnodes.json) | N/A |
| **Block Explorer** | [Aztecscan](https://aztecscan.xyz), [Aztecexplorer](https://aztecexplorer.xyz/) | [Aztecscan](https://testnet.aztecscan.xyz), [Aztecexplorer](https://aztecexplorer.xyz/) | [Aztecscan](https://devnet.aztecscan.xyz), [Aztecexplorer](https://aztecexplorer.xyz/) |
| **Getting Started** | [Run a sequencer →](/network/setup/sequencer_management) | [Run a node →](/network/setup/running_a_node) | [Build on Devnet →](/developers/getting_started_on_devnet) |

## Contract Addresses

### L1 Contract Addresses

| Contract Name | Ignition (Mainnet) | Testnet | Devnet |
|---------------|-------------------|---------|--------|
| **Registry** | `0x35b22e09ee0390539439e24f06da43d83f90e298` | `0xa0bfb1b494fb49041e5c6e8c2c1be09cd171c6ba` | `0x548ed380440c3eef42f222ceda1d6770b8999f8c` |
| **Rollup** | `0x603bb2c05d474794ea97805e8de69bccfb3bca12` | `0x66a41cb55f9a1e38a45a2ac8685f12a61fbfab77` | `0x5d84b64b0b2f468df065d8cf01fff88a73238a13` |
| **L1 → L2 Inbox** | `0x15c718c05b8c0dbec4d648b6711d6ce8793969ee` | `0x59f588603d55a45dd3e57d50403c7c359a39bfc9` | `0x8ea98d35d7712ca236ac7a2b2f47d9fb5c9154e8` |
| **L2 → L1 Outbox** | `0xf006c41097861afeb18b05e586b921c081411ee9` | `0x5fe98f5a4de64f7b5920b038cd32937ca30bab32` | `0x6628f5648dcee4ee4c3262ed35a995039cadb669` |
| **Fee Juice** | `0xa27ec0006e59f245217ff08cd52a7e8b169e62d2` | `0x762c132040fda6183066fa3b14d985ee55aa3c18` | `0x543a5f9ae03f0551ee236edf51987133fb3da3e2` |
| **Staking Asset** | `0xa27ec0006e59f245217ff08cd52a7e8b169e62d2` | `0x5595cb9ed193cac2c0bc5393313bc6115817954b` | `0x3dae418ad4dbd49e00215d24079a10ac3bc9ef4f` |
| **Fee Juice Portal** | `0xe05dc9d5969272831757181fff1532b066254bf1` | `0x4fc4ec3f09b77b20ea5d995261c4bef45a2c4d6d` | `0x5eee7cb811f638b70fe1a04d2318530c55d7bd87` |
| **Coin Issuer** | `0x02fadf157d551aa6d761b2a2237d03af68e41ca6` | `0xe05d0a62045b4237556c1ec423e59eea9a24eaee` | `0xe4805eda5e880355ff4ded78dcf38ae6077b5dba` |
| **Reward Distributor** | `0x3d6a1b00c830c5f278fc5dfb3f6ff0b74db6dfe0` | `0x030d2780e70f085c31d490268d3900d4cea16606` | `0x9417a0ee4fc66079a32aa7103b2a3d2dc2606dbd` |
| **Governance Proposer** | `0x06ef1dcf87e419c48b94a331b252819fadbd63ef` | `0x01c7d4ca153748d2377968fef22894cb162e9480` | `0x7c5f4cec86ef9a920a8fd03d5a01059e32fccb9a` |
| **Governance** | `0x1102471eb3378fee427121c9efcea452e4b6b75e` | `0xcaf7447721447b22cd0076ac7c63877c3afd329f` | `0x26af139c092172e5a4ab9a9d7ddeed41c1d68bc7` |
| **Governance Staking Escrow** | `0xa92ecfd0e70c9cd5e5cd76c50af0f7da93567a4f` | `0xb6a38a51a6c1de9012f9d8ea9745ef957212eaac` | `0xc5cb82799169bb08a20ede20e5b57f337c735ac4` |
| **Staking Registry** | `0x042dF8f42790d6943F41C25C2132400fd727f452` | `0xc3860c45e5F0b1eF3000dbF93149756f16928ADB` | TBD |

### L2 Contract Addresses

| Contract Name | Ignition (Mainnet) | Testnet | Devnet |
|---------------|-------------------|---------|--------|
| **Instance Registry** | N/A | `0x0000000000000000000000000000000000000000000000000000000000000002` | `0x0000000000000000000000000000000000000000000000000000000000000002` |
| **Class Registry** | N/A | `0x0000000000000000000000000000000000000000000000000000000000000003` | `0x0000000000000000000000000000000000000000000000000000000000000003` |
| **MultiCall Entrypoint** | N/A | `0x0000000000000000000000000000000000000000000000000000000000000004` | `0x0000000000000000000000000000000000000000000000000000000000000004` |
| **Fee Juice** | N/A | `0x0000000000000000000000000000000000000000000000000000000000000005` | `0x0000000000000000000000000000000000000000000000000000000000000005` |
| **SponsoredFPC** | N/A | TBD | `0x1586f476995be97f07ebd415340a14be48dc28c6c661cc6bdddb80ae790caa4e` |

## Governance Parameters

| Parameter | Ignition (Mainnet) | Testnet | Devnet |
|-----------|-------------------|---------|--------|
| **Proposer Quorum** | 600/1000 | 60/100 | N/A |
| **Voting Delay** | 3 days | 12 hours | N/A |
| **Voting Duration** | 7 days | 24 hours | N/A |
| **Execution Delay** | 7 days | 12 hours | N/A |
| **Slashing Quorum** | 65% | 33% | N/A |
| **Slashing Round Size** | 128 epochs | 64 epochs | N/A |

<!-- ## Performance & Timing

| Metric | Ignition (Mainnet) | Testnet | Devnet |
|--------|-------------------|---------|--------|
| **Block Time** | N/A | TBD | ~36 seconds |
| **L1→L2 Message Time** | N/A | TBD | ~2 minutes |
| **L2→L1 Finalization** | N/A | TBD | ~30 minutes |
| **Transaction Proving** | N/A | TBD | Yes (Labs) | -->

## Use Case Suitability

| Use Case | Ignition (Mainnet) | Testnet | Devnet |
|----------|-------------------|---------|--------|
| **App Development** | ❌ | ✅ | ✅ Recommended |
| **Sequencer Testing** | ✅ | ✅ | ❌ |
| **Governance Testing** | ✅ | ✅ | ❌ |

---

## Network Selection Guide

### Ignition (Mainnet - Phase 1)

Ignition is the Aztec **mainnet** in its first operational phase, focusing on establishing governance and network infrastructure.

#### Overview

Ignition is currently configured with a gas limit of 0, meaning no user transactions are being executed. However, governance and networking infrastructure are fully active and being tested. This network is connected to Ethereum mainnet and requires real stakes for participation.

**Target Users:**
- Validators who want to contribute to the decentralized Aztec Network
- Governance participants
- Infrastructure operators preparing for full mainnet

**Key Features:**
- Governance system fully operational
- Staking required for sequencer participation
- Connected to Ethereum Mainnet
- No user transaction execution

---

### Testnet

The Aztec Testnet provides a decentralized testing environment that closely mirrors production conditions.

#### Overview

Testnet operates as a fully decentralized network with multiple sequencers. This network is ideal for testing node configurations, governance proposals, and understanding network dynamics without real financial risk.

**Target Users:**
- Future mainnet sequencer operators testing configurations
- Developers requiring production-like testing conditions
- Governance participants practicing proposal workflows
- Infrastructure operators validating monitoring setups

**Key Features:**
- Fully decentralized sequencer set
- Connected to Ethereum Sepolia
- Transactions are proven
- Longer resolution times for features and bugs
- Good environment for testing node operations

:::info
App developers can deploy on Testnet for production-like testing. For faster iteration cycles, consider using Devnet.
:::

---

### Devnet

Devnet provides the most developer-friendly environment for building applications on Aztec.

#### Overview

Devnet is a centralized network operated by Aztec Labs, designed for rapid development and testing. It offers the latest Aztec package versions and quick iteration cycles, making it ideal for application developers.

**Target Users:**
- Application developers building on Aztec
- Teams testing smart contracts and dApps
- Developers learning Aztec development

**Key Features:**
- Centralized sequencer
- Latest package versions available first
- Fast bug fixes and feature updates

## Next Steps

Based on your use case:

- **Building an application?** Start with [Devnet Getting Started](/developers/getting_started_on_devnet)
- **Running infrastructure?** Review [Network Operator Guide](/network/)
- **Joining as validator?** See [Sequencer Management](/network/setup/sequencer_management)
