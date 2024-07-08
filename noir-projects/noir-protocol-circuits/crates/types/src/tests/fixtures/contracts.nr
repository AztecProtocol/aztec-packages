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
  private_functions_root: 0x04c207a8a83f20ee6c6dbeb40636e8132bc18e971927f7d81f18cb92705ee817,
  address: AztecAddress { inner: 0x0e8a07ffb7ad67046ec46305a36d1dd32c834fad6d36d68fc3e373b24cbcdaf9 },
  partial_address: PartialAddress { inner: 0x2db092a0129a677202988178f0b1f63877aae6b6dc2d2591589a43a737d4de87 },
  contract_class_id: ContractClassId { inner: 0x1fc0ec99d5c643c7b0c96140762d4aa4738b08a99bc0e86eb3a3537382b2163b },
  public_keys_hash: PublicKeysHash { inner: 0x000000000000000000000000000000000000000000000000000000000000b26e },
  salted_initialization_hash: SaltedInitializationHash { inner: 0x25765504545d2cdaaa6544eb24bc78a3e20384452f2525669f196a1a42f45906 },
  deployer: AztecAddress { inner: 0x0000000000000000000000000000000000000000000000000000000000000000 }
};

// taken from __snapshots__/noir_test_gen.test.ts.snap
global parent_contract = ContractData {
  contract_address_salt: 0x0000000000000000000000000000000000000000000000000000000000001618,
  artifact_hash: 0x00000000000000000000000000000000000000000000000000000000000004bc,
  public_bytecode_commitment: 0x0000000000000000000000000000000000000000000000000000000000000005,
  private_functions_root: 0x13911dea3b1d55fe459c95739f42df2cd7c2c610ab16a5632ab649760f3d0522,
  address: AztecAddress { inner: 0x177941c6a0f5ed4e0e4ab45e77477712e699bbba4fa69e9467b820fcbd13ebad },
  partial_address: PartialAddress { inner: 0x2b768618a433780918c9a8b62bb5b373e4f237cdcc1f3a35f1098bf8a2907ac5 },
  contract_class_id: ContractClassId { inner: 0x2c1006237b77dd3314b3a55fcfcd6e4cf6070aa1a6461c5847f9fdf3d3a3a643 },
  public_keys_hash: PublicKeysHash { inner: 0x00000000000000000000000000000000000000000000000000000000000011c1 },
  salted_initialization_hash: SaltedInitializationHash { inner: 0x04643e65513869350552499ed3412df59540dffe3cd698203deee8900b53bcec },
  deployer: AztecAddress { inner: 0x0000000000000000000000000000000000000000000000000000000000000000 }
};
