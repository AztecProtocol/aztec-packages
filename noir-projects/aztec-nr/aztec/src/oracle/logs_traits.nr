use dep::protocol_types::address::AztecAddress;

// TODO: this is awful but since we can't have a fn that maps [Field; N] -> [Field; N+7]
// (where N is encrypted log preimage size and N+7 is encryption output size)
// and can't return slices from oracles, this at least compiles and runs
// The fns for LensForEncryptedLog are never used, it's just to tell the compiler what the lens are

// The to_bytes fn for ToBytesForUnencryptedLog is used to allow us to hash some generic T

// I could have omitted N from the trait, but wanted to keep it strictly for field arrs
// TODO(1139): Once we enc inside the circuit, we will no longer need the oracle to return
// anything, so we can remove this trait
trait LensForEncryptedLog<N, M, L> {
    // N = note preimage input in fields
    // M = encryption output len in fields (= N + 7 = N + 3 fields for addr, slot, type + 3.5 fields for AES data)
    // L = encryption output len in bytes (= 32*M - 16)
    fn output_fields(self: [Field; N]) -> [Field; M];
    fn output_bytes(self: [Field; N]) -> [u8; L];
}

impl LensForEncryptedLog<1, 8, 240> for [Field; 1] {
    fn output_fields(self) -> [Field; 8] {[self[0]; 8]}
    fn output_bytes(self) -> [u8; 240] {[self[0] as u8; 240]}
}
impl LensForEncryptedLog<2, 9, 272> for [Field; 2] {
    fn output_fields(self) -> [Field; 9] {[self[0]; 9]}
    fn output_bytes(self) -> [u8; 272] {[self[0] as u8; 272]}
}
impl LensForEncryptedLog<3, 10, 304> for [Field; 3] {
    fn output_fields(self) -> [Field; 10] {[self[0]; 10]}
    fn output_bytes(self) -> [u8; 304] {[self[0] as u8; 304]}
}
impl LensForEncryptedLog<4, 11, 336> for [Field; 4] {
    fn output_fields(self) -> [Field; 11] {[self[0]; 11]}
    fn output_bytes(self) -> [u8; 336] {[self[0] as u8; 336]}
}
impl LensForEncryptedLog<5, 12, 368> for [Field; 5] {
    fn output_fields(self) -> [Field; 12] {[self[0]; 12]}
    fn output_bytes(self) -> [u8; 368] {[self[0] as u8; 368]}
}
impl LensForEncryptedLog<6, 13, 400> for [Field; 6] {
    fn output_fields(self) -> [Field; 13] {[self[0]; 13]}
    fn output_bytes(self) -> [u8; 400] {[self[0] as u8; 400]}
}

// This trait defines the length of the inputs in bytes to
// the unencrypted log hash fn, where the log can be any type T
// as long as the ACVM can convert to fields.
trait ToBytesForUnencryptedLog<N, M> {
    // N = preimage input in bytes
    // M = full log input in bytes ( = N + 40 = N + 32 for addr, + 4 for selector, + 4 for len)
    fn to_be_bytes_arr(self) -> [u8; N];
    fn output_bytes(self) -> [u8; M];
}

impl ToBytesForUnencryptedLog<32, 72> for Field {
    fn to_be_bytes_arr(self) -> [u8; 32] {
        self.to_be_bytes(32).as_array()
    }
    fn output_bytes(self) -> [u8; 72] {[self as u8; 72]}
}

impl ToBytesForUnencryptedLog<32, 72> for AztecAddress {
    fn to_be_bytes_arr(self) -> [u8; 32] {
        self.to_field().to_be_bytes(32).as_array()
    }
    fn output_bytes(self) -> [u8; 72] {[self.to_field() as u8; 72]}
}

fn arr_to_be_bytes_arr<N, L>(fields: [Field; L]) -> [u8; N] {
    let mut bytes: [u8] = &[];
    for i in 0..L {
        // Note that bytes.append() results in bound error
        let to_add = fields[i].to_be_bytes(32);
        for j in 0..32 {
            bytes = bytes.push_back(to_add[j]);
        }
    }
    bytes.as_array()
}

// each character of a string is converted into a byte
// then an ACVM field via the oracle => we recreate here
fn str_to_be_bytes_arr<N, L>(string: str<L>) -> [u8; N] {
    let chars_bytes = string.as_bytes();
    let mut bytes: [u8] = &[];
    for i in 0..L {
        let to_add = (chars_bytes[i] as Field).to_be_bytes(32);
        for j in 0..32 {
            bytes = bytes.push_back(to_add[j]);
        }
    }
    bytes.as_array()
}

impl ToBytesForUnencryptedLog<32, 72> for [Field; 1] {
    fn to_be_bytes_arr(self) -> [u8; 32] {
        arr_to_be_bytes_arr(self)
    }
    fn output_bytes(self) -> [u8; 72] {
        [self[0] as u8; 72]
    }
}

