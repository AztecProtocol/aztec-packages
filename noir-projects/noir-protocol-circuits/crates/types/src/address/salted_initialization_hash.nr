use crate::{address::{eth_address::EthAddress, aztec_address::AztecAddress}, hash::poseidon_hash, traits::ToField};

// Salted initialization hash. Used in the computation of a partial address.
struct SaltedInitializationHash {
    inner: Field
}

impl ToField for SaltedInitializationHash {
    fn to_field(self) -> Field {
        self.inner
    }
}

impl SaltedInitializationHash {
    pub fn from_field(field: Field) -> Self {
        Self { inner: field }
    }

    pub fn compute(
        salt: Field,
        initialization_hash: Field,
        portal_contract_address: EthAddress,
        deployer: AztecAddress
    ) -> Self {
        SaltedInitializationHash::from_field(
            poseidon_hash([salt, initialization_hash, deployer.to_field(), portal_contract_address.to_field()])
        )
    }

    pub fn assert_is_zero(self) {
        assert(self.to_field() == 0);
    }
}
