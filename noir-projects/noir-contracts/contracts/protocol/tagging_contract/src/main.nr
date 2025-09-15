#[aztec]
contract HandshakingContract {
    #[private]
    fn handshake(recipient: AztecAddress, reveal_sender: bool) {
        let sender = if reveal_sender { context.msg_sender() } else { AztecAddress::zero() };

        let master_tagging_shared_secret = unsafe { random() };

        let recipient_message_plaintext = [sender, master_tagging_shared_secret];
        let recipient_message_ciphertext = encrypt(recipient_message_plaintext, recipient);

        // We send a message for the sender as well because we want this to be resistant against the "vicious Mike
        // throwing your laptop into the ocean" attack (I think we'll be able to remove this once we have proper PXE
        // backups)
        let sender_message_plaintext = [recipient, master_tagging_shared_secret];
        let sender_message_ciphertext = encrypt(sender_message_plaintext, sender);

        // We need to call this oracle function to add the handshake to sender's PXE because we need the handshaking
        // secret to be available in the same tx and not after the tx flies through the network.
        add_handshake(context.msg_sender(), recipient, master_tagging_shared_secret);

        // The final ciphertext is the concatenation of the recipient and sender ciphertexts.
        let message_ciphertext = array_concat(recipient_message_ciphertext, sender_message_ciphertext);

        // We compute and emit the handshake nullifier to be able to later on prove that we've handshaked with this recipient.
        let handshake_nullifier = poseidon2_hash(["AZTEC_NR::HANDSHAKE_SEPARATOR", master_tagging_shared_secret, sender, recipient]);
        context.push_nullifier(handshake_nullifier);

        // We need to emit the log in public because we need the log contract address to be public for everyone to know
        // what logs to brute-force.
        HandshakingContract::at(context.this_address())._emit_handshaking_log(message_ciphertext).enqueue(&mut context);
    }

    #[public]
    #[internal]
    fn _emit_handshaking_log(message_ciphertext: [bytes; SOME_LENGTH]) {
        emit_log(message_ciphertext);
    }
}
