/// Asserts that elements past `len()` in a `BoundedVec` are zeroed.
///
/// Oracle functions may return `BoundedVec` values with dirty trailing storage (non-zero elements past `len()`).
/// This is problematic because `BoundedVec`'s `Eq` implementation and other operations assume trailing elements
/// are zeroed.
///
/// This function should be called on any `BoundedVec` obtained from an oracle to guard against malformed data.
///
/// TODO(https://github.com/noir-lang/noir/issues/4218): Remove once Noir natively validates `BoundedVec` returned
/// from unconstrained functions.
pub(crate) unconstrained fn assert_bounded_vec_trimmed<T, let MaxLen: u32>(vec: BoundedVec<T, MaxLen>)
where
    T: Eq,
{
    let storage = vec.storage();
    let len = vec.len();
    for i in 0..MaxLen {
        if i >= len {
            assert_eq(storage[i], std::mem::zeroed(), "BoundedVec has non-zero trailing elements");
        }
    }
}

mod test {
    use super::assert_bounded_vec_trimmed;

    #[test]
    unconstrained fn trimmed_empty_vec() {
        let vec: BoundedVec<Field, 3> = BoundedVec::new();
        assert_bounded_vec_trimmed(vec);
    }

    #[test]
    unconstrained fn trimmed_full_vec() {
        let vec = BoundedVec::<Field, 3>::from_array([1, 2, 3]);
        assert_bounded_vec_trimmed(vec);
    }

    #[test]
    unconstrained fn trimmed_partial_vec() {
        let vec = BoundedVec::<Field, 5>::from_array([1, 2, 3]);
        assert_bounded_vec_trimmed(vec);
    }

    #[test(should_fail_with = "BoundedVec has non-zero trailing elements")]
    unconstrained fn dirty_trailing_element_fails() {
        let mut vec = BoundedVec::<Field, 3>::from_array([1]);
        // We use the unchecked setter to write past the length, knowingly breaking the invariant.
        vec.set_unchecked(1, 42);
        assert_bounded_vec_trimmed(vec);
    }

    #[test(should_fail_with = "BoundedVec has non-zero trailing elements")]
    unconstrained fn dirty_last_element_fails() {
        let mut vec = BoundedVec::<Field, 3>::from_array([1, 2]);
        vec.set_unchecked(2, 99);
        assert_bounded_vec_trimmed(vec);
    }

    #[test]
    unconstrained fn trimmed_array_elements() {
        // Test with array element type (like get_notes_oracle returns BoundedVec<[Field; N], MaxNotes>).
        let vec = BoundedVec::<[Field; 2], 3>::from_array([[1, 2], [3, 4]]);
        assert_bounded_vec_trimmed(vec);
    }
}
