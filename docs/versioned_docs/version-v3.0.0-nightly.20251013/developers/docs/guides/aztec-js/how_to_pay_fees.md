---
title: Paying Fees
tags: [fees, transactions, accounts]
sidebar_position: 7
description: Pay transaction fees on Aztec using different payment methods and fee paying contracts.
---

import { Fees } from '@site/src/components/Snippets/general_snippets';

This guide walks you through paying transaction fees on Aztec using various payment methods.

## Prerequisites

- Running Aztec sandbox
- Deployed account wallet
- Understanding of [fee concepts](../../concepts/fees.md)

:::info
<Fees.FeeAsset_NonTransferrable />
:::

## Pay with Fee Juice

Fee Juice is the native fee token on Aztec.

If your account already has Fee Juice (for example, from a faucet), is [already deployed](./how_to_create_account.md), and is registered in your wallet, you can pay for a function call using the `FeeJuicePaymentMethod`:

```typescript
import { FeeJuicePaymentMethod } from '@aztec/aztec.js';

// make sure your wallet knows about this account, and that it has funds!
const paymentMethod = new FeeJuicePaymentMethod(fundedAccount.address);

const tx = await contract.methods
    .myFunction(param1, param2)
    .send({
        from: fundedAccount.address,
        fee: { // add this
            paymentMethod
        }
    })
    .wait();

console.log('Transaction fee:', tx.transactionFee);
```

### Sponsored Fee Payment Contracts

Fee Payment Contracts (FPC) pay fees on your behalf, typically accepting a different token than Fee Juice. Since Fee Juice is non-transferrable on L2, FPCs are the most common fee payment method.

The Sponsored FPC pays for fees unconditionally without requiring payment in return.

You can derive the Sponsored FPC address from its deployment parameters and salt (which defaults to `0`):

```typescript
import { SponsoredFPCContract } from "@aztec/noir-contracts.js/SponsoredFPC";
import { getContractInstanceFromInstantiationParams, SponsoredFeePaymentMethod } from '@aztec/aztec.js';

const sponsoredFPCInstance = await getContractInstanceFromInstantiationParams(SponsoredFPCContract.artifact, {
  salt: new Fr(0),
});
```

Register the contract with your Wallet before deploying and using it:

```typescript
await wallet.registerContract(sponsoredFPCInstance, SponsoredFPCContract.artifact);
const sponsoredPaymentMethod = new SponsoredFeePaymentMethod(sponsoredFPCInstance.address);

// deploy account for free
const deployMethod = await yourAccount.getDeployMethod();
const txHash = await deployMethod.send({
    from: AztecAddress.ZERO,
    fee: { paymentMethod: sponsoredPaymentMethod}
}).wait()

```

## Use other Fee Paying Contracts

Third-party FPCs can pay for your fees using custom logic, such as accepting different tokens instead of Fee Juice.

### Private fee payments

Private FPCs enable fee payments without revealing the payer's identity onchain:

```typescript
import { PrivateFeePaymentMethod } from '@aztec/aztec.js';
const paymentMethod = new PrivateFeePaymentMethod(
    fpcAddress,
    senderAddress,
    wallet
);

const tx = await contract.methods
    .myFunction(param1)
    .send({
        from: wallet.address,
        fee: {
            paymentMethod
        }
    })
    .wait();
```

Use a public FPC payment method:

```typescript

import { PublicFeePaymentMethod } from '@aztec/aztec.js';

const paymentMethod = new PublicFeePaymentMethod(
    fpcAddress,
    senderAddress,
    wallet
);

```

## Configure gas settings

### Set custom gas limits

Set custom gas limits by importing from `stdlib`:

```typescript
import { GasSettings, Gas, GasFees } from '@aztec/stdlib/gas';

const gasSettings = new GasSettings(
    new Gas(100000, 100000),      // gasLimits (DA, L2)
    new Gas(10000, 10000),         // teardownGasLimits
    new GasFees(10, 10),           // maxFeesPerGas
    new GasFees(1, 1)              // maxPriorityFeesPerGas
);

const tx = await contract.methods
    .myFunction()
    .send({
        from: wallet.address,
        fee: {
            paymentMethod,
            gasSettings
        }
    })
    .wait();
```

### Use automatic gas estimation

```typescript
const tx = await contract.methods
    .myFunction()
    .send({
        from: wallet.address,
        fee: {
            paymentMethod,
            estimateGas: true,
            estimatedGasPadding: 0.2  // 20% padding
        }
    })
    .wait();
```

:::tip
Gas estimation runs a simulation first to determine actual gas usage, then adds padding for safety.
:::

## Next steps

- Learn about [fee concepts](../../concepts/fees.md) in detail
- Explore [authentication witnesses](./how_to_use_authwit.md) for delegated payments
- See [testing guide](./how_to_test.md) for fee testing strategies
