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
| **Version**         | `4.3.1`                                                                                                  | `5.0.0-rc.1`                                                                                             |
| **L1 Chain ID**     | `1` (Mainnet)                                                                                            | `11155111` (Sepolia)                                                                                     |
| **Rollup Version**  | `2934756905`                                                                                             | `4239416255`                                                                                             |
| **RPC Endpoint**    | `https://aztec-mainnet.drpc.org`                                                                         | `https://v5.testnet.rpc.aztec-labs.com`                                                                  |
| **Bootnodes**       | [http://static.aztec.network/mainnet/bootnodes.json](http://static.aztec.network/mainnet/bootnodes.json) | [http://static.aztec.network/testnet/bootnodes.json](http://static.aztec.network/testnet/bootnodes.json) |
| **Block Explorer**  | [Aztecscan](https://aztecscan.xyz), [Aztecexplorer](https://aztecexplorer.xyz/?network=mainnet)          | [Aztecscan](https://testnet.aztecscan.xyz), [Aztecexplorer](https://aztecexplorer.xyz/?network=testnet)  |
| **Getting Started** | [Run a sequencer →](/operate/operators/setup/sequencer_management)                                       | [Run a node →](/operate/operators/setup/running_a_node)                                                  |

:::tip Network roles (post-Alpha)
**Testnet is your production path.** It's decentralized, live, and stable: treat it as your staging environment for Alpha. If you want to deploy on Alpha, validate on Testnet first.
:::

## Versions and releases

Aztec is a monorepo. Each release publishes a single version that covers the node, [Aztec.nr](https://aztec.network/aztecnr), and [aztec.js](https://aztec.network/aztecjs) together, so a network on `4.2.0` runs the `4.2.0` node, contracts compiled with the `4.2.0` Aztec.nr, and clients built against the `4.2.0` aztec.js. The **Version** row in the table above is the build a given network is currently running.

### Release channels

Aztec publishes three kinds of builds, each with a different stability promise.

| Channel                    | Example                    | What it is                                                                                                                       | Recommended audience                                                                                       |
| -------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Stable**                 | `4.2.0`, `4.3.0`           | The validated, final version for a release cycle.                                                                                | Builders shipping to users. Operators running Alpha or Testnet.                                            |
| **Release candidate (RC)** | `4.3.0-rc.1`, `4.3.0-rc.2` | Pre-release of an upcoming stable, used for internal validation and Testnet rehearsals. Additional RCs ship if issues are found. | Operators participating in pre-release rehearsals. Builders verifying compatibility ahead of a stable cut. |
| **Nightly**                | `4.3.0-nightly.<date>`     | Latest in-progress work from the development branch. Experimental, less tested.                                                  | Builders previewing upcoming features. Not recommended for production.                                     |

An RC is not newer than its matching stable: `4.3.0-rc.1` is a checkpoint on the way to `4.3.0`, and `4.3.0` supersedes every `4.3.0-rc.*`.

Release notes for each version are generated from the commit range since the previous release and published on the [GitHub releases page](https://github.com/AztecProtocol/aztec-packages/releases). The Git history is the source of truth for what changed between two versions.

### Cadence

Stable releases target roughly one per month, typically mid-month. Dates are not strictly fixed; the cadence is intended to be regular rather than ad hoc.

## Contract addresses

### L1 contract addresses

| Contract Name                           | Alpha (Mainnet)                                                                                                         | Testnet                                                                                                                         |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Registry**                            | [`0x35b22e09ee0390539439e24f06da43d83f90e298`](https://etherscan.io/address/0x35b22e09ee0390539439e24f06da43d83f90e298) | [`0xa0bfb1b494fb49041e5c6e8c2c1be09cd171c6ba`](https://sepolia.etherscan.io/address/0xa0bfb1b494fb49041e5c6e8c2c1be09cd171c6ba) |
| **Rollup**                              | [`0xae2001f7e21d5ecabf6234e9fdd1e76f50f74962`](https://etherscan.io/address/0xae2001f7e21d5ecabf6234e9fdd1e76f50f74962) | [`0xe4394f118b115de2bdad88ee1abd599cf5d25c70`](https://sepolia.etherscan.io/address/0xe4394f118b115de2bdad88ee1abd599cf5d25c70) |
| **L1 → L2 Inbox**                       | [`0x8dbf0b6ed495baab6062f5d5365af3c1b2ed4578`](https://etherscan.io/address/0x8dbf0b6ed495baab6062f5d5365af3c1b2ed4578) | [`0x599e8d0a0a6b904471bd2e5bac983744c6e5a5c3`](https://sepolia.etherscan.io/address/0x599e8d0a0a6b904471bd2e5bac983744c6e5a5c3) |
| **L2 → L1 Outbox**                      | [`0xc9698b7adef9ee63f3bf5cff38086e4e836579f0`](https://etherscan.io/address/0xc9698b7adef9ee63f3bf5cff38086e4e836579f0) | [`0xaaca160272361f29aff130d0e8dfd041910c97e0`](https://sepolia.etherscan.io/address/0xaaca160272361f29aff130d0e8dfd041910c97e0) |
| **Fee Juice**                           | [`0xa27ec0006e59f245217ff08cd52a7e8b169e62d2`](https://etherscan.io/address/0xa27ec0006e59f245217ff08cd52a7e8b169e62d2) | [`0x762c132040fda6183066fa3b14d985ee55aa3c18`](https://sepolia.etherscan.io/address/0x762c132040fda6183066fa3b14d985ee55aa3c18) |
| **Staking Asset**                       | [`0xa27ec0006e59f245217ff08cd52a7e8b169e62d2`](https://etherscan.io/address/0xa27ec0006e59f245217ff08cd52a7e8b169e62d2) | [`0x5595cb9ed193cac2c0bc5393313bc6115817954b`](https://sepolia.etherscan.io/address/0x5595cb9ed193cac2c0bc5393313bc6115817954b) |
| **Fee Juice Portal**                    | [`0x2891f8b941067f8b5a3f34545a30cf71e3e23617`](https://etherscan.io/address/0x2891f8b941067f8b5a3f34545a30cf71e3e23617) | [`0x7c4176bff969c9417e42f9cb921100145911cc84`](https://sepolia.etherscan.io/address/0x7c4176bff969c9417e42f9cb921100145911cc84) |
| **Fee Asset Handler**                   | N/A                                                                                                                     | [`0x5602c39a6e9c5ace589f64f754927bcda4f4bfc9`](https://sepolia.etherscan.io/address/0x5602c39a6e9c5ace589f64f754927bcda4f4bfc9) |
| **Coin Issuer**                         | [`0x02fadf157d551aa6d761b2a2237d03af68e41ca6`](https://etherscan.io/address/0x02fadf157d551aa6d761b2a2237d03af68e41ca6) | [`0xe05d0a62045b4237556c1ec423e59eea9a24eaee`](https://sepolia.etherscan.io/address/0xe05d0a62045b4237556c1ec423e59eea9a24eaee) |
| **Reward Distributor**                  | [`0x3d6a1b00c830c5f278fc5dfb3f6ff0b74db6dfe0`](https://etherscan.io/address/0x3d6a1b00c830c5f278fc5dfb3f6ff0b74db6dfe0) | [`0x83b2a93ef343cab7be9d8bba7317f314975e5cb0`](https://sepolia.etherscan.io/address/0x83b2a93ef343cab7be9d8bba7317f314975e5cb0) |
| **Reward Booster**                      | [`0x1cbb707bd7b4fd2bced6d96d84372fb428e93d80`](https://etherscan.io/address/0x1cbb707bd7b4fd2bced6d96d84372fb428e93d80) | [`0xb461C15939EAd10ee916d2897955f2B6b7B78C43`](https://sepolia.etherscan.io/address/0xb461C15939EAd10ee916d2897955f2B6b7B78C43) |
| **Governance Proposer**                 | [`0x06ef1dcf87e419c48b94a331b252819fadbd63ef`](https://etherscan.io/address/0x06ef1dcf87e419c48b94a331b252819fadbd63ef) | [`0x01c7d4ca153748d2377968fef22894cb162e9480`](https://sepolia.etherscan.io/address/0x01c7d4ca153748d2377968fef22894cb162e9480) |
| **Governance**                          | [`0x1102471eb3378fee427121c9efcea452e4b6b75e`](https://etherscan.io/address/0x1102471eb3378fee427121c9efcea452e4b6b75e) | [`0xcaf7447721447b22cd0076ac7c63877c3afd329f`](https://sepolia.etherscan.io/address/0xcaf7447721447b22cd0076ac7c63877c3afd329f) |
| **Governance Staking Escrow**           | [`0xa92ecfd0e70c9cd5e5cd76c50af0f7da93567a4f`](https://etherscan.io/address/0xa92ecfd0e70c9cd5e5cd76c50af0f7da93567a4f) | [`0xb6a38a51a6c1de9012f9d8ea9745ef957212eaac`](https://sepolia.etherscan.io/address/0xb6a38a51a6c1de9012f9d8ea9745ef957212eaac) |
| **Staking Registry**                    | [`0x042dF8f42790d6943F41C25C2132400fd727f452`](https://etherscan.io/address/0x042dF8f42790d6943F41C25C2132400fd727f452) | [`0xC6EcC1832c8BF6a41c927BEb4E9ec610FBeDd1C2`](https://sepolia.etherscan.io/address/0xC6EcC1832c8BF6a41c927BEb4E9ec610FBeDd1C2) |
| **Slash Factory**                       | N/A                                                                                                                     | [`0x9CF4a0094c8696d5110dd0f0cF3FA5deA174BB17`](https://sepolia.etherscan.io/address/0x9CF4a0094c8696d5110dd0f0cF3FA5deA174BB17) |
| **Slasher**                             | [`0x64E6e9Bb9f1E33D319578B9f8a9C719Ca6D46eBb`](https://etherscan.io/address/0x64E6e9Bb9f1E33D319578B9f8a9C719Ca6D46eBb) | [`0xd9f41c7dDcf571Cb212670BD54E78D6ef8bf2497`](https://sepolia.etherscan.io/address/0xd9f41c7dDcf571Cb212670BD54E78D6ef8bf2497) |
| **Tally Slashing Proposer**             | [`0xa4a38fD0108C00983E75616b638Ff3321FD26958`](https://etherscan.io/address/0xa4a38fD0108C00983E75616b638Ff3321FD26958) | [`0xaB9B3B436a98fF323C13A66D38eB9673e5Ab51EE`](https://sepolia.etherscan.io/address/0xaB9B3B436a98fF323C13A66D38eB9673e5Ab51EE) |
| **Honk Verifier**                       | [`0x70aedda427f26480d240bc0f4308cedec8d31348`](https://etherscan.io/address/0x70aedda427f26480d240bc0f4308cedec8d31348) | [`0xD2A6AD93f5d3C32D1f1f22c9B54E52c39D49D534`](https://sepolia.etherscan.io/address/0xD2A6AD93f5d3C32D1f1f22c9B54E52c39D49D534) |
| **Register New Rollup Version Payload** | N/A                                                                                                                     | N/A                                                                                                                             |
| **Slash Payload Cloneable**             | [`0xAA43220b7eb7c8Ffe75bc9C483f3C07b0a55B445`](https://etherscan.io/address/0xAA43220b7eb7c8Ffe75bc9C483f3C07b0a55B445) | [`0x10895F7a1418AA268E04767C6F37665727d07354`](https://sepolia.etherscan.io/address/0x10895F7a1418AA268E04767C6F37665727d07354) |

### L2 contract addresses

| Contract Name            | Alpha (Mainnet)                                                      | Testnet                                                              |
| ------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Instance Registry**    | `0x0000000000000000000000000000000000000000000000000000000000000002` | `0x0000000000000000000000000000000000000000000000000000000000000002` |
| **Class Registry**       | `0x0000000000000000000000000000000000000000000000000000000000000003` | `0x0000000000000000000000000000000000000000000000000000000000000001` |
| **MultiCall Entrypoint** | `0x0000000000000000000000000000000000000000000000000000000000000004` | `0x27d70a9a022dcd1195a8d2a4a3a8c89b5af1d7831a68891d052af0125a1f1341` |
| **Fee Juice**            | `0x0000000000000000000000000000000000000000000000000000000000000005` | `0x0000000000000000000000000000000000000000000000000000000000000003` |
| **SponsoredFPC**         | Not deployed                                                         | `0x261366b3c0a9b4c30864629556cf282be409e6822b1f3a065fcb7e34f36d7880` |

## Governance parameters

| Parameter               | Alpha (Mainnet) | Testnet   |
| ----------------------- | --------------- | --------- |
| **Proposer Quorum**     | 600/1000        | 60/100    |
| **Voting Delay**        | 3 days          | 12 hours  |
| **Voting Duration**     | 7 days          | 24 hours  |
| **Execution Delay**     | 30 days         | 12 hours  |
| **Slashing Quorum**     | 65%             | 33%       |
| **Slashing Round Size** | 128 epochs      | 64 epochs |

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
