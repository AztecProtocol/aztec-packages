use dep::aztec::protocol_types::{
    constants::{CONTRACT_CLASS_PUBLISHED_MAGIC_VALUE, MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS},
    contract_class_id::ContractClassId,
};
use dep::aztec::protocol_types::traits::ToField;

pub struct ContractClassPublished {
    contract_class_id: ContractClassId,
    version: Field,
    artifact_hash: Field,
    private_functions_root: Field,
    packed_public_bytecode: [Field; MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS],
}

impl ContractClassPublished {
    fn serialize_non_standard(
        self: Self,
    ) -> [Field; MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS + 5] {
        let mut packed = [0; MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS + 5];
        // Since we are not yet emitting selectors we'll use this magic value to identify events emitted by the ClassRegistry.
        packed[0] = CONTRACT_CLASS_PUBLISHED_MAGIC_VALUE;
        packed[1] = self.contract_class_id.to_field();
        packed[2] = self.version;
        packed[3] = self.artifact_hash;
        packed[4] = self.private_functions_root;
        for i in 0..MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS {
            packed[i + 5] = self.packed_public_bytecode[i];
        }
        packed
    }
}
