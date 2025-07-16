use crate::{
    context::PrivateContext,
    note::{
        note_getter_options::{
            NoteGetterOptions, NoteStatus, PropertySelector, Select, Sort, SortOrder,
        },
        note_interface::{NoteHash, NoteType},
        note_viewer_options::NoteViewerOptions,
        retrieved_note::RetrievedNote,
        utils::compute_note_hash_for_read_request,
    },
    oracle,
    utils::{array, comparison::compare},
};

use protocol_types::{constants::MAX_NOTE_HASH_READ_REQUESTS_PER_CALL, traits::{Packable, ToField}};

pub use crate::note::constants::MAX_NOTES_PER_PAGE;

mod test;

fn extract_property_value_from_selector<let N: u32>(
    packed_note: [Field; N],
    selector: PropertySelector,
) -> Field {
    // Selectors use PropertySelectors in order to locate note properties inside the packed note.
    // This allows easier packing and custom (un)packing schemas. A note property is located
    // inside the packed note using the index inside the array, a byte offset and a length.
    let value: [u8; 32] = packed_note[selector.index as u32].to_be_bytes();
    let offset = selector.offset;
    let length = selector.length;
    let mut value_field = 0 as Field;
    let mut acc: Field = 1;
    for i in 0..32 {
        if i < length {
            value_field += value[(31 + offset - i) as u32] as Field * acc;
            acc = acc * 256;
        }
    }
    value_field
}

fn check_packed_note<let N: u32>(packed_note: [Field; N], selects: BoundedVec<Option<Select>, N>) {
    for i in 0..selects.len() {
        let select = selects.get_unchecked(i).unwrap_unchecked();
        let value_field =
            extract_property_value_from_selector(packed_note, select.property_selector);

        assert(
            compare(value_field, select.comparator, select.value.to_field()),
            "Mismatch return note field.",
        );
    }
}

fn check_notes_order<let N: u32>(
    fields_0: [Field; N],
    fields_1: [Field; N],
    sorts: BoundedVec<Option<Sort>, N>,
) {
    for i in 0..sorts.len() {
        let sort = sorts.get_unchecked(i).unwrap_unchecked();
        let field_0 = extract_property_value_from_selector(fields_0, sort.property_selector);
        let field_1 = extract_property_value_from_selector(fields_1, sort.property_selector);
        let eq = field_0 == field_1;
        let lt = field_0.lt(field_1);
        if sort.order == SortOrder.ASC {
            assert(eq | lt, "Return notes not sorted in ascending order.");
        } else if !eq {
            assert(!lt, "Return notes not sorted in descending order.");
        }
    }
}

pub fn get_note<Note, let N: u32>(
    context: &mut PrivateContext,
    storage_slot: Field,
) -> (RetrievedNote<Note>, Field)
where
    Note: NoteType + NoteHash + Packable<N>,
{
    // Safety: Constraining that we got a valid note from the oracle is fairly straightforward: all we need to do
    // is check that the metadata is correct, and that the note exists.
    let retrieved_note = unsafe { get_note_internal::<Note, N>(storage_slot) };

    // For settled notes, the contract address is implicitly checked since the hash returned from
    // `compute_note_hash_for_read_request` is siloed and kernels verify the siloing during note read request
    // validation. Pending notes however are read with the unsiloed note hash, so we need to check that the contract
    // address returned from the oracle matches. Since branching in circuits is expensive, we perform this check on all
    // note types.
    assert(
        retrieved_note.contract_address.eq(context.this_address()),
        "Note contract address mismatch.",
    );

    let note_hash_for_read_request =
        compute_note_hash_for_read_request(retrieved_note, storage_slot);
    context.push_note_hash_read_request(note_hash_for_read_request);

    (retrieved_note, note_hash_for_read_request)
}

/// Returns a BoundedVec of notes that have been proven to have been created by this contract, either in the current or
/// past transactions (i.e. pending or settled notes). A second BoundedVec contains the note hashes used for the read
/// requests, which can save constraints when computing the note's nullifiers.
///
/// WARNING: recall that notes are never destroyed! Note existence therefore does not imply that the note is _current_
/// or _valid_ - this typically requires also emitting the note's nullifier to prove that it had not been emitted
/// before. Because of this, calling this function directly from end-user applications should be discouraged, and safe
/// abstractions such as aztec-nr's state variables should be used instead.
pub fn get_notes<Note, let N: u32, PREPROCESSOR_ARGS, FILTER_ARGS>(
    context: &mut PrivateContext,
    storage_slot: Field,
    options: NoteGetterOptions<Note, N, PREPROCESSOR_ARGS, FILTER_ARGS>,
    ) -> (BoundedVec<RetrievedNote<Note>, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>, BoundedVec<Field, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>)
