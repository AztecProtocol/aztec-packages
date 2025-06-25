use dep::protocol_types::{
    shared_mutable::{
        ScheduledDelayChange,
        ScheduledValueChange,
        shared_mutable_values::{unpack_delay_change, unpack_value_change},
        SharedMutableValues,
    },
    traits::Packable,
};

use crate::{
    context::{PrivateContext, PublicContext, UtilityContext},
    state_vars::storage::Storage,
    utils::with_hash::WithHash,
};

mod test;

pub struct SharedMutable<T, let INITIAL_DELAY: u32, Context> {
    context: Context,
    storage_slot: Field,
}

// This will make the Aztec macros require that T implements the Packable and Eq traits, and allocate `M` storage
// slots to this state variable.
impl<T, let INITIAL_DELAY: u32, Context, let M: u32> Storage<M> for SharedMutable<T, INITIAL_DELAY, Context>
where
    WithHash<SharedMutableValues<T, INITIAL_DELAY>, _>: Packable<M>,
{
    fn get_storage_slot(self) -> Field {
        self.storage_slot
    }
}

// SharedMutable<T> stores a value of type T that is:
//  - publicly known (i.e. unencrypted)
//  - mutable in public
//  - readable in private with no contention (i.e. multiple parties can all read the same value without blocking one
//    another nor needing to coordinate)
// This is famously a hard problem to solve. SharedMutable makes it work by introducing a delay to public mutation:
// the value is not changed immediately but rather a value change is scheduled to happen in the future after some delay
// measured in blocks. Reads in private are only valid as long as they are included in a block not too far into the
// future, so that they can guarantee the value will not have possibly changed by then (because of the delay).
// The delay for changing a value is initially equal to INITIAL_DELAY, but can be changed by calling
// `schedule_delay_change`.
impl<T, let INITIAL_DELAY: u32, Context> SharedMutable<T, INITIAL_DELAY, Context> {
    pub fn new(context: Context, storage_slot: Field) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        Self { context, storage_slot }
    }
}

impl<T, let INITIAL_DELAY: u32> SharedMutable<T, INITIAL_DELAY, &mut PublicContext>
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

        let block_number = self.context.block_number();
        let current_delay = delay_change.get_current(block_number);

        // TODO: make this configurable
        // https://github.com/AztecProtocol/aztec-packages/issues/5501
        let block_of_change = block_number + current_delay;
        value_change.schedule_change(new_value, block_number, current_delay, block_of_change);

        self.write(value_change, delay_change);

        value_change
    }

    pub fn schedule_delay_change<let N: u32>(self, new_delay: u32)
    where
        T: Packable<N>,
    {
        let mut delay_change = self.read_delay_change();

        let block_number = self.context.block_number();

        delay_change.schedule_change(new_delay, block_number);

        self.write(self.read_value_change(), delay_change);
    }

    pub fn get_current_value<let N: u32>(self) -> T
    where
        T: Packable<N>,
    {
        let block_number = self.context.block_number();
        self.read_value_change().get_current_at(block_number)
    }

    pub fn get_current_delay<let N: u32>(self) -> u32
    where
        T: Packable<N>,
    {
        let block_number = self.context.block_number();
        self.read_delay_change().get_current(block_number)
    }

    pub fn get_scheduled_value<let N: u32>(self) -> (T, u32)
    where
        T: Packable<N>,
    {
        self.read_value_change().get_scheduled()
    }

    pub fn get_scheduled_delay<let N: u32>(self) -> (u32, u32)
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
        // and ScheduledDelayChange are packed together (sdc and svc.block_of_change are stored in the same slot).
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
        // We don't read ScheduledDelayChange directly by having it implement Packable because
        // ScheduledValueChange and ScheduledDelayChange are packed together (sdc and svc.block_of_change are
        // stored in the same slot).
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
        // We do so by wrapping them in a single struct (`SharedMutableValues`). Then we wrap the resulting struct in
        // `WithHash`.
        // Wrapping in `WithHash` makes for more costly writes but it also makes private proofs much simpler because
        // they only need to produce a historical proof for the hash, which results in a single inclusion proof (as
        // opposed to 4 in the best case scenario in which T is a single field). Private shared mutable reads are
        // assumed to be much more frequent than public writes, so this tradeoff makes sense.
        let values = WithHash::new(SharedMutableValues::new(value_change, delay_change));

        self.context.storage_write(self.storage_slot, values);
    }
}

impl<T, let INITIAL_DELAY: u32> SharedMutable<T, INITIAL_DELAY, &mut PrivateContext>
where
    T: Eq,
{
    pub fn get_current_value<let N: u32>(self) -> T
    where
        T: Packable<N>,
    {
        // When reading the current value in private we construct a historical state proof for the public value.
        // However, since this value might change, we must constrain the maximum transaction block number as this proof
        // will only be valid for however many blocks we can ensure the value will not change, which will depend on the
        // current delay and any scheduled delay changes.
        let (value_change, delay_change, historical_block_number) =
            self.historical_read_from_public_storage();

        // We use the effective minimum delay as opposed to the current delay at the historical block as this one also
        // takes into consideration any scheduled delay changes.
        // For example, consider a scenario in which at block 200 the current delay was 50. We may naively think that
        // the earliest we could change the value would be at block 251 by scheduling immediately after the historical
        // block, i.e. at block 201. But if there was a delay change scheduled for block 210 to reduce the delay to 20
        // blocks, then if a value change was scheduled at block 210 it would go into effect at block 230, which is
        // earlier than what we'd expect if we only considered the current delay.
        let effective_minimum_delay =
            delay_change.get_effective_minimum_delay_at(historical_block_number);
        let block_horizon =
            value_change.get_block_horizon(historical_block_number, effective_minimum_delay);

        // We prevent this transaction from being included in any block after the block horizon, ensuring that the
        // historical public value matches the current one, since it can only change after the horizon.
        self.context.set_tx_max_block_number(block_horizon);
        value_change.get_current_at(historical_block_number)
    }

    fn historical_read_from_public_storage<let N: u32>(
        self,
    ) -> (ScheduledValueChange<T>, ScheduledDelayChange<INITIAL_DELAY>, u32)
    where
        T: Packable<N>,
    {
        let header = self.context.get_block_header();
        let address = self.context.this_address();

        let historical_block_number = header.global_variables.block_number;

        let values: SharedMutableValues<T, INITIAL_DELAY> =
            WithHash::historical_public_storage_read(header, address, self.storage_slot);

        (values.svc, values.sdc, historical_block_number)
    }
}

impl<T, let INITIAL_DELAY: u32> SharedMutable<T, INITIAL_DELAY, UtilityContext>
where
    T: Eq,
{
    pub unconstrained fn get_current_value<let N: u32>(self) -> T
    where
        T: Packable<N>,
    {
        let smv: SharedMutableValues<T, INITIAL_DELAY> =
            WithHash::utility_public_storage_read(self.context, self.storage_slot);

        let block_number = self.context.block_number();
        smv.svc.get_current_at(block_number)
    }
}
