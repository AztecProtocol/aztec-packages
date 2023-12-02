fn main(y : Field, x : pub Field) {
    // y <= 4x^3 + 7x + 1
    let x_3 = x * x * x;
    assert(y as u32 <= (4 * x_3 + 7 * x + 1) as u32);
}

#[test]
fn test_main() {
    main(39, 2);

    // Uncomment to make test fail
    // main(1, 1);
}
