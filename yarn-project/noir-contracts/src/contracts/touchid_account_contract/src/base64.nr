use dep::std;

fn decode(mut character: u8) -> pub u8 {
    std::println(character);
    let decoding_table: [i8; 80] = [
        0,//-1,  // '+'
        0,//-1,  // ','
        62,  // '-'
        0,//-1,  // '.'
        0,//-1,  // '/'
        52,  // '0'
        53,  // '1'
        54,  // '2'
        55,  // '3'
        56,  // '4'
        57,  // '5'
        58,  // '6'
        59,  // '7'
        60,  // '8'
        61,  // '9'
        0,//-1,  // ':'
        0,//-1,  // ';'
        0,//-1,  // '<'
        0,//-1,  // '='
        0,//-1,  // '>'
        0,//-1,  // '?'
        0,//-1,  // '@'
        0,   // 'A'
        1,   // 'B'
        2,   // 'C'
        3,   // 'D'
        4,   // 'E'
        5,   // 'F'
        6,   // 'G'
        7,   // 'H'
        8,   // 'I'
        9,   // 'J'
        10,  // 'K'
        11,  // 'L'
        12,  // 'M'
        13,  // 'N'
        14,  // 'O'
        15,  // 'P'
        16,  // 'Q'
        17,  // 'R'
        18,  // 'S'
        19,  // 'T'
        20,  // 'U'
        21,  // 'V'
        22,  // 'W'
        23,  // 'X'
        24,  // 'Y'
        25,  // 'Z'
        0,//-1,  // '['
        0,//-1,  // '\'
        0,//-1,  // ']'
        0,//-1,  // '^'
        63,  // '_'
        0,//-1,  // '`'
        26,  // 'a'
        27,  // 'b'
        28,  // 'c'
        29,  // 'd'
        30,  // 'e'
        31,  // 'f'
        32,  // 'g'
        33,  // 'h'
        34,  // 'i'
        35,  // 'j'
        36,  // 'k'
        37,  // 'l'
        38,  // 'm'
        39,  // 'n'
        40,  // 'o'
        41,  // 'p'
        42,  // 'q'
        43,  // 'r'
        44,  // 's'
        45,  // 't'
        46,  // 'u'
        47,  // 'v'
        48,  // 'w'
        49,  // 'x'
        50,  // 'y'
        51,  // 'z'
    ];

    // + = 43
    // z = 122
    let is_less_than_plus = character < 43;
    let is_more_than_lowercase_z = character > 122;
    let is_valid_character = !is_less_than_plus & !is_more_than_lowercase_z;
    assert(is_valid_character);

    character -= 43;

    let base64_val = decoding_table[character as Field];

    assert(base64_val >= 0);

    base64_val as u8
}

fn decode_base64(base64: [u8; 43]) -> [u8; 32] {
    let mut buffer: [u8; 32] = [0; 32];

    for i in 0..11 {
        let block_start = i * 4;

        let d0 = decode(base64[block_start]);
        let d1 = decode(base64[block_start + 1]);
        let d2 = decode(base64[block_start + 2]);

        let buffer_start = i * 3;
        buffer[buffer_start] = d0 << 2 | d1 >> 4;
        buffer[buffer_start + 1] = d1 << 4 | d2 >> 2;

        if (i < 10) {
            let d3 = decode(base64[block_start + 3]);
            buffer[buffer_start + 2] = d2 << 6 | d3;
        }
    }

    buffer
}
