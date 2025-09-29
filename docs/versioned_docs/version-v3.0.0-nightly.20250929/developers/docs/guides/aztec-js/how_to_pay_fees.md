---
title: Paying Fees
tags: [fees, transactions, accounts]
sidebar_position: 7
description: Pay transaction fees on Aztec using different payment methods and fee paying contracts.
---

import { Fees } from '@site/src/components/Snippets/general_snippets';

This guide shows you how to pay transaction fees on Aztec using various payment methods.

## Prerequisites

- Running Aztec sandbox
- Deployed account wallet
- Understanding of [fee concepts](../../concepts/fees.md)

:::info
<Fees.FeeAsset_NonTransferrable />
:::

## Pay with Fee Juice

Fee Juice is the native fee token on Aztec. Fees are paid using this token:

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

Fee Payment Contracts (FPC) are contracts that pay on your behalf, usually accepting a different token than fee-juice. Since fee-juice is non-transferrable on Aztec, this will likely be the most used way to pay for fees.

The Sponsored FPC is just an FPC that pays for your fees, except... it doesn't want anything in return. It unconditionally pays for your fees.

You can derive the Sponsored FPC address just by knowing its deployment parameters and salt (which defaults to `0`):

```typescript
import { SponsoredFPCContract } from "@aztec/noir-contracts.js/SponsoredFPC";
import { getContractInstanceFromInstantiationParams, SponsoredFeePaymentMethod } from '@aztec/aztec.js';

const sponsoredFPCInstance = await getContractInstanceFromInstantiationParams(SponsoredFPCContract.artifact, {
  salt: new Fr(0),
});

// you need to tell your PXE about this new contract
await pxe.registerContract({ instance: sponsoredFPCInstance, artifact: SponsoredFPCContract.artifact });
const sponsoredPaymentMethod = new SponsoredFeePaymentMethod(sponsoredFPCInstance.address);

// Deploy account for free
await yourAccount.deploy({
    fee: { sponsoredPaymentMethod }
}).wait();

```

## Use Other Fee Paying Contracts (FPCs)

On a different scenario, a third-party would be glad to pay for your fees using their own logic like accepting a different token instead of Fee Juice.

### Private fee payments

Pay fees privately using a private FPC:

```typescript
import { PrivateFeePaymentMethod } from '@aztec/aztec.js';

// Private FPCs enable fee payments without revealing the payer's identity onchain.
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

A Public FPC payment method would look something like:

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

You can set custom gas limits easily by importing from the `stdlib`:

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
