use super::keccak::KeccakHasher;

pub trait BytesSink {
    fn add_byte(&mut self, byte: u8);
    fn add_u64(&mut self, value: u64);
}

/// Writes bytes to an array.
pub struct BytesWriter<let N: u32> {
    bytes: [u8; N],
    index: u32,
}

impl<let N: u32> BytesWriter<N> {
    pub fn new() -> Self {
        Self { bytes: [0; N], index: 0 }
    }

    pub fn finish(self) -> ([u8; N], u32) {
        (self.bytes, self.index)
    }
}

impl<let N: u32> BytesSink for BytesWriter<N> {
    fn add_byte(&mut self, byte: u8) {
        self.bytes[self.index] = byte;
        self.index += 1;
    }

    fn add_u64(&mut self, mut value: u64) {
        for _ in 0..8 {
            self.add_byte(value as u8);
            value = value >> 8;
        }
    }
}

/// Checks that a given array matches the expected bytes written, up to a given length.
pub struct BytesChecker<let N: u32> {
    bytes: [u8; N],
    index: u32,
    expected_length: u32,
}

impl<let N: u32> BytesChecker<N> {
    pub fn new(bytes: [u8; N], expected_length: u32) -> Self {
        Self { bytes, index: 0, expected_length }
    }

    pub fn finish(self) {
        assert_eq(self.index, self.expected_length);
    }
}

impl<let N: u32> BytesSink for BytesChecker<N> {
    fn add_byte(&mut self, byte: u8) {
        assert_eq(self.bytes[self.index], byte);
        self.index += 1;
    }

    fn add_u64(&mut self, mut value: u64) {
        for _ in 0..8 {
            self.add_byte(value as u8);
            value = value >> 8;
        }
    }
}

/// Hashes the bytes written.
impl BytesSink for KeccakHasher {
    fn add_byte(&mut self, byte: u8) {
        KeccakHasher::add_byte(self, byte);
    }

    fn add_u64(&mut self, mut value: u64) {
        KeccakHasher::add_u64(self, value);
    }
}
