use crate::note::constants::MAX_NOTES_PER_PAGE;
use crate::note::note_getter_options::{NoteStatus, PropertySelector, Select, Sort};
use crate::note::note_interface::NoteInterface;
use dep::protocol_types::traits::ToField;
use std::option::Option;

// docs:start:NoteViewerOptions
pub struct NoteViewerOptions<Note, let N: u32> {
    pub selects: BoundedVec<Option<Select>, N>,
    pub sorts: BoundedVec<Option<Sort>, N>,
    pub limit: u32,
    pub offset: u32,
    pub status: u8,
}
// docs:end:NoteViewerOptions

impl<Note, let N: u32> NoteViewerOptions<Note, N> {
    pub fn new() -> NoteViewerOptions<Note, N>
    where
        Note: NoteInterface<N>,
    {
        NoteViewerOptions {
            selects: BoundedVec::new(),
            sorts: BoundedVec::new(),
            limit: MAX_NOTES_PER_PAGE as u32,
            offset: 0,
            status: NoteStatus.ACTIVE,
        }
    }

    // This method adds a `Select` criterion to the options.
    // It takes a field_index indicating which field to select,
    // a value representing the specific value to match in that field, and
    // a comparator (For possible values of comparators, please see the Comparator enum from note_getter_options)
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

    pub fn sort(&mut self, property_selector: PropertySelector, order: u8) -> Self {
        self.sorts.push(Option::some(Sort::new(property_selector, order)));
        *self
    }

    pub fn set_limit(&mut self, limit: u32) -> Self {
        assert(limit <= MAX_NOTES_PER_PAGE as u32);
        // By requesting that the limit is a constant, we guarantee that it will be possible to loop over it, reducing
        // gate counts when a limit has been set.
        if !dep::std::runtime::is_unconstrained() {
            assert_constant(limit);
        }
        self.limit = limit;
        *self
    }

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
