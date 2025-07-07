use dep::types::{
    abis::{
        block_constant_data::BlockConstantData, partial_state_reference::PartialStateReference,
        sponge_blob::SpongeBlob,
    },
    constants::BASE_OR_MERGE_PUBLIC_INPUTS_LENGTH,
    traits::{Deserialize, Empty, Serialize},
};

#[derive(Deserialize, Eq, Serialize)]
pub struct BaseOrMergeRollupPublicInputs {
    pub(crate) num_txs: u32,
    pub(crate) constants: BlockConstantData,

    pub(crate) start: PartialStateReference,
    pub(crate) end: PartialStateReference,

    // A poseidon sponge of all tx effects to be opened in block root, then added to blob(s)
    // In sponge form so we can check left.end == right.start, rather than recreate a tree later
    pub(crate) start_sponge_blob: SpongeBlob,
    pub(crate) end_sponge_blob: SpongeBlob,

    // We hash public inputs to make them constant-sized (to then be opened on-chain)
    // u128 isn't safe if it's an input to the circuit (it won't automatically constrain the witness)
    // So we want to constrain it when casting these fields to u128

    pub(crate) out_hash: Field,

    pub(crate) accumulated_fees: Field,
    pub(crate) accumulated_mana_used: Field,
}

impl Empty for BaseOrMergeRollupPublicInputs {
    fn empty() -> Self {
        BaseOrMergeRollupPublicInputs {
            num_txs: 0 as u32,
            constants: BlockConstantData::empty(),
            start: PartialStateReference::empty(),
            end: PartialStateReference::empty(),
            start_sponge_blob: SpongeBlob::empty(),
            end_sponge_blob: SpongeBlob::empty(),
            out_hash: 0,
            accumulated_fees: 0,
            accumulated_mana_used: 0,
        }
    }
}

#[test]
fn serialization_of_empty() {
    let item = BaseOrMergeRollupPublicInputs::empty();
    // We use the BASE_OR_MERGE_PUBLIC_INPUTS_LENGTH constant to ensure that there is a match between the derived trait
    // implementation and the constant.
    let serialized: [Field; BASE_OR_MERGE_PUBLIC_INPUTS_LENGTH] = item.serialize();
    let deserialized = BaseOrMergeRollupPublicInputs::deserialize(serialized);
    assert(item.eq(deserialized));
}
