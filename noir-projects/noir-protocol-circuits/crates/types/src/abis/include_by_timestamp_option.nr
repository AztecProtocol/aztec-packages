use crate::{constants::INCLUDE_BY_TIMESTAMP_OPTION_LENGTH, traits::{Deserialize, Serialize}};

pub struct IncludeByTimestampOption {
    _opt: Option<u64>,
}

impl Eq for IncludeByTimestampOption {
    fn eq(self, other: Self) -> bool {
        self._opt == other._opt
    }
}

impl Serialize<INCLUDE_BY_TIMESTAMP_OPTION_LENGTH> for IncludeByTimestampOption {
    fn serialize(self) -> [Field; INCLUDE_BY_TIMESTAMP_OPTION_LENGTH] {
        [self._opt.is_some() as Field, self._opt.unwrap_unchecked() as Field]
    }
}

impl Deserialize<INCLUDE_BY_TIMESTAMP_OPTION_LENGTH> for IncludeByTimestampOption {
    fn deserialize(
        serialized: [Field; INCLUDE_BY_TIMESTAMP_OPTION_LENGTH],
    ) -> IncludeByTimestampOption {
        IncludeByTimestampOption {
            _opt: if serialized[0] != 0 {
                Option::some(serialized[1] as u64)
            } else {
                Option::none()
            },
        }
    }
}

impl IncludeByTimestampOption {
    pub fn some(include_by_timestamp: u64) -> Self {
        Self { _opt: Option::some(include_by_timestamp) }
    }

    pub fn none() -> Self {
        Self { _opt: Option::none() }
    }

    pub fn is_none(self) -> bool {
        self._opt.is_none()
    }

    pub fn is_some(self) -> bool {
        self._opt.is_some()
    }

    pub fn unwrap(self) -> u64 {
        self._opt.unwrap()
    }

    pub fn unwrap_unchecked(self) -> u64 {
        self._opt.unwrap_unchecked()
    }

    pub fn min(
        lhs: IncludeByTimestampOption,
        rhs: IncludeByTimestampOption,
    ) -> IncludeByTimestampOption {
        if rhs.is_none() {
            lhs // lhs might also be none, but in that case both would be
        } else {
            IncludeByTimestampOption::min_with_u64(lhs, rhs.unwrap_unchecked())
        }
    }

    pub fn min_with_u64(lhs: IncludeByTimestampOption, rhs: u64) -> IncludeByTimestampOption {
        if lhs._opt.is_none() {
            IncludeByTimestampOption::some(rhs)
        } else {
            let lhs_value = lhs._opt.unwrap_unchecked();

            IncludeByTimestampOption::some(if lhs_value < rhs { lhs_value } else { rhs })
        }
    }
}

#[test]
fn serialization_of_include_by_timestamp_option_none() {
    let item = IncludeByTimestampOption::none();
    let serialized = item.serialize();
    let deserialized = IncludeByTimestampOption::deserialize(serialized);
    assert_eq(deserialized, item);
}

#[test]
fn serialization_of_include_by_timestamp_option_some() {
    let item = IncludeByTimestampOption::some(13);
    let serialized = item.serialize();
    let deserialized = IncludeByTimestampOption::deserialize(serialized);
    assert_eq(deserialized, item);
}

#[test(should_fail)]
fn unwrap_none_fails() {
    let a = IncludeByTimestampOption::none();
    let _ = a.unwrap();
}

#[test]
fn min_none_none() {
    let a = IncludeByTimestampOption::none();
    let b = IncludeByTimestampOption::none();
    let min = IncludeByTimestampOption::min(a, b);
    assert_eq(min.is_none(), true);
    assert_eq(min.is_some(), false);
}

#[test]
fn min_none_zero() {
    let a = IncludeByTimestampOption::none();
    let b = IncludeByTimestampOption::some(0);
    let min = IncludeByTimestampOption::min(a, b);
    assert_eq(min.is_none(), false);
    assert_eq(min.is_some(), true);
    assert_eq(min.unwrap(), 0);
}

#[test]
fn min_none_some() {
    let a = IncludeByTimestampOption::none();
    let b = IncludeByTimestampOption::some(13);
    let min = IncludeByTimestampOption::min(a, b);
    assert_eq(min.unwrap(), 13);
}

#[test]
fn min_some_some() {
    let a = IncludeByTimestampOption::some(13);
    let b = IncludeByTimestampOption::some(42);
    let min = IncludeByTimestampOption::min(a, b);
    assert_eq(min.unwrap(), 13);
}

#[test]
fn min_with_u64_none() {
    let a = IncludeByTimestampOption::none();
    let b = 42;
    let min = IncludeByTimestampOption::min_with_u64(a, b);
    assert_eq(min.unwrap(), 42);
}

#[test]
fn min_with_u64_some() {
    let a = IncludeByTimestampOption::some(13);
    let b = 42;
    let c = 8;

    let min_a_b = IncludeByTimestampOption::min_with_u64(a, b);
    assert_eq(min_a_b.unwrap(), 13);

    let min_a_c = IncludeByTimestampOption::min_with_u64(a, c);
    assert_eq(min_a_c.unwrap(), 8);
}
