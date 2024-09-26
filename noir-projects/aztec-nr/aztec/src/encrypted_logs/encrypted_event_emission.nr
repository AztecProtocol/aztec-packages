use crate::{
    context::PrivateContext, event::event_interface::EventInterface,
    encrypted_logs::payload::compute_encrypted_log,
    keys::{getters::get_ovsk_app, public_keys::{OvpkM, IvpkM}}, oracle::unsafe_rand::unsafe_rand
};
use dep::protocol_types::{address::AztecAddress, hash::sha256_to_field};

fn compute_raw_event_log<Event, let N: u32>(
    context: PrivateContext,
    event: Event,
    randomness: Field,
    ovsk_app: Field,
    ovpk: OvpkM,
    ivpk: IvpkM,
    recipient: AztecAddress
) -> ([u8; 416 + N * 32], Field) where Event: EventInterface<N> {
    let contract_address: AztecAddress = context.this_address();
    let plaintext = event.private_to_be_bytes(randomness);
    let encrypted_log: [u8; 416 + N * 32] = compute_encrypted_log(contract_address, ovsk_app, ovpk, ivpk, recipient, plaintext);
    let log_hash = sha256_to_field(encrypted_log);
    (encrypted_log, log_hash)
}

unconstrained fn compute_raw_event_log_unconstrained<Event, let N: u32>(
    context: PrivateContext,
    event: Event,
    randomness: Field,
    ovpk: OvpkM,
    ivpk: IvpkM,
    recipient: AztecAddress
) -> ([u8; 416 + N * 32], Field) where Event: EventInterface<N> {
    let ovsk_app = get_ovsk_app(ovpk.hash());
    compute_raw_event_log(context, event, randomness, ovsk_app, ovpk, ivpk, recipient)
}

pub fn encode_and_encrypt_event<Event, let N: u32>(
    context: &mut PrivateContext,
    ovpk: OvpkM,
    ivpk: IvpkM,
    recipient: AztecAddress
) -> fn[(&mut PrivateContext, OvpkM, IvpkM, AztecAddress)](Event) -> () where Event: EventInterface<N> {
    | e: Event | {
        let randomness = unsafe_rand();
        let ovsk_app: Field = context.request_ovsk_app(ovpk.hash());
        let (encrypted_log, log_hash) = compute_raw_event_log(*context, e, randomness, ovsk_app, ovpk, ivpk, recipient);
        context.emit_raw_event_log_with_masked_address(randomness, encrypted_log, log_hash);
    }
}

pub fn encode_and_encrypt_event_unconstrained<Event, let N: u32>(
    context: &mut PrivateContext,
    ovpk: OvpkM,
    ivpk: IvpkM,
    recipient: AztecAddress
) -> fn[(&mut PrivateContext, OvpkM, IvpkM, AztecAddress)](Event) -> () where Event: EventInterface<N> {
    | e: Event | {
        let randomness = unsafe_rand();
        let (encrypted_log, log_hash) = compute_raw_event_log_unconstrained(*context, e, randomness, ovpk, ivpk, recipient);
        context.emit_raw_event_log_with_masked_address(randomness, encrypted_log, log_hash);
    }
}

pub fn encode_and_encrypt_event_with_randomness<Event, let N: u32>(
    context: &mut PrivateContext,
    randomness: Field,
    ovpk: OvpkM,
    ivpk: IvpkM,
    recipient: AztecAddress
) -> fn[(&mut PrivateContext, OvpkM, Field, IvpkM, AztecAddress)](Event) -> () where Event: EventInterface<N> {
    | e: Event | {
        let ovsk_app: Field = context.request_ovsk_app(ovpk.hash());
        let (encrypted_log, log_hash) = compute_raw_event_log(*context, e, randomness, ovsk_app, ovpk, ivpk, recipient);
        context.emit_raw_event_log_with_masked_address(randomness, encrypted_log, log_hash);
    }
}

pub fn encode_and_encrypt_event_with_randomness_unconstrained<Event, let N: u32>(
    context: &mut PrivateContext,
    randomness: Field,
    ovpk: OvpkM,
    ivpk: IvpkM,
    recipient: AztecAddress
) -> fn[(&mut PrivateContext, Field, OvpkM, IvpkM, AztecAddress)](Event) -> () where Event: EventInterface<N> {
    | e: Event | {
        let (encrypted_log, log_hash) = compute_raw_event_log_unconstrained(*context, e, randomness, ovpk, ivpk, recipient);
        context.emit_raw_event_log_with_masked_address(randomness, encrypted_log, log_hash);
    }
}
