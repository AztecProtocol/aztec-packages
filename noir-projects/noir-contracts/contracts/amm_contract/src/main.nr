mod lib;

use dep::aztec::macros::aztec;

/// This contract is a demonstration of how an Automated Market Maker (AMM) that requires public state while still
/// achieving identity privacy can be implemented. It does not, however, provide function privacy.
///
/// Note: This is only a demonstration and we (Aztec team) do not think this is the best way to build a DEX.
#[aztec]
contract AMM {
    use crate::lib::{get_quote, get_amount_out, get_amount_in};
    use dep::aztec::{
        macros::{storage::storage, events::event, functions::{private, public, view, internal, initializer}},
        prelude::{AztecAddress, SharedImmutable}, protocol_types::traits::Serialize
    };
    use std::meta::derive;
    use dep::token::Token;

    /// We store the tokens of the pool in a struct such that to load it from SharedImmutable asserts only a single
    /// merkle proof.
    /// (Once we actually do the optimization. WIP in https://github.com/AztecProtocol/aztec-packages/pull/8022).
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

    /// Amount of liquidity which gets locked in the pool when liquidity is provided for the first time. It's purpose
    /// is to prevent the pool from ever emptying which could lead to undefined behavior.
    global MINIMUM_LIQUIDITY: u64 = 1000;

    // Note: Since we don't have inheritance it seems the easiest to deploy the standard token and use it as
    // a liquidity tracking contract. This contract would be an admin of the liquidity contract.
    // TODO: Either deploy the liquidity contract in the constructor or verify it that it corresponds to what
    // this contract expects.
    #[public]
    #[initializer]
    fn constructor(token0: AztecAddress, token1: AztecAddress, liquidity_token: AztecAddress) {
        storage.state.initialize(State { token0, token1, liquidity_token });
    }

    /// Privately adds liquidity to the pool (identity of liquidity provider not revealed). `amount0_desired`
    /// and `amount1_desired` are the amounts of tokens we ideally want to add. `amount0_min` and `amount1_min`
    /// are the minimum amounts we are willing to add. `nonce` can be arbitrary non-zero value and it's here to
    /// isolate authwits to this specific call.
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

        // We transfer the desired amounts of tokens to this contract.
        token0.transfer_to_public(msg.sender, context.this_address(), amount0_desired, nonce).call(&mut context);
        token1.transfer_to_public(msg.sender, context.this_address(), amount1_desired, nonce).call(&mut context);

        // Since not all the desired amounts of tokens might be accepted we prepare partial notes for the refunds.
        let refund_token0_slot_commitment = token0.prepare_transfer_to_private(msg.sender, context.this_address(), nonce).call(&mut context);
        let refund_token1_slot_commitment = token1.prepare_transfer_to_private(msg.sender, context.this_address(), nonce).call(&mut context);
        // We prepare a partial note for the liquidity tokens.
        let liquidity_slot_commitment = liquidity_token.prepare_transfer_to_private(msg.sender).call(&mut context);

        AMM::at(context.this_address())._add_liquidity(
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
        // We pass the state as an argument in order to not have to read it from public storage again.
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
            token0.finalize_transfer_to_private(refund_token0_slot_commitment, refund_amount_token0).call(&mut context);
        }
        if (refund_amount_token1 > 0) {
            token1.finalize_transfer_to_private(refund_token1_slot_commitment, refund_amount_token1).call(&mut context);
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

    /// Removes `liquidity` from the pool and transfers the tokens back to the user. `amount0_min` and `amount1_min` are
    /// the minimum amounts of `token0` and `token1` the user is willing to accept. `nonce` can be arbitrary non-zero
    /// value and its purpose is to isolate authwits to this specific call.
    #[private]
    fn remove_liquidity(liquidity: u64, amount0_min: u64, amount1_min: u64, nonce: Field) {
        // TODO: Do we need reentrancy guards in the private funcs? And if yes how to do it?
        let state = storage.state.read_private();

        let liquidity_token = Token::at(state.liquidity_token);
        let token0 = Token::at(state.token0);
        let token1 = Token::at(state.token1);

        // We transfer the liquidity tokens to this contract and prepare partial notes for the output tokens.
        liquidity_token.transfer_to_public(msg.sender, context.this_address(), liquidity, nonce).call(&mut context);
        let token0_slot_commitment = token0.prepare_transfer_to_private(context.this_address(), msg.sender, nonce).call(&mut context);
        let token1_slot_commitment = token1.prepare_transfer_to_private(context.this_address(), msg.sender, nonce).call(&mut context);

        AMM::at(context.this_address())._remove_liquidity(
            state,
            token0_slot_commitment,
            token1_slot_commitment,
            liquidity,
            amount0_min,
            amount1_min
        ).enqueue(&mut context);
    }

    #[public]
    #[internal]
    fn _remove_liquidity(
        // We pass the state as an argument in order to not have to read it from public storage again.
        state: State,
        token0_slot_commitment: Field,
        token1_slot_commitment: Field,
        liquidity: u64,
        amount0_min: u64,
        amount1_min: u64
    ) {
        // We don't need any kind of reentrancy guard here because the only way to enter this public function is from
        // `remove_liquidity` which is private and since public functions cannot call private ones it's impossible to
        // reenter this function.

        let token0 = Token::at(state.token0);
        let token1 = Token::at(state.token1);
        let liquidity_token = Token::at(state.liquidity_token);

        // We get the reserves and the liquidity token total supply.
        let reserve0 = token0.balance_of_public(context.this_address()).view(&mut context) as u64;
        let reserve1 = token1.balance_of_public(context.this_address()).view(&mut context) as u64;
        let total_supply = liquidity_token.total_supply().view(&mut context) as u64;

        // We calculate the amounts of token0 and token1 the user is entitled to based on the amount of liquidity they
        // are removing.
        let amount0 = liquidity * reserve0 / total_supply;
        let amount1 = liquidity * reserve1 / total_supply;

        // We check if the amounts are greater than the minimum amounts the user is willing to accept.
        assert(amount0 >= amount0_min, "INSUFFICIENT_0_AMOUNT");
        assert(amount1 >= amount1_min, "INSUFFICIENT_1_AMOUNT");

        // At last we burn the liquidity tokens and transfer the token0 and token1 to the user.
        liquidity_token.burn_public(context.this_address(), liquidity, 0).call(&mut context);
        token0.finalize_transfer_to_private(token0_slot_commitment, amount0).call(&mut context);
        token1.finalize_transfer_to_private(token1_slot_commitment, amount1).call(&mut context);
    }

    /// Swaps `amount_in` of `token_in` for at least `amount_out_min` of `token_out`. The `from_0_to_1` flag indicates
    /// whether we are swapping `token0` for `token1` or vice versa. `nonce` can be arbitrary non-zero value and its
    /// purpose is to isolate authwits to this specific call.
    #[private]
    fn swap_exact_tokens_for_tokens(
        amount_in: u64,
        amount_out_min: u64,
        from_0_to_1: bool,
        nonce: Field
    ) {
        let state = storage.state.read_private();

        let (token_address_in, token_address_out) = if from_0_to_1 {
            (state.token0, state.token1)
        } else {
            (state.token1, state.token0)
        };

        let token_in = Token::at(token_address_in);
        let token_out = Token::at(token_address_out);

        // We transfer the `amount_in` to this contract and we prepare partial note for the output token.
        token_in.transfer_to_public(msg.sender, context.this_address(), amount_in, nonce).call(&mut context);
        let token_out_slot_commitment = token_out.prepare_transfer_to_private(context.this_address(), msg.sender).call(&mut context);

        AMM::at(context.this_address())._swap_exact_tokens_for_tokens(
            amount_in,
            amount_out_min,
            token_address_in,
            token_address_out,
            token_out_slot_commitment
        ).enqueue(&mut context);
    }

    #[public]
    #[internal]
    fn _swap_exact_tokens_for_tokens(
        amount_in: u64,
        amount_out_min: u64,
        token_address_in: AztecAddress,
        token_address_out: AztecAddress,
        token_out_slot_commitment: Field
    ) {
        // We don't need any kind of reentrancy guard here because the only way to enter this public function is from
        // `swap_exact_tokens_for_tokens` which is private and since public functions cannot call private ones
        // it's impossible to reenter this function.

        let token_in = Token::at(token_address_in);
        let token_out = Token::at(token_address_out);

        // We get the reserves. The `amount_in` was already transferred to this contract so we need to subtract it.
        let reserve_in_with_amount_in = token_in.balance_of_public(context.this_address()).view(&mut context) as u64;
        let reserve_in = reserve_in_with_amount_in - amount_in;
        let reserve_out = token_out.balance_of_public(context.this_address()).view(&mut context) as u64;

        // Calculate the amount of output token we will get.
        let amount_out = get_amount_out(amount_in, reserve_in, reserve_out);
        assert(amount_out >= amount_out_min, "INSUFFICIENT_OUTPUT_AMOUNT");

        // Transfer the output token to the user.
        token_out.finalize_transfer_to_private(token_out_slot_commitment, amount_out).call(&mut context);
    }

    /// Swaps `amount_out` of `token_out` for at most `amount_in_max` of `token_in`. The `from_0_to_1` flag indicates
    /// whether we are swapping `token0` for `token1` or vice versa. `nonce` can be arbitrary non-zero value and its
    /// purpose is to isolate authwits to this specific call.
    #[private]
    fn swap_tokens_for_exact_tokens(
        amount_out: u64,
        amount_in_max: u64,
        from_0_to_1: bool,
        nonce: Field
    ) {
        let state = storage.state.read_private();

        let (token_address_in, token_address_out) = if from_0_to_1 {
            (state.token0, state.token1)
        } else {
            (state.token1, state.token0)
        };

        let token_in = Token::at(token_address_in);
        let token_out = Token::at(token_address_out);

        // We transfer the `amount_in_max` to this contract and we prepare partial notes for refund and for the output
        // token.
        token_in.transfer_to_public(msg.sender, context.this_address(), amount_in_max, nonce).call(&mut context);
        let refund_token_in_slot_commitment = token_in.prepare_transfer_to_private(msg.sender, context.this_address(), nonce).call(&mut context);
        let token_out_slot_commitment = token_out.prepare_transfer_to_private(context.this_address(), msg.sender).call(&mut context);

        AMM::at(context.this_address())._swap_tokens_for_exact_tokens(
            refund_token_in_slot_commitment,
            token_out_slot_commitment,
            amount_out,
            amount_in_max,
            token_address_in,
            token_address_out
        ).enqueue(&mut context);
    }

    #[public]
    #[internal]
    fn _swap_tokens_for_exact_tokens(
        refund_token_in_slot_commitment: Field,
        token_out_slot_commitment: Field,
        amount_out: u64,
        amount_in_max: u64,
        token_address_in: AztecAddress,
        token_address_out: AztecAddress
    ) {
        // We don't need any kind of reentrancy guard here because the only way to enter this public function is from
        // `swap_tokens_for_exact_tokens` which is private and since public functions cannot call private ones
        // it's impossible to reenter this function.

        let token_in = Token::at(token_address_in);
        let token_out = Token::at(token_address_out);

        // We get the reserves. The `amount_in_max` was already transferred to this contract so we need to subtract it.
        let reserve_in_with_amount_in_max = token_in.balance_of_public(context.this_address()).view(&mut context) as u64;
        let reserve_in = reserve_in_with_amount_in_max - amount_in_max;
        let reserve_out = token_out.balance_of_public(context.this_address()).view(&mut context) as u64;

        // Calculate the amount of input token needed to get the desired amount of output token.
        let amount_in = get_amount_in(amount_out, reserve_in, reserve_out);
        assert(amount_in <= amount_in_max, "EXCESSIVE_INPUT_AMOUNT");

        // If less than amount_in_max of input token was needed we refund the difference.
        let refund_amount = amount_in_max - amount_in;
        if (refund_amount > 0) {
            token_in.finalize_transfer_to_private(refund_token_in_slot_commitment, refund_amount).call(&mut context);
        }

        // Transfer the output token to the user.
        token_out.finalize_transfer_to_private(token_out_slot_commitment, amount_out).call(&mut context);
    }
}
