use dep::std;

contract TouchIdAccount {
    mod base64;
    use base64::decode_base64;

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

    fn entrypoint(
        inputs: pub PrivateContextInputs,
        payload: pub EntrypointPayload, // contains a set of arguments, selectors, targets and a nonce
        owner: pub [u8;64], // x and y coordinates concatenated
        partial_contract_address: pub Field,
        signature: pub [u8;64],
        auth_data : [u8; 37], 
        client_data_json : [u8;134],
        challenge: [u8; 32],
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        // 339 = ENTRYPOINT_PAYLOAD_SIZE + 64 + 1 + 64 + 32 + 37 + 134
        let mut args: BoundedVec<Field, 339> = BoundedVec::new(0);
        args = args.push_array(payload.serialize());
        for byte in owner { args = args.push(byte as Field); }
        args = args.push(partial_contract_address);
        for byte in signature { args = args.push(byte as Field); }
        for byte in auth_data { args = args.push(byte as Field); }
        for byte in client_data_json { args = args.push(byte as Field); }
        for byte in challenge { args = args.push(byte as Field); }

        let mut context = Context::new(inputs, abi::hash_args(args.storage));

        // Build owner x and y pubkey
        let mut x: [u8; 32] = [0;32];
        let mut y: [u8; 32] = [0;32];
        for i in 0..32 {
          x[i] = owner[i];
          y[i] = owner[i + 32];
        }

        // Verify payload signature using ethereum's signing scheme
        let payload_bytes: [u8; entrypoint::ENTRYPOINT_PAYLOAD_SIZE_IN_BYTES] = payload.to_be_bytes();
        // let challenge: [u8; 32] = std::hash::sha256(payload_bytes);
        
        // TouchID verification logic
        let mut base64_challenge: [u8; 43] = [0;43];
        for i in 0..43 {
           base64_challenge[i] = client_data_json[i + 36];
        }
          
        let decoded_challenge = decode_base64(base64_challenge);
        assert(decoded_challenge == challenge);

        let client_data_hash = std::hash::sha256(client_data_json);
        let mut message: [u8; 69] = [0;69];
        for i in 0..37 {
             message[i] = auth_data[i];
        }
        for i in 0..32 {
             message[i+37] = client_data_hash[i];
        }

        let message_hash = std::hash::sha256(message);
        let valid_signature = std::ecdsa_secp256r1::verify_signature(x, y, signature, message_hash);
        assert(valid_signature);

        // TODO: When we can use pedersen with non-zero generators, get this working        
        //let reproduced_address = dep::std::hash::pedersen([owner, partial_contract_address])[0];
        //constrain reproduced_address == inputs.call_context.storage_contract_address;

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

    fn constructor(
        inputs: PrivateContextInputs,
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        // Return private circuit public inputs. All private functions need to return this as it is part of the input of the private kernel.
        Context::new(inputs, 0).finish()
    }
}


// fn check_touchid_signature(challenge : [u8; 32], auth_data : [u8; 37], client_data_json : [u8;134], pub_key_x : [u8;32], pub_key_y : [u8;32], signature : [u8;64]) {
//      let mut base64_challenge: [u8; 43] = [0;43];
//      for i in 0..43 {
//           base64_challenge[i] = client_data_json[i + 36];
//      }
//      // std::println(base64_challenge);
//      let decoded_challenge = decode_base64(base64_challenge);
//      // std::println(decoded_challenge);
//      assert(decoded_challenge == challenge);

//      let client_data_hash = std::hash::sha256(client_data_json);
//      let mut message: [u8; 69] = [0;69];
//      for i in 0..37 {
//           message[i] = auth_data[i];
//      }
//      for i in 0..32 {
//           message[i+37] = client_data_hash[i];
//      }
//      let message_hash = std::hash::sha256(message);
//      let valid_signature = std::ecdsa_secp256r1::verify_signature(pub_key_x, pub_key_y, signature, message_hash);
//      assert(valid_signature);
// }