impl ToBytesForUnencryptedLog<64, 104> for [Field; 2] {
    fn to_be_bytes_arr(self) -> [u8; 64] {
        arr_to_be_bytes_arr(self)
    }
    fn output_bytes(self) -> [u8; 104] {
        [self[0] as u8; 104]
    }
}

impl ToBytesForUnencryptedLog<96, 136> for [Field; 3] {
    fn to_be_bytes_arr(self) -> [u8; 96] {
        arr_to_be_bytes_arr(self)
    }
    fn output_bytes(self) -> [u8; 136] {
        [self[0] as u8; 136]
    }
}

impl ToBytesForUnencryptedLog<128, 168> for [Field; 4] {
    fn to_be_bytes_arr(self) -> [u8; 128] {
        arr_to_be_bytes_arr(self)
    }
    fn output_bytes(self) -> [u8; 168] {
        [self[0] as u8; 168]
    }
}

impl ToBytesForUnencryptedLog<160, 200> for [Field; 5] {
    fn to_be_bytes_arr(self) -> [u8; 160] {
        arr_to_be_bytes_arr(self)
    }
    fn output_bytes(self) -> [u8; 200] {
        [self[0] as u8; 200]
    }
}

impl ToBytesForUnencryptedLog<192, 232> for [Field; 6] {
    fn to_be_bytes_arr(self) -> [u8; 192] {
        arr_to_be_bytes_arr(self)
    }
    fn output_bytes(self) -> [u8; 232] {
        [self[0] as u8; 232]
    }
}

impl ToBytesForUnencryptedLog<224, 264> for [Field; 7] {
    fn to_be_bytes_arr(self) -> [u8; 224] {
        arr_to_be_bytes_arr(self)
    }
    fn output_bytes(self) -> [u8; 264] {
        [self[0] as u8; 264]
    }
}

impl ToBytesForUnencryptedLog<256, 296> for [Field; 8] {
    fn to_be_bytes_arr(self) -> [u8; 256] {
        arr_to_be_bytes_arr(self)
    }
    fn output_bytes(self) -> [u8; 296] {
        [self[0] as u8; 296]
    }
}

// below gives 'No method named 'to_be_bytes_arr' found for type '[Field; L]'' error
// impl<L, N, M> ToBytesForUnencryptedLog<N, M> for str<L> where [Field; L]: ToBytesForUnencryptedLog<N,M> {
//     fn to_be_bytes_arr(self) -> [u8; N] {
//         // each character of a string is converted into a byte
//         // then an ACVM field via the oracle => we recreate here
//         let chars_bytes = self.as_bytes();
//         let mut chars_padded: [Field; L] = [0; L];
//         for i in 0..L {
//             chars_padded[i] = chars_bytes[i] as Field;
//         }
//         chars_padded.to_be_bytes_arr()
//     }
//     fn output_bytes(self) -> [u8; M] {
//         [0; M]
//     }
// }

impl ToBytesForUnencryptedLog<32, 72> for str<1> {
    fn to_be_bytes_arr(self) -> [u8; 32] {
        str_to_be_bytes_arr(self)
    }
    fn output_bytes(self) -> [u8; 72] {
        [0; 72]
    }
}

impl ToBytesForUnencryptedLog<64, 104> for str<2> {
    fn to_be_bytes_arr(self) -> [u8; 64] {
        str_to_be_bytes_arr(self)
    }
    fn output_bytes(self) -> [u8; 104] {
        [0; 104]
    }
}

impl ToBytesForUnencryptedLog<96, 136> for str<3> {
    fn to_be_bytes_arr(self) -> [u8; 96] {
        str_to_be_bytes_arr(self)
    }
    fn output_bytes(self) -> [u8; 136] {
        [0; 136]
    }
}

impl ToBytesForUnencryptedLog<128, 168> for str<4> {
    fn to_be_bytes_arr(self) -> [u8; 128] {
        str_to_be_bytes_arr(self)
    }
    fn output_bytes(self) -> [u8; 168] {
        [0; 168]
    }
}

impl ToBytesForUnencryptedLog<160, 200> for str<5> {
    fn to_be_bytes_arr(self) -> [u8; 160] {
        str_to_be_bytes_arr(self)
    }
    fn output_bytes(self) -> [u8; 200] {
        [0; 200]
    }
}

impl ToBytesForUnencryptedLog<192, 232> for str<6> {
    fn to_be_bytes_arr(self) -> [u8; 192] {
        str_to_be_bytes_arr(self)
    }
    fn output_bytes(self) -> [u8; 232] {
        [0; 232]
    }
}

impl ToBytesForUnencryptedLog<224, 264> for str<7> {
    fn to_be_bytes_arr(self) -> [u8; 224] {
        str_to_be_bytes_arr(self)
    }
    fn output_bytes(self) -> [u8; 264] {
        [0; 264]
    }
}

impl ToBytesForUnencryptedLog<256, 296> for str<8> {
    fn to_be_bytes_arr(self) -> [u8; 256] {
        str_to_be_bytes_arr(self)
    }
    fn output_bytes(self) -> [u8; 296] {
        [0; 296]
    }
}
