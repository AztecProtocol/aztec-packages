---
title: Migrating from Sandbox to Testnet
tags: [sandbox, testnet]
---

import { AztecTestnetVersion } from '@site/src/components/Snippets/general_snippets';

This guide assumes you have an Aztec app on sandbox and you wish to deploy it onto testnet. If you have never worked with sandbox or testnet, you might want to check out the [getting started on testnet guide](./developers/getting_started.md).

## Main differences

- The testnet is a remote environment. The sandbox runs locally. You will be running your contracts on a network of sequencers and other contracts and connecting to them via the Private Execution Environment (PXE).
- The testnet always has proving enabled. Users will prove private transactions and network provers prove public execution of blocks. Proving may take longer on testnet
- The testnet always has fees enabled. You will need to pay fees, or sponsor fees, when sending a transaction
- Testnet block times are longer than sandbox (they are about 36 seconds on average, and much longer to settle on L1), so your transaction may take longer to mine and be included in a block

:::warning

The testnet is version dependent. It is currently running version `0.87.9`. Maintain version consistency when interacting with the testnet to reduce errors.

:::

## Sandbox, nodes, and PXE

To connect a local PXE to testnet, install the testnet version of the sandbox.

```sh
aztec-up -v latest
```

When you run `aztec-wallet` commands, make sure to include a `node-url` option. An example:

```sh
export NODE_URL=https://aztec-alpha-testnet-fullnode.zkv.xyz
aztec-wallet create-account -a main --register-only --node-url $NODE_URL
```

You can find a full flow in the [getting started on testnet](./developers/getting_started.md) guide.

Instead of running a PXE locally, you can also use one directly with AztecJS in your app. For this, you will need to connect to an Aztec node and initialize the PXE.

In the browser:

```javascript
import { createPXEService } from "@aztec/pxe/client/lazy";
```

In Node.js

```javascript
import { createPXEService } from "@aztec/pxe/server";
```

Then initialize the PXE:

```javascript
const pxe = await createPXEService(node, pxeConfig);
```

### PXE configuration

In node.js, for example, you can initialize the PXE with the following code:

```javascript
import { createAztecNodeClient } from "@aztec/aztec.js";
import { getPXEServiceConfig } from "@aztec/pxe/server";
import { createStore } from "@aztec/kv-store/lmdb";

const node = createAztecNodeClient(PXE_URL);
const l1Contracts = await node.getL1ContractAddresses();
const config = getPXEServiceConfig();
const fullConfig = { ...config, l1Contracts };

const store = await createStore("pxe1", {
  dataDirectory: "store",
  dataStoreMapSizeKB: 1e6,
});

const pxe = await createPXEService(node, fullConfig, { store });
```

## Paying for fees

There are multiple ways to pay for fees on testnet:

- The user pays for their own (in which case you will need to send them tokens, or get them to use the faucet)
- It is sponsored by your own contract
- It is sponsored by the canonical sponsored fee payment contract (FPC) deployed to testnet. Read more about using a Sponsored FPC in Aztec.js [here](./developers/guides/js_apps/pay_fees.md#sponsored-fee-paying-contract) or via the [CLI here](./developers/reference/environment_reference/cli_wallet_reference#sponsored-fee-paying-contract).

You can learn more about all of the ways to pay for transaction fees [here](./developers/guides/js_apps/pay_fees.md).

You will need to specify the fee-payer for all transactions. An example using `aztec-wallet`:

```sh
aztec-wallet create-account --payment method=fee_juice,feePayer=main --node-url $NODE_URL
```

An example using Aztec.js:

```javascript
const receiptForBob = await bananaCoin
  .withWallet(bobWallet)
  .methods.transfer(alice, amountTransferToAlice)
  .send({ fee: { paymentMethod: sponsoredPaymentMethod } })
  .wait();
```

To learn more about using the faucet or the sponsored fee payment method, read the full fees guide [here](./developers/tutorials/codealong/first_fees.md).

## Portals

### L1 to L2 messages

In the sandbox, an L1 to L2 message is available after two blocks have progressed on L2. This is often instigated by triggering two arbitrary transactions after the L1 transaction that creates the message.

On testnet, waiting ~1.5-2 minutes should be enough to allow the message to be made available on L2.

### L2 to L1 messages

On testnet,L2 to L1 messages are only available to be consumed on L1 after a block has been finalized on L1. This typically takes ~30 minutes.

## Some things to note

- All contracts, including account contracts and the sponsored FPC, will need to be registered in the PXE
- There will be no 'test accounts' automatically deployed, so you may need to change your Aztec.js scripts and tests
- Transactions take longer to be mined on testnet than in sandbox, so you may see timeout errors. The transaction is still sent and is still visible on a block explorer - it just needs more time for it to be mined. It is worth noting this when handling errors in your apps, so that users do not think their transaction has failed

## Next Steps

To play more with the Aztec testnet, check out these:

- [Aztec Playground](https://play.aztec.network/)
- [Ecosystem](https://www.aztec.network/ecosystem)
- [Guide to run a node](the_aztec_network/index.md)
