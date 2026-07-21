use super::{
    bytes_sink::{BytesChecker, BytesSink, BytesWriter},
    keccak::{keccak256_limbs, KeccakHasher},
    types::Node,
    utils::unroll_loop,
};

global BRANCH_RLP_MAX_LENGTH: u32 = 532;

#[inline_always]
fn compute_rlp_length(node: Node) -> u16 {
    let mut len: u16 = 0;

    unroll_loop!(
        0_u32,
        16_u32,
        |i| {
            quote {
                if node.row_exist[$i] {
                    len += 33;
                } else {
                    len += 1;
                }
            }
        },
    );
    len += 1;
    len
}

#[inline_always]
fn rlp_encode_to_sink<S: BytesSink>(node: Node, sink: &mut S) {
    let len = compute_rlp_length(node);

    // Add the length to the sink
    if len <= 55 {
        sink.add_byte(0xc0 + (len as u8));
    } else if len <= 255 {
        sink.add_byte(0xf8);
        sink.add_byte(len as u8);
    } else {
        sink.add_byte(0xf9);
        sink.add_byte((len >> 8) as u8); // high byte
        sink.add_byte((len & 0xff) as u8); // low byte
    }

    // Add the nodes to the sink
    // Nested quotes don't work very well yet, so unroll without unroll_loop
    comptime {
        let mut outer_iterations: [Quoted] = @[];
        for i in 0..16 {
            let mut inner_iterations: [Quoted] = @[];
            for j in 0..4 {
                inner_iterations = inner_iterations
                    .push_back(
                        quote {
                            sink.add_u64(node.rows[$i][$j]);
                        },
                    );
            }
            let inner_code = inner_iterations.join(quote {});
            outer_iterations = outer_iterations.push_back(
                quote {
                    if node.row_exist[$i] {
                        sink.add_byte(0xa0);
                        $inner_code
                    } else {
                        sink.add_byte(0x80);
                    }
                },
            );
        }
        outer_iterations.join(quote {})
    }

    // Empty inlined value (safe for main trie branches).
    // TODO: Evaluate if contract storage branches can have inlined values.
    sink.add_byte(0x80);
}

unconstrained fn rlp_encode_unconstrained(node: Node) -> ([u8; BRANCH_RLP_MAX_LENGTH], u32) {
    let mut writer = BytesWriter::new();
    rlp_encode_to_sink(node, &mut writer);
    writer.finish()
}

pub fn rlp_and_hash_branch_node(node: Node) -> [u64; 4] {
    if std::runtime::is_unconstrained() {
        let mut hasher: KeccakHasher = KeccakHasher::new();
        rlp_encode_to_sink(node, &mut hasher);
        hasher.finish_to_limbs()
    } else {
        // Safety: Constrained below
        let (bytes, length) = unsafe { rlp_encode_unconstrained(node) };

        let mut checker = BytesChecker::new(bytes, length);
        rlp_encode_to_sink(node, &mut checker);
        checker.finish();

        keccak256_limbs(bytes, length)
    }
}
