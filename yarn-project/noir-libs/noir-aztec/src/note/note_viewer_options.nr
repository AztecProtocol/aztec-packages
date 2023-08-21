use dep::std::option::Option;
use crate::constants_gen::MAX_NOTES_PER_PAGE;
use crate::note::note_getter_options::{Select, Sort};
use crate::utils::get_array_size;

// docs:start:NoteViewerOptions
struct NoteViewerOptions<Note, N> {
    selects: [Option<Select>; N],
    sorts: [Option<Sort>; N],
    limit: u32,
    offset: u32,
}
// docs:end:NoteViewerOptions

impl<Note, N> NoteViewerOptions<Note, N> {
    fn new() -> NoteViewerOptions<Note, N> {
        NoteViewerOptions {
            selects: [Option::none(); N],
            sorts: [Option::none(); N],
            limit: MAX_NOTES_PER_PAGE as u32,
            offset: 0,
        }
    }

   fn select(&mut self, field_index: u8, value: Field) -> Self {
        let idx = get_array_size(self.selects);
        self.selects[idx] = Option::some(Select::new(field_index, value));
        *self
    }

    fn sort(&mut self, field_index: u8, order: u2) -> Self {
        let idx = get_array_size(self.sorts);
        self.sorts[idx] = Option::some(Sort::new(field_index, order));
        *self
    }

    fn set_limit(&mut self, limit: u32) -> Self {
        assert(limit <= MAX_NOTES_PER_PAGE as u32);
        self.limit = limit;
        *self
    }

    fn set_offset(&mut self, offset: u32) -> Self {
        self.offset = offset;
        *self
    }
}
