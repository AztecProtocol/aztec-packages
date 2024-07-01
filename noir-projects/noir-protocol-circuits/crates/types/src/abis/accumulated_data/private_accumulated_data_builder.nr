use crate::{
    abis::{
    accumulated_data::{private_accumulated_data::PrivateAccumulatedData}, call_request::CallRequest,
    note_hash::ScopedNoteHash, nullifier::ScopedNullifier,
    private_call_request::ScopedPrivateCallRequest,
    log_hash::{ScopedEncryptedLogHash, NoteLogHash, ScopedLogHash}
},
    constants::{
    MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX, MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX,
    MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX, MAX_L2_TO_L1_MSGS_PER_TX, MAX_ENCRYPTED_LOGS_PER_TX,
    MAX_UNENCRYPTED_LOGS_PER_TX, MAX_NOTE_ENCRYPTED_LOGS_PER_TX
},
    messaging::l2_to_l1_message::ScopedL2ToL1Message, traits::Empty
};

struct PrivateAccumulatedDataBuilder {
    note_hashes: BoundedVec<ScopedNoteHash, MAX_NOTE_HASHES_PER_TX>,
    nullifiers: BoundedVec<ScopedNullifier, MAX_NULLIFIERS_PER_TX>,
    l2_to_l1_msgs: BoundedVec<ScopedL2ToL1Message, MAX_L2_TO_L1_MSGS_PER_TX>,

    note_encrypted_logs_hashes: BoundedVec<NoteLogHash, MAX_NOTE_ENCRYPTED_LOGS_PER_TX>,
    encrypted_logs_hashes: BoundedVec<ScopedEncryptedLogHash, MAX_ENCRYPTED_LOGS_PER_TX>,
    unencrypted_logs_hashes: BoundedVec<ScopedLogHash, MAX_UNENCRYPTED_LOGS_PER_TX>,

    private_call_stack: BoundedVec<ScopedPrivateCallRequest, MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX>,
    public_call_stack: BoundedVec<CallRequest, MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX>,

}

impl PrivateAccumulatedDataBuilder {
    pub fn finish(self) -> PrivateAccumulatedData {
        PrivateAccumulatedData {
            note_hashes: self.note_hashes.storage,
            nullifiers: self.nullifiers.storage,
            l2_to_l1_msgs: self.l2_to_l1_msgs.storage,
            note_encrypted_logs_hashes: self.note_encrypted_logs_hashes.storage,
            encrypted_logs_hashes: self.encrypted_logs_hashes.storage,
            unencrypted_logs_hashes: self.unencrypted_logs_hashes.storage,
            private_call_stack: self.private_call_stack.storage,
            public_call_stack: self.public_call_stack.storage
        }
    }