where
    Note: NoteType + NoteHash + Eq + Packable<N>,
{
    // Safety: The notes are constrained below.
    let opt_notes = unsafe { get_notes_internal(storage_slot, options) };

    // We apply the constraints in a separate function instead of inlining them here to make it easier to test that
    // these checks correctly reject bad notes.
    constrain_get_notes_internal(context, storage_slot, opt_notes, options)
}

unconstrained fn apply_preprocessor<Note, PREPROCESSOR_ARGS>(
    notes: [Option<Note>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL],
    preprocessor: fn([Option<Note>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL], PREPROCESSOR_ARGS) -> [Option<Note>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL],
    preprocessor_args: PREPROCESSOR_ARGS,
) -> [Option<Note>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL] {
    preprocessor(notes, preprocessor_args)
}

fn constrain_get_notes_internal<Note, let N: u32, PREPROCESSOR_ARGS, FILTER_ARGS>(
    context: &mut PrivateContext,
    storage_slot: Field,
    opt_notes: [Option<RetrievedNote<Note>>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL],
    options: NoteGetterOptions<Note, N, PREPROCESSOR_ARGS, FILTER_ARGS>,
    ) -> (BoundedVec<RetrievedNote<Note>, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>, BoundedVec<Field, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>)
where
    Note: NoteType + NoteHash + Eq + Packable<N>,
{
    // The filter is applied first to avoid pushing note read requests for notes we're not interested in. Note that
    // while the filter function can technically mutate the notes (as opposed to simply removing some), the private
    // kernel will later validate that these note actually exist, so transformations would cause for that check
    // to fail.
    let filter_fn = options.filter;
    let filter_args = options.filter_args;
    let filtered_notes = filter_fn(opt_notes, filter_args);

    let notes = array::collapse(filtered_notes);
    let mut note_hashes = BoundedVec::new();

    // We have now collapsed the sparse array of Options into a BoundedVec. This is a more ergonomic type and also
    // results in reduced gate counts when setting a limit value, since we guarantee that the limit is an upper bound
    // for the runtime length, and can therefore have fewer loop iterations.
    assert(notes.len() <= options.limit, "Got more notes than limit.");

    let mut prev_packed_note = [0; N];
    for i in 0..options.limit {
        if i < notes.len() {
            let retrieved_note = notes.get_unchecked(i);

            // For settled notes, the contract address is implicitly checked since the hash returned from
            // `compute_note_hash_for_read_request` is siloed and kernels verify the siloing during note read request
            // validation. Pending notes however are read with the unsiloed note hash, so we need to check that the
            // contract address returned from the oracle matches. Since branching in circuits is expensive, we perform
            // this check on all note types.
            assert(
                retrieved_note.contract_address.eq(context.this_address()),
                "Note contract address mismatch.",
            );

            let packed_note = retrieved_note.note.pack();
            check_packed_note(packed_note, options.selects);
            if i != 0 {
                check_notes_order(prev_packed_note, packed_note, options.sorts);
            }
            prev_packed_note = packed_note;

            let note_hash_for_read_request =
                compute_note_hash_for_read_request(retrieved_note, storage_slot);
            context.push_note_hash_read_request(note_hash_for_read_request);
            note_hashes.push(note_hash_for_read_request);
        };
    }

    (notes, note_hashes)
}

unconstrained fn get_note_internal<Note, let N: u32>(storage_slot: Field) -> RetrievedNote<Note>
where
    Note: NoteType + Packable<N>,
{
    let opt_notes: [_; 1] = oracle::notes::get_notes(
        storage_slot,
        0,
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        1, // limit
        0, // offset
        NoteStatus.ACTIVE,
    );

    opt_notes[0].expect(f"Failed to get a note") // Notice: we don't allow dummies to be returned from get_note (singular).
}

