use crate::note::{note_interface::NoteType, retrieved_note::RetrievedNote};
use dep::protocol_types::{
    constants::MAX_NOTE_HASH_READ_REQUESTS_PER_CALL,
    traits::{Packable, ToField},
};
use std::option::Option;

pub struct PropertySelector {
    pub index: u8, // index of the field in the serialized note array
    pub offset: u8, // offset in the byte representation of the field (selected with index above) from which to reading
    pub length: u8, // number of bytes to read after the offset
}

pub struct Select {
    pub(crate) property_selector: PropertySelector,
    pub(crate) comparator: u8,
    pub(crate) value: Field,
}

impl Select {
    // The selected property will be the left hand side and value the right hand side of the operation, so e.g. the
    // object created by new(property, Comparator.GT, value) represents 'property > value'.
    pub fn new(property_selector: PropertySelector, comparator: u8, value: Field) -> Self {
        Select { property_selector, comparator, value }
    }
}

pub struct SortOrderEnum {
    pub DESC: u8,
    pub ASC: u8,
}

pub global SortOrder: SortOrderEnum = SortOrderEnum { DESC: 1, ASC: 2 };

pub struct Sort {
    pub(crate) property_selector: PropertySelector,
    pub(crate) order: u8,
}

impl Sort {
    pub fn new(property_selector: PropertySelector, order: u8) -> Self {
        Sort { property_selector, order }
    }
}

pub struct NoteStatusEnum {
    pub ACTIVE: u8,
    pub ACTIVE_OR_NULLIFIED: u8,
}

pub global NoteStatus: NoteStatusEnum = NoteStatusEnum {
    ACTIVE: 1,
    ACTIVE_OR_NULLIFIED: 2,
    // TODO 4217: add 'NULLIFIED'
};

// This is the default filter and preprocessor, which does nothing
fn return_all_notes<Note>(
    notes: [Option<RetrievedNote<Note>>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL],
    _p: Field,
) -> [Option<RetrievedNote<Note>>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL] {
    notes
}

pub struct NoteGetterOptions<Note, let N: u32, PreprocessorArgs, FilterArgs> {
    pub selects: BoundedVec<Option<Select>, N>,
    pub sorts: BoundedVec<Option<Sort>, N>,
    pub limit: u32,
    pub offset: u32,
    // Preprocessor and filter functions are used to filter notes. The preprocessor is applied before the filter and
    // unlike filter it is applied in an unconstrained context.
    pub preprocessor: fn([Option<RetrievedNote<Note>>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL], PreprocessorArgs) -> [Option<RetrievedNote<Note>>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL],
    pub preprocessor_args: PreprocessorArgs,
    pub filter: fn([Option<RetrievedNote<Note>>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL], FilterArgs) -> [Option<RetrievedNote<Note>>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL],
    pub filter_args: FilterArgs,
    pub status: u8,
}

// When retrieving notes using the NoteGetterOptions, the configurations are applied in a specific sequence to ensure
// precise and controlled data retrieval.
// The database-level configurations are applied first:
// `selects` to specify fields, `sorts` to establish sorting criteria, `offset` to skip items, and `limit` to cap
// the result size.
// And finally, a custom preprocessor and filter to refine the outcome further.
impl<Note, let N: u32, PreprocessorArgs, FilterArgs> NoteGetterOptions<Note, N, PreprocessorArgs, FilterArgs> {
    // This method adds a `Select` criterion to the options.
    // It takes a property_selector indicating which field to select,
    // a value representing the specific value to match in that field, and
    // a comparator (For possible values of comparators, please see the Comparator enum from `utils::comparison`)
    pub fn select<T>(
        &mut self,
        property_selector: PropertySelector,
        comparator: u8,
        value: T,
    ) -> Self
    where
        T: ToField,
    {
        self.selects.push(Option::some(Select::new(property_selector, comparator, value.to_field())));
        *self
    }

