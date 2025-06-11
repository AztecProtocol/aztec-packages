---
title: How to Pay Fees
tags: [fees, transactions, developers]
sidebar_position: 3
---

There a several ways to pay for transaction fees, thanks to fee abstraction implemented in the Aztec protocol.

This guide shows the various ways this can be done. For more of a background see [Fees on Aztec](../../../aztec/concepts/fees).

## Methods to pay a tx fee

1. Natively via an existing balance of fee juice

Either your own account or someone else's address has a balance of fee juice, and the transaction is paid for from this balance.

2. Natively via a balance of fee juice bridged from L1 to be claimed on L2

Processing this transaction first claims bridged fee juice then is paid for from the balance, all in the same public/private tx.

3. Privately or publicly via a Fee Paying Contract

A fee paying contract (FPC) is created and nominates a token that it accepts to then pay for transactions in fee juice. So a user doesn't need to hold fee juice, they only need the token that the FPC accepts.

The FPC can also decide to refund users in cases of overpayment. For private FPCs, this incurrs a substantial gate count (proving time) and DA costs so in some cases it might be cheaper to not get the refund. The sample FPCs we show here refund the users but a FPC deployer or user should think carefully if asking for refunds is a smart option.

The most straightforward way to pay for a transaction is via the sponsored fee payment method, bootstrapping some transactions by skipping the need to bridge fee juice to the account. This method uses a type of fee paying contract configured to pay for a number of transactions without requiring payment, but also requires that there is a sponsor to pay for the transactions. **This only exists on the sandbox as a convenience to get started quickly, though you could deploy it on testnet too for your own use case**

The most straightforward way to pay for a transaction is via the sponsored fee payment method, bootstrapping some transactions by skipping the need to bridge fee juice to the account. This method uses a type of fee paying contract configured to pay for a number of transactions without requiring payment, but also requires that there is a sponsor to pay for the transactions.

import { General } from '@site/src/components/Snippets/general_snippets';

:::tip Use a block explorer
<General.ViewTransactions />

:::

## Bridging Fee Juice

### Sandbox

To first get fee juice into an account it needs to be bridged from L1. You can skip this section if you want to first make a transaction via the SponsoredFPC.

:::note

