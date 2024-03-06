contract Claim {
    mod interfaces;

    use dep::aztec::{
        history::note_inclusion::prove_note_inclusion,
        protocol_types::{
            abis::function_selector::FunctionSelector,
            address::AztecAddress,
        },
        state_vars::SharedImmutable,
    };
    use dep::value_note::value_note::ValueNote;
    use interfaces::Token;

    struct Storage {
      campaign_contract: SharedImmutable<AztecAddress>,
      reward_token: SharedImmutable<AztecAddress>,
    }

    #[aztec(private)]
    fn constructor(campaign_contract: AztecAddress, reward_token: AztecAddress) {
        let selector = FunctionSelector::from_signature("_initialize((Field),(Field))");
        context.call_public_function(
            context.this_address(),
            selector,
            [campaign_contract.to_field(), reward_token.to_field()]
        );
    }

    #[aztec(public)]
    #[aztec(internal)]
    #[aztec(noinitcheck)]
    fn _initialize(campaign_contract: AztecAddress, reward_token: AztecAddress) {
        storage.campaign_contract.initialize(campaign_contract);
        storage.reward_token.initialize(reward_token);
    }

    #[aztec(private)]
    fn claim(proof_note: ValueNote) {
        // First we check that the note corresponds to the campaign contract
        let campaign_address = storage.campaign_contract.read_private();
        assert(campaign_address == proof_note.header.contract_address, "Note does not correspond to the campaign contract");

        // Now we prove that the note hash exists in the note hash tree
        prove_note_inclusion(proof_note, context);

        // Now we compute a nullifier which is unique to the note and this contract and we emit it to ensure the reward
        // can be claimed only once with the given note.
        // Note: The nullifier is unique to the note and THIS contract because the protocol siloes all nullifiers with
        // the address of a contract it was emitted from.
        context.push_new_nullifier(proof_note.compute_nullifier(&mut context), 0);

        // Finally we mint the reward token to the sender of the transaction
        let reward_token = Token::at(storage.reward_token.read_private());
        reward_token.mint_public(&mut context, context.msg_sender(), proof_note.value);
    }
}