    // This method adds a `Sort` criterion to the options.
    // It takes a field_index indicating which field to sort by and an order (SortOrder) to determine the sorting direction.
    pub fn sort(&mut self, property_selector: PropertySelector, order: u8) -> Self {
        self.sorts.push(Option::some(Sort::new(property_selector, order)));
        *self
    }

    // This method lets you set a limit for the maximum number of notes to be retrieved in a single query result.
    pub fn set_limit(&mut self, limit: u32) -> Self {
        assert(limit <= MAX_NOTE_HASH_READ_REQUESTS_PER_CALL as u32);
        if !dep::std::runtime::is_unconstrained() {
            // By requesting that the limit is a constant, we guarantee that it will be possible to loop over it, reducing
            // gate counts when a limit has been set.
            assert_constant(limit);
        }

        self.limit = limit;
        *self
    }

    // This method sets the offset value, which determines where to start retrieving notes in the query results.
    pub fn set_offset(&mut self, offset: u32) -> Self {
        self.offset = offset;
        *self
    }

    // This method sets the status value, which determines whether to retrieve active or nullified notes.
    pub fn set_status(&mut self, status: u8) -> Self {
        self.status = status;
        *self
    }
}

impl<Note, let M: u32> NoteGetterOptions<Note, M, Field, Field>
where
    Note: NoteType + Packable<N = M>,
{
    // This function initializes a NoteGetterOptions that simply returns the maximum number of notes allowed in a call.
    pub fn new() -> Self {
        Self {
            selects: BoundedVec::<_, <Note as Packable>::N>::new(),
            sorts: BoundedVec::<_, <Note as Packable>::N>::new(),
            limit: MAX_NOTE_HASH_READ_REQUESTS_PER_CALL as u32,
            offset: 0,
            preprocessor: return_all_notes,
            preprocessor_args: 0,
            filter: return_all_notes,
            filter_args: 0,
            status: NoteStatus.ACTIVE,
        }
    }
}

impl<Note, let M: u32, PreprocessorArgs> NoteGetterOptions<Note, M, PreprocessorArgs, Field>
where
    Note: NoteType + Packable<N = M>,
{
    // This function initializes a NoteGetterOptions with a preprocessor, which takes the notes returned from
    // the database and preprocessor_args as its parameters.
    // `preprocessor_args` allows you to provide additional data or context to the custom preprocessor.
    pub fn with_preprocessor(
        preprocessor: fn([Option<RetrievedNote<Note>>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL], PreprocessorArgs) -> [Option<RetrievedNote<Note>>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL],
        preprocessor_args: PreprocessorArgs,
    ) -> Self {
        Self {
            selects: BoundedVec::new(),
            sorts: BoundedVec::new(),
            limit: MAX_NOTE_HASH_READ_REQUESTS_PER_CALL as u32,
            offset: 0,
            preprocessor,
            preprocessor_args,
            filter: return_all_notes,
            filter_args: 0,
            status: NoteStatus.ACTIVE,
        }
    }
}

impl<Note, let M: u32, FilterArgs> NoteGetterOptions<Note, M, Field, FilterArgs>
where
    Note: NoteType + Packable<N = M>,
{
    // This function initializes a NoteGetterOptions with a filter, which takes
    // the notes returned from the database and filter_args as its parameters.
    // `filter_args` allows you to provide additional data or context to the custom filter.
    pub fn with_filter(
        filter: fn([Option<RetrievedNote<Note>>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL], FilterArgs) -> [Option<RetrievedNote<Note>>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL],
        filter_args: FilterArgs,
    ) -> Self {
        Self {
            selects: BoundedVec::new(),
            sorts: BoundedVec::new(),
            limit: MAX_NOTE_HASH_READ_REQUESTS_PER_CALL as u32,
            offset: 0,
            preprocessor: return_all_notes,
            preprocessor_args: 0,
            filter,
            filter_args,
            status: NoteStatus.ACTIVE,
        }
    }
}
