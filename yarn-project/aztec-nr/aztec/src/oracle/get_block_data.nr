use crate::constants_gen::HISTORIC_BLOCK_DATA_LENGTH;
use crate::abi::HistoricBlockData;

#[oracle(getBlockData)]
fn get_block_data_oracle(_block_number: Field) -> [Field; HISTORIC_BLOCK_DATA_LENGTH] {}

unconstrained pub fn get_block_data(block_number: Field) -> HistoricBlockData {
    let block_data = get_block_data_oracle(block_number);
    HistoricBlockData::deserialize(block_data)
}