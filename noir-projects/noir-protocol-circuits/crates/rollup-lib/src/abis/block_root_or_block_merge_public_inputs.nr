use dep::types::{
    abis::{append_only_tree_snapshot::AppendOnlyTreeSnapshot, global_variables::GlobalVariables},
    constants::BLOCK_ROOT_OR_BLOCK_MERGE_PUBLIC_INPUTS_LENGTH,
    partial_state_reference::PartialStateReference, traits::{Empty, Serialize, Deserialize},
    utils::reader::Reader, address::EthAddress
};
use crate::abis::constant_rollup_data::ConstantRollupData;

struct FeeRecipient {
  recipient: EthAddress,
  value: Field,
}

impl Empty for FeeRecipient {
  fn empty() -> Self {
    FeeRecipient {
      recipient: EthAddress::zero(),
      value: 0,
    }
  }
}

impl Serialize<2> for FeeRecipient {
  fn serialize(self) -> [Field; 2] {
    [self.recipient.to_field(), self.value]
  }
}

impl Deserialize<2> for FeeRecipient {
  fn deserialize(values: [Field; 2]) -> Self {
    Self {
      recipient: EthAddress::from_field(values[0]),
      value: values[1]
    }
  }
}

impl Eq for FeeRecipient {
  fn eq(self, other: Self) -> bool {
    (self.recipient.eq(other.recipient)) & (self.value == other.value)
  }
}

// TODO: instead of archives + global vars, use ConstantRollupData x2? It also includes vk root
struct BlockRootOrBlockMergePublicInputs {
  previous_archive: AppendOnlyTreeSnapshot, // Archive tree root immediately before this block range
  new_archive: AppendOnlyTreeSnapshot, // Archive tree root after adding this block range
  previous_block_hash: Field, // Identifier of the previous block before the range
  end_block_hash: Field, // Identifier of the last block in the range
  start_global_variables: GlobalVariables, // Global variables for the first block in the range
  end_global_variables: GlobalVariables, // Global variables for the last block in the range
  out_hash: Field, // Merkle node of the L2-to-L1 messages merkle roots in the block range
  fees: [FeeRecipient; 32] // Concatenation of all coinbase and fees for the block range
}

impl Empty for BlockRootOrBlockMergePublicInputs {
    fn empty() -> Self {
        BlockRootOrBlockMergePublicInputs {
            previous_archive: AppendOnlyTreeSnapshot::zero(),
            new_archive: AppendOnlyTreeSnapshot::zero(),
            previous_block_hash: 0,
            end_block_hash: 0,
            start_global_variables: GlobalVariables::empty(),
            end_global_variables: GlobalVariables::empty(),
            out_hash: 0,
            fees: [FeeRecipient::empty(); 32]
        }
    }
}

impl Eq for BlockRootOrBlockMergePublicInputs {
  fn eq(self, other: Self) -> bool {
    (self.previous_archive.eq(other.previous_archive)) &
    (self.new_archive.eq(other.new_archive)) &
    (self.previous_block_hash == other.previous_block_hash) &
    (self.end_block_hash == other.end_block_hash) &
    (self.start_global_variables.eq(other.start_global_variables)) &
    (self.end_global_variables.eq(other.end_global_variables)) &
    (self.out_hash == other.out_hash) &
    (self.fees.eq(other.fees))
  }
}

impl Serialize<BLOCK_ROOT_OR_BLOCK_MERGE_PUBLIC_INPUTS_LENGTH> for BlockRootOrBlockMergePublicInputs {
  fn serialize(self) -> [Field; BLOCK_ROOT_OR_BLOCK_MERGE_PUBLIC_INPUTS_LENGTH] {
    let mut fields: BoundedVec<Field, BLOCK_ROOT_OR_BLOCK_MERGE_PUBLIC_INPUTS_LENGTH> = BoundedVec::new();

    fields.extend_from_array(self.previous_archive.serialize());
    fields.extend_from_array(self.new_archive.serialize());
    fields.push(self.previous_block_hash as Field);
    fields.push(self.end_block_hash as Field);
    fields.extend_from_array(self.start_global_variables.serialize());
    fields.extend_from_array(self.end_global_variables.serialize());
    fields.push(self.out_hash as Field);
    for i in 0..32 {
      fields.extend_from_array(self.fees[i].serialize());
    }
    assert_eq(fields.len(), BLOCK_ROOT_OR_BLOCK_MERGE_PUBLIC_INPUTS_LENGTH);

    fields.storage
  }
}

impl Deserialize<BLOCK_ROOT_OR_BLOCK_MERGE_PUBLIC_INPUTS_LENGTH> for BlockRootOrBlockMergePublicInputs {
  fn deserialize(fields: [Field; BLOCK_ROOT_OR_BLOCK_MERGE_PUBLIC_INPUTS_LENGTH]) -> BlockRootOrBlockMergePublicInputs {
    let mut reader = Reader::new(fields);
    let item = Self {
        previous_archive: reader.read_struct(AppendOnlyTreeSnapshot::deserialize),
        new_archive: reader.read_struct(AppendOnlyTreeSnapshot::deserialize),
        previous_block_hash: reader.read(),
        end_block_hash: reader.read(),
        start_global_variables: reader.read_struct(GlobalVariables::deserialize),
        end_global_variables: reader.read_struct(GlobalVariables::deserialize),
        out_hash: reader.read(),
        fees: reader.read_struct_array(FeeRecipient::deserialize, [FeeRecipient::empty(); 32])
    };

    reader.finish();
    item
  }
}

#[test]
fn serialization_of_empty() {
    let item = BlockRootOrBlockMergePublicInputs::empty();
    let serialized = item.serialize();
    let deserialized = BlockRootOrBlockMergePublicInputs::deserialize(serialized);
    assert(item.eq(deserialized));
}
