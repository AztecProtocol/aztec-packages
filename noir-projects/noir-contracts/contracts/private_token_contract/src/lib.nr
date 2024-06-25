use dep::std::embedded_curve_ops::EmbeddedCurvePoint;

global g = EmbeddedCurvePoint { x: 1, y: 17631683881184975370165255887551781615748388533673675138860, is_infinite: false };

pub fn is_on_grumpkin(p: EmbeddedCurvePoint) -> bool {
    if p.is_infinite {
        true
    } else {
        p.y * p.y == p.x * p.x * p.x - 17
    }
}

pub fn scalar_mul(p: EmbeddedCurvePoint, n: Field) -> EmbeddedCurvePoint {
    if n == 0 {
        EmbeddedCurvePoint { x: 0, y: 0, is_infinite: true }
    } else {
        let N_BITS = dep::std::field::modulus_num_bits();
        let scalar_bits: [u1] = n.to_be_bits(N_BITS as u32);
        let mut acc = EmbeddedCurvePoint { x: p.x, y: p.y, is_infinite: p.is_infinite };
        let mut seen_msb = false;
        for i in 0..N_BITS {
            if seen_msb {
                acc= acc + acc;
                if scalar_bits[i] == 1 {
                    acc = acc + p;
                }
            }
            seen_msb |= scalar_bits[i] == 1;
        }
        acc
    }
}

pub fn fixed_base_scalar_mul(n: Field) -> EmbeddedCurvePoint {
    scalar_mul(g, n)
}

pub fn multi_scalar_mul<N>(points: [EmbeddedCurvePoint; N], scalars: [Field; N]) -> EmbeddedCurvePoint {
    let mut acc = EmbeddedCurvePoint { x: 0, y: 0, is_infinite: true };
    for i in 0..N {
        acc+= scalar_mul(points[i], scalars[i]);
    }
    acc
}

pub fn fixed_base_multi_scalar_mul<N>(scalars: [Field; N]) -> EmbeddedCurvePoint {
    let points = [g; N];
    multi_scalar_mul(points, scalars)
}

#[test]
fn test_is_on_grumpkin() {
    assert_eq(is_on_grumpkin(g), true);
    assert_eq(is_on_grumpkin(EmbeddedCurvePoint { x: 1, y: 1, is_infinite: false }), false);

    let g2 = g + g;
    assert_eq(is_on_grumpkin(g2), true);
}

#[test]
fn test_scalar_mul() {
    let g0 = scalar_mul(g, 0);
    assert_eq(g0, EmbeddedCurvePoint { x: 0, y: 0, is_infinite: true });

    assert_eq(g, scalar_mul(g, 1));
    let g2 = g + g;
    assert_eq(g2, scalar_mul(g, 2));
    assert_eq(is_on_grumpkin(g2), true);
    let g3 = g2 + g;
    assert_eq(g3, scalar_mul(g, 3));
    assert_eq(is_on_grumpkin(g3), true);
    let g4 = g2 + g2;
    assert_eq(g4, scalar_mul(g, 4));
    assert_eq(is_on_grumpkin(g4), true);
    let g5 = g4 + g;
    assert_eq(g5, scalar_mul(g, 5));
    assert_eq(g3 + g2, g5);
    assert_eq(is_on_grumpkin(g5), true);
    let g6 = g3 + g3;
    assert_eq(g6, scalar_mul(g, 6));
    assert_eq(is_on_grumpkin(g6), true);
    let g7 = g6 + g;
    assert_eq(g7, scalar_mul(g, 7));
    assert_eq(is_on_grumpkin(g7), true);
    let g8 = g4;
    assert_eq(g8, scalar_mul(g, 8));
    assert_eq(is_on_grumpkin(g8), true);
    let g9 = g8 + g;
    assert_eq(g9, scalar_mul(g, 9));
    assert_eq(is_on_grumpkin(g9), true);
    let g10 = g5 + g5;
    assert_eq(g10, scalar_mul(g, 10));
    assert_eq(g10, fixed_base_scalar_mul(10));
    assert_eq(is_on_grumpkin(g10), true);
}

#[test]
fn test_sub() {
    let g10 = scalar_mul(g, 10);
    let g5 = scalar_mul(g, 5);
    let g5_ = g10 - g5;
    assert_eq(g5_, g5);

    let g9 = scalar_mul(g, 9);
    assert_eq(g10 - g, g9);
    assert_eq(g10 - g9, g);

    let g8 = scalar_mul(g, 8);
    let g2 = scalar_mul(g, 2);
    assert_eq(g10 - g2, g8);
    assert_eq(g10 - g8, g2);
}

#[test]
fn test_multi_scalar_mul() {
    let points = [g, g, g, g, g];
    let scalars = [1, 2, 3, 4, 5];
    let p = multi_scalar_mul(points, scalars);
    let expected = scalar_mul(g, 15);
    assert_eq(p, expected);

    let p = fixed_base_multi_scalar_mul([1, 2, 3, 4, 5]);
    assert_eq(p, expected);
}

