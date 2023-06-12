use dep::std::hash::pedersen;

contract PublicPrivate {
    use dep::aztec3::abi::PrivateContextInputs;
    use dep::aztec3::context::PrivateFunctionContext;
    use dep::aztec3::abi::PublicContextInputs;
    use dep::aztec3::types::point::Point;
    use dep::aztec3::state_vars::storage_map::StorageMap;
    use dep::aztec3::state_vars::storage_field::StorageField;

    use dep::aztec3::oracle::create_commitment::create_commitment;
    use dep::aztec3::oracle::create_l2_to_l1_message::create_l2_to_l1_message;

    use crate::TransparentNote;

    global balances = StorageMap { storage_slot: 1 };

    fn constructor(
        inputs: pub PrivateContextInputs,
    ) -> pub [Field; dep::aztec3::abi::PUBLIC_INPUTS_LENGTH] {
        PrivateFunctionContext::new().finish(inputs)
    }


    open fn mintFromPublicToPrivate(
        _inputs: PublicContextInputs,
        amount: Field,
        secretHash: Field,
        _padding: [Field; dep::aztec3::abi::MAX_ARGS - 3]
    ) -> pub Field {
    
        // Create a commitment to the amount
        let note = TransparentNote::new(amount, secretHash);
        
        // Public oracle call to emit new commitment.
        create_commitment(note.get_commitment());
        0
    }

    open fn createL2ToL1MessagePublic(
        _inputs: PublicContextInputs,
        amount: Field,
        secretHash: Field,
        _padding: [Field; dep::aztec3::abi::MAX_ARGS - 3]
    ) -> pub Field {
    
        // Create a commitment to the amount
        let note = TransparentNote::new(amount, secretHash);
        
        // Public oracle call to emit new commitment.
        create_l2_to_l1_message(note.get_commitment());
        0
    }


    // open fn transfer(
    //     inputs: PublicContextInputs,
    //     amount: Field,
    //     recipient: Point,
    //     _padding: [Field; dep::aztec3::abi::MAX_ARGS - 3]
    // ) -> pub Field {
    //     let sender = inputs.call_context.msg_sender;
        
    //     let sender_balance = balances.at(sender);
    //     let recipient_balance = balances.at(recipient.x);

    //     let current_sender_balance = sender_balance.read();
    //     let current_recipient_balance = recipient_balance.read();

    //     // TODO: Handle larger integer values ("long integers are not yet supported")
    //     if (current_sender_balance as u120) > (amount as u120) {
    //         // TODO: Compiler complains if we don't assign the result of the write to anything
    //         let _void1 = sender_balance.write(current_sender_balance - amount);
    //         recipient_balance.write(current_recipient_balance + amount)
    //     } else {
    //         // TODO: Revert if there is not enough balance
    //         current_recipient_balance
    //     }
    // }

}


struct TransparentNote {
    amount: Field,
    secretHash: Field,
}

impl TransparentNote {
    fn new(amount: Field, secretHash: Field) -> Self {
        Self { amount, secretHash }
    }

    // fn new_from_secret(amount: Field, secret: Field) -> Self {

    // }

    fn get_commitment(self) -> Field {
        pedersen([self.amount, self.secretHash])[0]
    }

    fn knows_secret(self, secret: Field) {
        let hash = pedersen([secret])[0];
        constrain self.secretHash == hash;
    }

}