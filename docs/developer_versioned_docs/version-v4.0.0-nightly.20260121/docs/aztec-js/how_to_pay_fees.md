---
title: Paying Fees
tags: [fees, transactions, accounts]
sidebar_position: 7
description: Pay transaction fees on Aztec using different payment methods and fee paying contracts.
---

import { Fees } from '@site/src/components/Snippets/general_snippets';

This guide walks you through paying transaction fees on Aztec using various payment methods.

## Prerequisites

- Running Aztec local network
- Deployed account wallet
- Understanding of [fee concepts](../foundational-topics/fees.md)

:::info
<Fees.FeeAsset_NonTransferrable />
:::

## Payment methods overview

| Method              | Use Case                      | Privacy | Requirements               |
| ------------------- | ----------------------------- | ------- | -------------------------- |
| Fee Juice (default) | Account already has Fee Juice | Public  | Funded account             |
| Sponsored FPC       | Testing, free transactions    | Public  | None                       |
| Private FPC         | Pay with tokens privately     | Private | Token balance, FPC address |
| Public FPC          | Pay with tokens publicly      | Public  | Token balance, FPC address |
| Bridge + Claim      | Bootstrap from L1             | Public  | L1 ETH for gas             |

## Pay with Fee Juice

Fee Juice is the native fee token on Aztec.

If your account has Fee Juice (for example, from a faucet), is [deployed](./how_to_create_account.md), and is registered in your wallet, it will be used automatically to pay for the fee of the transaction:

```typescript
const tx = await contract.methods
  .myFunction(param1, param2)
  .send({
    from: fundedAccount.address,
    // no fee payment method needed
  })
  .wait();

console.log("Transaction fee:", tx.transactionFee);
```

## Use Fee Payment Contracts

Fee Payment Contracts (FPC) pay fees on your behalf, typically accepting a different token than Fee Juice. Since Fee Juice is non-transferable on L2, FPCs are the most common fee payment method.

### Sponsored Fee Payment Contracts

The Sponsored FPC pays for fees unconditionally without requiring payment in return. It is available on both the local network and the testnet (deployed by Aztec Labs).

You can derive the Sponsored FPC address from its deployment parameters and salt (which defaults to `0`):

```typescript
import { SponsoredFPCContract } from "@aztec/noir-contracts.js/SponsoredFPC";
import { getContractInstanceFromInstantiationParams } from "@aztec/stdlib/contract";
import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee/testing";
import { Fr } from "@aztec/aztec.js/fields";

const sponsoredFPCInstance = await getContractInstanceFromInstantiationParams(
  SponsoredFPCContract.artifact,
  {
    salt: new Fr(0),
  }
);
```

Register the contract with your wallet before using it:

```typescript
await wallet.registerContract(
  sponsoredFPCInstance,
  SponsoredFPCContract.artifact
);
```

Then use it to pay for transactions:

```typescript title="sponsored_fpc_simple" showLineNumbers 
const bananasToSendToBob = 10n;
const tx = await bananaCoin.methods
  .transfer_in_public(aliceAddress, bobAddress, bananasToSendToBob, 0)
  .send({
    from: aliceAddress,
    fee: {
      gasSettings,
      paymentMethod: new SponsoredFeePaymentMethod(sponsoredFPC.address),
    },
  })
  .wait();
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260121/yarn-project/end-to-end/src/e2e_fees/sponsored_payments.test.ts#L57-L69" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/e2e_fees/sponsored_payments.test.ts#L57-L69</a></sub></sup>


### Use other Fee Paying Contracts

Third-party FPCs can pay for your fees using custom logic, such as accepting different tokens instead of Fee Juice.

#### Set gas settings

```typescript
import { GasSettings } from "@aztec/stdlib/gas";

const maxFeesPerGas = (await node.getCurrentMinFees()).mul(1.5); //adjust this to your needs
const gasSettings = GasSettings.default({ maxFeesPerGas });
```

Private FPCs enable fee payments without revealing the payer's identity onchain:

```typescript title="private_fpc_payment" showLineNumbers 
// The private fee paying method assembled on the app side requires knowledge of the maximum
// fee the user is willing to pay
const maxFeesPerGas = (await node.getCurrentMinFees()).mul(1.5);
const gasSettings = GasSettings.default({ maxFeesPerGas });
const paymentMethod = new PrivateFeePaymentMethod(bananaFPCAddress, alice, wallet, gasSettings);
const receiptForAlice = await bananaCoin.methods
  .transfer(bob, amountTransferToBob)
  .send({ from: alice, fee: { paymentMethod } })
  .wait();
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260121/yarn-project/end-to-end/src/composed/e2e_local_network_example.test.ts#L184-L194" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/composed/e2e_local_network_example.test.ts#L184-L194</a></sub></sup>


