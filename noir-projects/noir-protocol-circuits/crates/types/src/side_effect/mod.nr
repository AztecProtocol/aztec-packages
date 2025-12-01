pub mod counted;
pub mod scoped;

pub use counted::Counted;
pub use scoped::Scoped;

pub trait Ordered {
    fn counter(self) -> u32;
}

pub trait Readable {
    fn assert_match_read_request(self, read_request: Scoped<Counted<Field>>);
}
