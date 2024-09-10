use acvm::{AcirField, FieldElement};

fn get_msb(n: u128) -> usize {
    let mut n = n;
    let mut msb = 0;
    while n > 0 {
        n >>= 1;
        msb += 1;
    }
    msb
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

pub fn bits_needed_for<T: BitsQueryable>(val: &T) -> usize {
    let num_bits = val.num_bits();
    if num_bits < 8 {
        8
    } else if num_bits < 16 {
        16
    } else if num_bits < 32 {
        32
    } else if num_bits < 64 {
        64
    } else if num_bits < 128 {
        128
    } else {
        254
    }
}
