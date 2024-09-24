mod lib;

use dep::aztec::macros::aztec;

// A Noir implementation of simplified Uniswap v2 pool.
#[aztec]
contract DEX {
    use crate::lib::{get_quote, get_amount_out};
    use dep::aztec::prelude::{AztecAddress, PublicImmutable, PublicContext};
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
        reserve0: u64,
        reserve1: u64,
    }

    #[storage]
    struct Storage<Context> {
        state: PublicImmutable<State, Context>,
    }

    global MINIMUM_LIQUIDITY: u64 = 1000;
    global LOCK_STORAGE_SLOT = 980908; // Arbitrarily chosen lock storage slot.

    #[public]
    #[initializer]
    fn constructor(token0: AztecAddress, token1: AztecAddress) {
        // Since we don't have inheritance it seems the easiest to deploy the standard token and use it as a liquidity
        // tracking contract. This contract would be an admin of the liquidity contract.

        // TODO: either deploy here the liquidity contract or pass its address as an arg on input and verify that
        // it was deployed correctly.
        let liquidity_token = AztecAddress::zero();

        let state = State { token0, token1, liquidity_token, reserve0: 0, reserve1: 0 };
        storage.state.initialize(state);
    }

    // Privately adds liquidity for `liquidity_provider` to the pool (identity of liquidity provider not revealed).
    // `amount0Desired` and `amount1Desired` are the amounts of tokens we ideally want to add. `amount0Min`
    // and `amount1Min` are the minimum amounts we are willing to add. `transfer_preparer_storage_slot_commitment`
    // is a storage slot commitment used for all 3 partial notes finalized in this tx (token0 refund note, token1
    // refund note, liquidity token partial note).
    // (Note: It's fine to use 1 commitment for all 3 partial notes as it's used for transient storage in different
    // contracts). It's necessary to prepare the 3 partial notes in a `BatchCall` before calling this function.
    // Note: We needed to make the identity of liquidity provider private because we don't have a transfer_from flow
    // where the token amount is not known in advance and we don't need to know the amounts for partial notes.
    #[public]
    fn add_liquidity(amount0Desired: u64, amount1Desired: u64, amount0Min: u64, amount1Min: u64, transfer_preparer_storage_slot_commitment: Field) {
        // TODO: It would be quite nice to have a reentrancy-guard macro as this will be quite common.
        _lock(&mut context);

        // Note: We don't use authwit here as the permission from a user is given by the fact that he prepared
        // the partial notes.

        assert(amount0Desired > 0 & amount1Desired > 0, "INSUFFICIENT_INPUT_AMOUNTS");

        let state = storage.state.read();

        let token0 = Token::at(state.token0);
        let token1 = Token::at(state.token1);
        let reserve0 = state.reserve0;
        let reserve1 = state.reserve1;

        let liquidity_token = Token::at(state.liquidity_token);

        // Calculate the amounts to be added to the pool
        let mut amount0 = amount0Desired;
        let mut amount1 = amount1Desired;
        if ((reserve0 != 0) | (reserve1 != 0)) {
            // First calculate the optimal amount of token1 based on the desired amount of token0.
            let amount1Optimal = get_quote(amount0Desired, reserve0, reserve1);
            if (amount1Optimal <= amount1Desired) {
                // Revert if the optimal amount of token1 is less than the desired amount of token1.
                assert(amount1Optimal >= amount1Min, "INSUFFICIENT_1_AMOUNT");
                amount0 = amount0Desired;
                amount1 = amount1Optimal;
            } else {
                // We got more amount of token1 than desired so we try repeating the process but this time by quoting
                // based on token1.
                let amount0Optimal = get_quote(amount1Desired, reserve1, reserve0);
                assert(amount0Optimal <= amount0Desired);
                assert(amount0Optimal >= amount0Min, "INSUFFICIENT_0_AMOUNT");
                amount0 = amount0Optimal;
                amount1 = amount1Desired;
            }
        }

        // Now we transfer the tokens to this contract. This is how we'll do this:
        // 1. A user knows the maximum amount0, amount1 (the desired amounts are max) they want to deposit,
        // 2. user calls private `token{0, 1}.prepare_transfer_to_public_with_refund(from, to, amount{0,1}, transient_storage_slot_randomness)` functions,
        //    --> these functions will burn the amounts, prepare the partial notes and stores both the burned amounts and the partial notes in the transient storage!
        // 3. user calls DEX.add_liquidity(..., transient_storage_slot_randomness) with the amounts they want to deposit,
        // 4. the `add_liquidity` func computes the amounts to deposit and calls token{0, 1}.finalize_transfer_to_public_with_refund(actual_amount{0,1}, transfer_preparer_storage_slot_commitment),
        //   --> this function will:
        //          4.1 load both the partial note and the burned amount from transient storage
        //          4.2 check that actual_amount < burned_amount,
        //          4.3 publicly mint the actual_amount to msg_sender (the DEX in our case),
        //          4.4 finalize the partial note amount with `burned_amount - actual_amount` and emit the note.
        //
        // Note 1: This is essentially a 1 person alternative to the fee refund flow where we have a user and an FPC.
        // Cost of this flow:
        //      num calls: 2 private calls to setup the partial notes, 1 public call to add_liquidity, 2 public calls to finalize_transfer_to_public_with_refund
        //      DA: up to 2 change notes when burning amount{0,1}, nullifiers to burn users notes, up to 2 refund notes, 1 public data write to mint pub balance to pool
        // TODO: Implement `prepare_transfer_to_public_with_refund` and `finalize_transfer_to_public_with_refund` in the Token contract.
        token0.finalize_transfer_to_public_with_refund(transfer_preparer_storage_slot_commitment, amount0).call(&mut context);
        token1.finalize_transfer_to_public_with_refund(transfer_preparer_storage_slot_commitment, amount1).call(&mut context);

        // Calculate the amount of liquidity tokens to mint
        let total_supply = liquidity_token.total_supply().view(&mut context) as u64; // TODO: Nuke the cast here.
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
        // TODO: Implement `prepare_mint_to_private` and `finalize_mint_to_private` in the Token contract.
        liquidity_token.finalize_mint_to_private(transfer_preparer_storage_slot_commitment, liquidity).call(&mut context);

        // Update the reserves
        // (Note that we should not pay for token0, token1 and liquidity_token writes because kernel should squash them
        // (once the optimization is done)).
        let updated_state = State { token0: state.token0, token1: state.token1, liquidity_token: state.liquidity_token, reserve0: reserve0 + amount0, reserve1: reserve1 + amount1 };
        storage.state.write(updated_state);

        // TODO: It would be quite nice to have a reentrancy-guard macro as this will be quite common.
        _unlock(&mut context);
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
    fn remove_liquidity(amount0Min: u64, amount1Min: u64, transfer_preparer_storage_slot_commitment: Field) {
        // TODO: It would be quite nice to have a reentrancy-guard macro as this will be quite common.
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
        assert(amount0 as u64 >= amount0Min, "INSUFFICIENT_0_AMOUNT");
        assert(amount1 as u64 >= amount1Min, "INSUFFICIENT_1_AMOUNT");

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
        let updated_state = State { token0: state.token0, token1: state.token1, liquidity_token: state.liquidity_token, reserve0: reserve0 + amount0, reserve1: reserve1 + amount1 };
        storage.state.write(updated_state);

        // TODO: It would be quite nice to have a reentrancy-guard macro as this will be quite common.
        _unlock(&mut context);
    }

    #[public]
    fn swap_exact_tokens_for_tokens(
        amount_in: u64,
        amount_out_min: u64,
        from_0_to_1: bool,
    ) {
        let state = storage.state.read();

        let token0 = Token::at(state.token0);
        let token1 = Token::at(state.token1);

        let reserve0 = token0.balance_of_public(context.this_address()).view(&mut context) as u64; // TODO: Nuke the cast here.
        let reserve1 = token1.balance_of_public(context.this_address()).view(&mut context) as u64; // TODO: Nuke the cast here.

        let (reserve_in, reserve_out) = if from_0_to_1 { (reserve0, reserve1) } else { (reserve1, reserve0) };

        let amount_out = get_amount_out(amount_in, reserve_in, reserve_out);
        assert(amount_out >= amount_out_min, "INSUFFICIENT_OUTPUT_AMOUNT");
        // How do we transfer to the pool here? One way is to track the reserves and make the user transfer to the pool
        // We could do public_transfer_from here but it would force user to unshield and we would have to pay
        // for public authwit.

        // TransferHelper.safeTransferFrom(path[0], msg.sender, UniswapV2Library.pairFor(factory, path[0], path[1]), amounts[0]);
        // _swap(amounts, path, to);
    }

    // After locking and unlocking there will be 1 public data write because we always commit the last change and
    // "val1 --> val2 --> val1" does not result in 0 public data writes. TODO: Either optimize this or introduce
    // transient storage.
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
