use crate::messages::encryption::log_encryption::HEADER_CIPHERTEXT_SIZE_IN_BYTES;

/********************************************************/
// Disgusting arithmetic on generics
/********************************************************/

// In this section, instead of initialising arrays with very complicated generic
// arithmetic, such as:
// let my_arr: [u8; (((PT + (16 - (PT % 16))) + (HEADER_CIPHERTEXT_SIZE_IN_BYTES + 1)) + ((((((PT + (16 - (PT % 16))) + (HEADER_CIPHERTEXT_SIZE_IN_BYTES + 1)) + 30) / 31) * 31) - ((PT + (16 - (PT % 16))) + (HEADER_CIPHERTEXT_SIZE_IN_BYTES + 1))))] = [0; (((PT + (16 - (PT % 16))) + (HEADER_CIPHERTEXT_SIZE_IN_BYTES + 1)) + ((((((PT + (16 - (PT % 16))) + (HEADER_CIPHERTEXT_SIZE_IN_BYTES + 1)) + 30) / 31) * 31) - ((PT + (16 - (PT % 16))) + (HEADER_CIPHERTEXT_SIZE_IN_BYTES + 1))))];
//... we instead do the arithmetic a little bit at a time, so that the computation
// can be audited and understood. Now, we can't do arithmetic on generics in the body
// of a function, so we abusing functions in the following way:

// |full_pt| = |pt| = (N * 32) + 64
fn get_arr_of_size__full_plaintext<let PT: u32>() -> [u8; PT] {
    [0; PT]
}

// |pt_aes_padding| = 16 - (|full_pt| % 16)
fn get_arr_of_size__plaintext_aes_padding<let FULL_PT: u32>(
    _full_pt: [u8; FULL_PT],
) -> [u8; 16 - (FULL_PT % 16)] {
    [0; 16 - (FULL_PT % 16)]
}

// |ct| = |full_pt| + |pt_aes_padding|
fn get_arr_of_size__ciphertext<let FULL_PT: u32, let PT_AES_PADDING: u32>(
    _full_pt: [u8; FULL_PT],
    _pt_aes_padding: [u8; PT_AES_PADDING],
) -> [u8; FULL_PT + PT_AES_PADDING] {
    [0; FULL_PT + PT_AES_PADDING]
}

// Ok, so we have the following bytes:
// eph_pk_sign, header_ciphertext, ciphertext:
// Let lbwop = 1 + HEADER_CIPHERTEXT_SIZE_IN_BYTES + |ct| // aka log bytes without padding
fn get_arr_of_size__log_bytes_without_padding<let CT: u32>(
    _ct: [u8; CT],
) -> [u8; 1 + HEADER_CIPHERTEXT_SIZE_IN_BYTES + CT] {
    [0; 1 + HEADER_CIPHERTEXT_SIZE_IN_BYTES + CT]
}

// Recall:
//   lbwop := 1 + HEADER_CIPHERTEXT_SIZE_IN_BYTES + |ct| // aka log bytes without padding
// We now want to pad b to the next multiple of 31, so as to "fill" fields.
// Let p be that padding.
// p = 31 * ceil(lbwop / 31) - lbwop
//   = 31 * ((lbwop + 30) // 31) - lbwop
//     (because ceil(x / y) = (x + y - 1) // y ).
fn get_arr_of_size__log_bytes_padding<let LBWOP: u32>(
    _lbwop: [u8; LBWOP],
) -> [u8; (31 * ((LBWOP + 30) / 31)) - LBWOP] {
    [0; (31 * ((LBWOP + 30) / 31)) - LBWOP]
}

// |log_bytes| = 1 + HEADER_CIPHERTEXT_SIZE_IN_BYTES + |ct| + p // aka log bytes (with padding)
// Recall:
//   lbwop := 1 + HEADER_CIPHERTEXT_SIZE_IN_BYTES + |ct|
//   p is the padding
fn get_arr_of_size__log_bytes<let LBWOP: u32, let P: u32>(
    _lbwop: [u8; LBWOP],
    _p: [u8; P],
) -> [u8; LBWOP + P] {
    [0; LBWOP + P]
}

// The return type is pasted from the LSP's expectation, because it was too difficult
// to match its weird way of doing algebra. It doesn't know all rules of arithmetic.
// PT is the plaintext length.
pub(crate) fn get_arr_of_size__log_bytes_padding__from_PT<let PT: u32>() -> [u8; ((((((PT + (16 - (PT % 16))) + HEADER_CIPHERTEXT_SIZE_IN_BYTES + 1) + 30) / 31) * 31) - ((PT + (16 - (PT % 16))) + HEADER_CIPHERTEXT_SIZE_IN_BYTES + 1))] {
    let full_pt = get_arr_of_size__full_plaintext::<PT>();
    let pt_aes_padding = get_arr_of_size__plaintext_aes_padding(full_pt);
    let ct = get_arr_of_size__ciphertext(full_pt, pt_aes_padding);
    let lbwop = get_arr_of_size__log_bytes_without_padding(ct);
    let p = get_arr_of_size__log_bytes_padding(lbwop);
    p
}

// The return type is pasted from the LSP's expectation, because it was too difficult
// to match its weird way of doing algebra. It doesn't know all rules of arithmetic.
pub(crate) fn get_arr_of_size__log_bytes__from_PT<let PT: u32>() -> [u8; (((PT + (16 - (PT % 16))) + HEADER_CIPHERTEXT_SIZE_IN_BYTES + 1) + ((((((PT + (16 - (PT % 16))) + HEADER_CIPHERTEXT_SIZE_IN_BYTES + 1) + 30) / 31) * 31) - ((PT + (16 - (PT % 16))) + HEADER_CIPHERTEXT_SIZE_IN_BYTES + 1)))] {
    let full_pt = get_arr_of_size__full_plaintext::<PT>();
    let pt_aes_padding = get_arr_of_size__plaintext_aes_padding(full_pt);
    let ct = get_arr_of_size__ciphertext(full_pt, pt_aes_padding);
    let lbwop = get_arr_of_size__log_bytes_without_padding(ct);
    let p = get_arr_of_size__log_bytes_padding(lbwop);
    let log_bytes = get_arr_of_size__log_bytes(lbwop, p);
    log_bytes
}
