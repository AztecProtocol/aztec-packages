---
title: How to Pay Fees
tags: [fees, transactions, accounts, cli, contracts]
sidebar_position: 3
description: This guide shows you how to pay fees for transactions in Aztec using different payment methods.
---

import { Fees, General, CLI_Fees, Gas_Settings, Gas_Settings_Components } from '@site/src/components/Snippets/general_snippets';

This guide shows you how to pay fees for transactions in Aztec using different payment methods.

**Prerequisites:**

- Aztec sandbox or testnet access
- `aztec-wallet` CLI or `aztec.js` installed
- Basic understanding of Aztec accounts and transactions

**Note:**
<Fees.FeeAsset_NonTransferrable />

## Payment Methods Overview

| Method | Use Case | Requirements |
|--------|----------|--------------|
| Sponsored FPC | First account deployment | None (free bootstrap) |
| Fee Juice (direct) | Regular transactions | Funded account |
| Fee Juice (from another account) | New account deployment | Another funded account |
| Fee Juice (bridged) | Initial funding | L1 assets |
| Custom FPC | Pay with other tokens | FPC setup |

## Quick Start: Deploy Your First Account

### Using Sponsored FPC (Bootstrap Method)

The easiest way to get started is with a sponsored FPC, available in sandbox environments.

**CLI:**

```bash
# Get the sponsored FPC address
SPONSORED_FPC_ADDRESS=$(aztec get-canonical-sponsored-fpc-address)

# Register and deploy account
aztec-wallet register-contract $SPONSORED_FPC_ADDRESS SponsoredFPC --salt 0 --from main
aztec-wallet deploy-account --from main --payment method=fpc-sponsored,fpc=$SPONSORED_FPC_ADDRESS
```

**JavaScript:**

```javascript
import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee/testing";
import { getSponsoredFPCInstance } from "../src/utils/sponsored_fpc.js";

const sponsoredFPC = await getSponsoredFPCInstance();
await pxe.registerContract({
  instance: sponsoredFPC,
  artifact: SponsoredFPCContract.artifact,
});

const paymentMethod = new SponsoredFeePaymentMethod(sponsoredFPC.address);
await accountManager.deploy({ fee: { paymentMethod } }).wait();
```

### Using Another Account's Fee Juice

If you have an existing funded account:

**CLI:**

```bash
aztec-wallet create-account -a alice --payment method=fee_juice,feePayer=test0
```

**JavaScript:**

```javascript
import { FeeJuicePaymentMethod } from "@aztec/aztec.js";

const paymentMethod = new FeeJuicePaymentMethod(fundedAccount.getAddress());
await newAccount.deploy({
  fee: {
    deployWallet: fundedAccount,
    paymentMethod
  }
}).wait();
```

## Bridging Fee Juice

### Sandbox (Free Minting)

```javascript title="get_node_info_pub_client" showLineNumbers
const nodeInfo = await pxe.getNodeInfo();

const ethereumUrl = `http://127.0.0.1:${ethereumPort}`;
const chain = createEthereumChain([ethereumUrl], nodeInfo.l1ChainId);
ethereumClient = createPublicClient({
  chain: chain.chainInfo,
  transport: fallback([http(ethereumUrl)]),
});
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/yarn-project/end-to-end/src/spartan/smoke.test.ts#L40-L49" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/spartan/smoke.test.ts#L40-L49</a></sub></sup>


```javascript
import { L1FeeJuicePortalManager } from "@aztec/aztec.js";
```

```javascript title="bridge_fee_juice" showLineNumbers
const portal = await L1FeeJuicePortalManager.new(pxe, l1Client, log);
const claim = await portal.bridgeTokensPublic(recipient, amount, true /* mint */);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/yarn-project/end-to-end/src/spartan/setup_test_wallets.ts#L186-L189" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/spartan/setup_test_wallets.ts#L186-L189</a></sub></sup>


**CLI:**

```bash
aztec-wallet bridge-fee-juice 1000000000000000000000 myAccount --mint --no-wait
```

### Testnet

First mint fee juice on L1:

```bash
cast call $FEE_ASSET_HANDLER_CONTRACT "mint(address)" $MY_L1_ADDRESS --rpc-url <RPC_URL>
```

Then bridge with CLI:

```bash
aztec-wallet bridge-fee-juice 1000000000000000000000 myAccount --no-wait \
  --l1-rpc-urls https://rpc.sepolia.ethpandaops.io \
  --l1-chain-id 11155111 \
  --l1-private-key <YOUR_L1_PRIVATE_KEY>
```

Wait for 2 blocks, then claim and deploy:

```bash
aztec-wallet deploy-account --from myAccount --payment method=fee_juice,claim
```

## Payment Examples

### Pay with Fee Juice

Standard payment from a funded account:

```javascript
import { FeeJuicePaymentMethod } from "@aztec/aztec.js";
```

```javascript title="pay_fee_juice_send" showLineNumbers
const paymentMethod = new FeeJuicePaymentMethod(aliceAddress);
const { transactionFee } = await bananaCoin.methods
  .transfer_in_public(aliceAddress, bobAddress, 1n, 0n)
  .send({ from: aliceAddress, fee: { gasSettings, paymentMethod } })
  .wait();
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/yarn-project/end-to-end/src/e2e_fees/fee_juice_payments.test.ts#L97-L103" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/e2e_fees/fee_juice_payments.test.ts#L97-L103</a></sub></sup>


**CLI equivalent:**

<CLI_Fees />

### Claim and Deploy

Using bridged fee juice to deploy an account:

```javascript
import { FeeJuicePaymentMethodWithClaim } from "@aztec/aztec.js";
```

