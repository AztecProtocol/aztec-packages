use crate::types::type_serialisation::TypeSerialisationInterface;

struct Point {
    x: Field,
    y: Field,
}

impl Point {
    fn new(x: Field, y: Field) -> Self {
        Point { x, y }
    } 
}

global POINT_SERIALIZED_LEN: Field = 2;

fn deserializePoint(fields: [Field; POINT_SERIALIZED_LEN]) -> Point {
    Point {
        x: fields[0],
        y: fields[1],
    }
}

fn serializePoint(point: Point) -> [Field; POINT_SERIALIZED_LEN] {
    [point.x, point.y]
}

global PointSerialisationMethods = TypeSerialisationInterface {
    deserialize: deserializePoint,
    serialize: serializePoint,
};