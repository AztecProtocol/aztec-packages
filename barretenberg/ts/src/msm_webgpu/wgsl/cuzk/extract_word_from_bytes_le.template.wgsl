// Extract the `chunk_size`-bit limb at `word_idx` from a coordinate stored as
// big-endian 16-bit words (input[N-1] holds the least-significant 16 bits).
// A limb of up to 21 bits can straddle THREE consecutive 16-bit words (e.g. a
// 21-bit limb starting near the top of a word), so we assemble from words
// w0, w0+1 and w0+2. The earlier two-word-only form silently dropped the middle
// word for any chunk_size that produced a 3-word span (correct only for ≤16-bit
// limbs such as the 13-bit karat representation).
fn extract_word_from_coord_bytes_le(
    input: array<u32, {{ num_16_bit_words_per_coord }}>,
    word_idx: u32,
    chunk_size: u32
) -> u32 {
    let n = {{ num_16_bit_words_per_coord }}u;
    let s = word_idx * chunk_size;       // index of the limb's least-significant bit
    let w0 = s / 16u;                    // first 16-bit word holding bit s
    let off = s % 16u;                   // bit offset of s within word w0
    var b0 = input[n - 1u - w0];
    var b1 = 0u;
    if (w0 + 1u < n) { b1 = input[n - 1u - (w0 + 1u)]; }
    var b2 = 0u;
    if (w0 + 2u < n) { b2 = input[n - 1u - (w0 + 2u)]; }
    let lo = b0 | (b1 << 16u);           // bits [16*w0, 16*w0 + 32)
    var word = lo >> off;
    if (off > 0u) { word = word | (b2 << (32u - off)); }  // 3rd word, when off + chunk_size > 32
    return word & ((1u << chunk_size) - 1u);
}

fn extract_word_from_bytes_le(
    input: array<u32, 16>,
    word_idx: u32,
    chunk_size: u32
) -> u32 {
    let s = word_idx * chunk_size;
    let w0 = s / 16u;
    let off = s % 16u;
    var b0 = input[15u - w0];
    var b1 = 0u;
    if (w0 + 1u < 16u) { b1 = input[15u - (w0 + 1u)]; }
    var b2 = 0u;
    if (w0 + 2u < 16u) { b2 = input[15u - (w0 + 2u)]; }
    let lo = b0 | (b1 << 16u);
    var word = lo >> off;
    if (off > 0u) { word = word | (b2 << (32u - off)); }
    return word & ((1u << chunk_size) - 1u);
}
