// Tests a very simple program.
// 
// The features being tested is using assert on brillig
fn main(x: Field) {
    assert(1 == conditional(x as bool));
}

unconstrained fn conditional(x: bool) -> pub Field {
    assert(x);
    1
}
