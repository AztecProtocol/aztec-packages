use crate::{
    context::PrivateContext, encrypted_logs::payload::compute_private_log_payload,
    event::event_interface::EventInterface, keys::getters::get_ovsk_app,
};
use dep::protocol_types::{
    address::AztecAddress, constants::PRIVATE_LOG_SIZE_IN_FIELDS, public_keys::OvpkM,
};

/// Computes private event log payload and a log hash
fn compute_payload<Event, let N: u32>(
    context: PrivateContext,
    event: Event,
    ovsk_app: Field,
    ovpk: OvpkM,
    recipient: AztecAddress,
    sender: AztecAddress,
) -> [Field; PRIVATE_LOG_SIZE_IN_FIELDS]
where
    Event: EventInterface<N>,
{
    let contract_address: AztecAddress = context.this_address();
    let plaintext = event.to_be_bytes();

    compute_private_log_payload(
        contract_address,
        ovsk_app,
        ovpk,
        recipient,
        sender,
        plaintext,
    )
}

unconstrained fn compute_payload_unconstrained<Event, let N: u32>(
    context: PrivateContext,
    event: Event,
    ovpk: OvpkM,
    recipient: AztecAddress,
    sender: AztecAddress,
) -> [Field; PRIVATE_LOG_SIZE_IN_FIELDS]
where
    Event: EventInterface<N>,
{
    let ovsk_app = get_ovsk_app(ovpk.hash());
    compute_payload(context, event, ovsk_app, ovpk, recipient, sender)
}

pub fn encode_and_encrypt_event<Event, let N: u32>(
    context: &mut PrivateContext,
    ovpk: OvpkM,
    recipient: AztecAddress,
    sender: AztecAddress,
) -> fn[(&mut PrivateContext, OvpkM, AztecAddress, AztecAddress)](Event) -> ()
where
    Event: EventInterface<N>,
{
    |e: Event| {
        let ovsk_app: Field = context.request_ovsk_app(ovpk.hash());
        let encrypted_log = compute_payload(*context, e, ovsk_app, ovpk, recipient, sender);
        context.emit_private_log(encrypted_log);
    }
}

pub fn encode_and_encrypt_event_unconstrained<Event, let N: u32>(
    context: &mut PrivateContext,
    ovpk: OvpkM,
    recipient: AztecAddress,
    sender: AztecAddress,
) -> fn[(&mut PrivateContext, OvpkM, AztecAddress, AztecAddress)](Event) -> ()
where
    Event: EventInterface<N>,
{
    |e: Event| {
        // Unconstrained logs have both their content and encryption unconstrained - it could occur that the
        // recipient is unable to decrypt the payload.
        let encrypted_log =
            unsafe { compute_payload_unconstrained(*context, e, ovpk, recipient, sender) };
        context.emit_private_log(encrypted_log);
    }
}
