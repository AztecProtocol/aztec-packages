use dep::aztec::note::note_interface::NoteInterface;
use dep::aztec::oracle;
use crate::call_context;
use crate::notes::generators;

global VALUE_NOTE_LEN: Field = 4;

struct ValueNote {
    value: Field,
    owner: Field,
    randomness: Field,
    is_real: bool
}

impl ValueNote {
    fn new(value: Field, owner: Field) -> Self {
        let randomness = oracle::rand();
        ValueNote {
            value,
            owner,
            randomness,
            is_real: true,
        }
    }

    fn serialise(self) -> [Field; VALUE_NOTE_LEN] {
        [self.value, self.owner, self.randomness, self.is_real as Field]
    }

    fn dummy() -> Self {
        ValueNote {
            value: 0,
            owner: 0,
            randomness: 0,
            is_real: false,
        }
    }
}

fn deserialise(preimage: [Field; VALUE_NOTE_LEN]) -> ValueNote {
    ValueNote {
        value: preimage[0],
        owner: preimage[1],
        randomness: preimage[2],
        is_real: preimage[3] as bool,
    }
}

fn serialise(note: ValueNote) -> [Field; VALUE_NOTE_LEN] {
    note.serialise()
}

fn compute_note_hash(note: ValueNote) -> Field {
    dep::std::hash::pedersen([
        generators::VALUE_NOTE_GENERATOR,
        note.value, 
        note.owner, 
        note.randomness,
        note.is_real as Field,
    ])[0]
}

fn compute_nullifier(note: ValueNote) -> Field {
    let note_hash = compute_note_hash(note);
    let secret = oracle::get_secret(call_context.msg_sender);
    dep::std::hash::pedersen([
        note_hash,
        secret, 
    ])[0]
}

fn dummy() -> ValueNote {
    ValueNote::dummy()
}

fn is_dummy(note: ValueNote) -> bool {
    !note.is_real
}

global ValueNoteInterface = NoteInterface {
    deserialise,
    serialise,
    compute_note_hash,
    compute_nullifier,
    dummy,
    is_dummy,
};
