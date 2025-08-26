use crate::traits::Empty;
use std::cmp::min;

mod test;

// This data structure is used by DelayedPublicMutable to represent a value that changes from `pre` to `post` at some timestamp
// called the `timestamp_of_change`. The value can only be made to change by scheduling a change event at some future
// timestamp after some `delay_before_a_new_write_can_happen` measured in seconds has elapsed. This means that at any given timestamp we know
// both the current value and the smallest timestamp at which the value might change - this is called the
// 'time horizon'.
pub struct ScheduledValueChange<T> {
    pub(crate) pre: T,
    pub(crate) post: T,
    // Timestamp at which `post` value is used instead of `pre`
    pub(crate) timestamp_of_change: u64,
}

// TODO: consider lacing the context through these impls, so we know which functions are compatible with public/private/utility. For now, I've added comments to that effect.
impl<T> ScheduledValueChange<T> {

    // PUBLIC ONLY

    pub fn new(pre: T, post: T, timestamp_of_change: u64) -> Self {
        Self { pre, post, timestamp_of_change }
    }

    /// Returns the scheduled change, i.e. the post-change value and the timestamp at which it will become the current
    /// value. Note that this timestamp may be in the past if the change has already taken place.
    /// Additionally, further changes might be later scheduled, potentially canceling the one returned by this function.
    pub fn get_scheduled(self) -> (T, u64) {
        (self.post, self.timestamp_of_change)
    }

    // Returns the previous value. This is the value that is current up until the timestamp of change. Note that this
    // value might not be the current anymore since timestamp of change might have already passed.
    pub fn get_previous(self) -> (T, u64) {
        (self.pre, self.timestamp_of_change)
    }

    /// Mutates the value by scheduling a change at the current timestamp. This function is only meaningful when
    /// called in public with the current timestamp.
    pub fn schedule_change(
        &mut self,
        new_value: T,
        current_timestamp: u64,
        delay_before_a_new_write_can_happen: u64, // aka max_time_a_read_remains_valid. TODO: call this "current delay", as every time this is called, it's with the "current delay"
        timestamp_of_change: u64,
    ) {
        assert(timestamp_of_change >= current_timestamp + delay_before_a_new_write_can_happen);

        // Notice: we don't set self.pre = self.post, in case this `schedule_change`
        // function is called a 2nd time before this 1st call's change takes effect.
        // In such an edge case, self.pre = self.pre: the 2nd call effectively replaces
        // the 1st scheduled change, so the 1st `post` value will never take effect.
        self.pre = self.get_current_at(current_timestamp);
        self.post = new_value;
        self.timestamp_of_change = timestamp_of_change;
    }

    // PUBLIC & PRIVATE & UTILITY.

    /// Returns the value stored in the data structure at a given timestamp. This function can be called both in public
    /// (where `timestamp` is simply the current timestamp, i.e. the timestamp at which the current transaction will be
    /// included) and in private (where `timestamp` is the historical timestamp that is used to construct the proof).
    /// Reading in private is only safe if the transaction's `include_by_timestamp` property is set to a value lower or
    /// equal to the time horizon (see `get_time_horizon_at()`).
    pub fn get_current_at(self, timestamp: u64) -> T {
        // The post value becomes the current one at the timestamp of change. This means different things in each realm:
        // - in public, any transaction that is included at the timestamp of change will use the post value
        // - in private, any transaction that includes the timestamp of change as part of the historical state will use
        //   the post value (barring any follow-up changes)
        if timestamp < self.timestamp_of_change {
            self.pre
        } else {
            self.post
        }
    }

    /// Advanced. Only access if you know what you're doing.
    pub fn get_timestamp_of_change(self) -> u64 {
        self.timestamp_of_change
    }

    /// Advanced. Only access if you know what you're doing.
    pub fn get_pre(self) -> T {
        self.pre
    }

    /// Advanced. Only access if you know what you're doing.
    pub fn get_post(self) -> T {
        self.post
    }

    // PRIVATE ONLY

    /// Mutates the value by scheduling a change.
    pub fn schedule_change_in_private(
        &mut self,
        new_value: T,
        historical_timestamp: u64,
        include_by_timestamp: u64,
        delay_before_a_new_write_can_happen: u64, // aka max_time_a_read_remains_valid
        timestamp_of_change: u64,
    ) {
        // We don't know exactly when this tx will be included. Worst case, it's only
        // included by the include_by_timestamp, in which case we still need delay_before_a_new_write_can_happen
        // amount of time before the new value takes effect.
        assert(timestamp_of_change >= include_by_timestamp + delay_before_a_new_write_can_happen);

        self.pre = self.get_current_at(historical_timestamp);
        self.post = new_value;
        self.timestamp_of_change = timestamp_of_change;
    }

