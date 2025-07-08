use super::traits::{FromField, ToField};

pub use delayed_public_mutable_values::DelayedPublicMutableValues;
pub use scheduled_delay_change::ScheduledDelayChange;
pub use scheduled_value_change::ScheduledValueChange;

pub mod scheduled_delay_change;
pub mod scheduled_value_change;
pub mod delayed_public_mutable_values;
pub mod with_hash;

pub fn compute_delayed_public_mutable_time_horizon<T, let INITIAL_DELAY: u64>(
    delayed_public_mutable_values: DelayedPublicMutableValues<T, INITIAL_DELAY>,
    historical_timestamp: u64,
) -> u64
where
    T: ToField + Eq + FromField,
{
    let effective_minimum_delay =
        delayed_public_mutable_values.sdc.get_effective_minimum_delay_at(historical_timestamp);
    delayed_public_mutable_values.svc.get_time_horizon(
        historical_timestamp,
        effective_minimum_delay,
    )
}
