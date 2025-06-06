use protocol_types::{address::AztecAddress, traits::Serialize};

/// Emits message that will be delivered off-chain rather than through the data availability layer.
///
/// Sends data through an alternative app-specific channel without incurring data availability (DA) costs. After
/// receiving the message, the recipient is expected to call the `process_message` function implemented on the
/// contract that originally emitted the message.
///
/// # Example use case
/// A typical use case would be a payment app where the notes and events do not need to be delivered via DA because
/// the payment is considered successful by the recipient once he receives the notes and events off-chain. Hence
/// having the guaranteed delivery via DA is not necessary.
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
/// * `message` - The message to emit.
/// * `recipient` - The address of the recipient.
pub fn emit_offchain_message<T, let N: u32>(message: T, recipient: AztecAddress)
where
    T: Serialize<N>,
{
    // Safety: This oracle call returns nothing: we only call it for its side effects. It is therefore always safe
    // to call.
    unsafe { emit_offchain_message_oracle_wrapper(message, recipient) };
}

unconstrained fn emit_offchain_message_oracle_wrapper<T, let N: u32>(
    message: T,
    recipient: AztecAddress,
)
where
    T: Serialize<N>,
{
    emit_offchain_message_oracle(message.serialize(), recipient);
}

#[oracle(emitOffchainMessage)]
unconstrained fn emit_offchain_message_oracle<let N: u32>(
    message: [Field; N],
    recipient: AztecAddress,
) {}
