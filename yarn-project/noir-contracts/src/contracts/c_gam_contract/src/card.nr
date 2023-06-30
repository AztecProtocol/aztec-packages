
struct Card {
    inner: Field,
}

impl Card {
    fn default() -> Self {
        Card {
            inner: 1
        }
    }
    fn id(self) -> Field {
        self.inner
    }
    fn dummy() -> Self {
        Card {
            inner: 0
        }
    }
    fn is_dummy(self) -> bool {
        self.inner == 0
    }
    fn points(self) -> u8 {
        self.inner.to_le_bytes(32)[0]
    }
    fn strength(self) -> u8 {
        self.inner.to_le_bytes(32)[1]
    }
}