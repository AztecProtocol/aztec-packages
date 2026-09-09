// The statement whose UltraHonk ZK proof the app circuit verifies. It only needs to be small and to
// have a public input.
fn main(x: Field, y: pub Field) {
    assert(x != y);
}
