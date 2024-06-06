fn main(x: Field) {
    let mut acc = x;
    for i in 0..100 {
        acc = dep::std::hash::pedersen_hash([acc]);
    }
    assert_eq(acc * 2, 28);
    assert_eq(acc * 3, 42);
}

