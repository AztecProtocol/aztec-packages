use super::traits::{FromField, ToField};

pub use scheduled_delay_change::ScheduledDelayChange;
pub use scheduled_value_change::ScheduledValueChange;
pub use shared_mutable_values::SharedMutableValues;

pub mod scheduled_delay_change;
pub mod scheduled_value_change;
pub mod shared_mutable_values;
pub mod with_hash;

pub fn compute_shared_mutable_timestamp_horizon<T, let INITIAL_DELAY: u64>(
    shared_mutable_values: SharedMutableValues<T, INITIAL_DELAY>,
    historical_timestamp: u64,
) -> u64
where
    T: ToField + Eq + FromField,
{
    let effective_minimum_delay =
        shared_mutable_values.sdc.get_effective_minimum_delay_at(historical_timestamp);
    shared_mutable_values.svc.get_timestamp_horizon(historical_timestamp, effective_minimum_delay)
}
