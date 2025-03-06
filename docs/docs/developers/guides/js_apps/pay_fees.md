---
title: How to Pay Fees
tags: [fees, transactions, developers]
---

There a several ways to pay for transaction fees, thanks to fee abstraction implemented in the Aztec protocol.

This guide shows the various ways this can be done. For more of a background see [Fees on Aztec](../../../aztec/concepts/fees).

## Methods to pay a tx fee

### Natively via an existing balance of fee juice

Either your own account or someone else's address has a balance of fee juice, and the transaction is paid for from this balance.

### Natively via a balance of fee juice to be claimed

Processing this transaction first claims bridged fee juice then is paid for from the balance, all in the same public/private tx.

### Privately or publicly via a Fee Paying Contract

A fee paying contract (FPC) is created and nominates a token that it accepts to then pay for txs in fee juice. So a user doesn't need to hold fee juice, they only need the token that the FPC accepts.

## Fee Options

Functions pertaining to sending a transaction, such as `deploy` and `send`, each include a `fee` variable defined with the following (optional) parameters:

#include_code user_fee_options yarn-project/aztec.js/src/entrypoint/payload.ts javascript


### Fee Payment Method

The `paymentMethod` is an object for the type of payment. Each of the implementations can be found [here](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/yarn-project/aztec.js/src/fee). For example:

#include_code fee_juice_method yarn-project/aztec.js/src/fee/fee_juice_payment_method.ts javascript

### Gas Settings

#include_code gas_settings_vars yarn-project/stdlib/src/gas/gas_settings.ts javascript

import { Gas_Settings_Components, Gas_Settings } from '/components/snippets';

<Gas_Settings />

<Gas_Settings_Components />


### Other params

Fee and gas padding params can be left to their default values, and the estimateGas boolean can be used when simulating a tx to calculate gas.

With the fee options explained, lets do a paid transaction.

## Examples

### Pay with FeeJuice

An account can be deployed directly via fee-juice payment if the address has been pre-funded.
This is done using the AccountManager as follows:

#include_code pay_fee_juice_deploy yarn-project/end-to-end/src/e2e_fees/account_init.test.ts javascript

Or to send a transaction from an account holding fee juice:
(Note: this example is a public token transfer call, but can equally be a private function call)

#include_code pay_fee_juice_send yarn-project/end-to-end/src/e2e_fees/fee_juice_payments.test.ts javascript

**The equivalent to specify fees via CLI...**

import { CLI_Fees } from '/components/snippets';

<CLI_Fees />

See here to [Bridge Fee Juice](../../../developers/reference/environment_reference/cli_wallet_reference#bridge-fee-juice) via the CLI wallet.

### Claim and pay

After a user has sent fee juice from L1 to be bridged to L2, a transaction can be made that claims this to pay for itself, and make the transaction, in one.

The claim object:

#include_code claim_type_amount yarn-project/aztec.js/src/ethereum/portal_manager.ts javascript

#### Half-bridging fee-juice in the Sandbox

Bridging of the fee-juice asset is described fully [here](../../../developers/tutorials/codealong/contract_tutorials/token_bridge#deposit-to-aztec), but since we're going to claim and pay in one, we only need to mint/approve on L1.

1. Get node info and create a public client pointing to the sandbox's foundry L1:

#include_code get_node_info_pub_client yarn-project/end-to-end/src/spartan/smoke.test.ts javascript

Notes: Steps 1 and 3 make use of viem functions, so be sure to: `import { createPublicClient, createWalletClient } from 'viem';`

2. Now use these to create the L1FeeJuicePortalManager and get its L1TokenManager

```
const feeJuicePortalManager = new L1FeeJuicePortalManager( // Create an L1FeeJuicePortalManager
    info.l1ContractAddresses.feeJuicePortalAddress,
    info.l1ContractAddresses.feeJuiceAddress,
    publicClient, // from step 1
    getL1WalletClient(foundry.rpcUrls.default.http[0], 0),
    createLogger('example:bridging-fee-juice');,
);
const tokenManager = feeJuicePortalManager.getTokenManager();
```

3. Now mint and approve the amount of tokens on L1

```
const [claimSecret, claimSecretHash] = await generateClaimSecret();
await this.tokenManager.mint(amount, publicClient.account.address);
await this.tokenManager.approve(amount, l1ContractAddresses.feeJuicePortalAddress, 'FeeJuice Portal');
```

These tokens are now ready for use with claim and pay, using the claimSecret and claimSecretHash.

#### Claim and Pay on Aztec

Calling a function on an object (in this case checking the balance of the fee juice contract)

#include_code claim_and_pay yarn-project/end-to-end/src/e2e_fees/fee_juice_payments.test.ts javascript


### Fee Paying Contract

Similarly with a fee paying contract, the fee payment method is created and used as follows:

#include_code fpc yarn-project/end-to-end/src/e2e_fees/public_payments.test.ts javascript

In this example, thanks to the FPC's `accepted_asset` being banana tokens, Alice only needs to hold this token and not fee juice. The function being called happens to also be a transfer of banana tokens to Bob.

More on FPCs [here](https://github.com/AztecProtocol/aztec-packages/tree/#include_aztec_version/noir-projects/noir-contracts/contracts/fpc_contract/src/main.nr)
