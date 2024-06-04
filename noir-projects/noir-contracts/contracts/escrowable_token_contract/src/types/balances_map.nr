use dep::aztec::prelude::{
    AztecAddress, NoteGetterOptions, NoteViewerOptions, NoteHeader, NoteInterface, PrivateContext,
    PrivateSet, Map
};
use dep::aztec::{
    context::{PublicContext, UnconstrainedContext}, hash::pedersen_hash,
    protocol_types::constants::MAX_NOTE_HASH_READ_REQUESTS_PER_CALL,
    note::{note_getter::view_notes, note_getter_options::SortOrder}
};
use crate::types::token_note::{TokenNote, OwnedNote};
use crate::types::option_address::AztecAddressOption;

struct BalancesMap<T, Context> {
    map: Map<AztecAddress, PrivateSet<T, Context>, Context>
}

impl<T, Context> BalancesMap<T, Context> {
    pub fn new(context: Context, storage_slot: Field) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        Self {
            map: Map::new(
                context,
                storage_slot,
                |context, slot| PrivateSet::new(context, slot)
            )
        }
    }
}

impl<T> BalancesMap<T, UnconstrainedContext> {
    unconstrained pub fn balance_of<T_SERIALIZED_LEN, T_SERIALIZED_BYTES_LEN>(
        self: Self,
        owner: AztecAddress
    ) -> U128 where T: NoteInterface<T_SERIALIZED_LEN, T_SERIALIZED_BYTES_LEN> + OwnedNote {
        self.balance_of_with_offset(owner, 0)
    }

    unconstrained pub fn balance_of_with_offset<T_SERIALIZED_LEN, T_SERIALIZED_BYTES_LEN>(
        self: Self,
        owner: AztecAddress,
        offset: u32
    ) -> U128 where T: NoteInterface<T_SERIALIZED_LEN, T_SERIALIZED_BYTES_LEN> + OwnedNote {
        let mut balance = U128::from_integer(0);

        let mut options = NoteViewerOptions::new();
        let opt_notes = self.map.at(owner).view_notes(options.set_offset(offset));

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

impl<T> BalancesMap<T, &mut PrivateContext> {
    /**
     * Adds a note to the balance of the owner.
     *
     * @param owner: The address of the note owner.
     * @param addend: The amount to add to the balance
     * @param incoming_viewer_and_nullifier: The address to use for `ivpk` and `npk` lookups
     * @param outgoing_viewer: The address to use for `ovpk` lookup
     */
    pub fn add<T_SERIALIZED_LEN, T_SERIALIZED_BYTES_LEN>(
        self: Self,
        owner: AztecAddress,
        addend: U128,
        incoming_viewer_and_nullifier: AztecAddress,
        outgoing_viewer: AztecAddress
    ) where T: NoteInterface<T_SERIALIZED_LEN, T_SERIALIZED_BYTES_LEN> + OwnedNote {
        let context = self.map.context;
        let header = context.get_header();

        let ivpk_m = header.get_ivpk_m(context, incoming_viewer_and_nullifier);
        let npk_m_hash = header.get_npk_m_hash(context, incoming_viewer_and_nullifier);
        let ovpk_m = header.get_ovpk_m(context, outgoing_viewer);

        let mut addend_note = T::new(addend, npk_m_hash);

        self.map.at(owner).insert(&mut addend_note, ovpk_m, ivpk_m);
    }

    /**
     * Removes notes from the balance of the owner until removing at least `subtrahend`
     * If removing "too much" adds a note to the balance of the owner with the diff.
     *
     * @param owner: The address of the note owner.
     * @param subtrahend: The amount to remove from the balance
     * @param incoming_viewer_and_nullifier: The address to use for `ivpk` and `npk` lookups
     * @param outgoing_viewer: The address to use for `ovpk` lookup
     */
    pub fn sub<T_SERIALIZED_LEN, T_SERIALIZED_BYTES_LEN>(
        self: Self,
        owner: AztecAddress,
        subtrahend: U128,
        incoming_viewer_and_nullifier: AztecAddress,
        outgoing_viewer: AztecAddress
    ) where T: NoteInterface<T_SERIALIZED_LEN, T_SERIALIZED_BYTES_LEN> + OwnedNote {
        let options = NoteGetterOptions::with_filter(filter_notes_min_sum, subtrahend);
        let maybe_notes = self.map.at(owner).get_notes(options);

        let mut minuend: U128 = U128::from_integer(0);
        for i in 0..maybe_notes.len() {
            if maybe_notes[i].is_some() {
                let note = maybe_notes[i].unwrap_unchecked();

                self.map.at(owner).remove(note);

                minuend = minuend + note.get_amount();
            }
        }

        assert(minuend >= subtrahend, "Balance too low");

        self.add(
            owner,
            minuend - subtrahend,
            incoming_viewer_and_nullifier,
            outgoing_viewer
        );
    }
}

pub fn filter_notes_min_sum<T, T_SERIALIZED_LEN, T_SERIALIZED_BYTES_LEN>(
    notes: [Option<T>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL],
    min_sum: U128
) -> [Option<T>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL] where T: NoteInterface<T_SERIALIZED_LEN, T_SERIALIZED_BYTES_LEN> + OwnedNote {
    let mut selected = [Option::none(); MAX_NOTE_HASH_READ_REQUESTS_PER_CALL];
    let mut sum = U128::from_integer(0);
    for i in 0..notes.len() {
        if notes[i].is_some() & sum < min_sum {
            let note = notes[i].unwrap_unchecked();
            selected[i] = Option::some(note);
            sum = sum.add(note.get_amount());
        }
    }
    selected
}
