use dep::std::cmp::Eq;

global GRUMPKIN_PRIVATE_KEY_SERIALIZED_LEN: Field = 2;

struct GrumpkinPrivateKey {
    high: Field,
    low: Field,
}

impl Eq for GrumpkinPrivateKey {
    fn eq(self, key: GrumpkinPrivateKey) -> bool {
        (key.high == self.high) & (key.low == self.low)
    }
}

impl GrumpkinPrivateKey {
    pub fn new(high: Field, low: Field) -> Self {
        GrumpkinPrivateKey { high, low }
    }

    pub fn zero() -> Self {
        Self {
            high: 0,
            low: 0,
        }
    }

    pub fn is_zero(self) -> bool {
        (self.high == 0) & (self.low == 0)
    }

    fn serialize(self) -> [Field; GRUMPKIN_PRIVATE_KEY_SERIALIZED_LEN] {
        [self.high, self.low]
    }

    fn assert_is_zero(self) {
        assert(self.high == 0);
        assert(self.low == 0);
    }
}
