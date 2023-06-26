use dep::aztec::note::note_interface::NoteInterface;
use dep::aztec::oracle;
use crate::call_context;
use crate::notes::generators;

global PROFILE_NOTE_LEN: Field = 3;

struct ProfileNote {
    address: Field,
    score: Field,
    randomness: Field,
}

impl ProfileNote {
    fn new(address: Field, score: Field) -> Self {
        let randomness = oracle::rand();
        ProfileNote { address, score, randomness }
    }

    fn serialise(self) -> [Field; PROFILE_NOTE_LEN] {
        [self.address, self.score, self.randomness]
    }

    fn dummy() -> Self {
        ProfileNote {
            address: 0,
            score: 0,
            randomness: 0,
        }
    }
}

fn replicate_profile_note(note: ProfileNote) -> ProfileNote {
    let new_note = ProfileNote::new(note.address, note.score);
    assert(new_note.randomness != note.randomness);
    new_note
}

fn deserialise(preimage: [Field; PROFILE_NOTE_LEN]) -> ProfileNote {
  ProfileNote {
    address: preimage[0],
    score: preimage[1],
    randomness: preimage[2],
  }
}

fn serialise(note: ProfileNote) -> [Field; PROFILE_NOTE_LEN] {
    note.serialise()
}

fn compute_note_hash(note: ProfileNote) -> Field {
    dep::std::hash::pedersen([
        generators::PROFILE_NOTE_GENERATOR,
        note.address, 
        note.score, 
    ])[0]
}

fn compute_nullifier(note: ProfileNote) -> Field {
    let note_hash = compute_note_hash(note);
    let secret = oracle::get_secret(call_context.msg_sender);
    dep::std::hash::pedersen([
        note_hash,
        secret, 
    ])[0]
}

fn dummy() -> ProfileNote {
    ProfileNote::dummy()
}

fn is_dummy(note: ProfileNote) -> bool {
    note.address == 0
}

global ProfileNoteInterface = NoteInterface {
    deserialise,
    serialise,
    compute_note_hash,
    compute_nullifier,
    dummy,
    is_dummy,
};
