use crate::address::{AztecAddress, EthAddress, PublicKeysHash, SaltedInitializationHash, PartialAddress};
use crate::tests::fixtures;
use crate::contract_class_id::ContractClassId;

struct ContractData {
    address: AztecAddress,
    artifact_hash: Field,
    contract_address_salt: Field,
    contract_class_id: ContractClassId, 
    portal_contract_address: EthAddress,
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
  public_bytecode_commitment: 0x129a3438653fe147133b2c274757920e37896305e7664c8c1eb380be3efd5fed,
  private_functions_root: 0x277a563cbb829f56f6cb14b121446fc2d82590a2bd5fed49e672a21ed8c8fc6d,
  address: AztecAddress { inner: 0x2501f1b8bac92b0bb41c769d02436427b050cfbbd64c28387189bb61a8e0d018 },
  partial_address: PartialAddress { inner: 0x2ea09e7b69a0bb2786f6744b5b2b3268ce8ec16e84254cecb601a2067fcaa751 },
  portal_contract_address: EthAddress { inner: 0x0000000000000000000000000000000000005ba0 },
  contract_class_id: ContractClassId { inner: 0x0e8f24f2d59fe6575f782507109f8bfecd07f5fa3f8e02556ef1b6b9c6d25524 },
  public_keys_hash: PublicKeysHash { inner: 0x000000000000000000000000000000000000000000000000000000000000b26e },
  salted_initialization_hash: SaltedInitializationHash { inner: 0x2a3739e700464ae42f632d21147a59ffb9f61bcd0496643adf717320fdf6a5f2 },
  deployer: AztecAddress { inner: 0x0000000000000000000000000000000000000000000000000000000000000000 }
};

// taken from __snapshots__/noir_test_gen.test.ts.snap
global parent_contract = ContractData {
  contract_address_salt: 0x0000000000000000000000000000000000000000000000000000000000001618,
  artifact_hash: 0x00000000000000000000000000000000000000000000000000000000000004bc,
  public_bytecode_commitment: 0x1435ed970b275bebf95de3df53f23f3d2e97c9b54cf442bb03a3fa17a0ee3cd7,
  private_functions_root: 0x301aad1fbdec1a0853ea6d3918be8e4f7bc9055e01f4c135a9d8fc98dc5fef41,
  address: AztecAddress { inner: 0x28ddb6665ada4c8ebf64e1404c4a9a489788f25c842fb4411ebb6ca4c2a3a361 },
  partial_address: PartialAddress { inner: 0x2eb321fbef8c6bce3e2afe5ea50321db9e3635f1e01c6e8eb4261d8fb2534f1f },
  portal_contract_address: EthAddress { inner: 0x0000000000000000000000000000000000000913 },
  contract_class_id: ContractClassId { inner: 0x0ee7cdfced7310c210ba7118149bf8ee08a07b19e5ddd28d5f06aff2b30c888b },
  public_keys_hash: PublicKeysHash { inner: 0x00000000000000000000000000000000000000000000000000000000000011c1 },
  salted_initialization_hash: SaltedInitializationHash { inner: 0x28ba821dfaf872890f7a865f253cb4053a5167ffeb170bfd8b630c25c2e95317 },
  deployer: AztecAddress { inner: 0x0000000000000000000000000000000000000000000000000000000000000000 }
};
