/// Helper function to find the index of the first element in an array that satisfies a given predicate.
/// If the element is not found, the function returns the length of the array `N`
pub unconstrained fn find_first_index<T, let N: u32, Env>(
    array: [T; N],
    find: fn[Env](T) -> bool,
) -> u32 {
    let mut index = N;
    for i in 0..N {
        if find(array[i]) {
            index = i;
            break;
        }
    }
    index
}

/// Helper function to find the index of the last element in an array that satisfies a given predicate.
/// If the element is not found, the function returns the length of the array `N`
pub unconstrained fn find_last_index<T, let N: u32, Env>(
    array: [T; N],
    find: fn[Env](T) -> bool,
) -> u32 {
    let mut index = N;
    for i in 0..N {
        let j = N - i - 1;
        if find(array[j]) {
            index = j;
            break;
        }
    }
    index
}

#[test]
unconstrained fn find_first_index_unique_element() {
    let array = [11, 22, 33];

    assert_eq(find_first_index(array, |x| x == 11), 0);
    assert_eq(find_first_index(array, |x| x == 22), 1);
    assert_eq(find_first_index(array, |x| x == 33), 2);
}

#[test]
unconstrained fn find_first_index_duplicate_elements() {
    let array = [11, 22, 33, 11, 22, 33];

    assert_eq(find_first_index(array, |x| x == 11), 0);
    assert_eq(find_first_index(array, |x| x == 22), 1);
    assert_eq(find_first_index(array, |x| x == 33), 2);
}

#[test]
unconstrained fn find_first_index_not_found() {
    let array = [11, 22, 33];

    assert_eq(find_first_index(array, |x| x == 0), 3);
    assert_eq(find_first_index(array, |x| x == 44), 3);
}

#[test]
unconstrained fn find_last_index_unique_element() {
    let array = [11, 22, 33];

    assert_eq(find_last_index(array, |x| x == 11), 0);
    assert_eq(find_last_index(array, |x| x == 22), 1);
    assert_eq(find_last_index(array, |x| x == 33), 2);
}

#[test]
unconstrained fn find_last_index_duplicate_elements() {
    let array = [11, 22, 33, 11, 22, 33];

    assert_eq(find_last_index(array, |x| x == 11), 3);
    assert_eq(find_last_index(array, |x| x == 22), 4);
    assert_eq(find_last_index(array, |x| x == 33), 5);
}

#[test]
unconstrained fn find_last_index_not_found() {
    let array = [11, 22, 33];

    assert_eq(find_last_index(array, |x| x == 0), 3);
    assert_eq(find_last_index(array, |x| x == 44), 3);
}
