use super::{
    tests::fixtures::public_data_tree::empty_public_data_tree,
    traits::{FromField, ToField},
};

pub use scheduled_delay_change::ScheduledDelayChange;
pub use scheduled_value_change::ScheduledValueChange;
pub use shared_mutable_values::SharedMutableValues;

pub mod scheduled_delay_change;
pub mod scheduled_value_change;
pub mod shared_mutable_values;
pub mod with_hash;

pub fn compute_shared_mutable_block_horizon<T, let INITIAL_DELAY: u32>(
    value_change: ScheduledValueChange<T>,
    delay_change: ScheduledDelayChange<INITIAL_DELAY>,
    historical_block_number: u32,
) -> u32
where
    T: ToField + Eq + FromField,
{
    let effective_minimum_delay =
        delay_change.get_effective_minimum_delay_at(historical_block_number);
    value_change.get_block_horizon(historical_block_number, effective_minimum_delay)
}
