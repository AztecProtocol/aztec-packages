use dep::std::embedded_curve_ops::EmbeddedCurvePoint;
use dep::std::embedded_curve_ops::embedded_curve_add;


fn main(point1_x: pub Field, point1_y: pub Field,
        point2_x: pub Field, point2_y: pub Field) -> pub EmbeddedCurvePoint {

    let point1 = EmbeddedCurvePoint {
        x: point1_x,
        y: point1_y,
        is_infinite: false
    };

    let point2 = EmbeddedCurvePoint {
        x: point2_x,
        y: point2_y,
        is_infinite: false
    };

    let result = embedded_curve_add(point1, point2);
    assert(result.x != 0);
    assert(result.y != 0);
    result
}

