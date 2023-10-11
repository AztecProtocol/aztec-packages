---
title: Executing Private Swap on L1
---

This works very similarly to the public flow.

In the public flow, you can call `claim_public()` on the output token bridge which consumes the deposit message and mints your assets.

In the private flow, you can choose to leak your secret for L1 → L2 message consumption to let someone mint the notes on L2 and then you can later redeem these notes to yourself by presenting the preimage to `secret_hash_for_redeeming_minted_notes` and calling the `redeem_shield()` method on the token contract.

In your `UniswapPortal.sol`, paste this:

#include_code solidity_uniswap_swap_private l1-contracts/test/portals/UniswapPortal.sol solidity
