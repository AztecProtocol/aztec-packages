use dep::protocol_types::{
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
    state_vars::storage::HasStorageSlot,
    utils::with_hash::WithHash,
};

mod test;

pub struct DelayedPublicMutable<T, let INITIAL_DELAY: u64, Context> {
    context: Context,
    storage_slot: Field,
}

// This will make the Aztec macros require that T implements the Packable and Eq traits, and allocate `M` storage
// slots to this state variable.
impl<T, let INITIAL_DELAY: u64, Context, let M: u32> HasStorageSlot<M> for DelayedPublicMutable<T, INITIAL_DELAY, Context>
where
    WithHash<DelayedPublicMutableValues<T, INITIAL_DELAY>, _>: Packable<M>,
{
    fn get_storage_slot(self) -> Field {
        self.storage_slot
    }
}

// DelayedPublicMutable<T> stores a value of type T that is:
//  - publicly known (i.e. unencrypted)
//  - mutable in public
//  - readable in private with no contention (i.e. multiple parties can all read the same value without blocking one
//    another nor needing to coordinate)
// This is famously a hard problem to solve. DelayedPublicMutable makes it work by introducing a delay to public mutation:
// the value is not changed immediately but rather a value change is scheduled to happen in the future after some delay
// measured in seconds. Reads in private are only valid as long as they are included in a block with a timestamp not
// too far into the future, so that they can guarantee the value will not have possibly changed by then (because of the
// delay). The delay for changing a value is initially equal to INITIAL_DELAY, but can be changed by calling
// `schedule_delay_change`.
impl<T, let INITIAL_DELAY: u64, Context> DelayedPublicMutable<T, INITIAL_DELAY, Context> {
    pub fn new(context: Context, storage_slot: Field) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        Self { context, storage_slot }
    }
}

