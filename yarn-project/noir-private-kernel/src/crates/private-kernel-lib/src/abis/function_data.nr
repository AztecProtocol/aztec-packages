use crate::abis::function_selector::FunctionSelector;

struct FunctionData {
    // First four bytes of the abi encoding 
    // of a function. 
    selector : FunctionSelector,
    is_internal : bool,
    is_private : bool,
    is_constructor : bool,
}


impl FunctionData {
    // A field is ~256 bits
    // TODO(hash): Since, function data can fit into a Field,
    // This method will simply return a bit packed Field instead of hashing
    fn hash(self) -> Field {
        0
    }
}