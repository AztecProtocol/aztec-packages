use crate::{
    abis::block_header::BlockHeader,
    address::aztec_address::AztecAddress,
    constants::PUBLIC_DATA_TREE_HEIGHT,
    data::{
        hash::compute_public_data_leaf_slot, public_data_storage_read,
        public_data_tree_leaf_preimage::PublicDataTreeLeafPreimage,
    },
    delayed_public_mutable::delayed_public_mutable_values::DelayedPublicMutableValues,
    hash::poseidon2_hash,
    merkle_tree::MembershipWitness,
    traits::Packable,
};

/// Read the current value of a delayed public mutable state variable, which was written to public storage with the hash
/// of the packed values.
/// See `aztec-nr/aztec/src/state_vars/delayed_public_mutable.nr > write` for more details on how the variable and hash
/// are written.
///
/// Parameters:
/// - `historical_header`: The header of the block whose state we are reading from.
/// - `storage_slot`: The **starting** storage slot of the delayed public mutable state variable.
/// - `contract_address`: The address of the contract where the delayed public mutable was written to.
/// - `delayed_public_mutable`: The delayed public mutable to read.
///   Note: This can be anything if the variable has not been initialized yet. The caller should only use the returned
///   value from this function to perform further checks.
/// - `witness`: A hint to prove that the `leaf_preimage` exists in the tree.
/// - `leaf_preimage`: The preimage of the leaf containing the hash of the packed values. Or a low leaf if the variable
///   has not been initialized.
///
/// Returns:
/// - T: The current value of the delayed public mutable at the time of the historical block. Empty if not initialized.
pub fn read_current_value_of_delayed_public_mutable_with_hash<T, let INITIAL_DELAY: u64>(
    historical_header: BlockHeader,
    storage_slot: Field,
    contract_address: AztecAddress,
    delayed_public_mutable: DelayedPublicMutableValues<T, INITIAL_DELAY>,
    witness: MembershipWitness<PUBLIC_DATA_TREE_HEIGHT>,
    leaf_preimage: PublicDataTreeLeafPreimage,
) -> T
where
    T: Packable + Eq,
{
    let storage_slot_of_hash = derive_storage_slot_of_packed_values_hash::<DelayedPublicMutableValues<T, INITIAL_DELAY>>(
        storage_slot,
    );

    let public_data_leaf_slot =
        compute_public_data_leaf_slot(contract_address, storage_slot_of_hash);

    // We attempt to read the storage slot.
    // If it's never been written to, the returned value will be `0`.
    // Otherwise, the returned value will be a hash of the delayed_public_mutable wrapper that contains
    // the `current_value` that we seek.
    let hash = public_data_storage_read(
        historical_header.state.partial.public_data_tree.root,
        public_data_leaf_slot,
        witness,
        leaf_preimage,
    );

    let computed_hash = poseidon2_hash(delayed_public_mutable.pack());

    let current_value =
        delayed_public_mutable.svc.get_current_at(historical_header.global_variables.timestamp);

    if hash != 0 {
        assert_eq(hash, computed_hash, "Hint values do not match hash");
        current_value
    } else {
        // If the hash is zero, the variable is uninitialized. All values must be zeros.
        T::unpack(std::mem::zeroed())
    }
}

/// Compute the storage slot of the hash of the packed values.
/// See `aztec-nr/aztec/src/utils/with_hash.nr > new` for more details on how the hash is packed with the values.
pub fn derive_storage_slot_of_packed_values_hash<T>(start_storage_slot: Field) -> Field
where
    T: Packable,
{
    // The actual item (of type T, of packed length N fields) is stored in contiguous fields from the `storage_slot`.
    // The _hash_ of the item is stored at the end, at slot: `storage_slot + N`.
    start_storage_slot + <T as Packable>::N as Field
}

