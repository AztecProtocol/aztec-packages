fn get_next_tag(
    sender: AztecAddress,
    recipient: AztecAddress,
    hidden_sender: bool,
    context: &mut PrivateContext,
) -> Field {
    if !handshake_exists(sender, recipient, hidden_sender) {
        // The handshake doesn't exist, so we need to call the handshake function of the Handshaker contract.
        context.call_private_function(
            HANDSHAKER_CONTRACT_ADDRESS,
            FunctionSelector::from_signature("handshake((Field,bool))"),
            [sender.to_field(), recipient.to_field(), hidden_sender as Field],
        );
    }

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
        let (address_0, address_1) = sort_addresses(sender, recipient);

        let handshake_commitment_preimage = [
            "AZTEC_NR::HANDSHAKE_SEPARATOR",
            master_tagging_public_key.x,
            master_tagging_public_key.y,
            address_0,
            address_1,
        ];

        let app_tagging_secret = context.request_tsk(master_tagging_public_key.hash());
        let directional_app_tagging_secret = poseidon2_hash([app_tagging_secret, recipient]);

        (handshake_commitment_preimage, HANDSHAKER_CONTRACT_ADDRESS, directional_app_tagging_secret, 0)
    } else {
        // Get the app tagging secret and last index from oracle
        let (directional_app_tagging_secret, last_index) =
            get_last_tag_nullifier_preimage(sender, recipient, hidden_sender);
        let previous_tag_nullifier_preimage = [
            "AZTEC_NR::TAG_SEPARATOR",
            sender_nsk_app,
            recipient,
            directional_app_tagging_secret,
            last_index,
        ];

        (
            previous_tag_nullifier_preimage, context.this_address(), directional_app_tagging_secret,
            last_index + 1,
        )
    };

    let unsiloed_nullifier_to_prove = poseidon2_hash(unsiloed_nullifier_preimage);
    let nullifier_to_prove =
        compute_siloed_nullifier(app_to_silo_with, unsiloed_nullifier_to_prove);
    prove_nullifier_inclusion(nullifier_to_prove);

    let tag_nullifier = poseidon2_hash([
        "AZTEC_NR::TAG_SEPARATOR",
        sender_nsk_app,
        recipient,
        directional_app_tagging_secret,
        index,
    ]);
    context.push_nullifier(tag_nullifier);

    let tag = poseidon2_hash([directional_app_tagging_secret, index]);
    tag
}

pub fn sort_addresses(address_a: AztecAddress, address_b: AztecAddress) -> (AztecAddress, AztecAddress) {
    let (address_small, address_big) = sort_addresses_internal(address_a, address_b);
    assert(address_small.to_field() < address_big.to_field());
    assert(address_small.eq(address_a) | address_small.eq(address_b));
    assert(address_big.eq(address_a) | address_big.eq(address_b));
    (address_small, address_big)
}

unconstrained fn sort_addresses_internal(
    address_a: AztecAddress,
    address_b: AztecAddress,
) -> (AztecAddress, AztecAddress) {
    if address_a.to_field() < address_b.to_field() {
        (address_a, address_b)
    } else {
        (address_b, address_a)
    }
}
