fn extract_word_from_coord_bytes_le(
    input: array<u32, {{ num_16_bit_words_per_coord }}>,
    word_idx: u32,
    chunk_size: u32
) -> u32 {
    var word = 0u;
    let start_byte_idx = {{ num_16_bit_words_per_coord }}u - 1u - ((word_idx * chunk_size + chunk_size) / 16u);
    let end_byte_idx = {{ num_16_bit_words_per_coord }}u - 1u - ((word_idx * chunk_size) / 16u);

    let start_byte_offset = (word_idx * chunk_size + chunk_size) % 16u;
    let end_byte_offset = (word_idx * chunk_size) % 16u;

    var mask = 0u;
    if (start_byte_offset > 0u) {
        mask = (2u << (start_byte_offset - 1u)) - 1u;
    }
    if (start_byte_idx == end_byte_idx) {
        word = (input[start_byte_idx] & mask) >> end_byte_offset;
    } else {
        word = (input[start_byte_idx] & mask) << (16u - end_byte_offset);
        word += input[end_byte_idx] >> end_byte_offset;
    }

    return word;
}

fn extract_word_from_bytes_le(
    input: array<u32, 16>,
    word_idx: u32,
    chunk_size: u32
) -> u32 {
    var word = 0u;
    let start_byte_idx = 15u - ((word_idx * chunk_size + chunk_size) / 16u);
    let end_byte_idx = 15u - ((word_idx * chunk_size) / 16u);

    let start_byte_offset = (word_idx * chunk_size + chunk_size) % 16u;
    let end_byte_offset = (word_idx * chunk_size) % 16u;

    var mask = 0u;
    if (start_byte_offset > 0u) {
        mask = (2u << (start_byte_offset - 1u)) - 1u;
    }
    if (start_byte_idx == end_byte_idx) {
        word = (input[start_byte_idx] & mask) >> end_byte_offset;
    } else {
        word = (input[start_byte_idx] & mask) << (16u - end_byte_offset);
        word += input[end_byte_idx] >> end_byte_offset;
    }

    return word;
}
