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
| **Version** | `2.1.11` | `4.0.3` | `4.0.0-devnet.2-patch.1` |
| **L1 Chain ID** | `1` (Mainnet) | `11155111` (Sepolia) | `11155111` (Sepolia) |
| **Rollup Version** | `0` | `4181870535` | `615022430` |
| **RPC Endpoint** | N/A | `https://rpc.testnet.aztec-labs.com` | `https://v4-devnet-2.aztec-labs.com/` |
| **Bootnodes** | [http://static.aztec.network/mainnet/bootnodes.json](http://static.aztec.network/mainnet/bootnodes.json) | [http://static.aztec.network/testnet/bootnodes.json](http://static.aztec.network/testnet/bootnodes.json) | N/A |
| **Block Explorer** | [Aztecscan](https://aztecscan.xyz), [Aztecexplorer](https://aztecexplorer.xyz/?network=mainnet) | [Aztecscan](https://testnet.aztecscan.xyz), [Aztecexplorer](https://aztecexplorer.xyz/?network=testnet) | [Aztecscan](https://devnet.aztecscan.xyz), [Aztecexplorer](https://aztecexplorer.xyz/?network=devnet) |
| **Getting Started** | [Run a sequencer →](/operate/operators/setup/sequencer_management) | [Run a node →](/operate/operators/setup/running_a_node) | [Build on Devnet →](/developers/getting_started_on_devnet) |

## Contract Addresses

### L1 Contract Addresses

| Contract Name | Ignition (Mainnet) | Testnet | Devnet |
|---------------|-------------------|---------|--------|
| **Registry** | [`0x35b22e09ee0390539439e24f06da43d83f90e298`](https://etherscan.io/address/0x35b22e09ee0390539439e24f06da43d83f90e298) | [`0xa0bfb1b494fb49041e5c6e8c2c1be09cd171c6ba`](https://sepolia.etherscan.io/address/0xa0bfb1b494fb49041e5c6e8c2c1be09cd171c6ba) | [`0x52945c29d2788ccb076e910509c0449bfcbe29e6`](https://sepolia.etherscan.io/address/0x52945c29d2788ccb076e910509c0449bfcbe29e6) |
| **Rollup** | [`0x603bb2c05d474794ea97805e8de69bccfb3bca12`](https://etherscan.io/address/0x603bb2c05d474794ea97805e8de69bccfb3bca12) | [`0x5932FCb01B6f63550C8bd91055613752480B6455`](https://sepolia.etherscan.io/address/0x5932FCb01B6f63550C8bd91055613752480B6455) | [`0xcd1a7be18501092f3ba8d80ce5629501ba178de0`](https://sepolia.etherscan.io/address/0xcd1a7be18501092f3ba8d80ce5629501ba178de0) |
| **L1 → L2 Inbox** | [`0x15c718c05b8c0dbec4d648b6711d6ce8793969ee`](https://etherscan.io/address/0x15c718c05b8c0dbec4d648b6711d6ce8793969ee) | [`0x9E5314ace905712e05b6F2a34804cb5271619BeD`](https://sepolia.etherscan.io/address/0x9E5314ace905712e05b6F2a34804cb5271619BeD) | [`0xef5730d1e07b306aecbe01400630d61e3ccb68af`](https://sepolia.etherscan.io/address/0xef5730d1e07b306aecbe01400630d61e3ccb68af) |
| **L2 → L1 Outbox** | [`0xf006c41097861afeb18b05e586b921c081411ee9`](https://etherscan.io/address/0xf006c41097861afeb18b05e586b921c081411ee9) | [`0x8e76F0814Dc47b7b945FF69F764c1151771A575d`](https://sepolia.etherscan.io/address/0x8e76F0814Dc47b7b945FF69F764c1151771A575d) | [`0x34fc558b6f97e50149bcc140060bbe3f7d04bc59`](https://sepolia.etherscan.io/address/0x34fc558b6f97e50149bcc140060bbe3f7d04bc59) |
| **Fee Juice** | [`0xa27ec0006e59f245217ff08cd52a7e8b169e62d2`](https://etherscan.io/address/0xa27ec0006e59f245217ff08cd52a7e8b169e62d2) | [`0x762c132040fda6183066fa3b14d985ee55aa3c18`](https://sepolia.etherscan.io/address/0x762c132040fda6183066fa3b14d985ee55aa3c18) | [`0x35d0186d1fd53b72996475d965c5ed171d52b986`](https://sepolia.etherscan.io/address/0x35d0186d1fd53b72996475d965c5ed171d52b986) |
| **Staking Asset** | [`0xa27ec0006e59f245217ff08cd52a7e8b169e62d2`](https://etherscan.io/address/0xa27ec0006e59f245217ff08cd52a7e8b169e62d2) | [`0x5595cb9ed193cac2c0bc5393313bc6115817954b`](https://sepolia.etherscan.io/address/0x5595cb9ed193cac2c0bc5393313bc6115817954b) | [`0x4263376b0d7d0ac46d38b76af4cf8bf93844bc14`](https://sepolia.etherscan.io/address/0x4263376b0d7d0ac46d38b76af4cf8bf93844bc14) |
| **Fee Juice Portal** | [`0xe05dc9d5969272831757181fff1532b066254bf1`](https://etherscan.io/address/0xe05dc9d5969272831757181fff1532b066254bf1) | [`0x72593284F7b01a3931f9b9e62BDc1682d2aeD0b5`](https://sepolia.etherscan.io/address/0x72593284F7b01a3931f9b9e62BDc1682d2aeD0b5) | [`0x516e3f74fd1c19b24da0706d28b5a30578f054ab`](https://sepolia.etherscan.io/address/0x516e3f74fd1c19b24da0706d28b5a30578f054ab) |
| **Fee Asset Handler** | N/A | [`0x5602c39a6e9c5ace589f64f754927bcda4f4bfc9`](https://sepolia.etherscan.io/address/0x5602c39a6e9c5ace589f64f754927bcda4f4bfc9) | [`0xed9c5557d2e0abcc7c7fca958ee4292199413494`](https://sepolia.etherscan.io/address/0xed9c5557d2e0abcc7c7fca958ee4292199413494) |
| **Coin Issuer** | [`0x02fadf157d551aa6d761b2a2237d03af68e41ca6`](https://etherscan.io/address/0x02fadf157d551aa6d761b2a2237d03af68e41ca6) | [`0xe05d0a62045b4237556c1ec423e59eea9a24eaee`](https://sepolia.etherscan.io/address/0xe05d0a62045b4237556c1ec423e59eea9a24eaee) | [`0xc0dcff65de33fe19a95f67ed1b7b9e7bd0a23f5f`](https://sepolia.etherscan.io/address/0xc0dcff65de33fe19a95f67ed1b7b9e7bd0a23f5f) |
| **Reward Distributor** | [`0x3d6a1b00c830c5f278fc5dfb3f6ff0b74db6dfe0`](https://etherscan.io/address/0x3d6a1b00c830c5f278fc5dfb3f6ff0b74db6dfe0) | [`0x030d2780e70f085c31d490268d3900d4cea16606`](https://sepolia.etherscan.io/address/0x030d2780e70f085c31d490268d3900d4cea16606) | [`0x51f13e2131d28c44f9df33a8d0ff0a897eb52eda`](https://sepolia.etherscan.io/address/0x51f13e2131d28c44f9df33a8d0ff0a897eb52eda) |
| **Reward Booster** | [`0x7101a6703491a4d808aeabe9f62bc1dc6a20bdf4`](https://etherscan.io/address/0x7101a6703491a4d808aeabe9f62bc1dc6a20bdf4) | [`0x3174BB532F4696F9769345487BD1305239A430f7`](https://sepolia.etherscan.io/address/0x3174BB532F4696F9769345487BD1305239A430f7) | |
| **Governance Proposer** | [`0x06ef1dcf87e419c48b94a331b252819fadbd63ef`](https://etherscan.io/address/0x06ef1dcf87e419c48b94a331b252819fadbd63ef) | [`0x01c7d4ca153748d2377968fef22894cb162e9480`](https://sepolia.etherscan.io/address/0x01c7d4ca153748d2377968fef22894cb162e9480) | [`0x17f54a1448387de40120f8a2f9949a68a9185c8b`](https://sepolia.etherscan.io/address/0x17f54a1448387de40120f8a2f9949a68a9185c8b) |
| **Governance** | [`0x1102471eb3378fee427121c9efcea452e4b6b75e`](https://etherscan.io/address/0x1102471eb3378fee427121c9efcea452e4b6b75e) | [`0xcaf7447721447b22cd0076ac7c63877c3afd329f`](https://sepolia.etherscan.io/address/0xcaf7447721447b22cd0076ac7c63877c3afd329f) | [`0xfaa29a00987bb2d2ec703edac5ebb24f1ee9de97`](https://sepolia.etherscan.io/address/0xfaa29a00987bb2d2ec703edac5ebb24f1ee9de97) |
| **Governance Staking Escrow** | [`0xa92ecfd0e70c9cd5e5cd76c50af0f7da93567a4f`](https://etherscan.io/address/0xa92ecfd0e70c9cd5e5cd76c50af0f7da93567a4f) | [`0xb6a38a51a6c1de9012f9d8ea9745ef957212eaac`](https://sepolia.etherscan.io/address/0xb6a38a51a6c1de9012f9d8ea9745ef957212eaac) | [`0x5f966c3cbbc12569690ca4250b37bf17fc1b3013`](https://sepolia.etherscan.io/address/0x5f966c3cbbc12569690ca4250b37bf17fc1b3013) |
| **Staking Registry** | [`0x042dF8f42790d6943F41C25C2132400fd727f452`](https://etherscan.io/address/0x042dF8f42790d6943F41C25C2132400fd727f452) | [`0xC6EcC1832c8BF6a41c927BEb4E9ec610FBeDd1C2`](https://sepolia.etherscan.io/address/0xC6EcC1832c8BF6a41c927BEb4E9ec610FBeDd1C2) | |
| **Slash Factory** | N/A | [`0xa3c74BA4a188de43C459E82696EcA2eD16CCB4B3`](https://sepolia.etherscan.io/address/0xa3c74BA4a188de43C459E82696EcA2eD16CCB4B3) | [`0xd4248cbb1fa7228f49b9d314237cde7b2d0f3470`](https://sepolia.etherscan.io/address/0xd4248cbb1fa7228f49b9d314237cde7b2d0f3470) |
| **Slasher** | [`0x91a3745c685c220595b997e53311ebf660144889`](https://etherscan.io/address/0x91a3745c685c220595b997e53311ebf660144889) | [`0xb2Ef90642AdA70B8fcDDB7921794f06505724819`](https://sepolia.etherscan.io/address/0xb2Ef90642AdA70B8fcDDB7921794f06505724819) | |
| **Tally Slashing Proposer** | [`0x7a318c3daa9f21f8fc8238c65755eb0394fbf189`](https://etherscan.io/address/0x7a318c3daa9f21f8fc8238c65755eb0394fbf189) | [`0x3B1b8a2cd431700ec0c882898361a6B5F4F31d5B`](https://sepolia.etherscan.io/address/0x3B1b8a2cd431700ec0c882898361a6B5F4F31d5B) | |
| **Honk Verifier** | N/A | [`0x8634f14586b902b436fa98A4644361A3693293df`](https://sepolia.etherscan.io/address/0x8634f14586b902b436fa98A4644361A3693293df) | |
| **Register New Rollup Version Payload** | N/A | [`0x11f7Ab2324CA94af929A388477a7959E0108C3d6`](https://sepolia.etherscan.io/address/0x11f7Ab2324CA94af929A388477a7959E0108C3d6) | |
| **Slash Payload Cloneable** | N/A | [`0x128AfF9E8A52c5f28F53D0A2D3dd2c96d1122324`](https://sepolia.etherscan.io/address/0x128AfF9E8A52c5f28F53D0A2D3dd2c96d1122324) | |

### L2 Contract Addresses

| Contract Name | Ignition (Mainnet) | Testnet | Devnet |
|---------------|-------------------|---------|--------|
| **Instance Registry** | N/A | `0x0000000000000000000000000000000000000000000000000000000000000002` | `0x0000000000000000000000000000000000000000000000000000000000000002` |
| **Class Registry** | N/A | `0x0000000000000000000000000000000000000000000000000000000000000003` | `0x0000000000000000000000000000000000000000000000000000000000000003` |
| **MultiCall Entrypoint** | N/A | `0x0000000000000000000000000000000000000000000000000000000000000004` | `0x0000000000000000000000000000000000000000000000000000000000000004` |
| **Fee Juice** | N/A | `0x0000000000000000000000000000000000000000000000000000000000000005` | `0x0000000000000000000000000000000000000000000000000000000000000005` |
| **SponsoredFPC** | N/A | `0x1586f476995be97f07ebd415340a14be48dc28c6c661cc6bdddb80ae790caa4e` | `0x09a4df73aa47f82531a038d1d51abfc85b27665c4b7ca751e2d4fa9f19caffb2` |

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
| **L2→L1 Finalization** | N/A | TBD | ~30 minutes | -->

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
- **Running infrastructure?** Review [Network Operator Guide](/operate/operators)
- **Joining as validator?** See [Sequencer Management](/operate/operators/setup/sequencer_management)
