use crate::messages::encoding::HEADER_CIPHERTEXT_SIZE_IN_BYTES;

/********************************************************/
// Disgusting arithmetic on generics
/********************************************************/

// In this section, instead of initializing arrays with very complicated generic
// arithmetic, such as:
// let my_arr: [u8; (((Pt + (16 - (Pt % 16))) + (HEADER_CIPHERTEXT_SIZE_IN_BYTES + 1)) + ((((((Pt + (16 - (Pt % 16))) + (HEADER_CIPHERTEXT_SIZE_IN_BYTES + 1)) + 30) / 31) * 31) - ((Pt + (16 - (Pt % 16))) + (HEADER_CIPHERTEXT_SIZE_IN_BYTES + 1))))] = [0; (((Pt + (16 - (Pt % 16))) + (HEADER_CIPHERTEXT_SIZE_IN_BYTES + 1)) + ((((((Pt + (16 - (Pt % 16))) + (HEADER_CIPHERTEXT_SIZE_IN_BYTES + 1)) + 30) / 31) * 31) - ((Pt + (16 - (Pt % 16))) + (HEADER_CIPHERTEXT_SIZE_IN_BYTES + 1))))];
//... we instead do the arithmetic a little bit at a time, so that the computation
// can be audited and understood. Now, we can't do arithmetic on generics in the body
// of a function, so we abusing functions in the following way:

// |full_pt| = |pt| = (N * 32) + 64
fn get_arr_of_size__full_plaintext<let Pt: u32>() -> [u8; Pt] {
    [0; Pt]
}

// |pt_aes_padding| = 16 - (|full_pt| % 16)
fn get_arr_of_size__plaintext_aes_padding<let FullPt: u32>(
    _full_pt: [u8; FullPt],
) -> [u8; 16 - (FullPt % 16)] {
    [0; 16 - (FullPt % 16)]
}

// |ct| = |full_pt| + |pt_aes_padding|
fn get_arr_of_size__ciphertext<let FullPt: u32, let PtAesPadding: u32>(
    _full_pt: [u8; FullPt],
    _pt_aes_padding: [u8; PtAesPadding],
) -> [u8; FullPt + PtAesPadding] {
    [0; FullPt + PtAesPadding]
}

// Ok, so we have the following bytes:
// eph_pk_sign, header_ciphertext, ciphertext:
// Let mbwop = 1 + HEADER_CIPHERTEXT_SIZE_IN_BYTES + |ct| // aka message bytes without padding
fn get_arr_of_size__message_bytes_without_padding<let Ct: u32>(
    _ct: [u8; Ct],
) -> [u8; 1 + HEADER_CIPHERTEXT_SIZE_IN_BYTES + Ct] {
    [0; 1 + HEADER_CIPHERTEXT_SIZE_IN_BYTES + Ct]
}

// Recall:
//   mbwop := 1 + HEADER_CIPHERTEXT_SIZE_IN_BYTES + |ct| // aka message bytes without padding
// We now want to pad b to the next multiple of 31, so as to "fill" fields.
// Let p be that padding.
// p = 31 * ceil(mbwop / 31) - mbwop
//   = 31 * ((mbwop + 30) // 31) - mbwop
//     (because ceil(x / y) = (x + y - 1) // y ).
fn get_arr_of_size__message_bytes_padding<let Mbwop: u32>(
    _mbwop: [u8; Mbwop],
) -> [u8; (31 * ((Mbwop + 30) / 31)) - Mbwop] {
    [0; (31 * ((Mbwop + 30) / 31)) - Mbwop]
}

// |message_bytes| = 1 + HEADER_CIPHERTEXT_SIZE_IN_BYTES + |ct| + p // aka message bytes (with padding)
// Recall:
//   mbwop := 1 + HEADER_CIPHERTEXT_SIZE_IN_BYTES + |ct|
//   p is the padding
fn get_arr_of_size__message_bytes<let MBWOP: u32, let P: u32>(
    _mbwop: [u8; MBWOP],
    _p: [u8; P],
) -> [u8; MBWOP + P] {
    [0; MBWOP + P]
}

// The return type is pasted from the LSP's expectation, because it was too difficult
// to match its weird way of doing algebra. It doesn't know all rules of arithmetic.
// Pt is the plaintext length.
pub(crate) fn get_arr_of_size__message_bytes_padding__from_PT<let Pt: u32>() -> [u8; ((((((Pt + (16 - (Pt % 16))) + HEADER_CIPHERTEXT_SIZE_IN_BYTES + 1) + 30) / 31) * 31) - ((Pt + (16 - (Pt % 16))) + HEADER_CIPHERTEXT_SIZE_IN_BYTES + 1))] {
    let full_pt = get_arr_of_size__full_plaintext::<Pt>();
    let pt_aes_padding = get_arr_of_size__plaintext_aes_padding(full_pt);
    let ct = get_arr_of_size__ciphertext(full_pt, pt_aes_padding);
    let mbwop = get_arr_of_size__message_bytes_without_padding(ct);
    let p = get_arr_of_size__message_bytes_padding(mbwop);
    p
}

// The return type is pasted from the LSP's expectation, because it was too difficult
// to match its weird way of doing algebra. It doesn't know all rules of arithmetic.
pub(crate) fn get_arr_of_size__message_bytes__from_PT<let Pt: u32>() -> [u8; (((Pt + (16 - (Pt % 16))) + HEADER_CIPHERTEXT_SIZE_IN_BYTES + 1) + ((((((Pt + (16 - (Pt % 16))) + HEADER_CIPHERTEXT_SIZE_IN_BYTES + 1) + 30) / 31) * 31) - ((Pt + (16 - (Pt % 16))) + HEADER_CIPHERTEXT_SIZE_IN_BYTES + 1)))] {
    let full_pt = get_arr_of_size__full_plaintext::<Pt>();
    let pt_aes_padding = get_arr_of_size__plaintext_aes_padding(full_pt);
    let ct = get_arr_of_size__ciphertext(full_pt, pt_aes_padding);
    let mbwop = get_arr_of_size__message_bytes_without_padding(ct);
    let p = get_arr_of_size__message_bytes_padding(mbwop);
    let message_bytes = get_arr_of_size__message_bytes(mbwop, p);
    message_bytes
}
