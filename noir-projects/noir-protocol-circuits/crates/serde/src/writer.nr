pub struct Writer<let N: u32> {
    data: [Field; N],
    offset: u32,
}

impl<let N: u32> Writer<N> {
    pub fn new() -> Self {
        Self { data: [0; N], offset: 0 }
    }

    pub fn write(&mut self, value: Field) {
        self.data[self.offset] = value;
        self.offset += 1;
    }

    pub fn write_u32(&mut self, value: u32) {
        self.write(value as Field);
    }

    pub fn write_u64(&mut self, value: u64) {
        self.write(value as Field);
    }

    pub fn write_bool(&mut self, value: bool) {
        self.write(value as Field);
    }

    pub fn write_array<let K: u32>(&mut self, value: [Field; K]) {
        for i in 0..K {
            self.data[i + self.offset] = value[i];
        }
        self.offset += K;
    }

    pub fn write_struct<T, let K: u32>(&mut self, value: T, serialize: fn(T) -> [Field; K]) {
        self.write_array(serialize(value));
    }

    pub fn write_struct_array<T, let K: u32, let C: u32>(
        &mut self,
        value: [T; C],
        serialize: fn(T) -> [Field; K],
    ) {
        for i in 0..C {
            self.write_struct(value[i], serialize);
        }
    }

    pub fn advance_offset(&mut self, offset: u32) {
        self.offset += offset;
    }

    pub fn finish(self) -> [Field; N] {
        assert_eq(self.offset, self.data.len(), "Writer did not write all data");
        self.data
    }
}
