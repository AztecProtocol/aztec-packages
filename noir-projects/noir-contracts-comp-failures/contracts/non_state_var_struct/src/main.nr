use aztec::macros::aztec;

#[aztec]
pub contract NonStateVarStruct {
    use aztec::macros::storage::storage;
    use aztec::state_vars::private_mutable::PrivateMutable;

    struct Foo<Context> {
        state_var: PrivateMutable<Field, Context>,
        non_state_var: Field,
    }

    #[storage]
    struct Storage<Context> {
        foo: Foo,
    }
}
