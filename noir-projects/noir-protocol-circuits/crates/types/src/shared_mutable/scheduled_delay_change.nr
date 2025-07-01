use crate::traits::Empty;
use std::cmp::min;

mod test;

// This data structure is used by SharedMutable to store the minimum delay with which a ScheduledValueChange object can
// schedule a change.
// This delay is initially equal to INITIAL_DELAY, and can be safely mutated to any other value over time. This mutation
// is performed via `schedule_change` in order to satisfy ScheduleValueChange constraints: if e.g. we allowed for the
// delay to be decreased immediately then it'd be possible for the state variable to schedule a value change with a
// reduced delay, invalidating prior private reads.
pub struct ScheduledDelayChange<let INITIAL_DELAY: u64> {
    // Both pre and post are stored in public storage, so by default they are zeroed. By wrapping them in an Option,
    // they default to Option::none(), which we detect and replace with INITIAL_DELAY. The end result is that a
    // ScheduledDelayChange that has not been initialized has a delay equal to INITIAL_DELAY, which is the desired
    // effect. Once initialized, the Option will never be none again.
    pub(crate) pre: Option<u64>,
    pub(crate) post: Option<u64>,
    // Timestamp at which `post` value is used instead of `pre`
    pub(crate) timestamp_of_change: u64,
}

impl<let INITIAL_DELAY: u64> ScheduledDelayChange<INITIAL_DELAY> {
    pub fn new(pre: Option<u64>, post: Option<u64>, timestamp_of_change: u64) -> Self {
        Self { pre, post, timestamp_of_change }
    }

    /// Returns the current value of the delay stored in the data structure.
    /// This function only returns a meaningful value when called in public with the current timestamp - for
    /// historical private reads use `get_effective_minimum_delay_at` instead.
    pub fn get_current(self, current_timestamp: u64) -> u64 {
        // The post value becomes the current one at the timestamp of change, so any transaction that is included at or after
        // the timestamp of change will use the post value.
        if current_timestamp < self.timestamp_of_change {
            self.pre.unwrap_or(INITIAL_DELAY)
        } else {
            self.post.unwrap_or(INITIAL_DELAY)
        }
    }

    /// Returns the scheduled change, i.e. the post-change delay and the timestamp at which it will become the current
    /// delay. Note that this timestamp may be in the past if the change has already taken place.
    /// Additionally, further changes might be later scheduled, potentially canceling the one returned by this function.
    pub fn get_scheduled(self) -> (u64, u64) {
        (self.post.unwrap_or(INITIAL_DELAY), self.timestamp_of_change)
    }

    /// Mutates the delay change by scheduling a change at the current timestamp. This function is only meaningful
    /// when called in public with the current timestamp.
    /// The timestamp at which the new delay will become effective is determined automatically:
    ///  - when increasing the delay, the change is effective immediately
    ///  - when reducing the delay, the change will take effect after a delay equal to the difference between old and
    ///    new delay. For example, if reducing from 3 days to 1 day, the reduction will be scheduled to happen after 2
    ///    days.
    pub fn schedule_change(&mut self, new: u64, current_timestamp: u64) {
        let current = self.get_current(current_timestamp);

        // When changing the delay value we must ensure that it is not possible to produce a value change with a delay
        // shorter than the current one.
        let time_until_change = if new > current {
            // Increasing the delay value can therefore be done immediately: this does not invalidate prior constraints
            // about how quickly a value might be changed (indeed it strengthens them).
            0
        } else {
            // Decreasing the delay requires waiting for the difference between current and new delay in order to ensure
            // that overall the current delay is respected.
            //
            //      current                    delay              earliest value timestamp of change
            //      timestamp             timestamp of change         if delay remained unchanged
            //  =======N=========================|================================X=================>
            //         ^                         ^                                ^
            //         |-------------------------|--------------------------------|
            //         |   time until change               new delay              |
            //         ------------------------------------------------------------
            //                            current delay
            current - new
        };

        self.pre = Option::some(current);
        self.post = Option::some(new);
        self.timestamp_of_change = current_timestamp + time_until_change;
    }

    /// Returns the minimum delay before a value might mutate due to a scheduled change, from the perspective of some
    /// historical timestamp (timestamp of a historical block). It only returns a meaningful value when called in
    /// private with historical timestamps. This function can be used alongside
    /// `ScheduledValueChange.get_time_horizon` to properly constrain the `include_by_timestamp` transaction
    /// property when reading mutable shared state.
    /// This value typically equals the current delay at the timestamp following the historical one (the earliest one in
    /// which a value change could be scheduled), but it also considers scenarios in which a delay reduction is
    /// scheduled to happen in the near future, resulting in a way to schedule a change with an overall delay lower than
    /// the current one.
    pub fn get_effective_minimum_delay_at(self, historical_timestamp: u64) -> u64 {
        if self.timestamp_of_change <= historical_timestamp {
            // If no delay changes were scheduled, then the delay value at the historical timestamp (post) is guaranteed to
            // hold due to how further delay changes would be scheduled by `schedule_change`.
            self.post.unwrap_or(INITIAL_DELAY)
        } else {
            // If a change is scheduled, then the effective delay might be lower than the current one (pre). At the
            // timestamp of change the current delay will be the scheduled one, with an overall delay from the historical
            // timestamp equal to the time until the change plus the new delay. If this value is lower
            // than the current delay, then that is the effective minimum delay.
            //
            //       historical
            //        timestamp                delay                  actual earliest value
            //           v              timestamp of change           timestamp of change
            //  =========NS=====================|=============================X===========Y=====>
            //            ^                     ^                             ^           ^
            //     earliest timestamp in        |                             |           |
            //   which to schedule change       |                             |           |
            //           |                      |                             |           |
            //           |----------------------|------------------------------           |
            //           |          time                  new delay                       |
            //           |      until change                                              |
            //           |                                                                |
            //           |----------------------------------------------------------------|
            //                        current delay at the earliest timestamp in
            //                             which to scheduled value change
            let time_until_change = self.timestamp_of_change - (historical_timestamp + 1);

            min(
                self.pre.unwrap_or(INITIAL_DELAY),
                time_until_change + self.post.unwrap_or(INITIAL_DELAY),
            )
        }
    }
}

impl<let INITIAL_DELAY: u64> Eq for ScheduledDelayChange<INITIAL_DELAY> {
    fn eq(self, other: Self) -> bool {
        (self.pre == other.pre)
            & (self.post == other.post)
            & (self.timestamp_of_change == other.timestamp_of_change)
    }
}

impl<let INITIAL_DELAY: u64> Empty for ScheduledDelayChange<INITIAL_DELAY> {
    fn empty() -> Self {
        Self { pre: Option::none(), post: Option::none(), timestamp_of_change: 0 }
    }
}
