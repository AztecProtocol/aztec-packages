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

1. The account that is giving permission to an account to act on behalf of it (gives the authwit)
2. The account that does the action (receives the authwit)

Here is an example implementation:

#include_code public_deploy_accounts yarn-project/end-to-end/src/fixtures/utils.ts typescript

You would then call this like so:

#include_code public_deploy_accounts yarn-project/end-to-end/src/e2e_authwit_test.ts typescript

## Define the action

## Set the authwit

### Public

### Private
