use crate::unsafe::UnconstrainedWrapper;

#[oracle(create_mock)]
unconstrained fn create_mock_oracle<N, P>(name: str<N>) -> Unconstrained<P> {}

#[oracle(set_mock_params)]
unconstrained fn set_mock_params_oracle<P>(id: Field, params: P) {}

#[oracle(get_mock_last_params)]
unconstrained fn get_mock_last_params_oracle<P>(id: Field) -> Unconstrained<P> {}

#[oracle(set_mock_returns)]
unconstrained fn set_mock_returns_oracle<R>(id: Field, returns: R) {}

#[oracle(set_mock_times)]
unconstrained fn set_mock_times_oracle(id: Field, times: u64) {}

#[oracle(clear_mock)]
unconstrained fn clear_mock_oracle(id: Field) {}

struct OracleMock {
    id: Field,
}

impl OracleMock {
    unconstrained pub fn mock<N>(name: str<N>) -> Unconstrained<Self> {
        Unconstrained::new(Self { id: create_mock_oracle(name).unwrap() })
    }

    unconstrained pub fn with_params<P>(self, params: P) -> Unconstrained<Self> {
        set_mock_params_oracle(self.id, params);
        Unconstrained::new(self)
    }

    unconstrained pub fn get_last_params<P>(self) -> Unconstrained<P> {
        get_mock_last_params_oracle(self.id)
    }

    unconstrained pub fn returns<R>(self, returns: R) -> Unconstrained<Self> {
        set_mock_returns_oracle(self.id, returns);
        Unconstrained::new(self)
    }

    unconstrained pub fn times(self, times: u64) -> Unconstrained<Self> {
        set_mock_times_oracle(self.id, times);
        Unconstrained::new(self)
    }

    unconstrained pub fn clear(self) {
        clear_mock_oracle(self.id);
    }
}
