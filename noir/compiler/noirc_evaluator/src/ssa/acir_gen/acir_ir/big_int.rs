use acvm::FieldElement;
use num_bigint::BigUint;

/// Represents a bigint value in the form (id, modulus) where
///     id is the identifier of the big integer number, and
///     modulus is the identifier of the big integer size
#[derive(Default, Clone, Copy, Debug)]
pub(crate) struct BigIntId(pub(crate) u32, pub(crate) u32); //bigint id, modulus id

impl BigIntId {
    pub(crate) fn as_field(&self) -> FieldElement {
        FieldElement::from(self.0 as u128)
    }

    pub(crate) fn modulus_id(&self) -> FieldElement {
        FieldElement::from(self.1 as u128)
    }
}

/// BigIntContext is used to generate identifiers for big integers and their modulus
#[derive(Default, Debug)]
pub(crate) struct BigIntContext {
    modulus: Vec<BigUint>,
    big_integers: Vec<BigIntId>,
}

impl BigIntContext {
    /// Creates a new BigIntId for the given modulus and returns it.
    pub(crate) fn new_big_int(&mut self, modulus: FieldElement) -> BigIntId {
        let id = self.big_integers.len() as u32;
        let result = BigIntId(id, modulus.to_u128() as u32);
        self.big_integers.push(result);
        result
    }

    /// Returns the modulus corresponding to the given modulus index
    pub(crate) fn modulus(&self, idx: FieldElement) -> BigUint {
        self.modulus[idx.to_u128() as usize].clone()
    }

    /// Returns the BigIntId corresponding to the given identifier
    pub(crate) fn get(&self, id: FieldElement) -> BigIntId {
        self.big_integers[id.to_u128() as usize]
    }

    /// Adds a modulus to the context (if it is not already present)
    pub(crate) fn get_or_insert_modulus(&mut self, modulus: BigUint) -> u32 {
        if let Some(pos) = self.modulus.iter().position(|x| x == &modulus) {
            return pos as u32;
        }
        self.modulus.push(modulus);
        (self.modulus.len() - 1) as u32
    }
}
