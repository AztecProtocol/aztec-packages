use crate::utils::arrays::is_empty_field;

struct MembershipWitness<N> {
    leaf_index : Field,
    sibling_path : [Field; N]
}

impl<N> MembershipWitness<N> {
    fn is_empty(self) -> bool {
        is_empty_field([self.leaf_index]) && is_empty_field(self.sibling_path)
    }
}
