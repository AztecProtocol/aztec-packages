// A contract used along with `TransientParent` to test that transient arrays are isolated across contracts.
use aztec::macros::aztec;

#[aztec]
pub contract TransientChild {
    use aztec::{macros::functions::external, transient::TransientArray};

    /// Pushes values to a transient array at the given slot. Because transient arrays are isolated by contract, these
    /// writes are invisible to any caller, even one using the same slot.
    #[external("private")]
    fn append_at_slot(slot: Field) {
        // Safety: transient array operations are unconstrained oracle calls used here for testing isolation.
        unsafe {
            let array: TransientArray<Field> = TransientArray::at(slot);
            array.push(999);
            array.push(888);
            array.push(777);
        }
    }
}
