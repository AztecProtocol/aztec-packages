use crate::traits::{ToField, FromField, Hash, Serialize, Deserialize};

struct ContractClassId {
  inner: Field
}

impl Eq for ContractClassId {
    fn eq(self, other: ContractClassId) -> bool {
        other.inner == self.inner
    }
}

impl ToField for ContractClassId {
    fn to_field(self) -> Field {
        self.inner
    }
}

impl FromField for ContractClassId {
    fn from_field(value: Field) -> Self {
        Self { inner: value }
    }
}

impl Serialize<1> for ContractClassId {
    fn serialize(self: Self) -> [Field; 1] {
        [self.inner]
    }
}

impl Deserialize<1> for ContractClassId {
  fn deserialize(fields: [Field; 1]) -> Self {
        Self { inner: fields[0] }
    }
}

impl ContractClassId {
    pub fn compute(
        artifact_hash: Field,
        private_functions_root: Field,
        public_bytecode_commitment: Field
    ) -> Self {
        let hash = crate::hash::poseidon_hash([artifact_hash, private_functions_root, public_bytecode_commitment]);

        ContractClassId::from_field(hash)
    }

    pub fn assert_is_zero(self) {
        assert(self.to_field() == 0);
    }
}
