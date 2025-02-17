use crate::{hash::poseidon2_hash, traits::{Hash, Packable}, utils::arrays::{self, array_concat}};
use super::{
    scheduled_delay_change::{SCHEDULED_DELAY_CHANGE_PCKD_LEN, ScheduledDelayChange},
    scheduled_value_change::ScheduledValueChange,
};
use std::meta::derive;

/// SharedMutableValues is just a wrapper around ScheduledValueChange and ScheduledDelayChange that then allows us
/// to wrap both of these values in WithHash. WithHash allows for efficient read of values in private.
///
/// Note that the WithHash optimization does not work in public (due to there being no unconstrained). But we also want
/// to be able to read the values efficiently in public and we want to be able to read each value separately. For that
/// reason we expose `get_delay_change_storage_slot` and `get_value_change_storage_slot` which point to the correct
/// location in the storage. This is "hacky" as we pack and store the values together but there is no way around it.
#[derive(Eq)]
pub struct SharedMutableValues<T, let INITIAL_DELAY: u32> {
    pub svc: ScheduledValueChange<T>,
    pub sdc: ScheduledDelayChange<INITIAL_DELAY>,
}

impl<T, let INITIAL_DELAY: u32> SharedMutableValues<T, INITIAL_DELAY> {
    pub fn new(svc: ScheduledValueChange<T>, sdc: ScheduledDelayChange<INITIAL_DELAY>) -> Self {
        SharedMutableValues { svc, sdc }
    }

    pub fn get_delay_change_storage_slot(shared_mutable_storage_slot: Field) -> Field {
        shared_mutable_storage_slot
    }

    pub fn get_value_change_storage_slot(shared_mutable_storage_slot: Field) -> Field {
        shared_mutable_storage_slot + (SCHEDULED_DELAY_CHANGE_PCKD_LEN as Field)
    }
}

// We pack to `2 * N + 1 + SCHEDULED_DELAY_CHANGE_PCKD_LEN` fields because ScheduledValueChange contains T twice
// + 1 field for block_of_change + SCHEDULED_DELAY_CHANGE_PCKD_LEN fields for ScheduledDelayChange
impl<T, let INITIAL_DELAY: u32, let N: u32> Packable<2 * N + 1 + SCHEDULED_DELAY_CHANGE_PCKD_LEN> for SharedMutableValues<T, INITIAL_DELAY>
where
    T: Packable<N>,
{
    fn pack(self) -> [Field; 2 * N + 1 + SCHEDULED_DELAY_CHANGE_PCKD_LEN] {
        array_concat(self.sdc.pack(), self.svc.pack())
    }

    fn unpack(fields: [Field; 2 * N + 1 + SCHEDULED_DELAY_CHANGE_PCKD_LEN]) -> Self {
        SharedMutableValues {
            sdc: Packable::unpack(arrays::subarray(fields, 0)),
            svc: Packable::unpack(arrays::subarray(fields, SCHEDULED_DELAY_CHANGE_PCKD_LEN)),
        }
    }
}

impl<T, let INITIAL_DELAY: u32, let N: u32> Hash for SharedMutableValues<T, INITIAL_DELAY>
where
    T: Packable<N>,
{
    fn hash(self) -> Field {
        poseidon2_hash(self.pack())
    }
}
