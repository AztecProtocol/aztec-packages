use dep::aztec::note::note_interface::NoteInterface;
use dep::aztec::oracle;
use crate::call_context;
use crate::notes::generators;

global ACCOUNT_SECRET_NOTE_LEN: Field = 2;

struct AccountSecretNote {
    address: Field,
    secret: Field,
}

impl AccountSecretNote {
    fn new(address: Field, secret: Field) -> Self {
        AccountSecretNote {
            address,
            secret,
        }
    }

    fn serialise(self) -> [Field; ACCOUNT_SECRET_NOTE_LEN] {
        [self.address, self.secret]
    }

    fn dummy() -> Self {
        AccountSecretNote {
            address: 0,
            secret: 0,
        }
    }
}

fn deserialise(preimage: [Field; ACCOUNT_SECRET_NOTE_LEN]) -> AccountSecretNote {
  AccountSecretNote {
    address: preimage[0],
    secret: preimage[1],
  }
}

fn serialise(note: AccountSecretNote) -> [Field; ACCOUNT_SECRET_NOTE_LEN] {
    note.serialise()
}

fn compute_note_hash(note: AccountSecretNote) -> Field {
    dep::std::hash::pedersen([
        generators::ACCOUNT_SECRET_NOTE_GENERATOR,
        note.address, 
        note.secret, 
    ])[0]
}

fn compute_nullifier(note: AccountSecretNote) -> Field {
    let note_hash = compute_note_hash(note);
    let secret = oracle::get_secret(call_context.msg_sender);
    dep::std::hash::pedersen([
        note_hash,
        secret, 
    ])[0]
}

fn dummy() -> AccountSecretNote {
    AccountSecretNote::dummy()
}

fn is_dummy(note: AccountSecretNote) -> bool {
    note.secret == 0
}

global AccountSecretNoteInterface = NoteInterface {
    deserialise,
    serialise,
    compute_note_hash,
    compute_nullifier,
    dummy,
    is_dummy,
};
