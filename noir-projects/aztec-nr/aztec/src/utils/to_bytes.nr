pub fn arr_to_be_bytes_arr<let L: u32>(fields: [Field; L]) -> [u8; L * 32] {
    let mut bytes = [0 as u8; L * 32];
    for i in 0..L {
        // Note that bytes.append() results in bound error
        let to_add: [u8; 32] = fields[i].to_be_bytes();
        for j in 0..32 {
            bytes[i * 32 + j] = to_add[j];
        }
    }
    bytes
}

// each character of a string is converted into a byte
// then an ACVM field via the oracle => we recreate here
pub fn str_to_be_bytes_arr<let L: u32>(string: str<L>) -> [u8; L * 32] {
    let chars_bytes: [u8; L] = string.as_bytes();
    let mut bytes = [0 as u8; L * 32];
    for i in 0..L {
        let to_add: [u8; 32] = (chars_bytes[i] as Field).to_be_bytes();
        for j in 0..32 {
            bytes[i * 32 + j] = to_add[j];
        }
    }
    bytes
}
