fn get_next_tag(sender: AztecAddress, recipient: AztecAddress, hidden_sender: bool, context: &mut PrivateContext) -> Field {
    let master_tagging_public_key = get_master_tagging_public_key(sender, recipient, hidden_sender);

    let sender_npk_m = get_public_keys(sender).npk_m;
    let sender_nsk_app = context.request_nsk_app(sender_npk_m.hash());

    // We call the is_first_time_tagging oracle function to determine if this is the first time tagging
    // for [sender, recipient, hidden_sender] inputs. The function computes the tag nullifier with index
    // 0 and checks if it exists in the nullifier tree.
    let first_time_tagging: bool = is_first_time_tagging(sender, recipient, hidden_sender);

    let (unsiloed_nullifier_preimage, app_to_silo_with, directional_app_tagging_secret, index) = if first_time_tagging {
        // Sort addresses to reliably get bi-directional handshake commitment. We do that in an unconstrained function
        // and then we constrain the result to optimize constraints.
        let [address_0, address_1] = unsafe { sort_addresses(sender, recipient) };
        assert(address_0.to_field() < address_1.to_field());
        assert(address_0.eq(sender) | address_0.eq(recipient));
        assert(address_1.eq(sender) | address_1.eq(recipient));
        
        let handshake_commitment_preimage = ["AZTEC_NR::HANDSHAKE_SEPARATOR", master_tagging_public_key.x, master_tagging_public_key.y, address_0, address_1];

        let app_tagging_secret = context.request_tsk(master_tagging_public_key.hash());
        let directional_app_tagging_secret = poseidon2_hash([app_tagging_secret, recipient]);

        (handshake_commitment_preimage, TAGGING_CONTRACT_ADDRESS, directional_app_tagging_secret, 0)

    } else {
        // Get the app tagging secret and last index from oracle
        let [directional_app_tagging_secret, last_index] = get_last_tag_nullifier_preimage(sender, recipient, hidden_sender);
        let previous_tag_nullifier_preimage = ["AZTEC_NR::TAG_SEPARATOR", sender_nsk_app, recipient, directional_app_tagging_secret, last_index];

        (previous_tag_nullifier_preimage, context.this_address(), directional_app_tagging_secret, last_index + 1)
    }

    let unsiloed_nullifier_to_prove = poseidon2_hash(unsiloed_nullifier_preimage);
    let nullifier_to_prove = compute_siloed_nullifier(app_to_silo_with, unsiloed_nullifier_to_prove);
    prove_nullifier_inclusion(nullifier_to_prove);

    let tag_nullifier = poseidon2_hash(["AZTEC_NR::TAG_SEPARATOR", sender_nsk_app, recipient, directional_app_tagging_secret, index]);
    context.push_nullifier(tag_nullifier);
        
    let tag = poseidon2_hash([directional_app_tagging_secret, index]);
    tag
}

unconstrained fn sort_addresses(sender: AztecAddress, recipient: AztecAddress) -> [AztecAddress; 2] {
    if sender.to_field() > recipient.to_field() {
        [sender, recipient]
    } else {
        [recipient, sender]
    }
}
