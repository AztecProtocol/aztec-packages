use dep::aztec::note::{
    note_header::NoteHeader,
    note_interface::NoteInterface,
    utils::compute_note_hash_for_read_or_nullify,
};

global RULES_LEN: Field = 2;

struct Rules {
    min_points: u8,
    max_points: u8,
    header: NoteHeader,
}

impl Rules {
    fn new(min_points: u8, max_points: u8) -> Self {
        Rules {
            min_points,
            max_points,
            header: NoteHeader::empty(),
        }
    }

    fn serialise(self) -> [Field; RULES_LEN] {
        [self.min_points as Field, self.max_points as Field]
    }

    fn deserialise(preimage: [Field; RULES_LEN]) -> Self {
        Rules {
            min_points: preimage[0] as u8,
            max_points: preimage[1] as u8,
            header: NoteHeader::empty(),
        }
    }

    fn compute_note_hash(self) -> Field {
        dep::std::hash::pedersen([
            self.min_points as Field, 
            self.max_points as Field, 
        ])[0]
    }

    fn compute_nullifier(_self: Self) -> Field {
        // Not used
        0
    }

    fn set_header(&mut self, header: NoteHeader) {
        self.header = header;
    }
}

fn deserialise(preimage: [Field; RULES_LEN]) -> Rules {
    Rules::deserialise(preimage)
}

fn serialise(note: Rules) -> [Field; RULES_LEN] {
    note.serialise()
}

fn compute_note_hash(note: Rules) -> Field {
    note.compute_note_hash()
}

fn compute_nullifier(note: Rules) -> Field {
    note.compute_nullifier()
}

fn get_header(note: Rules) -> NoteHeader {
    note.header
}

fn set_header(note: &mut Rules, header: NoteHeader) {
    note.set_header(header)
}

global RulesMethods = NoteInterface {
    deserialise,
    serialise,
    compute_note_hash,
    compute_nullifier,
    get_header,
    set_header,
};
