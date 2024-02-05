mod private;
mod public;
mod public_vm;

use public::PublicContext;
use private::PrivateContext;
use public_vm::PublicVmContext;

struct Context {
    private: Option<&mut PrivateContext>,
    public: Option<&mut PublicContext>,
}

impl Context {
    pub fn private(context: &mut PrivateContext) -> Context {
        Context {
            private: Option::some(context),
            public: Option::none()
        }
    }

    pub fn public(context: &mut PublicContext) -> Context {
        Context {
            public: Option::some(context),
            private: Option::none()
        }
    }

    pub fn none() -> Context {
        Context {
            public: Option::none(),
            private: Option::none()
        }
    }
}