```javascript title="claim_and_deploy" showLineNumbers
const wallet = await account.getWallet();
const paymentMethod = new FeeJuicePaymentMethodWithClaim(wallet, claim);
const sentTx = account.deploy({ fee: { paymentMethod } });
const txHash = await sentTx.getTxHash();
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/yarn-project/bot/src/factory.ts#L152-L157" target="_blank" rel="noopener noreferrer">Source code: yarn-project/bot/src/factory.ts#L152-L157</a></sub></sup>


**CLI:**

```bash
aztec-wallet deploy-account --from myAccount --payment method=fee_juice,claim
```

### Fee Paying Contracts

FPCs allow paying with other tokens instead of fee juice.

#### Setup FPC

Register an FPC in your PXE:

```javascript
import { FPCContract } from "@aztec/noir-contracts.js/FPC";
import { getContractInstanceFromInstantiationParams } from "@aztec/aztec.js";

const fpcInstance = getContractInstanceFromInstantiationParams(
  FPCContract.artifact,
  fpcDeployParams
);

await pxe.registerContract({
  instance: fpcInstance,
  artifact: FPCContract.artifact,
});
```

#### Public Payment

```javascript
import { PublicFeePaymentMethod } from "@aztec/aztec.js";
```

```javascript title="fpc" showLineNumbers
const tx = await bananaCoin.methods
  .transfer_in_public(aliceAddress, bobAddress, bananasToSendToBob, 0)
  .send({
    from: aliceAddress,
    fee: {
      gasSettings,
      paymentMethod: new PublicFeePaymentMethod(bananaFPC.address, aliceWallet),
    },
  })
  .wait();
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/yarn-project/end-to-end/src/e2e_fees/public_payments.test.ts#L58-L69" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/e2e_fees/public_payments.test.ts#L58-L69</a></sub></sup>


**CLI:**

```bash
aztec-wallet <command> --payment method=fpc-public,fpc=$FPC_ADDRESS,asset=$ASSET_ADDRESS
```

#### Private Payment

```javascript
import { PrivateFeePaymentMethod } from "@aztec/aztec.js";

const privateFee = new PrivateFeePaymentMethod(fpc.address, wallet);
await contract.methods.someMethod().send({
  fee: { paymentMethod: privateFee }
}).wait();
```

**CLI:**

```bash
aztec-wallet <command> --payment method=fpc-private,fpc=$FPC_ADDRESS,asset=$ASSET_ADDRESS
```

## Fee Options Reference

### JavaScript Fee Object

```javascript title="user_fee_options" showLineNumbers
/** Fee options as set by a user. */
export type UserFeeOptions = {
  /** The fee payment method to use */
  paymentMethod?: FeePaymentMethod;
  /** The gas settings */
  gasSettings?: Partial<FieldsOf<GasSettings>>;
  /** Percentage to pad the base fee by, if empty, defaults to 0.5 */
  baseFeePadding?: number;
  /** Whether to run an initial simulation of the tx with high gas limit to figure out actual gas settings. */
  estimateGas?: boolean;
  /** Percentage to pad the estimated gas limits by, if empty, defaults to 0.1. Only relevant if estimateGas is set. */
  estimatedGasPadding?: number;
};
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/yarn-project/entrypoints/src/interfaces.ts#L83-L97" target="_blank" rel="noopener noreferrer">Source code: yarn-project/entrypoints/src/interfaces.ts#L83-L97</a></sub></sup>


### Gas Settings

```javascript title="gas_settings_vars" showLineNumbers
/** Gas usage and fees limits set by the transaction sender for different dimensions and phases. */
export class GasSettings {
  constructor(
    public readonly gasLimits: Gas,
    public readonly teardownGasLimits: Gas,
    public readonly maxFeesPerGas: GasFees,
    public readonly maxPriorityFeesPerGas: GasFees,
  ) {}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/yarn-project/stdlib/src/gas/gas_settings.ts#L17-L26" target="_blank" rel="noopener noreferrer">Source code: yarn-project/stdlib/src/gas/gas_settings.ts#L17-L26</a></sub></sup>


<Gas_Settings />

<Gas_Settings_Components />

## Quick Reference

### CLI Payment Options

```bash
# Default (fee juice from sender)
--payment method=fee_juice

# From another account (deploy only)
--payment method=fee_juice,feePayer=$ADDRESS

# Claim bridged fee juice
--payment method=fee_juice,claim

# Sponsored FPC
--payment method=fpc-sponsored,fpc=$FPC_ADDRESS

# Public FPC
--payment method=fpc-public,fpc=$FPC_ADDRESS,asset=$ASSET_ADDRESS

# Private FPC
--payment method=fpc-private,fpc=$FPC_ADDRESS,asset=$ASSET_ADDRESS
```

### JavaScript Payment Methods

```javascript
// Fee juice from sender
new FeeJuicePaymentMethod(senderAddress)

// Fee juice with claim
new FeeJuicePaymentMethodWithClaim(wallet, claim)

// Sponsored FPC
new SponsoredFeePaymentMethod(fpcAddress)

// Public FPC
new PublicFeePaymentMethod(fpcAddress, wallet)

// Private FPC
new PrivateFeePaymentMethod(fpcAddress, wallet)
```

## Tips

- Use sponsored FPC for your first account deployment
- Bridge fee juice before you need it (2 block confirmation time)
- Private payment methods are the only way to pay fees privately
- Test accounts are only available in sandbox, not testnet
- Use block explorers to track transactions: <General.ViewTransactions />

## Related Resources

- [Fees on Aztec](../../concepts/fees.md)
- [CLI Wallet Reference](../../reference/environment_reference/cli_wallet_reference.md)
- [Token Bridge Tutorial](../../tutorials/js_tutorials/token_bridge.md)
