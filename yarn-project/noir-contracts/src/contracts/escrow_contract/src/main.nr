mod address_note;
mod storage;

// Sample escrow contract that stores a balance of a private token on behalf of an owner.
contract Escrow {
    use dep::std;
    use dep::aztec::abi;
    use dep::aztec::abi::PrivateContextInputs;
    use dep::aztec::abi::CallContext;
    use dep::aztec::private_call_stack_item::PrivateCallStackItem;
    use dep::aztec::context::Context;

    use crate::address_note::AddressNote;
    use crate::storage::Storage;

    // Creates a new instance
    fn constructor(
        inputs: pub PrivateContextInputs,
        owner: pub Field
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let mut context = Context::new(inputs, abi::hash_args([owner]));
        let this = inputs.call_context.storage_contract_address;
        
        let storage = Storage::init();
        context = storage.owners.insert(context, AddressNote::new(owner, this));

        context.finish()
    }

    // Withdraws balance. Requires that msg.sender is registered as an owner.
    fn withdraw(
        inputs: pub PrivateContextInputs,
        token: pub Field,
        amount: pub Field,
        recipient: pub Field,
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let mut context = Context::new(inputs, abi::hash_args([token, amount, recipient]));
        let this = inputs.call_context.storage_contract_address;
        let sender = inputs.call_context.msg_sender;
        let storage = Storage::init();
        
        // TODO: Do we need to manually nullify and recreate this note for access control? Or does Set handle it for us?
        // TODO: Enable this check, we're getting "mismatch array length between read_requests and witnesses - read_requests length: 1 witnesses length: 0"
        // context = storage.owners.has(context, AddressNote::new(sender, this));
        
        // TODO: Can we dynamically get this selector?
        let transfer_selector = 0xdcd4c318;
        let (_callStackItem, context_1) = PrivateCallStackItem::call(token, transfer_selector, [amount, this, recipient], context);
        context = context_1;

        context.finish()
    }    
}
