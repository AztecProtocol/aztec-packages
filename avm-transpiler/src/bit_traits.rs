use acvm::{acir::brillig::MemoryAddress, AcirField, FieldElement};

fn get_msb(n: u128) -> usize {
    if n == 0 {
        0
    } else {
        128 - n.leading_zeros() as usize
    }
}

pub trait BitsQueryable {
    fn num_bits(&self) -> usize;
}

impl BitsQueryable for FieldElement {
    fn num_bits(&self) -> usize {
        AcirField::num_bits(self) as usize
    }
}

impl BitsQueryable for u8 {
    fn num_bits(&self) -> usize {
        get_msb(*self as u128)
    }
}

impl BitsQueryable for u16 {
    fn num_bits(&self) -> usize {
        get_msb(*self as u128)
    }
}

impl BitsQueryable for u32 {
    fn num_bits(&self) -> usize {
        get_msb(*self as u128)
    }
}

impl BitsQueryable for u64 {
    fn num_bits(&self) -> usize {
        get_msb(*self as u128)
    }
}

impl BitsQueryable for u128 {
    fn num_bits(&self) -> usize {
        get_msb(*self)
    }
}

impl BitsQueryable for usize {
    fn num_bits(&self) -> usize {
        get_msb(*self as u128)
    }
}

impl BitsQueryable for MemoryAddress {
    fn num_bits(&self) -> usize {
        match self {
            MemoryAddress::Direct(address) => get_msb(*address as u128),
            MemoryAddress::Relative(offset) => get_msb(*offset as u128),
        }
    }
}

pub fn bits_needed_for<T: BitsQueryable>(val: &T) -> usize {
    match val.num_bits() {
        0..=8 => 8,
        9..=16 => 16,
        17..=32 => 32,
        33..=64 => 64,
        65..=128 => 128,
        _ => 254,
    }
}
