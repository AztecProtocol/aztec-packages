struct Point {
    x: Field,
    y: Field,
}

impl Point {
    fn new(x: Field, y: Field) -> Self {
        Point { x, y }
    }

    fn assert_equal(self, other: Point) {
        assert (self.x == other.x);
        assert (self.y == other.y);
    }
}