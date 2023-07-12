mod storage;
mod ecdsa_public_key_note;

// Since we support account abstraction user accounts are represented by a contract. This contract is one such example
// where the user is authenticated with an ECDSA signature.
contract EcdsaAccount {
    use dep::std;
    use dep::aztec::entrypoint;
    use dep::aztec::entrypoint::EntrypointPayload;
    use dep::aztec::abi;
    use dep::aztec::abi::PrivateContextInputs;
    use dep::aztec::abi::CallContext;
    use dep::aztec::private_call_stack_item::PrivateCallStackItem;
    use dep::aztec::public_call_stack_item::PublicCallStackItem;
    use dep::aztec::context::Context;
    use dep::aztec::types::vec::BoundedVec;
    use dep::aztec::types::point::Point;

    use crate::storage::Storage;
    use crate::ecdsa_public_key_note::EcdsaPublicKeyNote;

    // All calls made by this account will be routed through this entrypoint
    fn entrypoint(  
        inputs: pub PrivateContextInputs,
        payload: pub EntrypointPayload, // contains a set of arguments, selectors, targets and a nonce
        signature: pub [u8;64],
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        
        // Initialise context
        // 71 = ENTRYPOINT_PAYLOAD_SIZE(7) + 64
        let mut args: BoundedVec<Field, 71> = BoundedVec::new(0);
        args = args.push_array(payload.serialize());
        for byte in signature { args = args.push(byte as Field); }
        let mut context = Context::new(inputs, abi::hash_args(args.storage));

        // Load public key from storage
        let storage = Storage::init();
        let (context_1, public_key) = storage.public_key.get_note(context);
        context = context_1;

        // Verify payload signature using Ethereum's signing scheme
        let payload_bytes: [u8; entrypoint::ENTRYPOINT_PAYLOAD_SIZE_IN_BYTES] = payload.to_be_bytes();
        let challenge: [u8; 32] = std::hash::sha256(payload_bytes);
        let verification = std::ecdsa_secp256k1::verify_signature(public_key.x, public_key.y, signature, challenge);
        assert(verification == true);

        // Call private functions
        for i in 0..entrypoint::ACCOUNT_MAX_PRIVATE_CALLS {
            let target_address = payload.flattened_targets[i];
            if target_address != 0 {
                let function_selector = payload.flattened_selectors[i];
                let args_hash = payload.flattened_args_hashes[i];
                let (_callStackItem, updated_context) = PrivateCallStackItem::call_with_packed_args(target_address, function_selector, args_hash, context);
                context = updated_context;
            }
        }

        // Call public functions
        for i in entrypoint::ACCOUNT_MAX_PRIVATE_CALLS..entrypoint::ACCOUNT_MAX_CALLS {
            let target_address = payload.flattened_targets[i];
            if target_address != 0 {
                let function_selector = payload.flattened_selectors[i];
                let args_hash = payload.flattened_args_hashes[i];
                let (_callStackItem, updated_context) = PublicCallStackItem::call_with_packed_args(target_address, function_selector, args_hash, context);
                context = updated_context;
            }
        }

        context.finish()
    }

    // Creates a new account out of an ECDSA public key to use for signature verification
    fn constructor(
        inputs: pub PrivateContextInputs,
        signing_pub_key_x: pub [u8;32],
        signing_pub_key_y: pub [u8;32],
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let storage = Storage::init();
        
        let mut args: BoundedVec<Field, 64> = BoundedVec::new(0);
        for byte in signing_pub_key_x { args = args.push(byte as Field); }
        for byte in signing_pub_key_y { args = args.push(byte as Field); }
        let mut context = Context::new(inputs, abi::hash_args(args.storage));
        
        let pub_key_note = EcdsaPublicKeyNote::new(signing_pub_key_x, signing_pub_key_y, inputs.call_context.storage_contract_address);
        context = storage.public_key.initialise(context, pub_key_note);
        
        context.finish()
    }
}
