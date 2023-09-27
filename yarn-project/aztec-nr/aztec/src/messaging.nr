mod l1_to_l2_message;
mod l1_to_l2_message_getter_data;

use l1_to_l2_message_getter_data::make_l1_to_l2_message_getter_data;

use crate::abi::PublicContextInputs;
use crate::oracle::get_l1_to_l2_message::get_l1_to_l2_message_call;


// Returns the nullifier for the message
fn process_l1_to_l2_message(l1_to_l2_root: Field, storage_contract_address: Field, msg_key: Field, content: Field, secret: Field) -> Field{

    // this is similar to get_note (gets from oracle, is unconstrained)
    let returned_message = get_l1_to_l2_message_call(msg_key);

    // nee
    let l1_to_l2_message_data = make_l1_to_l2_message_getter_data(returned_message, 0, secret);

    // THS SHOULD BE DONE IN KERNEL CIRCUIT - membership checks
    // Check tree roots against the inputs 
    assert(l1_to_l2_message_data.root == l1_to_l2_root);
    // DELETE ABOVE, move to kernel

    // Validate this is the target contract
    assert(l1_to_l2_message_data.message.recipient == storage_contract_address);

    // Validate the message hash is correct
    assert(l1_to_l2_message_data.message.content == content);

    // Validate the message secret is correct
    l1_to_l2_message_data.message.validate_message_secret();

    // Compute Nullifier
    l1_to_l2_message_data.message.compute_nullifier()

    // TODO: push the message key (msg_key) into the context array as well
}