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
| **Version**         | `6.0.0` | `6.0.0` |
| **L1 Chain ID**     | `1` (Mainnet)                                                                                            | `11155111` (Sepolia)                                                                                     |
| **Rollup Version**  | `2070860440` | `679261766` |
| **RPC Endpoint**    | `https://aztec-mainnet.drpc.org`                                                                         | `https://aztec-testnet.drpc.org`                                                                  |
| **Bootnodes**       | [http://static.aztec.network/mainnet/bootnodes.json](http://static.aztec.network/mainnet/bootnodes.json) | [http://static.aztec.network/testnet/bootnodes.json](http://static.aztec.network/testnet/bootnodes.json) |
| **Block Explorer**  | [Aztecscan](https://aztecscan.xyz), [Aztecexplorer](https://aztecexplorer.xyz/?network=mainnet)          | [Aztecscan](https://testnet.aztecscan.xyz), [Aztecexplorer](https://aztecexplorer.xyz/?network=testnet)  |
| **Getting Started** | [Run a sequencer →](/operate/operators/setup/sequencer_management)                                       | [Run a node →](/operate/operators/setup/running_a_node)                                                  |

:::tip Network roles (post-Alpha)
**Testnet is your production path.** It's decentralized, live, and stable: treat it as your staging environment for Alpha. If you want to deploy on Alpha, validate on Testnet first.
:::

## Versions and releases

Aztec is a monorepo. Each release publishes a single version that covers the node, [Aztec.nr](https://aztec.network/aztecnr), and [aztec.js](https://aztec.network/aztecjs) together, so a network on `6.0.0` runs the `6.0.0` node, contracts compiled with the `6.0.0` Aztec.nr, and clients built against the `6.0.0` aztec.js. The **Version** row in the table above is the build a given network is currently running.

### Release channels

Aztec publishes three kinds of builds, each with a different stability promise.

| Channel                    | Example                    | What it is                                                                                                                       | Recommended audience                                                                                       |
| -------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Stable**                 | `6.0.0`, `5.2.0`                | The validated, final version for a release cycle.                                                                                | Builders shipping to users. Operators running Alpha or Testnet.                                            |
| **Release candidate (RC)** | `5.0.0-rc.1`, `5.0.0-rc.2` | Pre-release of an upcoming stable, used for internal validation and Testnet rehearsals. Additional RCs ship if issues are found. | Operators participating in pre-release rehearsals. Builders verifying compatibility ahead of a stable cut. |
| **Nightly**                | `5.0.0-nightly.<date>`     | Latest in-progress work from the development branch. Experimental, less tested.                                                  | Builders previewing upcoming features. Not recommended for production.                                     |

An RC is not newer than its matching stable: `5.0.0-rc.1` is a checkpoint on the way to `5.0.0`, and `5.0.0` supersedes every `5.0.0-rc.*`.

Release notes for each version are generated from the commit range since the previous release and published on the [GitHub releases page](https://github.com/aztec-labs-eng/aztec-node/releases). The Git history is the source of truth for what changed between two versions.

### Cadence

Stable releases target roughly one per month, typically mid-month. Dates are not strictly fixed; the cadence is intended to be regular rather than ad hoc.

## Contract addresses

### L1 contract addresses

| Contract Name                           | Alpha (Mainnet)                                                                                                         | Testnet                                                                                                                         |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Registry**                            | [`0x35b22e09Ee0390539439E24f06Da43D83f90e298`](https://etherscan.io/address/0x35b22e09Ee0390539439E24f06Da43D83f90e298) | [`0xA0BFb1B494FB49041e5c6e8c2C1BE09cD171c6Ba`](https://sepolia.etherscan.io/address/0xA0BFb1B494FB49041e5c6e8c2C1BE09cD171c6Ba) |
| **Rollup**                              | [`0xE37A2663Cc9c119BA41572C40fAb0bbb23a5402f`](https://etherscan.io/address/0xE37A2663Cc9c119BA41572C40fAb0bbb23a5402f) | [`0x1f435a7F2dA358caF887A470FAeEE7d5D5f4eFBA`](https://sepolia.etherscan.io/address/0x1f435a7F2dA358caF887A470FAeEE7d5D5f4eFBA) |
| **L1 → L2 Inbox**                       | [`0x603B06cEcC1d537Aad83f1d46651e32014c5B6aD`](https://etherscan.io/address/0x603B06cEcC1d537Aad83f1d46651e32014c5B6aD) | [`0x7cdC32Dd7d008870A95f1837Ffd7229ef676EF8A`](https://sepolia.etherscan.io/address/0x7cdC32Dd7d008870A95f1837Ffd7229ef676EF8A) |
| **L2 → L1 Outbox**                      | [`0xFD2a12658A82d7156DA56c7A8d49A69fC966c8D1`](https://etherscan.io/address/0xFD2a12658A82d7156DA56c7A8d49A69fC966c8D1) | [`0xA5A0f7a7BDAf280964a1922A68C83462E5F6E15b`](https://sepolia.etherscan.io/address/0xA5A0f7a7BDAf280964a1922A68C83462E5F6E15b) |
| **Fee Juice**                           | [`0xA27EC0006e59f245217Ff08CD52A7E8b169E62D2`](https://etherscan.io/address/0xA27EC0006e59f245217Ff08CD52A7E8b169E62D2) | [`0x762C132040fdA6183066Fa3B14d985ee55aA3C18`](https://sepolia.etherscan.io/address/0x762C132040fdA6183066Fa3B14d985ee55aA3C18) |
| **Staking Asset**                       | [`0xA27EC0006e59f245217Ff08CD52A7E8b169E62D2`](https://etherscan.io/address/0xA27EC0006e59f245217Ff08CD52A7E8b169E62D2) | [`0x5595cb9ED193cAc2C0Bc5393313bc6115817954B`](https://sepolia.etherscan.io/address/0x5595cb9ED193cAc2C0Bc5393313bc6115817954B) |
| **Fee Juice Portal**                    | [`0x534361be805CA30Bdb6404eC5E6cDAFFB3E9f3b3`](https://etherscan.io/address/0x534361be805CA30Bdb6404eC5E6cDAFFB3E9f3b3) | [`0xE59aCBA462a0324B1d619a7A1b219419f156f505`](https://sepolia.etherscan.io/address/0xE59aCBA462a0324B1d619a7A1b219419f156f505) |
| **Fee Asset Handler**                   | N/A | [`0x5602c39A6E9C5AcE589F64F754927bcDa4f4BFc9`](https://sepolia.etherscan.io/address/0x5602c39A6E9C5AcE589F64F754927bcDa4f4BFc9) |
| **Coin Issuer**                         | [`0x02FAdF157d551aa6d761b2A2237D03Af68E41CA6`](https://etherscan.io/address/0x02FAdF157d551aa6d761b2A2237D03Af68E41CA6) | [`0xE05d0A62045b4237556C1EC423e59eEa9A24EAeE`](https://sepolia.etherscan.io/address/0xE05d0A62045b4237556C1EC423e59eEa9A24EAeE) |
| **Reward Distributor**                  | [`0x555bAAc4757A89f1CE0c84fA35afE9dD7aa8E1d3`](https://etherscan.io/address/0x555bAAc4757A89f1CE0c84fA35afE9dD7aa8E1d3) | [`0x83B2A93EF343cAb7Be9D8Bba7317f314975e5CB0`](https://sepolia.etherscan.io/address/0x83B2A93EF343cAb7Be9D8Bba7317f314975e5CB0) |
| **Reward Booster**                      | [`0x1b0bDD2Da1bD5Ea8541631A3F8647d8C178e4BCe`](https://etherscan.io/address/0x1b0bDD2Da1bD5Ea8541631A3F8647d8C178e4BCe) | [`0xF2ca5f3FC4cf3106a693685E33BDd3f2135ef348`](https://sepolia.etherscan.io/address/0xF2ca5f3FC4cf3106a693685E33BDd3f2135ef348) |
| **Governance Proposer**                 | [`0x06Ef1DcF87E419C48B94a331B252819FADbD63ef`](https://etherscan.io/address/0x06Ef1DcF87E419C48B94a331B252819FADbD63ef) | [`0x01C7D4ca153748D2377968Fef22894cB162E9480`](https://sepolia.etherscan.io/address/0x01C7D4ca153748D2377968Fef22894cB162E9480) |
| **Governance**                          | [`0x1102471Eb3378FEE427121c9EfcEa452E4B6B75e`](https://etherscan.io/address/0x1102471Eb3378FEE427121c9EfcEa452E4B6B75e) | [`0xCAf7447721447B22Cd0076aC7C63877c3AFD329F`](https://sepolia.etherscan.io/address/0xCAf7447721447B22Cd0076aC7C63877c3AFD329F) |
| **Governance Staking Escrow**           | [`0xa92ecFD0E70c9cd5E5cd76c50Af0F7Da93567a4f`](https://etherscan.io/address/0xa92ecFD0E70c9cd5E5cd76c50Af0F7Da93567a4f) | [`0xb6A38A51a6C1de9012f9d8EA9745ef957212eAaC`](https://sepolia.etherscan.io/address/0xb6A38A51a6C1de9012f9d8EA9745ef957212eAaC) |
| **Staking Registry**                    | [`0x042dF8f42790d6943F41C25C2132400fd727f452`](https://etherscan.io/address/0x042dF8f42790d6943F41C25C2132400fd727f452) | [`0xC6EcC1832c8BF6a41c927BEb4E9ec610FBeDd1C2`](https://sepolia.etherscan.io/address/0xC6EcC1832c8BF6a41c927BEb4E9ec610FBeDd1C2) |
| **Slash Factory**                       | N/A                                                                                                                     | N/A |
| **Slasher**                             | [`0x08B364720b6E4C2089FBdD8A6A722F474013a2B7`](https://etherscan.io/address/0x08B364720b6E4C2089FBdD8A6A722F474013a2B7) | [`0xaFfC002e2dA0A45176ed6015604aC1fFF1b55fA7`](https://sepolia.etherscan.io/address/0xaFfC002e2dA0A45176ed6015604aC1fFF1b55fA7) |
| **Tally Slashing Proposer**             | [`0xa2Ff1BF784D6B1D7Ba1BfD67c3538B85F9f85295`](https://etherscan.io/address/0xa2Ff1BF784D6B1D7Ba1BfD67c3538B85F9f85295) | [`0x11E38CFf51ee20142Eb1eBb9Bd0A3f7934aA9B65`](https://sepolia.etherscan.io/address/0x11E38CFf51ee20142Eb1eBb9Bd0A3f7934aA9B65) |
| **Honk Verifier**                       | [`0x09ae3B0362bCce6E447ce4130c4963630b5a67db`](https://etherscan.io/address/0x09ae3B0362bCce6E447ce4130c4963630b5a67db) | [`0x4DD7F03FFa501c699F2B7Fe4eCA460aC0FdA7B00`](https://sepolia.etherscan.io/address/0x4DD7F03FFa501c699F2B7Fe4eCA460aC0FdA7B00) |
| **Register New Rollup Version Payload** | N/A                                                                                                                     | N/A                                                                                                                             |
| **Slash Payload Cloneable**             | [`0xe27d563BCeEa9b11d759609Cf40E2b4D8001117B`](https://etherscan.io/address/0xe27d563BCeEa9b11d759609Cf40E2b4D8001117B) | [`0x7C47D3A168af1edaA94521Ff1164916feEF9233C`](https://sepolia.etherscan.io/address/0x7C47D3A168af1edaA94521Ff1164916feEF9233C) |

### L2 contract addresses

| Contract Name            | Alpha (Mainnet)                                                      | Testnet                                                              |
| ------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Instance Registry**    | `0x0000000000000000000000000000000000000000000000000000000000000002` | `0x0000000000000000000000000000000000000000000000000000000000000002` |
| **Class Registry**       | `0x0000000000000000000000000000000000000000000000000000000000000001` | `0x0000000000000000000000000000000000000000000000000000000000000001` |
| **MultiCall Entrypoint** | `0x2d464e835406c6057bf147843d1541e0b338a13f8fedd5cba697629172dd8105` | `0x2d464e835406c6057bf147843d1541e0b338a13f8fedd5cba697629172dd8105` |
| **Fee Juice**            | `0x0000000000000000000000000000000000000000000000000000000000000003` | `0x0000000000000000000000000000000000000000000000000000000000000003` |
| **SponsoredFPC**         | Not deployed | `0x2d8fff82a3b0c15d0a89169e7d8d043e079ab94d52031f1de1e4972ebad169d3` |

## Governance parameters

| Parameter               | Alpha (Mainnet) | Testnet   |
| ----------------------- | --------------- | --------- |
| **Proposer Quorum**     | 600/1000        | 60/100    |
| **Voting Delay**        | 3 days          | 2 minutes |
| **Voting Duration**     | 7 days          | 6 minutes |
| **Execution Delay**     | 2 days          | 2 minutes |
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
- **Tracking what is coming.** Watch [Releases](https://github.com/aztec-labs-eng/aztec-node/releases) for the current stable, any RCs in flight, and nightly tags. A public release calendar is on the roadmap; until then, the releases page is the authoritative timeline.

## Next steps

Based on your use case:

- **Building an application?** Start with [Getting started](/developers/getting_started_on_local_network).
- **Running infrastructure?** Review the [Network operator guide](/operate/operators).
- **Joining as a sequencer?** See [Sequencer management](/operate/operators/setup/sequencer_management).
- **Tracking releases?** See [Versions and releases](#versions-and-releases) above and the [GitHub releases page](https://github.com/aztec-labs-eng/aztec-node/releases).
