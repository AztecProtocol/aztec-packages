// Reads a read-only table at witness-dependent indices. The table is large enough that noir keeps it as
// ROM memory opcodes rather than muxing to selects, so this exercises the LogUp memory argument in the
// Honk verifiers (which a memory-free circuit like assert_statement does not).
fn main(i0: u32, i1: u32, i2: u32, table: [Field; 64], e0: pub Field, e1: pub Field, e2: pub Field) {
    assert_eq(table[i0], e0);
    assert_eq(table[i1], e1);
    assert_eq(table[i2], e2);
}
