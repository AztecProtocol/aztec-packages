use crate::traits::Empty;

pub trait LeafPreimage {
    fn get_key(self) -> Field;
    fn as_leaf(self) -> Field;
}

pub trait IndexedTreeLeafPreimage: Empty {
    fn get_key(self) -> Field;
    fn get_next_key(self) -> Field;
    fn as_leaf(self) -> Field;
}

pub trait IndexedTreeLeafValue: Eq + Empty {
    fn get_key(self) -> Field;
}
