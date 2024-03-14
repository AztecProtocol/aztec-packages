use crate::{constants::{MAX_BLOCK_NUMBER_LENGTH}, traits::{Deserialize, Serialize}};

struct MaxBlockNumber {
    _opt: Option<u32>
}

impl Default for MaxBlockNumber {
    fn default() -> Self {
        Self { _opt: Option::none() }
    }
}

impl Eq for MaxBlockNumber {
    fn eq(self, other: Self) -> bool {
        // Option does not impl Eq, so we do this manually for now
        if self._opt.is_none() & other._opt.is_none() {
            true
        } else if self._opt.is_some() & other._opt.is_some() {
            self._opt.unwrap_unchecked() == other._opt.unwrap_unchecked()
        } else {
            false
        }       
    }
}

impl Serialize<MAX_BLOCK_NUMBER_LENGTH> for MaxBlockNumber {
    fn serialize(self) -> [Field; MAX_BLOCK_NUMBER_LENGTH] {
        [self._opt._is_some as Field, self._opt._value as Field]
    }
}

impl Deserialize<MAX_BLOCK_NUMBER_LENGTH> for MaxBlockNumber {
    fn deserialize(serialized: [Field; MAX_BLOCK_NUMBER_LENGTH]) -> MaxBlockNumber {
        MaxBlockNumber {
            _opt: Option {
                _is_some: serialized[0] as bool,
                _value: serialized[1] as u32,
            }
        }
    }
}

impl MaxBlockNumber {
    pub fn new(max_block_number: u32) -> Self {
        Self { _opt: Option::some(max_block_number) }
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

    pub fn lower(lhs: MaxBlockNumber, rhs: MaxBlockNumber) -> MaxBlockNumber {
        if lhs._opt.is_none() {
            rhs
        } else if rhs._opt.is_none() {
            lhs
        } else {
            let lhs_value = lhs._opt.unwrap_unchecked();
            let rhs_value = rhs._opt.unwrap_unchecked();

            MaxBlockNumber::new(
                if lhs_value < rhs_value {
                lhs_value
            } else {
                rhs_value
            }
            )
        }
    }

    pub fn lower_unwrapped(lhs: MaxBlockNumber, rhs: u32) -> MaxBlockNumber {
        if lhs._opt.is_none() {
            MaxBlockNumber::new(rhs)
        } else {
            let lhs_value = lhs._opt.unwrap_unchecked();

            MaxBlockNumber::new(if lhs_value < rhs { lhs_value } else { rhs })
        }
    }
}

#[test]
fn max_block_number_zeroed_is_none() {
    let a: MaxBlockNumber = dep::std::unsafe::zeroed();
    assert(a.is_none());
}

#[test]
fn max_block_number_eq_none_none() {
    let a = MaxBlockNumber::default();
    let b = MaxBlockNumber::default();
    assert(a.eq(b));
}

#[test]
fn max_block_number_eq_none_some() {
    let a = MaxBlockNumber::default();
    let b = MaxBlockNumber::new(42);
    assert(!a.eq(b));
}

#[test]
fn max_block_number_eq_some_nome() {
    let a = MaxBlockNumber::new(42);
    let b = MaxBlockNumber::default();
    assert(!a.eq(b));
}

#[test]
fn max_block_number_eq_some_some_neq() {
    let a = MaxBlockNumber::new(42);
    let b = MaxBlockNumber::new(13);
    assert(!a.eq(b));
}

#[test]
fn max_block_number_eq_some_some_eq() {
    let a = MaxBlockNumber::new(42);
    let b = MaxBlockNumber::new(42);
    assert(a.eq(b));
}

