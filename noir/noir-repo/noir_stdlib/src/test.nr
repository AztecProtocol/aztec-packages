use crate::runtime::Unconstrained;

#[oracle(create_mock)]
fn create_mock_oracle<N, P>(name: str<N>) -> P {}

#[oracle(set_mock_params)]
fn set_mock_params_oracle<P>(id: Field, params: P) {}

#[oracle(get_mock_last_params)]
fn get_mock_last_params_oracle<P>(id: Field) -> P {}

#[oracle(set_mock_returns)]
fn set_mock_returns_oracle<R>(id: Field, returns: R) {}

#[oracle(set_mock_times)]
fn set_mock_times_oracle(id: Field, times: u64) {}

#[oracle(clear_mock)]
fn clear_mock_oracle(id: Field) {}

unconstrained fn create_mock_oracle_inner<N, P>(name: str<N>) -> Unconstrained<P> {
    create_mock_oracle(name)
}

unconstrained fn set_mock_params_oracle_inner<P>(id: Field, params: P) {
    set_mock_params_oracle(id, params)
}

unconstrained fn get_mock_last_params_oracle_inner<P>(id: Field) -> Unconstrained<P> {
    get_mock_last_params_oracle(id)
}

unconstrained fn set_mock_returns_oracle_inner<R>(id: Field, returns: R) {
    set_mock_returns_oracle(id, returns)
}

unconstrained fn set_mock_times_oracle_inner(id: Field, times: u64) {
    set_mock_times_oracle(id, times)
}

unconstrained fn clear_mock_oracle_inner(id: Field) {
    clear_mock_oracle(id)
}

struct OracleMock {
    id: Field,
}

impl OracleMock {
    pub fn mock<N>(name: str<N>) -> Self {
        Self { id: create_mock_oracle_inner(name).make_constrained(| x | x) }
    }

    pub fn with_params<P>(self, params: P) -> Self {
        set_mock_params_oracle_inner(self.id, params);
        self
    }

    pub fn get_last_params<P>(self) -> P {
        get_mock_last_params_oracle_inner(self.id).make_constrained(| x | x)
    }

    pub fn returns<R>(self, returns: R) -> Self {
        set_mock_returns_oracle_inner(self.id, returns);
        self
    }

    pub fn times(self, times: u64) -> Self {
        set_mock_times_oracle_inner(self.id, times);
        self
    }

    pub fn clear(self) {
        clear_mock_oracle_inner(self.id);
    }
}
