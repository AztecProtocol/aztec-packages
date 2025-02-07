use super::{
    address::aztec_address::AztecAddress,
    block_header::BlockHeader,
    constants::{PUBLIC_DATA_TREE_HEIGHT, SHARED_MUTABLE_HASH_SEPARATOR},
    contract_class_id::ContractClassId,
    data::{
        hash::compute_public_data_tree_index,
        public_data_tree_leaf_preimage::PublicDataTreeLeafPreimage,
    },
    hash::{poseidon2_hash, poseidon2_hash_with_separator},
    merkle_tree::{membership::MembershipWitness, root::root_from_sibling_path},
    tests::fixtures::public_data_tree::empty_public_data_tree,
    traits::{Empty, FromField, Hash, Packable, ToField},
    utils::arrays::array_concat,
    validate,
};
use scheduled_delay_change::ScheduledDelayChange;
use scheduled_value_change::ScheduledValueChange;

pub mod scheduled_delay_change;
pub mod scheduled_value_change;

pub fn validate_shared_mutable_hints<T, let INITIAL_DELAY: u32>(
    historical_header: BlockHeader,
    shared_mutable_storage_slot: Field,
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
        compute_scheduled_data_hash_slot(shared_mutable_storage_slot),
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

pub fn compute_scheduled_data_hash_slot(shared_mutable_storage_slot: Field) -> Field {
    poseidon2_hash_with_separator([shared_mutable_storage_slot], SHARED_MUTABLE_HASH_SEPARATOR)
}

fn public_storage_historical_read(
    historical_header: BlockHeader,
    storage_slot: Field,
    contract_address: AztecAddress,
    witness: MembershipWitness<PUBLIC_DATA_TREE_HEIGHT>,
    leaf_preimage: PublicDataTreeLeafPreimage,
) -> Field {
    let public_data_tree_index = compute_public_data_tree_index(contract_address, storage_slot);

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
    let concatenated: [Field; 4] = array_concat(value_change.pack(), delay_change.pack());
    poseidon2_hash(concatenated)
}

#[test]
fn test_validate_empty_shared_mutable_hints() {
    let shared_mutable_storage_slot = 27;
    let contract_address = AztecAddress::from_field(42);

    let public_data_prefill = 2;

    let public_data_tree = empty_public_data_tree::<4, 2>(public_data_prefill);
    let mut historical_header = BlockHeader::empty();
    historical_header.state.partial.public_data_tree.root = public_data_tree.get_root();
    historical_header.state.partial.public_data_tree.next_available_leaf_index =
        public_data_prefill;

    let witness = MembershipWitness {
        leaf_index: (public_data_prefill - 1) as Field,
        sibling_path: public_data_tree.get_sibling_path(public_data_prefill - 1),
    };

    let leaf_preimage = PublicDataTreeLeafPreimage {
        slot: (public_data_prefill - 1) as Field,
        value: 0,
        next_slot: 0,
        next_index: 0,
    };
    let value_change_hint: ScheduledValueChange<ContractClassId> = ScheduledValueChange::empty();
    let delay_change_hint: ScheduledDelayChange<100> = ScheduledDelayChange::empty();

    validate_shared_mutable_hints(
        historical_header,
        shared_mutable_storage_slot,
        contract_address,
        value_change_hint,
        delay_change_hint,
        witness,
        leaf_preimage,
    );
}

#[test]
fn test_validate_non_empty_shared_mutable_hints() {
    let shared_mutable_storage_slot = 27;
    let contract_address = AztecAddress::from_field(42);

    let hash_storage_slot = compute_scheduled_data_hash_slot(shared_mutable_storage_slot);
    let hash_leaf_slot = compute_public_data_tree_index(contract_address, hash_storage_slot);

    let value_change_hint: ScheduledValueChange<ContractClassId> = ScheduledValueChange::new(
        ContractClassId::from_field(0),
        ContractClassId::from_field(96),
        100,
    );
    let delay_change_hint: ScheduledDelayChange<100> =
        ScheduledDelayChange::new(Option::none(), Option::some(10), 200);

    let hashed_scheduled_data = hash_scheduled_data(value_change_hint, delay_change_hint);

    let public_data_prefill = 2;

    let mut public_data_tree = empty_public_data_tree::<4, 2>(public_data_prefill);
    public_data_tree.update_leaf(
        public_data_prefill - 1,
        PublicDataTreeLeafPreimage {
            slot: (public_data_prefill - 1) as Field,
            value: 0,
            next_slot: hash_leaf_slot,
            next_index: public_data_prefill,
        }
            .hash(),
    );

    let leaf_preimage = PublicDataTreeLeafPreimage {
        slot: hash_leaf_slot,
        value: hashed_scheduled_data,
        next_slot: 0,
        next_index: 0,
    };
    public_data_tree.update_leaf(public_data_prefill, leaf_preimage.hash());

    let mut historical_header = BlockHeader::empty();
    historical_header.state.partial.public_data_tree.root = public_data_tree.get_root();
    historical_header.state.partial.public_data_tree.next_available_leaf_index =
        public_data_prefill + 1;

    let witness = MembershipWitness {
        leaf_index: public_data_prefill as Field,
        sibling_path: public_data_tree.get_sibling_path(public_data_prefill),
    };

    validate_shared_mutable_hints(
        historical_header,
        shared_mutable_storage_slot,
        contract_address,
        value_change_hint,
        delay_change_hint,
        witness,
        leaf_preimage,
    );
}

#[test(should_fail_with = "Proving public value inclusion failed")]
fn test_validate_shared_mutable_hints_fake_membership_fails() {
    // Made up data
    validate_shared_mutable_hints(
        BlockHeader::empty(),
        27,
        AztecAddress::from_field(42),
        ScheduledValueChange::<ContractClassId>::empty(),
        ScheduledDelayChange::empty(),
        MembershipWitness { leaf_index: 80, sibling_path: std::mem::zeroed() },
        PublicDataTreeLeafPreimage::empty(),
    );
}

#[test(should_fail_with = "Public data tree index doesn't match witness")]
fn test_validate_shared_mutable_hints_different_leaf_fails() {
    let shared_mutable_storage_slot = 27;
    let contract_address = AztecAddress::from_field(42);

    let public_data_prefill = 2;

    let public_data_tree = empty_public_data_tree::<4, 2>(public_data_prefill);
    let mut historical_header = BlockHeader::empty();
    historical_header.state.partial.public_data_tree.root = public_data_tree.get_root();
    historical_header.state.partial.public_data_tree.next_available_leaf_index =
        public_data_prefill;

    let witness =
        MembershipWitness { leaf_index: 0, sibling_path: public_data_tree.get_sibling_path(0) };

    let leaf_preimage = PublicDataTreeLeafPreimage {
        slot: 0, // This leaf is invalid for any slot that is not zero
        value: 0,
        next_slot: 1,
        next_index: 1,
    };

    validate_shared_mutable_hints(
        historical_header,
        shared_mutable_storage_slot,
        contract_address,
        ScheduledValueChange::<ContractClassId>::empty(),
        ScheduledDelayChange::empty(),
        witness,
        leaf_preimage,
    );
}

#[test(should_fail_with = "Non-zero value change for zero hash")]
fn test_validate_non_empty_value_shared_mutable_hints_with_empty_leaf() {
    let shared_mutable_storage_slot = 27;
    let contract_address = AztecAddress::from_field(42);

    let public_data_prefill = 2;

    let public_data_tree = empty_public_data_tree::<4, 2>(public_data_prefill);
    let mut historical_header = BlockHeader::empty();
    historical_header.state.partial.public_data_tree.root = public_data_tree.get_root();
    historical_header.state.partial.public_data_tree.next_available_leaf_index =
        public_data_prefill;

    let witness = MembershipWitness {
        leaf_index: (public_data_prefill - 1) as Field,
        sibling_path: public_data_tree.get_sibling_path(public_data_prefill - 1),
    };

    let leaf_preimage = PublicDataTreeLeafPreimage {
        slot: (public_data_prefill - 1) as Field,
        value: 0,
        next_slot: 0,
        next_index: 0,
    };
    // Expected to be empty
    let value_change_hint: ScheduledValueChange<ContractClassId> = ScheduledValueChange::new(
        ContractClassId::from_field(0),
        ContractClassId::from_field(96),
        100,
    );
    let delay_change_hint: ScheduledDelayChange<100> = ScheduledDelayChange::empty();

    validate_shared_mutable_hints(
        historical_header,
        shared_mutable_storage_slot,
        contract_address,
        value_change_hint,
        delay_change_hint,
        witness,
        leaf_preimage,
    );
}

#[test(should_fail_with = "Non-zero delay change for zero hash")]
fn test_validate_non_empty_delay_shared_mutable_hints_with_empty_leaf() {
    let shared_mutable_storage_slot = 27;
    let contract_address = AztecAddress::from_field(42);

    let public_data_prefill = 2;

    let public_data_tree = empty_public_data_tree::<4, 2>(public_data_prefill);
    let mut historical_header = BlockHeader::empty();
    historical_header.state.partial.public_data_tree.root = public_data_tree.get_root();
    historical_header.state.partial.public_data_tree.next_available_leaf_index =
        public_data_prefill;

    let witness = MembershipWitness {
        leaf_index: (public_data_prefill - 1) as Field,
        sibling_path: public_data_tree.get_sibling_path(public_data_prefill - 1),
    };

    let leaf_preimage = PublicDataTreeLeafPreimage {
        slot: (public_data_prefill - 1) as Field,
        value: 0,
        next_slot: 0,
        next_index: 0,
    };
    let value_change_hint: ScheduledValueChange<ContractClassId> = ScheduledValueChange::empty();
    // Expected to be empty
    let delay_change_hint: ScheduledDelayChange<100> =
        ScheduledDelayChange::new(Option::none(), Option::some(10), 200);

    validate_shared_mutable_hints(
        historical_header,
        shared_mutable_storage_slot,
        contract_address,
        value_change_hint,
        delay_change_hint,
        witness,
        leaf_preimage,
    );
}

#[test(should_fail_with = "Hint values do not match hash")]
fn test_validate_wrong_hash_shared_mutable_hints_fails() {
    let shared_mutable_storage_slot = 27;
    let contract_address = AztecAddress::from_field(42);

    let hash_storage_slot = compute_scheduled_data_hash_slot(shared_mutable_storage_slot);
    let hash_leaf_slot = compute_public_data_tree_index(contract_address, hash_storage_slot);

    let value_change_hint: ScheduledValueChange<ContractClassId> = ScheduledValueChange::new(
        ContractClassId::from_field(0),
        ContractClassId::from_field(96),
        100,
    );
    let delay_change_hint: ScheduledDelayChange<100> =
        ScheduledDelayChange::new(Option::none(), Option::some(10), 200);

    let hashed_scheduled_data = 9000; // Incorrect hash

    let public_data_prefill = 2;

    let mut public_data_tree = empty_public_data_tree::<4, 2>(public_data_prefill);
    public_data_tree.update_leaf(
        public_data_prefill - 1,
        PublicDataTreeLeafPreimage {
            slot: (public_data_prefill - 1) as Field,
            value: 0,
            next_slot: hash_leaf_slot,
            next_index: public_data_prefill,
        }
            .hash(),
    );

    let leaf_preimage = PublicDataTreeLeafPreimage {
        slot: hash_leaf_slot,
        value: hashed_scheduled_data,
        next_slot: 0,
        next_index: 0,
    };
    public_data_tree.update_leaf(public_data_prefill, leaf_preimage.hash());

    let mut historical_header = BlockHeader::empty();
    historical_header.state.partial.public_data_tree.root = public_data_tree.get_root();
    historical_header.state.partial.public_data_tree.next_available_leaf_index =
        public_data_prefill + 1;

    let witness = MembershipWitness {
        leaf_index: public_data_prefill as Field,
        sibling_path: public_data_tree.get_sibling_path(public_data_prefill),
    };

    validate_shared_mutable_hints(
        historical_header,
        shared_mutable_storage_slot,
        contract_address,
        value_change_hint,
        delay_change_hint,
        witness,
        leaf_preimage,
    );
}
