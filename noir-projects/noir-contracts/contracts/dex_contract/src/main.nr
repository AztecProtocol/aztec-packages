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

    #[event]
    #[derive(Serialize)]
    struct Swap {
        amount0In: u32,
        amount1In: u32,
        amount0Out: u32,
        amount1Out: u32,
    }

    // We store the settings of the pool in a struct such that to load it from PublicImmutable asserts only
    // a single merkle proof.
    // (Once we actually do the optimization. WIP in https://github.com/AztecProtocol/aztec-packages/pull/8022).
    #[derive(Serialize)]
    struct Settings {
        token0: AztecAddress,
        token1: AztecAddress,
    }

    #[derive(Serialize)]
    struct Reserves {
        reserve0: u32,
        reserve1: u32,
    }

    #[storage]
    struct Storage<Context> {
        settings: PublicImmutable<Settings, Context>,
        reserves: PublicMutable<Reserves, Context>,
    }

    #[public]
    #[initializer]
    fn constructor(token0: AztecAddress, token1: AztecAddress) {
        // Since we don't have inheritance it seems the easiest to deploy the standard token and use it as a liquidity
        // tracking contract. This contract would be an admin of the liquidity contract.

        // TODO: either deploy here the liquidity contract or pass its address as an arg on input and verify that
        // it was deployed correctly.

        let settings = Settings { token0, token1 };
        storage.settings.initialize(settings);

        // We don't need to initialize the reserves as the default in storage is 0.
    }

    #[public]
    fn add_liquidity(from: AztecAddress, amount0Desired: u32, amount1Desired: u32, amount0Min: u32, amount1Min: u32, nonce: Field) {
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit_public(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        assert(amount0Desired > 0 & amount1Desired > 0, "INSUFFICIENT_INPUT_AMOUNTS");

        let reserves = storage.reserves.read();

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

        // TODO: how do we transfer the tokens to the contract? this does not work with authwits well

        // let settings = storage.settings.read();
        // Token::at(storage.token.read()).mint_public(to, amount).call(&mut context);

        // transfer the amounts from the sender to the contract and mint the liquidity token to `from`
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
