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

If your account has Fee Juice (for example, from a faucet), is [deployed](./how_to_create_account.md), and is registered in your wallet, you can pay for a function call using the `FeeJuicePaymentMethod`:

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

## Use Fee Payment Contracts

Fee Payment Contracts (FPC) pay fees on your behalf, typically accepting a different token than Fee Juice. Since Fee Juice is non-transferable on L2, FPCs are the most common fee payment method.

### Sponsored Fee Payment Contracts

The Sponsored FPC pays for fees unconditionally without requiring payment in return. It is available on both the sandbox and the testnet (deployed by Aztec Labs).

You can derive the Sponsored FPC address from its deployment parameters and salt (which defaults to `0`):

```typescript
import { SponsoredFPCContract } from "@aztec/noir-contracts.js/SponsoredFPC";
import { getContractInstanceFromInstantiationParams, SponsoredFeePaymentMethod } from '@aztec/aztec.js';

const sponsoredFPCInstance = await getContractInstanceFromInstantiationParams(SponsoredFPCContract.artifact, {
  salt: new Fr(0),
});
```

Register the contract with your wallet before deploying and using it:

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

### Use other Fee Paying Contracts

Third-party FPCs can pay for your fees using custom logic, such as accepting different tokens instead of Fee Juice.

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

Public FPCs can be used in the same way:

```typescript

import { PublicFeePaymentMethod } from '@aztec/aztec.js';

const paymentMethod = new PublicFeePaymentMethod(
    fpcAddress,
    senderAddress,
    wallet
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
import { createExtendedL1Client } from '@aztec/ethereum';
const walletClient = createExtendedL1Client(
    ['https://your-ethereum-host'], // ex. http://localhost:8545 on the Sandbox (yes it runs Anvil under the hood)
    privateKey // the private key for some account, needs funds for gas!
);

// a helper to interact with the L1 fee juice portal
import { L1FeeJuicePortalManager } from '@aztec/aztec.js';
const portalManager = await L1FeeJuicePortalManager.new(
    node, // your Aztec node, ex. https://aztec-testnet-fullnode.zkv.xyz, or http://localhost:8080 for Sandbox
    walletClient,
    logger, // a logger, ex. import { createLogger } from "@aztec/aztec.js"
)
```

Under the hood, `L1FeeJuicePortalManager` gets the L1 addresses from the node `node_getNodeInfo` endpoint. It then exposes an easy method `bridgeTokensPublic` which mints fee juice on L1 and sends it to an L2 address via the L1 portal:

```typescript
const claim = await portalManager.bridgeTokensPublic(
    acc.address, // the L2 address
    1000000000000000000000n, // the amount to send to the L1 portal
    true, // whether to mint or not (set to false if your walletClient account already has fee juice!)
);

console.log('Claim secret:', claim.claimSecret);
console.log('Claim amount:', claim.claimAmount);
```

After this transaction is minted on L1 and a few blocks pass, you can claim the message on L2 and use it directly to pay for fees:

```typescript
import { FeeJuicePaymentMethodWithClaim } from '@aztec/aztec.js';
const feeJuiceWithClaim = new FeeJuicePaymentMethodWithClaim(acc.address, claim) // the l2 address and the claim

yourContract.methods.some_method(acc.address).send({ from: acc.address, fee: { paymentMethod: feeJuiceWithClaim } }).wait()
```


:::tip Creating blocks

To advance time quickly, send a couple of dummy transactions and `.wait()` for them. For example:

```typescript
// using the `sponsoredFeePaymentMethod` so the network has transactions to build blocks with!
await contract.methods.some_other_method(acc.address).send({ from: acc.address, fee: { paymentMethod: sponsoredFeePaymentMethod } }).wait();
await contract.methods.some_other_method(acc.address).send({ from: acc.address, fee: { paymentMethod: sponsoredFeePaymentMethod } }).wait();
```

This will add a transaction to each block!

:::


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
