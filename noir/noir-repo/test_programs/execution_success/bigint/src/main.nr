use dep::std::bigint;
use dep::std::{bigint::Secpk1Fq, bigint::U256, println};

fn main(mut x: [u8; 5], y: [u8; 5]) {
    let a = bigint::Secpk1Fq::from_le_bytes(&[x[0], x[1], x[2], x[3], x[4]]);
    let b = bigint::Secpk1Fq::from_le_bytes(&[y[0], y[1], y[2], y[3], y[4]]);
    let a_bytes = a.to_le_bytes();
    let b_bytes = b.to_le_bytes();
    for i in 0..5 {
        assert(a_bytes[i] == x[i]);
        assert(b_bytes[i] == y[i]);
    }

    let d = a * b - b;
    let d1 = bigint::Secpk1Fq::from_le_bytes(597243850900842442924.to_le_bytes(10));
    assert(d1 == d);
    // big_int_example(x[0], x[1]);
    test_u256(x, y);
}

// docs:start:big_int_example
fn big_int_example(x: u8, y: u8) {
    let a = Secpk1Fq::from_le_bytes(&[x, y, 0, 45, 2]);
    let b = Secpk1Fq::from_le_bytes(&[y, x, 9]);
    let c = (a + b) * b / a;
    let d = c.to_le_bytes();
    println(d[0]);
}
// docs:end:big_int_example



fn test_u256(mut x: [u8; 5], y: [u8; 5]) {
    // Addition
    let a = U256::from_le_bytes(&[x[0], x[1], x[2], x[3], x[4]]);
    let b = U256::from_le_bytes(&[y[0], y[1], y[2], y[3], y[4]]);
    let a_bytes = a.to_le_bytes();
    let b_bytes = b.to_le_bytes();

    let d = (a+b).to_le_bytes();
    for i in 0..5 {
        assert(d[i] == x[i]+y[i]);
    }

    // Subtraction
    let a = U256::from_le_bytes(1368468575897.to_le_bytes(10));
    let b = U256::from_le_bytes(137367545722.to_le_bytes(10));
    let d = a - b;
    let d1 = U256::from_le_bytes(1231101030175.to_le_bytes(10));
    assert(d == d1);

    // Multiplication
    let d1 = U256::from_le_bytes(187983169668651374662634.to_le_bytes(10));
    let d = a * b;
    assert(d1 == d);

    // Division
    let a = U256::from_le_bytes(&[6]);
    let b = U256::from_le_bytes(&[3]);
    let d = a/b;
    assert(d.to_le_bytes()[0] == 2);
}