use types::{
    constants::{DOM_SEP__TX_EFFECT_FIELD_HASH, DOM_SEP__TX_EFFECT_HASH, DOM_SEP__TX_EFFECT_LEAF},
    hash::poseidon2_hash_with_separator,
};

/// Hashes one field's slice of the blob encoding, as `compute_tx_effect_leaf` does.
pub fn tx_effect_field_hash<let N: u32>(blob_fields: [Field; N]) -> Field {
    poseidon2_hash_with_separator(blob_fields, DOM_SEP__TX_EFFECT_FIELD_HASH)
}

/// The expected tx effects tree leaf of a tx, computed independently of the code under test. `field_hashes` are the
/// sub-hashes of the note hashes, nullifiers, l2-to-l1 messages, public data writes, private logs, public logs and
/// contract class logs, in that order.
pub fn expected_tx_effect_leaf(
    tx_hash: Field,
    tx_start_marker: Field,
    transaction_fee: Field,
    field_hashes: [Field; 7],
) -> Field {
    let tx_effect_hash = poseidon2_hash_with_separator(
        [tx_start_marker, transaction_fee].concat(field_hashes),
        DOM_SEP__TX_EFFECT_HASH,
    );
    poseidon2_hash_with_separator([tx_hash, tx_effect_hash], DOM_SEP__TX_EFFECT_LEAF)
}
