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

pub struct DelayedPublicMutable<T, let InitialDelay: u64, Context> {
    context: Context,
    storage_slot: Field,
}

// This will make the Aztec macros require that T implements the Packable and Eq traits, and allocate `M` storage
// slots to this state variable.
impl<T, let InitialDelay: u64, Context, let M: u32> HasStorageSlot<M> for DelayedPublicMutable<T, InitialDelay, Context>
where
    WithHash<DelayedPublicMutableValues<T, InitialDelay>, _>: Packable<N = M>,
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
// delay). The delay for changing a value is initially equal to InitialDelay, but can be changed by calling
// `schedule_delay_change`.
impl<T, let InitialDelay: u64, Context> DelayedPublicMutable<T, InitialDelay, Context> {
    pub fn new(context: Context, storage_slot: Field) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        Self { context, storage_slot }
    }
}

impl<T, let InitialDelay: u64> DelayedPublicMutable<T, InitialDelay, &mut PublicContext>
where
    T: Eq,
{
    /// Schedules a change to the new_value at the earliest possible time, given the current
    /// delay of this state.
    /// TODO: make this configurable to an optional later time (an earlier time is not allowed).
    /// https://github.com/AztecProtocol/aztec-packages/issues/5501
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
        // TODO: doing two reads is wasteful, because it's reading the same slot twice. We should instead read the slot once.
        let mut value_change = self.read_value_change();
        let delay_change = self.read_delay_change();

        let current_timestamp = self.context.timestamp();
        let current_delay = delay_change.get_current_at(current_timestamp);

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
        self.read_delay_change().get_current_at(current_timestamp)
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
        // We don't read ScheduledValueChange directly by having it implement Packable because ScheduledValueChange
        // and ScheduledDelayChange are packed together (sdc and svc.timestamp_of_change are stored in the same slot).
        let packed = self.context.storage_read(self.storage_slot);
        unpack_value_change::<T, <T as Packable>::N>(packed)
    }

    fn read_delay_change(self) -> ScheduledDelayChange<InitialDelay>
    where
        T: Packable,
    {
        // Since all ScheduledDelayChange member are packed into a single field, we can read a single storage slot
        // here and skip the ones that correspond to ScheduledValueChange members. We are abusing the fact that
        // the field containing the ScheduledDelayChange data is the first one in the storage layout - otherwise we'd
        // need to offset the storage slot to get the position where it'd land.
        // We don't read ScheduledDelayChange directly by having it implement Packable because ScheduledValueChange
        // and ScheduledDelayChange are packed together (sdc and svc.timestamp_of_change are stored in the same slot).

        // Observation: it's kind of weird that if you compare this fn with the one above, they both do:
        // `self.context.storage_read(self.storage_slot)`,
        // but one call returns a [Field; ((N*2)+1)], and the other returns a `Field`.
        // In each case, the type is actually being inferred by the next line, but it broke my brain for a little while, there.
        // Is this expected Noir behaviour, or is it a bug?
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

impl<T, let InitialDelay: u64> DelayedPublicMutable<T, InitialDelay, &mut PrivateContext>
where
    T: Eq,
{
    pub fn get_current_value(self) -> T
    where
        T: Packable,
    {
        // When reading the current value in private we construct a historical state proof for the public value.
        // However, since this value might change, we must constrain the maximum transaction timestamp as this proof
        // will only be valid for the time we can ensure the value will not change, which will depend on the
        // current delay and any scheduled delay changes.
        let (value_change, delay_change, anchor_timestamp) =
            self.historical_read_from_public_storage();

        // We use the effective minimum delay as opposed to the current delay at the anchor timestamp
        // as this one also takes into consideration any scheduled delay changes.
        // For example, consider a scenario in which at timestamp `x` the current delay was 86400 seconds (1 day). We
        // may naively think that the earliest we could change the value would be at timestamp `x + 86400` by scheduling
        // immediately after the anchor timestamp, i.e. at timestamp `x + 1`. But if there was a delay change scheduled
        // for timestamp `y` to reduce the delay to 43200 seconds (12 hours), then if a value change was scheduled at
        // timestamp `y` it would go into effect at timestamp `y + 43200`, which is earlier than what we'd expect if we
        // only considered the current delay.
        let max_time_a_read_remains_valid =
            delay_change.get_max_time_a_read_remains_valid(anchor_timestamp);
        let time_horizon =
            value_change.get_time_horizon_at(anchor_timestamp, max_time_a_read_remains_valid);

        // We prevent this transaction from being included in any timestamp after the time horizon, ensuring that the
        // historical public value matches the current one, since it can only change after the horizon.
        self.context.set_include_by_timestamp(time_horizon);

        value_change.get_current_at(anchor_timestamp)
    }

    // TODO: we have 3 similar, but different names as we go through this fn:
    // - historical_read_from_public_storage
    // - historical_public_storage_read
    // - public_storage_historical_read
    // Can we align that naming?
    fn historical_read_from_public_storage(
        self,
    ) -> (ScheduledValueChange<T>, ScheduledDelayChange<InitialDelay>, u64)
    where
        T: Packable,
    {
        let anchor_header = self.context.get_block_header();
        let address = self.context.this_address();

        let anchor_timestamp = anchor_header.global_variables.timestamp;

        let values: DelayedPublicMutableValues<T, InitialDelay> =
            WithHash::historical_public_storage_read(anchor_header, address, self.storage_slot);

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
