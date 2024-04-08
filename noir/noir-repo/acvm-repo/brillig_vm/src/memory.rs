use acir::{brillig::MemoryAddress, FieldElement};
use num_bigint::BigUint;
use num_traits::{One, Zero};

pub const MEMORY_ADDRESSING_BIT_SIZE: u32 = 64;

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
enum FieldOrInteger {
    Field(FieldElement),
    Integer(BigUint),
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct MemoryValue {
    value: FieldOrInteger,
    pub bit_size: u32,
}

#[derive(Debug, thiserror::Error)]
pub enum MemoryTypeError {
    #[error("Bit size for value {value_bit_size} does not match the expected bit size {expected_bit_size}")]
    MismatchedBitSize { value_bit_size: u32, expected_bit_size: u32 },
}

impl MemoryValue {
    pub fn new_checked(value: FieldElement, bit_size: u32) -> Option<Self> {
        if bit_size == FieldElement::max_num_bits() {
            Some(Self::new_field(value))
        } else {
            let as_integer = BigUint::from_bytes_be(&value.to_be_bytes());
            let max = BigUint::one() << bit_size;
            if as_integer < max {
                Some(Self::new_integer(as_integer, bit_size))
            } else {
                None
            }
        }
    }

    pub fn new_integer(value: BigUint, bit_size: u32) -> Self {
        MemoryValue { value: FieldOrInteger::Integer(value), bit_size }
    }

    pub fn new_field(value: FieldElement) -> Self {
        MemoryValue { value: FieldOrInteger::Field(value), bit_size: FieldElement::max_num_bits() }
    }

    pub fn to_integer(&self) -> &BigUint {
        match &self.value {
            FieldOrInteger::Integer(value) => value,
            FieldOrInteger::Field(_) => panic!("value is not an integer"),
        }
    }

    pub fn to_field(&self) -> &FieldElement {
        match &self.value {
            FieldOrInteger::Field(value) => value,
            FieldOrInteger::Integer(_) => panic!("value is not a field element"),
        }
    }

    pub fn unify_to_field(&self) -> FieldElement {
        match &self.value {
            FieldOrInteger::Field(value) => *value,
            FieldOrInteger::Integer(value) => {
                FieldElement::from_be_bytes_reduce(&value.to_bytes_be())
            }
        }
    }

    pub fn unify_to_integer(&self) -> BigUint {
        match &self.value {
            FieldOrInteger::Field(value) => BigUint::from_bytes_be(&value.to_be_bytes()),
            FieldOrInteger::Integer(value) => value.clone(),
        }
    }

    pub fn to_usize(&self) -> usize {
        assert!(self.bit_size == MEMORY_ADDRESSING_BIT_SIZE, "value is not typed as brillig usize");
        let integer = self.to_integer();
        integer.try_into().unwrap()
    }

    pub fn expect_bit_size(&self, expected_bit_size: u32) -> Result<(), MemoryTypeError> {
        if self.bit_size != expected_bit_size {
            return Err(MemoryTypeError::MismatchedBitSize {
                value_bit_size: self.bit_size,
                expected_bit_size,
            });
        }
        Ok(())
    }
}

impl std::fmt::Display for MemoryValue {
    fn fmt(&self, f: &mut ::std::fmt::Formatter) -> Result<(), ::std::fmt::Error> {
        let typ = match self.bit_size {
            0 => "null".to_string(),
            1 => "bool".to_string(),
            _ if self.bit_size == FieldElement::max_num_bits() => "field".to_string(),
            _ => format!("u{}", self.bit_size),
        };
        let num = match self.value {
            FieldOrInteger::Field(ref value) => value.to_string(),
            FieldOrInteger::Integer(ref value) => value.to_string(),
        };

        f.write_str(format!("{}: {}", num, typ).as_str())
    }
}

impl Default for MemoryValue {
    fn default() -> Self {
        MemoryValue::new_integer(BigUint::zero(), 0)
    }
}

impl From<FieldElement> for MemoryValue {
    fn from(field: FieldElement) -> Self {
        MemoryValue::new_field(field)
    }
}

impl From<usize> for MemoryValue {
    fn from(value: usize) -> Self {
        MemoryValue::new_integer(value.into(), MEMORY_ADDRESSING_BIT_SIZE)
    }
}

impl From<u64> for MemoryValue {
    fn from(value: u64) -> Self {
        MemoryValue::new_integer((value as u128).into(), 64)
    }
}

impl From<u32> for MemoryValue {
    fn from(value: u32) -> Self {
        MemoryValue::new_integer((value as u128).into(), 32)
    }
}

impl From<u8> for MemoryValue {
    fn from(value: u8) -> Self {
        MemoryValue::new_integer((value as u128).into(), 8)
    }
}

impl From<bool> for MemoryValue {
    fn from(value: bool) -> Self {
        MemoryValue::new_integer(if value { BigUint::one() } else { BigUint::zero() }, 1)
    }
}

impl TryFrom<MemoryValue> for FieldElement {
    type Error = MemoryTypeError;

