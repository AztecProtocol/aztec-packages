mod test;

use aztec::macros::aztec;

/// A contract used to exercise the tx effect oracles end-to-end.
#[aztec]
pub contract TxEffectOracleTest {
    use aztec::{
        ephemeral::EphemeralArray,
        macros::functions::external,
        oracle::message_processing::{get_tx_effect, get_tx_effects},
        protocol::{hash::poseidon2_hash, traits::Serialize},
    };

    #[external("utility")]
    unconstrained fn get_tx_effect_hash(tx_hash: Field) -> Field {
        let e = get_tx_effect(tx_hash).unwrap();
        poseidon2_hash(e.serialize())
    }

    #[external("utility")]
    unconstrained fn get_tx_effects_hashes(tx_hashes: [Field; 2]) -> [Field; 2] {
        let ephemeral_tx_hashes: EphemeralArray<Field> = EphemeralArray::empty();
        ephemeral_tx_hashes.push(tx_hashes[0]);
        ephemeral_tx_hashes.push(tx_hashes[1]);

        let tx_effects = get_tx_effects(ephemeral_tx_hashes);
        [poseidon2_hash(tx_effects.get(0).unwrap().serialize()), poseidon2_hash(tx_effects.get(1).unwrap().serialize())]
    }

    #[external("utility")]
    unconstrained fn assert_is_none(tx_hash: Field) {
        assert(get_tx_effect(tx_hash).is_none(), "expected get_tx_effect to return None");
    }
}
