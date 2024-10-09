mod lib;

use dep::aztec::macros::aztec;

// A Noir implementation of simplified Uniswap v2 pool.
#[aztec]
contract DEX {
    use crate::lib::{get_quote, get_amount_out};
    use dep::aztec::{
        macros::{storage::storage, events::event, functions::{private, public, view, internal, initializer}},
        prelude::{AztecAddress, SharedImmutable, PublicContext}, protocol_types::traits::Serialize
    };
    use std::meta::derive;
    use dep::token::Token;

    // We store the tokens of the pool and reserves in a struct such that to load it from PublicImmutable asserts only
    // a single merkle proof.
    // (Once we actually do the optimization. WIP in https://github.com/AztecProtocol/aztec-packages/pull/8022).
    // Note: We store the reserves instead of just doing `token{0,1}.balance_of_public(dex_address)` so that we can
    // make the user send the `token_in` into the pool before the swap.
    #[derive(Serialize)]
    struct State {
        token0: AztecAddress,
        token1: AztecAddress,
        liquidity_token: AztecAddress,
    }

    #[storage]
    struct Storage<Context> {
        // The following is only needed in private but we use ShareImmutable here instead of PrivateImmutable because
        // the value can be publicly known and SharedImmutable provides us with a better devex here because we don't
        // have to bother with sharing the note between pixies of users.
        state: SharedImmutable<State, Context>,
    }

    global MINIMUM_LIQUIDITY: u64 = 1000;
    global LOCK_STORAGE_SLOT = 980908; // Arbitrarily chosen lock storage slot.

    // Note: Since we don't have inheritance it seems the easiest to deploy the standard token and use it as
    // a liquidity tracking contract. This contract would be an admin of the liquidity contract.
    // TODO: Either deploy the liquidity contract in the constructor or somehow verify it.
    #[public]
    #[initializer]
    fn constructor(token0: AztecAddress, token1: AztecAddress, liquidity_token: AztecAddress) {
        let state = State { token0, token1, liquidity_token };
        storage.state.initialize(state);
    }

    // Privately adds liquidity for `liquidity_provider` to the pool (identity of liquidity provider not revealed).
    // `amount0_desired` and `amount1_desired` are the amounts of tokens we ideally want to add. `amount0_min`
    // and `amount1_min` are the minimum amounts we are willing to add. `transfer_preparer_storage_slot_commitment`
    // is a storage slot commitment used for all 3 partial notes finalized in this tx (token0 refund note, token1
    // refund note, liquidity token partial note).
    // (Note: It's fine to use 1 commitment for all 3 partial notes as it's used for transient storage in different
    // contracts). It's necessary to prepare the 3 partial notes in a `BatchCall` before calling this function.
    // Note: We needed to make the identity of liquidity provider private because we don't have a transfer_from flow
    // where the token amount is not known in advance and we don't need to know the amounts for partial notes.
    #[private]
    fn add_liquidity(
        amount0_desired: u64,
        amount1_desired: u64,
        amount0_min: u64,
        amount1_min: u64,
        nonce: Field
    ) {
        // TODO: Do we need reentrancy guards in the private funcs? And if yes how to do it?
        assert(amount0_desired > 0 & amount1_desired > 0, "INSUFFICIENT_INPUT_AMOUNTS");

        let state = storage.state.read_private();

        let token0 = Token::at(state.token0);
        let token1 = Token::at(state.token1);
        let liquidity_token = Token::at(state.liquidity_token);

        // The following 2 functions burn user's notes worth `amount0_desired` and `amount1_desired`, they prepare
        // the partial notes for refunds and enqueue 2 public calls that transfer the amounts to the DEX.
        let refund_token0_slot_commitment = token0.prepare_transfer_to_public_with_refund(msg.sender, context.this_address(), amount0_desired, nonce).call(&mut context);
        let refund_token1_slot_commitment = token1.prepare_transfer_to_public_with_refund(msg.sender, context.this_address(), amount1_desired, nonce).call(&mut context);
        let liquidity_slot_commitment = liquidity_token.prepare_transfer_to_private(msg.sender).call(&mut context);

        DEX::at(context.this_address())._add_liquidity(
            state,
            refund_token0_slot_commitment,
            refund_token1_slot_commitment,
            liquidity_slot_commitment,
            amount0_desired,
            amount1_desired,
            amount0_min,
            amount1_min
        ).enqueue(&mut context);
    }

    #[public]
    #[internal]
    fn _add_liquidity(
        // We pass the state as an argument in order to not have to read it from storage again.
        state: State,
        refund_token0_slot_commitment: Field,
        refund_token1_slot_commitment: Field,
        liquidity_slot_commitment: Field,
        amount0_desired: u64,
        amount1_desired: u64,
        amount0_min: u64,
        amount1_min: u64
    ) {
        // We don't need any kind of reentrancy guard here because the only way to enter this public function is from
        // `add_liquidity` which is private and since public functions cannot call private ones it's impossible to
        // reenter this function.
        let token0 = Token::at(state.token0);
        let token1 = Token::at(state.token1);
        let liquidity_token = Token::at(state.liquidity_token);

        let reserve0_with_amount0_desired = token0.balance_of_public(context.this_address()).view(&mut context) as u64; // TODO: Avoid the need for these casts.
        let reserve1_with_amount1_desired = token1.balance_of_public(context.this_address()).view(&mut context) as u64;

        let reserve0 = reserve0_with_amount0_desired - amount0_desired;
        let reserve1 = reserve1_with_amount1_desired - amount1_desired;

        // Calculate the amounts to be added to the pool
        let mut amount0 = amount0_desired;
        let mut amount1 = amount1_desired;
        if ((reserve0 != 0) | (reserve1 != 0)) {
            // First calculate the optimal amount of token1 based on the desired amount of token0.
            let amount1_optimal = get_quote(amount0_desired, reserve0, reserve1);
            if (amount1_optimal <= amount1_desired) {
                // Revert if the optimal amount of token1 is less than the desired amount of token1.
                assert(amount1_optimal >= amount1_min, "INSUFFICIENT_1_AMOUNT");
                amount0 = amount0_desired;
                amount1 = amount1_optimal;
            } else {
                // We got more amount of token1 than desired so we try repeating the process but this time by quoting
                // based on token1.
                let amount0_optimal = get_quote(amount1_desired, reserve1, reserve0);
                assert(amount0_optimal <= amount0_desired);
                assert(amount0_optimal >= amount0_min, "INSUFFICIENT_0_AMOUNT");
                amount0 = amount0_optimal;
                amount1 = amount1_desired;
            }
        }

        let refund_amount_token0 = amount0_desired - amount0;
        let refund_amount_token1 = amount1_desired - amount1;

        // The refund does not need to be finalized if the refund amount is 0 --> the partial note will either be wiped
        // out from transient storage at the end of the tx (which is fine) or it will stay in public storage (which is
        // also fine).
        if (refund_amount_token0 > 0) {
            token0.finalize_transfer_to_public_with_refund(refund_token0_slot_commitment, refund_amount_token0).call(&mut context);
        }
        if (refund_amount_token1 > 0) {
            token1.finalize_transfer_to_public_with_refund(refund_token1_slot_commitment, refund_amount_token1).call(&mut context);
        }

        // Calculate the amount of liquidity tokens to mint
        let total_supply = liquidity_token.total_supply().view(&mut context) as u64;
        let mut liquidity: u64 = 0;
        if (total_supply == 0) {
            // TODO: This is using Tonelli-Shanks to compute sqrt but Uni is using babylonian method. Is it fine to use a different one?
            // TODO: avoid the casts here. Shall we use a method natively working with some integer type?
            liquidity = std::ec::sqrt((amount0 * amount1 - MINIMUM_LIQUIDITY) as Field) as u64;
            liquidity_token.mint_public(AztecAddress::zero(), MINIMUM_LIQUIDITY as Field).call(&mut context); // permanently lock the first MINIMUM_LIQUIDITY tokens
        } else {
            liquidity = std::cmp::min(amount0 * total_supply / reserve0, amount1 * total_supply / reserve1);
        }
        assert(liquidity > 0, "INSUFFICIENT_LIQUIDITY_MINTED");
        liquidity_token.finalize_mint_to_private(liquidity_slot_commitment, liquidity).call(&mut context);
    }

    // Removes liquidity from the pool and transfers the tokens to the partial notes prepared on token0 and token1.
    // It is necessary that the liquidity provider transfers the liquidity tokens to the contract in a `BatchCall`
    // before calling this function.
    // Note: Do we consider this to be too dangerous? E.g. users accidentally transferring liquidity tokens to the pool
    // in a separate tx and then getting rugged by bots? Just transferring is the most efficient because we already
    // know the liquidity amount so we don't need partial notes and it's the most flexible: users can either call
    // `Token::transfer_in_public` or `Token::transfer_to_public` and this contract does not care.
    // `transfer_preparer_storage_slot_commitment` is a storage slot commitment used for both partial notes finalized
    // in this tx (token0 and token1 notes).
    #[public]
    fn remove_liquidity(
        amount0_min: u64,
        amount1_min: u64,
        transfer_preparer_storage_slot_commitment: Field
    ) {
        _lock(&mut context);

        // Note: We don't use authwit here as the permission from a user is given by the fact that he prepared
        // the partial notes.

        let state = storage.state.read();

        let token0 = Token::at(state.token0);
        let token1 = Token::at(state.token1);
        let liquidity_token = Token::at(state.liquidity_token);

        // Calculate the amounts to be added to the pool
        let mut balance0 = token0.balance_of_public(context.this_address()).view(&mut context);
        let mut balance1 = token1.balance_of_public(context.this_address()).view(&mut context);

        let liquidity = liquidity_token.balance_of_public(context.this_address()).view(&mut context);
        let total_supply = liquidity_token.total_supply().view(&mut context);

        let amount0 = liquidity * balance0 / total_supply;
        let amount1 = liquidity * balance1 / total_supply;
        // TODO: Nuke these castings. Ideally make Token return integer and not Field.
        assert(amount0 as u64 >= amount0_min, "INSUFFICIENT_0_AMOUNT");
        assert(amount1 as u64 >= amount1_min, "INSUFFICIENT_1_AMOUNT");

        liquidity_token.burn_public(context.this_address(), liquidity, 0).call(&mut context);
        // Note: Here we could also transfer to private if we prepared the partial notes. This might make sense to do
        // if the expectation is that users will mostly want to have private balances.
        // TODO: Implement `prepare_transfer_to_private` and `finalize_transfer_to_private` in the Token contract
        // (it's just on the NFT now).
        token0.finalize_transfer_to_private(amount0, transfer_preparer_storage_slot_commitment).call(&mut context);
        token1.finalize_transfer_to_private(amount1, transfer_preparer_storage_slot_commitment).call(&mut context);

        // We load the balances again directly from the tokens because Uni v2 does it like this. But why do they do
        // this? It's not to protect against reentrancy attacks as there are locks. Is it to protect against some weird
        // token accounting which could be affected by the transfer calls above?
        balance0 = token0.balance_of_public(context.this_address()).view(&mut context);
        balance1 = token1.balance_of_public(context.this_address()).view(&mut context);

        // Update the reserves
        let updated_state = State {
            token0: state.token0,
            token1: state.token1,
            liquidity_token: state.liquidity_token,
            reserve0: reserve0 + amount0,
            reserve1: reserve1 + amount1
        };
        storage.state.write(updated_state);

        _unlock(&mut context);
    }

    // Swaps `amount_in` of `token_in` for at least `amount_out_min` of `token_out`. The `from_0_to_1` flag indicates
    // whether we are swapping `token0` for `token1` or vice versa. Similartly to `remove_liquidity` function it is
    // expected that the user transfers the `token_in` to the pool in a `BatchCall` before calling this function.
    #[private]
    fn swap_exact_tokens_for_tokens(amount_in: u64, amount_out_min: u64, from_0_to_1: bool, nonce: Field) {
        let state = storage.state.read_private();

        let (token_address_in, token_address_out) = if from_0_to_1 {
            (state.token0, state.token1)
        } else {
            (state.token1, state.token0)
        };

        let token_in = Token::at(token_address_in);
        let token_out = Token::at(token_address_out);

        token_in.transfer_to_public(msg.sender, context.this_address(), amount_in, nonce).call(&mut context);
        let note_hiding_point_slot_commitment = token_out.prepare_transfer_to_private(context.this_address(), msg.sender).call(&mut context);

        DEX::at(context.this_address())._swap_exact_tokens_for_tokens(
            amount_in,
            amount_out_min,
            token_address_in,
            token_address_out,
            note_hiding_point_slot_commitment
        ).enqueue(&mut context);
    }

    #[public]
    #[internal]
    fn _swap_exact_tokens_for_tokens(
        amount_in: u64,
        amount_out_min: u64,
        token_address_in: AztecAddress,
        token_address_out: AztecAddress,
        note_hiding_point_slot_commitment: Field
    ) {
        // We don't need any kind of reentrancy guard here because the only way to enter this public function is from
        // `swap_exact_tokens_for_tokens` which is private and since public functions cannot call private ones
        // it's impossible to reenter this function.

        let token_in = Token::at(token_address_in);
        let token_out = Token::at(token_address_out);

        let reserve_in_with_amount_in = token_in.balance_of_public(context.this_address()).view(&mut context) as u64;
        let reserve_in = reserve_in_with_amount_in - amount_in;
        let reserve_out = token_out.balance_of_public(context.this_address()).view(&mut context) as u64;

        let amount_out = get_amount_out(amount_in, reserve_in, reserve_out);
        assert(amount_out >= amount_out_min, "INSUFFICIENT_OUTPUT_AMOUNT");

        token_out.finalize_transfer_to_private(note_hiding_point_slot_commitment, amount_out).call(&mut context);
    }

    // Note: swap_tokens_for_exact_tokens is not important for our purposes so I am not doing it.

    // After locking and unlocking there will be 1 public data write because we always commit the last change and
    // "val1 --> val2 --> val1" does not result in 0 public data writes. TODO: Either optimize this or introduce
    // transient storage.
    // TODO: It would be quite nice to have a reentrancy-guard macro as using locks will be quite common.
    #[contract_library_method]
    fn _lock(context: &mut PublicContext) {
        let already_locked: bool = context.storage_read(LOCK_STORAGE_SLOT);
        assert(!already_locked, "Already locked");
        context.storage_write(LOCK_STORAGE_SLOT, true);
    }

    #[contract_library_method]
    fn _unlock(context: &mut PublicContext) {
        let already_locked: bool = context.storage_read(LOCK_STORAGE_SLOT);
        assert(already_locked, "Not locked");
        context.storage_write(LOCK_STORAGE_SLOT, false);
    }
}
