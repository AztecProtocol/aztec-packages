---
title: Swapping Privately
---

In the `main.nr` contract we created [previously](./l2_contract_setup.md), paste these functions:

#include_code swap_private yarn-project/noir-contracts/src/contracts/uniswap_contract/src/main.nr rust
#include_code approve_bridge yarn-project/noir-contracts/src/contracts/uniswap_contract/src/main.nr rust
#include_code assert_token_is_same yarn-project/noir-contracts/src/contracts/uniswap_contract/src/main.nr rust

This flow works very similarly to the public flow except:

- Contracts on Aztec can’t directly hold notes. Since private tokens are basically notes, it isn’t possible for the Uniiswap contract to hold the notes and then approve the token bridge to burn them (since the Uniswap contract would then need to have a private key associated with it that can sign the payload for approval.)
- To work around this, the user can unshield their private tokens into Uniswap L2 contract. Unshielding is a private method on the token contract that reduces a user’s private balance and then calls a public method to increase the recipient’s (ie Uniswap) public balance. Remember that first all private methods are executed and then later all public methods will be - so the Uniswap contract won’t have the funds until public execution begins.
- As a result `swap_private()` calls the internal public method which approves the input token bridge to burn Uniswap’s tokens and creates an L2 → L1 message to exit to L1.
- Constructing the message content for swapping works exactly as the public flow except instead of specifying who would be the Aztec address that receives the swapped funds, we specify a secret hash (`secret_hash_for_redeeming_minted_notes`). Only those who know the preimage to the secret can later redeem the minted notes to themselves.
