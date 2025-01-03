use types::{traits::Empty, abis::{log_hash::ScopedLogHash, private_log::PrivateLog, public_data_write::PublicDataWrite}, constants::{
    MAX_CONTRACT_CLASS_LOGS_PER_TX, MAX_UNENCRYPTED_LOGS_PER_TX, MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX, MAX_L2_TO_L1_MSGS_PER_TX, MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, MAX_PRIVATE_LOGS_PER_TX
}};

pub(crate) struct TxEffect {
    pub(crate) revert_code: u8,
    pub(crate) transaction_fee: Field,
    pub(crate) note_hashes: [Field; MAX_NOTE_HASHES_PER_TX],
    pub(crate) nullifiers: [Field; MAX_NULLIFIERS_PER_TX],
    pub(crate) l2_to_l1_msgs: [Field; MAX_L2_TO_L1_MSGS_PER_TX],
    pub(crate) public_data_writes: [PublicDataWrite; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
    pub(crate) private_logs: [PrivateLog; MAX_PRIVATE_LOGS_PER_TX],
    pub(crate) unencrypted_log_preimages_length: Field,
    pub(crate) unencrypted_logs_hashes: [ScopedLogHash; MAX_UNENCRYPTED_LOGS_PER_TX],
    pub(crate) contract_class_log_preimages_length: Field,
    pub(crate) contract_class_logs_hashes: [ScopedLogHash; MAX_CONTRACT_CLASS_LOGS_PER_TX],
}

impl Empty for TxEffect {
    fn empty() -> Self {
        TxEffect {
            revert_code: 0,
            transaction_fee: 0,
            note_hashes: [0; MAX_NOTE_HASHES_PER_TX],
            nullifiers: [0; MAX_NULLIFIERS_PER_TX],
            l2_to_l1_msgs: [0; MAX_L2_TO_L1_MSGS_PER_TX],
            public_data_writes: [PublicDataWrite::empty(); MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
            private_logs: [PrivateLog::empty(); MAX_PRIVATE_LOGS_PER_TX],
            unencrypted_log_preimages_length: 0,
            unencrypted_logs_hashes: [ScopedLogHash::empty(); MAX_UNENCRYPTED_LOGS_PER_TX],
            contract_class_log_preimages_length: 0,
            contract_class_logs_hashes: [ScopedLogHash::empty(); MAX_CONTRACT_CLASS_LOGS_PER_TX],
        }
    }
}