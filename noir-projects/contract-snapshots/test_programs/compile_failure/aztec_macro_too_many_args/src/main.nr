/// The #[aztec] macro accepts at most one AztecConfig argument.
use aztec::macros::aztec;

#[aztec(::aztec::macros::AztecConfig::new(), ::aztec::macros::AztecConfig::new())]
contract AztecMacroTooManyArgs {}
