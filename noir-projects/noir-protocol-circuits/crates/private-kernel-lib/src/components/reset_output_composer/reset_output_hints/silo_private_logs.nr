use dep::types::{
    abis::{private_log::PrivateLogData, side_effect::scoped::Scoped},
    address::AztecAddress,
    traits::is_empty,
};

pub(crate) unconstrained fn silo_private_logs<let NUM_LOGS: u32, let PRIVATE_LOG_SILOING_AMOUNT: u32>(
    private_logs: [Scoped<PrivateLogData>; NUM_LOGS],
) -> ([Scoped<PrivateLogData>; NUM_LOGS], [u32; PRIVATE_LOG_SILOING_AMOUNT]) {
    let mut processed_logs = private_logs;
    let mut siloed_private_log_indexes = [0; PRIVATE_LOG_SILOING_AMOUNT];
    let mut num_siloed = 0;
    for i in 0..private_logs.len() {
        let log = private_logs[i];
        if num_siloed != PRIVATE_LOG_SILOING_AMOUNT {
            if (log.inner.note_hash_counter == 0) & !is_empty(log.contract_address) {
                processed_logs[i].contract_address = AztecAddress::empty();
                siloed_private_log_indexes[num_siloed] = i;
                num_siloed += 1;
            }
        }
    }

    (processed_logs, siloed_private_log_indexes)
}
