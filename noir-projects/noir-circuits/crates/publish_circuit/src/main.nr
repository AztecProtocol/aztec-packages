global NUM_SUBMISSIONS: u32 = 5;

fn main(submissions: pub [Field; NUM_SUBMISSIONS]) -> pub Field {
    let mut sum: Field = 0;
    for i in 0..NUM_SUBMISSIONS {
        sum += submissions[i];
    }
    sum / NUM_SUBMISSIONS as Field
}

#[test]
fn test_average() {
    let submissions = [100, 200, 300, 400, 500];
    let result = main(submissions);
    assert_eq(result, 300);
}

#[test]
fn test_equal_values() {
    let submissions = [42, 42, 42, 42, 42];
    let result = main(submissions);
    assert_eq(result, 42);
}
