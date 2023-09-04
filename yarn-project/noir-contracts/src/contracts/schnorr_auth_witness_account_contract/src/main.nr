mod util;
mod auth_oracle;

contract SchnorrAuthWitnessAccount {
    use dep::std::hash::pedersen_with_separator;
    use dep::aztec::entrypoint::EntrypointPayload;
    use dep::aztec::constants_gen::GENERATOR_INDEX__SIGNATURE_PAYLOAD;
    use crate::util::recover_address;
    use crate::auth_oracle::get_auth_witness;

    #[aztec(private)]
    fn constructor() {}

    #[aztec(private)]
    fn entrypoint(
        payload: pub EntrypointPayload,
    ) {
        let message_hash: Field = pedersen_with_separator(
          payload.serialize(), 
          GENERATOR_INDEX__SIGNATURE_PAYLOAD
        )[0];
        let witness = get_auth_witness(message_hash);
        assert(recover_address(message_hash, witness) == context.this_address());
        payload.execute_calls(&mut context);
    }

    // keccak256("is_valid(field)") >> 224 -> 0x29d25ca9
    #[aztec(private)]
    fn is_valid(
        message_hash: Field
    ) -> Field {
        let witness = get_auth_witness(message_hash);
        assert(recover_address(message_hash, witness) == context.this_address());
        0x29d25ca9
    }
}