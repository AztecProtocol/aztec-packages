use std::io::Read;

use base64::{engine::general_purpose, Engine};
use flate2::read::GzDecoder;

use crate::circuit::circuit_size::get_circuit_sizes;

const BYTECODE: &str = "H4sIAAAAAAAA/7WTMRLEIAhFMYkp9ywgGrHbq6yz5v5H2JkdCyaxC9LgWDw+H9gBwMM91p7fPeOzIKdYjEeMLYdGTB8MpUrCmOohJJQkfYMwN4mSSy0ZC0VudKbCZ4cthqzVrsc/yw28dMZeWmrWerfBexnsxD6hJ7jUufr4GvyZFp8xpG0C14Pd8s/q29vPCBXypvmpDx7sD8opnfqIfsM1RNtxBQAA";
#[test]
fn test_circuit_size_method() {
    let acir_buffer = general_purpose::STANDARD.decode(BYTECODE).unwrap();
    let mut decoder = GzDecoder::new(acir_buffer.as_slice());
    let mut acir_buffer_uncompressed = Vec::<u8>::new();
    decoder.read_to_end(&mut acir_buffer_uncompressed).unwrap();

    let sizes = get_circuit_sizes(&acir_buffer_uncompressed).unwrap();
    assert_eq!(sizes.exact, 5);
    assert_eq!(sizes.subgroup, 16);
    assert_eq!(sizes.total, 10);
}
