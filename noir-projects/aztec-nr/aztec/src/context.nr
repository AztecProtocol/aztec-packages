mod globals;
mod inputs;

mod private_context;
mod public_context;
mod avm_context;
mod interface;
mod gas;

use interface::{
    ContextInterface, PrivateCallInterface, PublicCallInterface, PrivateVoidCallInterface,
    PublicVoidCallInterface, AvmCallInterface, AvmVoidCallInterface
};
use private_context::PrivateContext;
use private_context::PackedReturns;
use public_context::PublicContext;
use public_context::FunctionReturns;
use avm_context::AvmContext;
