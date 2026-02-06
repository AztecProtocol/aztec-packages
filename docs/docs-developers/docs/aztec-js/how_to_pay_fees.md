---
title: Paying Fees
tags: [fees, transactions, accounts, mana, gas]
sidebar_position: 7
description: Pay transaction fees on Aztec, understand mana costs, estimate gas, and retrieve fees from receipts.
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

## Mana and Fee Juice

Mana is Aztec's unit of computational effort (like gas on Ethereum), and Fee Juice is the native fee token used to pay for transactions. For a detailed explanation of these concepts, see [Fee Concepts](../foundational-topics/fees.md).

## Estimate mana costs

Before sending a transaction, you can estimate the mana it will consume by simulating with `estimateGas: true`:

```typescript
const { estimatedGas } = await contract.methods
  .myFunction(arg1, arg2)
  .simulate({
    from: sender.address,
    fee: { estimateGas: true, estimatedGasPadding: 0.1 },
  });
```

The `estimatedGas` object contains:

- `gasLimits.daGas` - Estimated DA mana for main execution
- `gasLimits.l2Gas` - Estimated L2 mana for main execution
- `teardownGasLimits.daGas` - Estimated DA mana for teardown phase
- `teardownGasLimits.l2Gas` - Estimated L2 mana for teardown phase

### Calculate expected fee from estimate

To calculate the expected fee from estimated gas, use the `computeFee` method with current network fees:

```typescript
// import { createAztecNodeClient } from '@aztec/aztec.js/node';
// const aztecNode = createAztecNodeClient('http://localhost:8080');
const currentFees = await aztecNode.getCurrentMinFees();
const estimatedFee = estimatedGas.gasLimits.computeFee(currentFees).toBigInt();
console.log("Estimated fee:", estimatedFee);
```

:::tip
The `estimatedGasPadding` parameter adds a safety margin to the estimate. A value of `0.1` adds 10% padding. Use higher padding for transactions with variable gas costs.
:::

## Get transaction fee from receipt

After a transaction is mined, you can retrieve the fee paid from the receipt:

```typescript
const receipt = await contract.methods
  .myFunction(arg1, arg2)
  .send({ from: sender.address })
  .wait();

console.log("Transaction fee:", receipt.transactionFee);
```

The `transactionFee` field is a `bigint` representing the total fee paid in the fee token (Fee Juice). You can also check execution status:

```typescript
if (receipt.hasExecutionSucceeded()) {
  console.log("Transaction succeeded in block:", receipt.blockNumber);
  console.log("Fee paid:", receipt.transactionFee);
} else {
  console.log("Transaction failed:", receipt.error);
}
```

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

#include_code sponsored_fpc_simple yarn-project/end-to-end/src/e2e_fees/sponsored_payments.test.ts typescript

### Use other Fee Paying Contracts

Third-party FPCs can pay for your fees using custom logic, such as accepting different tokens instead of Fee Juice.

#### Set gas settings

```typescript
import { GasSettings } from "@aztec/stdlib/gas";

const maxFeesPerGas = (await node.getCurrentMinFees()).mul(1.5); //adjust this to your needs
const gasSettings = GasSettings.default({ maxFeesPerGas });
```

Private FPCs enable fee payments without revealing the payer's identity onchain:

#include_code private_fpc_payment yarn-project/end-to-end/src/composed/e2e_local_network_example.test.ts typescript

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

### Understanding gas dimensions

Gas settings specify limits and fees for both DA and L2 dimensions:

- **gasLimits**: Maximum mana for main execution phase
- **teardownGasLimits**: Maximum mana for teardown phase (used by FPCs for refunds)
- **maxFeesPerGas**: Maximum price you're willing to pay per mana unit
- **maxPriorityFeesPerGas**: Priority fee for faster inclusion

The fee limit is calculated as `gasLimits × maxFeesPerGas` for each dimension.

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
