use crate::{address::AztecAddress};

trait Ordered {
    fn counter(self) -> u32;
}

trait RangeOrdered {
    fn counter_start(self) -> u32;
    fn counter_end(self) -> u32;
}

trait OrderedValue<T> where T: Eq {
    fn value(self) -> T;
    fn counter(self) -> u32;
}

trait Scoped<T> where T: Eq {
    fn contract_address(self) -> AztecAddress;
    fn inner(self) -> T;
}

trait Readable<T> {
    fn assert_match_read_request(self, read_request: T);
}

trait Overridable {
    // The counter of the next side effect that's overriding the current side effect.
    fn override_counter(self) -> u32;
}

trait Inner<T> {
    fn inner(self) -> T;
}
