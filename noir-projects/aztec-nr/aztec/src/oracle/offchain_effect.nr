use protocol_types::traits::Serialize;

/// Emits data that will be delivered off-chain rather than through the data availability layer.
///
/// Sends data through an alternative app-specific channel without incurring data availability (DA) costs. After
/// receiving it, the recipient is expected interpret it freely. For example if this mechanism is used to emit a note
/// it should  call the `process_message` function implemented on the contract that originally emitted the message.
///
/// # Example use cases
/// A typical use case would be a payment app where the notes and events do not need to be delivered via DA because
/// the payment is considered successful by the recipient once he receives the notes and events off-chain. Hence
/// having the guaranteed delivery via DA is not necessary.
///
/// Another option would be to emit the preimage of an authwitness whose hash a contract expects to be signed by the users'
/// wallet. This information can be used to show the user what they are signing, plus proving the correct derivation of the
/// hash from the preimage.
///
/// # When not to use
/// This function should not be used when an on-chain guarantee of successful delivery is required. This is the case
/// when a smart contract (rather than a person) needs to make decisions based on the message. For example, consider
/// a contract that escrows a privately-stored NFT (i.e. an NFT represented by a note) and releases it to a buyer only
/// after receiving a payment in a specific token. Without on-chain delivery, the buyer could potentially obtain the
/// NFT without sending the payment token message (the note hash preimage) to the seller, rugging the seller.
///
/// To clarify the above, while the malicious buyer's payment token would still be deducted from their balance, they
/// would obtain the NFT while the seller would be unable to spend the payment token, keeping the payment token note
/// in limbo.
///
/// # Arguments
///
/// * `data` - The data to emit.
pub fn emit_offchain_effect<T, let N: u32>(data: T)
where
    T: Serialize<N>,
{
    // Safety: This oracle call returns nothing: we only call it for its side effects. It is therefore always safe
    // to call.
    unsafe { emit_offchain_effect_oracle_wrapper(data) };
}

unconstrained fn emit_offchain_effect_oracle_wrapper<T, let N: u32>(data: T)
where
    T: Serialize<N>,
{
    emit_offchain_effect_oracle(data.serialize());
}

#[oracle(emitOffchainEffect)]
unconstrained fn emit_offchain_effect_oracle<let N: u32>(data: [Field; N]) {}
