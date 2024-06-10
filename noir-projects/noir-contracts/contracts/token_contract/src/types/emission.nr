use dep::aztec::{
    prelude::{AztecAddress, NoteHeader, NoteInterface, PrivateContext},
    encrypted_logs::{payload::compute_encrypted_note_log}, note::note_interface::NoteInterface,
    protocol_types::{grumpkin_point::GrumpkinPoint}
};

struct NoteEmission<Note> {
    storage_slot: Field,
    note: Note,
    ovpk: GrumpkinPoint,
    ivpk: GrumpkinPoint,
}

impl<Note> NoteEmission<Note> {
    pub fn new(storage_slot: Field, note: Note, ovpk: GrumpkinPoint, ivpk: GrumpkinPoint) -> Self {
        Self { storage_slot, note, ovpk, ivpk }
    }

    pub fn emit<N, NB, M>(self, context: &mut PrivateContext) where Note: NoteInterface<N, NB> {
        let note_hash_counter = self.note.get_header().note_hash_counter;

        let contract_address = context.this_address();
        let ovsk_app = context.request_ovsk_app(self.ovpk.hash());

        // Current unoptimized size of the encrypted log
        // incoming_tag (32 bytes)
        // outgoing_tag (32 bytes)
        // eph_pk (64 bytes)
        // incoming_header (48 bytes)
        // outgoing_header (48 bytes)
        // outgoing_body (176 bytes)
        // incoming_body_fixed (64 bytes)
        // incoming_body_variable (N * 32 bytes + 16 bytes padding) 
        let encrypted_log: [u8; M] = compute_encrypted_note_log(
            contract_address,
            self.storage_slot,
            ovsk_app,
            self.ovpk,
            self.ivpk,
            self.note
        );

        context.emit_raw_log(note_hash_counter, encrypted_log);
    }
}
