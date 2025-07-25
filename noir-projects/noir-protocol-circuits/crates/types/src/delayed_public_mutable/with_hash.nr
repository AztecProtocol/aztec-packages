use crate::{
    abis::block_header::BlockHeader,
    address::aztec_address::AztecAddress,
    constants::PUBLIC_DATA_TREE_HEIGHT,
    data::{
        hash::compute_public_data_tree_index,
        public_data_tree_leaf_preimage::PublicDataTreeLeafPreimage,
    },
    hash::poseidon2_hash,
    merkle_tree::{membership::MembershipWitness, root::root_from_sibling_path},
    traits::{Hash, Packable},
};

pub fn validate_with_hash_hints<T>(
    historical_header: BlockHeader,
    with_hash_storage_slot: Field,
    contract_address: AztecAddress,
    with_hash_value_hint: T,
    witness: MembershipWitness<PUBLIC_DATA_TREE_HEIGHT>,
    leaf_preimage: PublicDataTreeLeafPreimage,
)
where
    T: Packable + Eq,
{
    let storage_hash = public_storage_historical_read(
        historical_header,
        compute_with_hash_hash_storage_slot::<T>(with_hash_storage_slot),
        contract_address,
        witness,
        leaf_preimage,
    );

    let hashed_value = poseidon2_hash(with_hash_value_hint.pack());

    if storage_hash != 0 {
        assert_eq(storage_hash, hashed_value, "Hint values do not match hash");
    } else {
        // The hash slot can only hold a zero if it is uninitialized. Therefore, the hints must then be zero
        // (i.e. the default value for public storage) as well.
        assert_eq(
            with_hash_value_hint,
            T::unpack(std::mem::zeroed()),
            "Non-zero hint for zero hash",
        );
    };
}

pub fn compute_with_hash_hash_storage_slot<T>(with_hash_storage_slot: Field) -> Field
where
    T: Packable,
{
    with_hash_storage_slot + <T as Packable>::N as Field
}

fn public_storage_historical_read(
    historical_header: BlockHeader,
    storage_slot: Field,
    contract_address: AztecAddress,
    witness: MembershipWitness<PUBLIC_DATA_TREE_HEIGHT>, // Is this the witness of a "low leaf"? If so, we don't need a low leaf witness to prove _membership_; only to prove non-membership.
    leaf_preimage: PublicDataTreeLeafPreimage,
) -> Field {
    let public_data_tree_index = compute_public_data_tree_index(contract_address, storage_slot); // Should this instead be called compute_public_data_tree_slot, and the variable be called `public_data_tree_slot`? This is not an index.

    assert_eq(
        historical_header.state.partial.public_data_tree.root,
        root_from_sibling_path(
            leaf_preimage.hash(),
            witness.leaf_index,
            witness.sibling_path,
        ),
        "Proving public value inclusion failed",
    );

    // These lt checks cost ~350 gates:
    let is_less_than_slot = leaf_preimage.slot.lt(public_data_tree_index); // Why is this needed for a membership proof?
    let is_next_greater_than = public_data_tree_index.lt(leaf_preimage.next_slot); // Why is this needed for a membership proof?
    let is_max = ((leaf_preimage.next_index == 0) & (leaf_preimage.next_slot == 0)); // Why is this needed for a membership proof?
    let is_in_range = is_less_than_slot & (is_next_greater_than | is_max); // Why is this needed for a membership proof?

    if is_in_range {
        // Why is this needed for a membership proof?
        0
    } else {
        assert_eq(
            leaf_preimage.slot,
            public_data_tree_index,
            "The provided public data tree leaf preimage is not the correct leaf for the provided contract_address and storage slot",
        );
        leaf_preimage.value
    }
}

mod tests {
    use crate::{
        abis::block_header::BlockHeader,
        address::aztec_address::AztecAddress,
        contract_class_id::ContractClassId,
        data::{
            hash::compute_public_data_tree_index,
            public_data_tree_leaf_preimage::PublicDataTreeLeafPreimage,
        },
        delayed_public_mutable::{
            delayed_public_mutable_values::DelayedPublicMutableValues,
            scheduled_delay_change::ScheduledDelayChange,
            scheduled_value_change::ScheduledValueChange,
        },
        merkle_tree::membership::MembershipWitness,
        tests::fixtures::public_data_tree::empty_public_data_tree,
        traits::{Empty, FromField, Hash},
    };
    use super::{compute_with_hash_hash_storage_slot, validate_with_hash_hints};

