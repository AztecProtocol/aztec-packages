use crate::types::card_note::CardNote;
use dep::aztec::note::{note_getter_options::NoteGetterOptions, retrieved_note::RetrievedNote};

use dep::aztec::{
    note::{note_getter_options::SortOrder, note_interface::NoteProperties},
    utils::comparison::Comparator,
};
use dep::aztec::protocol_types::{
    address::AztecAddress, constants::MAX_NOTE_HASH_READ_REQUESTS_PER_CALL, traits::Packable,
};

// Shows how to use NoteGetterOptions and query for notes.

pub fn create_npk_card_getter_options<let M: u32>(
    account: AztecAddress,
    offset: u32,
) -> NoteGetterOptions<CardNote, M, Field, Field>
where
    CardNote: Packable<N = M>,
{
    let mut options = NoteGetterOptions::new();
    options
        .select(CardNote::properties().owner, Comparator.EQ, account)
        .sort(CardNote::properties().points, SortOrder.DESC)
        .set_offset(offset)
}

pub fn create_exact_card_getter_options<let M: u32>(
    points: u8,
    secret: Field,
    account: AztecAddress,
) -> NoteGetterOptions<CardNote, M, Field, Field>
where
    CardNote: Packable<N = M>,
{
    let mut options = NoteGetterOptions::new();
    options
        .select(CardNote::properties().points, Comparator.EQ, points as Field)
        .select(CardNote::properties().randomness, Comparator.EQ, secret)
        .select(CardNote::properties().owner, Comparator.EQ, account)
}

pub fn filter_min_points(
    cards: [Option<RetrievedNote<CardNote>>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL],
    min_points: u8,
) -> [Option<RetrievedNote<CardNote>>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL] {
    let mut selected_cards = [Option::none(); MAX_NOTE_HASH_READ_REQUESTS_PER_CALL];
    let mut num_selected = 0;
    for i in 0..cards.len() {
        if cards[i].is_some() & cards[i].unwrap_unchecked().note.get_points() >= min_points {
            selected_cards[num_selected] = cards[i];
            num_selected += 1;
        }
    }
    selected_cards
}

pub fn create_cards_with_min_points_getter_options<let M: u32>(
    min_points: u8,
) -> NoteGetterOptions<CardNote, M, Field, u8>
where
    CardNote: Packable<N = M>,
{
    NoteGetterOptions::with_filter(filter_min_points, min_points).sort(
        CardNote::properties().points,
        SortOrder.ASC,
    )
}

pub fn create_largest_card_getter_options<let M: u32>() -> NoteGetterOptions<CardNote, M, Field, Field>
where
    CardNote: Packable<N = M>,
{
    let mut options = NoteGetterOptions::new();
    options.sort(CardNote::properties().points, SortOrder.DESC).set_limit(1)
}
