mod lib;
mod config;

use dep::aztec::macros::aztec;

/// ## Overview
/// This contract demonstrates how to implement an **Automated Market Maker (AMM)** that maintains **public state**
/// while still achieving **identity privacy**. However, it does **not provide function privacy**:
/// - Anyone can observe **what actions** were performed.
/// - All amounts involved are visible, but **who** performed the action remains private.
///
/// Unlike most Ethereum AMMs, the AMM contract is not itself the token that tracks participation of liquidity
/// providers, mostly due to Noir lacking inheritance as a feature. Instead, the AMM is expected to have mint and burn
/// permission over an external token contract.
///
/// **Note:**
/// This is purely a demonstration. The **Aztec team** does not consider this the optimal design for building a DEX.
///
/// ## Reentrancy Guard Considerations
///
/// ### 1. Private Functions:
/// Reentrancy protection is typically necessary if entering an intermediate state that is only valid when
/// the action completes uninterrupted. This follows the **Checks-Effects-Interactions** pattern.
///
/// - In this contract, **private functions** do not introduce intermediate states.
/// - All operations will be fully executed in **public** without needing intermediate checks.
///
/// ### 2. Public Functions:
/// No **reentrancy guard** is required for public functions because:
/// - All public functions are marked as **internal** with a **single callsite** - from a private function.
/// - Public functions **cannot call private functions**, eliminating the risk of reentering into them from private.
/// - Since public functions are internal-only, **external contracts cannot access them**, ensuring no external
///   contract can trigger a reentrant call. This eliminates the following attack vector:
///   `AMM.private_fn --> AMM.public_fn --> ExternalContract.fn --> AMM.public_fn`.
#[aztec]
pub contract AMM {
    use crate::{
        config::Config,
        lib::{get_amount_in, get_amount_out, get_amounts_on_remove, get_amounts_to_add},
    };
    use dep::aztec::{
        macros::{functions::{initializer, internal, private, public, utility}, storage::storage},
        protocol_types::address::AztecAddress,
        state_vars::PublicImmutable,
    };

    use dep::token::Token;
    use dep::uint_note::uint_note::PartialUintNote;

    #[storage]
    struct Storage<Context> {
        config: PublicImmutable<Config, Context>,
    }

    /// Amount of liquidity which gets locked when liquidity is provided for the first time. Its purpose is to prevent
    /// the pool from ever emptying which could lead to undefined behavior.
    global MINIMUM_LIQUIDITY: u128 = 1000;
    /// We set it to 99 times the minimum liquidity. That way the first LP gets 99% of the value of their deposit.
    global INITIAL_LIQUIDITY: u128 = 99000;

    // TODO(#9480): Either deploy the liquidity contract in the constructor or verify it that it corresponds to what
    // this contract expects (i.e. that the AMM has permission to mint and burn).
    #[public]
    #[initializer]
    fn constructor(token0: AztecAddress, token1: AztecAddress, liquidity_token: AztecAddress) {
        storage.config.initialize(Config { token0, token1, liquidity_token });
    }

    /// Privately adds liquidity to the pool. This function receives the minimum and maximum number of tokens the caller
    /// is willing to add, in order to account for changing market conditions, and will try to add as many tokens as
    /// possible.
    ///
    /// `authwit_nonce` can be any non-zero value, as it's only used to isolate token transfer authwits to this
    /// specific call.
    ///
    /// The identity of the liquidity provider is not revealed, but the action and amounts are.
    #[private]
    fn add_liquidity(
        amount0_max: u128,
        amount1_max: u128,
        amount0_min: u128,
        amount1_min: u128,
        authwit_nonce: Field,
    ) {
        assert(
            (amount0_min < amount0_max) | (amount0_min == amount0_max),
            "INCORRECT_TOKEN0_LIMITS",
        );
        assert(
            (amount1_min < amount1_max) | (amount1_min == amount1_max),
            "INCORRECT_TOKEN1_LIMITS",
        );
        assert((0 as u128 < amount0_max) & (0 as u128 < amount1_max), "INSUFFICIENT_INPUT_AMOUNTS");

        let config = storage.config.read();

        let token0 = Token::at(config.token0);
        let token1 = Token::at(config.token1);
        let liquidity_token = Token::at(config.liquidity_token);

        let sender = context.msg_sender();

        // We don't yet know how many tokens the sender will actually supply - that can only be computed during public
        // execution since the amounts supplied must have the same ratio as the live balances. We therefore transfer the
        // maximum amounts here, and prepare partial notes that return the change to the sender (if any).
        let refund_token0_partial_note = token0
            .transfer_to_public_and_prepare_private_balance_increase(
                sender,
                context.this_address(),
                amount0_max,
                authwit_nonce,
            )
            .call(&mut context);

        let refund_token1_partial_note = token1
            .transfer_to_public_and_prepare_private_balance_increase(
                sender,
                context.this_address(),
                amount1_max,
                authwit_nonce,
            )
            .call(&mut context);

        // The number of liquidity tokens to mint for the caller depends on both the live balances and the amount
        // supplied, both of which can only be known during public execution. We therefore prepare a partial note that
        // will get completed via minting.
        let liquidity_partial_note =
            liquidity_token.prepare_private_balance_increase(sender, sender).call(&mut context);

        // We then complete the flow in public. Note that the type of operation and amounts will all be publicly known,
        // but the identity of the caller is not revealed despite us being able to send tokens to them by completing the
        // partial notes.
        AMM::at(context.this_address())
            ._add_liquidity(
                config,
                refund_token0_partial_note,
                refund_token1_partial_note,
                liquidity_partial_note,
                amount0_max,
                amount1_max,
                amount0_min,
                amount1_min,
            )
            .enqueue(&mut context);
    }

    #[public]
    #[internal]
    fn _add_liquidity(
        config: Config, // We could read this in public, but it's cheaper to receive from private
        refund_token0_partial_note: PartialUintNote,
        refund_token1_partial_note: PartialUintNote,
        liquidity_partial_note: PartialUintNote,
        amount0_max: u128,
        amount1_max: u128,
        amount0_min: u128,
        amount1_min: u128,
    ) {
        let token0 = Token::at(config.token0);
        let token1 = Token::at(config.token1);
        let liquidity_token = Token::at(config.liquidity_token);

        // We read the current AMM balance of both tokens. Note that by the time this function is called the token
        // transfers have already been completed (since those calls were enqueued before this call), and so we need to
        // subtract the transfer amount to get the pre-deposit balance.
        let balance0_plus_amount0_max =
            token0.balance_of_public(context.this_address()).view(&mut context);
        let balance0 = balance0_plus_amount0_max - amount0_max;

        let balance1_plus_amount1_max =
            token1.balance_of_public(context.this_address()).view(&mut context);
        let balance1 = balance1_plus_amount1_max - amount1_max;

        // With the current balances known, we can calculate the token amounts to the pool, respecting the user's
        // minimum deposit preferences.
        let (amount0, amount1) = get_amounts_to_add(
            amount0_max,
            amount1_max,
            amount0_min,
            amount1_min,
            balance0,
            balance1,
        );

        // Return any excess from the original token deposits.
        let refund_amount_token0 = amount0_max - amount0;
        let refund_amount_token1 = amount1_max - amount1;

        // We can simply skip the refund if the amount to return is 0 in order to save gas: the partial note will
        // simply stay in public storage and not be completed, but this is not an issue.
        if (refund_amount_token0 > 0 as u128) {
            token0
                .finalize_transfer_to_private(refund_amount_token0, refund_token0_partial_note)
                .call(&mut context);
        }
        if (refund_amount_token1 > 0 as u128) {
            token1
                .finalize_transfer_to_private(refund_amount_token1, refund_token1_partial_note)
                .call(&mut context);
        }

        // With the deposit amounts known, we can compute the number of liquidity tokens to mint and finalize the
        // depositor's partial note.
        let total_supply = liquidity_token.total_supply().view(&mut context);
        let liquidity_amount = if total_supply != 0 as u128 {
            // The liquidity token supply increases by the same ratio as the balances. In case one of the token balances
            // increased with a ratio different from the other one, we simply take the smallest value.
            std::cmp::min(
                (amount0 * total_supply) / balance0,
                (amount1 * total_supply) / balance1,
            )
        } else {
            // The zero total supply case (i.e. pool initialization) is special as we can't increase the supply
            // proportionally. We instead set the initial liquidity to an arbitrary amount.
            // We could set the initial liquidity to be equal to the pool invariant (i.e. sqrt(amount0 * amount1)) if
            // we wanted to collect protocol fees over swap fees (in the style of Uniswap v2), but we choose not to in
            // order to keep things simple.

            // As part of initialization, we mint some tokens to the zero address to 'lock' them (i.e. make them
            // impossible to redeem), guaranteeing total supply will never be zero again.
            liquidity_token.mint_to_public(AztecAddress::zero(), MINIMUM_LIQUIDITY).call(
                &mut context,
            );

            INITIAL_LIQUIDITY
        };

        assert(liquidity_amount > 0 as u128, "INSUFFICIENT_LIQUIDITY_MINTED");
        liquidity_token.finalize_mint_to_private(liquidity_amount, liquidity_partial_note).call(
            &mut context,
        );
    }

    /// Privately removes liquidity from the pool. This function receives how many liquidity tokens to burn, and the
    /// minimum number of tokens the caller is willing to receive, in order to account for changing market conditions.
    ///
    /// `authwit_nonce` can be any non-zero value, as it's only used to isolate token transfer authwits to this
    /// specific call.
    ///
    /// The identity of the liquidity provider is not revealed, but the action and amounts are.
    #[private]
    fn remove_liquidity(
        liquidity: u128,
        amount0_min: u128,
        amount1_min: u128,
        authwit_nonce: Field,
    ) {
        let config = storage.config.read();

        let liquidity_token = Token::at(config.liquidity_token);
        let token0 = Token::at(config.token0);
        let token1 = Token::at(config.token1);

        let sender = context.msg_sender();

        // Liquidity tokens are burned when liquidity is removed in order to reduce the total supply. However, we lack
        // a function to privately burn, so we instead transfer the tokens into the AMM's public balance, and then have
        // the AMM publicly burn its own tokens.
        // TODO(#10287): consider adding a private burn
        liquidity_token
            .transfer_to_public(sender, context.this_address(), liquidity, authwit_nonce)
            .call(&mut context);

        // We don't yet know how many tokens the sender will get - that can only be computed during public execution
        // since the it depends on the live balances. We therefore simply prepare partial notes to the sender.
        let token0_partial_note =
            token0.prepare_private_balance_increase(sender, sender).call(&mut context);
        let token1_partial_note =
            token1.prepare_private_balance_increase(sender, sender).call(&mut context);

        // We then complete the flow in public. Note that the type of operation and amounts will all be publicly known,
        // but the identity of the caller is not revealed despite us being able to send tokens to them by completing the
        // partial notes.
        AMM::at(context.this_address())
            ._remove_liquidity(
                config,
                liquidity,
                token0_partial_note,
                token1_partial_note,
                amount0_min,
                amount1_min,
            )
            .enqueue(&mut context);
    }

    #[public]
    #[internal]
    fn _remove_liquidity(
        config: Config, // We could read this in public, but it's cheaper to receive from private
        liquidity: u128,
        token0_partial_note: PartialUintNote,
        token1_partial_note: PartialUintNote,
        amount0_min: u128,
        amount1_min: u128,
    ) {
        let token0 = Token::at(config.token0);
        let token1 = Token::at(config.token1);
        let liquidity_token = Token::at(config.liquidity_token);

        // We need the current balance of both tokens as well as the liquidity token total supply in order to compute
        // the amounts to send the user.
        let balance0 = token0.balance_of_public(context.this_address()).view(&mut context);
        let balance1 = token1.balance_of_public(context.this_address()).view(&mut context);
        let total_supply = liquidity_token.total_supply().view(&mut context);

        // We calculate the amounts of token0 and token1 the user is entitled to based on the amount of liquidity they
        // are removing, and check that they are above the minimum amounts they requested.
        let (amount0, amount1) = get_amounts_on_remove(liquidity, total_supply, balance0, balance1);
        assert(amount0 >= amount0_min, "INSUFFICIENT_0_AMOUNT");
        assert(amount1 >= amount1_min, "INSUFFICIENT_1_AMOUNT");

        // We can now burn the liquidity tokens that had been privately transferred into the AMM, as well as complete
        // both partial notes.
        liquidity_token.burn_public(context.this_address(), liquidity, 0).call(&mut context);
        token0.finalize_transfer_to_private(amount0, token0_partial_note).call(&mut context);
        token1.finalize_transfer_to_private(amount1, token1_partial_note).call(&mut context);
    }

    /// Privately swaps `amount_in` `token_in` tokens for at least `amount_out_mint` `token_out` tokens with the pool.
    ///
    /// `authwit_nonce` can be any non-zero value, as it's only used to isolate token transfer authwits to this
    /// specific call.
    ///
    /// The identity of the swapper is not revealed, but the action and amounts are.
    #[private]
    fn swap_exact_tokens_for_tokens(
        token_in: AztecAddress,
        token_out: AztecAddress,
        amount_in: u128,
        amount_out_min: u128,
        authwit_nonce: Field,
    ) {
        let config = storage.config.read();

        assert((token_in == config.token0) | (token_in == config.token1), "TOKEN_IN_IS_INVALID");
        assert((token_out == config.token0) | (token_out == config.token1), "TOKEN_OUT_IS_INVALID");
        assert(token_in != token_out, "SAME_TOKEN_SWAP");

        let sender = context.msg_sender();

        // We transfer the full amount in, since it is an exact amount, and prepare a partial note for the amount out,
        // which will only be known during public execution as it depends on the live balances.
        Token::at(token_in)
            .transfer_to_public(sender, context.this_address(), amount_in, authwit_nonce)
            .call(&mut context);
        let token_out_partial_note = Token::at(token_out)
            .prepare_private_balance_increase(sender, sender)
            .call(&mut context);

        AMM::at(context.this_address())
            ._swap_exact_tokens_for_tokens(
                token_in,
                token_out,
                amount_in,
                amount_out_min,
                token_out_partial_note,
            )
            .enqueue(&mut context);
    }

    #[public]
    #[internal]
    fn _swap_exact_tokens_for_tokens(
        token_in: AztecAddress,
        token_out: AztecAddress,
        amount_in: u128,
        amount_out_min: u128,
        token_out_partial_note: PartialUintNote,
    ) {
        // In order to compute the amount to swap we need the live token balances. Note that at this state the token in
        // transfer has already been completed as that function call was enqueued before this one. We therefore need to
        // subtract the amount in to get the pre-swap balances.
        let balance_in_plus_amount_in =
            Token::at(token_in).balance_of_public(context.this_address()).view(&mut context);
        let balance_in = balance_in_plus_amount_in - amount_in;

        let balance_out =
            Token::at(token_out).balance_of_public(context.this_address()).view(&mut context);

        // We can now compute the number of tokens to transfer and complete the partial note.
        let amount_out = get_amount_out(amount_in, balance_in, balance_out);
        assert(amount_out >= amount_out_min, "INSUFFICIENT_OUTPUT_AMOUNT");

        Token::at(token_out).finalize_transfer_to_private(amount_out, token_out_partial_note).call(
            &mut context,
        );
    }

    /// Privately swaps at most `amount_in_max` `token_in` tokens for `amount_out` `token_out` tokens with the pool.
    ///
    /// `authwit_nonce` can be any non-zero value, as it's only used to isolate token transfer authwits to this
    /// specific call.
    ///
    /// The identity of the swapper is not revealed, but the action and amounts are.
    #[private]
    fn swap_tokens_for_exact_tokens(
        token_in: AztecAddress,
        token_out: AztecAddress,
        amount_out: u128,
        amount_in_max: u128,
        authwit_nonce: Field,
    ) {
        let config = storage.config.read();

        assert((token_in == config.token0) | (token_in == config.token1), "TOKEN_IN_IS_INVALID");
        assert((token_out == config.token0) | (token_out == config.token1), "TOKEN_OUT_IS_INVALID");
        assert(token_in != token_out, "SAME_TOKEN_SWAP");

        let sender = context.msg_sender();

        // We don't know how many tokens we'll receive from the user, since the swap amount will only be known during
        // public execution as it depends on the live balances. We therefore transfer the full maximum amount and
        // prepare partial notes both for the token out and the refund.
        // Technically the token out note does not need to be partial, since we do know the amount out, but we do want
        // to wait until the swap has been completed before committing the note to the tree to avoid it being spent too
        // early.
        let change_token_in_partial_note = Token::at(token_in)
            .transfer_to_public_and_prepare_private_balance_increase(
                sender,
                context.this_address(),
                amount_in_max,
                authwit_nonce,
            )
            .call(&mut context);

        let token_out_partial_note = Token::at(token_out)
            .prepare_private_balance_increase(sender, sender)
            .call(&mut context);

        AMM::at(context.this_address())
            ._swap_tokens_for_exact_tokens(
                token_in,
                token_out,
                amount_in_max,
                amount_out,
                change_token_in_partial_note,
                token_out_partial_note,
            )
            .enqueue(&mut context);
    }

    #[public]
    #[internal]
    fn _swap_tokens_for_exact_tokens(
        token_in: AztecAddress,
        token_out: AztecAddress,
        amount_in_max: u128,
        amount_out: u128,
        change_token_in_partial_note: PartialUintNote,
        token_out_partial_note: PartialUintNote,
    ) {
        // In order to compute the amount to swap we need the live token balances. Note that at this state the token in
        // transfer has already been completed as that function call was enqueued before this one. We therefore need to
        // subtract the amount in to get the pre-swap balances.
        let balance_in_plus_amount_in_max =
            Token::at(token_in).balance_of_public(context.this_address()).view(&mut context);
        let balance_in = balance_in_plus_amount_in_max - amount_in_max;

        let balance_out =
            Token::at(token_out).balance_of_public(context.this_address()).view(&mut context);

        // We can now compute the number of tokens we need to receive and complete the partial note with the change.
        let amount_in = get_amount_in(amount_out, balance_in, balance_out);
        assert(amount_in <= amount_in_max, "INSUFFICIENT_OUTPUT_AMOUNT");

        let change = amount_in_max - amount_in;
        if (change > 0 as u128) {
            Token::at(token_in)
                .finalize_transfer_to_private(change, change_token_in_partial_note)
                .call(&mut context);
        }

        // Note again that we already knew the amount out, but for consistency we want to only commit this note once
        // all other steps have been performed.
        Token::at(token_out).finalize_transfer_to_private(amount_out, token_out_partial_note).call(
            &mut context,
        );
    }

    #[utility]
    unconstrained fn get_amount_out_for_exact_in(
        balance_in: u128,
        balance_out: u128,
        amount_in: u128,
    ) -> u128 {
        // Ideally we'd call the token contract in order to read the current balance, but we can't due to #7524.
        get_amount_out(amount_in, balance_in, balance_out)
    }

    #[utility]
    unconstrained fn get_amount_in_for_exact_out(
        balance_in: u128,
        balance_out: u128,
        amount_out: u128,
    ) -> u128 {
        // Ideally we'd call the token contract in order to read the current balance, but we can't due to #7524.
        get_amount_in(amount_out, balance_in, balance_out)
    }
}
