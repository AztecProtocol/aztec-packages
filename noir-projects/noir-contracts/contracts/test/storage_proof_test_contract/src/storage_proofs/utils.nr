use std::static_assert;

/// Unrolls a loop at comptime
pub comptime fn unroll_loop(start: u32, end: u32, body: fn(u32) -> Quoted) -> Quoted {
    let mut iterations: [Quoted] = @[];
    for i in start..end {
        iterations = iterations.push_back(body(i));
    }
    iterations.join(quote {})
}

/// Creates a loop that:
/// - In ACIR: iterates from 0 to upper bound, and conditions body on index >= start_variable & index < end_variable
/// - In BRILLIG: iterates from start_variable to end_variable
pub comptime fn runtime_loop(
    iterator: Quoted,
    start_variable: Quoted,
    end_variable: Quoted,
    upper_bound: Quoted,
    body: Quoted,
) -> Quoted {
    quote {
        assert($start_variable <= $end_variable);
        assert($end_variable <= $upper_bound);
        if std::runtime::is_unconstrained() {
            for $iterator in $start_variable..$end_variable {
                $body()
            }
        } else {
            for $iterator in 0..$upper_bound {
                if $iterator >= $start_variable & $iterator < $end_variable {
                    $body()
                }
            }
        }
    }
}

pub fn balance_to_field(balance: [u8; 32], balance_length: u8) -> Field {
    let mut result: Field = 0;
    runtime_loop!(
        quote { i },
        quote { 0 },
        quote { (balance_length as u32) },
        quote { 32 },
        quote {
            result = result * 256;
            result = result + balance[i] as Field;
        },
    );
    result
}

pub fn to_nibbles<let N: u32, let K: u32>(bytes: [u8; N]) -> [u8; K] {
    static_assert(
        (N * 2) == K,
        "Nibble amount should be double the byte amount",
    );
    let mut nibbles: [u8; K] = [0; K];
    for i in 0..N {
        let byte = bytes[i];
        nibbles[i * 2] = byte >> 4;
        nibbles[i * 2 + 1] = (byte << 4) >> 4;
    }
    nibbles
}

#[inline_always]
pub fn get_low_nibble(byte: u8) -> u8 {
    (byte << 4) >> 4
}

#[inline_always]
pub fn get_high_nibble(byte: u8) -> u8 {
    byte >> 4
}

pub fn get_rlp_length(first_elem: u8, length: u8) -> u8 {
    let mut rlp_length: u8 = 0;
    if length == 0 {
        rlp_length = 1;
    } else if length == 1 {
        if first_elem <= 127 {
            rlp_length = 1;
        } else {
            rlp_length = 2;
        }
    } else {
        rlp_length = 1 + length;
    }
    rlp_length
}
