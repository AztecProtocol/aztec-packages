use dep::aztec::note::{
    note_header::NoteHeader,
    note_interface::NoteInterface,
    utils::compute_note_hash_for_read_or_nullify,
};
use dep::aztec::oracle::{
    get_secret_key::get_secret_key,
    get_public_key::get_public_key,
};

global PROFILE_LEN: Field = 2;

struct Profile {
    avatar: Field,
    xp: Field,
    header: NoteHeader,
}

impl Profile {
    fn new(avatar: Field, xp: Field) -> Self {
        Profile {
            avatar,
            xp,
            header: NoteHeader::empty(),
        }
    }

    fn serialise(self) -> [Field; PROFILE_LEN] {
        [self.avatar, self.xp]
    }

    fn deserialise(preimage: [Field; PROFILE_LEN]) -> Self {
        Profile {
            avatar: preimage[1],
            xp: preimage[0],
            header: NoteHeader::empty(),
        }
    }

    fn compute_note_hash(self) -> Field {
        dep::std::hash::pedersen([
            self.avatar, 
            self.xp,
        ])[0]
    }

    fn compute_nullifier(_self: Self) -> Field {
        assert(false); // Not allowed.
        0
    }

    fn set_header(&mut self, header: NoteHeader) {
        self.header = header;
    }
}

fn deserialise(preimage: [Field; PROFILE_LEN]) -> Profile {
    Profile::deserialise(preimage)
}

fn serialise(note: Profile) -> [Field; PROFILE_LEN] {
    note.serialise()
}

fn compute_note_hash(note: Profile) -> Field {
    note.compute_note_hash()
}

fn compute_nullifier(note: Profile) -> Field {
    note.compute_nullifier()
}

fn get_header(note: Profile) -> NoteHeader {
    note.header
}

fn set_header(note: &mut Profile, header: NoteHeader) {
    note.set_header(header)
}

global ProfileMethods = NoteInterface {
    deserialise,
    serialise,
    compute_note_hash,
    compute_nullifier,
    get_header,
    set_header,
};
