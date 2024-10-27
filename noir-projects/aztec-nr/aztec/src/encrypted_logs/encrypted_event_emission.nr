use crate::{
    context::PrivateContext, encrypted_logs::payload::compute_private_log_payload,
    event::event_interface::EventInterface, keys::getters::get_ovsk_app, oracle::random::random,
};
use dep::protocol_types::{
    address::AztecAddress,
    hash::sha256_to_field,
    public_keys::{IvpkM, OvpkM},
};

/// Computes private event log payload and a log hash
fn compute_payload_and_hash<Event, let N: u32>(
    context: PrivateContext,
    event: Event,
    randomness: Field,
    ovsk_app: Field,
    ovpk: OvpkM,
    ivpk: IvpkM,
    recipient: AztecAddress,
) -> ([u8; 416 + N * 32], Field)
where
    Event: EventInterface<N>,
{
    let contract_address: AztecAddress = context.this_address();
    let plaintext = event.private_to_be_bytes(randomness);

    // For event logs we never include public values prefix as there are never any public values
    let encrypted_log: [u8; 416 + N * 32] = compute_private_log_payload(
        contract_address,
        ovsk_app,
        ovpk,
        recipient,
        plaintext,
        false,
    );
    let log_hash = sha256_to_field(encrypted_log);
    (encrypted_log, log_hash)
}

unconstrained fn compute_payload_and_hash_unconstrained<Event, let N: u32>(
    context: PrivateContext,
    event: Event,
    randomness: Field,
    ovpk: OvpkM,
    ivpk: IvpkM,
    recipient: AztecAddress,
) -> ([u8; 416 + N * 32], Field)
where
    Event: EventInterface<N>,
{
    let ovsk_app = get_ovsk_app(ovpk.hash());
    compute_payload_and_hash(context, event, randomness, ovsk_app, ovpk, ivpk, recipient)
}

pub fn encode_and_encrypt_event<Event, let N: u32>(
    context: &mut PrivateContext,
    ovpk: OvpkM,
    ivpk: IvpkM,
    recipient: AztecAddress,
) -> fn[(&mut PrivateContext, OvpkM, IvpkM, AztecAddress)](Event) -> ()
where
    Event: EventInterface<N>,
{
    |e: Event| {
        // We use the randomness to preserve function privacy by making it non brute-forceable, so a malicious sender could
        // use non-random values to reveal the plaintext. But they already know it themselves anyway, and is presumably not
        // interested in disclosing this information. We can therefore assume that the sender will cooperate in the random
        // value generation.
        let randomness = unsafe { random() };
        let ovsk_app: Field = context.request_ovsk_app(ovpk.hash());
        let (encrypted_log, log_hash) =
            compute_payload_and_hash(*context, e, randomness, ovsk_app, ovpk, ivpk, recipient);
        context.emit_raw_event_log_with_masked_address(randomness, encrypted_log, log_hash);
    }
}

pub fn encode_and_encrypt_event_unconstrained<Event, let N: u32>(
    context: &mut PrivateContext,
    ovpk: OvpkM,
    ivpk: IvpkM,
    recipient: AztecAddress,
) -> fn[(&mut PrivateContext, OvpkM, IvpkM, AztecAddress)](Event) -> ()
where
    Event: EventInterface<N>,
{
    |e: Event| {
        // We use the randomness to preserve function privacy by making it non brute-forceable, so a malicious sender could
        // use non-random values to reveal the plaintext. But they already know it themselves anyway, and is presumably not
        // interested in disclosing this information. We can therefore assume that the sender will cooperate in the random
        // value generation.
        let randomness = unsafe { random() };
        let (encrypted_log, log_hash) = unsafe {
            compute_payload_and_hash_unconstrained(*context, e, randomness, ovpk, ivpk, recipient)
        };
        context.emit_raw_event_log_with_masked_address(randomness, encrypted_log, log_hash);
    }
}

// This function seems to be affected by the following Noir bug:
// https://github.com/noir-lang/noir/issues/5771
// If you get weird behavior it might be because of it.
pub fn encode_and_encrypt_event_with_randomness<Event, let N: u32>(
    context: &mut PrivateContext,
    randomness: Field,
    ovpk: OvpkM,
    ivpk: IvpkM,
    recipient: AztecAddress,
) -> fn[(&mut PrivateContext, OvpkM, Field, IvpkM, AztecAddress)](Event) -> ()
where
    Event: EventInterface<N>,
{
    |e: Event| {
        let ovsk_app: Field = context.request_ovsk_app(ovpk.hash());
        let (encrypted_log, log_hash) =
            compute_payload_and_hash(*context, e, randomness, ovsk_app, ovpk, ivpk, recipient);
        context.emit_raw_event_log_with_masked_address(randomness, encrypted_log, log_hash);
    }
}

pub fn encode_and_encrypt_event_with_randomness_unconstrained<Event, let N: u32>(
    context: &mut PrivateContext,
    randomness: Field,
    ovpk: OvpkM,
    ivpk: IvpkM,
    recipient: AztecAddress,
) -> fn[(&mut PrivateContext, Field, OvpkM, IvpkM, AztecAddress)](Event) -> ()
where
    Event: EventInterface<N>,
{
    |e: Event| {
        //   Having the log hash be unconstrained here is fine because the way this works is we send the log hash
        // to the kernel, and it gets included as part of its public inputs. Then we send the tx to the sequencer,
        // which includes the kernel proof and the log preimages. The sequencer computes the hashes of the logs
        // and checks that they are the ones in the public inputs of the kernel, and drops the tx otherwise (proposing
        // the block on L1 would later fail if it didn't because of txs effects hash mismatch).
        //   So if we don't constrain the log hash, then a malicious sender can compute the correct log, submit a bad
        // log hash to the kernel, and then submit the bad log preimage to the sequencer. All checks will pass, but
        // the submitted log will not be the one that was computed by the app.
        //   In the unconstrained case, we don't care about the log at all because we don't do anything with it,
        // and because it's unconstrained: it could be anything. So if a sender chooses to broadcast the tx with a log
        // that is different from the one that was used in the circuit, then they'll be able to, but they were already
        // able to change the log before anyway, so the end result is the same. It's important here that we do not
        // return the log from this function to the app, otherwise it could try to do stuff with it and then that might
        // be wrong.
        let (encrypted_log, log_hash) = unsafe {
            compute_payload_and_hash_unconstrained(*context, e, randomness, ovpk, ivpk, recipient)
        };
        context.emit_raw_event_log_with_masked_address(randomness, encrypted_log, log_hash);
    }
}
