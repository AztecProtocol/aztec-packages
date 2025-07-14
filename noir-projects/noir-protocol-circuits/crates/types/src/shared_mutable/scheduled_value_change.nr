use crate::traits::Empty;
use std::cmp::min;

mod test;

// This data structure is used by SharedMutable to represent a value that changes from `pre` to `post` at some timestamp
// called the `timestamp_of_change`. The value can only be made to change by scheduling a change event at some future
// timestamp after some minimum delay measured in seconds has elapsed. This means that at any given timestamp we know
// both the current value and the smallest timestamp at which the value might change - this is called the
// 'time horizon'.
pub struct ScheduledValueChange<T> {
    pub(crate) pre: T,
    pub(crate) post: T,
    // Timestamp at which `post` value is used instead of `pre`
    pub(crate) timestamp_of_change: u64,
}

impl<T> ScheduledValueChange<T> {
    pub fn new(pre: T, post: T, timestamp_of_change: u64) -> Self {
        Self { pre, post, timestamp_of_change }
    }

    /// Returns the value stored in the data structure at a given timestamp. This function can be called both in public
    /// (where `timestamp` is simply the current timestamp, i.e. the timestamp at which the current transaction will be
    /// included) and in private (where `timestamp` is the historical timestamp that is used to construct the proof).
    /// Reading in private is only safe if the transaction's `include_by_timestamp` property is set to a value lower or
    /// equal to the time horizon (see `get_time_horizon()`).
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

    /// Returns the largest timestamp at which the value returned by `get_current_at` is known to remain the current
    /// value. This value is only meaningful in private when constructing a proof at some `historical_timestamp`
    /// (timestamp of a historical block at which we are constructing a proof), since due to its asynchronous nature
    /// private execution cannot know about any later scheduled changes.
    /// The caller of this function must know how quickly the value can change due to a scheduled change in the form of
    /// `minimum_delay`. If the delay itself is immutable, then this is just its duration. If the delay is mutable
    /// however, then this value is the 'effective minimum delay' (obtained by calling
    /// `ScheduledDelayChange.get_effective_minimum_delay_at`), which equals the minimum time in seconds that needs to
    /// elapse from the next block's timestamp until the value changes, regardless of further delay changes.
    /// The value returned by `get_current_at` in private when called with a historical timestamp is only safe to use
    /// if the transaction's `include_by_timestamp` property is set to a value lower or equal to the time horizon
    /// computed using the same historical timestamp.
    pub fn get_time_horizon(self, historical_timestamp: u64, minimum_delay: u64) -> u64 {
        // The time horizon is the very last timestamp in which the current value is known. Any timestamp past the
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
            //   =======|=============N===================H===========>
            //                         ^                   ^
            //                         ---------------------
            //                             minimum delay
            historical_timestamp + minimum_delay
        } else {
            // If the timestamp of change has not yet been reached however, then there are two possible scenarios.
            //   a) It could be so far into the future that the time horizon is actually determined by the minimum
            //      delay, because a new change could be scheduled and take place _before_ the currently scheduled one.
            //      This is similar to the scenario where the timestamp of change is in the past: the time horizon is
            //      the timestamp prior to the earliest one in which a new timestamp of change might land.
            //
            //         historical
            //         timestamp                      time horizon    timestamp of change
            //        =====N=================================H=================|=========>
            //              ^                                 ^
            //              |                                 |
            //              -----------------------------------
            //                        minimum delay
            //
            //   b) It could be fewer than `minimum_delay` seconds away from the historical timestamp, in which case
            //      the timestamp of change would become the limiting factor for the time horizon, which would equal
            //      the timestamp right before the timestamp of change (since by definition the value changes at the
            //      timestamp of change).
            //
            //           historical                         time horizon
            //           timestamp   timestamp of change    if not scheduled
            //        =======N=============|===================H=================>
            //                ^           ^                     ^
            //                |     actual horizon              |
            //                -----------------------------------
            //                          minimum delay
            //
            // Note that the current implementation does not allow the caller to set the timestamp of change to an
            // arbitrary value, and therefore scenario a) is not currently possible. However implementing #5501 would
            // allow for this to happen.
            // Because historical_timestamp < self.timestamp_of_change, then timestamp_of_change > 0 and we can safely
            // subtract 1.
            min(
                self.timestamp_of_change - 1,
                historical_timestamp + minimum_delay,
            )
        }
    }

    /// Mutates the value by scheduling a change at the current timestamp. This function is only meaningful when
    /// called in public with the current timestamp.
    pub fn schedule_change(
        &mut self,
        new_value: T,
        current_timestamp: u64,
        minimum_delay: u64,
        timestamp_of_change: u64,
    ) {
        assert(timestamp_of_change >= current_timestamp + minimum_delay);

        self.pre = self.get_current_at(current_timestamp);
        self.post = new_value;
        self.timestamp_of_change = timestamp_of_change;
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
