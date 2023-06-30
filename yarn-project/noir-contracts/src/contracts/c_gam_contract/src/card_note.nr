use crate::card::Card;
use crate::types::point::Point;

// oracle
use crate::oracle::get_secret_key::get_secret_key;
use crate::oracle::rand::rand;

global CARD_NOTE_LEN = 6;

// mod card_note;
// use card_note::CardNote;
// use dep::aztec3::types::point::Point;

#[oracle(notifyCreatedNote)]
fn notify_created_note_oracle(
    _storage_slot: Field,
    _owner: Point,
    _note: CardNote,
) -> [Field; 1] {}

unconstrained fn notify_created_card_note(
    storage_slot: Field,
    owner: Point,
    note: CardNote,
) -> Field {
    notify_created_note_oracle(storage_slot, owner, note)[0]
}

struct CardNote {
    card: Card,
    owner: Point,
    randomness: Field,
    nonce: Field,
    is_real: bool
}

impl CardNote {
    fn dummy() -> CardNote {
        CardNote {
            card: Card::dummy(),
            owner: Point { x: 0, y: 0 },
            randomness: 0,
            nonce: 0,
            is_real: false,
        }
    }

    // fn deserialize(
    //     fields: [Field; CARD_NOTE_LEN],
    // ) -> CardNote {
    //     CardNote {
    //         card: Card::deserialize([fields[0], fields[1], fields[2]]),
    //         owner: Point {
    //             x: fields[3],
    //             y: fields[4]
    //         },
    //         randomness: fields[5],
    //         nonce: fields[6],
    //         is_real: fields[7] as bool,
    //     }
    // }

    fn new(card: Card, owner: Point) -> CardNote {
        let randomness = rand();
        let nonce = 3;      // Guaranteed to be random

        CardNote {
            card,
            owner,
            randomness,
            nonce,
            is_real: true,
        }
    }

    fn compute_note_hash(self) -> Field {
        dep::std::hash::pedersen([
            crate::NoteHash,
            self.card.inner
            self.owner.x,
            self.owner.y,
            self.randomness,
            self.nonce,
            self.is_real as Field,
        ])[0]
    }

    fn compute_nullifier(self, note_hash: Field) -> Field {
        if(self.is_real){
            let secret_key = get_secret_key(self.owner);
            // TODO derive public key here
            let check_public_key = self.owner;
            assert((check_public_key.x == self.owner.x) & (check_public_key.y == self.owner.y));
            dep::std::hash::pedersen([crate::Nullifier, note_hash, secret_key])[0]
        } else {
            0
        }
    }
}
