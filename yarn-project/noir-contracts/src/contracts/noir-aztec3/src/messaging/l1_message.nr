
use crate::abi::Inputs;
use crate::types::point::Point;
use crate::messaging::messaging_getter_data::L1ToL2MessageGetterData;
use crate::messaging::messaging_getter_data::make_l1_to_l2_message_getter_data;

// TODO: Still need to check that the secret hash -> note hash
// this should be another pedersen generator ?
global L1_MESSAGE_LEN = 8;

global L1_MESSAGE_ORACLE_CALL_LENGTH = 18;

// Checks is a msg is within the l1Msg tree
#[oracle(getL1ToL2Message)]
fn get_l1_to_l2_msg_oracle(_msg_key: Field) -> [Field; L1_MESSAGE_ORACLE_CALL_LENGTH] {}

unconstrained fn get_l1_to_l2_message_call(msg_key: Field) -> [Field; L1_MESSAGE_ORACLE_CALL_LENGTH] {
    get_l1_to_l2_msg_oracle(msg_key)
}

fn get_l1_to_l2_message(inputs: Inputs, msg_key: Field) -> L1ToL2MessageGetterData {
    let returned_message = get_l1_to_l2_message_call(msg_key);
    let msg = make_l1_to_l2_message_getter_data(returned_message, 0);

    // Check tree roots against the inputs 
    constrain msg.root == inputs.old_l1_to_l2_messages_tree_root;
    msg
}

struct L1Message {
    sender: Field,
    recipient: Field,
    content_hash: Field,
    secret: Field,
    secret_hash: Field,
    deadline: u32,
    fee: u64
}

impl L1Message {
    fn dummy() -> L1Message {
        L1Message {
            sender: 0,
            recipient: 0,
            content_hash: 0,
            secret: 0,
            secret_hash: 0,
            deadline: 0 as u32,
            fee: 0 as u64
        }
    }

    fn deserialize(
        fields: [Field; L1_MESSAGE_LEN]
    ) -> L1Message {
        L1Message {
            sender: fields[0],
            recipient: fields[1],
            content_hash: fields[2],
            secret: fields[3],
            secret_hash: fields[4],
            deadline: fields[5] as u32,
            fee: fields[6] as u64
        }
    }

    fn compute_msg_hash(_self: Self) -> Field {
        // Todo a sha256 hash of the message
        0
    }

    fn validate_message_secret(self, secret: Field) -> bool {
        // TODO: update generator
        let recomputed_hash = dep::std::hash::pedersen([crate::L1ToL2MessageSecret, secret])[0];
        self.secret_hash == recomputed_hash
    }

    // The nullifier of a l1 message is the hash of the message salted with the secret hash
    fn compute_nullifier(self) -> Field {
        let msg_hash = self.compute_msg_hash();

        dep::std::hash::pedersen([crate::Nullifier, msg_hash, self.secret_hash])[0]
    }
}
