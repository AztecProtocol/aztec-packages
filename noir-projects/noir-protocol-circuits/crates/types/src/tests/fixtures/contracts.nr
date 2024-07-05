use crate::address::{AztecAddress, EthAddress, PublicKeysHash, SaltedInitializationHash, PartialAddress};
use crate::tests::fixtures;
use crate::contract_class_id::ContractClassId;

struct ContractData {
    address: AztecAddress,
    artifact_hash: Field,
    contract_address_salt: Field,
    contract_class_id: ContractClassId, 
    private_functions_root: Field,
    public_bytecode_commitment: Field,
    public_keys_hash: PublicKeysHash,
    salted_initialization_hash: SaltedInitializationHash,
    partial_address: PartialAddress,
    deployer: AztecAddress,
}

// taken from __snapshots__/noir_test_gen.test.ts.snap
global default_contract = ContractData {
  contract_address_salt: 0x000000000000000000000000000000000000000000000000000000000000ddd5,
  artifact_hash: 0x0000000000000000000000000000000000000000000000000000000000003039,
  public_bytecode_commitment: 0x0000000000000000000000000000000000000000000000000000000000000005,
  private_functions_root: 0x0e4701df8d3c67a3d864d53a468886905e22386ebb150239fa563fc3a5d482e7,
  address: AztecAddress { inner: 0x28805d59aeb2f818362c2f5cf48ca9f16fd1e451171f85dfe2e2e414d7dedb0d },
  partial_address: PartialAddress { inner: 0x0c0044c5aa02d28f536aec2a9e79ef128a7d5b2e361d14351c74542b571b1e4e },
  contract_class_id: ContractClassId { inner: 0x29273cd963f6b58bc6c4ad2fc0cd69f98ba002a9ee237c6131b1992412999614 },
  public_keys_hash: PublicKeysHash { inner: 0x000000000000000000000000000000000000000000000000000000000000b26e },
  salted_initialization_hash: SaltedInitializationHash { inner: 0x25765504545d2cdaaa6544eb24bc78a3e20384452f2525669f196a1a42f45906 },
  deployer: AztecAddress { inner: 0x0000000000000000000000000000000000000000000000000000000000000000 }
};

// taken from __snapshots__/noir_test_gen.test.ts.snap
global parent_contract = ContractData {
  contract_address_salt: 0x0000000000000000000000000000000000000000000000000000000000001618,
  artifact_hash: 0x00000000000000000000000000000000000000000000000000000000000004bc,
  public_bytecode_commitment: 0x0000000000000000000000000000000000000000000000000000000000000005,
  private_functions_root: 0x04237ca84f8c8ae1962ed88945016cc6e6ed5345c12f4f9153332127337d16d0,
  address: AztecAddress { inner: 0x2159b5abddeb4ee906b7eb6427b5b46f7bf315b08aebf5e8bb9c251ebb0880ea },
  partial_address: PartialAddress { inner: 0x06a35f6f2d4bd48694cb5bb296968e488429968ee1298a2eb639a73d0645f646 },
  contract_class_id: ContractClassId { inner: 0x19ba2e9cb902bfcc074a1e70e1af138e9ac941577c86d689497a2070909b89d3 },
  public_keys_hash: PublicKeysHash { inner: 0x00000000000000000000000000000000000000000000000000000000000011c1 },
  salted_initialization_hash: SaltedInitializationHash { inner: 0x0b1d457cdacb66e76eccb29a4e34dff5ae10b9d3d2f0d85b59aa8cf68bd1cf86 },
  deployer: AztecAddress { inner: 0x0000000000000000000000000000000000000000000000000000000000000000 }
};
