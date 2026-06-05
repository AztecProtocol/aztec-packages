use aztec::macros::aztec;

/// A contract used to exercise the `aztec_utl_getTxEffect` oracle end-to-end.
#[aztec]
pub contract TxEffectOracleTest {
    use aztec::{
        macros::functions::external,
        oracle::message_processing::get_tx_effect,
        protocol::{hash::poseidon2_hash, traits::Serialize},
    };

    #[external("utility")]
    unconstrained fn get_tx_effect_hash(tx_hash: Field) -> Field {
        let e = get_tx_effect(tx_hash).unwrap();
        poseidon2_hash(e.serialize())
    }

    #[external("utility")]
    unconstrained fn assert_is_none(tx_hash: Field) {
        assert(get_tx_effect(tx_hash).is_none(), "expected get_tx_effect to return None");
    }
}
