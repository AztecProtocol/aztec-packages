mod lib;
mod config;
mod test;

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
contract AMM {
    use crate::{config::Config, lib::{get_amount_in, get_amount_out, get_amounts_to_add}};
    use dep::aztec::{
        macros::{functions::{initializer, internal, private, public}, storage::storage},
        prelude::{AztecAddress, SharedImmutable},
    };
    use dep::token::Token;

    #[storage]
    struct Storage<Context> {
        // The following is only needed in private but we use ShareImmutable here instead of PrivateImmutable because
        // the value can be publicly known and SharedImmutable provides us with a better devex here because we don't
        // have to bother with sharing the note between pixies of users.
        config: SharedImmutable<Config, Context>,
    }

    /// Amount of liquidity which gets locked when liquidity is provided for the first time. Its purpose is to prevent
    /// the pool from ever emptying which could lead to undefined behavior.
    global MINIMUM_LIQUIDITY = U128::from_integer(1000);
    /// We set it to 100 times the minimum liquidity. That way the first LP gets 99% of the value of their deposit.
    global INITIAL_LIQUIDITY = U128::from_integer(100000);

    // TODO(#9480): Either deploy the liquidity contract in the constructor or verify it that it corresponds to what
    // this contract expects (i.e. that the AMM has permission to mint and burn).
    #[public]
    #[initializer]
    fn constructor(token0: AztecAddress, token1: AztecAddress, liquidity_token: AztecAddress) {
        storage.config.initialize(Config { token0, token1, liquidity_token });
    }

    /// Privately adds liquidity to the pool. The identity of the liquidity provider not revealed, but the action and
    /// amounts is. This function receives the minimum and maximum number of tokens the caller is willing to add, in
    /// order to account for changing market conditions, and will try to add as many tokens as possible.
    // `nonce` can be any non-zero value, as it's only used to isolate token transfer authwits to this specific call.
    #[private]
    fn add_liquidity(
        amount0_max: Field,
        amount1_max: Field,
        amount0_min: Field,
        amount1_min: Field,
        nonce: Field,
    ) {
        assert(amount0_min.lt(amount0_max) | (amount0_min == amount0_max), "INCORRECT_TOKEN0_LIMITS");
        assert(amount1_min.lt(amount1_max) | (amount1_min == amount1_max), "INCORRECT_TOKEN1_LIMITS");
        assert(0.lt(amount0_max) & 0.lt(amount1_max), "INSUFFICIENT_INPUT_AMOUNTS");

        let config = storage.config.read_private();

        let token0 = Token::at(config.token0);
        let token1 = Token::at(config.token1);
        let liquidity_token = Token::at(config.liquidity_token);

        // We don't yet know how many tokens the sender will actually supply - that can only be computed during public
        // execution since the amounts supplied must have the same ratio as the live balances. We therefore transfer the
        // maximum amounts here, and prepare partial notes that return the change to the sender (if any).
        token0
            .transfer_to_public(context.msg_sender(), context.this_address(), amount0_max, nonce)
            .call(&mut context);
        let refund_token0_hiding_point_slot =
            token0.prepare_private_balance_increase(context.msg_sender()).call(&mut context);

        token1
            .transfer_to_public(context.msg_sender(), context.this_address(), amount1_max, nonce)
            .call(&mut context);
        let refund_token1_hiding_point_slot =
            token1.prepare_private_balance_increase(context.msg_sender()).call(&mut context);

        // The number of liquidity tokens to mint for the caller depends on both the live balances and the amount
        // supplied, both of which can only be known during public execution. We therefore prepare a partial note that
        // will get completed via minting.
        let liquidity_hiding_point_slot = liquidity_token
            .prepare_private_balance_increase(context.msg_sender())
            .call(&mut context);

        // We then complete the flow in public. Note that the type of operation and amounts will all be publicly known,
        // but the identity of the caller is not revealed despite us being able to send tokens to them by completing the
        // partial notees.
        AMM::at(context.this_address())
            ._add_liquidity(
                config,
                refund_token0_hiding_point_slot,
                refund_token1_hiding_point_slot,
                liquidity_hiding_point_slot,
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
        refund_token0_hiding_point_slot: Field,
        refund_token1_hiding_point_slot: Field,
        liquidity_hiding_point_slot: Field,
        amount0_max: Field,
        amount1_max: Field,
        amount0_min: Field,
        amount1_min: Field,
    ) {
        // TODO(#8271): Type the args as U128 and nuke these ugly casts
        let amount0_max = U128::from_integer(amount0_max);
        let amount1_max = U128::from_integer(amount1_max);
        let amount0_min = U128::from_integer(amount0_min);
        let amount1_min = U128::from_integer(amount1_min);

        let token0 = Token::at(config.token0);
        let token1 = Token::at(config.token1);
        let liquidity_token = Token::at(config.liquidity_token);

        // We read the current AMM balance of both tokens. Note that by the time this function is called the token
        // transfers have already been completed (since those calls were enqueued before this call), and so we need to
        // substract the transfer amount to get the pre-deposit balance.
        let balance0_plus_amount0_max = U128::from_integer(token0
            .balance_of_public(context.this_address())
            .view(&mut context));
        let balance0 = balance0_plus_amount0_max - amount0_max;

        let balance1_plus_amount1_max = U128::from_integer(token1
            .balance_of_public(context.this_address())
            .view(&mut context));
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
        if (refund_amount_token0 > U128::zero()) {
            token0
                .finalize_transfer_to_private(
                    refund_amount_token0.to_integer(),
                    refund_token0_hiding_point_slot,
                )
                .call(&mut context);
        }
        if (refund_amount_token1 > U128::zero()) {
            token1
                .finalize_transfer_to_private(
                    refund_amount_token1.to_integer(),
                    refund_token1_hiding_point_slot,
                )
                .call(&mut context);
        }

        // With the deposit amounts known, we can compute the number of liquidity tokens to mint and finalize the
        // depositor's partial note.
        let total_supply = U128::from_integer(liquidity_token.total_supply().view(&mut context));
        let liquidity_amount = if total_supply != U128::zero() {
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
            liquidity_token
                .mint_to_public(AztecAddress::zero(), MINIMUM_LIQUIDITY.to_integer())
                .call(&mut context);

            INITIAL_LIQUIDITY
        };

        assert(liquidity_amount > U128::zero(), "INSUFFICIENT_LIQUIDITY_MINTED");
        liquidity_token
            .finalize_mint_to_private(liquidity_amount.to_integer(), liquidity_hiding_point_slot)
            .call(&mut context);
    }

    /// Removes `liquidity` from the pool and transfers the tokens back to the user. `amount0_min` and `amount1_min` are
    /// the minimum amounts of `token0` and `token1` the user is willing to accept. `nonce` can be arbitrary non-zero
    /// value and its purpose is to isolate authwits to this specific call.
    /// TODO(#8271): Type the args as U128
    #[private]
    fn remove_liquidity(liquidity: Field, amount0_min: Field, amount1_min: Field, nonce: Field) {
        let config = storage.config.read_private();

        let liquidity_token = Token::at(config.liquidity_token);
        let token0 = Token::at(config.token0);
        let token1 = Token::at(config.token1);

        // We transfer the liquidity tokens to this contract and prepare partial notes for the output tokens. We are
        // forced to first transfer into the AMM because it is not possible to burn in private - the enqueued public
        // call would reveal who the owner was. The only way to pbalance their identity is to first privately transfer.
        liquidity_token
            .transfer_to_public(context.msg_sender(), context.this_address(), liquidity, nonce)
            .call(&mut context);
        let token0_hiding_point_slot =
            token0.prepare_private_balance_increase(context.msg_sender()).call(&mut context);
        let token1_hiding_point_slot =
            token1.prepare_private_balance_increase(context.msg_sender()).call(&mut context);

        AMM::at(context.this_address())
            ._remove_liquidity(
                config,
                token0_hiding_point_slot,
                token1_hiding_point_slot,
                liquidity,
                amount0_min,
                amount1_min,
            )
            .enqueue(&mut context);
    }

    #[public]
    #[internal]
    fn _remove_liquidity(
        // We pass the state as an argument in order to not have to read it from public storage again.
        config: Config,
        token0_hiding_point_slot: Field,
        token1_hiding_point_slot: Field,
        liquidity: Field,
        amount0_min: Field,
        amount1_min: Field,
    ) {
        // TODO(#8271): Type the args as U128 and nuke these ugly casts
        let liquidity = U128::from_integer(liquidity);
        let amount0_min = U128::from_integer(amount0_min);
        let amount1_min = U128::from_integer(amount1_min);

        let token0 = Token::at(config.token0);
        let token1 = Token::at(config.token1);
        let liquidity_token = Token::at(config.liquidity_token);

        // We get the balances and the liquidity token total supply.
        let balance0 = U128::from_integer(token0.balance_of_public(context.this_address()).view(
            &mut context,
        ));
        let balance1 = U128::from_integer(token1.balance_of_public(context.this_address()).view(
            &mut context,
        ));
        let total_supply = U128::from_integer(liquidity_token.total_supply().view(&mut context));

        // We calculate the amounts of token0 and token1 the user is entitled to based on the amount of liquidity they
        // are removing.
        let amount0 = liquidity * balance0 / total_supply;
        let amount1 = liquidity * balance1 / total_supply;

        // We check if the amounts are greater than the minimum amounts the user is willing to accept.
        assert(amount0 >= amount0_min, "INSUFFICIENT_0_AMOUNT");
        assert(amount1 >= amount1_min, "INSUFFICIENT_1_AMOUNT");

        // At last we burn the liquidity tokens and transfer the token0 and token1 to the user.
        liquidity_token.burn_public(context.this_address(), liquidity.to_integer(), 0).call(
            &mut context,
        );
        token0.finalize_transfer_to_private(amount0.to_integer(), token0_hiding_point_slot).call(
            &mut context,
        );
        token1.finalize_transfer_to_private(amount1.to_integer(), token1_hiding_point_slot).call(
            &mut context,
        );
    }

    /// Swaps `amount_in` of `token_in` for at least `amount_out_min` of `token_out`. The `from_0_to_1` flag indicates
    /// whether we are swapping `token0` for `token1` or vice versa. `nonce` can be arbitrary non-zero value and its
    /// purpose is to isolate authwits to this specific call.
    /// TODO(#8271): Type the args as U128
    #[private]
    fn swap_exact_tokens_for_tokens(
        token_in: AztecAddress,
        token_out: AztecAddress,
        amount_in: Field,
        amount_out_min: Field,
        nonce: Field,
    ) {
        let config = storage.config.read_private();

        // We check the tokens are valid
        assert(token_in != token_out);
        assert((token_in == config.token0) | (token_in == config.token1));
        assert((token_out == config.token0) | (token_out == config.token1));

        let token_in_contract = Token::at(token_in);
        let token_out_contract = Token::at(token_out);

        // We transfer the `amount_in` to this contract and we prepare partial note for the output token.
        token_in_contract
            .transfer_to_public(context.msg_sender(), context.this_address(), amount_in, nonce)
            .call(&mut context);
        let token_out_hiding_point_slot = token_out_contract
            .prepare_private_balance_increase(context.msg_sender())
            .call(&mut context);

        AMM::at(context.this_address())
            ._swap_exact_tokens_for_tokens(
                token_in,
                token_out,
                amount_in,
                amount_out_min,
                token_out_hiding_point_slot,
            )
            .enqueue(&mut context);
    }

    #[public]
    #[internal]
    fn _swap_exact_tokens_for_tokens(
        token_in: AztecAddress,
        token_out: AztecAddress,
        amount_in: Field,
        amount_out_min: Field,
        token_out_hiding_point_slot: Field,
    ) {
        // TODO(#8271): Type the args as U128 and nuke these ugly casts
        let amount_in = U128::from_integer(amount_in);
        let amount_out_min = U128::from_integer(amount_out_min);

        let token_in_contract = Token::at(token_in);
        let token_out_contract = Token::at(token_out);

        // We get the balances. The `amount_in` was already transferred to this contract so we need to subtract it.
        let balance_in_plus_amount_in = U128::from_integer(token_in_contract
            .balance_of_public(context.this_address())
            .view(&mut context));
        let balance_in = balance_in_plus_amount_in - amount_in;
        let balance_out = U128::from_integer(token_out_contract
            .balance_of_public(context.this_address())
            .view(&mut context));

        // Calculate the amount of output token we will get.
        let amount_out = get_amount_out(amount_in, balance_in, balance_out);
        assert(amount_out >= amount_out_min, "INSUFFICIENT_OUTPUT_AMOUNT");

        // Transfer the output token to the user.
        token_out_contract
            .finalize_transfer_to_private(amount_out.to_integer(), token_out_hiding_point_slot)
            .call(&mut context);
    }

    /// Swaps `amount_out` of `token_out` for at most `amount_in_max` of `token_in`. The `from_0_to_1` flag indicates
    /// whether we are swapping `token0` for `token1` or vice versa. `nonce` can be arbitrary non-zero value and its
    /// purpose is to isolate authwits to this specific call.
    #[private]
    fn swap_tokens_for_exact_tokens(
        token_in: AztecAddress,
        token_out: AztecAddress,
        amount_out: Field,
        amount_in_max: Field,
        nonce: Field,
    ) {
        // TODO(#8271): Type the args as U128 and nuke these ugly casts
        let amount_out = U128::from_integer(amount_out);

        let config = storage.config.read_private();

        // We check the tokens are valid
        assert(token_in != token_out);
        assert((token_in == config.token0) | (token_in == config.token1));
        assert((token_out == config.token0) | (token_out == config.token1));

        let token_in_contract = Token::at(token_in);
        let token_out_contract = Token::at(token_out);

        // We transfer the `amount_in_max` to this contract and we prepare partial notes for refund and for the output
        // token.
        token_in_contract
            .transfer_to_public(context.msg_sender(), context.this_address(), amount_in_max, nonce)
            .call(&mut context);
        let refund_token_in_hiding_point_slot = token_in_contract
            .prepare_private_balance_increase(context.msg_sender())
            .call(&mut context);
        let token_out_hiding_point_slot = token_out_contract
            .prepare_private_balance_increase(context.msg_sender())
            .call(&mut context);

        AMM::at(context.this_address())
            ._swap_tokens_for_exact_tokens(
                token_in,
                token_out,
                amount_in_max,
                amount_out.to_integer(),
                refund_token_in_hiding_point_slot,
                token_out_hiding_point_slot,
            )
            .enqueue(&mut context);
    }

    #[public]
    #[internal]
    fn _swap_tokens_for_exact_tokens(
        token_in: AztecAddress,
        token_out: AztecAddress,
        amount_in_max: Field,
        amount_out: Field,
        refund_token_in_hiding_point_slot: Field,
        token_out_hiding_point_slot: Field,
    ) {
        // TODO(#8271): Type the args as U128 and nuke these ugly casts
        let amount_out = U128::from_integer(amount_out);
        let amount_in_max = U128::from_integer(amount_in_max);

        let token_in_contract = Token::at(token_in);
        let token_out_contract = Token::at(token_out);

        // We get the balances. The `amount_in_max` was already transferred to this contract so we need to subtract it.
        let balance_in_plus_amount_in_max = U128::from_integer(token_in_contract
            .balance_of_public(context.this_address())
            .view(&mut context));
        let balance_in = balance_in_plus_amount_in_max - amount_in_max;
        let balance_out = U128::from_integer(token_out_contract
            .balance_of_public(context.this_address())
            .view(&mut context));

        // Calculate the amount of input token needed to get the desired amount of output token.
        let amount_in = get_amount_in(amount_out, balance_in, balance_out);
        assert(amount_in <= amount_in_max, "EXCESSIVE_INPUT_AMOUNT");

        // If less than amount_in_max of input token was needed we refund the difference.
        let refund_amount = amount_in_max - amount_in;
        if (refund_amount > U128::zero()) {
            token_in_contract
                .finalize_transfer_to_private(
                    refund_amount.to_integer(),
                    refund_token_in_hiding_point_slot,
                )
                .call(&mut context);
        }

        // Transfer the output token to the user.
        token_out_contract
            .finalize_transfer_to_private(amount_out.to_integer(), token_out_hiding_point_slot)
            .call(&mut context);
    }
}
