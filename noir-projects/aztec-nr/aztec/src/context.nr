mod globals;
mod inputs;

mod avm;
mod context_interface;
mod private_context;
mod public_context;
mod some_public_context;

use avm::{AVMContext};
use private_context::PrivateContext;
use public_context::PublicContext;
use some_public_context::SomePublicContext;

struct Context {
    private: Option<&mut PrivateContext>,
    public: Option<&mut SomePublicContext>,
}

impl Context {
    pub fn private(context: &mut PrivateContext) -> Context {
        Context { private: Option::some(context), public: Option::none() }
    }

    pub fn public(context: &mut SomePublicContext) -> Context {
        Context { private: Option::none(), public: Option::some(context) }
    }

    pub fn none() -> Context {
        Context { private: Option::none(), public: Option::none() }
    }
}
