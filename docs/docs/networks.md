---
title: Networks
keywords: [Aztec, Networks, Alpha, Testnet, Mainnet]
id: networks
description: "Connect to Aztec Networks: Alpha (Mainnet) and Testnet, choose the right network for your use case, and find the version each network is running."
---

# Aztec networks overview

The Aztec Protocol operates across multiple networks, each serving specific purposes and audiences. This page gives builders and node operators the technical details to connect to each network: live version, RPC and bootnode endpoints, contract addresses, and governance parameters.

Not sure which network or version to pin against? Jump to the [Network selection guide](#network-selection-guide). For release channels and what is coming next, see [Versions and releases](#versions-and-releases).

## Network technical information

| Parameter           | Alpha (Mainnet)                                                                                          | Testnet                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Version**         | `5.0.1`                                                                                                  | `5.0.1`                                                                                             |
| **L1 Chain ID**     | `1` (Mainnet)                                                                                            | `11155111` (Sepolia)                                                                                     |
| **Rollup Version**  | `4248422647`                                                                                             | `1821665230`                                                                                             |
| **RPC Endpoint**    | `https://aztec-mainnet.drpc.org`                                                                         | `https://v5.testnet.rpc.aztec-labs.com`                                                                  |
| **Bootnodes**       | [http://static.aztec.network/mainnet/bootnodes.json](http://static.aztec.network/mainnet/bootnodes.json) | [http://static.aztec.network/testnet/bootnodes.json](http://static.aztec.network/testnet/bootnodes.json) |
| **Block Explorer**  | [Aztecscan](https://aztecscan.xyz), [Aztecexplorer](https://aztecexplorer.xyz/?network=mainnet)          | [Aztecscan](https://testnet.aztecscan.xyz), [Aztecexplorer](https://aztecexplorer.xyz/?network=testnet)  |
| **Getting Started** | [Run a sequencer →](/operate/operators/setup/sequencer_management)                                       | [Run a node →](/operate/operators/setup/running_a_node)                                                  |

:::tip Network roles (post-Alpha)
**Testnet is your production path.** It's decentralized, live, and stable: treat it as your staging environment for Alpha. If you want to deploy on Alpha, validate on Testnet first.
:::

## Versions and releases

Aztec is a monorepo. Each release publishes a single version that covers the node, [Aztec.nr](https://aztec.network/aztecnr), and [aztec.js](https://aztec.network/aztecjs) together, so a network on `5.0.1` runs the `5.0.1` node, contracts compiled with the `5.0.1` Aztec.nr, and clients built against the `5.0.1` aztec.js. The **Version** row in the table above is the build a given network is currently running.

### Release channels

Aztec publishes three kinds of builds, each with a different stability promise.

| Channel                    | Example                    | What it is                                                                                                                       | Recommended audience                                                                                       |
| -------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Stable**                 | `5.0.0`, `5.0.1`           | The validated, final version for a release cycle.                                                                                | Builders shipping to users. Operators running Alpha or Testnet.                                            |
| **Release candidate (RC)** | `5.0.0-rc.1`, `5.0.0-rc.2` | Pre-release of an upcoming stable, used for internal validation and Testnet rehearsals. Additional RCs ship if issues are found. | Operators participating in pre-release rehearsals. Builders verifying compatibility ahead of a stable cut. |
| **Nightly**                | `5.0.0-nightly.<date>`     | Latest in-progress work from the development branch. Experimental, less tested.                                                  | Builders previewing upcoming features. Not recommended for production.                                     |

An RC is not newer than its matching stable: `5.0.0-rc.1` is a checkpoint on the way to `5.0.0`, and `5.0.0` supersedes every `5.0.0-rc.*`.

Release notes for each version are generated from the commit range since the previous release and published on the [GitHub releases page](https://github.com/AztecProtocol/aztec-packages/releases). The Git history is the source of truth for what changed between two versions.

### Cadence

Stable releases target roughly one per month, typically mid-month. Dates are not strictly fixed; the cadence is intended to be regular rather than ad hoc.

## Contract addresses

### L1 contract addresses

| Contract Name                           | Alpha (Mainnet)                                                                                                         | Testnet                                                                                                                         |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Registry**                            | [`0x35b22e09ee0390539439e24f06da43d83f90e298`](https://etherscan.io/address/0x35b22e09ee0390539439e24f06da43d83f90e298) | [`0xa0bfb1b494fb49041e5c6e8c2c1be09cd171c6ba`](https://sepolia.etherscan.io/address/0xa0bfb1b494fb49041e5c6e8c2c1be09cd171c6ba) |
| **Rollup**                              | [`0x91fF8bbD8Ebb07893010D50A48A1609e5EBd8E34`](https://etherscan.io/address/0x91fF8bbD8Ebb07893010D50A48A1609e5EBd8E34) | [`0xd73a91bdcf6891c7642f3e460036e1ef2cc23178`](https://sepolia.etherscan.io/address/0xd73a91bdcf6891c7642f3e460036e1ef2cc23178) |
| **L1 → L2 Inbox**                       | [`0x7d4Ef0676c2032bbCC09227501D34d86641ab8cA`](https://etherscan.io/address/0x7d4Ef0676c2032bbCC09227501D34d86641ab8cA) | [`0x3047dbf2b7dd9f58ac41113525480f94745a4f7c`](https://sepolia.etherscan.io/address/0x3047dbf2b7dd9f58ac41113525480f94745a4f7c) |
| **L2 → L1 Outbox**                      | [`0x5B062aB5fD3A66BC7e73b04CeD38587673b6A2D7`](https://etherscan.io/address/0x5B062aB5fD3A66BC7e73b04CeD38587673b6A2D7) | [`0x905f80009bbef9d9426675b45009922971ed42ff`](https://sepolia.etherscan.io/address/0x905f80009bbef9d9426675b45009922971ed42ff) |
| **Fee Juice**                           | [`0xa27ec0006e59f245217ff08cd52a7e8b169e62d2`](https://etherscan.io/address/0xa27ec0006e59f245217ff08cd52a7e8b169e62d2) | [`0x762c132040fda6183066fa3b14d985ee55aa3c18`](https://sepolia.etherscan.io/address/0x762c132040fda6183066fa3b14d985ee55aa3c18) |
| **Staking Asset**                       | [`0xa27ec0006e59f245217ff08cd52a7e8b169e62d2`](https://etherscan.io/address/0xa27ec0006e59f245217ff08cd52a7e8b169e62d2) | [`0x5595cb9ed193cac2c0bc5393313bc6115817954b`](https://sepolia.etherscan.io/address/0x5595cb9ed193cac2c0bc5393313bc6115817954b) |
| **Fee Juice Portal**                    | [`0xaf73Dd51D1eb8a079BB097f39c832cDD00ac691c`](https://etherscan.io/address/0xaf73Dd51D1eb8a079BB097f39c832cDD00ac691c) | [`0xb4a9f8eadc8ca944729d61e59a9f491faff237a3`](https://sepolia.etherscan.io/address/0xb4a9f8eadc8ca944729d61e59a9f491faff237a3) |
| **Fee Asset Handler**                   | N/A                                                                                                                     | [`0x5602c39a6e9c5ace589f64f754927bcda4f4bfc9`](https://sepolia.etherscan.io/address/0x5602c39a6e9c5ace589f64f754927bcda4f4bfc9) |
| **Coin Issuer**                         | [`0x02fadf157d551aa6d761b2a2237d03af68e41ca6`](https://etherscan.io/address/0x02fadf157d551aa6d761b2a2237d03af68e41ca6) | [`0xe05d0a62045b4237556c1ec423e59eea9a24eaee`](https://sepolia.etherscan.io/address/0xe05d0a62045b4237556c1ec423e59eea9a24eaee) |
| **Reward Distributor**                  | [`0x555bAAc4757A89f1CE0c84fA35afE9dD7aa8E1d3`](https://etherscan.io/address/0x555bAAc4757A89f1CE0c84fA35afE9dD7aa8E1d3) | [`0x83b2a93ef343cab7be9d8bba7317f314975e5cb0`](https://sepolia.etherscan.io/address/0x83b2a93ef343cab7be9d8bba7317f314975e5cb0) |
| **Reward Booster**                      | [`0x4490cAb7Ce3499353E1b0090b9e530c1AD03B551`](https://etherscan.io/address/0x4490cAb7Ce3499353E1b0090b9e530c1AD03B551) | [`0xdFA442Dd70e654455C3D83d3fE1034751e15385e`](https://sepolia.etherscan.io/address/0xdFA442Dd70e654455C3D83d3fE1034751e15385e) |
| **Governance Proposer**                 | [`0x06ef1dcf87e419c48b94a331b252819fadbd63ef`](https://etherscan.io/address/0x06ef1dcf87e419c48b94a331b252819fadbd63ef) | [`0x01c7d4ca153748d2377968fef22894cb162e9480`](https://sepolia.etherscan.io/address/0x01c7d4ca153748d2377968fef22894cb162e9480) |
| **Governance**                          | [`0x1102471eb3378fee427121c9efcea452e4b6b75e`](https://etherscan.io/address/0x1102471eb3378fee427121c9efcea452e4b6b75e) | [`0xcaf7447721447b22cd0076ac7c63877c3afd329f`](https://sepolia.etherscan.io/address/0xcaf7447721447b22cd0076ac7c63877c3afd329f) |
| **Governance Staking Escrow**           | [`0xa92ecfd0e70c9cd5e5cd76c50af0f7da93567a4f`](https://etherscan.io/address/0xa92ecfd0e70c9cd5e5cd76c50af0f7da93567a4f) | [`0xb6a38a51a6c1de9012f9d8ea9745ef957212eaac`](https://sepolia.etherscan.io/address/0xb6a38a51a6c1de9012f9d8ea9745ef957212eaac) |
| **Staking Registry**                    | [`0x042dF8f42790d6943F41C25C2132400fd727f452`](https://etherscan.io/address/0x042dF8f42790d6943F41C25C2132400fd727f452) | [`0xC6EcC1832c8BF6a41c927BEb4E9ec610FBeDd1C2`](https://sepolia.etherscan.io/address/0xC6EcC1832c8BF6a41c927BEb4E9ec610FBeDd1C2) |
| **Slash Factory**                       | N/A                                                                                                                     | N/A |
| **Slasher**                             | [`0xCD6855470A01aBcd989126A1183Fb50673952548`](https://etherscan.io/address/0xCD6855470A01aBcd989126A1183Fb50673952548) | [`0xBFa3625CfC7cdDAbF29961e12C4399c5bd8D8763`](https://sepolia.etherscan.io/address/0xBFa3625CfC7cdDAbF29961e12C4399c5bd8D8763) |
| **Tally Slashing Proposer**             | [`0x8A36b8F2Ca71D8d8Bd98e03Ebf8B4D0939Daf0bA`](https://etherscan.io/address/0x8A36b8F2Ca71D8d8Bd98e03Ebf8B4D0939Daf0bA) | [`0x504331248Eb1359C247a0e6895fFfeA70ecdb9a8`](https://sepolia.etherscan.io/address/0x504331248Eb1359C247a0e6895fFfeA70ecdb9a8) |
| **Honk Verifier**                       | [`0x098f47c00F4df22a8030746Eb11378236C24b4bC`](https://etherscan.io/address/0x098f47c00F4df22a8030746Eb11378236C24b4bC) | [`0x31F98dfC544E52e4170c0Dc64098049651db48C1`](https://sepolia.etherscan.io/address/0x31F98dfC544E52e4170c0Dc64098049651db48C1) |
| **Register New Rollup Version Payload** | N/A                                                                                                                     | N/A                                                                                                                             |
| **Slash Payload Cloneable**             | [`0x57576AbA1932df7Cc30F971ACC9d4Fc6E86B6e87`](https://etherscan.io/address/0x57576AbA1932df7Cc30F971ACC9d4Fc6E86B6e87) | [`0x0f7aC5F5087bD7CA05957321c75CdF9bD70D9b2E`](https://sepolia.etherscan.io/address/0x0f7aC5F5087bD7CA05957321c75CdF9bD70D9b2E) |

### L2 contract addresses

| Contract Name            | Alpha (Mainnet)                                                      | Testnet                                                              |
| ------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Instance Registry**    | `0x0000000000000000000000000000000000000000000000000000000000000002` | `0x0000000000000000000000000000000000000000000000000000000000000002` |
| **Class Registry**       | `0x0000000000000000000000000000000000000000000000000000000000000001` | `0x0000000000000000000000000000000000000000000000000000000000000001` |
| **MultiCall Entrypoint** | `0x246d60af8b79a5dceece7d2388921203401c0df02ce674c5781c6c2162922986` | `0x246d60af8b79a5dceece7d2388921203401c0df02ce674c5781c6c2162922986` |
| **Fee Juice**            | `0x0000000000000000000000000000000000000000000000000000000000000003` | `0x0000000000000000000000000000000000000000000000000000000000000003` |
| **SponsoredFPC**         | Not deployed                                                         | `0x1441491b59934ec64f8c98f17c91f23c01ca2a45dbb35caf123146ec76f9970c` |

## Governance parameters

| Parameter               | Alpha (Mainnet) | Testnet   |
| ----------------------- | --------------- | --------- |
| **Proposer Quorum**     | 600/1000        | 60/100    |
| **Voting Delay**        | 3 days          | 12 hours  |
| **Voting Duration**     | 7 days          | 24 hours  |
| **Execution Delay**     | 2 days          | 12 hours  |
| **Grace Period**        | 7 days          | 24 hours  |
| **Voting Quorum**       | 20% of deposited power | 20% of deposited power |
| **Required Yea Margin** | 33%             | 10%       |
| **Minimum Total Power** | 100,000,000 AZTEC | 9,600,000 AZTEC |
| **Propose-With-Lock Amount** | 258,750,000 AZTEC | 258,750,000 AZTEC |
| **Propose-With-Lock Delay**  | 90 days    | 90 days   |
| **Slashing Quorum**     | 65/128          | 65/128    |
| **Slashing Round Size** | 4 epochs (128 slots) | 4 epochs (128 slots) |

These values are read from each network's deployed Governance and GovernanceProposer contracts (`getConfiguration()`, `QUORUM_SIZE()`, `ROUND_SIZE()`) and can change through governance.

---

## Network selection guide

### Alpha (Mainnet)

Alpha is the Aztec **mainnet** in its initial operational phase, with governance, networking, and transaction processing fully active. Alpha is live but early, so bugs (including critical ones) are expected. For a full explanation of what this means, see the **[Alpha Network](/participate/alpha)** page.

#### Overview

Alpha is connected to Ethereum mainnet and supports user transactions. Governance and staking infrastructure are fully operational. This network requires real stakes for sequencer participation.

**Target users:**

- Sequencers who want to contribute to the decentralized Aztec Network
- Governance participants
- Developers deploying production applications
- Infrastructure operators

**Key features:**

- Governance system fully operational
- Staking required for sequencer participation
- Connected to Ethereum Mainnet
- User transactions supported

---

### Testnet

Testnet is the production path for Aztec. It operates as a fully decentralized network with multiple sequencers and closely mirrors Alpha conditions. If you plan to deploy on Alpha, Testnet is where you validate your application. Think of it as your staging environment for the real thing.

#### Overview

Testnet is ideal for testing node configurations, governance proposals, and understanding network dynamics without real financial risk.

**Target users:**

- Future Alpha sequencer operators testing configurations
- Developers requiring production-like testing conditions
- Governance participants practicing proposal workflows
- Infrastructure operators validating monitoring setups

**Key features:**

- Fully decentralized sequencer set
- Connected to Ethereum Sepolia
- Transactions are proven
- Sponsored FPC available for free transactions
- Good environment for testing node operations

### Choosing a version

Once you have picked a network, choose a release channel that matches your role:

- **Building on Aztec.** Pin Aztec.nr and aztec.js to the stable version that matches the network you are targeting (see the **Version** row in the [Network technical information](#network-technical-information) table). Validate on Testnet before deploying to Alpha. Use nightlies only when you need an unreleased feature, and expect breakage.
- **Running a node or sequencer.** Run the stable version listed for your network. Switch to an RC only when an upcoming-release rehearsal is announced on Testnet.
- **Tracking what is coming.** Watch [Releases](https://github.com/AztecProtocol/aztec-packages/releases) for the current stable, any RCs in flight, and nightly tags. A public release calendar is on the roadmap; until then, the releases page is the authoritative timeline.

## Next steps

Based on your use case:

- **Building an application?** Start with [Getting started](/developers/getting_started_on_local_network).
- **Running infrastructure?** Review the [Network operator guide](/operate/operators).
- **Joining as a sequencer?** See [Sequencer management](/operate/operators/setup/sequencer_management).
- **Tracking releases?** See [Versions and releases](#versions-and-releases) above and the [GitHub releases page](https://github.com/AztecProtocol/aztec-packages/releases).
