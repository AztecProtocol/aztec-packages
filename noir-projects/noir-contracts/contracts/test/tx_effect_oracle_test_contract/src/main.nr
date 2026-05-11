// A contract used to exercise the `get_tx_effect` utility oracle end-to-end. The utility hashes the full serialized
// `TxEffect` and asserts equality against a poseidon2 hash computed in TypeScript over `TxEffect.toFields()`. If any
// field's layout drifts between TS and Noir, the hash mismatches.

use aztec::macros::aztec;

#[aztec]
pub contract TxEffectOracleTest {
    use aztec::{
        macros::functions::external,
        oracle::message_processing::get_tx_effect,
        protocol::{hash::poseidon2_hash, traits::Serialize},
    };

    #[external("utility")]
    unconstrained fn assert_tx_effect_hash(tx_hash: Field, expected_hash: Field) {
        let e = get_tx_effect(tx_hash).unwrap();

        let actual_hash = poseidon2_hash(e.serialize());

        assert_eq(actual_hash, expected_hash, "TxEffect poseidon2 hash mismatch");
    }

    #[external("utility")]
    unconstrained fn assert_is_none(tx_hash: Field) {
        assert(get_tx_effect(tx_hash).is_none(), "expected get_tx_effect to return None");
    }
}
