mod l1_to_l2_message;
mod l1_to_l2_message_getter_data;

use l1_to_l2_message_getter_data::make_l1_to_l2_message_getter_data;

use crate::oracle::get_l1_to_l2_message::get_l1_to_l2_message_call;
use crate::oracle::debug_log::debug_log_format;

use dep::std::merkle::compute_merkle_root;
use crate::messaging::l1_to_l2_message::L1ToL2Message;
use dep::protocol_types::{
    constants::{GENERATOR_INDEX__L1_TO_L2_MESSAGE_SECRET}, address::{AztecAddress, EthAddress},
    hash::{pedersen_hash}
};

// Returns the nullifier for the message
pub fn process_l1_to_l2_message(
    l1_to_l2_root: Field,
    storage_contract_address: AztecAddress,
    portal_contract_address: EthAddress,
    chain_id: Field,
    version: Field,
    content: Field,
    secret: Field
) -> Field {
    debug_log_format("Processing L1 to L2 message: root: {0}", [l1_to_l2_root]);
    let msg = L1ToL2Message::new(
        portal_contract_address,
        chain_id,
        storage_contract_address,
        version,
        content,
        secret
    );
    let entry_key = msg.hash();
    debug_log_format(
        "Entry key = H({0}, {1}, {2}, {3}, {4}, {5}) {6}",
        [
        portal_contract_address.to_field(),
        chain_id,
        storage_contract_address.to_field(),
        version,
        content,
        secret,
        entry_key
    ]
    );

    // TODO: Massively prune the returned values from the oracle.
    let returned_message = get_l1_to_l2_message_call(entry_key);
    let l1_to_l2_message_data = make_l1_to_l2_message_getter_data(returned_message, 0, secret);

    // Check that the message is in the tree
    // This is implicitly checking that the values of the message are correct
    let root = compute_merkle_root(
        entry_key,
        l1_to_l2_message_data.leaf_index,
        l1_to_l2_message_data.sibling_path
    );
    assert(root == l1_to_l2_root, "Message not in state");

    // Compute Nullifier
    l1_to_l2_message_data.message.compute_nullifier()
}
