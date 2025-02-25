// The sqrt of -3 in noir's native field.
pub(crate) global SQRT_NEG_3: Field = 8815841940592487684786734430012312169832938914291687956923;

pub(crate) global GRUMPKIN_B: Field = 0 - 17;

#[test]
fn test_sqrt_neg_3() {
    assert(SQRT_NEG_3 * SQRT_NEG_3 == -3);
}
