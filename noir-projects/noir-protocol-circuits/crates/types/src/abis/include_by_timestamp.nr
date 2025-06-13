use crate::{constants::MAX_BLOCK_NUMBER_LENGTH, traits::{Deserialize, Empty, Serialize}};

pub struct IncludeByTimestamp {
    _opt: Option<u32>,
}

impl Empty for IncludeByTimestamp {
    fn empty() -> Self {
        Self { _opt: Option::none() }
    }
}

impl Eq for IncludeByTimestamp {
    fn eq(self, other: Self) -> bool {
        self._opt == other._opt
    }
}

impl Serialize<MAX_BLOCK_NUMBER_LENGTH> for IncludeByTimestamp {
    fn serialize(self) -> [Field; MAX_BLOCK_NUMBER_LENGTH] {
        [self._opt.is_some() as Field, self._opt.unwrap_unchecked() as Field]
    }
}

impl Deserialize<MAX_BLOCK_NUMBER_LENGTH> for IncludeByTimestamp {
    fn deserialize(serialized: [Field; MAX_BLOCK_NUMBER_LENGTH]) -> IncludeByTimestamp {
        IncludeByTimestamp {
            _opt: if serialized[0] != 0 {
                Option::some(serialized[1] as u32)
            } else {
                Option::none()
            },
        }
    }
}

impl IncludeByTimestamp {
    pub fn new(include_by_timestamp: u32) -> Self {
        Self { _opt: Option::some(include_by_timestamp) }
    }

    pub fn is_none(self) -> bool {
        self._opt.is_none()
    }

    pub fn is_some(self) -> bool {
        self._opt.is_some()
    }

    pub fn unwrap(self) -> u32 {
        self._opt.unwrap()
    }

    pub fn unwrap_unchecked(self) -> u32 {
        self._opt.unwrap_unchecked()
    }

    pub fn min(lhs: IncludeByTimestamp, rhs: IncludeByTimestamp) -> IncludeByTimestamp {
        if rhs.is_none() {
            lhs // lhs might also be none, but in that case both would be
        } else {
            IncludeByTimestamp::min_with_u32(lhs, rhs.unwrap_unchecked())
        }
    }

    pub fn min_with_u32(lhs: IncludeByTimestamp, rhs: u32) -> IncludeByTimestamp {
        if lhs._opt.is_none() {
            IncludeByTimestamp::new(rhs)
        } else {
            let lhs_value = lhs._opt.unwrap_unchecked();

            IncludeByTimestamp::new(if lhs_value < rhs { lhs_value } else { rhs })
        }
    }
}

#[test]
fn serialization_of_empty() {
    let item = IncludeByTimestamp::empty();
    let serialized = item.serialize();
    let deserialized = IncludeByTimestamp::deserialize(serialized);
    assert(item.eq(deserialized));
}

#[test]
fn zeroed_is_none() {
    // Large parts of the kernel rely on zeroed to initialize structs. This conveniently matches what `default` does,
    // and though we should eventually move everything to use `default`, it's good to check for now that both are
    // equivalent.
    let a = IncludeByTimestamp::empty();
    assert(a.is_none());
}

#[test]
fn serde_default() {
    let a = IncludeByTimestamp::empty();
    let b = IncludeByTimestamp::deserialize(a.serialize());
    assert(b.is_none());
}

#[test]
fn serde_some() {
    let a = IncludeByTimestamp::new(13);
    let b = IncludeByTimestamp::deserialize(a.serialize());
    assert_eq(b.unwrap(), 13);
}

#[test(should_fail)]
fn default_unwrap_panics() {
    let a = IncludeByTimestamp::empty();
    let _ = a.unwrap();
}

#[test]
fn min_default_default() {
    let a = IncludeByTimestamp::empty();
    let b = IncludeByTimestamp::empty();

    assert(IncludeByTimestamp::min(a, b).is_none());
}

#[test]
fn min_default_some() {
    let a = IncludeByTimestamp::empty();
    let b = IncludeByTimestamp::new(13);

    assert_eq(IncludeByTimestamp::min(a, b).unwrap(), 13);
    assert_eq(IncludeByTimestamp::min(b, a).unwrap(), 13);
}

#[test]
fn min_some_some() {
    let a = IncludeByTimestamp::new(13);
    let b = IncludeByTimestamp::new(42);

    assert_eq(IncludeByTimestamp::min(a, b).unwrap(), 13);
    assert_eq(IncludeByTimestamp::min(b, a).unwrap(), 13);
}

#[test]
fn min_with_u32_default() {
    let a = IncludeByTimestamp::empty();
    let b = 42;

    assert_eq(IncludeByTimestamp::min_with_u32(a, b).unwrap(), 42);
}

#[test]
fn min_with_u32_some() {
    let a = IncludeByTimestamp::new(13);
    let b = 42;
    let c = 8;

    assert_eq(IncludeByTimestamp::min_with_u32(a, b).unwrap(), 13);
    assert_eq(IncludeByTimestamp::min_with_u32(a, c).unwrap(), 8);
}
