use crate::hash::{compute_public_data_tree_index, compute_public_data_tree_value};
use dep::types::{
    abis::{
        public_data_read::PublicDataRead,
        public_data_update_request::PublicDataUpdateRequest,
    },
    address::Address,
    contrakt::{
        storage_read::StorageRead,
        storage_update_request::StorageUpdateRequest,
    },
};

pub fn compute_public_data_reads<N>(contract_address: Address, read_requests: [StorageRead; N]) -> [PublicDataRead; N] {
    let mut public_data_reads = [PublicDataRead::empty(); N];
    for i in 0..N {
        let read_request = read_requests[i];
        if !read_request.is_empty() {
            public_data_reads[i] = PublicDataRead {
                leaf_index: compute_public_data_tree_index(contract_address, read_request.storage_slot),
                value: compute_public_data_tree_value(read_request.current_value),
            };
        }
    }
    public_data_reads
}

pub fn compute_public_data_update_requests<N>(
    contract_address: Address,
    update_requests: [StorageUpdateRequest; N],
) -> [PublicDataUpdateRequest; N] {
    let mut public_data_update_requests = [PublicDataUpdateRequest::empty(); N];
    for i in 0..N {
        let update_request = update_requests[i];
        if !update_request.is_empty() {
            public_data_update_requests[i] = PublicDataUpdateRequest {
                leaf_index: compute_public_data_tree_index(contract_address, update_request.storage_slot),
                old_value: compute_public_data_tree_value(update_request.old_value),
                new_value: compute_public_data_tree_value(update_request.new_value),
            };
        }
    }
    public_data_update_requests
}