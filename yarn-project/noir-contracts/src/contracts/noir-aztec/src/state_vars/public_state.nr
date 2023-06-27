struct PublicState<T> {
    storage_slot: Field,
    // value: T, // intentionally don't provide this access, because it will lead to expectations that the state will automatically be read and written, whereas in fact the dev will need to call `read` and `write` methods.
}

// TODO: decide whether to implement public state in a generic wrapper like this, or whether to have a distinct struct per public state variable (e.g. Field_PublicState, u32_PublicState, etc.).
impl<T> PublicState<T> {
    fn new(storage_slot: Field) -> Self {
        PublicState { storage_slot }
    }

    // TODO: oracle functions to read and write the public state!!!

    fn read(self) -> T {
        // This oracle only works for `Field` types at the moment
        // storage_read_oracle(self.storage_slot) as T // Not sure if you can convert like this
        std::unsafe::zeroed() // STUB, to return '0' of many primitive types
    }

    fn write(self, value: T) {
        // This oracle only works for `Field` types at the moment
        // storage_write_oracle(self.storage_slot, value) as T // Not sure if you can convert like this
        // std::unsafe::zeroed() // STUB, to return '0' of many primitive types
    }
}