Public FPCs can be used in the same way:

```typescript
import { PublicFeePaymentMethod } from "@aztec/aztec.js/fee";

const paymentMethod = new PublicFeePaymentMethod(
  fpcAddress,
  senderAddress,
  wallet,
  gasSettings
);
```

## Bridge Fee Juice from L1

Fee Juice is non-transferable on L2, but you can bridge it from L1, claim it on L2, and use it. This involves a few components that are part of a running network's infrastructure:

- An L1 fee juice contract
- An L1 fee juice portal
- An L2 fee juice portal
- An L2 fee juice contract

`aztec.js` provides helpers to simplify the process:

```typescript
// essentially returns an extended wallet from Viem
import { createExtendedL1Client } from "@aztec/ethereum";
const walletClient = createExtendedL1Client(
  ["https://your-ethereum-host"], // ex. http://localhost:8545 on the local network (yes it runs Anvil under the hood)
  privateKey // the private key for some account, needs funds for gas!
);

// a helper to interact with the L1 fee juice portal
import { L1FeeJuicePortalManager } from "@aztec/aztec.js/ethereum";
const portalManager = await L1FeeJuicePortalManager.new(
  node, // your Aztec node, ex. https://aztec-testnet-fullnode.zkv.xyz, or http://localhost:8080 for local network
  walletClient,
  logger // a logger, ex. import { createLogger } from "@aztec/aztec.js"
);
```

Under the hood, `L1FeeJuicePortalManager` gets the L1 addresses from the node `node_getNodeInfo` endpoint. It then exposes an easy method `bridgeTokensPublic` which mints fee juice on L1 and sends it to an L2 address via the L1 portal:

```typescript
const claim = await portalManager.bridgeTokensPublic(
  acc.address, // the L2 address
  1000000000000000000000n, // the amount to send to the L1 portal
  true // whether to mint or not (set to false if your walletClient account already has fee juice!)
);

console.log("Claim secret:", claim.claimSecret);
console.log("Claim amount:", claim.claimAmount);
```

After this transaction is minted on L1 and a few blocks pass, you can claim the message on L2 and use it directly to pay for fees:

```typescript
import { FeeJuicePaymentMethodWithClaim } from "@aztec/aztec.js/fee";

// Use the claim from bridgeTokensPublic to pay for a transaction
const paymentMethod = new FeeJuicePaymentMethodWithClaim(acc.address, claim);
const receipt = await contract.methods
  .myFunction()
  .send({ from: acc.address, fee: { gasSettings, paymentMethod } })
  .wait();
```

## Configure gas settings

### Set custom gas limits

Set custom gas limits by importing from `stdlib`:

```typescript
import { GasSettings } from "@aztec/stdlib/gas";

const gasSettings = GasSettings.from({
  gasLimits: { daGas: 100000, l2Gas: 100000 },
  teardownGasLimits: { daGas: 10000, l2Gas: 10000 },
  maxFeesPerGas: { daGas: 10, l2Gas: 10 },
  maxPriorityFeesPerGas: { daGas: 1, l2Gas: 1 },
});

const tx = await contract.methods
  .myFunction()
  .send({
    from: sender.address,
    fee: {
      paymentMethod,
      gasSettings,
    },
  })
  .wait();
```

### Use automatic gas estimation

```typescript
const tx = await contract.methods
  .myFunction()
  .send({
    from: sender.address,
    fee: {
      paymentMethod,
      estimateGas: true,
      estimatedGasPadding: 0.2, // 20% padding
    },
  })
  .wait();
```

:::tip
Gas estimation runs a simulation first to determine actual gas usage, then adds padding for safety. This works with all payment methods, including FPCs.
:::

## Next steps

- Learn about [fee concepts](../foundational-topics/fees.md) in detail
- Explore [authentication witnesses](./how_to_use_authwit.md) for delegated payments
- See [testing guide](./how_to_test.md) for fee testing strategies
