// A contract used to exercise the `get_tx_effect` utility oracle end-to-end. The utility hashes the full serialized
// `TxEffect` and asserts equality against a poseidon2 hash computed in TypeScript over `TxEffect.toFields()`. If any
// field's layout drifts between TS and Noir, the hash mismatches.

use aztec::macros::aztec;

#[aztec]
pub contract TxEffectOracleTest {
    use aztec::{
        macros::functions::external,
        oracle::message_processing::get_tx_effect,
        protocol::{
            constants::{
                CONTRACT_CLASS_LOG_LENGTH, FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH, MAX_CONTRACT_CLASS_LOGS_PER_TX,
                MAX_L2_TO_L1_MSGS_PER_TX, MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX, MAX_PRIVATE_LOGS_PER_TX,
                MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, PRIVATE_LOG_LENGTH, PUBLIC_DATA_WRITE_LENGTH,
            },
            poseidon2::Poseidon2Sponge,
            traits::ToField,
        },
    };

    // TODO(https://github.com/noir-lang/noir/issues/12572): Once the Noir issue is fixed replaced the following
    // insanity with the simple, commented out function below.

    // ############### AI INSANITY START ###################
    global TX_EFFECT_LEN: u32 = 3 // revert_code + tx_hash + transaction_fee
        + MAX_NOTE_HASHES_PER_TX
        + MAX_NULLIFIERS_PER_TX
        + MAX_L2_TO_L1_MSGS_PER_TX
        + MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX * PUBLIC_DATA_WRITE_LENGTH
        + MAX_PRIVATE_LOGS_PER_TX * PRIVATE_LOG_LENGTH
        + 1 // public_logs.length
        + FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH
        + MAX_CONTRACT_CLASS_LOGS_PER_TX * CONTRACT_CLASS_LOG_LENGTH;

    /// Absorbs the `TxEffect` field-by-field into a poseidon2 sponge in the same flat order produced by
    /// the TypeScript `TxEffect.toFields()`, then asserts the squeezed hash equals the one computed in TS.
    ///
    /// We drive the sponge manually instead of calling `<TxEffect as Serialize>::serialize()` because the
    /// auto-derived implementation hits an SSA validation error on `TxEffect`'s nested `Log<N>` arrays at this
    /// total length (~3000 fields). Iterating fields directly avoids that codepath while still validating
    /// that every byte of the wire format matches between Noir and TS.
    #[external("utility")]
    unconstrained fn assert_tx_effect_hash(tx_hash: Field, expected_hash: Field) {
        let e = get_tx_effect(tx_hash).unwrap();

        let two_pow_64: Field = 18446744073709551616;
        let iv: Field = (TX_EFFECT_LEN as Field) * two_pow_64;
        let mut sponge = Poseidon2Sponge { cache: [0; 3], state: [0, 0, 0, iv], cache_size: 0, squeeze_mode: false };

        sponge.absorb(e.revert_code as Field);
        sponge.absorb(e.tx_hash);
        sponge.absorb(e.transaction_fee);
        for i in 0..MAX_NOTE_HASHES_PER_TX {
            sponge.absorb(e.note_hashes[i]);
        }
        for i in 0..MAX_NULLIFIERS_PER_TX {
            sponge.absorb(e.nullifiers[i]);
        }
        for i in 0..MAX_L2_TO_L1_MSGS_PER_TX {
            sponge.absorb(e.l2_to_l1_msgs[i]);
        }
        for i in 0..MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX {
            sponge.absorb(e.public_data_writes[i].leaf_slot);
            sponge.absorb(e.public_data_writes[i].value);
        }
        for i in 0..MAX_PRIVATE_LOGS_PER_TX {
            for j in 0..(PRIVATE_LOG_LENGTH - 1) {
                sponge.absorb(e.private_logs[i].fields[j]);
            }
            sponge.absorb(e.private_logs[i].length as Field);
        }
        sponge.absorb(e.public_logs.length as Field);
        for i in 0..FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH {
            sponge.absorb(e.public_logs.payload[i]);
        }
        for i in 0..MAX_CONTRACT_CLASS_LOGS_PER_TX {
            for j in 0..(CONTRACT_CLASS_LOG_LENGTH - 2) {
                sponge.absorb(e.contract_class_logs[i].log.fields[j]);
            }
            sponge.absorb(e.contract_class_logs[i].log.length as Field);
            sponge.absorb(e.contract_class_logs[i].contract_address.to_field());
        }

        let actual_hash = sponge.squeeze();
        assert_eq(actual_hash, expected_hash, "TxEffect poseidon2 hash mismatch");
    }
    // ############### AI INSANITY END ###################

    // #[external("utility")]
    // unconstrained fn assert_tx_effect_hash(tx_hash: Field, expected_hash: Field) {
    //     let e = get_tx_effect(tx_hash).unwrap();

    //     let actual_hash = poseidon2_hash(e.serialize());

    //     assert_eq(actual_hash, expected_hash, "TxEffect poseidon2 hash mismatch");
    // }

    #[external("utility")]
    unconstrained fn assert_is_none(tx_hash: Field) {
        assert(get_tx_effect(tx_hash).is_none(), "expected get_tx_effect to return None");
    }
}
