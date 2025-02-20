use crate::Test;
use crate::test_note::TestNote;
use dep::uint_note::uint_note::UintNote;
use dep::value_note::value_note::ValueNote;

#[test]
unconstrained fn test_note_type_id() {
    // The order in which the note types are sorted seems arbitrary and an implementation detail of Noir,
    // but the important thing is that they are sequential and start from 0.
    assert_eq(UintNote::get_note_type_id(), 0, "UintNote type id should be 0");
    assert_eq(ValueNote::get_note_type_id(), 1, "ValueNote type id should be 1");
    assert_eq(TestNote::get_note_type_id(), 2, "TestNote type id should be 2");
}

#[test]
unconstrained fn test_storage_slot_allocation() {
    // This tests that sufficient storage slots are assigned to each state variable so that they do not interfere with
    // one another. The space a state variable needs is determined by the N value in its implementation of the Storage
    // trait. Most state variables bind N to the packed length of the type they hold.
    //
    // This is the storage declaration:
    //
    // #[storage]
    // struct Storage<Context> {
    //     example_constant: PrivateImmutable<TestNote, Context>,
    //     example_struct_in_shared_mutable: SharedMutable<ExampleStruct, SHARED_MUTABLE_INITIAL_DELAY, Context>,
    //     example_set: PrivateSet<TestNote, Context>,
    //     example_struct: PrivateImmutable<ExampleStruct, Context>,
    //     example_struct_in_public_immutable: PublicImmutable<ExampleStruct, Context>,
    //     example_struct_in_map: Map<AztecAddress, PrivateImmutable<ExampleStruct, Context>, Context>,
    //     another_example_struct: PrivateImmutable<ExampleStruct, Context>,
    // }

    // We can't directly see how many slots are allocated to each variable, but we can look at the slot increments for
    // each and deduct the allocation size based off of that. In other words, given a struct with two members a and b,
    // the number of slots allocated to a will be b.storage_slot - a.storage_slot.

    // The first slot is always 1.
    let mut expected_slot = 1;
    assert_eq(Test::storage_layout().example_constant.slot, expected_slot);
    // Even though example_constant holds TestNote, which packs to a length larger than 1, notes always reserve a
    // single slot.
    expected_slot += 1;

    assert_eq(Test::storage_layout().example_struct_in_shared_mutable.slot, expected_slot);
    expected_slot += get_shared_mutable_num_slots();

    assert_eq(Test::storage_layout().example_set.slot, expected_slot);
    // example_set also held a note, so it should have only allocated a single slot.
    expected_slot += 1;

    assert_eq(Test::storage_layout().example_struct.slot, expected_slot);
    // example_struct allocates 5 slots because it is not a note and it's packed length is 5.
    expected_slot += 5;

    assert_eq(Test::storage_layout().example_struct_in_public_immutable.slot, expected_slot);
    // example_struct_in_public_immutable should allocate 6 slots because ExampleStruct occupies 5 slots
    expected_slot += 6;

    assert_eq(Test::storage_layout().example_struct_in_map.slot, expected_slot);
}

fn get_shared_mutable_num_slots() -> Field {
    // ExampleStruct packs to 5 slots.
    let example_struct_packed_len = 5;

    // ScheduledDelayChange and block_of_change of ScheduledValueChange are stored in a single slot.
    let sdc_and_block_of_change_of_svc_packed_len = 1;

    // There are 2 example structs stored in the packed representation of ScheduledValueChange<ExampleStruct>.
    let value_change_and_delay_change_packed_len =
        example_struct_packed_len * 2 + sdc_and_block_of_change_of_svc_packed_len;

    // Wrapping the values in WithHash adds 1 slot.
    let with_hash_additional_slots = 1;

    value_change_and_delay_change_packed_len + with_hash_additional_slots
}
