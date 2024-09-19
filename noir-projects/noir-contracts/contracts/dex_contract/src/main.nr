use dep::aztec::macros::aztec;

// Uniswap v2 style AMM DEX contract
#[aztec]
contract DEX {
    use dep::compressed_string::FieldCompressedString;
    use dep::aztec::{
        prelude::{NoteGetterOptions, NoteViewerOptions, Map, PublicMutable, SharedImmutable, PrivateSet, AztecAddress},
        encrypted_logs::{encrypted_note_emission::encode_and_encrypt_note_with_keys},
        hash::pedersen_hash, keys::getters::get_public_keys, note::constants::MAX_NOTES_PER_PAGE,
        protocol_types::traits::is_empty, utils::comparison::Comparator,
        protocol_types::{point::Point, traits::Serialize},
        macros::{storage::storage, events::event, functions::{private, public, view, internal, initializer}}
    };
    use dep::authwit::auth::{assert_current_call_valid_authwit, assert_current_call_valid_authwit_public, compute_authwit_nullifier};
    use std::{embedded_curve_ops::EmbeddedCurvePoint, meta::derive};
    use crate::types::nft_note::NFTNote;

    #[event]
    #[derive(Serialize)]
    struct Swap {
        amount0In: u32,
        amount1In: u32,
        amount0Out: u32,
        amount1Out: u32,
    }

    #[storage]
    struct Storage<Context> {

    }

    #[public]
    #[initializer]
    fn constructor(admin: AztecAddress, name: str<31>, symbol: str<31>) {

    }

    #[public]
    fn add_liquidity(from: AztecAddress, amountADesired: Field, amountBDesired: Field, amountAMin: Field, amountBMin: Field, nonce: Field) {
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit_public(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        // transfer the amounts from the sender to the contract and mint the liquidity token to `from`
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