    fn try_from(memory_value: MemoryValue) -> Result<Self, Self::Error> {
        memory_value.expect_bit_size(FieldElement::max_num_bits())?;
        Ok(*memory_value.to_field())
    }
}

impl TryFrom<MemoryValue> for u64 {
    type Error = MemoryTypeError;

    fn try_from(memory_value: MemoryValue) -> Result<Self, Self::Error> {
        memory_value.expect_bit_size(64)?;
        Ok(memory_value.to_integer().try_into().unwrap())
    }
}

impl TryFrom<MemoryValue> for u32 {
    type Error = MemoryTypeError;

    fn try_from(memory_value: MemoryValue) -> Result<Self, Self::Error> {
        memory_value.expect_bit_size(32)?;
        Ok(memory_value.to_integer().try_into().unwrap())
    }
}

impl TryFrom<MemoryValue> for u8 {
    type Error = MemoryTypeError;

    fn try_from(memory_value: MemoryValue) -> Result<Self, Self::Error> {
        memory_value.expect_bit_size(8)?;

        Ok(memory_value.to_integer().try_into().unwrap())
    }
}

impl TryFrom<MemoryValue> for bool {
    type Error = MemoryTypeError;

    fn try_from(memory_value: MemoryValue) -> Result<Self, Self::Error> {
        memory_value.expect_bit_size(1)?;
        let as_integer = memory_value.to_integer();

        if as_integer.is_zero() {
            Ok(false)
        } else if as_integer.is_one() {
            Ok(true)
        } else {
            unreachable!("value typed as bool is greater than one")
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Memory {
    // Memory is a vector of values.
    // We grow the memory when values past the end are set, extending with 0s.
    inner: Vec<MemoryValue>,
}

impl Memory {
    /// Gets the value at pointer
    pub fn read(&self, ptr: MemoryAddress) -> MemoryValue {
        self.inner.get(ptr.to_usize()).cloned().unwrap_or_default()
    }

    pub fn read_ref(&self, ptr: MemoryAddress) -> MemoryAddress {
        MemoryAddress(self.read(ptr).to_usize())
    }

    pub fn read_slice(&self, addr: MemoryAddress, len: usize) -> &[MemoryValue] {
        &self.inner[addr.to_usize()..(addr.to_usize() + len)]
    }

    /// Sets the value at pointer `ptr` to `value`
    pub fn write(&mut self, ptr: MemoryAddress, value: MemoryValue) {
        self.resize_to_fit(ptr.to_usize() + 1);
        self.inner[ptr.to_usize()] = value;
    }

    fn resize_to_fit(&mut self, size: usize) {
        // Calculate new memory size
        let new_size = std::cmp::max(self.inner.len(), size);
        // Expand memory to new size with default values if needed
        self.inner.resize(new_size, MemoryValue::default());
    }

    /// Sets the values after pointer `ptr` to `values`
    pub fn write_slice(&mut self, ptr: MemoryAddress, values: &[MemoryValue]) {
        self.resize_to_fit(ptr.to_usize() + values.len());
        self.inner[ptr.to_usize()..(ptr.to_usize() + values.len())].clone_from_slice(values);
    }

    /// Returns the values of the memory
    pub fn values(&self) -> &[MemoryValue] {
        &self.inner
    }
}
