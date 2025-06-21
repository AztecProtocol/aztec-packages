---
title: L2 Contracts (Aztec)
sidebar_position: 1
---

This page goes over the code in the L2 contract for Uniswap, which works alongside a [token bridge (codealong tutorial)](../token_bridge.md).

## Main.nr

### Setup and constructor

```rust title="uniswap_setup" showLineNumbers 
mod util;

// Demonstrates how to use portal contracts to swap on L1 Uniswap with funds on L2
// Has two separate flows for private and public respectively
// Uses the token bridge contract, which tells which input token we need to talk to and handles the exit funds to L1
use dep::aztec::macros::aztec;

#[aztec]
pub contract Uniswap {
    use dep::aztec::prelude::{AztecAddress, EthAddress, FunctionSelector, PublicImmutable};

    use dep::authwit::auth::{
        assert_current_call_valid_authwit_public, compute_authwit_message_hash_from_call,
        set_authorized,
    };

    use crate::util::{compute_swap_private_content_hash, compute_swap_public_content_hash};
    use dep::aztec::macros::{functions::{initializer, internal, private, public}, storage::storage};
    use dep::token::Token;
    use dep::token_bridge::TokenBridge;

    use dep::aztec::protocol_types::traits::ToField;

    #[storage]
    struct Storage<Context> {
        portal_address: PublicImmutable<EthAddress, Context>,
    }

    #[public]
    #[initializer]
    fn constructor(portal_address: EthAddress) {
        storage.portal_address.initialize(portal_address);
    }
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.88.0/noir-projects/noir-contracts/contracts/app/uniswap_contract/src/main.nr#L1-L35" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/uniswap_contract/src/main.nr#L1-L35</a></sub></sup>

We just need to store the portal address for the token that we want to swap.

### Public swap

```rust title="swap_public" showLineNumbers 
#[public]
fn swap_public(
    sender: AztecAddress,
    input_asset_bridge: AztecAddress,
    input_amount: u128,
    output_asset_bridge: AztecAddress,
    // params for using the transfer approval
    nonce_for_transfer_approval: Field,
    // params for the swap
    uniswap_fee_tier: Field,
    minimum_output_amount: u128,
    // params for the depositing output_asset back to Aztec
    recipient: AztecAddress,
    secret_hash_for_L1_to_l2_message: Field,
    caller_on_L1: EthAddress,
    // nonce for someone to call swap on sender's behalf
    nonce_for_swap_approval: Field,
) {
    if (!sender.eq(context.msg_sender())) {
        assert_current_call_valid_authwit_public(&mut context, sender);
    }

    let input_asset_bridge_config =
        TokenBridge::at(input_asset_bridge).get_config_public().view(&mut context);

    let input_asset = input_asset_bridge_config.token;
    let input_asset_bridge_portal_address = input_asset_bridge_config.portal;

    // Transfer funds to this contract
    Token::at(input_asset)
        .transfer_in_public(
            sender,
            context.this_address(),
            input_amount,
            nonce_for_transfer_approval,
        )
        .call(&mut context);

    // Approve bridge to burn this contract's funds and exit to L1 Uniswap Portal
    Uniswap::at(context.this_address())
        ._approve_bridge_and_exit_input_asset_to_L1(
            input_asset,
            input_asset_bridge,
            input_amount,
        )
        .call(&mut context);
    // Create swap message and send to Outbox for Uniswap Portal
    // this ensures the integrity of what the user originally intends to do on L1.
    let output_asset_bridge_portal_address =
        TokenBridge::at(output_asset_bridge).get_config_public().view(&mut context).portal;
    // ensure portal exists - else funds might be lost
    assert(
        !input_asset_bridge_portal_address.is_zero(),
        "L1 portal address of input_asset's bridge is 0",
    );
    assert(
        !output_asset_bridge_portal_address.is_zero(),
        "L1 portal address of output_asset's bridge is 0",
    );

    let content_hash = compute_swap_public_content_hash(
        input_asset_bridge_portal_address,
        input_amount,
        uniswap_fee_tier,
        output_asset_bridge_portal_address,
        minimum_output_amount,
        recipient,
        secret_hash_for_L1_to_l2_message,
        caller_on_L1,
    );
    context.message_portal(storage.portal_address.read(), content_hash);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.88.0/noir-projects/noir-contracts/contracts/app/uniswap_contract/src/main.nr#L37-L110" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/uniswap_contract/src/main.nr#L37-L110</a></sub></sup>


1. We check that `msg.sender()` has appropriate approval to call this on behalf of the sender by constructing an authwit message and checking if `from` has given the approval (read more about authwit [here](../../../../../aztec/concepts/advanced/authwit.md)).
2. We fetch the underlying aztec token that needs to be swapped.
3. We transfer the user’s funds to the Uniswap contract. Like with Ethereum, the user must have provided approval to the Uniswap contract to do so. The user must provide the nonce they used in the approval for transfer, so that Uniswap can send it to the token contract, to prove it has appropriate approval.
4. Funds are added to the Uniswap contract.
5. Uniswap must exit the input tokens to L1. For this it has to approve the bridge to burn its tokens on its behalf and then actually exit the funds. We call the [`exit_to_l1_public()` method on the token bridge](../token_bridge.md). We use the public flow for exiting since we are operating on public state.
6. It is not enough for us to simply emit a message to withdraw the funds. We also need to emit a message to display our swap intention. If we do not do this, there is nothing stopping a third party from calling the Uniswap portal with their own parameters and consuming our message.

So the Uniswap portal (on L1) needs to know:

- The token portals for the input and output token (to withdraw the input token to L1 and later deposit the output token to L2)
- The amount of input tokens they want to swap
- The Uniswap fee tier they want to use
- The minimum output amount they can accept (for slippage protection)

The Uniswap portal must first withdraw the input tokens, then check that the swap message exists in the outbox, execute the swap, and then call the output token to deposit the swapped tokens to L2. So the Uniswap portal must also be pass any parameters needed to complete the deposit of swapped tokens to L2. From the tutorial on building token bridges we know these are:

- The address on L2 which must receive the output tokens (remember this is public flow)
- The secret hash for consume the L1 to L2 message. Since this is the public flow the preimage doesn’t need to be a secret.

You can find the corresponding function on the [L1 contracts page](./l1_contract.md).

### Private swap

```rust title="swap_private" showLineNumbers 
#[private]
fn swap_private(
    input_asset: AztecAddress, // since private, we pass here and later assert that this is as expected by input_bridge
    input_asset_bridge: AztecAddress,
    input_amount: u128,
    output_asset_bridge: AztecAddress,
    // params for using the transfer_to_public approval
    nonce_for_transfer_to_public_approval: Field,
    // params for the swap
    uniswap_fee_tier: Field, // which uniswap tier to use (eg 3000 for 0.3% fee)
    minimum_output_amount: u128, // minimum output amount to receive (slippage protection for the swap)
    // params for the depositing output_asset back to Aztec
    secret_hash_for_L1_to_l2_message: Field, // for when l1 uniswap portal inserts the message to consume output assets on L2
    caller_on_L1: EthAddress, // ethereum address that can call this function on the L1 portal (0x0 if anyone can call)
) {
    let input_asset_bridge_config =
        TokenBridge::at(input_asset_bridge).get_config().view(&mut context);
    let output_asset_bridge_config =
        TokenBridge::at(output_asset_bridge).get_config().view(&mut context);

    // Assert that user provided token address is same as expected by token bridge.
    // we can't directly use `input_asset_bridge.token` because that is a public method and public can't return data to private
    assert(
        input_asset.eq(input_asset_bridge_config.token),
        "input_asset address is not the same as seen in the bridge contract",
    );

    // Transfer funds to this contract
    Token::at(input_asset)
        .transfer_to_public(
            context.msg_sender(),
            context.this_address(),
            input_amount,
            nonce_for_transfer_to_public_approval,
        )
        .call(&mut context);

    // Approve bridge to burn this contract's funds and exit to L1 Uniswap Portal
    Uniswap::at(context.this_address())
        ._approve_bridge_and_exit_input_asset_to_L1(
            input_asset,
            input_asset_bridge,
            input_amount,
        )
        .enqueue(&mut context);

    // Create swap message and send to Outbox for Uniswap Portal
    // this ensures the integrity of what the user originally intends to do on L1.

    // ensure portal exists - else funds might be lost
    assert(
        !input_asset_bridge_config.portal.is_zero(),
        "L1 portal address of input_asset's bridge is 0",
    );
    assert(
        !output_asset_bridge_config.portal.is_zero(),
        "L1 portal address of output_asset's bridge is 0",
    );

    let content_hash = compute_swap_private_content_hash(
        input_asset_bridge_config.portal,
        input_amount,
        uniswap_fee_tier,
        output_asset_bridge_config.portal,
        minimum_output_amount,
        secret_hash_for_L1_to_l2_message,
        caller_on_L1,
    );
    context.message_portal(storage.portal_address.read(), content_hash);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.88.0/noir-projects/noir-contracts/contracts/app/uniswap_contract/src/main.nr#L112-L183" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/uniswap_contract/src/main.nr#L112-L183</a></sub></sup>


This uses a util function `compute_swap_private_content_hash()` - find that [here](#utils)

This flow works similarly to the public flow with a few notable changes:

- Notice how in the `swap_private()`, user has to pass in `token` address which they didn't in the public flow? Since `swap_private()` is a private method, it can't read what token is publicly stored on the token bridge, so instead the user passes a token address, and `_assert_token_is_same()` checks that this user provided address is same as the one in storage. Note that because public functions are executed by the sequencer while private methods are executed locally, all public calls are always done after all private calls are done. So first the burn would happen and only later the sequencer asserts that the token is same. Note that the sequencer just sees a request to `execute_assert_token_is_same` and therefore has no context on what the appropriate private method was. If the assertion fails, then the kernel circuit will fail to create a proof and hence the transaction will be dropped.
- In the public flow, the user calls `transfer_in_public()`. Here instead, the user calls `transfer_to_public()`. Why? The user can't directly transfer their private tokens (their notes) to the uniswap contract, because later the Uniswap contract has to approve the bridge to burn these notes and withdraw to L1. The authwit flow for the private domain requires a signature from the `sender`, which in this case would be the Uniswap contract. For the contract to sign, it would need a private key associated to it. But who would operate this key?
- To work around this, the user can transfer to public their private tokens into Uniswap L2 contract. Transferring to public would convert user's private notes to public balance. It is a private method on the token contract that reduces a user’s private balance and then calls a public method to increase the recipient’s (ie Uniswap) public balance. **Remember that first all private methods are executed and then later all public methods will be - so the Uniswap contract won’t have the funds until public execution begins.**
- Now uniswap has public balance (like with the public flow). Hence, `swap_private()` calls the internal public method which approves the input token bridge to burn Uniswap’s tokens and calls `exit_to_l1_public` to create an L2 → L1 message to exit to L1.
- Constructing the message content for swapping works exactly as the public flow except instead of specifying who would be the Aztec address that receives the swapped funds, we specify a secret hash. Only those who know the preimage to the secret can later redeem the minted notes to themselves.

### Approve the bridge to burn this contract's funds

Both public and private swap functions call this function:

```rust title="authwit_uniswap_set" showLineNumbers 
// This helper method approves the bridge to burn this contract's funds and exits the input asset to L1
// Assumes contract already has funds.
// Assume `token` relates to `token_bridge` (ie token_bridge.token == token)
// Note that private can't read public return values so created an internal public that handles everything
// this method is used for both private and public swaps.
#[public]
#[internal]
fn _approve_bridge_and_exit_input_asset_to_L1(
    token: AztecAddress,
    token_bridge: AztecAddress,
    amount: u128,
) {
    // Since we will authorize and instantly spend the funds, all in public, we can use the same nonce
    // every interaction. In practice, the authwit should be squashed, so this is also cheap!
    let authwit_nonce = 0xdeadbeef;

    let selector = FunctionSelector::from_signature("burn_public((Field),u128,Field)");
    let message_hash = compute_authwit_message_hash_from_call(
        token_bridge,
        token,
        context.chain_id(),
        context.version(),
        selector,
        [context.this_address().to_field(), amount as Field, authwit_nonce],
    );

    // We need to make a call to update it.
    set_authorized(&mut context, message_hash, true);

    let this_portal_address = storage.portal_address.read();
    // Exit to L1 Uniswap Portal !
    TokenBridge::at(token_bridge)
        .exit_to_l1_public(this_portal_address, amount, this_portal_address, authwit_nonce)
        .call(&mut context)
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.88.0/noir-projects/noir-contracts/contracts/app/uniswap_contract/src/main.nr#L185-L221" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/uniswap_contract/src/main.nr#L185-L221</a></sub></sup>


## Utils

### Compute content hash for public

```rust title="uniswap_public_content_hash" showLineNumbers 
use dep::aztec::prelude::{AztecAddress, EthAddress};
use dep::aztec::protocol_types::{hash::sha256_to_field, traits::ToField};

// This method computes the L2 to L1 message content hash for the public
// refer `l1-contracts/test/portals/UniswapPortal.sol` on how L2 to L1 message is expected
pub fn compute_swap_public_content_hash(
    input_asset_bridge_portal_address: EthAddress,
    input_amount: u128,
    uniswap_fee_tier: Field,
    output_asset_bridge_portal_address: EthAddress,
    minimum_output_amount: u128,
    aztec_recipient: AztecAddress,
    secret_hash_for_L1_to_l2_message: Field,
    caller_on_L1: EthAddress,
) -> Field {
    let mut hash_bytes = [0; 260]; // 8 fields of 32 bytes each + 4 bytes fn selector
    let input_token_portal_bytes: [u8; 32] =
        input_asset_bridge_portal_address.to_field().to_be_bytes();
    let in_amount_bytes: [u8; 32] = input_amount.to_field().to_be_bytes();
    let uniswap_fee_tier_bytes: [u8; 32] = uniswap_fee_tier.to_be_bytes();
    let output_token_portal_bytes: [u8; 32] =
        output_asset_bridge_portal_address.to_field().to_be_bytes();
    let amount_out_min_bytes: [u8; 32] = minimum_output_amount.to_field().to_be_bytes();
    let aztec_recipient_bytes: [u8; 32] = aztec_recipient.to_field().to_be_bytes();
    let secret_hash_for_L1_to_l2_message_bytes: [u8; 32] =
        secret_hash_for_L1_to_l2_message.to_be_bytes();
    let caller_on_L1_bytes: [u8; 32] = caller_on_L1.to_field().to_be_bytes();

    // The purpose of including the following selector is to make the message unique to that specific call. Note that
    // it has nothing to do with calling the function.
    let selector = comptime {
        keccak256::keccak256(
            "swap_public(address,uint256,uint24,address,uint256,bytes32,bytes32,address)".as_bytes(),
            75,
        )
    };

    hash_bytes[0] = selector[0];
    hash_bytes[1] = selector[1];
    hash_bytes[2] = selector[2];
    hash_bytes[3] = selector[3];

    for i in 0..32 {
        hash_bytes[i + 4] = input_token_portal_bytes[i];
        hash_bytes[i + 36] = in_amount_bytes[i];
        hash_bytes[i + 68] = uniswap_fee_tier_bytes[i];
        hash_bytes[i + 100] = output_token_portal_bytes[i];
        hash_bytes[i + 132] = amount_out_min_bytes[i];
        hash_bytes[i + 164] = aztec_recipient_bytes[i];
        hash_bytes[i + 196] = secret_hash_for_L1_to_l2_message_bytes[i];
        hash_bytes[i + 228] = caller_on_L1_bytes[i];
    }

    let content_hash = sha256_to_field(hash_bytes);
    content_hash
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.88.0/noir-projects/noir-contracts/contracts/app/uniswap_contract/src/util.nr#L1-L58" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/uniswap_contract/src/util.nr#L1-L58</a></sub></sup>


This method computes the L2 to L1 message content hash for the public. To find out how it is consumed on L1, view the [L1 contracts page](./l1_contract.md)

### Compute content hash for private

```rust title="compute_swap_private_content_hash" showLineNumbers 
// This method computes the L2 to L1 message content hash for the private
// refer `l1-contracts/test/portals/UniswapPortal.sol` on how L2 to L1 message is expected
pub fn compute_swap_private_content_hash(
    input_asset_bridge_portal_address: EthAddress,
    input_amount: u128,
    uniswap_fee_tier: Field,
    output_asset_bridge_portal_address: EthAddress,
    minimum_output_amount: u128,
    secret_hash_for_L1_to_l2_message: Field,
    caller_on_L1: EthAddress,
) -> Field {
    let mut hash_bytes = [0; 228]; // 7 fields of 32 bytes each + 4 bytes fn selector
    let input_token_portal_bytes: [u8; 32] =
        input_asset_bridge_portal_address.to_field().to_be_bytes();
    let in_amount_bytes: [u8; 32] = input_amount.to_field().to_be_bytes();
    let uniswap_fee_tier_bytes: [u8; 32] = uniswap_fee_tier.to_be_bytes();
    let output_token_portal_bytes: [u8; 32] =
        output_asset_bridge_portal_address.to_field().to_be_bytes();
    let amount_out_min_bytes: [u8; 32] = minimum_output_amount.to_field().to_be_bytes();
    let secret_hash_for_L1_to_l2_message_bytes: [u8; 32] =
        secret_hash_for_L1_to_l2_message.to_be_bytes();
    let caller_on_L1_bytes: [u8; 32] = caller_on_L1.to_field().to_be_bytes();

    // The purpose of including the following selector is to make the message unique to that specific call. Note that
    // it has nothing to do with calling the function.
    let selector = comptime {
        keccak256::keccak256(
            "swap_private(address,uint256,uint24,address,uint256,bytes32,address)".as_bytes(),
            68,
        )
    };

    hash_bytes[0] = selector[0];
    hash_bytes[1] = selector[1];
    hash_bytes[2] = selector[2];
    hash_bytes[3] = selector[3];

    for i in 0..32 {
        hash_bytes[i + 4] = input_token_portal_bytes[i];
        hash_bytes[i + 36] = in_amount_bytes[i];
        hash_bytes[i + 68] = uniswap_fee_tier_bytes[i];
        hash_bytes[i + 100] = output_token_portal_bytes[i];
        hash_bytes[i + 132] = amount_out_min_bytes[i];
        hash_bytes[i + 164] = secret_hash_for_L1_to_l2_message_bytes[i];
        hash_bytes[i + 196] = caller_on_L1_bytes[i];
    }
    let content_hash = sha256_to_field(hash_bytes);
    content_hash
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.88.0/noir-projects/noir-contracts/contracts/app/uniswap_contract/src/util.nr#L60-L110" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/uniswap_contract/src/util.nr#L60-L110</a></sub></sup>


This method computes the L2 to L1 message content hash for the private. To find out how it is consumed on L1, view the [L1 contracts page](./l1_contract.md).

## Redeeming assets

So you emitted a message to withdraw input tokens to L1 and a message to swap. Then you or someone on your behalf can swap on L1 and emit a message to deposit swapped assets to L2.
