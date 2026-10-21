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
| **Version**         | `5.2.0`                                                                                                  | `6.0.0-rc.1`                                                                                                  |
| **L1 Chain ID**     | `1` (Mainnet)                                                                                            | `11155111` (Sepolia)                                                                                     |
| **Rollup Version**  | `4248422647`                                                                                             | `2914217885`                                                                                             |
| **RPC Endpoint**    | `https://aztec-mainnet.drpc.org`                                                                         | `https://aztec-testnet.drpc.org`                                                                  |
| **Bootnodes**       | [http://static.aztec.network/mainnet/bootnodes.json](http://static.aztec.network/mainnet/bootnodes.json) | [http://static.aztec.network/testnet/bootnodes.json](http://static.aztec.network/testnet/bootnodes.json) |
| **Block Explorer**  | [Aztecscan](https://aztecscan.xyz), [Aztecexplorer](https://aztecexplorer.xyz/?network=mainnet)          | [Aztecscan](https://testnet.aztecscan.xyz), [Aztecexplorer](https://aztecexplorer.xyz/?network=testnet)  |
| **Getting Started** | [Run a sequencer →](/operate/operators/setup/sequencer_management)                                       | [Run a node →](/operate/operators/setup/running_a_node)                                                  |

:::tip Network roles (post-Alpha)
**Testnet is your production path.** It's decentralized, live, and stable: treat it as your staging environment for Alpha. If you want to deploy on Alpha, validate on Testnet first.
:::

## Versions and releases

Aztec is a monorepo. Each release publishes a single version that covers the node, [Aztec.nr](https://aztec.network/aztecnr), and [aztec.js](https://aztec.network/aztecjs) together, so a network on `6.0.0-rc.1` runs the `6.0.0-rc.1` node, contracts compiled with the `6.0.0-rc.1` Aztec.nr, and clients built against the `6.0.0-rc.1` aztec.js. The **Version** row in the table above is the build a given network is currently running.

### Release channels

Aztec publishes three kinds of builds, each with a different stability promise.

| Channel                    | Example                    | What it is                                                                                                                       | Recommended audience                                                                                       |
| -------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Stable**                 | `6.0.0-rc.1`, `5.2.0`           | The validated, final version for a release cycle.                                                                                | Builders shipping to users. Operators running Alpha or Testnet.                                            |
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
| **Registry**                            | [`0x35b22e09ee0390539439e24f06da43d83f90e298`](https://etherscan.io/address/0x35b22e09ee0390539439e24f06da43d83f90e298) | [`0xA0BFb1B494FB49041e5c6e8c2C1BE09cD171c6Ba`](https://sepolia.etherscan.io/address/0xA0BFb1B494FB49041e5c6e8c2C1BE09cD171c6Ba) |
| **Rollup**                              | [`0x91fF8bbD8Ebb07893010D50A48A1609e5EBd8E34`](https://etherscan.io/address/0x91fF8bbD8Ebb07893010D50A48A1609e5EBd8E34) | [`0x8c2fb2A68A3d362ab1DE99E06F83f8903160BbD9`](https://sepolia.etherscan.io/address/0x8c2fb2A68A3d362ab1DE99E06F83f8903160BbD9) |
| **L1 → L2 Inbox**                       | [`0x7d4Ef0676c2032bbCC09227501D34d86641ab8cA`](https://etherscan.io/address/0x7d4Ef0676c2032bbCC09227501D34d86641ab8cA) | [`0x816ce1861ec258F99279E75a3EE6B5Dfc9571E30`](https://sepolia.etherscan.io/address/0x816ce1861ec258F99279E75a3EE6B5Dfc9571E30) |
| **L2 → L1 Outbox**                      | [`0x5B062aB5fD3A66BC7e73b04CeD38587673b6A2D7`](https://etherscan.io/address/0x5B062aB5fD3A66BC7e73b04CeD38587673b6A2D7) | [`0xb9daE0F8c5dD6524c1015fFE6494d9fD0623DF0d`](https://sepolia.etherscan.io/address/0xb9daE0F8c5dD6524c1015fFE6494d9fD0623DF0d) |
| **Fee Juice**                           | [`0xa27ec0006e59f245217ff08cd52a7e8b169e62d2`](https://etherscan.io/address/0xa27ec0006e59f245217ff08cd52a7e8b169e62d2) | [`0x762C132040fdA6183066Fa3B14d985ee55aA3C18`](https://sepolia.etherscan.io/address/0x762C132040fdA6183066Fa3B14d985ee55aA3C18) |
| **Staking Asset**                       | [`0xa27ec0006e59f245217ff08cd52a7e8b169e62d2`](https://etherscan.io/address/0xa27ec0006e59f245217ff08cd52a7e8b169e62d2) | [`0x5595cb9ED193cAc2C0Bc5393313bc6115817954B`](https://sepolia.etherscan.io/address/0x5595cb9ED193cAc2C0Bc5393313bc6115817954B) |
| **Fee Juice Portal**                    | [`0xaf73Dd51D1eb8a079BB097f39c832cDD00ac691c`](https://etherscan.io/address/0xaf73Dd51D1eb8a079BB097f39c832cDD00ac691c) | [`0x5Bb7523A95c1FDF1D2A3DD9fb7d497E7F5142D7F`](https://sepolia.etherscan.io/address/0x5Bb7523A95c1FDF1D2A3DD9fb7d497E7F5142D7F) |
| **Fee Asset Handler**                   | N/A                                                                                                                     | [`0x5602c39A6E9C5AcE589F64F754927bcDa4f4BFc9`](https://sepolia.etherscan.io/address/0x5602c39A6E9C5AcE589F64F754927bcDa4f4BFc9) |
| **Coin Issuer**                         | [`0x02fadf157d551aa6d761b2a2237d03af68e41ca6`](https://etherscan.io/address/0x02fadf157d551aa6d761b2a2237d03af68e41ca6) | [`0xE05d0A62045b4237556C1EC423e59eEa9A24EAeE`](https://sepolia.etherscan.io/address/0xE05d0A62045b4237556C1EC423e59eEa9A24EAeE) |
| **Reward Distributor**                  | [`0x555bAAc4757A89f1CE0c84fA35afE9dD7aa8E1d3`](https://etherscan.io/address/0x555bAAc4757A89f1CE0c84fA35afE9dD7aa8E1d3) | [`0x83B2A93EF343cAb7Be9D8Bba7317f314975e5CB0`](https://sepolia.etherscan.io/address/0x83B2A93EF343cAb7Be9D8Bba7317f314975e5CB0) |
| **Reward Booster**                      | [`0x4490cAb7Ce3499353E1b0090b9e530c1AD03B551`](https://etherscan.io/address/0x4490cAb7Ce3499353E1b0090b9e530c1AD03B551) | [`0x9F8FAd6feB8Ab67e03B7719F131c2A967b7C65Ef`](https://sepolia.etherscan.io/address/0x9F8FAd6feB8Ab67e03B7719F131c2A967b7C65Ef) |
| **Governance Proposer**                 | [`0x06ef1dcf87e419c48b94a331b252819fadbd63ef`](https://etherscan.io/address/0x06ef1dcf87e419c48b94a331b252819fadbd63ef) | [`0x01C7D4ca153748D2377968Fef22894cB162E9480`](https://sepolia.etherscan.io/address/0x01C7D4ca153748D2377968Fef22894cB162E9480) |
| **Governance**                          | [`0x1102471eb3378fee427121c9efcea452e4b6b75e`](https://etherscan.io/address/0x1102471eb3378fee427121c9efcea452e4b6b75e) | [`0xCAf7447721447B22Cd0076aC7C63877c3AFD329F`](https://sepolia.etherscan.io/address/0xCAf7447721447B22Cd0076aC7C63877c3AFD329F) |
| **Governance Staking Escrow**           | [`0xa92ecfd0e70c9cd5e5cd76c50af0f7da93567a4f`](https://etherscan.io/address/0xa92ecfd0e70c9cd5e5cd76c50af0f7da93567a4f) | [`0xb6A38A51a6C1de9012f9d8EA9745ef957212eAaC`](https://sepolia.etherscan.io/address/0xb6A38A51a6C1de9012f9d8EA9745ef957212eAaC) |
| **Staking Registry**                    | [`0x042dF8f42790d6943F41C25C2132400fd727f452`](https://etherscan.io/address/0x042dF8f42790d6943F41C25C2132400fd727f452) | [`0xC6EcC1832c8BF6a41c927BEb4E9ec610FBeDd1C2`](https://sepolia.etherscan.io/address/0xC6EcC1832c8BF6a41c927BEb4E9ec610FBeDd1C2) |
| **Slash Factory**                       | N/A                                                                                                                     | N/A |
| **Slasher**                             | [`0xCD6855470A01aBcd989126A1183Fb50673952548`](https://etherscan.io/address/0xCD6855470A01aBcd989126A1183Fb50673952548) | [`0xa2593B3eC569477cdc11d58B1B15F028d6CB5C0D`](https://sepolia.etherscan.io/address/0xa2593B3eC569477cdc11d58B1B15F028d6CB5C0D) |
| **Tally Slashing Proposer**             | [`0x8A36b8F2Ca71D8d8Bd98e03Ebf8B4D0939Daf0bA`](https://etherscan.io/address/0x8A36b8F2Ca71D8d8Bd98e03Ebf8B4D0939Daf0bA) | [`0xB7D4E1AEeD9238576299cf3E2556e7e14C38c386`](https://sepolia.etherscan.io/address/0xB7D4E1AEeD9238576299cf3E2556e7e14C38c386) |
| **Honk Verifier**                       | [`0x098f47c00F4df22a8030746Eb11378236C24b4bC`](https://etherscan.io/address/0x098f47c00F4df22a8030746Eb11378236C24b4bC) | [`0xdF45b42Fec3716Fd75329ecF6ffF0fDbC0422b50`](https://sepolia.etherscan.io/address/0xdF45b42Fec3716Fd75329ecF6ffF0fDbC0422b50) |
| **Register New Rollup Version Payload** | N/A                                                                                                                     | N/A                                                                                                                             |
| **Slash Payload Cloneable**             | [`0x57576AbA1932df7Cc30F971ACC9d4Fc6E86B6e87`](https://etherscan.io/address/0x57576AbA1932df7Cc30F971ACC9d4Fc6E86B6e87) | [`0x5BC9D38f25206F8F1F67630AD65DF57933d21027`](https://sepolia.etherscan.io/address/0x5BC9D38f25206F8F1F67630AD65DF57933d21027) |

### L2 contract addresses

| Contract Name            | Alpha (Mainnet)                                                      | Testnet                                                              |
| ------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Instance Registry**    | `0x0000000000000000000000000000000000000000000000000000000000000002` | `0x0000000000000000000000000000000000000000000000000000000000000002` |
| **Class Registry**       | `0x0000000000000000000000000000000000000000000000000000000000000001` | `0x0000000000000000000000000000000000000000000000000000000000000001` |
| **MultiCall Entrypoint** | `0x246d60af8b79a5dceece7d2388921203401c0df02ce674c5781c6c2162922986` | `0x07b1ad3f7fe93d66fbb9b69e8d9254f228b84dea11c3794aed5b2ba8119917d8` |
| **Fee Juice**            | `0x0000000000000000000000000000000000000000000000000000000000000003` | `0x0000000000000000000000000000000000000000000000000000000000000003` |
| **SponsoredFPC**         | Not deployed                                                         | `0x06a9fa0208c78509921b0487a6b5cd5c2e93baf17de1a18d310f65a3cc1d924b` |

## Governance parameters

| Parameter               | Alpha (Mainnet) | Testnet   |
| ----------------------- | --------------- | --------- |
| **Proposer Quorum**     | 600/1000        | 60/100    |
| **Voting Delay**        | 3 days          | 12 hours  |
| **Voting Duration**     | 7 days          | 24 hours  |
| **Execution Delay**     | 2 days          | 12 hours  |
| **Slashing Quorum**     | 65/128          | 65/128    |
| **Slashing Round Size** | 4 epochs (128 slots) | 4 epochs (128 slots) |

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
