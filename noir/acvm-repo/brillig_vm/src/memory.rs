use acir::{brillig::MemoryAddress, FieldElement};

use crate::Value;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Memory {
    // Memory is a vector of values.
    // We grow the memory when values past the end are set, extending with 0s.
    inner: Vec<Value>,
}

impl Memory {
    /// Gets the value at pointer
    pub fn read(&self, ptr: MemoryAddress) -> Value {
        self.inner.get(ptr.to_usize()).copied().unwrap_or(0_u128.into())
    }

    pub fn read_ref(&self, ptr: MemoryAddress) -> MemoryAddress {
        MemoryAddress(self.read(ptr).to_usize())
    }

    pub fn read_slice(&self, addr: MemoryAddress, len: usize) -> &[Value] {
        &self.inner[addr.to_usize()..(addr.to_usize() + len)]
    }

    /// Sets the value at pointer `ptr` to `value`
    pub fn write(&mut self, ptr: MemoryAddress, value: Value) {
        self.write_slice(ptr, &[value]);
    }

    /// Sets the values after pointer `ptr` to `values`
    pub fn write_slice(&mut self, ptr: MemoryAddress, values: &[Value]) {
        // Calculate new memory size
        let new_size = std::cmp::max(self.inner.len(), ptr.to_usize() + values.len());
        // Expand memory to new size with default values if needed
        self.inner.resize(new_size, Value::from(FieldElement::zero()));

        self.inner[ptr.to_usize()..(ptr.to_usize() + values.len())].copy_from_slice(values);
    }

    /// Returns the values of the memory
    pub fn values(&self) -> &Vec<Value> {
        &self.inner
    }
}
