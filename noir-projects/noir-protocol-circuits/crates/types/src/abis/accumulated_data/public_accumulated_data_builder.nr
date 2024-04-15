use crate::{
    abis::{
    gas::Gas, gas_settings::GasSettings,
    accumulated_data::public_accumulated_data::PublicAccumulatedData, call_request::CallRequest,
    public_data_update_request::PublicDataUpdateRequest,
    side_effect::{SideEffect, SideEffectLinkedToNoteHash}
},
    constants::{
    MAX_NEW_NOTE_HASHES_PER_TX, MAX_NEW_NULLIFIERS_PER_TX, MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX,
    MAX_NEW_L2_TO_L1_MSGS_PER_TX, MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, DA_BYTES_PER_FIELD,
    FIXED_DA_GAS, DA_GAS_PER_BYTE
},
    traits::{Empty, is_empty}
};

struct PublicAccumulatedDataBuilder {
    new_note_hashes: BoundedVec<SideEffect, MAX_NEW_NOTE_HASHES_PER_TX>,
    new_nullifiers: BoundedVec<SideEffectLinkedToNoteHash, MAX_NEW_NULLIFIERS_PER_TX>,
    new_l2_to_l1_msgs: BoundedVec<Field, MAX_NEW_L2_TO_L1_MSGS_PER_TX>,

    encrypted_logs_hash: Field,
    unencrypted_logs_hash: Field,

    // Here so that the gas cost of this request can be measured by circuits, without actually needing to feed in the
    // variable-length data.
    encrypted_log_preimages_length: Field,
    unencrypted_log_preimages_length: Field,

    public_data_update_requests: BoundedVec<PublicDataUpdateRequest, MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX>,

    public_call_stack: BoundedVec<CallRequest, MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX>,

    gas_used: Gas,
}

impl PublicAccumulatedDataBuilder {
    // This finish is called throughout the public kernel, which keeps its own gas accounting
    pub fn finish(self) -> PublicAccumulatedData {
        PublicAccumulatedData {
            new_note_hashes: self.new_note_hashes.storage,
            new_nullifiers: self.new_nullifiers.storage,
            new_l2_to_l1_msgs: self.new_l2_to_l1_msgs.storage,
            encrypted_logs_hash: self.encrypted_logs_hash,
            unencrypted_logs_hash: self.unencrypted_logs_hash,
            encrypted_log_preimages_length: self.encrypted_log_preimages_length,
            unencrypted_log_preimages_length: self.unencrypted_log_preimages_length,
            public_data_update_requests: self.public_data_update_requests.storage,
            public_call_stack: self.public_call_stack.storage,
            gas_used: self.gas_used
        }
    }

    // This finish is called in PrivateTailToPublic, which needs initial gas accounting performed
    pub fn finish_revertible_from_private(self) -> PublicAccumulatedData {
        let da_gas = self.compute_da_gas();
        let gas = Gas { da_gas, l1_gas: 0, l2_gas: 0 };

        PublicAccumulatedData {
            new_note_hashes: self.new_note_hashes.storage,
            new_nullifiers: self.new_nullifiers.storage,
            new_l2_to_l1_msgs: self.new_l2_to_l1_msgs.storage,
            encrypted_logs_hash: self.encrypted_logs_hash,
            unencrypted_logs_hash: self.unencrypted_logs_hash,
            encrypted_log_preimages_length: self.encrypted_log_preimages_length,
            unencrypted_log_preimages_length: self.unencrypted_log_preimages_length,
            public_data_update_requests: self.public_data_update_requests.storage,
            public_call_stack: self.public_call_stack.storage,
            gas_used: gas
        }
    }

    pub fn finish_non_revertible_from_private(self, gas_settings: GasSettings) -> PublicAccumulatedData {
        let da_gas = self.compute_da_gas() + FIXED_DA_GAS + gas_settings.da.teardown_gas_limit;
        let gas = Gas { da_gas, l1_gas: 0, l2_gas: 0 };

        PublicAccumulatedData {
            new_note_hashes: self.new_note_hashes.storage,
            new_nullifiers: self.new_nullifiers.storage,
            new_l2_to_l1_msgs: self.new_l2_to_l1_msgs.storage,
            encrypted_logs_hash: self.encrypted_logs_hash,
            unencrypted_logs_hash: self.unencrypted_logs_hash,
            encrypted_log_preimages_length: self.encrypted_log_preimages_length,
            unencrypted_log_preimages_length: self.unencrypted_log_preimages_length,
            public_data_update_requests: self.public_data_update_requests.storage,
            public_call_stack: self.public_call_stack.storage,
            gas_used: gas
        }
    }

