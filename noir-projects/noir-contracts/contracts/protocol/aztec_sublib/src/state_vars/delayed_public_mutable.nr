use crate::protocol::{
    delayed_public_mutable::{
        delayed_public_mutable_values::{unpack_delay_change, unpack_value_change},
        DelayedPublicMutableValues,
        ScheduledDelayChange,
        ScheduledValueChange,
    },
    traits::Packable,
};

use crate::{
    context::{PrivateContext, PublicContext, UtilityContext},
    state_vars::StateVariable,
    utils::WithHash,
};

/// Public mutable values with private read access.
pub struct DelayedPublicMutable<T, let InitialDelay: u64, Context> {
    context: Context,
    storage_slot: Field,
}

// DelayedPublicMutable<T> stores a value of type T that is:
//  - publicly known (i.e. unencrypted)
//  - mutable in public
//  - readable in private with no contention
impl<T, let InitialDelay: u64, Context, let M: u32> StateVariable<M + 1, Context> for DelayedPublicMutable<T, InitialDelay, Context>
where
    DelayedPublicMutableValues<T, InitialDelay>: Packable<N = M>,
{
    fn new(context: Context, storage_slot: Field) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        Self { context, storage_slot }
    }

    fn get_storage_slot(self) -> Field {
        self.storage_slot
    }
}

impl<T, let InitialDelay: u64> DelayedPublicMutable<T, InitialDelay, PublicContext>
where
    T: Eq,
{

    pub fn schedule_value_change(self, new_value: T)
    where
        T: Packable,
    {
        let _value_change = self.schedule_and_return_value_change(new_value);
    }

    pub fn schedule_and_return_value_change(self, new_value: T) -> ScheduledValueChange<T>
    where
        T: Packable,
    {
        let mut value_change = self.read_value_change();
        let delay_change = self.read_delay_change();

        let current_timestamp = self.context.timestamp();
        let current_delay = delay_change.get_current(current_timestamp);

        // TODO: make this configurable https://github.com/AztecProtocol/aztec-packages/issues/5501
        let timestamp_of_change = current_timestamp + current_delay;
        value_change.schedule_change(
            new_value,
            current_timestamp,
            current_delay,
            timestamp_of_change,
        );

        self.write(value_change, delay_change);

        value_change
    }

    pub fn schedule_delay_change(self, new_delay: u64)
    where
        T: Packable,
    {
        let mut delay_change = self.read_delay_change();

        let current_timestamp = self.context.timestamp();

        delay_change.schedule_change(new_delay, current_timestamp);

        self.write(self.read_value_change(), delay_change);
    }

    pub fn get_current_value(self) -> T
    where
        T: Packable,
    {
        let current_timestamp = self.context.timestamp();
        let value_change = self.read_value_change();

        value_change.get_current_at(current_timestamp)
    }

    pub fn get_current_delay(self) -> u64
    where
        T: Packable,
    {
        let current_timestamp = self.context.timestamp();
        self.read_delay_change().get_current(current_timestamp)
    }

    pub fn get_scheduled_value(self) -> (T, u64)
    where
        T: Packable,
    {
        self.read_value_change().get_scheduled()
    }

    pub fn get_scheduled_delay(self) -> (u64, u64)
    where
        T: Packable,
    {
        self.read_delay_change().get_scheduled()
    }

    fn read_value_change(self) -> ScheduledValueChange<T>
    where
        T: Packable,
    {
        let packed = self.context.storage_read(self.storage_slot);
        unpack_value_change::<T, <T as Packable>::N>(packed)
    }

    fn read_delay_change(self) -> ScheduledDelayChange<InitialDelay>
    where
        T: Packable,
    {
        let packed = self.context.storage_read(self.storage_slot);
        unpack_delay_change::<InitialDelay>(packed)
    }

    fn write(
        self,
        value_change: ScheduledValueChange<T>,
        delay_change: ScheduledDelayChange<InitialDelay>,
    )
    where
        T: Packable,
    {
        let values = WithHash::new(DelayedPublicMutableValues::new(value_change, delay_change));

        self.context.storage_write(self.storage_slot, values);
    }
}

impl<T, let InitialDelay: u64> DelayedPublicMutable<T, InitialDelay, &mut PrivateContext>
where
    T: Eq,
{
    pub fn get_current_value(self) -> T
    where
        T: Packable,
    {
        // When reading the current value in private we construct a historical state proof for the public value.
        let (value_change, delay_change, anchor_timestamp) = self.anchor_read_from_public_storage();

        let effective_minimum_delay = delay_change.get_effective_minimum_delay_at(anchor_timestamp);
        let time_horizon = value_change.get_time_horizon(anchor_timestamp, effective_minimum_delay);

        // We prevent this transaction from being included in any timestamp after the time horizon.
        self.context.set_include_by_timestamp(time_horizon);

        value_change.get_current_at(anchor_timestamp)
    }

    fn anchor_read_from_public_storage(
        self,
    ) -> (ScheduledValueChange<T>, ScheduledDelayChange<InitialDelay>, u64)
    where
        T: Packable,
    {
        let header = self.context.get_anchor_block_header();
        let address = self.context.this_address();

        let anchor_timestamp = header.global_variables.timestamp;

        let values: DelayedPublicMutableValues<T, InitialDelay> =
            WithHash::historical_public_storage_read(header, address, self.storage_slot);

        (values.svc, values.sdc, anchor_timestamp)
    }
}

impl<T, let InitialDelay: u64> DelayedPublicMutable<T, InitialDelay, UtilityContext>
where
    T: Eq,
{
    pub unconstrained fn get_current_value(self) -> T
    where
        T: Packable,
    {
        let dpmv: DelayedPublicMutableValues<T, InitialDelay> =
            WithHash::utility_public_storage_read(self.context, self.storage_slot);

        let current_timestamp = self.context.timestamp();
        dpmv.svc.get_current_at(current_timestamp)
    }
}
