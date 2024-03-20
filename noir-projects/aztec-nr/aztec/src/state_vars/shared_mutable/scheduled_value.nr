struct ScheduledValue<T> {
    pre: T,
    post: T,
    block_of_change: u32,
    delay: u32,
}

impl<T> ScheduledValue<T> {
    fn new(pre: T, post: T, block_of_change: u32, delay: u32) -> Self {
        Self { pre, post, block_of_change, delay }
    }

    fn get_current(self, historical_block_number: u32) -> T {
        if historical_block_number < self.block_of_change {
            self.pre
        } else {
            self.post
        }
    }

    fn get_block_horizon(self, historical_block_number: u32) -> u32 {
        if historical_block_number < self.block_of_change {
            min(self.block_of_change, historical_block_number + self.delay)
        } else {
            historical_block_number + self.delay
        }
    }

    fn schedule_change(&mut self, new_value: T, current_block_number: u32) {
        self.pre = self.get_current(current_block_number);
        self.post = new_value;
        self.block_of_change = current_block_number + self.delay;
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

#[test]
fn test_get_current() {
    let pre = 1;
    let post = 2;
    let block_of_change = 50;

    let value = ScheduledValue::new(pre, post, block_of_change, 200);

    assert_eq(value.get_current(0), pre);
    assert_eq(value.get_current(block_of_change - 1), pre);
    assert_eq(value.get_current(block_of_change), post);
    assert_eq(value.get_current(block_of_change + 1), post);
}

#[test]
fn test_get_block_horizon_change_in_past() {
    let block_number = 100;
    let block_of_change = 50;
    let delay = 200;

    let value = ScheduledValue::new(1, 2, block_of_change, delay);

    assert_eq(value.get_block_horizon(block_number), block_number + delay);
}

#[test]
fn test_get_block_horizon_change_in_immediate_past() {
    let block_number = 100;
    let block_of_change = 100;
    let delay = 200;

    let value = ScheduledValue::new(1, 2, block_of_change, delay);

    assert_eq(value.get_block_horizon(block_number), block_number + delay);
}

#[test]
fn test_get_block_horizon_change_in_near_future() {
    let block_number = 100;
    let block_of_change = 120;
    let delay = 200;

    let value = ScheduledValue::new(1, 2, block_of_change, delay);

    // Note that this is the only scenario in which the block of change informs the block horizon.
    // This may result in privacy leaks when interacting with applications that have a scheduled change
    // in the near future.
    assert_eq(value.get_block_horizon(block_number), block_of_change);
}

#[test]
fn test_get_block_horizon_change_in_far_future() {
    let block_number = 100;
    let block_of_change = 500;
    let delay = 200;

    let value = ScheduledValue::new(1, 2, block_of_change, delay);

    assert_eq(value.get_block_horizon(block_number), block_number + delay);
}

#[test]
fn test_schedule_change_before_prior_change() {
    let pre = 1;
    let post = 2;
    let block_of_change = 500;
    let delay = 200;

    let mut value = ScheduledValue::new(pre, post, block_of_change, delay);

    let new = 42;
    let current_block_number = block_of_change - 50;
    value.schedule_change(new, current_block_number);

    // Because we re-schedule before the last scheduled change takes effect, the old `post` value is lost.
    assert_eq(value.pre, pre);
    assert_eq(value.post, new);
    assert_eq(value.block_of_change, current_block_number + delay);
}

#[test]
fn test_schedule_change_after_prior_change() {
    let pre = 1;
    let post = 2;
    let block_of_change = 500;
    let delay = 200;

    let mut value = ScheduledValue::new(pre, post, block_of_change, delay);

    let new = 42;
    let current_block_number = block_of_change + 50;
    value.schedule_change(new, current_block_number);

    assert_eq(value.pre, post);
    assert_eq(value.post, new);
    assert_eq(value.block_of_change, current_block_number + delay);
}
