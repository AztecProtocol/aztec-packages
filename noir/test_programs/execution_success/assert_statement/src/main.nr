// Tests a very simple program.
// 
// The features being tested is assertion
#[recursive]
fn main(x: Field, y: pub Field) {
    assert(x == y, "x and y are not equal");
    assert_eq(x, y, "x and y are not equal");
}
