use crate::{
    abis::kernel_circuit_public_inputs::{
    public_kernel_circuit_public_inputs::PublicKernelCircuitPublicInputs,
    vm_circuit_public_inputs::VMCircuitPublicInputs
},
    constants::NUM_PUBLIC_KERNEL_ACCUMULATED_ARRAYS, traits::{Serialize, Deserialize, Empty},
    utils::{arrays::array_length, reader::Reader}
};

pub struct PublicKernelAccumulatedArrayLengths {
    note_hash_read_requests: u32,
    nullifier_read_requests: u32,
    nullifier_non_existent_read_requests: u32,
    l1_to_l2_msg_read_requests: u32,
    public_data_reads: u32,
    note_hashes: u32,
    nullifiers: u32,
    l2_to_l1_msgs: u32,
    unencrypted_logs_hashes: u32,
    public_data_update_requests: u32,
}

impl PublicKernelAccumulatedArrayLengths {
    pub fn new(pi: PublicKernelCircuitPublicInputs) -> Self {
        PublicKernelAccumulatedArrayLengths {
            note_hash_read_requests: array_length(pi.validation_requests.note_hash_read_requests),
            nullifier_read_requests: array_length(pi.validation_requests.nullifier_read_requests),
            nullifier_non_existent_read_requests: array_length(pi.validation_requests.nullifier_non_existent_read_requests),
            l1_to_l2_msg_read_requests: array_length(pi.validation_requests.l1_to_l2_msg_read_requests),
            public_data_reads: array_length(pi.validation_requests.public_data_reads),
            note_hashes: array_length(pi.end.note_hashes) + array_length(pi.end_non_revertible.note_hashes),
            nullifiers: array_length(pi.end.nullifiers) + array_length(pi.end_non_revertible.nullifiers),
            l2_to_l1_msgs: array_length(pi.end.l2_to_l1_msgs) + array_length(pi.end_non_revertible.l2_to_l1_msgs),
            unencrypted_logs_hashes: array_length(pi.end.unencrypted_logs_hashes)
                + array_length(pi.end_non_revertible.unencrypted_logs_hashes),
            public_data_update_requests: array_length(pi.end.public_data_update_requests)
                + array_length(pi.end_non_revertible.public_data_update_requests)
        }
    }

    pub fn new_from_vm_circuit(previous_output: VMCircuitPublicInputs) -> Self {
        PublicKernelAccumulatedArrayLengths {
            note_hash_read_requests: array_length(previous_output.note_hash_read_requests),
            nullifier_read_requests: array_length(previous_output.nullifier_read_requests),
            nullifier_non_existent_read_requests: array_length(previous_output.nullifier_non_existent_read_requests),
            l1_to_l2_msg_read_requests: array_length(previous_output.l1_to_l2_msg_read_requests),
            public_data_reads: array_length(previous_output.public_data_reads),
            note_hashes: array_length(previous_output.note_hashes),
            nullifiers: array_length(previous_output.nullifiers),
            l2_to_l1_msgs: array_length(previous_output.l2_to_l1_msgs),
            unencrypted_logs_hashes: array_length(previous_output.unencrypted_logs_hashes),
            public_data_update_requests: array_length(previous_output.public_data_update_requests)
        }
    }
}

impl Empty for PublicKernelAccumulatedArrayLengths {
    fn empty() -> Self {
        PublicKernelAccumulatedArrayLengths {
            note_hash_read_requests: 0,
            nullifier_read_requests: 0,
            nullifier_non_existent_read_requests: 0,
            l1_to_l2_msg_read_requests: 0,
            public_data_reads: 0,
            note_hashes: 0,
            nullifiers: 0,
            l2_to_l1_msgs: 0,
            unencrypted_logs_hashes: 0,
            public_data_update_requests: 0
        }
    }
}

impl Eq for PublicKernelAccumulatedArrayLengths {
    fn eq(self, other: Self) -> bool {
        (self.note_hash_read_requests == other.note_hash_read_requests)
            & (self.nullifier_read_requests == other.nullifier_read_requests)
            & (self.nullifier_non_existent_read_requests
                    == other.nullifier_non_existent_read_requests)
            & (self.l1_to_l2_msg_read_requests == other.l1_to_l2_msg_read_requests)
            & (self.public_data_reads == other.public_data_reads)
            & (self.note_hashes == other.note_hashes)
            & (self.nullifiers == other.nullifiers)
            & (self.l2_to_l1_msgs == other.l2_to_l1_msgs)
            & (self.unencrypted_logs_hashes
                                            == other.unencrypted_logs_hashes)
            & (self.public_data_update_requests
                                                == other.public_data_update_requests)
    }
}

impl Serialize<NUM_PUBLIC_KERNEL_ACCUMULATED_ARRAYS> for PublicKernelAccumulatedArrayLengths {
    fn serialize(self) -> [Field; NUM_PUBLIC_KERNEL_ACCUMULATED_ARRAYS] {
        let mut fields: BoundedVec<Field, NUM_PUBLIC_KERNEL_ACCUMULATED_ARRAYS> = BoundedVec::new();

        fields.push(self.note_hash_read_requests as Field);
        fields.push(self.nullifier_read_requests as Field);
        fields.push(self.nullifier_non_existent_read_requests as Field);
        fields.push(self.l1_to_l2_msg_read_requests as Field);
        fields.push(self.public_data_reads as Field);
        fields.push(self.note_hashes as Field);
        fields.push(self.nullifiers as Field);
        fields.push(self.l2_to_l1_msgs as Field);
        fields.push(self.unencrypted_logs_hashes as Field);
        fields.push(self.public_data_update_requests as Field);

        fields.storage
    }
}

impl Deserialize<NUM_PUBLIC_KERNEL_ACCUMULATED_ARRAYS> for PublicKernelAccumulatedArrayLengths {
    fn deserialize(fields: [Field; NUM_PUBLIC_KERNEL_ACCUMULATED_ARRAYS]) -> PublicKernelAccumulatedArrayLengths {
        let mut reader = Reader::new(fields);

        let item = Self {
            note_hash_read_requests: reader.read_u32(),
            nullifier_read_requests: reader.read_u32(),
            nullifier_non_existent_read_requests: reader.read_u32(),
            l1_to_l2_msg_read_requests: reader.read_u32(),
            public_data_reads: reader.read_u32(),
            note_hashes: reader.read_u32(),
            nullifiers: reader.read_u32(),
            l2_to_l1_msgs: reader.read_u32(),
            unencrypted_logs_hashes: reader.read_u32(),
            public_data_update_requests: reader.read_u32()
        };

        reader.finish();
        item
    }
}

#[test]
fn serialization_of_empty() {
    let item = PublicKernelAccumulatedArrayLengths::empty();
    let serialized = item.serialize();
    let deserialized = PublicKernelAccumulatedArrayLengths::deserialize(serialized);
    assert(item.eq(deserialized));
}
