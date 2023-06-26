use dep::aztec::note::note_interface::NoteInterface;
use dep::aztec::oracle;
use crate::call_context;
use crate::notes::generators;

global PRIZE_NOTE_LEN: Field = 2;

struct PrizeNote {
    id: Field,
    value: Field,
}

impl PrizeNote {
    fn new(id: Field, value: Field) -> Self {
        PrizeNote { id, value }
    }

    fn serialise(self) -> [Field; PRIZE_NOTE_LEN] {
        [self.id, self.value]
    }

    fn dummy() -> Self {
        PrizeNote {
            id: 0,
            value: 0,
        }
    }

    fn is_dummy(self) -> bool {
        self.value == 0
    }
}

fn deserialise(preimage: [Field; PRIZE_NOTE_LEN]) -> PrizeNote {
  PrizeNote {
    id: preimage[0],
    value: preimage[1],
  }
}

fn serialise(note: PrizeNote) -> [Field; PRIZE_NOTE_LEN] {
    note.serialise()
}

fn compute_note_hash(note: PrizeNote) -> Field {
    dep::std::hash::pedersen([
        generators::PRIZE_NOTE_GENERATOR,
        note.id, 
        note.value, 
    ])[0]
}

fn compute_nullifier(note: PrizeNote) -> Field {
    let note_hash = compute_note_hash(note);
    let secret = oracle::get_secret(call_context.msg_sender);
    dep::std::hash::pedersen([
        note_hash,
        secret, 
    ])[0]
}

fn dummy() -> PrizeNote {
    PrizeNote::dummy()
}

fn is_dummy(note: PrizeNote) -> bool {
    note.is_dummy()
}

global PrizeNoteInterface = NoteInterface {
    deserialise,
    serialise,
    compute_note_hash,
    compute_nullifier,
    dummy,
    is_dummy,
};
