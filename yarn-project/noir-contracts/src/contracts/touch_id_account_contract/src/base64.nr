use dep::std;

fn decode(character: u8) -> pub u8 {
    // + = 43
    // z = 122
    let is_less_than_plus = character < 43;
    let is_more_than_lowercase_z = character > 122;
    let is_valid_character = !is_less_than_plus & !is_more_than_lowercase_z;
    assert(is_valid_character);

    let index: Field = (character as Field) - 43;

    if index == 0 { 0 }
    else if index == 1 { 0 }
    else if index == 2 { 62 }
    else if index == 3 { 0 }
    else if index == 4 { 0 }
    else if index == 5 { 52 }
    else if index == 6 { 53 }
    else if index == 7 { 54 }
    else if index == 8 { 55 }
    else if index == 9 { 56 }
    else if index == 10 { 57 }
    else if index == 11 { 58 }
    else if index == 12 { 59 }
    else if index == 13 { 60 }
    else if index == 14 { 61 }
    else if index == 15 { 0 }
    else if index == 16 { 0 }
    else if index == 17 { 0 }
    else if index == 18 { 0 }
    else if index == 19 { 0 }
    else if index == 20 { 0 }
    else if index == 21 { 0 }
    else if index == 22 { 0 }
    else if index == 23 { 1 }
    else if index == 24 { 2 }
    else if index == 25 { 3 }
    else if index == 26 { 4 }
    else if index == 27 { 5 }
    else if index == 28 { 6 }
    else if index == 29 { 7 }
    else if index == 30 { 8 }
    else if index == 31 { 9 }
    else if index == 32 { 10 }
    else if index == 33 { 11 }
    else if index == 34 { 12 }
    else if index == 35 { 13 }
    else if index == 36 { 14 }
    else if index == 37 { 15 }
    else if index == 38 { 16 }
    else if index == 39 { 17 }
    else if index == 40 { 18 }
    else if index == 41 { 19 }
    else if index == 42 { 20 }
    else if index == 43 { 21 }
    else if index == 44 { 22 }
    else if index == 45 { 23 }
    else if index == 46 { 24 }
    else if index == 47 { 25 }
    else if index == 48 { 0 }
    else if index == 49 { 0 }
    else if index == 50 { 0 }
    else if index == 51 { 0 }
    else if index == 52 { 63 }
    else if index == 53 { 0 }
    else if index == 54 { 26 }
    else if index == 55 { 27 }
    else if index == 56 { 28 }
    else if index == 57 { 29 }
    else if index == 58 { 30 }
    else if index == 59 { 31 }
    else if index == 60 { 32 }
    else if index == 61 { 33 }
    else if index == 62 { 34 }
    else if index == 63 { 35 }
    else if index == 64 { 36 }
    else if index == 65 { 37 }
    else if index == 66 { 38 }
    else if index == 67 { 39 }
    else if index == 68 { 40 }
    else if index == 69 { 41 }
    else if index == 70 { 42 }
    else if index == 71 { 43 }
    else if index == 72 { 44 }
    else if index == 73 { 45 }
    else if index == 74 { 46 }
    else if index == 75 { 47 }
    else if index == 76 { 48 }
    else if index == 77 { 49 }
    else if index == 78 { 50 }
    else { 51 }
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
