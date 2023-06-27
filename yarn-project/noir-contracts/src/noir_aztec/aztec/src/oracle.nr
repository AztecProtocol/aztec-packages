use crate::abi::MAX_READ_REQUESTS;

unconstrained fn get_secret(address: Field) -> Field {
    address + 1
}

unconstrained fn rand() -> Field {
    55667890
}

unconstrained fn is_nullifier_emitted(nullifier: Field) -> bool {
    nullifier != 0
}

unconstrained fn get_note<Note, N>(
    storage_slot: Field,
    deserialise: fn ([Field; N]) -> Note,
    dummy: fn () -> Note,
) -> Note {
    dummy()
}

unconstrained fn get_max_notes<Note, N>(
    storage_slot: Field,
    deserialise: fn ([Field; N]) -> Note,
    dummy: fn () -> Note,
    sort_by: [u8; N],
    sort_order: [u8; N],
    skip: u8,
) -> [Note; MAX_READ_REQUESTS] {
    [dummy(), dummy(), dummy(), dummy()]
}

unconstrained fn get_notes<Note, N, S, P>(
    storage_slot: Field,
    deserialise: fn ([Field; N]) -> Note,
    dummy: fn () -> Note,
    sort_by: [u8; N],
    sort_order: [u8; N],
    skip: u8,
    filter: fn ([Note; MAX_READ_REQUESTS], P) -> [Note; S],
    filter_args: P,
) -> [Note; S] {
    let notes = get_max_notes(storage_slot, deserialise, dummy, sort_by, sort_order, skip);
    filter(notes, filter_args)
}

unconstrained fn emit_encrypted_log<S>(log: [Field; S]) -> [Field; 2] {
    let log_hash = [22446688, 11335577];
    log_hash
}

unconstrained fn emit_unencrypted_log<S>(log: [Field; S]) -> [Field; 2] {
    let log_hash = [22446688, 11335577];
    log_hash
}