// global KEY_GENERATOR = Point { x: 1234, y: 5678 }; // would need to be some valid generator point.

use crate::notes::note_interface::NoteInterface;
use crate::types::point::Point;

global NOTE_LEN = 4;
// global note_size: comptime Field = 6;

// #[oracle(getRandomField)]
// fn rand_oracle() -> Field {}

// unconstrained fn rand() -> Field {
//     rand_oracle()
// }

// STUB
fn rand() -> Field {
    2345
}

// #[oracle(getSecretKey)]
// fn get_secret_key_oracle(_owner: Point) -> Field {}

// unconstrained fn get_secret_key(owner: Point) -> Field {
//     get_secret_key_oracle(owner)
// }

// STUB
fn get_secret_key(owner: Point) -> Field {
    owner.x
}

struct OwnerNote {
    owner: Point,
    randomness: Field,
    nonce: Field,
}

impl OwnerNote {
    fn dummy() -> OwnerNote {
        OwnerNote {
            owner: Point { x: 0, y: 0 },
            randomness: 0,
            nonce: 0,
        }
    }

    // fn deserialize(
    //     fields: [Field; NOTE_LEN],
    // ) -> OwnerNote {
    //     OwnerNote {
    //         nonce: fields[0],
    //         owner: Point {
    //             x: fields[1],
    //             y: fields[2]
    //         },
    //         randomness: fields[3],
    //     }
    // }

    fn new(owner: Point) -> OwnerNote {
        let randomness = 4;
        let nonce = 3; 

        OwnerNote {
            owner,
            randomness,
            nonce,
        }
    }

    fn compute_note_hash(self) -> Field {
        let pedersen = dep::std::hash::pedersen;
        pedersen([
            crate::NOTE_HASH_GENERATOR,
            self.nonce, 
            self.owner.x, 
            self.owner.y,
            self.randomness,
        ])[0]
    }

    fn compute_nullifier(self, note_hash: Field) -> Field {
        let secret_key = get_secret_key(self.owner);
        // TODO derive public key here
        let check_public_key = self.owner;
        check_public_key.assert_equal(self.owner);

        dep::std::hash::pedersen([crate::NULLIFIER_GENERATOR, note_hash, secret_key])[0]
    }
}

fn get_owner_note_functions() -> NoteInterface<OwnerNote, NOTE_LEN> {
    NoteInterface {
        note_length: NOTE_LEN,
        from_fields: from_fields,
        to_fields: to_fields,
        dummy: dummy,
        new: new,
        compute_note_hash: compute_note_hash,
        compute_nullifier: compute_nullifier,
    }
}

fn from_fields(fields: [Field; NOTE_LEN]) -> OwnerNote {
    OwnerNote {
        owner: Point::new(fields[0], fields[1]),
        randomness: fields[2],
        nonce: fields[3],
    }
}

fn to_fields(note: OwnerNote) -> [Field; NOTE_LEN] {
    [
        note.owner.x,
        note.owner.y,
        note.randomness,
        note.nonce,
    ]
}

fn dummy() -> OwnerNote {
    OwnerNote {
        owner: Point { x: 0, y: 0 },
        randomness: 0,
        nonce: 0,
    }
}

fn new(fields: [Field; NOTE_LEN]) -> OwnerNote {
    OwnerNote {
        owner: Point { x: fields[0], y: fields[1] },
        randomness: fields[2],
        nonce: fields[3],
    }
}

// fn deserialize(
//     fields: [Field; NOTE_LEN],
// ) -> OwnerNote {
//     OwnerNote {
//         is_real: fields[0] as bool,
//         nonce: fields[1],
//         owner: Point {
//             x: fields[2],
//             y: fields[3]
//         },
//         randomness: fields[4],
//         value: fields[5],
//     }
// }

fn compute_note_hash(note: OwnerNote) -> Field {
    dep::std::hash::pedersen([
        crate::NOTE_HASH_GENERATOR,
        note.nonce, 
        note.owner.x, 
        note.owner.y,
        note.randomness, 
    ])[0]
}

fn compute_nullifier(note: OwnerNote, note_hash: Field) -> Field {
    let mut secret_key = 0;

    secret_key = get_secret_key(note.owner);
    // TODO derive public key here
    let check_public_key = note.owner;
    check_public_key.assert_equal(note.owner);

    dep::std::hash::pedersen([crate::NULLIFIER_GENERATOR, note_hash, secret_key])[0]
}