See here to [Bridge Fee Juice](../../../developers/reference/environment_reference/cli_wallet_reference#bridge-fee-juice) via the CLI wallet.

:::

One way of bridging of tokens is described fully [here](../../../developers/tutorials/codealong/js_tutorials/token_bridge.md#deposit-to-aztec). Below summarises specifically bridging fee juice on the sandbox.

First get the node info and create a public client pointing to the sandbox's anvil L1 node (from foundry):

#include_code get_node_info_pub_client yarn-project/end-to-end/src/spartan/smoke.test.ts javascript

After importing:

```ts
import { L1FeeJuicePortalManager } from "@aztec/aztec.js";
```

Create a new fee juice portal manager and bridge fee juice publicly to Aztec:

#include_code bridge_fee_juice yarn-project/end-to-end/src/spartan/setup_test_wallets.ts javascript

For the mechanisms to complete bridging between L1 and Aztec, we have to wait for 2 Aztec blocks to progress. This can be triggered manually by sending 2 transactions in the sandbox, or by waiting for 2 blocks on a public network. After this, an account should have its fee juice ready to use in transactions.

Alternatively, the resulting claim object can be used to create a payment method to claim and pay for a transaction in one, where the transaction is the contract's deployment.

### Testnet

The `L1FeeJuicePortalManager` will not be able to mint assets for you on testnet. You will need to call the fee asset's `mint` function on L1 to mint fee juice, e.g.:

```bash
cast call $FEE_ASSET_HANDLER_CONTRACT "mint(address)" $MY_L1_ADDRESS --rpc-url <RPC_URL>
```

Then bridge it to L2, using the the `L1FeeJuicePortalManager` as described above.

## Examples

### Pay with FeeJuice

To send a transaction from an already deployed account already holding fee juice. A user's fee juice balance is public, so paying for a transaction with fee juice will reveal information about which account is paying for the transaction and how much they paid.

Note: this example is a public token transfer call, but can equally be a private function call

```ts
import { FeeJuicePaymentMethod } from "@aztec/aztec.js";
```

#include_code pay_fee_juice_send yarn-project/end-to-end/src/e2e_fees/fee_juice_payments.test.ts javascript

**The equivalent to specify fees via CLI...**

import { CLI_Fees } from '@site/src/components/Snippets/general_snippets';

<CLI_Fees />

### Claim and deploy

Here we will use the `claim` object previously from the bridging section, and the corresponding `wallet`, to create the fee payment method. The payment method is then used to claim fee juice and pay for account contract deployment. Note the function used to bridge fee juice (private/public) should correspond to how the fee juice is claimed.

```ts
import { FeeJuicePaymentMethodWithClaim } from "@aztec/aztec.js";
```

#include_code claim_and_deploy yarn-project/bot/src/factory.ts javascript

**The equivalent to specify fees via CLI...**

The CLI tool `aztec-wallet` takes the fee payment method via the param: `--payment method=fee_juice,claim`

#### Claim and Pay

Claiming bridged fee juice and using it to pay for transaction fees results in fees being paid publicly.

Calling a function, in this case checking the balance of the fee juice contract:

#include_code claim_and_pay yarn-project/end-to-end/src/e2e_fees/fee_juice_payments.test.ts javascript

### Fee Paying Contract

Users can pay fees privately or publicly via FPCs. A FPC must be deployed and funded with fee juice before it can be used to pay for transactions. Users must have the token that the FPC accepts to pay for transactions. They must have a private balance of the token if they want to pay for fees privately, and a public balance if they want to pay for fees publicly.

Import the appropriate method from aztec.js.

```ts
import {
  PrivateFeePaymentMethod,
  PublicFeePaymentMethod,
} from "@aztec/aztec.js";
```

A FPC contract must be registered in a users PXE before it can be used. This will automatically happen if you deploy a FPC to your sandbox, but must be added manually if you are using a standalone PXE.

```ts
import { FPCContract } from "@aztec/noir-contracts.js/FPC";
import { getContractInstanceFromDeployParams } from "@aztec/aztec.js";

// ... (set up the wallet and PXE)

// get the deployed FPC contract instance
const fpcContractInstance = getContractInstanceFromDeployParams(
  FPCContract.artifact,
  fpcDeployParams // the params used to deploy the FPC
);
// register the already deployed FPC contract in users PXE
await pxe.registerContract({
  instance: fpcContractInstance,
  artifact: FPCContract.artifact,
});
```

The fee payment method is created and used as follows, with similar syntax for private or public fee payments:

#include_code fpc yarn-project/end-to-end/src/e2e_fees/public_payments.test.ts javascript

In this example, thanks to this FPC's `accepted_asset` being banana tokens, Alice only needs to hold this token and not fee juice. The asset that a FPC accepts for paying fees is determined when the FPC is deployed. The function being called happens to also be a transfer of banana tokens to Bob.

More on FPCs [here](https://github.com/AztecProtocol/aztec-packages/tree/#include_aztec_version/noir-projects/noir-contracts/contracts/fees/fpc_contract/src/main.nr)

See this [section](../../reference/environment_reference/cli_wallet_reference.md#fee-paying-contract) for paying fees via an FPC using the CLI wallet.

### Sponsored Fee Paying Contract

This method of fee payment will only work for environments where a sponsored fee paying contract is deployed.
The sandbox comes with a sponsored fee paying contract deployed, so this can be used to pay for transactions without needing to bridge fee juice.
To use sponsored FPCs in other environments, they will need to be deployed and funded with fee juice.
Using a SponsoredFPC payment method is as simple as importing it, registering it and passing it the PXE:

#### Sandbox with PXE

```ts
import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee/testing";
```

```ts
const paymentMethod = new SponsoredFeePaymentMethod(deployedSponsoredFPC);
```

#### Standalone PXE (e.g. Testnet)

Register the default SponsoredFPC in the PXE:

```ts
import { SponsoredFPCContract } from "@aztec/noir-contracts.js/SponsoredFPC";

// ... (set up the wallet and PXE)

// register the already deployed SponsoredFPC contract in users PXE
const sponseredFPC = await getSponsoredFPCInstance();
await pxe.registerContract({
  instance: sponsoredFPC,
  artifact: SponsoredFPCContract.artifact,
});
const paymentMethod = new SponsoredFeePaymentMethod(sponseredFPC.address);
```

You can see an example implementation for `getSponsoredFPCInstance()` [here](https://github.com/AztecProtocol/aztec-packages/blob/360a5f628b4edaf1ea9b328d9e9231f60fdc81a0/yarn-project/aztec/src/sandbox/sponsored_fpc.ts#L5).

Once this is set up, a transaction can specify this as the `paymentMethod` in the fee object.
You can see an example of how to get a deployed instance of a sponsored FPC in the sandbox [here](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/yarn-project/aztec/src/sandbox/sponsored_fpc.ts#L15).
For example, a contract can be deployed with an fpc as follows:

```ts
const paymentMethod = new SponsoredFeePaymentMethod(deployedSponsoredFPC);
myAccountManager.deploy({ fee: { paymentMethod } });
```

You can find the corresponding CLI command info [here](../../reference/environment_reference/cli_wallet_reference#sponsored-fee-paying-contract)

## Fee Options

Functions pertaining to sending a transaction, such as `deploy` and `send`, each include a `fee` variable defined with the following (optional) parameters:

#include_code user_fee_options yarn-project/entrypoints/src/interfaces.ts javascript

### Fee Payment Method

The `paymentMethod` is an object for the type of payment. Each of the implementations can be found [here](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/yarn-project/aztec.js/src/fee). For example:

#include_code fee_juice_method yarn-project/aztec.js/src/fee/fee_juice_payment_method.ts javascript

### Gas Settings

#include_code gas_settings_vars yarn-project/stdlib/src/gas/gas_settings.ts javascript

import { Gas_Settings_Components, Gas_Settings } from '@site/src/components/Snippets/general_snippets';

<Gas_Settings />

<Gas_Settings_Components />

### Other params

Fee and gas padding params can be left to their default values, and the estimateGas boolean can be used when simulating a tx to calculate gas.
