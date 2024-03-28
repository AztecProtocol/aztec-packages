use crate::{
    abis::{
    accumulated_data::{
    private_accumulated_non_revertible_data::PrivateAccumulatedNonRevertibleData,
    public_accumulated_non_revertible_data::PublicAccumulatedNonRevertibleData
},
    call_request::CallRequest, public_data_update_request::PublicDataUpdateRequest,
    side_effect::{SideEffect, SideEffectLinkedToNoteHash}
},
    traits::is_empty
};

use crate::constants::{
    MAX_NON_REVERTIBLE_NOTE_HASHES_PER_TX, MAX_NON_REVERTIBLE_NULLIFIERS_PER_TX,
    MAX_NON_REVERTIBLE_PUBLIC_CALL_STACK_LENGTH_PER_TX,
    MAX_NON_REVERTIBLE_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, DA_GAS_PER_BYTE, FIXED_DA_GAS,
    DA_BYTES_PER_FIELD
};

struct AccumulatedNonRevertibleDataBuilder {
    da_gas_used: u64,
    revert_code: u8,

    new_note_hashes: BoundedVec<SideEffect, MAX_NON_REVERTIBLE_NOTE_HASHES_PER_TX>,
    new_nullifiers: BoundedVec<SideEffectLinkedToNoteHash, MAX_NON_REVERTIBLE_NULLIFIERS_PER_TX>,
    public_call_stack: BoundedVec<CallRequest, MAX_NON_REVERTIBLE_PUBLIC_CALL_STACK_LENGTH_PER_TX>,
    
    public_data_update_requests: BoundedVec<PublicDataUpdateRequest, MAX_NON_REVERTIBLE_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX>,
}

impl AccumulatedNonRevertibleDataBuilder {
    pub fn compute_da_gas(self) -> u64 {
        let mut non_zero_bytes:u64 = 0;

        for i in 0..self.new_note_hashes.storage.len() {
            if !is_empty(self.new_note_hashes.get_unchecked(i)) {
                non_zero_bytes += DA_BYTES_PER_FIELD;
            }
        }

        for i in 0..self.new_nullifiers.storage.len() {
            if !is_empty(self.new_nullifiers.get_unchecked(i)) {
                non_zero_bytes += DA_BYTES_PER_FIELD;
            }
        }

        for i in 0..self.public_data_update_requests.storage.len() {
            if !is_empty(self.public_data_update_requests.get_unchecked(i)) {
                non_zero_bytes += DA_BYTES_PER_FIELD * 2;
            }
        }
        non_zero_bytes * DA_GAS_PER_BYTE + FIXED_DA_GAS
    }

    pub fn to_private(self) -> PrivateAccumulatedNonRevertibleData {
        PrivateAccumulatedNonRevertibleData {
            da_gas_used: self.compute_da_gas(),
            revert_code: self.revert_code,
            new_note_hashes: self.new_note_hashes.storage,
            new_nullifiers: self.new_nullifiers.storage,
            public_call_stack: self.public_call_stack.storage
        }
    }

    pub fn to_public(self) -> PublicAccumulatedNonRevertibleData {
        PublicAccumulatedNonRevertibleData {
            da_gas_used: self.compute_da_gas(),
            revert_code: self.revert_code,
            new_note_hashes: self.new_note_hashes.storage,
            new_nullifiers: self.new_nullifiers.storage,
            public_call_stack: self.public_call_stack.storage,
            public_data_update_requests: self.public_data_update_requests.storage
        }
    }
}

mod tests {
    use crate::constants::{FIXED_DA_GAS, DA_GAS_PER_BYTE, DA_BYTES_PER_FIELD};
    use crate::abis::{
        accumulated_data::accumulated_non_revertible_data_builder::AccumulatedNonRevertibleDataBuilder,
        side_effect::{SideEffect, SideEffectLinkedToNoteHash},
        public_data_update_request::PublicDataUpdateRequest
    };

    #[test]
    fn test_empty_compute_da_gas() {
        let builder = AccumulatedNonRevertibleDataBuilder {
            da_gas_used: 0,
            revert_code: 0,
            new_note_hashes: BoundedVec::new(),
            new_nullifiers: BoundedVec::new(),
            public_call_stack: BoundedVec::new(),
            public_data_update_requests: BoundedVec::new()
        };

        assert_eq(builder.compute_da_gas(), FIXED_DA_GAS);
    }

    #[test]
    fn test_non_empty_compute_da_gas() {
        let mut builder = AccumulatedNonRevertibleDataBuilder {
            da_gas_used: 0,
            revert_code: 0,
            new_note_hashes: BoundedVec::new(),
            new_nullifiers: BoundedVec::new(),
            public_call_stack: BoundedVec::new(),
            public_data_update_requests: BoundedVec::new()
        };

        // each of these count as 1 field
        builder.new_note_hashes.push(SideEffect { value: 1, counter: 1 });
        builder.new_note_hashes.push(SideEffect { value: 2, counter: 2 });
        builder.new_nullifiers.push(SideEffectLinkedToNoteHash { value: 1, counter: 1, note_hash: 1 });
        builder.new_nullifiers.push(SideEffectLinkedToNoteHash { value: 2, counter: 2, note_hash: 2 });
        builder.new_nullifiers.push(SideEffectLinkedToNoteHash { value: 3, counter: 3, note_hash: 3 });

        // each of these count as 2 fields
        builder.public_data_update_requests.push(PublicDataUpdateRequest { leaf_slot: 1, new_value: 1 });
        builder.public_data_update_requests.push(PublicDataUpdateRequest { leaf_slot: 2, new_value: 2 });

        assert_eq(builder.compute_da_gas(), FIXED_DA_GAS + 9 * DA_GAS_PER_BYTE * DA_BYTES_PER_FIELD);
    }
}
