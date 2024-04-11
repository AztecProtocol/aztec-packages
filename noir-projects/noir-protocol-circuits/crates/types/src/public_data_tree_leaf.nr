use dep::std::{cmp::Eq,empty::Empty};

struct PublicDataTreeLeaf {
    slot: Field,
    value: Field,
}

impl Eq for PublicDataTreeLeaf {
    fn eq(self, other: Self) -> bool {
        (self.slot == other.slot) & (self.value == other.value)
    }
}

impl Empty for PublicDataTreeLeaf  {    
    fn empty() -> Self {
        Self {
            slot: 0,
            value: 0,
        }
    }
}
