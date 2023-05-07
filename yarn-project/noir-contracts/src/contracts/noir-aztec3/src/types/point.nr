struct Point {
    x: Field,
    y: Field,
}

impl Point {
    fn new(x: Field, y: Field) -> Self {
        Point { x, y }
    }

    fn constrain_equal(self, other: Point) {
        constrain self.x == other.x;
        constrain self.y == other.y;
    }
}