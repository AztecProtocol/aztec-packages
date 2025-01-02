use crate::test_note::TestNote;
use dep::uint_note::uint_note::UintNote;
use dep::value_note::value_note::ValueNote;

#[test]
unconstrained fn test_note_type_id() {
    assert_eq(UintNote::get_note_type_id(), 0, "UintNote type id should be 0");
    assert_eq(ValueNote::get_note_type_id(), 1, "ValueNote type id should be 1");
    assert_eq(TestNote::get_note_type_id(), 2, "TestNote type id should be 2");
}
