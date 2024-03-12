use dep::protocol_types::traits::{Deserialize, Serialize};

#[oracle(storageRead)]
fn storage_read_oracle(_storage_slot: Field) -> Field {}

unconstrained fn storage_read_oracle_wrapper(storage_slot: Field) -> Field {
    storage_read_oracle(storage_slot)
}

pub fn storage_read<N>(storage_slot: Field) -> [Field; N] {
    let mut ret: [Field; N] = [0; N];
    for i in 0..N {
        ret[i] = storage_read_oracle_wrapper(storage_slot + (i as Field));
    }
    ret
}

#[oracle(storageWrite)]
fn storage_write_oracle(_storage_slot: Field, _value: Field) {}

unconstrained fn storage_write_oracle_wrapper(storage_slot: Field, value: Field) {
    storage_write_oracle(storage_slot, value);
}

pub fn storage_write<N>(storage_slot: Field, fields: [Field; N]) {
    for i in 0..N {
        storage_write_oracle_wrapper(storage_slot + (i as Field), fields[i]);
    }
}
