use dep::std::option::Option;
use dep::aztec::{
    protocol_types::{
        address::AztecAddress,
        traits::{Serialize, Deserialize, Empty}
    },
    note::{
        note_header::NoteHeader,
        note_interface::NoteInterface,
    },
    oracle::get_public_key::get_public_key,
    log::emit_encrypted_log,
    hash::pedersen_hash,
    context::PrivateContext,
};

global PROFILE_NOTE_LEN: Field = 2;

struct ProfileNote {
    avatar: Field,
    xp: Field,
    maybe_owner: Option<AztecAddress>,
    header: NoteHeader,
}

impl Serialize<PROFILE_NOTE_LEN> for ProfileNote {
    fn serialize(self) -> [Field; PROFILE_NOTE_LEN] {
        [self.avatar, self.xp]
    }
}

impl Deserialize<PROFILE_NOTE_LEN> for ProfileNote {
    fn deserialize(serialized_note: [Field; PROFILE_NOTE_LEN]) -> Self {
        ProfileNote {
            avatar: serialized_note[0],
            xp: serialized_note[1],
            maybe_owner: Option::none(),
            header: NoteHeader::empty(),
        }
    }
}

impl NoteInterface for ProfileNote {
    fn compute_note_hash(self) -> Field {
        pedersen_hash([
            self.avatar, 
            self.xp,
        ],0)
    }

    fn compute_nullifier(_self: Self) -> Field {
        assert(false); // Not allowed.
        0
    }

    fn set_header(&mut self, header: NoteHeader) {
        self.header = header;
    }

    fn get_header(self) -> NoteHeader {
        self.header
    }

    // Broadcasts the note as an encrypted log on L1.
    fn broadcast(self, context: &mut PrivateContext, slot: Field) {
        assert(self.maybe_owner.is_some(), "Note owner must be set when the broadcast flow is triggered.");
        let owner = self.maybe_owner.unwrap_unchecked();

        let encryption_pub_key = get_public_key(owner);
        emit_encrypted_log(
            context,
            (*context).this_address(),
            slot,
            encryption_pub_key,
            self.serialize(),
        );
    }
}

impl ProfileNote {
    pub fn new(avatar: Field, xp: Field, maybe_owner: Option<AztecAddress>) -> Self {
        ProfileNote {
            avatar,
            xp,
            maybe_owner,
            header: NoteHeader::empty(),
        }
    }


    pub fn set_owner(&mut self, owner: AztecAddress) {
        self.maybe_owner = Option::some(owner);
    }

}
