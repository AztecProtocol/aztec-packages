mod test_note;

// A contract used for testing a random hodgepodge of small features from simulator and end-to-end tests.
use dep::aztec::macros::aztec;

#[aztec]
contract Test {
    use dep::aztec::prelude::{
        PrivateImmutable, PrivateSet
    };
    use dep::aztec::encrypted_logs::encrypted_note_emission::encode_and_encrypt_note;
    use dep::aztec::encrypted_logs::encrypted_event_emission::encode_and_encrypt_event_with_randomness;

    use dep::aztec::protocol_types::{constants::MAX_NOTE_HASH_READ_REQUESTS_PER_CALL, traits::Serialize, point::Point};

    use dep::aztec::note::constants::MAX_NOTES_PER_PAGE;
    use dep::aztec::keys::getters::get_public_keys;

    use dep::aztec::{
        keys::public_keys::IvpkM,
        note::{
        lifecycle::{create_note, destroy_note_unsafe}, note_getter::{get_notes, view_notes},
        note_getter_options::NoteStatus
    },
        deploy::deploy_contract as aztec_deploy_contract, oracle::unsafe_rand::unsafe_rand,
        utils::comparison::Comparator,
        macros::{storage::storage, events::event, functions::{private, public, internal}}
    };

    use crate::test_note::TestNote;
    use aztec::keys::public_keys::OvpkM;

    #[storage]
    struct Storage<Context> {
        example_constant: PrivateImmutable<TestNote, Context>,
        example_set: PrivateSet<TestNote, Context>,
    }

    // For testing non-note encrypted logs
    #[private]
    fn emit_array_as_encrypted_log(cond: bool) {
        // side_effect_counter == 7
        assert(context.side_effect_counter as Field != 0, "this assert should not be triggered");

        // Print a unique constant so that this position is more easily found in SSA printouts
        println(340_282_366_920_938_463_463_374_607_431_768_211_455);
        if cond {
            encode_and_encrypt_event_with_randomness(&mut context)();
        }
        println(340_282_366_920_938_463_463_374_607_431_768_211_455);

        // For whatever reason after the if branch above the side_effect_counter gets reset to 0 on the context.
        // This should never happen as the counter is always just incremented.
        assert(context.side_effect_counter as Field != 0, "this assert should be triggered if bug reproduction succeeded");
    }
}


fn main(
    inputs: dep::aztec::context::inputs::PrivateContextInputs,
    cond: bool,
) -> pub Field {
    Test::emit_array_as_encrypted_log(inputs, cond);
    0
}
