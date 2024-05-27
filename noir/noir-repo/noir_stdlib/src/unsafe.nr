use crate::runtime::assert_unconstrained;

/// For any type, return an instance of that type by initializing
/// all of its fields to 0. This is considered to be unsafe since there
/// is no guarantee that all zeroes is a valid bit pattern for every type.
#[builtin(zeroed)]
pub fn zeroed<T>() -> T {}

struct UnconstrainedWrapper<T> {
    _value: T,
}

impl<T> UnconstrainedWrapper<T> {
    fn new(value: T) -> Self {
        Self { _value: value }
    }

    fn make_constrained<Env>(self, constrainer: fn[Env](T) -> T) -> T {
        constrainer(self._value)
    }

    fn unwrap(self) -> T {
        assert_unconstrained();
        self._value
    }
}