mod tests {
    use crate::{
        abis::block_header::BlockHeader,
        address::aztec_address::AztecAddress,
        constants::PUBLIC_DATA_TREE_HEIGHT,
        contract_class_id::ContractClassId,
        data::{
            hash::compute_public_data_leaf_slot,
            public_data_tree_leaf_preimage::PublicDataTreeLeafPreimage,
        },
        delayed_public_mutable::{
            delayed_public_mutable_values::DelayedPublicMutableValues,
            scheduled_delay_change::ScheduledDelayChange,
            scheduled_value_change::ScheduledValueChange,
        },
        merkle_tree::MembershipWitness,
        tests::merkle_tree_utils::single_subtree_merkle_tree::SingleSubtreeMerkleTree,
        traits::{Empty, FromField, Hash},
    };
    use super::{
        derive_storage_slot_of_packed_values_hash,
        read_current_value_of_delayed_public_mutable_with_hash,
    };

    global TEST_INITIAL_DELAY: u64 = 100;

    struct TestBuilder {
        start_storage_slot: Field,
        contract_address: AztecAddress,
        random_contract_address: AztecAddress,
        historical_header: BlockHeader,
        delayed_public_mutable: DelayedPublicMutableValues<ContractClassId, TEST_INITIAL_DELAY>,
        witness: MembershipWitness<PUBLIC_DATA_TREE_HEIGHT>,
        leaf_preimage: PublicDataTreeLeafPreimage,
        public_data_tree: SingleSubtreeMerkleTree<4, 2, 40>,
    }

    impl TestBuilder {
        pub fn new() -> Self {
            let contract_address = AztecAddress::from_field(71);
            let start_storage_slot = 27;
            let hash_storage_slot = derive_storage_slot_of_packed_values_hash::<DelayedPublicMutableValues<ContractClassId, TEST_INITIAL_DELAY>>(
                start_storage_slot,
            );
            let hash_leaf_slot = compute_public_data_leaf_slot(contract_address, hash_storage_slot);

            // Current timestamp has passed the timestamp of change, so the value should be the post value (96).
            let timestamp_of_change = 456;
            let current_timestamp = timestamp_of_change + 50;
            let delayed_public_mutable = DelayedPublicMutableValues::new(
                ScheduledValueChange::new(
                    ContractClassId::from_field(13),
                    ContractClassId::from_field(96),
                    timestamp_of_change,
                ),
                ScheduledDelayChange::<TEST_INITIAL_DELAY>::new(
                    Option::none(),
                    Option::some(10),
                    200,
                ),
            );

            let random_contract_address = AztecAddress::from_field(65);
            let random_hash_leaf_slot =
                compute_public_data_leaf_slot(random_contract_address, hash_storage_slot);
            let random_next_leaf_slot = hash_leaf_slot + random_hash_leaf_slot * 2;
            assert(
                hash_leaf_slot.lt(random_hash_leaf_slot),
                "Find another random contract address with a larger hash leaf slot",
            );
            assert(
                random_hash_leaf_slot.lt(random_next_leaf_slot),
                "Update the next leaf slot to be greater than the random hash leaf slot",
            );

            let prefilled_leaves = [
                PublicDataTreeLeafPreimage { slot: 0, value: 0, next_slot: 99, next_index: 3 },
                // This is the preimage for the hash of the delayed_public_mutable.
                // This will be the low leaf for the hash at the random contract address.
                PublicDataTreeLeafPreimage {
                    slot: hash_leaf_slot,
                    value: delayed_public_mutable.hash(),
                    next_slot: random_next_leaf_slot,
                    next_index: 2,
                },
                PublicDataTreeLeafPreimage {
                    slot: random_next_leaf_slot,
                    value: 123456,
                    next_slot: 0,
                    next_index: 0,
                },
                PublicDataTreeLeafPreimage {
                    slot: 99,
                    value: 123,
                    next_slot: hash_leaf_slot,
                    next_index: 1,
                },
            ];
            let public_data_tree = SingleSubtreeMerkleTree::<4, 2, PUBLIC_DATA_TREE_HEIGHT>::new(
                prefilled_leaves.map(|l| l.hash()),
            );

            let mut historical_header = BlockHeader::empty();
            historical_header.state.partial.public_data_tree.root = public_data_tree.get_root();
            historical_header.state.partial.public_data_tree.next_available_leaf_index =
                public_data_tree.get_next_available_index();
            historical_header.global_variables.timestamp = current_timestamp;

            let leaf_index = 1;
            let witness = MembershipWitness {
                leaf_index,
                sibling_path: public_data_tree.get_sibling_path(leaf_index),
            };

            let leaf_preimage = prefilled_leaves[1];

            Self {
                start_storage_slot,
                contract_address,
                random_contract_address,
                historical_header,
                delayed_public_mutable,
                witness,
                leaf_preimage,
                public_data_tree,
            }
        }

