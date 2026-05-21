pub use std::embedded_curve_ops::EmbeddedCurvePoint;

/// Validates that the given point exists on the Grumpkin curve.
pub fn validate_on_curve(p: EmbeddedCurvePoint) {
    // y^2 == x^3 - 17
    let x = p.x;
    let y = p.y;
    // p.is_infinite() <==> x == y == 0, considered on the curve:
    if !p.is_infinite() {
        assert_eq(y * y, x * x * x - 17, "Point not on curve");
    }
}
