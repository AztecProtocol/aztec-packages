
use crate::abi::Inputs;
use crate::types::point::Point;
use crate::messaging::messaging_getter_data::L1ToL2MessageGetterData;
use crate::messaging::messaging_getter_data::make_l1_to_l2_message_getter_data;
use crate::context::PrivateFunctionContext;

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

fn get_l1_to_l2_message(inputs: Inputs, msg_key: Field, secret: Field) -> L1ToL2MessageGetterData {
    let returned_message = get_l1_to_l2_message_call(msg_key);
    let l1_to_l2_message_data = make_l1_to_l2_message_getter_data(returned_message, 0, secret);

    // Check tree roots against the inputs 
    constrain l1_to_l2_message_data.root == inputs.old_l1_to_l2_messages_tree_root;

    // Validate the message secret is correct
    l1_to_l2_message_data.message.validate_message_secret();

    // Validate this is the target contract
    // TODO: this doesnt seem right in the delegate call context
    constrain l1_to_l2_message_data.message.recipient == inputs.call_context.storage_contract_address;
    
    l1_to_l2_message_data
}


// Notify note so data can be logged
#[oracle(emitData)]
fn emit_data_oracle(_msg_key: Field) -> Field {}

unconstrained fn emit_data(msg_key: Field) -> Field {
    emit_data_oracle(msg_key)
}


struct L1Message {
    sender: Field,
    chainId: Field,
    recipient: Field,
    version: Field,
    content_hash: Field,
    secret: Field,
    secret_hash: Field,
    deadline: u32,
    fee: u64,
    tree_index: Field
}

impl L1Message {
    fn dummy() -> L1Message {
        L1Message {
            sender: 0,
            chainId: 0,
            recipient: 0,
            version: 0,
            content_hash: 0,
            secret: 0,
            secret_hash: 0,
            deadline: 0 as u32,
            fee: 0 as u64,
            tree_index: 0
        }
    }

    fn deserialize(
        fields: [Field; L1_MESSAGE_LEN],
        secret: Field,
        tree_index: Field
    ) -> L1Message {

        L1Message {
            sender: fields[0],
            chainId: fields[1],
            recipient: fields[2],
            version: fields[3],
            content_hash: fields[4],
            secret: secret,
            secret_hash: fields[5],
            deadline: fields[6] as u32,
            fee: fields[7] as u64,
            tree_index: tree_index
        }
    }

    fn compute_msg_hash(_self: Self) -> Field {
        // Todo a sha256 hash of the message
        0
    }

    fn validate_message_secret(self: Self) {
        let recomputed_hash = dep::std::hash::pedersen([crate::L1ToL2MessageSecret, self.secret])[0];
        constrain self.secret_hash == recomputed_hash;
    }

    // The nullifier of a l1 message is the hash of the message salted with the secret and tree index
    fn compute_nullifier(self: Self) -> Field {
        let msg_hash = self.compute_msg_hash();

        dep::std::hash::pedersen([crate::Nullifier, msg_hash, self.secret, self.tree_index])[0]
    }

    fn consume(self, mut context: PrivateFunctionContext) -> PrivateFunctionContext {
        let nullifier = self.compute_nullifier();
        context.push_new_nullifier(nullifier)
    }
}
