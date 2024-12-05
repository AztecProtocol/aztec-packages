---
title: Minting tokens on Aztec
---

In this step we will start writing our Aztec.nr bridge smart contract and write a function to consume the message from the token portal to mint funds on Aztec

## Initial contract setup

In our `token_bridge` Aztec project in `aztec-contracts`, under `src` there is an example `main.nr` file. Paste this to define imports:

```rust
#include_code token_bridge_imports /noir-projects/noir-contracts/contracts/token_bridge_contract/src/main.nr raw
}
```

Inside this block (before the last `}`), paste this to initialize the constructor:

#include_code token_bridge_storage_and_constructor /noir-projects/noir-contracts/contracts/token_bridge_contract/src/main.nr rust

## Consume the L1 message

In the previous step, we have moved our funds to the portal and created a L1->L2 message. Upon building the next rollup, the sequencer asks the inbox for any incoming messages and adds them to Aztec’s L1->L2 message tree, so an application on L2 can prove that the message exists and consumes it.

In `main.nr`, now paste this `claim_public` function:
#include_code claim_public /noir-projects/noir-contracts/contracts/token_bridge_contract/src/main.nr rust

The `claim_public` function enables anyone to consume the message on the user's behalf and mint tokens for them on L2. This is fine as the minting of tokens is done publicly anyway.

**What’s happening here?**

1. We first recompute the L1->L2 message content by calling `get_mint_to_public_content_hash()`. Note that the method does exactly the same as what the TokenPortal contract does in `depositToAztecPublic()` to create the content hash.
2. We then attempt to consume the L1->L2 message. Since we are depositing to Aztec publicly, all of the inputs are public.
   - `context.consume_l1_to_l2_message()` takes in the few parameters:
     - `content_hash`: The content - which is reconstructed in the `get_mint_to_public_content_hash()`
     - `secret`: The secret used for consumption, often 0 for public messages
     - `sender`: Who on L1 sent the message. Which should match the stored `portal_address` in our case as we only want to allow messages from a specific sender.
     - `message_leaf_index`: The index in the message tree of the message.
   - Note that the `content_hash` requires `to` and `amount`. If a malicious user tries to mint tokens to their address by changing the to address, the content hash will be different to what the token portal had calculated on L1 and thus not be in the tree, failing the consumption. This is why we add these parameters into the content.
3. Then we call `Token::at(storage.token.read()).mint_to_public()` to mint the tokens to the to address.

## Private flow

Now we will create a function to mint the amount privately. Paste this into your `main.nr`

#include_code claim_private /noir-projects/noir-contracts/contracts/token_bridge_contract/src/main.nr rust

The `get_mint_to_private_content_hash` function is imported from the `token_portal_content_hash_lib`.

If the content hashes were constructed similarly for `mint_to_private` and `mint_to_public`, then content intended for private execution could have been consumed by calling the `claim_public` method. By making these two content hashes distinct, we prevent this scenario.

Note that the `TokenBridge` contract should be an authorized minter in the corresponding `Token` contract so that it is able to complete the private mint to the intended recipient.

In the next step we will see how we can cancel a message.
