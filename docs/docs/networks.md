---
title: Networks
keywords: [Aztec, Networks, Ignition, Testnet, Mainnet]
id: networks
description: "Connect to Aztec Networks: Ignition and Testnet — choose the right network for your use case."
---

# Aztec Networks Overview

The Aztec Protocol operates across multiple networks, each serving specific purposes and audiences. This guide provides essential technical information for connecting to each network.

Not sure which network to use? Jump to our [Network Selection Guide](#network-selection-guide).

## Network Technical Information

| Parameter | Ignition (Mainnet) | Testnet |
|-----------|-------------------|---------|
| **Version** | `2.1.11` | `4.1.0-rc.2` |
| **L1 Chain ID** | `1` (Mainnet) | `11155111` (Sepolia) |
| **Rollup Version** | `0` | `4127419662` |
| **RPC Endpoint** | N/A | `https://rpc.testnet.aztec-labs.com` |
| **Bootnodes** | [http://static.aztec.network/mainnet/bootnodes.json](http://static.aztec.network/mainnet/bootnodes.json) | [http://static.aztec.network/testnet/bootnodes.json](http://static.aztec.network/testnet/bootnodes.json) |
| **Block Explorer** | [Aztecscan](https://aztecscan.xyz), [Aztecexplorer](https://aztecexplorer.xyz/?network=mainnet) | [Aztecscan](https://testnet.aztecscan.xyz), [Aztecexplorer](https://aztecexplorer.xyz/?network=testnet) |
| **Getting Started** | [Run a sequencer →](/operate/operators/setup/sequencer_management) | [Run a node →](/operate/operators/setup/running_a_node) |

:::tip Network Roles (Post-Alpha)
**Testnet is your production path.** It's decentralized, live, and stable — treat it as your staging environment for Alpha. If you want to deploy on Alpha, validate on Testnet first. Note: Sponsored FPC is not available on Testnet.
:::

## Contract Addresses

### L1 Contract Addresses

| Contract Name | Ignition (Mainnet) | Testnet |
|---------------|-------------------|---------|
| **Registry** | [`0x35b22e09ee0390539439e24f06da43d83f90e298`](https://etherscan.io/address/0x35b22e09ee0390539439e24f06da43d83f90e298) | [`0xa0bfb1b494fb49041e5c6e8c2c1be09cd171c6ba`](https://sepolia.etherscan.io/address/0xa0bfb1b494fb49041e5c6e8c2c1be09cd171c6ba) |
| **Rollup** | [`0x603bb2c05d474794ea97805e8de69bccfb3bca12`](https://etherscan.io/address/0x603bb2c05d474794ea97805e8de69bccfb3bca12) | [`0xf6D0D42aCE06829bECB78C74F49879528fC632c1`](https://sepolia.etherscan.io/address/0xf6D0D42aCE06829bECB78C74F49879528fC632c1) |
| **L1 → L2 Inbox** | [`0x15c718c05b8c0dbec4d648b6711d6ce8793969ee`](https://etherscan.io/address/0x15c718c05b8c0dbec4d648b6711d6ce8793969ee) | [`0xF1bB424AC888Aa239F1E658B5BdDabc65a1c94E6`](https://sepolia.etherscan.io/address/0xF1bB424AC888Aa239F1E658B5BdDabc65a1c94E6) |
| **L2 → L1 Outbox** | [`0xf006c41097861afeb18b05e586b921c081411ee9`](https://etherscan.io/address/0xf006c41097861afeb18b05e586b921c081411ee9) | [`0x5fE63c32b7ca20445e813bDb1019f1FFC5f52376`](https://sepolia.etherscan.io/address/0x5fE63c32b7ca20445e813bDb1019f1FFC5f52376) |
| **Fee Juice** | [`0xa27ec0006e59f245217ff08cd52a7e8b169e62d2`](https://etherscan.io/address/0xa27ec0006e59f245217ff08cd52a7e8b169e62d2) | [`0x762c132040fda6183066fa3b14d985ee55aa3c18`](https://sepolia.etherscan.io/address/0x762c132040fda6183066fa3b14d985ee55aa3c18) |
| **Staking Asset** | [`0xa27ec0006e59f245217ff08cd52a7e8b169e62d2`](https://etherscan.io/address/0xa27ec0006e59f245217ff08cd52a7e8b169e62d2) | [`0x5595cb9ed193cac2c0bc5393313bc6115817954b`](https://sepolia.etherscan.io/address/0x5595cb9ed193cac2c0bc5393313bc6115817954b) |
| **Fee Juice Portal** | [`0xe05dc9d5969272831757181fff1532b066254bf1`](https://etherscan.io/address/0xe05dc9d5969272831757181fff1532b066254bf1) | [`0xd3361019e40026ce8a9745c19e67fd3acc10d596`](https://sepolia.etherscan.io/address/0xd3361019e40026ce8a9745c19e67fd3acc10d596) |
| **Fee Asset Handler** | N/A | [`0x5602c39a6e9c5ace589f64f754927bcda4f4bfc9`](https://sepolia.etherscan.io/address/0x5602c39a6e9c5ace589f64f754927bcda4f4bfc9) |
| **Coin Issuer** | [`0x02fadf157d551aa6d761b2a2237d03af68e41ca6`](https://etherscan.io/address/0x02fadf157d551aa6d761b2a2237d03af68e41ca6) | [`0xe05d0a62045b4237556c1ec423e59eea9a24eaee`](https://sepolia.etherscan.io/address/0xe05d0a62045b4237556c1ec423e59eea9a24eaee) |
| **Reward Distributor** | [`0x3d6a1b00c830c5f278fc5dfb3f6ff0b74db6dfe0`](https://etherscan.io/address/0x3d6a1b00c830c5f278fc5dfb3f6ff0b74db6dfe0) | [`0x030d2780e70f085c31d490268d3900d4cea16606`](https://sepolia.etherscan.io/address/0x030d2780e70f085c31d490268d3900d4cea16606) |
| **Reward Booster** | [`0x1cbb707bd7b4fd2bced6d96d84372fb428e93d80`](https://etherscan.io/address/0x1cbb707bd7b4fd2bced6d96d84372fb428e93d80) | [`0x49711056D1EaDcDD3F2eF676DC8EA3F924fB916c`](https://sepolia.etherscan.io/address/0x49711056D1EaDcDD3F2eF676DC8EA3F924fB916c) |
| **Governance Proposer** | [`0x06ef1dcf87e419c48b94a331b252819fadbd63ef`](https://etherscan.io/address/0x06ef1dcf87e419c48b94a331b252819fadbd63ef) | [`0x01c7d4ca153748d2377968fef22894cb162e9480`](https://sepolia.etherscan.io/address/0x01c7d4ca153748d2377968fef22894cb162e9480) |
| **Governance** | [`0x1102471eb3378fee427121c9efcea452e4b6b75e`](https://etherscan.io/address/0x1102471eb3378fee427121c9efcea452e4b6b75e) | [`0xcaf7447721447b22cd0076ac7c63877c3afd329f`](https://sepolia.etherscan.io/address/0xcaf7447721447b22cd0076ac7c63877c3afd329f) |
| **Governance Staking Escrow** | [`0xa92ecfd0e70c9cd5e5cd76c50af0f7da93567a4f`](https://etherscan.io/address/0xa92ecfd0e70c9cd5e5cd76c50af0f7da93567a4f) | [`0xb6a38a51a6c1de9012f9d8ea9745ef957212eaac`](https://sepolia.etherscan.io/address/0xb6a38a51a6c1de9012f9d8ea9745ef957212eaac) |
| **Staking Registry** | [`0x042dF8f42790d6943F41C25C2132400fd727f452`](https://etherscan.io/address/0x042dF8f42790d6943F41C25C2132400fd727f452) | [`0xC6EcC1832c8BF6a41c927BEb4E9ec610FBeDd1C2`](https://sepolia.etherscan.io/address/0xC6EcC1832c8BF6a41c927BEb4E9ec610FBeDd1C2) |
| **Slash Factory** | N/A | [`0x9CF4a0094c8696d5110dd0f0cF3FA5deA174BB17`](https://sepolia.etherscan.io/address/0x9CF4a0094c8696d5110dd0f0cF3FA5deA174BB17) |
| **Slasher** | [`0x64E6e9Bb9f1E33D319578B9f8a9C719Ca6D46eBb`](https://etherscan.io/address/0x64E6e9Bb9f1E33D319578B9f8a9C719Ca6D46eBb) | [`0xCF750B724558098E5db67B651f03a31AE2b252f4`](https://sepolia.etherscan.io/address/0xCF750B724558098E5db67B651f03a31AE2b252f4) |
| **Tally Slashing Proposer** | [`0xa4a38fD0108C00983E75616b638Ff3321FD26958`](https://etherscan.io/address/0xa4a38fD0108C00983E75616b638Ff3321FD26958) | [`0x158eCC4B24675dc399031c7D144786e3da2060A8`](https://sepolia.etherscan.io/address/0x158eCC4B24675dc399031c7D144786e3da2060A8) |
| **Honk Verifier** | [`0x70aedda427f26480d240bc0f4308cedec8d31348`](https://etherscan.io/address/0x70aedda427f26480d240bc0f4308cedec8d31348) | [`0x800FbC88054ba6c228B7d822F1DCAf4d627E8F97`](https://sepolia.etherscan.io/address/0x800FbC88054ba6c228B7d822F1DCAf4d627E8F97) |
| **Register New Rollup Version Payload** | N/A | [`0x11f7Ab2324CA94af929A388477a7959E0108C3d6`](https://sepolia.etherscan.io/address/0x11f7Ab2324CA94af929A388477a7959E0108C3d6) |
| **Slash Payload Cloneable** | [`0xAA43220b7eb7c8Ffe75bc9C483f3C07b0a55B445`](https://etherscan.io/address/0xAA43220b7eb7c8Ffe75bc9C483f3C07b0a55B445) | [`0xe66d9eeBfF5490E6bfA263cF08028dE7d265321F`](https://sepolia.etherscan.io/address/0xe66d9eeBfF5490E6bfA263cF08028dE7d265321F) |

### L2 Contract Addresses

| Contract Name | Ignition (Mainnet) | Testnet |
|---------------|-------------------|---------|
| **Instance Registry** | N/A | `0x0000000000000000000000000000000000000000000000000000000000000002` |
| **Class Registry** | N/A | `0x0000000000000000000000000000000000000000000000000000000000000003` |
| **MultiCall Entrypoint** | N/A | `0x0000000000000000000000000000000000000000000000000000000000000004` |
| **Fee Juice** | N/A | `0x0000000000000000000000000000000000000000000000000000000000000005` |
| **SponsoredFPC** | N/A | Not deployed |

## Governance Parameters

| Parameter | Ignition (Mainnet) | Testnet |
|-----------|-------------------|---------|
| **Proposer Quorum** | 600/1000 | 60/100 |
| **Voting Delay** | 3 days | 12 hours |
| **Voting Duration** | 7 days | 24 hours |
| **Execution Delay** | 30 days | 12 hours |
| **Slashing Quorum** | 65% | 33% |
| **Slashing Round Size** | 128 epochs | 64 epochs |

---

## Network Selection Guide

### Ignition (Mainnet - Phase 1)

Ignition is the Aztec **mainnet** in its first operational phase, focusing on establishing governance and network infrastructure. Ignition is live but early — bugs, including critical ones, are expected. For a full explanation of what this means, see the **[Alpha Network](/participate/alpha)** page.

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

Testnet is the production path for Aztec. It operates as a fully decentralized network with multiple sequencers and closely mirrors Alpha conditions. If you plan to deploy on Alpha, Testnet is where you validate your application. Think of it as your staging environment for the real thing.

#### Overview

Testnet is ideal for testing node configurations, governance proposals, and understanding network dynamics without real financial risk.

**Target Users:**
- Future Alpha sequencer operators testing configurations
- Developers requiring production-like testing conditions
- Governance participants practicing proposal workflows
- Infrastructure operators validating monitoring setups

**Key Features:**
- Fully decentralized sequencer set
- Connected to Ethereum Sepolia
- Transactions are proven
- No Sponsored FPC — you must handle fee payment
- Good environment for testing node operations

## Next Steps

Based on your use case:

- **Building an application?** Start with [Getting Started](/developers/getting_started_on_local_network)
- **Running infrastructure?** Review [Network Operator Guide](/operate/operators)
- **Joining as validator?** See [Sequencer Management](/operate/operators/setup/sequencer_management)
