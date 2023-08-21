use dep::std::option::Option;
use crate::types::vec::BoundedVec;
use crate::constants_gen::MAX_READ_REQUESTS_PER_CALL;

struct Select {
    field_index: u8,
    value: Field,
}

impl Select {
    fn new(field_index: u8, value: Field) -> Self {
        Select { field_index, value }
    }
}

struct SortOrderEnum {
    DESC: u2,
    ASC: u2,
    NADA: u2,
}

global SortOrder = SortOrderEnum {
    DESC: 1,
    ASC: 2,
    NADA: 0,
};

struct Sort {
    field_index: u8,
    order: u2,
}

impl Sort {
    fn new(field_index: u8, order: u2) -> Self {
        Sort { field_index, order }
    }

    fn nada() -> Self {
        Sort { field_index: 0, order: SortOrder.NADA }
    }
}

fn return_all_notes<Note, N>(notes: [Option<Note>; MAX_READ_REQUESTS_PER_CALL], _p: Field) -> [Option<Note>; MAX_READ_REQUESTS_PER_CALL] {
    notes
}

// docs:start:NoteGetterOptions
struct NoteGetterOptions<Note, N, FILTER_ARGS> {
    selects: BoundedVec<Option<Select>, N>,
    sorts: BoundedVec<Option<Sort>, N>,
    limit: u32,
    offset: u32,
    filter: fn ([Option<Note>; MAX_READ_REQUESTS_PER_CALL], FILTER_ARGS) -> [Option<Note>; MAX_READ_REQUESTS_PER_CALL],
    filter_args: FILTER_ARGS,
}
// docs:end:NoteGetterOptions

impl<Note, N, FILTER_ARGS> NoteGetterOptions<Note, N, FILTER_ARGS> {
    fn new() -> NoteGetterOptions<Note, N, Field> {
        NoteGetterOptions {
            selects: BoundedVec::new(Option::none()),
            sorts: BoundedVec::new(Option::none()),
            limit: MAX_READ_REQUESTS_PER_CALL as u32,
            offset: 0,
            filter: return_all_notes,
            filter_args: 0,
        }
    }

    fn with_filter(
        filter: fn ([Option<Note>; MAX_READ_REQUESTS_PER_CALL], FILTER_ARGS) -> [Option<Note>; MAX_READ_REQUESTS_PER_CALL],
        filter_args: FILTER_ARGS,
    ) -> Self {
         NoteGetterOptions {
            selects: BoundedVec::new(Option::none()),
            sorts: BoundedVec::new(Option::none()),
            limit: 0,
            offset: 0,
            filter,
            filter_args,
        }
    }

    fn select(&mut self, field_index: u8, value: Field) -> Self {
        self.selects.push(Option::some(Select::new(field_index, value)));
        *self
    }

    fn sort(&mut self, field_index: u8, order: u2) -> Self {
        self.sorts.push(Option::some(Sort::new(field_index, order)));
        *self
    }

    fn set_limit(&mut self, limit: u32) -> Self {
        assert(limit <= MAX_READ_REQUESTS_PER_CALL as u32);
        self.limit = limit;
        *self
    }

    fn set_offset(&mut self, offset: u32) -> Self {
        self.offset = offset;
        *self
    }
}
