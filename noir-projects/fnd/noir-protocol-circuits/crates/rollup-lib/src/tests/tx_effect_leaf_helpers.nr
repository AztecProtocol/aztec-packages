use types::{
    constants::{
        DOM_SEP__TX_EFFECT_CATEGORIES_HASH, DOM_SEP__TX_EFFECT_CATEGORY_HASH,
        DOM_SEP__TX_EFFECTS_TREE_LEAF,
    },
    hash::poseidon2_hash_with_separator,
};

/// Hashes all fields of one effect category into a single category hash.
pub fn tx_effect_category_hash<let N: u32>(blob_fields: [Field; N]) -> Field {
    poseidon2_hash_with_separator(blob_fields, DOM_SEP__TX_EFFECT_CATEGORY_HASH)
}

/// The expected tx effects tree leaf of a tx, computed independently of the code under test. `category_hashes` commit
/// to note hashes, nullifiers, L2-to-L1 messages, public-data writes, private logs, public logs and contract-class
/// logs, in that order.
pub fn expected_tx_effects_tree_leaf(
    tx_hash: Field,
    tx_start_marker: Field,
    transaction_fee: Field,
    category_hashes: [Field; 7],
) -> Field {
    let categories_hash = poseidon2_hash_with_separator(
        [tx_start_marker, transaction_fee].concat(category_hashes),
        DOM_SEP__TX_EFFECT_CATEGORIES_HASH,
    );
    poseidon2_hash_with_separator([tx_hash, categories_hash], DOM_SEP__TX_EFFECTS_TREE_LEAF)
}
