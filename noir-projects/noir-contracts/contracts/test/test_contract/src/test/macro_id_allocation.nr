use crate::{Test, test_note::TestNote};
use address_note::address_note::AddressNote;
use aztec::note::note_interface::NoteType;
use uint_note::uint_note::UintNote;

#[test]
unconstrained fn note_type_id_allocation() {
    // The order in which the note types are sorted seems arbitrary and an implementation detail of Noir,
    // but the important thing is that they are sequential and start from 0.
    assert_eq(AddressNote::get_id(), 0);
    assert_eq(UintNote::get_id(), 1);
    assert_eq(TestNote::get_id(), 2);
}

#[test]
unconstrained fn storage_slot_allocation() {
    // This tests that sufficient storage slots are assigned to each state variable so that they do not interfere with
    // one another. State variable that use private state should always occupy just one slot (since it's just an
    // identifier), and variables that use public storage typically have it determined by some function of the
    // packed length of the value they hold. This is specified through the `Storage` trait.
    //
    // This is the storage declaration:
    //
    // #[storage]
    // struct Storage<Context> {
    //   note_in_private_immutable: PrivateImmutable<TestNote, Context>,
    //   struct_in_private_immutable: PrivateImmutable<ExampleStruct, Context>,
    //   note_in_private_mutable: PrivateMutable<TestNote, Context>,
    //   struct_in_private_mutable: PrivateMutable<ExampleStruct, Context>,
    //   note_in_private_set: PrivateSet<AddressNote, Context>,
    //   struct_in_private_set: PrivateSet<ExampleStruct, Context>,
    //   note_in_public_immutable: PublicImmutable<TestNote, Context>,
    //   struct_in_public_immutable: PublicImmutable<ExampleStruct, Context>,
    //   struct_in_map: Map<AztecAddress, PrivateImmutable<ExampleStruct, Context>, Context>,
    //   struct_in_delayed_public_mutable: DelayedPublicMutable<ExampleStruct, DELAYED_PUBLIC_MUTABLE_INITIAL_DELAY, Context>,
    //   dummy_variable: PrivateImmutable<TestNote, Context>,
    // }

    // We can't directly see how many slots are allocated to each variable, but we can look at the slot increments for
    // each and deduct the allocation size based off of that. In other words, given a struct with two members a and b,
    // the number of slots allocated to a will be b.storage_slot - a.storage_slot.

    // The first slot is always 1.
    let mut expected_slot = 1;

    assert_eq(Test::storage_layout().note_in_private_immutable.slot, expected_slot);
    // PrivateImmutable uses private storage, and so always uses a single slot, regardless of the packed length of
    // whatever it stores, and regardless of whether it has the #[note] attribute.
    expected_slot += 1;

    assert_eq(Test::storage_layout().struct_in_private_immutable.slot, expected_slot);
    // PrivateImmutable uses private storage, and so always uses a single slot, regardless of the packed length of
    // whatever it stores, and regardless of whether it has the #[note] attribute.
    expected_slot += 1;

    assert_eq(Test::storage_layout().note_in_private_mutable.slot, expected_slot);
    // PrivateMutable uses private storage, and so always uses a single slot, regardless of the packed length of
    // whatever it stores, and regardless of whether it has the #[note] attribute.
    expected_slot += 1;

    assert_eq(Test::storage_layout().struct_in_private_mutable.slot, expected_slot);
    // PrivateMutable uses private storage, and so always uses a single slot, regardless of the packed length of
    // whatever it stores, and regardless of whether it has the #[note] attribute.
    expected_slot += 1;

    assert_eq(Test::storage_layout().note_in_private_set.slot, expected_slot);
    // PrivateSet uses private storage, and so always uses a single slot, regardless of the packed length of whatever it
    // stores, and regardless of whether it has the #[note] attribute.
    expected_slot += 1;

    assert_eq(Test::storage_layout().struct_in_private_set.slot, expected_slot);
    // PrivateSet uses private storage, and so always uses a single slot, regardless of the packed length of whatever it
    // stores, and regardless of whether it has the #[note] attribute.
    expected_slot += 1;

    assert_eq(Test::storage_layout().note_in_public_immutable.slot, expected_slot);
    // note_in_public_immutable should allocate two slots because TestNote packs to a single slot: it needs an extra
    // slot for the hash.
    expected_slot += 2;

    assert_eq(Test::storage_layout().struct_in_public_immutable.slot, expected_slot);
    // struct_in_public_immutable should allocate 6 slots because ExampleStruct packs into 5 slots: it needs an extra
    // slot for the hash.
    expected_slot += 6;

    assert_eq(Test::storage_layout().struct_in_map.slot, expected_slot);
    // Maps always allocate a single slot.
    expected_slot += 1;

    assert_eq(Test::storage_layout().struct_in_delayed_public_mutable.slot, expected_slot);
    // struct_in_delayed_public_mutable should allocate 12 slots because ExampleStruct occupies 5 slots. DelayedPublicMutable stores
    // the value two times (10 slots), and it also stores the time values (one slot) and the hash (another slot).
    expected_slot += 12;

    // dummy_variable exists so that we can test how many slots the last variable was allocated.
    assert_eq(Test::storage_layout().dummy_variable.slot, expected_slot);
}
