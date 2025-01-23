use super::{
    address::aztec_address::AztecAddress,
    block_header::BlockHeader,
    constants::{GENERATOR_INDEX__PUBLIC_LEAF_INDEX, PUBLIC_DATA_TREE_HEIGHT},
    data::public_data_tree_leaf_preimage::PublicDataTreeLeafPreimage,
    hash::{poseidon2_hash, poseidon2_hash_with_separator},
    merkle_tree::{membership::MembershipWitness, root::root_from_sibling_path},
    traits::{Empty, FromField, Hash, Serialize, ToField},
    utils::arrays::array_concat,
};
use scheduled_delay_change::ScheduledDelayChange;
use scheduled_value_change::ScheduledValueChange;

pub mod scheduled_delay_change;
pub mod scheduled_value_change;

pub fn validate_shared_mutable_hints<T, let INITIAL_DELAY: u32>(
    historical_header: BlockHeader,
    storage_slot: Field,
    contract_address: AztecAddress,
    value_change_hint: ScheduledValueChange<T>,
    delay_change_hint: ScheduledDelayChange<INITIAL_DELAY>,
    witness: MembershipWitness<PUBLIC_DATA_TREE_HEIGHT>,
    leaf_preimage: PublicDataTreeLeafPreimage,
)
where
    T: ToField + Eq + FromField + Empty,
{
    let hash = public_storage_historical_read(
        historical_header,
        storage_slot,
        contract_address,
        witness,
        leaf_preimage,
    );

    if hash != 0 {
        assert_eq(
            hash,
            hash_scheduled_data(value_change_hint, delay_change_hint),
            "Hint values do not match hash",
        );
    } else {
        assert_eq(
            value_change_hint,
            ScheduledValueChange::empty(),
            "Non-zero value change for zero hash",
        );
        assert_eq(
            delay_change_hint,
            ScheduledDelayChange::empty(),
            "Non-zero delay change for zero hash",
        );
    };
}

pub fn compute_shared_mutable_block_horizon<T, let INITIAL_DELAY: u32>(
    value_change: ScheduledValueChange<T>,
    delay_change: ScheduledDelayChange<INITIAL_DELAY>,
    historical_block_number: u32,
) -> u32
where
    T: ToField + Eq + FromField,
{
    let effective_minimum_delay =
        delay_change.get_effective_minimum_delay_at(historical_block_number);
    value_change.get_block_horizon(historical_block_number, effective_minimum_delay)
}

fn public_storage_historical_read(
    historical_header: BlockHeader,
    storage_slot: Field,
    contract_address: AztecAddress,
    witness: MembershipWitness<PUBLIC_DATA_TREE_HEIGHT>,
    leaf_preimage: PublicDataTreeLeafPreimage,
) -> Field {
    let public_data_tree_index = poseidon2_hash_with_separator(
        [contract_address.to_field(), storage_slot],
        GENERATOR_INDEX__PUBLIC_LEAF_INDEX,
    );

    assert_eq(
        historical_header.state.partial.public_data_tree.root,
        root_from_sibling_path(
            leaf_preimage.hash(),
            witness.leaf_index,
            witness.sibling_path,
        ),
        "Proving public value inclusion failed",
    );

    let is_less_than_slot = leaf_preimage.slot.lt(public_data_tree_index);
    let is_next_greater_than = public_data_tree_index.lt(leaf_preimage.next_slot);
    let is_max = ((leaf_preimage.next_index == 0) & (leaf_preimage.next_slot == 0));
    let is_in_range = is_less_than_slot & (is_next_greater_than | is_max);

    if is_in_range {
        0
    } else {
        assert_eq(
            leaf_preimage.slot,
            public_data_tree_index,
            "Public data tree index doesn't match witness",
        );
        leaf_preimage.value
    }
}

fn hash_scheduled_data<T, let INITIAL_DELAY: u32>(
    value_change: ScheduledValueChange<T>,
    delay_change: ScheduledDelayChange<INITIAL_DELAY>,
) -> Field
where
    T: ToField + Eq + FromField,
{
    let concatenated: [Field; 4] = array_concat(value_change.serialize(), delay_change.serialize());
    poseidon2_hash(concatenated)
}