    pub fn compute_da_gas(self) -> u32 {
        let mut metered_bytes = 0;

        // note_hash_gas
        for i in 0..self.new_note_hashes.storage.len() {
            if !is_empty(self.new_note_hashes.get_unchecked(i)) {
                metered_bytes += DA_BYTES_PER_FIELD;
            }
        }

        // nullifier_gas
        for i in 0..self.new_nullifiers.storage.len() {
            if !is_empty(self.new_nullifiers.get_unchecked(i)) {
                metered_bytes += DA_BYTES_PER_FIELD;
            }
        }

        // l2_to_l1_msg_gas
        for i in 0..self.new_l2_to_l1_msgs.storage.len() {
            if !is_empty(self.new_l2_to_l1_msgs.get_unchecked(i)) {
                metered_bytes += DA_BYTES_PER_FIELD;
            }
        }

        // public_data_writes_gas
        for i in 0..self.public_data_update_requests.storage.len() {
            if !is_empty(self.public_data_update_requests.get_unchecked(i)) {
                // each write has two fields
                metered_bytes += DA_BYTES_PER_FIELD + DA_BYTES_PER_FIELD;
            }
        }

        // encrypted_logs_hash_gas
        metered_bytes += self.encrypted_log_preimages_length as u32;

        // unencrypted_logs_hash_gas
        metered_bytes += self.unencrypted_log_preimages_length as u32;

        DA_GAS_PER_BYTE * metered_bytes
    }
}

impl Empty for PublicAccumulatedDataBuilder {
    fn empty() -> Self {
        PublicAccumulatedDataBuilder {
            new_note_hashes: BoundedVec::new(),
            new_nullifiers: BoundedVec::new(),
            new_l2_to_l1_msgs: BoundedVec::new(),
            encrypted_logs_hash: 0,
            unencrypted_logs_hash: 0,
            encrypted_log_preimages_length: 0,
            unencrypted_log_preimages_length: 0,
            public_data_update_requests: BoundedVec::new(),
            public_call_stack: BoundedVec::new(),
            gas_used: Gas::empty(),
        }
    }
}

mod tests {
    use crate::{
        abis::{
        accumulated_data::public_accumulated_data_builder::PublicAccumulatedDataBuilder,
        call_request::CallRequest, caller_context::CallerContext,
        public_data_update_request::PublicDataUpdateRequest,
        side_effect::{SideEffect, SideEffectLinkedToNoteHash}
    },
        constants::{FIXED_DA_GAS, DA_GAS_PER_BYTE, DA_BYTES_PER_FIELD}, address::AztecAddress,
        utils::arrays::array_eq
    };

    #[test]
    fn test_empty_compute_da_gas() {
        let builder = PublicAccumulatedDataBuilder::empty();

        assert_eq(builder.compute_da_gas(), 0);
    }

    #[test]
    fn test_non_empty_compute_da_gas() {
        let mut builder = PublicAccumulatedDataBuilder::empty();

        // each of these count as 1 field
        builder.new_note_hashes.push(SideEffect { value: 1, counter: 1 });
        builder.new_note_hashes.push(SideEffect { value: 2, counter: 2 });
        builder.new_nullifiers.push(SideEffectLinkedToNoteHash { value: 1, counter: 1, note_hash: 1 });
        builder.new_nullifiers.push(SideEffectLinkedToNoteHash { value: 2, counter: 2, note_hash: 2 });
        builder.new_nullifiers.push(SideEffectLinkedToNoteHash { value: 3, counter: 3, note_hash: 3 });
        builder.new_l2_to_l1_msgs.push(1);
        builder.public_data_update_requests.push(PublicDataUpdateRequest { leaf_slot: 1, new_value: 1 });
        builder.public_data_update_requests.push(PublicDataUpdateRequest { leaf_slot: 2, new_value: 2 });

        builder.encrypted_log_preimages_length = 3;
        builder.unencrypted_log_preimages_length = 4;

        assert_eq(builder.compute_da_gas(), DA_GAS_PER_BYTE * (10 * DA_BYTES_PER_FIELD + 7));
    }
}