impl<T, let INITIAL_DELAY: u64> DelayedPublicMutable<T, INITIAL_DELAY, &mut PublicContext>
where
    T: Eq,
{

    pub fn schedule_value_change<let N: u32>(self, new_value: T)
    where
        T: Packable<N>,
    {
        let _value_change = self.schedule_and_return_value_change(new_value);
    }

    pub fn schedule_and_return_value_change<let N: u32>(
        self,
        new_value: T,
    ) -> ScheduledValueChange<T>
    where
        T: Packable<N>,
    {
        let mut value_change = self.read_value_change();
        let delay_change = self.read_delay_change();

        let current_timestamp = self.context.timestamp();
        let current_delay = delay_change.get_current(current_timestamp);

        // TODO: make this configurable
        // https://github.com/AztecProtocol/aztec-packages/issues/5501
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

    pub fn schedule_delay_change<let N: u32>(self, new_delay: u64)
    where
        T: Packable<N>,
    {
        let mut delay_change = self.read_delay_change();

        let current_timestamp = self.context.timestamp();

        delay_change.schedule_change(new_delay, current_timestamp);

        self.write(self.read_value_change(), delay_change);
    }

    pub fn get_current_value<let N: u32>(self) -> T
    where
        T: Packable<N>,
    {
        let current_timestamp = self.context.timestamp();
        let value_change = self.read_value_change();

        value_change.get_current_at(current_timestamp)
    }

    pub fn get_current_delay<let N: u32>(self) -> u64
    where
        T: Packable<N>,
    {
        let current_timestamp = self.context.timestamp();
        self.read_delay_change().get_current(current_timestamp)
    }

    pub fn get_scheduled_value<let N: u32>(self) -> (T, u64)
    where
        T: Packable<N>,
    {
        self.read_value_change().get_scheduled()
    }

    pub fn get_scheduled_delay<let N: u32>(self) -> (u64, u64)
    where
        T: Packable<N>,
    {
        self.read_delay_change().get_scheduled()
    }

    fn read_value_change<let N: u32>(self) -> ScheduledValueChange<T>
    where
        T: Packable<N>,
    {
        // We don't read ScheduledValueChange directly by having it implement Packable because ScheduledValueChange
        // and ScheduledDelayChange are packed together (sdc and svc.timestamp_of_change are stored in the same slot).
        let packed = self.context.storage_read(self.storage_slot);
        unpack_value_change::<T, N>(packed)
    }

    fn read_delay_change<let N: u32>(self) -> ScheduledDelayChange<INITIAL_DELAY>
    where
        T: Packable<N>,
    {
        // Since all ScheduledDelayChange member are packed into a single field, we can read a single storage slot
        // here and skip the ones that correspond to ScheduledValueChange members. We are abusing the fact that
        // the field containing the ScheduledDelayChange data is the first one in the storage layout - otherwise we'd
        // need to offset the storage slot to get the position where it'd land.
        // We don't read ScheduledDelayChange directly by having it implement Packable because ScheduledValueChange
        // and ScheduledDelayChange are packed together (sdc and svc.timestamp_of_change are stored in the same slot).
        let packed = self.context.storage_read(self.storage_slot);
        unpack_delay_change::<INITIAL_DELAY>(packed)
    }

    fn write<let N: u32>(
        self,
        value_change: ScheduledValueChange<T>,
        delay_change: ScheduledDelayChange<INITIAL_DELAY>,
    )
    where
        T: Packable<N>,
    {
        // Whenever we write to public storage, we write both the value change and delay change to storage at once.
        // We do so by wrapping them in a single struct (`DelayedPublicMutableValues`). Then we wrap the resulting struct in
        // `WithHash`.
        // Wrapping in `WithHash` makes for more costly writes but it also makes private proofs much simpler because
        // they only need to produce a historical proof for the hash, which results in a single inclusion proof (as
        // opposed to 4 in the best case scenario in which T is a single field). Private delayed public mutable reads are
        // assumed to be much more frequent than public writes, so this tradeoff makes sense.
        let values = WithHash::new(DelayedPublicMutableValues::new(value_change, delay_change));

        self.context.storage_write(self.storage_slot, values);
    }
}

impl<T, let INITIAL_DELAY: u64> DelayedPublicMutable<T, INITIAL_DELAY, &mut PrivateContext>
where
    T: Eq,
{
    pub fn get_current_value<let N: u32>(self) -> T
    where
        T: Packable<N>,
    {
        // When reading the current value in private we construct a historical state proof for the public value.
        // However, since this value might change, we must constrain the maximum transaction timestamp as this proof
        // will only be valid for the time we can ensure the value will not change, which will depend on the
        // current delay and any scheduled delay changes.
        let (value_change, delay_change, historical_timestamp) =
            self.historical_read_from_public_storage();

        // We use the effective minimum delay as opposed to the current delay at the historical timestamp (timestamp of
        // the historical block against which we are executing the private part of the tx) as this one also takes into
        // consideration any scheduled delay changes.
        // For example, consider a scenario in which at timestamp `x` the current delay was 86400 seconds (1 day). We
        // may naively think that the earliest we could change the value would be at timestamp `x + 86400` by scheduling
        // immediately after the historical timestamp, i.e. at timestamp `x + 1`. But if there was a delay change scheduled
        // for timestamp `y` to reduce the delay to 43200 seconds (12 hours), then if a value change was scheduled at
        // timestamp `y` it would go into effect at timestamp `y + 43200`, which is earlier than what we'd expect if we
        // only considered the current delay.
        let effective_minimum_delay =
            delay_change.get_effective_minimum_delay_at(historical_timestamp);
        let time_horizon =
            value_change.get_time_horizon(historical_timestamp, effective_minimum_delay);

        // We prevent this transaction from being included in any timestamp after the time horizon, ensuring that the
        // historical public value matches the current one, since it can only change after the horizon.
        self.context.set_include_by_timestamp(time_horizon);

        value_change.get_current_at(historical_timestamp)
    }

    fn historical_read_from_public_storage<let N: u32>(
        self,
    ) -> (ScheduledValueChange<T>, ScheduledDelayChange<INITIAL_DELAY>, u64)
    where
        T: Packable<N>,
    {
        let header = self.context.get_block_header();
        let address = self.context.this_address();

        let historical_timestamp = header.global_variables.timestamp;

        let values: DelayedPublicMutableValues<T, INITIAL_DELAY> =
            WithHash::historical_public_storage_read(header, address, self.storage_slot);

        (values.svc, values.sdc, historical_timestamp)
    }
}

impl<T, let INITIAL_DELAY: u64> DelayedPublicMutable<T, INITIAL_DELAY, UtilityContext>
where
    T: Eq,
{
    pub unconstrained fn get_current_value<let N: u32>(self) -> T
    where
        T: Packable<N>,
    {
        let dpmv: DelayedPublicMutableValues<T, INITIAL_DELAY> =
            WithHash::utility_public_storage_read(self.context, self.storage_slot);

        let current_timestamp = self.context.timestamp();
        dpmv.svc.get_current_at(current_timestamp)
    }
}
