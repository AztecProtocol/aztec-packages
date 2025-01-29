use crate::{
    note::discovery::{
        MAX_NOTE_SERIALIZED_LEN,
        MAX_PARTIAL_NOTE_PRIVATE_SERIALIZED_LEN,
        nonce_discovery::{attempt_note_nonce_discovery, DiscoveredNoteInfo},
        NoteHashAndNullifier,
    },
    oracle::note_discovery::{deliver_note, get_log_by_tag},
    pxe_db::DBArray,
    utils::array,
};

use dep::protocol_types::{
    address::AztecAddress,
    debug_log::debug_log_format,
    traits::{Deserialize, FromField, Serialize, ToField},
};

pub global DELIVERED_PENDING_PARTIAL_NOTE_ARRAY_LENGTH_DB_SLOT: Field = 5;

pub(crate) struct DeliveredPendingPartialNote {
    pub(crate) note_completion_log_tag: Field,
    pub(crate) storage_slot: Field,
    pub(crate) note_type_id: Field,
    pub(crate) serialized_private_note_content: BoundedVec<Field, MAX_PARTIAL_NOTE_PRIVATE_SERIALIZED_LEN>,
    pub(crate) recipient: AztecAddress,
}

// TODO: use `derive(Serialize)`, but we need for generics in struct fields to be handled properly before that happens.
// Currently blocked by Noir's StructDefinition::fields.
impl Serialize<MAX_PARTIAL_NOTE_PRIVATE_SERIALIZED_LEN + 4> for DeliveredPendingPartialNote {
    fn serialize(self) -> [Field; MAX_PARTIAL_NOTE_PRIVATE_SERIALIZED_LEN + 4] {
        [
            self.note_completion_log_tag,
            self.storage_slot,
            self.note_type_id,
            self.serialized_private_note_content.storage()[0],
            self.serialized_private_note_content.storage()[1],
            self.serialized_private_note_content.storage()[2],
            self.serialized_private_note_content.storage()[3],
            self.serialized_private_note_content.storage()[4],
            self.serialized_private_note_content.storage()[5],
            self.serialized_private_note_content.storage()[6],
            self.serialized_private_note_content.storage()[7],
            self.serialized_private_note_content.storage()[8],
            self.serialized_private_note_content.storage()[9],
            self.serialized_private_note_content.storage()[10],
            self.serialized_private_note_content.storage()[12],
            self.serialized_private_note_content.storage()[13],
            self.serialized_private_note_content.storage()[14],
            self.serialized_private_note_content.len() as Field,
            self.recipient.to_field(),
        ]
    }
}

impl Deserialize<MAX_PARTIAL_NOTE_PRIVATE_SERIALIZED_LEN + 4> for DeliveredPendingPartialNote {
    fn deserialize(values: [Field; MAX_PARTIAL_NOTE_PRIVATE_SERIALIZED_LEN + 4]) -> Self {
        Self {
            note_completion_log_tag: values[0],
            storage_slot: values[1],
            note_type_id: values[2],
            serialized_private_note_content: BoundedVec::from_parts(
                array::subarray(values, 3),
                values[17] as u32,
            ),
            recipient: AztecAddress::from_field(values[18]),
        }
    }
}

pub unconstrained fn fetch_and_process_public_partial_note_completion_logs<Env>(
    contract_address: AztecAddress,
    compute_note_hash_and_nullifier: fn[Env](BoundedVec<Field, MAX_NOTE_SERIALIZED_LEN>, AztecAddress, Field, Field, Field) -> Option<NoteHashAndNullifier>,
) {
    let pending_partial_notes = DBArray::at(
        contract_address,
        DELIVERED_PENDING_PARTIAL_NOTE_ARRAY_LENGTH_DB_SLOT,
    );

    debug_log_format(
        "{} pending partial notes",
        [pending_partial_notes.len() as Field],
    );

    let mut i = &mut 0;
    whyle(
        || *i < pending_partial_notes.len(),
        || {
            let pending_partial_note: DeliveredPendingPartialNote = pending_partial_notes.get(*i);

            let maybe_log = get_log_by_tag(pending_partial_note.note_completion_log_tag);
            if maybe_log.is_none() {
                debug_log_format("Found no logs for partial note #{}", [(*i) as Field]);
                *i += 1 as u32;
            } else {
                debug_log_format("Log found for partial note #{}!", [(*i) as Field]);
                let log = maybe_log.unwrap();

                let complete_serialized_note_content = array::append(
                    pending_partial_note.serialized_private_note_content,
                    log.log_content,
                );

                let discovered_notes = attempt_note_nonce_discovery(
                    log.unique_note_hashes_in_tx,
                    log.first_nullifier_in_tx,
                    compute_note_hash_and_nullifier,
                    contract_address,
                    pending_partial_note.storage_slot,
                    pending_partial_note.note_type_id,
                    complete_serialized_note_content,
                );

                debug_log_format(
                    "Discovered {0} notes for partial note {1}",
                    [discovered_notes.len() as Field, (*i) as Field],
                );

                array::for_each_in_bounded_vec(
                    discovered_notes,
                    |discovered_note: DiscoveredNoteInfo, _| {
                        // TODO:(#10728): handle notes that fail delivery
                        assert(
                            deliver_note(
                                contract_address,
                                pending_partial_note.storage_slot,
                                discovered_note.nonce,
                                complete_serialized_note_content,
                                discovered_note.note_hash,
                                discovered_note.inner_nullifier,
                                log.tx_hash,
                                pending_partial_note.recipient,
                            ),
                            "Failed to deliver note",
                        );
                    },
                );

                pending_partial_notes.remove(*i);
            }
            // todo: handle the log never showing up?
        },
    );
}

fn whyle<Env, Env2>(condition: fn[Env]() -> bool, body: fn[Env2]() -> ()) {
    if condition() {
        body();
        whyle(condition, body);
    }
}
