use crate::{
    hash::{compute_l1_to_l2_message_hash, compute_l1_to_l2_message_nullifier, compute_secret_hash},
    oracle::get_l1_to_l2_membership_witness::get_l1_to_l2_membership_witness,
};

use dep::protocol_types::{
    address::{AztecAddress, EthAddress},
    merkle_tree::root::root_from_sibling_path,
};

pub fn process_l1_to_l2_message(
    l1_to_l2_root: Field,
    contract_address: AztecAddress,
    portal_contract_address: EthAddress,
    chain_id: Field,
    version: Field,
    content: Field,
    secret: Field,
    leaf_index: Field,
) -> Field {
    let secret_hash = compute_secret_hash(secret);
    let message_hash = compute_l1_to_l2_message_hash(
        portal_contract_address,
        chain_id,
        contract_address,
        version,
        content,
        secret_hash,
        leaf_index,
    );

    // We prove that `message_hash` is in the tree by showing the derivation of the tree root, using a merkle path we
    // get from an oracle.
    // Safety: The witness is only used as a "magical value" that makes the merkle proof below pass. Hence it's safe.
    let (_leaf_index, sibling_path) =
        unsafe { get_l1_to_l2_membership_witness(contract_address, message_hash, secret) };

    let root = root_from_sibling_path(message_hash, leaf_index, sibling_path);
    assert(root == l1_to_l2_root, "Message not in state");

    compute_l1_to_l2_message_nullifier(message_hash, secret)
}
