---
title: Migrating from Sandbox to Testnet
tags: [sandbox, testnet]
draft: true
---

This guide assumes you have an Aztec app on sandbox and you wish to deploy it onto testnet. If you have never worked with sandbox or testnet, you might want to check out the [getting started on testnet guide](./developers/guides/local_env/getting_started_on_testnet.md).

## Accounts and PXE

//TODO How to start the PXE and connect it to testnet

## Paying for fees

There are multiple ways to pay for fees on testnet. You can use the faucet, which is a contract on L1, and then bridge the tokens to Aztec. You can also use a sponsored fee payer. Read the full guide [here](//TODO).

## Testnet versioning

//TODO

## Some things to note
-
- All contracts, including account contracts and the sponsored FPC, will need to be registered in the PXE
- There will be no 'test accounts' automatically deployed, so you may need to change your Aztec.js scripts and tests
- Transactions take longer to be mined on testnet than in sandbox, so you may see timeout errors. The transaction is still sent and is still visible on a block explorer - it just needs more time for it to be mined. It is worth noting this when handling errors in your apps, so that users do not think their transaction has failed

//TODO difference between testnet /sandbox (local vs remote, # nodes, block times, proving, etc)

## Next Steps

To play more with the Aztec testnet, check out these:

- [Aztec Playground](https://play.aztec.network/)
- [Ecosystem](https://www.aztec.network/ecosystem)
- [Guide to run a node](../../../run_node/index.md)
