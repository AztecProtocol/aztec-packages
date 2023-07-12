use dep::std::hash::pedersen;
use dep::aztec::note::note_interface::NoteInterface;
use dep::aztec::oracle::get_secret_key::get_secret_key;
use dep::aztec::oracle::get_public_key::get_public_key;

global ECDSA_PUBLIC_KEY_NOTE_LEN: Field = 65;

// Stores an ECDSA public key composed of two 32-byte elements
// TODO: Do we need to include a nonce, in case we want to read/nullify/recreate with the same pubkey value?
struct EcdsaPublicKeyNote {
    x: [u8; 32],
    y: [u8; 32],
    owner: Field, // We store the owner address only to get the secret key to compute the nullifier
}

impl EcdsaPublicKeyNote {
    fn new(x: [u8; 32], y: [u8; 32], owner: Field) -> Self {
        EcdsaPublicKeyNote {
            x,
            y,
            owner,
        }
    }

    fn serialise(self) -> [Field; ECDSA_PUBLIC_KEY_NOTE_LEN] {
        let mut res: [Field; ECDSA_PUBLIC_KEY_NOTE_LEN] = [0; ECDSA_PUBLIC_KEY_NOTE_LEN];
        for i in 0..32 {
          res[i] = self.x[i] as Field;
          res[i + 32] = self.y[i] as Field;
        }
        res[64] = self.owner;
        res
    }

    fn dummy() -> Self {
        EcdsaPublicKeyNote {
            x: [0;32],
            y: [0;32],
            owner: 0,
        }
    }

    fn is_dummy(self) -> bool {
        (self.x == [0;32]) & (self.y == [0;32]) & (self.owner == 0)
    }
}

fn deserialise(preimage: [Field; ECDSA_PUBLIC_KEY_NOTE_LEN]) -> EcdsaPublicKeyNote {
    let mut x: [u8; 32] = [0;32];
    let mut y: [u8; 32] = [0;32];
    for i in 0..32 {
        x[i] = preimage[i] as u8;
        y[i] = preimage[i + 32] as u8;
    }

    EcdsaPublicKeyNote {
        x,
        y,
        owner: preimage[64]
    }
}

fn serialise(note: EcdsaPublicKeyNote) -> [Field; ECDSA_PUBLIC_KEY_NOTE_LEN] {
    note.serialise()
}

fn compute_note_hash(note: EcdsaPublicKeyNote) -> Field {
    dep::std::hash::pedersen(note.serialise())[0]
}

fn compute_nullifier(note: EcdsaPublicKeyNote, final_note_hash: Field) -> Field {
    let owner_nullifying_public_key = get_public_key(note.owner);
    let secret = get_secret_key(owner_nullifying_public_key);
    // let secret = 0;
    dep::std::hash::pedersen([
        final_note_hash,
        secret,
    ])[0]
}

fn dummy() -> EcdsaPublicKeyNote {
    EcdsaPublicKeyNote::dummy()
}

fn is_dummy(note: EcdsaPublicKeyNote) -> bool {
    note.is_dummy()
}

global EcdsaPublicKeyNoteInterface = NoteInterface {
    deserialise,
    serialise,
    compute_note_hash,
    compute_nullifier,
    dummy,
    is_dummy,
};
