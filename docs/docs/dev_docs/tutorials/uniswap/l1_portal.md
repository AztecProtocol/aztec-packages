---
title: Uniswap Portal on L1
---

In this step we will set up our Solidity portal contract.

In `l1-tokens` create a new file called `UniswapPortal.sol`

```bash
cd l1-tokens && touch UniswapPortal.sol
```

and paste this inside:

#include_code setup l1-contracts/test/portals/UniswapPortal.sol solidity

In this set up we define the `initialize()` function and a struct (`LocalSwapVars`) to manage assets being swapped.

Like we saw in the [TokenPortal](../token_portal/depositing_to_aztec.md), we initialize this portal with the registry contract address (to fetch the appropriate inbox and outbox) and the portal’s sister contract address on L2.
