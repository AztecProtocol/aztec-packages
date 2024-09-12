use dep::types::{abis::{accumulated_data::{PublicAccumulatedData, PublicAccumulatedDataBuilder}}};

pub fn propagate_accumulated_data(
    data: &mut PublicAccumulatedDataBuilder,
    from_data: PublicAccumulatedData
) -> PublicAccumulatedDataBuilder {
    propagate_note_hashes(data, from_data);
    propagate_nullifiers(data, from_data);
    propagate_l2_to_l1_messages(data, from_data);
    propagate_unencrypted_logs(data, from_data);
    propagate_public_data_writes(data, from_data);
    *data
}

fn propagate_note_hashes(data: &mut PublicAccumulatedDataBuilder, from_data: PublicAccumulatedData) {
    let note_hashes = from_data.note_hashes;
    for i in 0..note_hashes.len() {
        let note_hash = note_hashes[i];
        if note_hash.counter() != 0 {
            data.note_hashes.push(note_hash);
        }
    }
}

fn propagate_nullifiers(data: &mut PublicAccumulatedDataBuilder, from_data: PublicAccumulatedData) {
    let nullifiers = from_data.nullifiers;
    for i in 0..nullifiers.len() {
        let nullifier = nullifiers[i];
        if nullifier.counter() != 0 {
            data.nullifiers.push(nullifier);
        }
    }
}

fn propagate_l2_to_l1_messages(data: &mut PublicAccumulatedDataBuilder, from_data: PublicAccumulatedData) {
    let msgs = from_data.l2_to_l1_msgs;
    for i in 0..msgs.len() {
        let msg = msgs[i];
        if msg.counter() != 0 {
            data.l2_to_l1_msgs.push(msg);
        }
    }
}

fn propagate_unencrypted_logs(data: &mut PublicAccumulatedDataBuilder, from_data: PublicAccumulatedData) {
    let logs = from_data.unencrypted_logs_hashes;
    for i in 0..logs.len() {
        let log = logs[i];
        if log.counter() != 0 {
            data.unencrypted_logs_hashes.push(log);
        }
    }
}

fn propagate_public_data_writes(data: &mut PublicAccumulatedDataBuilder, from_data: PublicAccumulatedData) {
    let writes = from_data.public_data_update_requests;
    for i in 0..writes.len() {
        let write = writes[i];
        if write.counter() != 0 {
            data.public_data_update_requests.push(write);
        }
    }
}
