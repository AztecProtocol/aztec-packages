// global KEY_GENERATOR = Point { x: 1234, y: 5678 }; // would need to be some valid generator point.

use crate::notes::note_interface::NoteInterface;
use crate::types::point::Point;

global NOTE_LEN: comptime Field = 6;
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

struct ValueNote {
    value: Field,
    owner: Point,
    randomness: Field,
    nonce: Field,
    is_real: bool
}

impl ValueNote {
    fn dummy() -> ValueNote {
        ValueNote {
            value: 0,
            owner: Point { x: 0, y: 0 },
            randomness: 0,
            nonce: 0,
            is_real: false,
        }
    }

    // fn deserialize(
    //     fields: [Field; NOTE_LEN],
    // ) -> ValueNote {
    //     ValueNote {
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

    fn new(value: Field, owner: Point) -> ValueNote {
        // let randomness = ORACLE::rand(); // ORACLE CALL
        // let nonce = ORACLE::rand(); // ORACLE CALL (nonce not secure: would need to be better in production).

        // rand_idx prevents repeated oracles + args from being optimised away.
        // The + 1 is a workaround for:
        //     The application panicked (crashed).
        //     Message:  unexpected constant expression
        //     Location: crates/noirc_evaluator/src/ssa/acir_gen/operations/intrinsics.rs:280
        
        // let randomness = rand();
        let randomness = 4;
        let nonce = 3; 

        ValueNote {
            value,
            owner,
            randomness,
            nonce,
            is_real: true,
        }
    }

    // fn compute_note_hash(self) -> Field {
    //     let pedersen = dep::std::hash::pedersen;
    //     pedersen([
    //         crate::NOTE_HASH_GENERATOR,
    //         self.is_real as Field, // Do the member names actually need to be alphabetically sorted, here?
    //         self.nonce, 
    //         self.owner.x, 
    //         self.owner.y,
    //         self.randomness,
    //         self.value, 
    //     ])[0]
    // }

    // fn compute_nullifier(self, note_hash: Field) -> Field {
    //     let mut secret_key = 0;

    //     if(self.is_real){
    //         secret_key = get_secret_key(self.owner);
    //         // TODO derive public key here
    //         let check_public_key = self.owner;
    //         assert (check_public_key.x == self.owner.x) & (check_public_key.y == self.owner.y);
    //     }

    //     dep::std::hash::pedersen([crate::NULLIFIER_GENERATOR, note_hash, secret_key])[0]
    // }
}

fn get_value_note_functions() -> NoteInterface<ValueNote, NOTE_LEN> {
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

fn from_fields(fields: [Field; NOTE_LEN]) -> ValueNote {
    ValueNote {
        value: fields[0],
        owner: Point::new(fields[1], fields[2]),
        randomness: fields[3],
        nonce: fields[4],
        is_real: fields[5] as bool,
    }
}

fn to_fields(note: ValueNote) -> [Field; NOTE_LEN] {
    [
        note.value,
        note.owner.x,
        note.owner.y,
        note.randomness,
        note.nonce,
        note.is_real as Field
    ]
}

fn dummy() -> ValueNote {
    ValueNote {
        value: 0,
        owner: Point { x: 0, y: 0 },
        randomness: 0,
        nonce: 0,
        is_real: false,
    }
}

fn new(fields: [Field; NOTE_LEN]) -> ValueNote {
    ValueNote {
        value: fields[0],
        owner: Point { x: fields[1], y: fields[2] },
        randomness: fields[3],
        nonce: fields[4],
        is_real: fields[5] as bool,
    }
}

// fn deserialize(
//     fields: [Field; NOTE_LEN],
// ) -> ValueNote {
//     ValueNote {
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

fn compute_note_hash(note: ValueNote) -> Field {
    dep::std::hash::pedersen([
        crate::NOTE_HASH_GENERATOR,
        note.is_real as Field, // Do the member names actually need to be alphabetically sorted, here?
        note.nonce, 
        note.owner.x, 
        note.owner.y,
        note.randomness, 
        note.value, 
    ])[0]
}

fn compute_nullifier(note: ValueNote, note_hash: Field) -> Field {
    let mut secret_key = 0;

    if(note.is_real){
        secret_key = get_secret_key(note.owner);
        // TODO derive public key here
        let check_public_key = note.owner;
        check_public_key.assert_equal(note.owner);
    }

    dep::std::hash::pedersen([crate::NULLIFIER_GENERATOR, note_hash, secret_key])[0]
}
