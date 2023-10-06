---
title: Minting tokens on Aztec
---

In this step we will start writing our Aztec.nr bridge smart contract!

## Consume the L1 message

We have now moved our funds to the portal and created a L1->L2 message. Upon building the next rollup, the sequencer asks the inbox for any incoming messages and adds them to Aztec’s L1->L2 message tree, so an application on L2 can prove that the message exists and consumes it.

In our `token-bridge` nargo project in `aztec-contracts`, under `src` there is an example `main.nr` file. Delete all the code in here and paste this to define imports and initialize the constructor:

```rust
mod util;
mod token_interface;

// Minimal implementation of the token bridge that can move funds between L1 <> L2.
// The bridge has a corresponding Portal contract on L1 that it is attached to
// And corresponds to a Token on L2 that uses the `AuthWit` accounts pattern.
// Bridge has to be set as a minter on the token before it can be used

contract TokenBridge {
    use dep::aztec::{
        context::{Context},
        hash::{compute_secret_hash},
        state_vars::{public_state::PublicState},
        types::type_serialization::field_serialization::{
            FieldSerializationMethods, FIELD_SERIALIZED_LEN,
        },
        types::address::{AztecAddress, EthereumAddress},
        selector::compute_selector,
    };

    use crate::token_interface::Token;

    // Storage structure, containing all storage, and specifying what slots they use.
    struct Storage {
        token: PublicState<Field, 1>,
    }

    impl Storage {
        fn init(context: Context) -> pub Self {
            Storage {
                token: PublicState::new(
                    context,
                    1,
                    FieldSerializationMethods,
                ),
            }
        }
    }

    // Constructs the contract.
    #[aztec(private)]
    fn constructor(token: AztecAddress) {
        let selector = compute_selector("_initialize((Field))");
        context.call_public_function(context.this_address(), selector, [token.address]);
    }
```

Then paste this `claim_public` function:
#include_code claim_public /yarn-project/noir-contracts/src/contracts/token_bridge_contract/src/main.nr rust

and this `mint_public_content_hash` function:
#include_code mint_public_content_hash_nr /yarn-project/noir-contracts/src/contracts/token_bridge_contract/src/util.nr rust

The `claim_public` function enables anyone to consume the message on the user's behalf and mint tokens for them on L2. This is fine as the minting of tokens is done publicly anyway.

**What’s happening here?**

1. We first recompute the L1->L2 message content by calling `get_mint_public_content_hash()`. Note that the method does exactly the same as what the TokenPortal contract does in `depositToAztecPublic()` to create the content hash.
2. We then attempt to consume the L1->L2 message by passing the `msg_key`, the the content hash, and the "secret". Since we are depositing to Aztec publicly, this secret is public, anyone can know this and is usually 0.
   - `context.consume_l1_to_l2_message()` takes in the content_hash and secret to recreate the original message. The L1 to L2 message consists of:
     - Sender - who on L1 sent the message + chain ID of L1. The context variable knows the portal address on L1 and adds that
     - Recipient - i.e. this aztec contract address which is consuming the message + the current version of the aztec rollup.
     - The content - which is reconstructed in the `get_mint_public_content_hash()`
   - Note that the `content_hash` requires `to`, `amount` and `canceller`. If a malicious user tries to mint tokens to their address by changing the to address, the content hash will be different to what the token portal had calculated on L1 and the `msg_Key` will also be different, thus preventing the L1->L2 message from being consumed. This is why we add these parameters into the content.
3. Then we call `token.mint()` to mint the tokens to the to address.

## Private flow

Now we will create a function to mint the amount in private assets. Paste this into your `main.nr`

#include_code claim_private /yarn-project/noir-contracts/src/contracts/token_bridge_contract/src/main.nr rust

#include_code call_mint_on_token /yarn-project/noir-contracts/src/contracts/token_bridge_contract/src/main.nr rust

#include_code get_mint_private_content_hash /yarn-project/noir-contracts/src/contracts/token_bridge_contract/src/util.nr rust

If the content hashes were constructed similarly for `mint_private` and `mint_publicly`, then content intended for private execution could have been consumed by calling the `claim_public` method. By making these two content hashes quite distinct, we prevent this scenario.

While we mint the tokens on L2, we _still don’t actually mint them to a certain address_. Instead we continue to pass the `secret_hash_for_redeeming_minted_notes` like we did on L1. This means that a user could reveal their secret for L2 message consumption for anyone to mint tokens on L2 but they can redeem these notes at a later time. **This enables a paradigm where an app can manage user’s secrets for L2 message consumption on their behalf**. **The app or any external party can also mint tokens on the user’s behalf should they be comfortable with leaking the secret for L2 Message consumption.** This doesn’t leak any new information to the app because their smart contract on L1 knew that a user wanted to move some amount of tokens to L2. The app still doesn’t know which address on L2 the user wants these notes to be in, but they can mint tokens nevertheless on their behalf.

To mint tokens privately, `claim_private` calls an internal function [\_call_mint_on_token()](https://github.com/AztecProtocol/dev-rel/tree/main/tutorials/token-bridge#_call_mint_on_token) which then calls [token.mint_private()](https://github.com/AztecProtocol/dev-rel/blob/main/tutorials/token-contract/README.md#mint_private) which is a public method since it operates on public storage. Note that mint_private (on the token contract) is public because it too reads from public storage. Since the `secret_hash_for_redeeming_minted_notes` is passed publicly (and not the secret), nothing that should be leaked is, and the only the person that knows the secret can actually redeem their notes at a later time by calling `Token.redeem_shield(secret, amount)`.

In the next step we will see how we can handle a message that has an attached fee too low to be included in a rollup block.
