use super::{
    bytes_sink::{BytesChecker, BytesSink, BytesWriter},
    keccak::{keccak256_limbs, KeccakHasher},
    types::{ExtensionHeader, Node},
    utils::unroll_loop,
};

global EXTENSION_RLP_MAX_LENGTH: u32 = 68;

#[inline_always]
fn rlp_encode_to_sink<S: BytesSink>(node: Node, header: ExtensionHeader, sink: &mut S) {
    // We always rlp encode the first nibble
    let extension_length_size = header.extension_length + 1;

    let rlp_data_length: u8 = extension_length_size + 33 + (extension_length_size != 1) as u8;

    if rlp_data_length > 55 {
        sink.add_byte(0xF8);
        sink.add_byte(rlp_data_length);
    } else {
        sink.add_byte(0xC0 + rlp_data_length);
    }
    if extension_length_size != 1 {
        sink.add_byte(0x80 + extension_length_size);
    }
    sink.add_byte(((header.is_odd as u8) << 4) + header.first_nibble);

    unroll_loop!(
        0_u32,
        31_u32,
        |i| {
            quote {
                if $i as u8 < header.extension_length {
                    sink.add_byte(node.get_row_byte(1, $i));
                }
            }
        },
    );
    sink.add_byte(0xA0);

    unroll_loop!(
        0_u32,
        4_u32,
        |i| {
            quote {
                sink.add_u64(node.rows[2][$i]);
            }
        },
    );
}

unconstrained fn rlp_encode_unconstrained(
    node: Node,
    header: ExtensionHeader,
) -> ([u8; EXTENSION_RLP_MAX_LENGTH], u32) {
    let mut writer = BytesWriter::new();
    rlp_encode_to_sink(node, header, &mut writer);
    writer.finish()
}

pub fn rlp_and_hash_extension_node(node: Node, header: ExtensionHeader) -> [u64; 4] {
    if std::runtime::is_unconstrained() {
        let mut hasher: KeccakHasher = KeccakHasher::new();
        rlp_encode_to_sink(node, header, &mut hasher);
        hasher.finish_to_limbs()
    } else {
        // Safety: Constrained below
        let (bytes, length) = unsafe { rlp_encode_unconstrained(node, header) };

        let mut checker = BytesChecker::new(bytes, length);
        rlp_encode_to_sink(node, header, &mut checker);
        checker.finish();

        keccak256_limbs(bytes, length)
    }
}
