// global KEY_GENERATOR = Point { x: 1234, y: 5678 }; // would need to be some valid generator point.

use crate::types::point::Point;
use crate::notes::generic_note_functions::GenericNoteFunctions;

#[builtin(rand)]
fn rand() -> Field {}

#[builtin(getSecretKey)]
fn get_secret_key(_owner: Point) -> Field {}

struct Note {
    value: Field,
    owner: Point,
    randomness: Field,
    nonce: Field,
    is_dummy: bool
}

impl Note {
    fn dummy() -> Note {
        Note {
            value: 0,
            owner: Point { x: 0, y: 0 },
            randomness: 0,
            nonce: 0,
            is_dummy: true,
        }
    }

    fn new(value: Field, owner: Point) -> Note {
        // let randomness = ORACLE::rand(); // ORACLE CALL
        // let nonce = ORACLE::rand(); // ORACLE CALL (nonce not secure: would need to be better in production).

        let randomness = rand();//4; // Chosen by fair dice roll
        // let randomness = 4; // Chosen by fair dice roll
        let nonce = 3;      // Guaranteed to be random

        Note {
            value,
            owner,
            randomness,
            nonce,
            is_dummy: false,
        }
    }
}

global note_size: comptime Field = 6;

fn get_value_note_functions() -> GenericNoteFunctions<Note, note_size> {
    let a = from_fields;
    let b = to_fields;
    let c = compute_note_hash;
    let d = compute_nullifier;
    let fns = GenericNoteFunctions {
        from_fields: a,
        to_fields: b,
        compute_note_hash: c,
        compute_nullifier: d,
    };
    fns
}

fn from_fields(fields: [Field; 6], start: comptime Field) -> (Note, comptime Field) {
    (Note {
        value: fields[start],
        owner: Point::new(fields[start + 1], fields[start + 2]),
        randomness: fields[start + 3],
        nonce: fields[start + 4],
        is_dummy: fields[start + 5] as bool,
    }, start + 5)
}

fn to_fields(note: Note) -> [Field; 6] {
    [
        note.value,
        note.owner.x,
        note.owner.y,
        note.randomness,
        note.nonce,
        note.is_dummy as Field
    ]
}

fn compute_note_hash(note: Note) -> Field {
    dep::std::hash::pedersen([
        crate::NoteHash,
        note.is_dummy as Field,
        note.nonce, 
        note.owner.x, 
        note.owner.y,
        note.randomness, 
        note.value, 
    ])[0]
}

fn compute_nullifier(note: Note, note_hash: Field) -> Field {
    // let secret_key = ORACLE::get_secret_key(self.owner); // ORACLE CALL - retrieves the secret key for a given public key.
    let secret_key = get_secret_key(note.owner);

    // let key_generator = Point { x: 1234, y: 5678 };
    // let check_public_key = scalar_mul(secret_key, key_generator); // (function not show in this doc: just assumed to exist in noir's stdlib)
    let check_public_key = note.owner;

    constrain (check_public_key.x == note.owner.x) & (check_public_key.y == note.owner.y);

    dep::std::hash::pedersen([crate::Nullifier, note_hash, secret_key])[0]
}
