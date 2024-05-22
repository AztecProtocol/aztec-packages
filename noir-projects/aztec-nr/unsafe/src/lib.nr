struct Unconstrained<T> {
    _value: T,
}

impl<T> Unconstrained<T> {
    fn new(value: T) -> Self {
        Self { _value: value }
    }

    unconstrained fn transform<Env, T2>(self, transformer: fn[Env](T) -> T2) -> Unconstrained<T2> {
        Unconstrained::new(transformer(self._value))
    }

    fn make_constrained<Env>(self, constrainer: fn[Env](T) -> T) -> T {
        constrainer(self._value)
    }
}
