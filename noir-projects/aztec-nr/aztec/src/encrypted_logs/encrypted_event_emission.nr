use crate::{
    context::PrivateContext, encrypted_logs::payload::compute_private_log_payload,
    event::event_interface::EventInterface,
};
use dep::protocol_types::{address::AztecAddress, constants::PRIVATE_LOG_SIZE_IN_FIELDS};

/// Computes private event log payload and a log hash
fn compute_payload<Event, let N: u32>(
    context: PrivateContext,
    event: Event,
    recipient: AztecAddress,
    sender: AztecAddress,
) -> [Field; PRIVATE_LOG_SIZE_IN_FIELDS]
where
    Event: EventInterface<N>,
{
    let contract_address: AztecAddress = context.this_address();
    let plaintext = event.to_be_bytes();

    compute_private_log_payload(contract_address, recipient, sender, plaintext)
}

unconstrained fn compute_payload_unconstrained<Event, let N: u32>(
    context: PrivateContext,
    event: Event,
    recipient: AztecAddress,
    sender: AztecAddress,
) -> [Field; PRIVATE_LOG_SIZE_IN_FIELDS]
where
    Event: EventInterface<N>,
{
    compute_payload(context, event, recipient, sender)
}

pub fn encode_and_encrypt_event<Event, let N: u32>(
    context: &mut PrivateContext,
    recipient: AztecAddress,
    sender: AztecAddress,
) -> fn[(&mut PrivateContext, AztecAddress, AztecAddress)](Event) -> ()
where
    Event: EventInterface<N>,
{
    |e: Event| {
        let encrypted_log = compute_payload(*context, e, recipient, sender);
        context.emit_private_log(encrypted_log);
    }
}

pub fn encode_and_encrypt_event_unconstrained<Event, let N: u32>(
    context: &mut PrivateContext,
    recipient: AztecAddress,
    sender: AztecAddress,
) -> fn[(&mut PrivateContext, AztecAddress, AztecAddress)](Event) -> ()
where
    Event: EventInterface<N>,
{
    |e: Event| {
        let encrypted_log = unsafe {
            //@safety Unconstrained logs have both their content and encryption unconstrained - it could occur that the
            // recipient is unable to decrypt the payload.
            compute_payload_unconstrained(*context, e, recipient, sender)
        };
        context.emit_private_log(encrypted_log);
    }
}
