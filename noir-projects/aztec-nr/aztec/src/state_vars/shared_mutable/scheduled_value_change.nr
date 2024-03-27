use dep::protocol_types::traits::{Serialize, Deserialize, FromField, ToField};

// This data structure is used by SharedMutable to represent a value that changes from `pre` to `post` at some block 
// called the `block_of_change`. The value can only be made to change by scheduling a change event at some future block
// of change after some delay measured in blocks has elapsed. This means that at any given block number we know both the 
// current value and the smallest block number at which the value might change - this is called the 'block horizon'.
//
// The delay being a type parameter instead of a struct field is an implementation detail, and is due to a number of
// reasons:
//  - we want to serialize and deserialize this object in order to store it in public storage, but we don't want to
//    include the delay there because it is immutable
//  - because of how aztec-nr state variables are declared, having a type with some immutable property is better 
//    expressed via types, since they are always constructed with the same `::new(context, storage_slot)` function.
struct ScheduledValueChange<T, DELAY> {
    pre: T,
    post: T,
    block_of_change: u32,
    // The _dummy variable forces DELAY to be interpreted as a numberic value. This is a workaround to
    // https://github.com/noir-lang/noir/issues/4633. Remove once resolved.
    _dummy: [Field; DELAY],
}

impl<T, DELAY> ScheduledValueChange<T, DELAY> {
    pub fn new(pre: T, post: T, block_of_change: u32) -> Self {
        Self { pre, post, block_of_change, _dummy: [0; DELAY] }
    }

    pub fn get_current_at(self, historical_block_number: u32) -> T {
        if historical_block_number < self.block_of_change {
            self.pre
        } else {
            self.post
        }
    }

    pub fn get_scheduled(self) -> (T, u32) {
        (self.post, self.block_of_change)
    }

    pub fn get_block_horizon(self, historical_block_number: u32) -> u32 {
        if historical_block_number < self.block_of_change {
            min(self.block_of_change, historical_block_number + DELAY)
        } else {
            historical_block_number + DELAY
        }
    }

    pub fn schedule_change(&mut self, new_value: T, current_block_number: u32) {
        self.pre = self.get_current_at(current_block_number);
        self.post = new_value;
        self.block_of_change = current_block_number + DELAY;
    }
}

impl<T, DELAY> Serialize<3> for ScheduledValueChange<T, DELAY> {
    fn serialize(self) -> [Field; 3] where T: ToField {
        [self.pre.to_field(), self.post.to_field(), self.block_of_change.to_field()]
    }
}

impl<T, DELAY> Deserialize<3> for ScheduledValueChange<T, DELAY> {
  fn deserialize(input: [Field; 3]) -> Self  where T: FromField {
    Self { 
        pre: FromField::from_field(input[0]), 
        post: FromField::from_field(input[1]), 
        block_of_change: FromField::from_field(input[2]), 
        _dummy: [0; DELAY] 
    }
  }
}

fn min<T>(lhs: T, rhs: T) -> T where T: Ord {
    if lhs < rhs { lhs } else { rhs }
}

#[test]
fn test_min() {
    assert(min(3, 5) == 3);
    assert(min(5, 3) == 3);
    assert(min(3, 3) == 3);
}

mod test {
    use crate::state_vars::shared_mutable::scheduled_value_change::ScheduledValueChange;

    global TEST_DELAY = 200;

    #[test]
    fn test_get_current_at() {
        let pre = 1;
        let post = 2;
        let block_of_change = 50;

        let value: ScheduledValueChange<Field, TEST_DELAY> = ScheduledValueChange::new(pre, post, block_of_change);

        assert_eq(value.get_current_at(0), pre);
        assert_eq(value.get_current_at(block_of_change - 1), pre);
        assert_eq(value.get_current_at(block_of_change), post);
        assert_eq(value.get_current_at(block_of_change + 1), post);
    }

    #[test]
    fn test_get_scheduled() {
        let pre = 1;
        let post = 2;
        let block_of_change = 50;

        let value: ScheduledValueChange<Field, TEST_DELAY> = ScheduledValueChange::new(pre, post, block_of_change);

        assert_eq(value.get_scheduled(), (post, block_of_change));
    }

    #[test]
    fn test_get_block_horizon_change_in_past() {
        let block_number = 100;
        let block_of_change = 50;

        let value: ScheduledValueChange<Field, TEST_DELAY> = ScheduledValueChange::new(1, 2, block_of_change);

        assert_eq(value.get_block_horizon(block_number), block_number + TEST_DELAY);
    }

    #[test]
    fn test_get_block_horizon_change_in_immediate_past() {
        let block_number = 100;
        let block_of_change = 100;

        let value: ScheduledValueChange<Field, TEST_DELAY> = ScheduledValueChange::new(1, 2, block_of_change);

        assert_eq(value.get_block_horizon(block_number), block_number + TEST_DELAY);
    }

    #[test]
    fn test_get_block_horizon_change_in_near_future() {
        let block_number = 100;
        let block_of_change = 120;

        let value: ScheduledValueChange<Field, TEST_DELAY> = ScheduledValueChange::new(1, 2, block_of_change);

        // Note that this is the only scenario in which the block of change informs the block horizon.
        // This may result in privacy leaks when interacting with applications that have a scheduled change
        // in the near future.
        assert_eq(value.get_block_horizon(block_number), block_of_change);
    }

    #[test]
    fn test_get_block_horizon_change_in_far_future() {
        let block_number = 100;
        let block_of_change = 500;

        let value: ScheduledValueChange<Field, TEST_DELAY> = ScheduledValueChange::new(1, 2, block_of_change);

        assert_eq(value.get_block_horizon(block_number), block_number + TEST_DELAY);
    }

    #[test]
    fn test_schedule_change_before_prior_change() {
        let pre = 1;
        let post = 2;
        let block_of_change = 500;

        let mut value: ScheduledValueChange<Field, TEST_DELAY> = ScheduledValueChange::new(pre, post, block_of_change);

        let new = 42;
        let current_block_number = block_of_change - 50;
        value.schedule_change(new, current_block_number);

        // Because we re-schedule before the last scheduled change takes effect, the old `post` value is lost.
        assert_eq(value.pre, pre);
        assert_eq(value.post, new);
        assert_eq(value.block_of_change, current_block_number + TEST_DELAY);
    }

    #[test]
    fn test_schedule_change_after_prior_change() {
        let pre = 1;
        let post = 2;
        let block_of_change = 500;

        let mut value: ScheduledValueChange<Field, TEST_DELAY>  = ScheduledValueChange::new(pre, post, block_of_change);

        let new = 42;
        let current_block_number = block_of_change + 50;
        value.schedule_change(new, current_block_number);

        assert_eq(value.pre, post);
        assert_eq(value.post, new);
        assert_eq(value.block_of_change, current_block_number + TEST_DELAY);
    }
}
