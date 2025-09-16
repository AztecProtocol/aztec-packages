---
title: Try Testnet
keywords: [testnet, aztec, migration]
tags: [testnet, migration]
id: try_testnet
description: "Connect to Aztec Alpha Testnet, explore the ecosystem, and start building with live network resources"
---

## Explore testnet

- [Read the announcement in our blog](https://aztec.network/blog)
- [Check out our growing ecosystem of explorers, bridges, wallets, apps, and more](https://aztec.network/ecosystem)

## Take part

- [Run a node](./the_aztec_network/guides/run_nodes/how_to_run_sequencer.md)
- [Interact with testnet using Playground, a tool for deploying & interacting with contracts](https://play.aztec.network/)
- [Get inspiration for what you could build](https://github.com/AztecProtocol/Horizon)

## Develop on Aztec Testnet

- Follow the [getting started on testnet guide](./developers/guides/getting_started_on_testnet.md)
- Try the [`testnet` branch of the Aztec Starter template Github repo](https://github.com/AztecProtocol/aztec-starter/tree/testnet)
- Follow our [tutorials](./developers/tutorials/contract_tutorials/counter_contract.md) in order to write your first contract, deploy it, and interact with it using Aztec CLI and Aztec.js

## Chain Information

**Version**: `#include_testnet_version`

**Node URL**: `https://aztec-alpha-testnet-fullnode.zkv.xyz`

**L1 Chain ID**: `11155111`

**Rollup Version**: `3924331020`

**Node ENR**:

<!-- cspell:disable -->

`enr:-M24QDZDoyfM7Ys5Y7M0kSmwarvlywtVmciWA-cT8qw6RTgqDnJDtUjULKQKNVOutHhrsHDwo0lFNtRLM_Q1zAVa3n4HhWF6dGVjsTAwLTExMTU1MTExLTIxNmYwNzE2LTM5MjQzMzEwMjAtMDBkMDk4MDYtMWE1MDc5YjWCaWSCdjSCaXCEJRuLyIlzZWNwMjU2azGhA1k50LogNpVrOJ5Gc3jxHWCN7KillKXv_LaWVCvYP8nJg3RjcIKeNIN1ZHCCnjSDdmVyhTEuMS4y`

<!-- cspell:enable -->

## Core L1 and L2 Precompiles and Contracts

### L1 Contract Addresses

| Contract Name             | Address                                      |
| ------------------------- | -------------------------------------------- |
| Rollup                    | `0x216f071653a82ced3ef9d29f3f0c0ed7829c8f81` |
| Registry                  | `0xec4156431d0f3df66d4e24ba3d30dcb4c85fa309` |
| L1 → L2 Inbox             | `0xc653855532932ab3d42b236b20c027d824c4834b` |
| L2 → L1 Outbox            | `0xdb4f4c5cc724a3e4e3e9ad7b48eb3e02002ae936` |
| Fee Juice                 | `0x98e8e6792eff2b956b6beb7da05965a8c9441722` |
| Staking Asset             | `0x0c04089ed32638ae3cdf649f54f90544ac3fc199` |
| Fee Juice Portal          | `0x47e85e305e971c7d19fca8cb582d1f9629d0b26d` |
| Coin Issuer               | `0x3b218d0f26d15b36c715cb06c949210a0d630637` |
| Reward Distributor        | `0x2d513c8a3f551a5fdbd33be7c1fcb472172bf759` |
| Governance Proposer       | `0x76beb64eaee34eefdd747a848ba0e99faf650bc6` |
| Governance                | `0x1b504af897af5fdf7e534a8809c88e15331814b8` |
| Slash Factory             | `0x8b1566249dc8fb47234037538ce491f9500480b1` |
| Fee Asset Handler         | `0x4f0376b8bcbdf72ddb38c38f48317c00e9c9aec3` |
| Governance Staking Escrow | `0xd4b08bbb0844438a2020cd2bfc736a3f95b60458` |

### L2 Contract Addresses

| Contract Name     | Address                                                              |
| ----------------- | -------------------------------------------------------------------- |
| Class Registry    | `0x0000000000000000000000000000000000000000000000000000000000000003` |
| Fee Juice         | `0x0000000000000000000000000000000000000000000000000000000000000005` |
| Instance Registry | `0x0000000000000000000000000000000000000000000000000000000000000002` |
| MultiCall         | `0x0000000000000000000000000000000000000000000000000000000000000004` |
| Sponsored FPC     | `0x19b5539ca1b104d4c3705de94e4555c9630def411f025e023a13189d0c56f8f2` |
