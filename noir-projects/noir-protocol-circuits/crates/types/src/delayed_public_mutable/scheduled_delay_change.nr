use crate::traits::Empty;
use std::cmp::min;

mod test;

// This data structure is used by DelayedPublicMutable to store the minimum delay with which a ScheduledValueChange object can
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
    /// WARNING: This function only returns a meaningful value when called in public with the current timestamp - for
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

    /// Schedules a change to the delay, given the `current_timestamp` and the `current` delay.
    /// This function is only meaningful when called in public with the current timestamp.
    /// The timestamp at which the new delay will become effective is determined automatically:
    ///  - when increasing the delay, the change is effective immediately
    ///  - when reducing the delay, the change will take effect after a delay equal to the difference between old and
    ///    new delay. For example, if reducing from 3 days to 1 day, the reduction will be scheduled to happen after 2
    ///    days.
    pub fn schedule_change(&mut self, new: u64, current_timestamp: u64) {
        let current = self.get_current(current_timestamp);

        // When changing the delay value we must ensure that it is not possible to produce a value change with a delay
        // shorter than the current one.
        let time_until_delay_change = if new > current {
            // Increasing the delay value can therefore be done immediately: this does not invalidate prior constraints
            // about how quickly a value might be changed (indeed it strengthens them).
            //
            //
            //                                Earliest `svc.timestamp_of_change`,     Earliest `svc.timestamp_of_change`
            //   `current_timestamp`          if the delay had remained unchanged     immediately after this scheduling fn.
            //      v                                                          v              v
            //  ====|==========================================================|==============|==>
            //      |                                                          |              |
            //      [------------------`current` delay-------------------------]              |
            //      |                                                                         |
            //      [-------------------------`new` (longer) delay----------------------------]
            //      |
            //      [] <--- `time_until_delay_change` is `0`; the change is immediate.
            //      |
            //      ^
            //      The newly-calculated `self.timestamp_of_change` (unchanged)

            0
        } else {
            // Decreasing the delay requires waiting for the difference between current and new delay in order to ensure
            // that overall the current delay is respected.
            //
            //
            //                                                   Earliest `svc.timestamp_of_change`,
            //                                                   if the delay had remained unchanged
            //                                                   AND
            //                                                   Earliest `svc.timestamp_of_change`,
            //   `current_timestamp`                             immediately after this scheduling fn.
            //  ====|============================|=============================|=================>
            //      |                                                          |
            //      [---------------------`current` delay----------------------]
            //                                   |                             |
            //                                   [- --`new` (shorter) delay----]
            //                                   |                             ^
            //      [-`time_until_delay_change`--]                             |
            //                                   |                             |
            //                                   ^                             |
            //                                   The newly-calculated          |
            //                                  `self.timestamp_of_change`     |
            //                                                                 |
            //                                                      The new `self.timestamp_of_change`
            //                                                      is calculated so that these ends
            //                                                      align.
            current - new
        };

        self.pre = Option::some(current);
        self.post = Option::some(new);
        self.timestamp_of_change = current_timestamp + time_until_delay_change;
    }

    /// Returns the minimum delay before a value might mutate due to a scheduled change, from the perspective of some
    /// historical timestamp. It only returns a meaningful value when called in private with historical timestamps.
    /// The output of this function can be passed into `ScheduledValueChange.get_time_horizon` to properly
    /// constrain the `include_by_timestamp` when reading delayed mutable state.
    /// This value typically equals the current delay at the timestamp following the historical one (the earliest one in
    /// which a value change could be scheduled), but it also considers scenarios in which a delay reduction is
    /// scheduled to happen in the near future, resulting in a way to schedule a change with an overall delay lower than
    /// the current one.
    ///
    /// Alternative explanation: returns the maximum amount of time (from the historical timestamp) that a state read
    /// (as at the historical timestamp) will remain valid.
    /// A read might end up being valid for less time in the case where a `svc.timestamp_of_change` has already been
    /// set and if it's sooner than the output of this function. In that case, the `scheduled_value_change.nr`'s
    /// `get_time_horizon` function will realize this.
    ///
    pub fn get_effective_minimum_delay_at(self, historical_timestamp: u64) -> u64 {
        // If a change is scheduled, then the effective delay might be lower than the current one (pre). At the
        // timestamp of change the current delay will be the scheduled one, with an overall delay from the historical
        // timestamp equal to the time until the change plus the new delay. If this value is lower
        // than the current delay, then that is the effective minimum delay.

        // If using some block as the anchor block of some tx, then note that if you
        // read a `delayed_mutable` from that anchor block, you're actually reading the
        // `delayed_mutable` _as at the very end_ of that block.
        // Therefore the `delayed_mutable` that you will read _as at the very start of the next
        // block_ will be _the very same_ `delayed_mutable` (nothing can possibly have changed).
        // Therefore the first opportunity to schedule a value change (from the anchor timestamp)
        // is the first tx of that next block, which takes place at least 1 second after the
        // anchor block.
        // So should you choose to go ahead and schedule a value change in the first tx of that
        // next block, it will only take effect after the "current delay" (as dictated by the
        // `delayed_mutable` of that tx, which is the same as the `delayed_mutable` as at the
        // anchor timestamp).
        // In all, the time between the anchor block's timestamp and the earliest-possible value
        // timestamp_of_change, is therefore: 1 second + the "current" delay (as at the time of
        // the anchor timestamp).
        // Reads must only be valid until _just before_ the earliest-possible value change --
        // i.e. 1 second before the earliest-possible value change.
        // That is, reads are only valid for the "current" delay (as at the time of the anchor
        // timestamp) _at most_.
        // (I.e. the read remains valid for 1 + "current delay" - 1 = "current delay", from the
        // anchor timestamp).
        //
        //  ____________                               ____________
        // |            |                             |            |
        // |  Block     |<--At least a 1 second gap-->|  Block     |
        // |____________|                             |____________|
        //              ^                              ^
        //              |                              You can schedule a value change from here.
        //              |
        //    Suppose this is your anchor block.
        //    The delayed_mutable (and hence the "current" delay) as at the end of this block will
        //    be the same as at the start of the next block.
        //
        if self.timestamp_of_change <= historical_timestamp {
            //
            //              `self.timestamp_of_change` <= `historical_timestamp`
            //                    v                              v
            // ===================|==============================|=========
            // ^^^^^^^^^^^^^^^^^^ ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
            // `self.pre` is      |`self.post` takes effect from here.
            // effective before.  |
            //
            // So in this `if` case, `self.post` is in effect at the time of the `historical_timestamp`.
            //
            // If no delay changes are scheduled (as at the time of the anchor timestamp), then the
            // "current delay" (as at the time of the historical timestamp) is `self.post` (or the
            // INITIAL_DELAY if never set).
            self.post.unwrap_or(INITIAL_DELAY)
        } else {
            //
            //          `historical_timestamp` < `self.timestamp_of_change`
            //                                           v
            // ===================|======================|====================================
            // ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
            //           `self.pre` is effective         |`self.post` takes effect from here.
            //           during this period.             |
            //
            // So in this `else` case, `self.pre` is in effect at the time of the `historical_timestamp`.
            //
            // If a delay change _is_ already scheduled (as at the time of the historical timestamp):
            //      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
            //                   |________________
            //                                    |
            //                                    v                          Earliest possible
            //  `historical_           Scheduled delay change:               `svc.timestamp_of_change`
            //  timestamp`      <      `self.timestamp_of_change`            (if not already set [^1])
            //     v                              v                                    v
            //  ===||=============================|====================================|================>
            //     .|                             .                                    .
            //     .|                             .                                    .
            //     .|__ Earliest possible timestamp at which a                         .
            //     .    function could call `schedule_change` for a new                .
            //     .    _value_ change..................................................And the earliest timestamp at
            //     .                              .                                    .which the new value would take effect.
            //     .[---------------`self.pre` delay-----------------------------------]
            //     .                              .                                    .
            //     [******************************************************************].
            //     [                                                                  ].
            //     [----------------`self.pre` delay----------------------------------].
            //     [                                                                  ].
            //     [ If reading a _value_ at that (<--) anchor timestamp, then the    ].
            //     [ read will remain valid for this duration, unless a shorter       ].
            //     [ delay has been scheduled (see just below in this diagram).       ].
            //     [ If a _deferred, longer_ delay has been scheduled, it might yet   ].
            //     [ still be cancelled, in which case this `pre` delay would         ].
            //     [ bite (see the `min` calc below) -- meaning reads would remain    ].
            //     [ valid for this duration.                                         ].
            //     [                                                                  ].
            //     [******************************************************************].
            //     .                              .                                    .
            //     .                              .                                    .
            //     [---`time_until_delay_change`--]                                    .
            //     .                              .                                    .
            //     .                              .                                    .
            //     .                              .                                    .
            //     SCENARIO 1: scheduled delay is shorter than the `self.pre` delay:   .
            //     .                              .                                    .
            //     .                              .                                    .
            //     .                              [-`self.post` delay-]                .
            //     .                              . (if shorter      ^^                .
            //     .                              .  than `pre`)     ||_ new values can take effect from here.
            //     .                              .                  |
            //     .                              .                  |_ reads are only valid until here:
            //     .                              .                  .  `historic_timestamp + time_until_delay_change + self.post - 1`
            //     .                              .                  .                 .
            //     [*************************************************]                 .
            //     [                                                 ]                 .
            //     [----`time_until_delay_change + self.post - 1`----]                 .
            //     [                                                 ]                 .
            //     [ If reading a _value_ at that (<--) anchor       ]                 .
            //     [ timestamp, then the read will remain valid      ]                 .
            //     [ for this duration:                              ]                 .
            //     [                                                 ]                 .
            //     [*************************************************]                 .
            //     .                              .                                    .
            //     .                              .                                    .
            //     .                              .                                    .
            //     SCENARIO 2: scheduled delay is longer than the `self.pre` delay, AND is deferred:
            //     (note: scheduling deferred delay changes is not yet possible)
            //     .                              .                                    .
            //     .                              .                                    .
            //     .                              [-`self.post` delay (if longer than `pre` & deferred)------------------]
            //     .                              .  (scheduling deferred delay changes is not yet possible)            ^^
            //     .                              .                                                                     ||
            //     .                              .     reads would only be valid until here:___________________________||
            //     .                              .     `historic_timestamp + time_until_delay_change + self.post - 1`   |
            //     .                              .                                                                      |
            //     .                              .                        new values would take effect from here,_______|
            //     .                              .                        but only once this longer delay takes effect  .
            //     .                              .                                    .                                 .
            //     .                              .                                    .                                 .
            //     [****************************************************************************************************].
            //     [                                                                                                    ].
            //     [----`time_until_delay_change + self.post - 1`-------------------------------------------------------].
            //     [                                                                                                    ].
            //     [ Given a longer, deferred delay, then if reading a _value_ at that (<--) historical timestamp, then ].
            //     [ you might think the read would remain valid for this duration.                                     ].
            //     [ BUT, in this case of this deferred, longer-than-`self.pre` delay, the `pre` delay ends sooner (by  ].
            //     [ construction) (see above in this diagram).                                                         ].
            //     [ And since this scheduled delay (`post`) can be cancelled up until the time it takes effect,        ].
            //     [ any reads as at that (<--) historical timestamp would cautiously only be valid until the earlier   ].
            //     [ `pre` delay expiry.                                                                                ].
            //     [                                                                                                    ].
            //     [****************************************************************************************************].
            //
            //
            //
            // [^1] If a svc.timestamp_of_change has already been set, and if it's sooner than the
            //      output of this function, then it will bite within `scheduled_value_change.nr`'s
            //      `get_time_horizon` function.
            let time_until_delay_change = self.timestamp_of_change - historical_timestamp;

            min(
                self.pre.unwrap_or(INITIAL_DELAY), // in case the scheduled delay (`post`) gets cancelled before it takes effect.
                time_until_delay_change + self.post.unwrap_or(INITIAL_DELAY) - 1,
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
