use dep::std::{cmp::Eq,default::Default};

struct PublicDataTreeLeaf {
    slot: Field,
    value: Field,
}

impl Eq for PublicDataTreeLeaf {
    fn eq(self, other: Self) -> bool {
        (self.slot == other.slot) & (self.value == other.value)
    }
}

impl Default for PublicDataTreeLeaf  {    
    fn default() -> Self {
        Self {
            slot: 0,
            value: 0,
        }
    }
}
