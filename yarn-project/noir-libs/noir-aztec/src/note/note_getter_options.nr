use dep::std::option::Option;
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
    DESC: u8,
    ASC: u8,
    NADA: u8,
}

global SortOrder = SortOrderEnum {
    DESC: 1,
    ASC: 2,
    NADA: 0,
};

struct Sort {
    field_index: u8,
    order: u8,
}

impl Sort {
    fn new(field_index: u8, order: u8) -> Self {
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
struct NoteGetterOptions<Note, N, NUM_RETURN_NOTES, FILTER_ARGS> {
    selects: [Option<Select>; N],
    sorts: [Option<Sort>; N],
    offset: u32,
    filter: fn ([Option<Note>; MAX_READ_REQUESTS_PER_CALL], FILTER_ARGS) -> [Option<Note>; NUM_RETURN_NOTES],
    filter_args: FILTER_ARGS,
}
// docs:end:NoteGetterOptions

impl<Note, N, NUM_RETURN_NOTES, FILTER_ARGS> NoteGetterOptions<Note, N, NUM_RETURN_NOTES, FILTER_ARGS> {
    fn new() -> NoteGetterOptions<Note, N, MAX_READ_REQUESTS_PER_CALL, Field> {
        NoteGetterOptions {
            selects: [Option::none(); N],
            sorts: [Option::none(); N],
            offset: 0,
            filter: return_all_notes,
            filter_args: 0,
        }
    }

    fn with_filter(
        filter: fn ([Option<Note>; MAX_READ_REQUESTS_PER_CALL], FILTER_ARGS) -> [Option<Note>; NUM_RETURN_NOTES],
        filter_args: FILTER_ARGS,
    ) -> Self {
         NoteGetterOptions {
            selects: [Option::none(); N],
            sorts: [Option::none(); N],
            offset: 0,
            filter,
            filter_args,
        }
    }

    fn select(&mut self, field_index: u8, value: Field) -> Self {
        let mut selects = self.selects;
        let mut updated = false;
        for i in 0..selects.len() {
            if !updated & selects[i].is_none() {
                selects[i] = Option::some(Select::new(field_index, value));
                updated = true;
            }
        }
        self.selects = selects;
        *self
    }

    fn sort(&mut self, field_index: u8, order: u8) -> Self {
        let mut sorts = self.sorts;
        let mut updated = false;
        for i in 0..sorts.len() {
            if !updated & sorts[i].is_none() {
                sorts[i] = Option::some(Sort::new(field_index, order));
                updated = true;
            }
        }
        self.sorts = sorts;
        *self
    }

    fn set_offset(&mut self, offset: u32) -> Self {
        self.offset = offset;
        *self
    }
}