    pub fn to_combined(self, teardown_gas: Gas) -> CombinedAccumulatedData {
        // TODO(Miranda): Hash here or elsewhere?
        let note_encrypted_logs_hash = compute_tx_note_logs_hash(self.note_encrypted_logs_hashes.storage.map(|l: NoteLogHash| l.expose_to_public()));
        let encrypted_logs_hash = compute_tx_logs_hash(self.encrypted_logs_hashes.storage.map(|l: ScopedEncryptedLogHash| l.expose_to_public()));
        let unencrypted_logs_hash = compute_tx_logs_hash(self.unencrypted_logs_hashes.storage.map(|l: ScopedLogHash| l.log_hash));
        let gas_used = self.to_metered_gas_used() + Gas::tx_overhead() + teardown_gas;
        let note_encrypted_log_preimages_length = self.note_encrypted_logs_hashes.storage.fold(0, |a, b: NoteLogHash| a + b.length);
        let encrypted_log_preimages_length = self.encrypted_logs_hashes.storage.fold(0, |a, b: ScopedEncryptedLogHash| a + b.log_hash.length);
        let unencrypted_log_preimages_length = self.unencrypted_logs_hashes.storage.fold(0, |a, b: ScopedLogHash| a + b.log_hash.length);

        CombinedAccumulatedData {
            new_note_hashes: self.new_note_hashes.storage.map(|n: ScopedNoteHash| n.note_hash.value),
            new_nullifiers: self.new_nullifiers.storage.map(|n: ScopedNullifier| n.nullifier.value),
            new_l2_to_l1_msgs: self.new_l2_to_l1_msgs.storage.map(|m: ScopedL2ToL1Message| m.message.content),
            note_encrypted_logs_hash,
            encrypted_logs_hash,
            unencrypted_logs_hash,
            note_encrypted_log_preimages_length,
            encrypted_log_preimages_length,
            unencrypted_log_preimages_length,
            public_data_update_requests: [PublicDataUpdateRequest::empty(); MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
            gas_used
        }
    }

    pub fn to_metered_gas_used(self) -> Gas {
        let mut metered_da_bytes = 0;
        let mut metered_l2_gas = 0;

        // note_hash_gas
        for i in 0..self.new_note_hashes.storage.len() {
            if !is_empty(self.new_note_hashes.get_unchecked(i)) {
                metered_da_bytes += DA_BYTES_PER_FIELD;
                metered_l2_gas += L2_GAS_PER_NOTE_HASH;
            }
        }

        // nullifier_gas
        for i in 0..self.new_nullifiers.storage.len() {
            if !is_empty(self.new_nullifiers.get_unchecked(i)) {
                metered_da_bytes += DA_BYTES_PER_FIELD;
                metered_l2_gas += L2_GAS_PER_NULLIFIER;
            }
        }

        // l2_to_l1_msg_gas
        for i in 0..self.new_l2_to_l1_msgs.storage.len() {
            if !is_empty(self.new_l2_to_l1_msgs.get_unchecked(i)) {
                metered_da_bytes += DA_BYTES_PER_FIELD;
            }
        }

        // note_encrypted_logs_hash_gas
        for i in 0..self.note_encrypted_logs_hashes.storage.len() {
            let log = self.note_encrypted_logs_hashes.get_unchecked(i);
            metered_da_bytes += log.length as u32;
            metered_l2_gas += log.length as u32 * L2_GAS_PER_LOG_BYTE;
        }

        // encrypted_logs_hash_gas
        for i in 0..self.encrypted_logs_hashes.storage.len() {
            let log = self.encrypted_logs_hashes.get_unchecked(i);
            metered_da_bytes += log.log_hash.length as u32;
            metered_l2_gas += log.log_hash.length as u32 * L2_GAS_PER_LOG_BYTE;
        }

        // unencrypted_logs_hash_gas
        for i in 0..self.unencrypted_logs_hashes.storage.len() {
            let log = self.unencrypted_logs_hashes.get_unchecked(i);
            metered_da_bytes += log.log_hash.length as u32;
            metered_l2_gas += log.log_hash.length as u32 * L2_GAS_PER_LOG_BYTE;
        }

        Gas::new(DA_GAS_PER_BYTE * metered_da_bytes, metered_l2_gas)
    }

    pub fn split_to_public(
        self,
        min_revertible_side_effect_counter: u32,
        teardown_gas: Gas
    ) -> (PublicAccumulatedData, PublicAccumulatedData) {
        let mut non_revertible_builder = PublicAccumulatedDataBuilder::empty();
        let mut revertible_builder = PublicAccumulatedDataBuilder::empty();
        let mut non_revertible_da_gas_used = 0;
        let mut non_revertible_l2_gas_used = 0;
        let mut revertible_da_gas_used = teardown_gas.da_gas; // pre-pay for teardown gas
        let mut revertible_l2_gas_used = teardown_gas.l2_gas;
        let DA_GAS_PER_FIELD = DA_BYTES_PER_FIELD * DA_GAS_PER_BYTE;

        for i in 0..MAX_NEW_NOTE_HASHES_PER_TX {
            let note_hash = self.new_note_hashes.storage[i];
            let public_note_hash = note_hash.expose_to_public();
            if note_hash.counter() < min_revertible_side_effect_counter {
                non_revertible_builder.new_note_hashes.push(public_note_hash);
                if !is_empty(public_note_hash) {
                    non_revertible_da_gas_used += DA_GAS_PER_FIELD;
                    non_revertible_l2_gas_used += L2_GAS_PER_NOTE_HASH;
                }
            } else {
                revertible_builder.new_note_hashes.push(public_note_hash);
                if !is_empty(public_note_hash) {
                    revertible_da_gas_used += DA_GAS_PER_FIELD;
                    revertible_l2_gas_used += L2_GAS_PER_NOTE_HASH;
                }
            }
        }

        for i in 0..MAX_NEW_NULLIFIERS_PER_TX {
            let nullifier = self.new_nullifiers.storage[i];
            let public_nullifier = nullifier.expose_to_public();
            if nullifier.counter() < min_revertible_side_effect_counter {
                non_revertible_builder.new_nullifiers.push(public_nullifier);
                if !is_empty(public_nullifier) {
                    non_revertible_da_gas_used += DA_GAS_PER_FIELD;
                    non_revertible_l2_gas_used += L2_GAS_PER_NULLIFIER;
                }
            } else {
                revertible_builder.new_nullifiers.push(public_nullifier);
                if !is_empty(public_nullifier) {
                    revertible_da_gas_used += DA_GAS_PER_FIELD;
                    revertible_l2_gas_used += L2_GAS_PER_NULLIFIER;
                }
            }
        }

        for i in 0..MAX_NEW_L2_TO_L1_MSGS_PER_TX {
            let msg = self.new_l2_to_l1_msgs.storage[i];
            if msg.counter() < min_revertible_side_effect_counter {
                non_revertible_builder.new_l2_to_l1_msgs.push(msg.message.content);
                if !is_empty(msg.message.content) {
                    non_revertible_da_gas_used += DA_GAS_PER_FIELD;
                }
            } else {
                revertible_builder.new_l2_to_l1_msgs.push(msg.message.content);
                if !is_empty(msg.message.content) {
                    revertible_da_gas_used += DA_GAS_PER_FIELD;
                }
            }
        }

        for i in 0..MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX {
            let call_stack_item = self.public_call_stack.storage[i];
            if call_stack_item.start_side_effect_counter < min_revertible_side_effect_counter {
                non_revertible_builder.public_call_stack.push(call_stack_item);
                if !is_empty(call_stack_item) {
                    non_revertible_l2_gas_used += FIXED_AVM_STARTUP_L2_GAS;
                }
            } else {
                revertible_builder.public_call_stack.push(call_stack_item);
                if !is_empty(call_stack_item) {
                    revertible_l2_gas_used += FIXED_AVM_STARTUP_L2_GAS;
                }
            }
        }

        for i in 0..MAX_NOTE_ENCRYPTED_LOGS_PER_TX {
            let note_encrypted_logs_hash = self.note_encrypted_logs_hashes.storage[i];
            let note_encrypted_logs_hash_public = note_encrypted_logs_hash.expose_to_public();
            if note_encrypted_logs_hash.counter < min_revertible_side_effect_counter {
                non_revertible_builder.note_encrypted_logs_hashes.push(note_encrypted_logs_hash_public);
                non_revertible_da_gas_used += note_encrypted_logs_hash_public.length as u32 * DA_GAS_PER_BYTE;
                non_revertible_l2_gas_used += note_encrypted_logs_hash_public.length as u32 * L2_GAS_PER_LOG_BYTE;
            } else {
                revertible_builder.note_encrypted_logs_hashes.push(note_encrypted_logs_hash_public);
                revertible_da_gas_used += note_encrypted_logs_hash_public.length as u32 * DA_GAS_PER_BYTE;
                revertible_l2_gas_used += note_encrypted_logs_hash_public.length as u32 * L2_GAS_PER_LOG_BYTE;
            }
        }

        for i in 0..MAX_ENCRYPTED_LOGS_PER_TX {
            let encrypted_logs_hash = self.encrypted_logs_hashes.storage[i];
            let encrypted_logs_hash_public = encrypted_logs_hash.expose_to_public();
            if encrypted_logs_hash.counter() < min_revertible_side_effect_counter {
                non_revertible_builder.encrypted_logs_hashes.push(encrypted_logs_hash_public);
                non_revertible_da_gas_used += encrypted_logs_hash_public.length as u32 * DA_GAS_PER_BYTE;
                non_revertible_l2_gas_used += encrypted_logs_hash_public.length as u32 * L2_GAS_PER_LOG_BYTE;
            } else {
                revertible_builder.encrypted_logs_hashes.push(encrypted_logs_hash_public);
                revertible_da_gas_used += encrypted_logs_hash_public.length as u32 * DA_GAS_PER_BYTE;
                revertible_l2_gas_used += encrypted_logs_hash_public.length as u32 * L2_GAS_PER_LOG_BYTE;
            }
        }

        for i in 0..MAX_UNENCRYPTED_LOGS_PER_TX {
            let unencrypted_logs_hash = self.unencrypted_logs_hashes.storage[i].log_hash;
            if unencrypted_logs_hash.counter < min_revertible_side_effect_counter {
                non_revertible_builder.unencrypted_logs_hashes.push(unencrypted_logs_hash);
                non_revertible_da_gas_used += unencrypted_logs_hash.length as u32 * DA_GAS_PER_BYTE;
                non_revertible_l2_gas_used += unencrypted_logs_hash.length as u32 * L2_GAS_PER_LOG_BYTE;
            } else {
                revertible_builder.unencrypted_logs_hashes.push(unencrypted_logs_hash);
                revertible_da_gas_used += unencrypted_logs_hash.length as u32 * DA_GAS_PER_BYTE;
                revertible_l2_gas_used += unencrypted_logs_hash.length as u32 * L2_GAS_PER_LOG_BYTE;
            }
        }

        revertible_builder.gas_used = Gas::new(revertible_da_gas_used, revertible_l2_gas_used);
        non_revertible_builder.gas_used = Gas::tx_overhead() + Gas::new(non_revertible_da_gas_used, non_revertible_l2_gas_used);
        (non_revertible_builder.finish(), revertible_builder.finish())
    }
}

impl Empty for PrivateAccumulatedDataBuilder {
    fn empty() -> Self {
        PrivateAccumulatedDataBuilder {
            note_hashes: BoundedVec::new(),
            nullifiers: BoundedVec::new(),
            l2_to_l1_msgs: BoundedVec::new(),
            note_encrypted_logs_hashes: BoundedVec::new(),
            encrypted_logs_hashes: BoundedVec::new(),
            unencrypted_logs_hashes: BoundedVec::new(),
            private_call_stack: BoundedVec::new(),
            public_call_stack: BoundedVec::new(),
        }
    }
}