    #[test]
    fn test_validate_empty_with_hash_hints() {
        let with_hash_storage_slot = 27;
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

        let with_hash_hint = DelayedPublicMutableValues::<ContractClassId, 0>::new(
            ScheduledValueChange::empty(),
            ScheduledDelayChange::empty(),
        );

        validate_with_hash_hints(
            historical_header,
            with_hash_storage_slot,
            contract_address,
            with_hash_hint,
            witness,
            leaf_preimage,
        );
    }

    #[test]
    fn test_validate_non_empty_with_hash_hints() {
        let with_hash_storage_slot = 27;
        let contract_address = AztecAddress::from_field(42);

        let hash_storage_slot = compute_with_hash_hash_storage_slot::<DelayedPublicMutableValues<ContractClassId, 100>>(
            with_hash_storage_slot,
        );
        let hash_leaf_slot = compute_public_data_tree_index(contract_address, hash_storage_slot);

        let with_hash_hint = DelayedPublicMutableValues::new(
            ScheduledValueChange::new(
                ContractClassId::from_field(0),
                ContractClassId::from_field(96),
                100,
            ),
            ScheduledDelayChange::<100>::new(Option::none(), Option::some(10), 200),
        );

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
            value: with_hash_hint.hash(),
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

        validate_with_hash_hints(
            historical_header,
            with_hash_storage_slot,
            contract_address,
            with_hash_hint,
            witness,
            leaf_preimage,
        );
    }

    #[test(should_fail_with = "Proving public value inclusion failed")]
    fn test_validate_with_hash_hints_fake_membership_fails() {
        // Made up data
        validate_with_hash_hints(
            BlockHeader::empty(),
            27,
            AztecAddress::from_field(42),
            DelayedPublicMutableValues::<ContractClassId, 0>::new(
                ScheduledValueChange::empty(),
                ScheduledDelayChange::empty(),
            ),
            MembershipWitness { leaf_index: 80, sibling_path: std::mem::zeroed() },
            PublicDataTreeLeafPreimage::empty(),
        );
    }

    #[test(should_fail_with = "The provided public data tree leaf preimage is not the correct leaf for the provided contract_address and storage slot")]
    fn test_validate_with_hash_hints_different_leaf_fails() {
        let with_hash_storage_slot = 27;
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

        validate_with_hash_hints(
            historical_header,
            with_hash_storage_slot,
            contract_address,
            DelayedPublicMutableValues::<ContractClassId, 0>::new(
                ScheduledValueChange::empty(),
                ScheduledDelayChange::empty(),
            ),
            witness,
            leaf_preimage,
        );
    }

    #[test(should_fail_with = "Non-zero hint for zero hash")]
    fn test_validate_non_empty_value_with_empty_leaf_fails() {
        let with_hash_storage_slot = 27;
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
        // Expected to be empty, it's not
        let value_hint = DelayedPublicMutableValues::<ContractClassId, 0>::new(
            ScheduledValueChange::new(
                ContractClassId::from_field(0),
                ContractClassId::from_field(96),
                100,
            ),
            ScheduledDelayChange::empty(),
        );

        validate_with_hash_hints(
            historical_header,
            with_hash_storage_slot,
            contract_address,
            value_hint,
            witness,
            leaf_preimage,
        );
    }

    #[test(should_fail_with = "Hint values do not match hash")]
    fn test_validate_wrong_hash_hints_fails() {
        let with_hash_storage_slot = 27;
        let contract_address = AztecAddress::from_field(42);

        let hash_storage_slot = compute_with_hash_hash_storage_slot::<DelayedPublicMutableValues<ContractClassId, 100>>(
            with_hash_storage_slot,
        );
        let hash_leaf_slot = compute_public_data_tree_index(contract_address, hash_storage_slot);

        let value_hint = DelayedPublicMutableValues::new(
            ScheduledValueChange::new(
                ContractClassId::from_field(0),
                ContractClassId::from_field(96),
                100,
            ),
            ScheduledDelayChange::<100>::new(Option::none(), Option::some(10), 200),
        );

        let hashed_value = 9000; // Incorrect hash

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
            value: hashed_value,
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

        validate_with_hash_hints(
            historical_header,
            with_hash_storage_slot,
            contract_address,
            value_hint,
            witness,
            leaf_preimage,
        );
    }

}
