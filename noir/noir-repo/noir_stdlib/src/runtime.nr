#[builtin(is_unconstrained)]
pub fn is_unconstrained() -> bool {}

#[builtin(assert_unconstrained)]
pub fn assert_unconstrained() {}

struct Unconstrained<T> {
    _value: T,
}

impl<T> Unconstrained<T> {
    fn new(value: T) -> Self {
        Self { _value: value }
    }

    fn make_constrained<Env, P>(self, constrainer: fn[Env](T) -> P) -> P {
        constrainer(self._value)
    }

    fn unwrap(self) -> T {
        assert_unconstrained();
        self._value
    }
}
