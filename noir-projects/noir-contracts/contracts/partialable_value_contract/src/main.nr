mod partial_value;

contract PartialableValue {
    use dep::aztec::prelude::{PublicMutable, PrivateSet};
    use crate::partial_value::PartialableValueNote;

    #[aztec(storage)]
    struct Storage {
        a_private_value: PrivateSet<PartialableValueNote>,
        partial_commitment: PublicMutable<Field>,
    }

    #[aztec(private)]
    fn compute_partial_commitment(rand: Field) -> Field {
        // computes the commitement and stores in pending_value
        rand
    }

    #[aztec(public)]
    fn store_partial_commitment(new_value: Field) -> Field {
        storage.partial_commitment.write(new_value);
        new_value
    }
}

