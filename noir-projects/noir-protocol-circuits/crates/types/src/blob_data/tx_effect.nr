use crate::{
    abis::{
        contract_class_log::ContractClassLog, private_log::PrivateLog,
        public_data_write::PublicDataWrite, public_logs::PublicLogs,
    },
    constants::{
        CONTRACT_CLASS_LOG_LENGTH, FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH, MAX_CONTRACT_CLASS_LOGS_PER_TX,
        MAX_L2_TO_L1_MSGS_PER_TX, MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX,
        MAX_PRIVATE_LOGS_PER_TX, MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, PRIVATE_LOG_LENGTH,
        PUBLIC_DATA_WRITE_LENGTH,
    },
    traits::{Deserialize, Empty, Serialize},
};
use serde::reader::Reader;

#[derive(Eq, Serialize, Deserialize)]
pub struct TxEffect {
    pub tx_hash: Field,
    pub revert_code: u8,
    pub transaction_fee: Field,
    pub note_hashes: [Field; MAX_NOTE_HASHES_PER_TX],
    pub nullifiers: [Field; MAX_NULLIFIERS_PER_TX],
    pub l2_to_l1_msgs: [Field; MAX_L2_TO_L1_MSGS_PER_TX],
    pub public_data_writes: [PublicDataWrite; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
    pub private_logs: [PrivateLog; MAX_PRIVATE_LOGS_PER_TX],
    pub public_logs: PublicLogs,
    pub contract_class_logs: [ContractClassLog; MAX_CONTRACT_CLASS_LOGS_PER_TX],
}

impl Empty for TxEffect {
    fn empty() -> Self {
        TxEffect {
            tx_hash: 0,
            revert_code: 0,
            transaction_fee: 0,
            note_hashes: [0; MAX_NOTE_HASHES_PER_TX],
            nullifiers: [0; MAX_NULLIFIERS_PER_TX],
            l2_to_l1_msgs: [0; MAX_L2_TO_L1_MSGS_PER_TX],
            public_data_writes: [
                PublicDataWrite::empty(); MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX
            ],
            private_logs: [PrivateLog::empty(); MAX_PRIVATE_LOGS_PER_TX],
            public_logs: PublicLogs::empty(),
            contract_class_logs: [ContractClassLog::empty(); MAX_CONTRACT_CLASS_LOGS_PER_TX],
        }
    }
}

global TX_EFFECT_SERIALIZED_LEN: u32 = 3 // tx_hash + revert_code + transaction_fee
    + MAX_NOTE_HASHES_PER_TX
    + MAX_NULLIFIERS_PER_TX
    + MAX_L2_TO_L1_MSGS_PER_TX
    + MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX * PUBLIC_DATA_WRITE_LENGTH
    + MAX_PRIVATE_LOGS_PER_TX * PRIVATE_LOG_LENGTH
    + 1
    + FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH // PublicLogs
    + MAX_CONTRACT_CLASS_LOGS_PER_TX * CONTRACT_CLASS_LOG_LENGTH;

fn deserialize_array<T: Deserialize, let K: u32, let N: u32>(reader: &mut Reader<K>) -> [T; N] {
    let mut result: [T; N] = std::mem::zeroed();
    for i in 0..N {
        result[i] = T::stream_deserialize(reader);
    }
    result
}
impl TxEffect {
    pub fn deserialize_temporary(fields: [Field; TX_EFFECT_SERIALIZED_LEN]) -> Self {
        let mut reader = Reader::new(fields);
        let effects = TxEffect {
            tx_hash: Field::stream_deserialize(&mut reader),
            revert_code: u8::stream_deserialize(&mut reader),
            transaction_fee: Field::stream_deserialize(&mut reader),
            note_hashes: deserialize_array(&mut reader),
            nullifiers: deserialize_array(&mut reader),
            l2_to_l1_msgs: deserialize_array(&mut reader),
            public_data_writes: deserialize_array(&mut reader),
            private_logs: deserialize_array(&mut reader),
            public_logs: PublicLogs::stream_deserialize(&mut reader),
            contract_class_logs: [ContractClassLog::stream_deserialize(&mut reader)],
        };
        reader.finish();
        effects
    }
}
