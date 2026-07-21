// A contract used along with `EphemeralParent` to test ephemeral array isolation across nested call frames.
use aztec::macros::aztec;

#[aztec]
pub contract EphemeralChild {
    use aztec::{ephemeral::EphemeralArray, macros::functions::external};

    /// Pushes different values to an ephemeral array at the same slot used by the parent.
    /// If isolation is broken, this would overwrite the parent's data.
    #[external("private")]
    fn use_ephemeral_at_slot(slot: Field) {
        // Safety: these ephemeral array operations are unconstrained oracle calls used for testing isolation.
        unsafe {
            let array: EphemeralArray<Field> = EphemeralArray::at(slot);
            array.push(999);
            array.push(888);
            array.push(777);
        }
    }
}
