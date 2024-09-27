use crate::{
    context::PrivateContext, event::event_interface::EventInterface,
    encrypted_logs::payload::compute_encrypted_log,
    keys::{getters::get_public_keys, public_keys::{OvpkM, IvpkM}}, oracle::random::random
};
use dep::protocol_types::{address::AztecAddress, hash::sha256_to_field};

unconstrained fn compute_unconstrained<Event, let N: u32>(
    contract_address: AztecAddress,
    ovsk_app: Field,
    ovpk: OvpkM,
    ivpk: IvpkM,
    recipient: AztecAddress,
    event: Event
) -> ([u8; 416 + N * 32], Field, Field) where Event: EventInterface<N> {
    compute(contract_address, ovsk_app, ovpk, ivpk, recipient, event)
}

fn compute<Event, let N: u32>(
    contract_address: AztecAddress,
    ovsk_app: Field,
    ovpk: OvpkM,
    ivpk: IvpkM,
    recipient: AztecAddress,
    event: Event
) -> ([u8; 416 + N * 32], Field, Field) where Event: EventInterface<N> {
    // We use the randomness to preserve function privacy by making it non brute-forceable, so a malicious sender could
    // use non-random values to reveal the plaintext. But they already know it themselves anyway, and is presumably not
    // interested in disclosing this information. We can therefore assume that the sender will cooperate in the random
    // value generation.
    let randomness = unsafe {
        random()
    };
    let plaintext = event.private_to_be_bytes(randomness);

    let encrypted_log: [u8; 416 + N * 32] = compute_encrypted_log(contract_address, ovsk_app, ovpk, ivpk, recipient, plaintext);
    let log_hash = sha256_to_field(encrypted_log);

    (encrypted_log, log_hash, randomness)
}

fn emit_with_keys<Event, let N: u32>(
    context: &mut PrivateContext,
    event: Event,
    ovpk: OvpkM,
    ivpk: IvpkM,
    iv: AztecAddress,
    inner_compute: fn(AztecAddress, Field, OvpkM, IvpkM, AztecAddress, Event) -> ([u8; 416 + N * 32], Field, Field)
) where Event: EventInterface<N> {
    let contract_address: AztecAddress = context.this_address();
    let ovsk_app: Field  = context.request_ovsk_app(ovpk.hash());
    let (encrypted_log, log_hash, randomness) = inner_compute(contract_address, ovsk_app, ovpk, ivpk, iv, event);
    context.emit_raw_event_log_with_masked_address(randomness, encrypted_log, log_hash);
}

pub fn encode_and_encrypt_event<Event, let N: u32>(
    context: &mut PrivateContext,
    ov: AztecAddress,
    iv: AztecAddress
) -> fn[(AztecAddress, AztecAddress, &mut PrivateContext)](Event) -> () where Event: EventInterface<N> {
    | e: Event | {
        let ovpk = get_public_keys(ov).ovpk_m;
        let ivpk = get_public_keys(iv).ivpk_m;

        emit_with_keys(context, e, ovpk, ivpk, iv, compute);
    }
}

pub fn encode_and_encrypt_event_unconstrained<Event, let N: u32>(
    context: &mut PrivateContext,
    ov: AztecAddress,
    iv: AztecAddress
) -> fn[(AztecAddress, AztecAddress, &mut PrivateContext)](Event) -> () where Event: EventInterface<N> {
    | e: Event | {
        let ovpk = get_public_keys(ov).ovpk_m;
        let ivpk = get_public_keys(iv).ivpk_m;

        emit_with_keys(context, e, ovpk, ivpk, iv, compute_unconstrained);
    }
}

pub fn encode_and_encrypt_event_with_randomness<Event, let N: u32>(
    context: &mut PrivateContext,
    ov: AztecAddress,
    iv: AztecAddress
) -> fn[(AztecAddress, AztecAddress, &mut PrivateContext)](Event) -> () where Event: EventInterface<N> {
    | e: Event | {
        let ovpk = get_public_keys(ov).ovpk_m;
        let ivpk = get_public_keys(iv).ivpk_m;
        emit_with_keys(context, e, ovpk, ivpk, iv, compute);
    }
}

pub fn encode_and_encrypt_event_with_randomness_unconstrained<Event, let N: u32>(
    context: &mut PrivateContext,
    ov: AztecAddress,
    iv: AztecAddress
) -> fn[(AztecAddress, AztecAddress, &mut PrivateContext)](Event) -> () where Event: EventInterface<N> {
    | e: Event | {
        let ovpk = get_public_keys(ov).ovpk_m;
        let ivpk = get_public_keys(iv).ivpk_m;
        emit_with_keys(context, e, ovpk, ivpk, iv, compute_unconstrained);
    }
}

pub fn encode_and_encrypt_event_with_keys<Event, let N: u32>(
    context: &mut PrivateContext,
    ovpk: OvpkM,
    ivpk: IvpkM,
    recipient: AztecAddress
) -> fn[(&mut PrivateContext, OvpkM, IvpkM, AztecAddress)](Event) -> () where Event: EventInterface<N> {
    | e: Event | {
        emit_with_keys(context, e, ovpk, ivpk, recipient, compute);
    }
}

pub fn encode_and_encrypt_event_with_keys_unconstrained<Event, let N: u32>(
    context: &mut PrivateContext,
    ovpk: OvpkM,
    ivpk: IvpkM,
    recipient: AztecAddress
) -> fn[(&mut PrivateContext, OvpkM, IvpkM, AztecAddress)](Event) -> () where Event: EventInterface<N> {
    | e: Event | {
        emit_with_keys(context, e, ovpk, ivpk, recipient, compute_unconstrained);
    }
}

pub fn encode_and_encrypt_event_with_keys_with_randomness<Event, let N: u32>(
    context: &mut PrivateContext,
    ovpk: OvpkM,
    ivpk: IvpkM,
    recipient: AztecAddress
) -> fn[(&mut PrivateContext, OvpkM, IvpkM, AztecAddress)](Event) -> () where Event: EventInterface<N> {
    | e: Event | {
        emit_with_keys(context, e, ovpk, ivpk, recipient, compute);
    }
}

pub fn encode_and_encrypt_event_with_keys_with_randomness_unconstrained<Event, let N: u32>(
    context: &mut PrivateContext,
    ovpk: OvpkM,
    ivpk: IvpkM,
    recipient: AztecAddress
) -> fn[(&mut PrivateContext, OvpkM, IvpkM, AztecAddress)](Event) -> () where Event: EventInterface<N> {
    | e: Event | {
        emit_with_keys(context, e, ovpk, ivpk, recipient, compute_unconstrained);
    }
}
