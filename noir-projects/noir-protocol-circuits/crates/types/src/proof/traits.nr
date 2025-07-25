pub trait Verifiable {
    fn verify(self, is_last_inner_kernel: bool);
}
