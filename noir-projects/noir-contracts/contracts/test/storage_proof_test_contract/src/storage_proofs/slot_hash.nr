use super::{
    bytes_sink::{BytesChecker, BytesSink, BytesWriter},
    keccak::{keccak256_limbs, KeccakHasher},
    types::StorageSlot,
    utils::{get_low_nibble, get_rlp_length, runtime_loop},
};

global SLOT_RLP_MAX_LENGTH: u32 = 69;

#[inline_always]
fn rlp_encode_to_sink<S: BytesSink>(
    slot: StorageSlot,
    start_nibble_idx: u32,
    trie_key: [u8; 32],
    sink: &mut S,
) {
    let mut current_nibble_idx = start_nibble_idx;

    let first_key_byte = if current_nibble_idx % 2 == 0 {
        0x20
    } else {
        let first_byte = trie_key[(current_nibble_idx / 2) as u32];
        current_nibble_idx += 1;
        0x30 + get_low_nibble(first_byte)
    };

    let key_length = 32 - (current_nibble_idx as u8) / 2 + 1;

    let leaf_key_rlp_length = get_rlp_length(first_key_byte, key_length);

    assert(slot.value_length <= 32);
    // Storage values are double-RLP encoded in the trie: RLP(RLP(value))
    // First compute the inner RLP length
    let inner_rlp_length = get_rlp_length(slot.value[0], slot.value_length);

    // Then compute the outer RLP length (wrapping the inner RLP as a string)
    // The inner RLP starts with either the value itself (if single byte <= 127)
    // or with 0x80 + length prefix
    let inner_first_byte = if slot.value_length == 0 {
        0x80
    } else if (slot.value_length == 1) & (slot.value[0] <= 127) {
        slot.value[0]
    } else {
        0x80 + slot.value_length
    };
    let outer_rlp_length = get_rlp_length(inner_first_byte, inner_rlp_length);

    let leaf_rlp_total_length: u8 = leaf_key_rlp_length + outer_rlp_length;

    if leaf_rlp_total_length <= 55 {
        sink.add_byte(0xc0 + leaf_rlp_total_length);
    } else {
        sink.add_byte(0xf8);
        sink.add_byte(leaf_rlp_total_length);
    }

    // key
    if (key_length == 1) & (first_key_byte <= 127) {
        sink.add_byte(first_key_byte);
    } else {
        sink.add_byte(0x80 + key_length);
        sink.add_byte(first_key_byte);
        let start_byte_idx = current_nibble_idx / 2;
        let end_byte_idx = start_byte_idx + ((key_length - 1) as u32);

        runtime_loop!(
            quote {i},
            quote {start_byte_idx},
            quote {end_byte_idx},
            quote {trie_key.len()},
            quote {
                sink.add_byte(trie_key[i]);
            },
        );
    }

    // value - double RLP encoded: RLP(RLP(value))
    // Outer wrapper
    if (inner_rlp_length == 1) & (inner_first_byte <= 127) {
        // Inner RLP is a single byte <= 127, no outer wrapper needed
    } else {
        sink.add_byte(0x80 + inner_rlp_length);
    }

    // Inner RLP encoding
    if slot.value_length == 0 {
        sink.add_byte(0x80);
    } else if (slot.value_length == 1) & (slot.value[0] <= 127) {
        sink.add_byte(slot.value[0]);
    } else {
        sink.add_byte(0x80 + slot.value_length);

        runtime_loop!(
            quote {i},
            quote {0},
            quote {(slot.value_length as u32)},
            quote {32},
            quote {
                sink.add_byte(slot.value[i]);
            },
        );
    }
}

unconstrained fn rlp_encode_unconstrained(
    slot: StorageSlot,
    start_nibble_idx: u32,
    trie_key: [u8; 32],
) -> ([u8; SLOT_RLP_MAX_LENGTH], u32) {
    let mut writer = BytesWriter::new();
    rlp_encode_to_sink(slot, start_nibble_idx, trie_key, &mut writer);
    writer.finish()
}

pub fn compute_slot_hash(slot: StorageSlot, start_nibble_idx: u32, trie_key: [u8; 32]) -> [u64; 4] {
    if std::runtime::is_unconstrained() {
        let mut hasher: KeccakHasher = KeccakHasher::new();
        rlp_encode_to_sink(slot, start_nibble_idx, trie_key, &mut hasher);
        hasher.finish_to_limbs()
    } else {
        // Safety: Constrained below
        let (bytes, length) = unsafe { rlp_encode_unconstrained(slot, start_nibble_idx, trie_key) };

        let mut checker = BytesChecker::new(bytes, length);
        rlp_encode_to_sink(slot, start_nibble_idx, trie_key, &mut checker);
        checker.finish();

        keccak256_limbs(bytes, length)
    }
}
