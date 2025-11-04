---
title: Try Devnet
keywords: [devnet, aztec, development]
tags: [devnet, development]
id: try_devnet
description: "Connect to Aztec Devnet, explore the development network, and start building with the latest features"
---

## Explore Devnet

- [Read the announcement in our blog](https://aztec.network/blog)
- [Check out our growing ecosystem of explorers, bridges, wallets, apps, and more](https://aztec.network/ecosystem)

## Take part

- [Run a node](./the_aztec_network/setup/sequencer_management.md)
- [Interact with devnet using Playground, a tool for deploying & interacting with contracts](https://play.aztec.network/)
- [Get inspiration for what you could build](https://github.com/AztecProtocol/Horizon)

## Develop on Aztec Devnet

- Try the [Aztec Starter Github repo](https://github.com/AztecProtocol/aztec-starter)
- Follow our [tutorials](./developers/docs/tutorials/contract_tutorials/counter_contract.md) to write your first contract
- Test the latest features and improvements before they reach testnet

## Chain Information

**RPC URL**: `https://devnet.aztec-labs.com`

**Version / Github Tag**: `v3.0.0-devnet.4`

**L1 Chain ID**: `11155111` (Sepolia)

**Rollup Version**: `1667575857`

**ENR**:
```
-Na4QDO8LfoSfCpWFbMPHwYZegt9P--3X8XCRmwuXD1SEtxdD2kx4K-ue5VuwG4DOWqDbsxLQ9Ja3Mr6OSmjV-8x-ToHhWF6dGVjsTAwLTExMTU1MTExLWIwNWYzNmM5LTE2Njc1NzU4NTctMjc2MzhiZjMtMDY4YTc5ZTiCaWSCdjSCaXCEIpEKG4lzZWNwMjU2azGhAvyGRkH6p8gsIWyI6vmqHxMIqAweVkShKk3mjGfL7e2Gg3RjcIKd0IN1ZH CCndCDdmVyjjMuMC4wLWRldm5ldC4y
```

## Core L1 Contract Addresses

| Contract Name             | Address                                      |
| ------------------------- | -------------------------------------------- |
| Registry                  | `0x9017a63e26eaf1197c49b4315a9f32a771abeea7` |
| Rollup                    | `0xb05f36c9dffa76f0af639385ef44d5560e0160c1` |
| L1 → L2 Inbox             | `0x33631b33f335e249279db08b9b7272c9906c1405` |
| L2 → L1 Outbox            | `0xfe37ceedec5674805fdc3cd5ca8aa6ca656cbfb9` |
| Fee Juice                 | `0xa9144418460188c2b59914e6a7cb01deb1e019d7` |
| Staking Asset             | `0xdcaca47b74caf5c14ce023597f0e3b67e1f14496` |
| Fee Juice Portal          | `0xeea84a878a3fd52d14e7820dddb60d35219b9cd9` |
| Coin Issuer               | `0x48ab541e0f60e3138f6f24c5cc72993ffcdca462` |
| Reward Distributor        | `0x4833dacefe705e31200d071a04d17bd29e2c740c` |
| Governance                | `0x6af3cc6c09a72b5a0ab772f37fd7b719569f27b9` |
| Governance Proposer       | `0x4194937ab0bb3b1b4b1b1d770bb8577a0500911b` |
| Slash Factory             | `0x4926e1bd0ba4c9f477c57ce7311c62d4075dca5c` |
| Fee Asset Handler         | `0x252a71fc243812f747fc4782dea865a260ef81c9` |
| GSE                       | `0xeee2d3289dff43909b935da9ef2121fdcad8773f` |

## Protocol Contract Addresses (L2)

| Contract Name          | Address |
| ---------------------- | ------- |
| Class Registry         | `0x0000000000000000000000000000000000000000000000000000000000000003` |
| Instance Registry      | `0x0000000000000000000000000000000000000000000000000000000000000002` |
| Multi Call Entrypoint  | `0x0000000000000000000000000000000000000000000000000000000000000004` |
| Fee Juice              | `0x0000000000000000000000000000000000000000000000000000000000000005` |
| Sponsored FPC          | `0x280e5686a148059543f4d0968f9a18cd4992520fcd887444b8689bf2726a1f97` |

## Differences from Testnet

Devnet is our development network where new features are tested before being deployed to testnet:

- More frequent updates and potential breaking changes
- Experimental features may be enabled
- Network may be reset more frequently
- Lower stability guarantees compared to testnet

## Getting Help

- Join our [Discord](https://discord.gg/aztec) for developer support
- Check the [forum](https://forum.aztec.network) for discussions
- Report issues on [GitHub](https://github.com/AztecProtocol/aztec-packages/issues)