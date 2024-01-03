use crate::hash::{compute_public_data_tree_index, compute_public_data_tree_value};
use dep::types::{
    abis::{
        call_request::CallRequest,
        new_contract_data::NewContractData,
        public_data_read::PublicDataRead,
        public_data_write::PublicDataWrite,
    },
    address::AztecAddress,
    contrakt::{
        storage_read::StorageRead,
        storage_write::StorageWrite,
    },
    utils::{
        arrays::struct_array_eq,
    },
};

pub fn compute_public_data_reads<N>(
    contract_address: AztecAddress,
    read_requests: [StorageRead; N]
) -> [PublicDataRead; N] {
    let mut public_data_reads = [PublicDataRead::empty(); N];
    for i in 0..N {
        let read_request = read_requests[i];
        if !read_request.is_empty() {
            public_data_reads[i] = PublicDataRead {
                leaf_slot: compute_public_data_tree_index(contract_address, read_request.storage_slot),
                value: compute_public_data_tree_value(read_request.current_value),
            };
        }
    }
    public_data_reads
}

pub fn assert_eq_call_requests<N, S>(call_requests: [CallRequest; N], expected: [CallRequest; S]) {
    assert(
        struct_array_eq(
            call_requests,
            expected,
            |c1: CallRequest, c2: CallRequest| c1.eq(c2),
            |c: CallRequest| c.is_empty()
        )
    );
}

pub fn compute_public_data_writes<N>(
    contract_address: AztecAddress,
    writes: [StorageWrite; N]
) -> [PublicDataWrite; N] {
    let mut public_data_writes = [PublicDataWrite::empty(); N];
    for i in 0..N {
        let write = writes[i];
        if !write.is_empty() {
            public_data_writes[i] = PublicDataWrite {
                leaf_slot: compute_public_data_tree_index(contract_address, write.storage_slot),
                old_value: compute_public_data_tree_value(write.old_value),
                new_value: compute_public_data_tree_value(write.new_value),
            };
        }
    }
    public_data_writes
}

pub fn assert_eq_public_data_reads<N, S>(
    public_data_reads: [PublicDataRead; N],
    expected: [PublicDataRead; S]
) {
    assert(
        struct_array_eq(
            public_data_reads,
            expected,
            |pdr1: PublicDataRead, pdr2: PublicDataRead| pdr1.eq(pdr2),
            |pdr: PublicDataRead| pdr.is_empty()
        )
    );
}

pub fn assert_eq_public_data_writes<N, S>(
    public_data_writes: [PublicDataWrite; N],
    expected: [PublicDataWrite; S]
) {
    assert(
        struct_array_eq(
            public_data_writes,
            expected,
            |r1: PublicDataWrite, r2: PublicDataWrite| r1.eq(r2),
            |r: PublicDataWrite| r.is_empty()
        )
    );
}

pub fn assert_eq_new_contracts<N, S>(
    new_contracts: [NewContractData; N],
    expected: [NewContractData; S]
) {
    assert(
        struct_array_eq(
            new_contracts,
            expected,
            |c1: NewContractData, c2: NewContractData| c1.eq(c2),
            |c: NewContractData| c.is_empty()
        )
    );
}