unconstrained fn get_notes_internal<Note, let N: u32, PREPROCESSOR_ARGS, FILTER_ARGS>(
    storage_slot: Field,
    options: NoteGetterOptions<Note, N, PREPROCESSOR_ARGS, FILTER_ARGS>,
) -> [Option<RetrievedNote<Note>>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL]
where
    Note: NoteType + Packable<N>,
{
    // This function simply performs some transformations from NoteGetterOptions into the types required by the oracle.
    let (num_selects, select_by_indexes, select_by_offsets, select_by_lengths, select_values, select_comparators, sort_by_indexes, sort_by_offsets, sort_by_lengths, sort_order) =
        flatten_options(options.selects, options.sorts);

    let opt_notes = oracle::notes::get_notes(
        storage_slot,
        num_selects,
        select_by_indexes,
        select_by_offsets,
        select_by_lengths,
        select_values,
        select_comparators,
        sort_by_indexes,
        sort_by_offsets,
        sort_by_lengths,
        sort_order,
        options.limit,
        options.offset,
        options.status,
    );

    apply_preprocessor(opt_notes, options.preprocessor, options.preprocessor_args)
}

/// Unconstrained variant of `get_notes`, meant to be used in unconstrained execution contexts. Notably only the note
/// content is returned, and not any of the information used when proving its existence (e.g. note nonce, note hash,
/// etc.).
pub unconstrained fn view_notes<Note, let N: u32>(
    storage_slot: Field,
    options: NoteViewerOptions<Note, N>,
) -> BoundedVec<Note, MAX_NOTES_PER_PAGE>
where
    Note: NoteType + Packable<N> + Eq,
{
    let (num_selects, select_by_indexes, select_by_offsets, select_by_lengths, select_values, select_comparators, sort_by_indexes, sort_by_offsets, sort_by_lengths, sort_order) =
        flatten_options(options.selects, options.sorts);

    // We fetch the notes from the same oracle we use in the constrained case, except we don't bother inspecting the
    // metadata in order to prove existence.
    let opt_notes = oracle::notes::get_notes(
        storage_slot,
        num_selects,
        select_by_indexes,
        select_by_offsets,
        select_by_lengths,
        select_values,
        select_comparators,
        sort_by_indexes,
        sort_by_offsets,
        sort_by_lengths,
        sort_order,
        options.limit,
        options.offset,
        options.status,
    );

    // Even though we don't expect for the opt_notes array to be sparse, collapse is still useful in this case to
    // convert it into a BoundedVec.
    array::collapse(opt_notes).map(
        // view_notes just returns the actual note, so we drop the metadata
        |retrieved_note| retrieved_note.note,
    )
}

unconstrained fn flatten_options<let N: u32>(
    selects: BoundedVec<Option<Select>, N>,
    sorts: BoundedVec<Option<Sort>, N>,
) -> (u8, [u8; N], [u8; N], [u8; N], [Field; N], [u8; N], [u8; N], [u8; N], [u8; N], [u8; N]) {
    let mut num_selects = 0;
    let mut select_by_indexes = [0; N];
    let mut select_by_offsets = [0; N];
    let mut select_by_lengths = [0; N];
    let mut select_values = [0; N];
    let mut select_comparators = [0; N];

    for i in 0..selects.len() {
        let select = selects.get(i);
        if select.is_some() {
            select_by_indexes[num_selects as u32] =
                select.unwrap_unchecked().property_selector.index;
            select_by_offsets[num_selects as u32] =
                select.unwrap_unchecked().property_selector.offset;
            select_by_lengths[num_selects as u32] =
                select.unwrap_unchecked().property_selector.length;
            select_values[num_selects as u32] = select.unwrap_unchecked().value;
            select_comparators[num_selects as u32] = select.unwrap_unchecked().comparator;
            num_selects += 1;
        };
    }

    let mut sort_by_indexes = [0; N];
    let mut sort_by_offsets = [0; N];
    let mut sort_by_lengths = [0; N];
    let mut sort_order = [0; N];
    for i in 0..sorts.len() {
        let sort = sorts.get(i);
        if sort.is_some() {
            sort_by_indexes[i] = sort.unwrap_unchecked().property_selector.index;
            sort_by_offsets[i] = sort.unwrap_unchecked().property_selector.offset;
            sort_by_lengths[i] = sort.unwrap_unchecked().property_selector.length;
            sort_order[i] = sort.unwrap_unchecked().order;
        };
    }

    (
        num_selects, select_by_indexes, select_by_offsets, select_by_lengths, select_values,
        select_comparators, sort_by_indexes, sort_by_offsets, sort_by_lengths, sort_order,
    )
}
