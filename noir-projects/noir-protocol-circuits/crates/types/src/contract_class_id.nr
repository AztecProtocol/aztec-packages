use crate::constants::GENERATOR_INDEX__CONTRACT_LEAF;
use crate::traits::{Deserialize, FromField, Packable, Serialize, ToField};
use std::meta::derive;

#[derive(Deserialize, Eq, Packable, Serialize)]
pub struct ContractClassId {
    pub inner: Field,
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

impl ContractClassId {
    pub fn compute(
        artifact_hash: Field,
        private_functions_root: Field,
        public_bytecode_commitment: Field,
    ) -> Self {
        let hash = crate::hash::poseidon2_hash_with_separator(
            [artifact_hash, private_functions_root, public_bytecode_commitment],
            GENERATOR_INDEX__CONTRACT_LEAF,
        ); // TODO(@spalladino): Update generator index
        ContractClassId::from_field(hash)
    }

    pub fn assert_is_zero(self) {
        assert(self.to_field() == 0);
    }
}
