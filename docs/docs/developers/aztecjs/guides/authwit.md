---
title: How to use authentication witnesses (authwit)
---

This page assumes you have authwit set up correctly in your contract. To learn how to do that, [go here](../../contracts/writing_contracts/accounts/how_to_authwit.md).

For an introduction to authentication witnesses on Aztec, [read this explainer](../../../learn/concepts/accounts/authwit.md).

## Import libraries

## Publicly deploy accounts

:::note
This is only required if you are using authwits in public
:::note

If you are using public authwit (ie using `assert_current_call_valid_authwit_public` in your contract), you will need to deploy the following accounts publicly:

1. The account that is giving permission to an account to act on behalf of it (authwit giver)
2. The account that does the action (authwit receiver)

Here is an example implementation:

#include_code public_deploy_accounts yarn-project/end-to-end/src/fixtures/utils.ts typescript

You would then call this like so:

#include_code public_deploy_accounts yarn-project/end-to-end/src/e2e_authwit_test.ts typescript

## Define the action

The next steps are assuming that you do not already have the message hash. If you have this, skip to [the guide for creating authwits with pre-calculated message hashes](#if-message-hash-is-already-computed).

When creating an authwit, you will need to pass the authwit givier, the authwit receiver (who will perform the action), and the action that is being authorized. 

You can define the action like this:

#include_code authwit_computeAuthWitMessageHash yarn-project/end-to-end/src/e2e_blacklist_token_contract/transfer_private.test.ts typescript

In this example,
* `asset` refers to a token contract
* `withWallet(wallets[1])` is specifying the authwit receiver (`wallets[1]` will do this action
* `.methods.transfer()` is specifying that the action is calling the `transfer` method on the token contract
* `(wallets[0].getAddress(), wallets[1].getAddress(), amount, nonce);` are the args of this method - it will send the `amount` from `wallets[0]` to `wallets[1]`

## Create the authwit

### Public

This is expected to be used alongside [public authwits in Aztec.nr contract](../../contracts/writing_contracts/accounts/how_to_authwit.md#public-functions).

Set a public authwit like this:

#include_code set_public_authwit yarn-project/end-to-end/src/e2e_blacklist_token_contract/transfer_public.test.ts typescript

In this example,
* `wallets[0]` is the authwit giver
* `wallets[1]` is the authwit reciever and caller of the function
* `action` was [defined previously](#define-the-action)
* `true` sets the `authorized` boolean (`false` would revoke this authwit)

### Private

This is expected to be used alongside [private authwits in Aztec.nr contract](../../contracts/writing_contracts/accounts/how_to_authwit.md#private-functions).

Create a private authwit like this:

#include_code create_authwit yarn-project/end-to-end/src/e2e_blacklist_token_contract/transfer_private.test.ts typescript

Then add it to a wallet:

#include_code add_authwit yarn-project/end-to-end/src/e2e_blacklist_token_contract/transfer_private.test.ts typescript

# If message hash is already computed

