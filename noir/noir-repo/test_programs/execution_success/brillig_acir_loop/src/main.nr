fn main(x: Field, y: pub Field) {
    // foo(x, y);
    for _ in 0..4 {
        foo(x, y);
        // check_values(x, y);
    }
}

unconstrained fn foo(x: Field, y: Field) {
    check_values(x, y);
}

unconstrained fn check_values(x: Field, y: Field) {
    assert(x != y);
}
