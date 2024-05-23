use dep::aztec::prelude::{
    AztecAddress, NoteGetterOptions, NoteViewerOptions, NoteHeader, NoteInterface, PrivateContext,
    PrivateSet, Map
};
use dep::aztec::{
    hash::pedersen_hash, protocol_types::constants::MAX_NOTE_HASH_READ_REQUESTS_PER_CALL,
    note::{note_getter::view_notes, note_getter_options::{SortOrder, Comparator}},
    keys::getters::{get_npk_m_hash, get_ivpk_m}
};
use crate::types::token_note::{TokenNote, OwnedNote};

struct BalancesMap<T, Context> {
    map: PrivateSet<T, Context>
}

impl<T, Context> BalancesMap<T, Context> {
    pub fn new(context: Context, storage_slot: Field) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        Self { map: PrivateSet::new(context, storage_slot) }
    }
}

impl<T> BalancesMap<T, &mut PrivateContext> {
    pub fn balance_of<T_SERIALIZED_LEN, T_SERIALIZED_BYTES_LEN>(
        self: Self,
        owner: AztecAddress
    ) -> U128 where T: NoteInterface<T_SERIALIZED_LEN, T_SERIALIZED_BYTES_LEN> + OwnedNote {
        self.balance_of_with_offset(owner, 0)
    }

    pub fn balance_of_with_offset<T_SERIALIZED_LEN, T_SERIALIZED_BYTES_LEN>(
        self: Self,
        owner: AztecAddress,
        offset: u32
    ) -> U128 where T: NoteInterface<T_SERIALIZED_LEN, T_SERIALIZED_BYTES_LEN> + OwnedNote {
        let mut balance = U128::from_integer(0);
        let mut options = NoteGetterOptions::new();
        let owner_npk_m_hash = get_npk_m_hash(self.map.context, owner);

        let opt_notes = self.map.get_notes(
            options.select(
                T::get_owner_selector(),
                owner_npk_m_hash,
                Option::some(Comparator.EQ)
            )
        );

        let len = opt_notes.len();
        for i in 0..len {
            if opt_notes[i].is_some() {
                balance = balance + opt_notes[i].unwrap_unchecked().get_amount();
            }
        }
        if (opt_notes[len - 1].is_some()) {
            balance = balance + self.balance_of_with_offset(owner, offset + opt_notes.len() as u32);
        }

        balance
    }

   
}