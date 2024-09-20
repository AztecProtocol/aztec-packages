mod lib;

use dep::aztec::macros::aztec;

// A minimal implementation of Uniswap v2 style AMM DEX pool.
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

    // We store the settings of the pool in a struct such that to load it from PublicImmutable asserts only
    // a single merkle proof.
    // (Once we actually do the optimization. WIP in https://github.com/AztecProtocol/aztec-packages/pull/8022).
    #[derive(Serialize)]
    struct Settings {
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
        settings: PublicImmutable<Settings, Context>,
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

        let settings = Settings { token0, token1, liquidity_token };
        storage.settings.initialize(settings);

        // We don't need to initialize the reserves as the default in storage is 0.
    }

    #[public]
    fn add_liquidity(liquidity_provider: AztecAddress, amount0Desired: u32, amount1Desired: u32, amount0Min: u32, amount1Min: u32, nonce: Field) {
        if (!liquidity_provider.eq(context.msg_sender())) {
            assert_current_call_valid_authwit_public(&mut context, liquidity_provider);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        assert(amount0Desired > 0 & amount1Desired > 0, "INSUFFICIENT_INPUT_AMOUNTS");

        let reserves = storage.reserves.read();
        let settings = storage.settings.read();

        // Calculate the amounts to be added to the pool
        let reserve0 = reserves.reserve0;
        let reserve1 = reserves.reserve1;

        let mut amount0 = amount0Desired;
        let mut amount1 = amount1Desired;
        if ((reserve0 != 0) | (reserve1 != 0)) {
            let amount1Optimal = get_quote(amount0Desired, reserve0, reserve1);
            if (amount1Optimal <= amount1Desired) {
                assert(amount1Optimal >= amount1Min, "INSUFFICIENT_1_AMOUNT");
                amount0 = amount0Desired;
                amount1 = amount1Optimal;
            } else {
                let amount0Optimal = get_quote(amount1Desired, reserve1, reserve0);
                assert(amount0Optimal <= amount0Desired);
                assert(amount0Optimal >= amount0Min, "INSUFFICIENT_0_AMOUNT");
                amount0 = amount0Optimal;
                amount1 = amount1Desired;
            }
        }

        // TODO: Transfer the tokens to this contract. How do we do it? this does not work with authwits as we don't know the amounts before calling this function.
        // We could use partial notes for this:
        // 1. A user knows the maximum amount0, amount1 they want to deposit,
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

        // Calculate the amount of liquidity tokens to mint
        let liquidity_token = Token::at(settings.liquidity_token);
        let total_supply = liquidity_token.total_supply().call(&mut context);
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
        liquidity_token.mint_public(liquidity_provider, liquidity as Field).call(&mut context);

        // Update the reserves
        let updated_reserves = Reserves { reserve0: reserve0 + amount0, reserve1: reserve1 + amount1 };
        storage.reserves.write(updated_reserves);
    }

    #[public]
    fn remove_liquidity(from: AztecAddress, liquidity: Field, amount0Min: Field, amount1Min: Field, nonce: Field) {
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit_public(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        // burn the liquidity token from `from` and transfer the amounts to `from`
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