        pub fn read_current_value(self) -> ContractClassId {
            read_current_value_of_delayed_public_mutable_with_hash(
                self.historical_header,
                self.start_storage_slot,
                self.contract_address,
                self.delayed_public_mutable,
                self.witness,
                self.leaf_preimage,
            )
        }
    }

    #[test]
    fn read_updated_value() {
        let builder = TestBuilder::new();

        let current_value = builder.read_current_value();

        assert_eq(current_value, ContractClassId::from_field(96));
    }

    #[test]
    fn read_pre_updated_value() {
        let mut builder = TestBuilder::new();

        // Change the timestamp in the header to before the timestamp of change.
        builder.historical_header.global_variables.timestamp =
            builder.delayed_public_mutable.svc.timestamp_of_change - 1;

        let current_value = builder.read_current_value();

        assert_eq(current_value, ContractClassId::from_field(13));
    }

    #[test]
    fn read_post_updated_value_at_timestamp_of_change() {
        let mut builder = TestBuilder::new();

        // Change the timestamp in the header to match the timestamp of change.
        builder.historical_header.global_variables.timestamp =
            builder.delayed_public_mutable.svc.timestamp_of_change;

        let current_value = builder.read_current_value();

        assert_eq(current_value, ContractClassId::from_field(96));
    }

    #[test]
    fn read_uninitialized_value() {
        let mut builder = TestBuilder::new();

        // Read from the random contract address, whose value is uninitialized.
        builder.contract_address = builder.random_contract_address;

        let current_value = builder.read_current_value();

        assert_eq(current_value, ContractClassId::empty());
    }

    #[test(should_fail_with = "Proving public value inclusion failed")]
    fn incorrect_membership_witness() {
        let mut builder = TestBuilder::new();

        // Update the witness to have a wrong leaf index.
        builder.witness.leaf_index += 1;

        let _ = builder.read_current_value();
    }

    #[test(should_fail_with = "The provided public data tree leaf preimage is not the correct leaf for the requested slot")]
    fn invalid_low_leaf() {
        let mut builder = TestBuilder::new();

        // Change the slot to a different value, so the leaf preimage is no longer a matching leaf nor a low leaf.
        builder.start_storage_slot -= 1;

        let _ = builder.read_current_value();
    }

    #[test(should_fail_with = "Hint values do not match hash")]
    fn random_delayed_public_mutable_value() {
        let mut builder = TestBuilder::new();

        builder.delayed_public_mutable.svc.post = ContractClassId::from_field(999);

        let _ = builder.read_current_value();
    }

    #[test(should_fail_with = "Proving public value inclusion failed")]
    fn bypass_updated_value_using_empty_low_leaf() {
        let mut builder = TestBuilder::new();

        // Use an empty leaf as the low leaf.
        let leaf_index = builder.public_data_tree.get_next_available_index();
        let witness = MembershipWitness {
            leaf_index,
            sibling_path: builder.public_data_tree.get_sibling_path(leaf_index),
        };
        builder.witness = witness;
        builder.leaf_preimage = PublicDataTreeLeafPreimage::empty();

        let current_value = builder.read_current_value();

        assert_eq(current_value, ContractClassId::empty());
    }

}
