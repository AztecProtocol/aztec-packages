use crate::abis::read_request_membership_witness::ReadRequestMembershipWitness;
use crate::tests::fixtures;
use dep::aztec::{
    constants_gen::{
        MAX_READ_REQUESTS_PER_CALL,
        NOTE_HASH_TREE_HEIGHT,
    },
};

pub fn generate_read_requests(how_many: u64) -> ([Field; MAX_READ_REQUESTS_PER_CALL], [ReadRequestMembershipWitness<NOTE_HASH_TREE_HEIGHT>; MAX_READ_REQUESTS_PER_CALL]) {
    let mut read_requests = [0; MAX_READ_REQUESTS_PER_CALL];
    let mut read_request_membership_witnesses: [ReadRequestMembershipWitness<NOTE_HASH_TREE_HEIGHT>; MAX_READ_REQUESTS_PER_CALL] = dep::std::unsafe::zeroed();

    for i in 0..how_many {
        read_requests[i] = (i as Field) + 1;
        let witness = ReadRequestMembershipWitness {
            leaf_index: i as Field,
            sibling_path: fixtures::note_hash_tree::SIBLING_PATHS[i],
            is_transient: false,
            hint_to_commitment: 0,
        };
        read_request_membership_witnesses[i] = witness;
    }

    (read_requests, read_request_membership_witnesses)
}