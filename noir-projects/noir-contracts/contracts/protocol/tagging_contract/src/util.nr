fn get_next_tag(sender: AztecAddress, recipient: AztecAddress, hidden_sender: bool, context: &mut PrivateContext) -> Field {
    // Get master tagging public key and check if handshake exists
    let master_tagging_public_key = get_master_tagging_public_key(sender, recipient, hidden_sender);

    // Get sender nsk_app
    let sender_npk_m = get_public_keys(sender).npk_m;
    let sender_npk_m_hash = sender_npk_m.hash();
    let sender_nsk_app = context.request_nsk_app(sender_npk_m_hash);

    // TODO: How to determine first_time_tagging?
    let [nullifier_to_prove, directional_app_tagging_secret, index] = if first_time_tagging {
        // Sort addresses for consistent handshake commitment
        let [address_0, address_1] = unsafe { sort_addresses(sender, recipient) };
        assert(address_0.to_field() < address_1.to_field());
        
        // Compute and verify handshake commitment exists
        let handshake_commitment = poseidon2_hash(["AZTEC_NR::HANDSHAKE_SEPARATOR", master_tagging_public_key.x, master_tagging_public_key.y, address_0, address_1]);
        let nullifier_to_prove = compute_siloed_nullifier(TAGGING_CONTRACT_ADDRESS, handshake_commitment);

        let app_tagging_secret = context.request_tsk(master_tagging_public_key.hash());
        let directional_app_tagging_secret = poseidon2_hash([app_tagging_secret, recipient]);
        [nullifier_to_prove, directional_app_tagging_secret, 0]

    } else {
        // Get the app tagging secret and index from oracle
        let [directional_app_tagging_secret, index] = get_tag_nullifier_preimage(sender, recipient, hidden_sender);
        let previous_tag_nullifier = poseidon2_hash(["AZTEC_NR::TAG_SEPARATOR", sender_nsk_app, recipient, directional_app_tagging_secret, index]);
        let nullifier_to_prove = compute_siloed_nullifier(context.this_address(), previous_tag_nullifier);

        [nullifier_to_prove, directional_app_tagging_secret, index + 1]
    }

    prove_nullifier_inclusion(nullifier_to_prove);

    let tag = poseidon2_hash([directional_app_tagging_secret, index]);

    let tag_nullifier = poseidon2_hash(["AZTEC_NR::TAG_SEPARATOR", sender_nsk_app, recipient, directional_app_tagging_secret, index]);
    context.push_nullifier(tag_nullifier);
        
    tag
}

unconstrained fn sort_addresses(sender: AztecAddress, recipient: AztecAddress) -> [AztecAddress; 2] {
    if sender.to_field() > recipient.to_field() {
        [sender, recipient]
    } else {
        [recipient, sender]
    }
}
