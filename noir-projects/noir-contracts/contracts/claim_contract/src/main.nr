use dep::aztec::macros::aztec;

#[aztec]
contract Claim {
    use dep::aztec::{
        macros::{functions::{initializer, private, public}, storage::storage},
        note::utils::compute_note_hash_for_nullify,
        protocol_types::address::AztecAddress,
        state_vars::PublicImmutable,
    };
    use dep::value_note::value_note::ValueNote;
    use token::Token;

    #[storage]
    struct Storage<Context> {
        // Address of a contract based on whose notes we distribute the rewards
        target_contract: PublicImmutable<AztecAddress, Context>,
        // Token to be distributed as a reward when claiming
        reward_token: PublicImmutable<AztecAddress, Context>,
    }

    #[public]
    #[initializer]
    fn constructor(target_contract: AztecAddress, reward_token: AztecAddress) {
        storage.target_contract.initialize(target_contract);
        storage.reward_token.initialize(reward_token);
    }

    #[private]
    fn claim(proof_note: ValueNote, recipient: AztecAddress) {
        // 1) Check that the note corresponds to the target contract and belongs to the sender
        let target_address = storage.target_contract.read();
        assert(
            target_address == proof_note.header.contract_address,
            "Note does not correspond to the target contract",
        );

        // 2) Prove that the note hash exists in the note hash tree
        let header = context.get_block_header();
        header.prove_note_inclusion(proof_note);

        // 3) Compute and emit a nullifier which is unique to the note and this contract to ensure the reward can be
        // claimed only once with the given note.
        // Note: Only the owner of the npk_m will be able to produce the nsk_app and compute this nullifier.
        // The nullifier is unique to the note and THIS contract because the protocol siloes all nullifiers with
        // the address of a contract it was emitted from.
        // TODO(#7775): manually computing the hash and passing it to compute_nullifier func is not great as note could
        // handle it on its own or we could make prove_note_inclusion return note_hash_for_nullify.
        let note_hash_for_nullify = compute_note_hash_for_nullify(proof_note);
        let nullifier = proof_note.compute_nullifier(&mut context, note_hash_for_nullify);
        context.push_nullifier(nullifier);

        // 4) Finally we mint the reward token to the sender of the transaction
        Token::at(storage.reward_token.read()).mint_to_public(recipient, proof_note.value).enqueue(
            &mut context,
        );
    }
}
