use dep::aztec::{
    protocol_types::{address::AztecAddress, traits::Packable},
    macros::notes::note
};

use dep::aztec::protocol_types::traits::{FromField, ToField};


// Stores an ECDSA public key composed of two 32-byte elements
// TODO: Do we need to include a nonce, in case we want to read/nullify/recreate with the same pubkey value?
#[note]
#[derive(Eq)]
pub struct EcdsaPublicKeyNote {
    pub x: [u8; 32],
    pub y: [u8; 32],
    pub owner: AztecAddress,
}

impl EcdsaPublicKeyNote {
    pub fn new(x: [u8; 32], y: [u8; 32], owner: AztecAddress) -> Self {
        EcdsaPublicKeyNote { x, y, owner }
    }
}

global ECDSA_PUBLIC_KEY_NOTE_PCKD_LEN: u32 = 5;

impl Packable<ECDSA_PUBLIC_KEY_NOTE_PCKD_LEN> for EcdsaPublicKeyNote {
    // Cannot use the automatic packing since x and y don't fit. Pack the note as 5 fields where:
    // [0] = x[0..31] (upper bound excluded)
    // [1] = x[31]
    // [2] = y[0..31]
    // [3] = y[31]
    // [4] = owner
    fn pack(self) -> [Field; ECDSA_PUBLIC_KEY_NOTE_PCKD_LEN] {
        let mut x: Field = 0;
        let mut y: Field = 0;
        let mut mul: Field = 1;

        for i in 1..32 {
            let byte_x: Field = self.x[31 - i] as Field;
            x = x + (byte_x * mul);
            let byte_y: Field = self.y[31 - i] as Field;
            y = y + (byte_y * mul);
            mul *= 256;
        }

        let last_x = self.x[31] as Field;
        let last_y = self.y[31] as Field;

        [x, last_x, y, last_y, self.owner.to_field()]
    }

    // Cannot use the automatic unpacking for the aforementioned reasons
    fn unpack(packed_note: [Field; ECDSA_PUBLIC_KEY_NOTE_PCKD_LEN]) -> EcdsaPublicKeyNote {
        let mut x: [u8; 32] = [0; 32];
        let mut y: [u8; 32] = [0; 32];

        let part_x:[u8; 32] = packed_note[0].to_be_bytes();
        for i in 0..31 {
            x[i] = part_x[i + 1];
        }
        x[31] = packed_note[1].to_be_bytes::<32>()[31];

        let part_y:[u8; 32] = packed_note[2].to_be_bytes();
        for i in 0..31 {
            y[i] = part_y[i + 1];
        }
        y[31] = packed_note[3].to_be_bytes::<32>()[31];

        EcdsaPublicKeyNote { x, y, owner: AztecAddress::from_field(packed_note[4]) }
    }
}
