use crate::error::Result;

pub trait Backend {
    fn call(&mut self, input: &[u8]) -> Result<Vec<u8>>;
    fn destroy(&mut self) -> Result<()>;
}
