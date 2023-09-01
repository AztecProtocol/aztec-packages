mod util;
mod eip_oracle;

// Account contract that uses Schnorr signatures for authentication. The signing key is the same as the
// encryption key, and as such is not stored in the contract but part of the address preimage, so it can
// be verified by passing in the partial address.
contract SchnorrEip1271Account {
    use dep::std;
    use dep::aztec::entrypoint;
    use dep::aztec::entrypoint::EntrypointPayload;
    use dep::aztec::abi;
    use dep::aztec::abi::Hasher;
    use dep::aztec::abi::PrivateContextInputs;
    use dep::aztec::abi::CallContext;
    use dep::aztec::private_call_stack_item::PrivateCallStackItem;
    use dep::aztec::public_call_stack_item::PublicCallStackItem;
    use dep::aztec::context::PrivateContext;
    use dep::aztec::types::vec::BoundedVec;
    use dep::aztec::types::point::Point;
    use dep::aztec::constants_gen::GENERATOR_INDEX__CONTRACT_ADDRESS;
    use dep::aztec::constants_gen::GENERATOR_INDEX__SIGNATURE_PAYLOAD;

    use crate::util::validate_signature;
    use crate::eip_oracle::get_eip_1271_witness;

    // Constructs the contract
    #[aztec(private)]
    fn constructor() {}

    #[aztec(private)]
    fn entrypoint(
        payload: pub EntrypointPayload, // contains a set of arguments, selectors, targets and a nonce
        owner: pub [u8;64], // pubkey x and y coordinates concatenated
        signature: pub [u8;64], // schnorr signature of the payload hash
        partial_address: pub Field,
    ) {
        // How can I get the owner, signature and partial_address in here?

        // Verify payload signature
        let payload_fields: [Field; entrypoint::ENTRYPOINT_PAYLOAD_SIZE] = payload.serialize();
        let message_field: Field = std::hash::pedersen_with_separator(payload_fields, GENERATOR_INDEX__SIGNATURE_PAYLOAD)[0];
        // TODO workaround for https://github.com/noir-lang/noir/issues/2421
        let message_bytes_slice = message_field.to_be_bytes(32);
        let mut message_bytes: [u8; 32] = [0; 32];
        for i in 0..32 {
          message_bytes[i] = message_bytes_slice[i];
        }

        validate_signature(message_bytes, owner, signature, partial_address, context.this_address());

        // Execute calls
        payload.execute_calls(&mut context);
    }

    // keccak256("is_valid(field)") >> 224 -> 0x29d25ca9
    #[aztec(private)]
    fn is_valid(
        message_hash: Field
    ){
        let eip_witness = get_eip_1271_witness(message_hash);

        let message_bytes_slice = message_hash.to_be_bytes(32);
        let mut message_bytes: [u8; 32] = [0; 32];
        let mut owner_bytes: [u8; 64] = [0; 64];
        let mut signature: [u8; 64] = [0; 64];

        for i in 0..32 {
          message_bytes[i] = message_bytes_slice[i];
          owner_bytes[i] = eip_witness[i] as u8;
          signature[i] = eip_witness[i + 64] as u8;
        }

        for i in 32..64 {
          owner_bytes[i] = eip_witness[i] as u8;
          signature[i] = eip_witness[i + 64] as u8;
        }

        let partial_address = eip_witness[128];

        validate_signature(message_bytes, owner_bytes, signature, partial_address, context.this_address());

        // Need to split the witness into something useful in here - deserialise it.
        context.return_values.push(0x29d25ca9);
    }
}