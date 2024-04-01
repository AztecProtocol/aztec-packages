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
  address: AztecAddress { inner: 0x20a98503498801d00b5bfa0d3d2aad21ba89354ca5c8f0665270e9dd9d67826a },
  partial_address: PartialAddress { inner: 0x2af425a02da4bea95052134bd872a264152e9e645c3ed15054e8cded48befe2c },
  portal_contract_address: EthAddress { inner: 0x0000000000000000000000000000000000005ba0 },
  contract_class_id: ContractClassId { inner: 0x20d147069ac20ea64b00fc16101476ca467b98e6476608f98ac02a21b70fb9dc },
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
  address: AztecAddress { inner: 0x12a62c6c78348910bd73f51bf6c2767256ae7fea1128062ea6d5e85743a231b1 },
  partial_address: PartialAddress { inner: 0x0243e8f9b9969ddbff0cbdce23c5352207b78204676b7cf6f236828a91086b77 },
  portal_contract_address: EthAddress { inner: 0x0000000000000000000000000000000000000913 },
  contract_class_id: ContractClassId { inner: 0x1d923f80ff9fe14b127bc7ef2f30893802836f2c4d66f89768bd7e71b0e69b0e },
  public_keys_hash: PublicKeysHash { inner: 0x00000000000000000000000000000000000000000000000000000000000011c1 },
  salted_initialization_hash: SaltedInitializationHash { inner: 0x28ba821dfaf872890f7a865f253cb4053a5167ffeb170bfd8b630c25c2e95317 },
  deployer: AztecAddress { inner: 0x0000000000000000000000000000000000000000000000000000000000000000 }
};
