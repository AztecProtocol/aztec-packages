mod lib;
mod state;

use dep::aztec::macros::aztec;

/// ## Overview
/// This contract demonstrates how to implement an **Automated Market Maker (AMM)** that maintains **public state**
/// while still achieving **identity privacy**. However, it does **not provide function privacy**:
/// - Anyone can observe **what actions** were performed.
/// - All amounts involved are visible, but **who** performed the action remains private.
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
    use crate::{lib::{get_amount_in, get_amount_out, get_amounts_to_add}, state::State};
    use dep::aztec::{
        macros::{
            events::event,
            functions::{initializer, internal, private, public, view},
            storage::storage,
        },
        prelude::{AztecAddress, SharedImmutable},
    };
    use dep::token::Token;

    #[storage]
    struct Storage<Context> {
        // The following is only needed in private but we use ShareImmutable here instead of PrivateImmutable because
        // the value can be publicly known and SharedImmutable provides us with a better devex here because we don't
        // have to bother with sharing the note between pixies of users.
        state: SharedImmutable<State, Context>,
    }

    /// Amount of liquidity which gets locked in the pool when liquidity is provided for the first time. It's purpose
    /// is to prevent the pool from ever emptying which could lead to undefined behavior.
    global MINIMUM_LIQUIDITY = U128::from_integer(1000);

    // Note: Since we don't have inheritance it seems the easiest to deploy the standard token and use it as
    // a liquidity tracking contract. This contract would be an admin of the liquidity contract.
    // TODO(#9480): Either deploy the liquidity contract in the constructor or verify it that it corresponds to what
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
        amount0_desired: Field,
        amount1_desired: Field,
        amount0_min: Field,
        amount1_min: Field,
        nonce: Field,
    ) {
        // TODO(#8271): Type the args as U128 and nuke these ugly casts
        let amount0_desired = U128::from_integer(amount0_desired);
        let amount1_desired = U128::from_integer(amount1_desired);
        let amount0_min = U128::from_integer(amount0_min);
        let amount1_min = U128::from_integer(amount1_min);

        assert(
            amount0_desired > U128::zero() & amount1_desired > U128::zero(),
            "INSUFFICIENT_INPUT_AMOUNTS",
        );

        let state = storage.state.read_private();

        let token0 = Token::at(state.token0);
        let token1 = Token::at(state.token1);
        let liquidity_token = Token::at(state.liquidity_token);

        // We transfer the desired amounts of tokens to this contract.
        token0
            .transfer_to_public(
                context.msg_sender(),
                context.this_address(),
                amount0_desired.to_integer(),
                nonce,
            )
            .call(&mut context);
        token1
            .transfer_to_public(
                context.msg_sender(),
                context.this_address(),
                amount1_desired.to_integer(),
                nonce,
            )
            .call(&mut context);

        // We may need to return some token amounts depending on public state (i.e. if the desired amounts do
        // not have the same ratio as the live reserves), so we prepare partial notes for the refunds.
        let refund_token0_hiding_point_slot =
            token0.prepare_transfer_to_private(context.msg_sender()).call(&mut context);
        let refund_token1_hiding_point_slot =
            token1.prepare_transfer_to_private(context.msg_sender()).call(&mut context);
        // We prepare a partial note for the liquidity tokens.
        let liquidity_hiding_point_slot =
            liquidity_token.prepare_transfer_to_private(context.msg_sender()).call(&mut context);

        AMM::at(context.this_address())
            ._add_liquidity(
                state,
                refund_token0_hiding_point_slot,
                refund_token1_hiding_point_slot,
                liquidity_hiding_point_slot,
                amount0_desired.to_integer(),
                amount1_desired.to_integer(),
                amount0_min.to_integer(),
                amount1_min.to_integer(),
            )
            .enqueue(&mut context);
    }

    #[public]
    #[internal]
    fn _add_liquidity(
        // We pass the state as an argument in order to not have to read it from public storage again.
        state: State,
        refund_token0_hiding_point_slot: Field,
        refund_token1_hiding_point_slot: Field,
        liquidity_hiding_point_slot: Field,
        amount0_desired: Field,
        amount1_desired: Field,
        amount0_min: Field,
        amount1_min: Field,
    ) {
        // TODO(#8271): Type the args as U128 and nuke these ugly casts
        let amount0_desired = U128::from_integer(amount0_desired);
        let amount1_desired = U128::from_integer(amount1_desired);
        let amount0_min = U128::from_integer(amount0_min);
        let amount1_min = U128::from_integer(amount1_min);

        let token0 = Token::at(state.token0);
        let token1 = Token::at(state.token1);
        let liquidity_token = Token::at(state.liquidity_token);

        let reserve0_with_amount0_desired = U128::from_integer(token0
            .balance_of_public(context.this_address())
            .view(&mut context));
        let reserve1_with_amount1_desired = U128::from_integer(token1
            .balance_of_public(context.this_address())
            .view(&mut context));

        let reserve0 = reserve0_with_amount0_desired - amount0_desired;
        let reserve1 = reserve1_with_amount1_desired - amount1_desired;

        // Calculate the amounts to be added to the pool
        let (amount0, amount1) = get_amounts_to_add(
            amount0_desired,
            amount1_desired,
            amount0_min,
            amount1_min,
            reserve0,
            reserve1,
        );

        let refund_amount_token0 = amount0_desired - amount0;
        let refund_amount_token1 = amount1_desired - amount1;

        // The refund does not need to be finalized if the refund amount is 0 --> the partial note will simply stay in
        // public storage, which is fine.
        if (refund_amount_token0 > U128::zero()) {
            token0
                .finalize_transfer_to_private(
                    refund_token0_hiding_point_slot,
                    refund_amount_token0.to_integer(),
                )
                .call(&mut context);
        }
        if (refund_amount_token1 > U128::zero()) {
            token1
                .finalize_transfer_to_private(
                    refund_token1_hiding_point_slot,
                    refund_amount_token1.to_integer(),
                )
                .call(&mut context);
        }

        // Calculate the amount of liquidity tokens to mint
        let total_supply = U128::from_integer(liquidity_token.total_supply().view(&mut context));
        let mut liquidity = U128::zero();
        if (total_supply == U128::zero()) {
            // Since we don't collect a protocol fee (unlike Uniswap V2) we can set initial liquidity to an arbitrary
            // value instead of sqrt(amount0 * amount1). We set it to 9 times the minimum liquidity. That way
            // the initial depositor gets 90% of the value of his deposit.
            liquidity = MINIMUM_LIQUIDITY * U128::from_integer(9);
            liquidity_token.mint_public(AztecAddress::zero(), MINIMUM_LIQUIDITY.to_integer()).call(
                &mut context,
            ); // permanently lock the first MINIMUM_LIQUIDITY tokens
        } else {
            liquidity = std::cmp::min(
                amount0 * total_supply / reserve0,
                amount1 * total_supply / reserve1,
            );
        }
        assert(liquidity > U128::zero(), "INSUFFICIENT_LIQUIDITY_MINTED");
        liquidity_token
            .finalize_mint_to_private(liquidity.to_integer(), liquidity_hiding_point_slot)
            .call(&mut context);
    }

    /// Removes `liquidity` from the pool and transfers the tokens back to the user. `amount0_min` and `amount1_min` are
    /// the minimum amounts of `token0` and `token1` the user is willing to accept. `nonce` can be arbitrary non-zero
    /// value and its purpose is to isolate authwits to this specific call.
    /// TODO(#8271): Type the args as U128
    #[private]
    fn remove_liquidity(liquidity: Field, amount0_min: Field, amount1_min: Field, nonce: Field) {
        let state = storage.state.read_private();

        let liquidity_token = Token::at(state.liquidity_token);
        let token0 = Token::at(state.token0);
        let token1 = Token::at(state.token1);

        // We transfer the liquidity tokens to this contract and prepare partial notes for the output tokens. We are
        // forced to first transfer into the AMM because it is not possible to burn in private - the enqueued public
        // call would reveal who the owner was. The only way to preserve their identity is to first privately transfer.
        liquidity_token
            .transfer_to_public(context.msg_sender(), context.this_address(), liquidity, nonce)
            .call(&mut context);
        let token0_hiding_point_slot =
            token0.prepare_transfer_to_private(context.msg_sender()).call(&mut context);
        let token1_hiding_point_slot =
            token1.prepare_transfer_to_private(context.msg_sender()).call(&mut context);

        AMM::at(context.this_address())
            ._remove_liquidity(
                state,
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
        state: State,
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

        let token0 = Token::at(state.token0);
        let token1 = Token::at(state.token1);
        let liquidity_token = Token::at(state.liquidity_token);

        // We get the reserves and the liquidity token total supply.
        let reserve0 = U128::from_integer(token0.balance_of_public(context.this_address()).view(
            &mut context,
        ));
        let reserve1 = U128::from_integer(token1.balance_of_public(context.this_address()).view(
            &mut context,
        ));
        let total_supply = U128::from_integer(liquidity_token.total_supply().view(&mut context));

        // We calculate the amounts of token0 and token1 the user is entitled to based on the amount of liquidity they
        // are removing.
        let amount0 = liquidity * reserve0 / total_supply;
        let amount1 = liquidity * reserve1 / total_supply;

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
        let state = storage.state.read_private();

        // We check the tokens are valid
        assert(token_in != token_out);
        assert((token_in == state.token0) | (token_in == state.token1));
        assert((token_out == state.token0) | (token_out == state.token1));

        let token_in_contract = Token::at(token_in);
        let token_out_contract = Token::at(token_out);

        // We transfer the `amount_in` to this contract and we prepare partial note for the output token.
        token_in_contract
            .transfer_to_public(context.msg_sender(), context.this_address(), amount_in, nonce)
            .call(&mut context);
        let token_out_hiding_point_slot =
            token_out_contract.prepare_transfer_to_private(context.msg_sender()).call(&mut context);

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

        // We get the reserves. The `amount_in` was already transferred to this contract so we need to subtract it.
        let reserve_in_with_amount_in = U128::from_integer(token_in_contract
            .balance_of_public(context.this_address())
            .view(&mut context));
        let reserve_in = reserve_in_with_amount_in - amount_in;
        let reserve_out = U128::from_integer(token_out_contract
            .balance_of_public(context.this_address())
            .view(&mut context));

        // Calculate the amount of output token we will get.
        let amount_out = get_amount_out(amount_in, reserve_in, reserve_out);
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

        let state = storage.state.read_private();

        // We check the tokens are valid
        assert(token_in != token_out);
        assert((token_in == state.token0) | (token_in == state.token1));
        assert((token_out == state.token0) | (token_out == state.token1));

        let token_in_contract = Token::at(token_in);
        let token_out_contract = Token::at(token_out);

        // We transfer the `amount_in_max` to this contract and we prepare partial notes for refund and for the output
        // token.
        token_in_contract
            .transfer_to_public(context.msg_sender(), context.this_address(), amount_in_max, nonce)
            .call(&mut context);
        let refund_token_in_hiding_point_slot =
            token_in_contract.prepare_transfer_to_private(context.msg_sender()).call(&mut context);
        let token_out_hiding_point_slot =
            token_out_contract.prepare_transfer_to_private(context.msg_sender()).call(&mut context);

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

        // We get the reserves. The `amount_in_max` was already transferred to this contract so we need to subtract it.
        let reserve_in_with_amount_in_max = U128::from_integer(token_in_contract
            .balance_of_public(context.this_address())
            .view(&mut context));
        let reserve_in = reserve_in_with_amount_in_max - amount_in_max;
        let reserve_out = U128::from_integer(token_out_contract
            .balance_of_public(context.this_address())
            .view(&mut context));

        // Calculate the amount of input token needed to get the desired amount of output token.
        let amount_in = get_amount_in(amount_out, reserve_in, reserve_out);
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
