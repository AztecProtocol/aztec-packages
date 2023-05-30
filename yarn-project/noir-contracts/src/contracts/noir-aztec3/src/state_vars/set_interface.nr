// use crate::abi::Inputs;
// use crate::context::PrivateFunctionContext;
// use crate::notes::value_note::ValueNote;


// struct SetInterface<Set> {

//     new: fn (Field) -> Set,

//     insert: fn (Set, PrivateFunctionContext, ValueNote) -> PrivateFunctionContext,

//     get_2: fn (Set, Inputs, PrivateFunctionContext) -> (PrivateFunctionContext, (ValueNote, ValueNote)),

//     remove: fn (Set, Inputs, PrivateFunctionContext, ValueNote) -> PrivateFunctionContext,
// }