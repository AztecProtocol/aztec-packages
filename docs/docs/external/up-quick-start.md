# Quick start

:::info 
This guide is meant to be included in the up.aztec.network site and not in the main documentation.
:::

To interact with the sandbox, install the aztec CLI:

`npm install -g @aztec/cli`

The sandbox is preloaded with two accounts, let's assign them as Alice and Bob:

#include_code declare-accounts yarn-project/end-to-end/src/guides/up_quick_start.sh bash noTitle,noLineNumbers,noSourceLink

Start by deploying a private token contract, minting an initial supply of private tokens to Alice:

#include_code deploy yarn-project/end-to-end/src/guides/up_quick_start.sh bash noTitle,noLineNumbers,noSourceLink

We can check Alice's private token balance by querying the contract:

#include_code get-balance yarn-project/end-to-end/src/guides/up_quick_start.sh bash noTitle,noLineNumbers,noSourceLink

And use Alice's private key to send a transaction to transfer tokens to Bob, and check the result:

#include_code transfer yarn-project/end-to-end/src/guides/up_quick_start.sh bash noTitle,noLineNumbers,noSourceLink