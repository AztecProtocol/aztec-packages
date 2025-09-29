pub trait SerializeToColumns<let N: u32> {
    fn serialize_to_columns(self) -> [Field; N];
}
