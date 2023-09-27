mod l1_to_l2_message;

use crate::messaging::l1_to_l2_message::L1ToL2Message;

use crate::constants_gen::{
    L1_TO_L2_MSG_TREE_HEIGHT,
    L1_TO_L2_MESSAGE_LENGTH,
};
use crate::abi::PublicContextInputs;
use crate::oracle::get_l1_to_l2_message::get_l1_to_l2_message_call;
use crate::utils::arr_copy_slice;


// Returns the nullifier for the message
fn process_l1_to_l2_message(storage_contract_address: Field, msg_key: Field, content: Field, secret: Field) -> Field{

    // this is similar to get_note (gets from oracle, is unconstrained)
    let returned_message = get_l1_to_l2_message_call(msg_key);

    let l1_to_l2_message_data = L1ToL2Message::deserialize(arr_copy_slice(returned_message, [0; L1_TO_L2_MESSAGE_LENGTH], 0), secret, returned_message[L1_TO_L2_MESSAGE_LENGTH]);

    // Validate this is the target contract
    assert(l1_to_l2_message_data.recipient == storage_contract_address);

    // Validate the message hash is correct
    assert(l1_to_l2_message_data.content == content);

    // Validate the message secret is correct
    l1_to_l2_message_data.validate_message_secret();

    // Compute Nullifier
    l1_to_l2_message_data.compute_nullifier()

    // TODO: push the message key (msg_key) into the context array as well
}
