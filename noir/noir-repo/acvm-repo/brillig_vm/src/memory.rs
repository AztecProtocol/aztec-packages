use acir::{brillig::MemoryAddress, FieldElement};

pub const MEMORY_ADDRESSING_BIT_SIZE: u32 = 64;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct MemoryValue {
    pub value: FieldElement,
    pub bit_size: u32,
}

impl MemoryValue {
    pub fn to_usize(&self) -> usize {
        assert!(self.bit_size == MEMORY_ADDRESSING_BIT_SIZE, "value is not typed as brillig usize");
        usize::try_from(self.value.try_to_u64().expect("value does not fit into u64"))
            .expect("value does not fit into usize")
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
        f.write_str(format!("{}: {}", self.value, typ).as_str())
    }
}

impl MemoryValue {
    pub fn new(value: FieldElement, bit_size: u32) -> Self {
        MemoryValue { value, bit_size }
    }

    pub fn new_field(value: FieldElement) -> Self {
        MemoryValue { value, bit_size: FieldElement::max_num_bits() }
    }
}

impl Default for MemoryValue {
    fn default() -> Self {
        MemoryValue::new(FieldElement::zero(), 0)
    }
}

impl From<FieldElement> for MemoryValue {
    fn from(field: FieldElement) -> Self {
        MemoryValue::new_field(field)
    }
}

impl From<usize> for MemoryValue {
    fn from(value: usize) -> Self {
        MemoryValue::new(value.into(), MEMORY_ADDRESSING_BIT_SIZE)
    }
}

impl From<u32> for MemoryValue {
    fn from(value: u32) -> Self {
        MemoryValue::new((value as u128).into(), 32)
    }
}

impl From<u64> for MemoryValue {
    fn from(value: u64) -> Self {
        MemoryValue::new((value as u128).into(), 64)
    }
}

impl From<bool> for MemoryValue {
    fn from(value: bool) -> Self {
        MemoryValue::new(value.into(), 1)
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
        self.inner.get(ptr.to_usize()).copied().unwrap_or_default()
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
        self.inner[ptr.to_usize()..(ptr.to_usize() + values.len())].copy_from_slice(values);
    }

    /// Returns the values of the memory
    pub fn values(&self) -> &[MemoryValue] {
        &self.inner
    }
}
