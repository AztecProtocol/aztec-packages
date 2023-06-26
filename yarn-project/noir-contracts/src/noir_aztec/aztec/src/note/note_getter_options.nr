use crate::abi::MAX_READ_REQUESTS;

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

struct NoteGetterOptions<Note, N, S, P> {
    sort_by: [Sort; N],
    skip: u8,
    filter: fn ([Note; MAX_READ_REQUESTS], P) -> [Note; S],
    filter_args: P,
}

impl<Note, N, S, P> NoteGetterOptions<Note, N, S, P> {
    fn new(
        filter: fn ([Note; MAX_READ_REQUESTS], P) -> [Note; S],
        filter_args: P,
    ) -> Self {
        NoteGetterOptions {
            sort_by: [Sort::nada(); N],
            skip: 0,
            filter,
            filter_args,
        }
    }

    fn set_skip(mut self: Self, skip: u8) -> Self {
        self.skip = skip;
        self
    }

    fn set_sort(mut self: Self, sort_by: [Sort; N]) -> Self {
        self.sort_by = sort_by;
        self
    }

    fn set_filter(
        mut self: Self,
        filter: fn ([Note; MAX_READ_REQUESTS], P) -> [Note; S],
        filter_args: P,
    ) -> Self {
        self.filter = filter;
        self.filter_args = filter_args;
        self
    }
}

fn first_n_notes<Note, S>(notes: [Note; MAX_READ_REQUESTS], mut res: [Note; S]) -> [Note; S] {
    for i in 0..res.len() {
        res[i] = notes[i];
    };
    res
}

fn first_1_notes<Note>(notes: [Note; MAX_READ_REQUESTS]) -> [Note; 1] {
    first_n_notes(notes, [notes[0]])
}