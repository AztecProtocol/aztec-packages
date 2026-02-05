use crate::note::{HintedNote, note_interface::NoteType};
use crate::protocol::{address::AztecAddress, traits::Packable};

#[oracle(utilityGetForeignNote)]
unconstrained fn get_foreign_note_oracle<Note>(
    _owner: AztecAddress,
    _storage_slot: Field,
    _packed_hinted_note_length: u32,
) -> Option<[Field; <HintedNote<Note> as Packable>::N]>
where
    HintedNote<Note>: Packable,
{}

pub unconstrained fn get_foreign_note<Note>(owner: AztecAddress, storage_slot: Field) -> Option<HintedNote<Note>>
where
    Note: NoteType + Packable,
{
    let maybe_packed: Option<[Field; <HintedNote<Note> as Packable>::N]> =
        get_foreign_note_oracle::<Note>(owner, storage_slot, <HintedNote<Note> as Packable>::N);

    maybe_packed.map(|packed| HintedNote::unpack(packed))
}
