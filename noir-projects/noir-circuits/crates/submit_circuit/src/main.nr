global NUM_INPUTS: u32 = 10;

fn main(values: [Field; NUM_INPUTS]) -> pub Field {
    let mut sum: Field = 0;
    for i in 0..NUM_INPUTS {
        sum += values[i];
    }
    sum
}

#[test]
fn test_sum() {
    let values = [10, 20, 30, 0, 0, 0, 0, 0, 0, 0];
    let result = main(values);
    assert_eq(result, 60);
}

#[test]
fn test_all_values() {
    let values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    let result = main(values);
    assert_eq(result, 55);
}
