mod lib;

use dep::aztec::macros::aztec;

// A Noir implementation of simplified Uniswap v2 pool.
#[aztec]
contract DEX {
    use crate::lib::get_quote;

    use dep::aztec::{
        prelude::{NoteGetterOptions, NoteViewerOptions, Map, PublicMutable, PublicImmutable, PrivateSet, AztecAddress},
        encrypted_logs::{encrypted_note_emission::encode_and_encrypt_note_with_keys},
        hash::pedersen_hash, keys::getters::get_public_keys, note::constants::MAX_NOTES_PER_PAGE,
        protocol_types::traits::is_empty, utils::comparison::Comparator
    };
    use dep::authwit::auth::{assert_current_call_valid_authwit, assert_current_call_valid_authwit_public, compute_authwit_nullifier};
    use dep::token::Token;

    // We store the tokens of the pool in a struct such that to load it from PublicImmutable asserts only a single
    // merkle proof.
    // (Once we actually do the optimization. WIP in https://github.com/AztecProtocol/aztec-packages/pull/8022).
    #[derive(Serialize)]
    struct Tokens {
        token0: AztecAddress,
        token1: AztecAddress,
        liquidity_token: AztecAddress,
    }

    #[derive(Serialize)]
    struct Reserves {
        // TODO: Replace the use of u32 with larger type everywhere in this contract.
        // Didn't use U128 here because of https://github.com/AztecProtocol/aztec-packages/issues/8271 and because it might be insufficient.
        reserve0: u32,
        reserve1: u32,
    }

    #[storage]
    struct Storage<Context> {
        tokens: PublicImmutable<Tokens, Context>,
        reserves: PublicMutable<Reserves, Context>,
    }

    global MINIMUM_LIQUIDITY: u32 = 1000;

    #[public]
    #[initializer]
    fn constructor(token0: AztecAddress, token1: AztecAddress) {
        // Since we don't have inheritance it seems the easiest to deploy the standard token and use it as a liquidity
        // tracking contract. This contract would be an admin of the liquidity contract.

        // TODO: either deploy here the liquidity contract or pass its address as an arg on input and verify that
        // it was deployed correctly.
        let liquidity_token = AztecAddress::zero();

        let tokens = Tokens { token0, token1, liquidity_token };
        storage.tokens.initialize(tokens);

        // We don't need to initialize the reserves as the default in storage is 0.
    }

    // Adds liquidity for `liquidity_provider` to the pool. `amount0Desired` and `amount1Desired` are the amounts
    // of tokens we ideally want to add. `amount0Min` and `amount1Min` are the minimum amounts we are willing to add.
    #[public]
    fn add_liquidity(liquidity_provider: AztecAddress, amount0Desired: u32, amount1Desired: u32, amount0Min: u32, amount1Min: u32, nonce: Field) {
        if (!liquidity_provider.eq(context.msg_sender())) {
            assert_current_call_valid_authwit_public(&mut context, liquidity_provider);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        assert(amount0Desired > 0 & amount1Desired > 0, "INSUFFICIENT_INPUT_AMOUNTS");

        let reserves = storage.reserves.read();
        let tokens = storage.tokens.read();

        // Calculate the amounts to be added to the pool
        let reserve0 = reserves.reserve0;
        let reserve1 = reserves.reserve1;

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

        // TODO: Transfer the tokens to this contract. How do we do it? this does not work with authwits as we don't know the amounts before calling this function.
        // We could use partial notes for this:
        // 1. A user knows the maximum amount0, amount1 (the desired amounts are max) they want to deposit,
        // 2. user calls private `token{0, 1}.prepare_transfer_to_public_with_refund(from, to, amount{0,1}, transient_storage_slot_randomness)` functions,
        //    --> these functions will burn the amounts, prepare the partial notes and stores both the burned amounts and the partial notes in the transient storage!
        // 3. user calls DEX.add_liquidity(..., transient_storage_slot_randomness) with the amounts they want to deposit,
        // 4. the `add_liquidity` func computes the amounts to deposit and calls token{0, 1}.finalize_transfer_to_public_with_refund(actual_amount{0,1}, transient_storage_slot_randomness),
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

        // Calculate the amount of liquidity tokens to mint
        let liquidity_token = Token::at(tokens.liquidity_token);
        let total_supply = liquidity_token.total_supply().view(&mut context) as u32; // TODO: Nuke the cast here.
        let mut liquidity: u32 = 0;
        if (total_supply == 0) {
            // TODO: This is using Tonelli-Shanks to compute sqrt but Uni is using babylonian method. Is it fine to use a different one?
            // TODO: avoid the casts here. Shall we use a method natively working with some integer type?
            liquidity = std::ec::sqrt((amount0 * amount1 - MINIMUM_LIQUIDITY) as Field) as u32;
            liquidity_token.mint_public(AztecAddress::zero(), MINIMUM_LIQUIDITY as Field).call(&mut context); // permanently lock the first MINIMUM_LIQUIDITY tokens
        } else {
            liquidity = std::cmp::min(amount0 * total_supply / reserve0, amount1 * total_supply / reserve1);
        }
        assert(liquidity > 0, "INSUFFICIENT_LIQUIDITY_MINTED");
        // TODO: Should we mint here to private? It would be more costly.
        liquidity_token.mint_public(liquidity_provider, liquidity as Field).call(&mut context);

        // Update the reserves
        let updated_reserves = Reserves { reserve0: reserve0 + amount0, reserve1: reserve1 + amount1 };
        storage.reserves.write(updated_reserves);
    }

    #[public]
    fn remove_liquidity(liquidity_provider: AztecAddress, liquidity: u32, amount0Min: u32, amount1Min: u32, nonce: Field) {
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit_public(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        let tokens = storage.tokens.read();

        let token0 = Token::at(tokens.token0);
        let token1 = Token::at(tokens.token1);
        let liquidity_token = Token::at(tokens.liquidity_token);

        // We transfer the liquidity tokens from the liquidity provider to this contract.
        // TODO: I am transferring the liquidity tokens in public here to follow the Uniswap v2 implementation.
        // --> There are 2 things we need to discuss here:
        //     1. This is assuming the dev has the liquidity token in public. I think this is fine as we mint to public
        //        and I am not really sure if it makes sense to not have liquidity tokens in public as these tokens are
        //        commonly used in other DeFi (e.g. borrowing against the liquidity token in AAVE) and for that we'll
        //        most likely need them to be public.
        //     2. The "transfer from" flows are less efficient as they check authwits. It might be the most efficient
        //        to just make users transfer the liquidity token to the pool in a `BatchCall`.
        liquidity_token.transfer_public(liquidity_provider, context.this_address(), liquidity, nonce).call(&mut context);

        // Calculate the amounts to be added to the pool
        let mut balance0 = token0.balance_of_public(context.this_address()).view(&mut context);
        let mut balance1 = token1.balance_of_public(context.this_address()).view(&mut context);

        // Uniswap burns balance of the pool instead of just burning based on the `liquidity` arg on input. I assume
        // they do this to release stranded liquidity (e.g. somebody transferring liquidity tokens directly to the pool
        // by accident). This might not make sense here as the liqudity token is a separate contract and hence we need
        // to do a costly public call to get the balance.
        // TODO: Shall we streamline this and just burn based on the `liquidity` arg? Maybe we could even avoid
        //       the transfer and just allow the pool to directly call
        //       `liquidity_token.burn_public(liquidity_provider, liquidity)`.
        let liquidity = liquidity_token.balance_of_public(context.this_address()).view(&mut context);
        let total_supply = liquidity_token.total_supply().view(&mut context);

        let amount0 = liquidity * balance0 / total_supply;
        let amount1 = liquidity * balance1 / total_supply;
        // TODO: Nuke these castings. Ideally make Token return integer and not Field.
        assert(amount0 as u32 >= amount0Min, "INSUFFICIENT_0_AMOUNT");
        assert(amount1 as u32 >= amount1Min, "INSUFFICIENT_1_AMOUNT");

        liquidity_token.burn_public(context.this_address(), liquidity, nonce).call(&mut context);
        // Note: Here we could also transfer to private if we prepared the partial notes. This might make sense to do
        // if the expectation is that users will mostly want to have private balances.
        token0.transfer_public(context.this_address(), liquidity_provider, amount0, nonce).call(&mut context);
        token1.transfer_public(context.this_address(), liquidity_provider, amount1, nonce).call(&mut context);

        // We load the balances again directly from the token because Uni v2 does it like this. I assume it's solely
        // to protect against reentrancy attacks from the token contracts (since we called transfer_public above).
        // This might be to costly as these require a static public call. TODO: Consider lock designs.
        balance0 = token0.balance_of_public(context.this_address()).view(&mut context);
        balance1 = token1.balance_of_public(context.this_address()).view(&mut context);

        // TODO: Nuke these castings. Ideally make Token return integer and not Field.
        let updated_reserves = Reserves { reserve0: balance0 as u32, reserve1: balance1 as u32};
        storage.reserves.write(updated_reserves);
    }

    /**
     * Cancel a private authentication witness.
     * @param inner_hash The inner hash of the authwit to cancel.
     */
    #[private]
    fn cancel_authwit(inner_hash: Field) {
        let on_behalf_of = context.msg_sender();
        let nullifier = compute_authwit_nullifier(on_behalf_of, inner_hash);
        context.push_nullifier(nullifier);
    }
}
