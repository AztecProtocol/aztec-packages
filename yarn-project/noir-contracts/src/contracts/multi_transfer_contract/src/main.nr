// Demonstrates how to perform 4 x 4 = 16 transfers in one transaction. Uses the private airdrop contract in the backend.
contract MultiTransfer {
    use dep::aztec::abi;
    use dep::aztec::abi::PrivateContextInputs;
    use dep::aztec::abi::PublicContextInputs;
    use dep::aztec::context::Context;
    use dep::aztec::oracle::public_call;
    use dep::aztec::private_call_stack_item::PrivateCallStackItem;
    use dep::aztec::public_call_stack_item::PublicCallStackItem;
    use dep::aztec::types::point::Point;

    // Libs
    use dep::value_note::{
        value_note::{VALUE_NOTE_LEN, ValueNoteMethods},
    };
    use dep::aztec::note::{
        note_header::NoteHeader,
        utils as note_utils,
    };

    fn constructor(
        inputs: PrivateContextInputs
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        Context::new(inputs, 0).finish()
    }

    // Transfers 12 amounts to 12 recipients.
    // multiTransfer() => 4 calls to batchTransfer() on the private airdrop contract.
    // Each batchTransfer() call allows sending new notes to 3 recipients, so 3 x 4 = 12 recipients in total.
    // Note that all the notes stay on the airdrop contract, the multi transfer contract must interact with 
    // methods in the private airdrop contract to initiate multiple transfers in one transaction. 
    fn multiTransfer(
        inputs: PrivateContextInputs,
        asset: Field, // Asset to distribute
        addresses: [Field; 12], // Addresses to distribute to
        amounts: [Field; 12], // Amounts to distribute
        owner: Field, // Owner of the asset
        batch_transfer_selector: Field, // Function selector for transfer
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let mut context = Context::new(inputs, abi::hash_args([
            asset, 
            addresses[0], 
            addresses[1], 
            addresses[2], 
            addresses[3],
            addresses[4],
            addresses[5],
            addresses[6], 
            addresses[7], 
            addresses[8], 
            addresses[9],
            addresses[10],
            addresses[11],
            amounts[0], 
            amounts[1], 
            amounts[2], 
            amounts[3],
            amounts[4],
            amounts[5],
            amounts[6], 
            amounts[7], 
            amounts[8], 
            amounts[9],
            amounts[10],
            amounts[11],
            owner,
            batch_transfer_selector
        ]));

        // First batch transfer call
        let return_values_1 = context.call_private_function(asset, batch_transfer_selector, [
            owner, 
            amounts[0],
            amounts[1],
            amounts[2],
            addresses[0],
            addresses[1],
            addresses[2],
            0 as Field,
            0 as Field,
        ]);
        let result1 = return_values_1[0];
        context.return_values.push(result1);

        // Second batch transfer call
        let return_values_2 = context.call_private_function(asset, batch_transfer_selector, [
            owner, 
            amounts[3],
            amounts[4],
            amounts[5],
            addresses[3],
            addresses[4],
            addresses[5],
            0 as Field,
            0 as Field,
        ]);
        let result2 = return_values_2[0];
        context.return_values.push(result2);

        // Third batch transfer call
        let return_values_3 = context.call_private_function(asset, batch_transfer_selector, [
            owner, 
            amounts[6],
            amounts[7],
            amounts[8],
            addresses[6],
            addresses[7],
            addresses[8],
            0 as Field,
            0 as Field,
        ]);
        let result3 = return_values_3[0];
        context.return_values.push(result3);

        // Fourth batch transfer call
        let return_values_4 = context.call_private_function(asset, batch_transfer_selector, [
            owner, 
            amounts[9],
            amounts[10],
            amounts[11],
            addresses[9],
            addresses[10],
            addresses[11],
            0 as Field,
            0 as Field,
        ]);
        let result4 = return_values_4[0];
        context.return_values.push(result4);

        context.finish()
    }

    // Computes note hash and nullifier.
    // Note 1: Needs to be defined by every contract producing logs.
    // Note 2: Having it in all the contracts gives us the ability to compute the note hash and nullifier differently for different kind of notes.
    unconstrained fn compute_note_hash_and_nullifier(contract_address: Field, nonce: Field, storage_slot: Field, preimage: [Field; VALUE_NOTE_LEN]) -> [Field; 4] {
        let note_header = NoteHeader { contract_address, nonce, storage_slot };
        note_utils::compute_note_hash_and_nullifier(ValueNoteMethods, note_header, preimage)
    }
}