use dep::types::{
    abis::{
        block_constant_data::BlockConstantData, partial_state_reference::PartialStateReference,
        sponge_blob::SpongeBlob,
    },
    constants::TX_ROLLUP_PUBLIC_INPUTS_LENGTH,
    tests::utils::make_fixture,
    traits::{Deserialize, Empty, Serialize},
};

/// Public inputs for the tx base and tx merge rollup circuits.
#[derive(Deserialize, Eq, Serialize)]
pub struct TxRollupPublicInputs {
    // Number of txs in this rollup.
    pub num_txs: u16,

    // Constants that applied to all txs in this rollup.
    pub constants: BlockConstantData,

    // Tree snapshots immediately before this tx range.
    pub start_tree_snapshots: PartialStateReference,
    // Tree snapshots after applying this tx range.
    pub end_tree_snapshots: PartialStateReference,

    // Sponge blob after absorbing tx effects of all txs before this tx range.
    pub start_sponge_blob: SpongeBlob,
    // Sponge blob after additionally absorbing tx effects from this tx range.
    pub end_sponge_blob: SpongeBlob,

    // hash of the `l2_to_l1` message subtree. It will be combined with the `out_hash` from other txs in the
    // same block to form a wonky tree. The root of that tree becomes the final `out_hash` used on L1.
    pub out_hash: Field,

    // Accumulated fees for all txs in this rollup.
    pub accumulated_fees: Field,

    // Accumulated mana used for all txs in this rollup.
    pub accumulated_mana_used: Field,
}

impl Empty for TxRollupPublicInputs {
    fn empty() -> Self {
        TxRollupPublicInputs {
            num_txs: 0,
            constants: BlockConstantData::empty(),
            start_tree_snapshots: PartialStateReference::empty(),
            end_tree_snapshots: PartialStateReference::empty(),
            start_sponge_blob: SpongeBlob::empty(),
            end_sponge_blob: SpongeBlob::empty(),
            out_hash: 0,
            accumulated_fees: 0,
            accumulated_mana_used: 0,
        }
    }
}

#[test]
fn serialization_of_tx_rollup_public_inputs() {
    let item: TxRollupPublicInputs = make_fixture(1);
    let serialized: [Field; TX_ROLLUP_PUBLIC_INPUTS_LENGTH] = item.serialize();
    let deserialized = TxRollupPublicInputs::deserialize(serialized);
    assert(item.eq(deserialized));
}
