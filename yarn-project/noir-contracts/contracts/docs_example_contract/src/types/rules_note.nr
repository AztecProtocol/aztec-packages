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

global RULES_NOTE_LEN: Field = 2;

struct RulesNote {
    min_points: u8,
    max_points: u8,
    maybe_owner: Option<AztecAddress>,
    header: NoteHeader,
}

impl Serialize<RULES_NOTE_LEN> for RulesNote {
    fn serialize(self) -> [Field; RULES_NOTE_LEN] {
        [self.min_points as Field, self.max_points as Field]
    }
}

impl Deserialize<RULES_NOTE_LEN> for RulesNote {
    fn deserialize(serialized_note: [Field; RULES_NOTE_LEN]) -> Self {
      RulesNote {
            min_points: serialized_note[0] as u8,
            max_points: serialized_note[1] as u8,
            maybe_owner: Option::none(),
            header: NoteHeader::empty(),
        }
    }

    fn _sample() -> [Field; RULES_NOTE_LEN] {
        [0; RULES_NOTE_LEN]
    }
}

impl NoteInterface for RulesNote {
    fn compute_note_hash(self) -> Field {
        pedersen_hash([
            self.min_points as Field, 
            self.max_points as Field, 
        ],0)
    }

    fn compute_nullifier(_self: Self) -> Field {
        // Not used
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

impl RulesNote {
    pub fn new(min_points: u8, max_points: u8, maybe_owner: Option<AztecAddress>) -> Self {
        RulesNote {
            min_points,
            max_points,
            maybe_owner,
            header: NoteHeader::empty(),
        }
    }

    pub fn set_owner(&mut self, owner: AztecAddress) {
        self.maybe_owner = Option::some(owner);
    }
}
