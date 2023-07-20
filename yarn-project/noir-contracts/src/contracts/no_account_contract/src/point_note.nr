use dep::std::hash::pedersen;
use dep::aztec::note::note_interface::NoteInterface;
use dep::aztec::note::note_header::NoteHeader;
use dep::aztec::note::utils::compute_siloed_note_hash;
use dep::aztec::oracle::get_secret_key::get_secret_key;
use dep::aztec::oracle::get_public_key::get_public_key;

global POINT_NOTE_LEN: Field = 2;

struct PointNote {
    x: Field,
    y: Field,
    header: NoteHeader,
}

impl PointNote {
    fn new(x: Field, y: Field) -> Self {
        PointNote {
            x,
            y,
            header: NoteHeader::empty(),
        }
    }

    fn serialise(self) -> [Field; POINT_NOTE_LEN] {
        let mut res: [Field; POINT_NOTE_LEN] = [0; POINT_NOTE_LEN];
        res[0] = self.x;
        res[1] = self.y;
        res
    }

    fn compute_nullifier(self) -> Field {
        let siloed_note_hash = compute_siloed_note_hash(PointNoteInterface, self);
        let owner_nullifying_public_key = get_public_key(self.x);
        let secret = get_secret_key(owner_nullifying_public_key);
        dep::std::hash::pedersen([
            siloed_note_hash,
            secret,
        ])[0]
    }

    fn set_header(mut self: Self, header: NoteHeader) -> Self {
        self.header = header;
        self
    }

    fn dummy() -> Self {
        PointNote {
            x: 0,
            y: 0,
            header: NoteHeader::empty(),
        }
    }

    fn is_dummy(self) -> bool {
        (self.x == 0) & (self.y == 0)
    }
}

fn deserialise(preimage: [Field; POINT_NOTE_LEN]) -> PointNote {
    PointNote {
        x: preimage[0],
        y: preimage[1],
        header: NoteHeader::empty(),
    }
}

fn serialise(note: PointNote) -> [Field; POINT_NOTE_LEN] {
    note.serialise()
}

fn compute_note_hash(note: PointNote) -> Field {
    dep::std::hash::pedersen(note.serialise())[0]
}

fn compute_nullifier(note: PointNote) -> Field {
    note.compute_nullifier()
}

fn dummy() -> PointNote {
    PointNote::dummy()
}

fn is_dummy(note: PointNote) -> bool {
    note.is_dummy()
}

fn get_header(note: PointNote) -> NoteHeader {
    note.header
}

fn set_header(note: PointNote, header: NoteHeader) -> PointNote {
    note.set_header(header)
}

global PointNoteInterface = NoteInterface {
    deserialise,
    serialise,
    compute_note_hash,
    compute_nullifier,
    dummy,
    is_dummy,
    get_header,
    set_header,
};