    /// Returns the largest timestamp at which the value returned by `get_current_at` is known to remain the current
    /// value. This value is only meaningful in private when constructing a proof at some `historical_timestamp`
    /// (timestamp of a historical block at which we are constructing a proof), since due to its asynchronous nature
    /// private execution cannot know about any later scheduled changes.
    /// The caller of this function must know how quickly the value can change due to a scheduled change in the form of
    /// `max_time_a_read_remains_valid`. If the delay itself is immutable, then this is just its duration. If the delay is mutable
    /// however, then this value is the 'max_time_a_read_remains_valid' (obtained by calling
    /// `ScheduledDelayChange.get_max_time_a_read_remains_valid`), which equals the minimum time in seconds that needs to
    /// elapse from the next block's timestamp until the value changes, regardless of further delay changes.
    /// The value returned by `get_current_at` in private when called with a historical timestamp is only safe to use
    /// if the transaction's `include_by_timestamp` property is set to a value lower or equal to the time horizon
    /// computed using the same historical timestamp.
    pub fn get_time_horizon_at(
        self,
        historical_timestamp: u64,
        max_time_a_read_remains_valid: u64,
    ) -> u64 {
        // The time horizon is the very last timestamp at which the current value is known. Any timestamp past the
        // horizon (i.e. with a timestamp larger than the time horizon) may have a different current value.
        // Reading the current value in private typically requires constraining the maximum valid timestamp to be equal
        // to the time horizon.
        if historical_timestamp >= self.timestamp_of_change {
            // Once the timestamp of change has passed (block with timestamp >= timestamp_of_change was mined),
            // the current value (post) will not change unless a new value change is scheduled. This did not happen at
            // the historical timestamp (or else it would not be greater or equal to the timestamp of change), and
            // therefore could only happen after the historical timestamp. The earliest would be the immediate next
            // timestamp, and so the smallest possible next timestamp of change equals `historical_timestamp + 1 +
            // minimum_delay`. Our time horizon is simply the previous timestamp to that one.
            //
            //   timestamp of    historical
            //      change       timestamp          time horizon
            //   =======|=============|===================|===========>
            //                        ^                   ^
            //                        ---------------------
            //                      max_time_a_read_remains_valid
            //
            historical_timestamp + max_time_a_read_remains_valid
        } else {
            // If the timestamp of change has not yet been reached however, then there are two possible scenarios.
            //   a) It could be so far into the future that the time horizon is actually determined by the
            //      max_time_a_read_remains_valid, because a new change could be scheduled and take place _before_ the currently scheduled one.
            //      This is similar to the scenario where the timestamp of change is in the past: the time horizon is
            //      the timestamp prior to the earliest one in which a new timestamp of change might land.
            //
            //         historical
            //         timestamp                      time horizon    timestamp of change
            //        =====|=================================|=================|=========>
            //             ^                                 ^
            //             |                                 |
            //             -----------------------------------
            //                max_time_a_read_remains_valid
            //
            //   b) It could be fewer than `max_time_a_read_remains_valid` seconds away from the historical timestamp, in which case
            //      the timestamp of change would become the limiting factor for the time horizon, which would equal
            //      the timestamp right before the timestamp of change (since by definition the value changes at the
            //      timestamp of change).
            //
            //           historical                         time horizon
            //           timestamp   timestamp of change    if not scheduled
            //        =======|=============|===================|=================>
            //               ^            ^                    ^
            //               |      actual horizon             |
            //               -----------------------------------
            //                  max_time_a_read_remains_valid
            //
            // Note that the current implementation does not allow the caller to set the timestamp of change to an
            // arbitrary value, and therefore scenario a) is not currently possible. However implementing #5501 would
            // allow for this to happen.
            // Because historical_timestamp < self.timestamp_of_change, then timestamp_of_change > 0 and we can safely
            // subtract 1.
            min(
                self.timestamp_of_change - 1,
                historical_timestamp + max_time_a_read_remains_valid,
            )
        }
    }
}

impl<T> Eq for ScheduledValueChange<T>
where
    T: Eq,
{
    fn eq(self, other: Self) -> bool {
        (self.pre == other.pre)
            & (self.post == other.post)
            & (self.timestamp_of_change == other.timestamp_of_change)
    }
}

impl<T> Empty for ScheduledValueChange<T>
where
    T: Empty,
{
    fn empty() -> Self {
        Self { pre: T::empty(), post: T::empty(), timestamp_of_change: 0 }
    }
}
