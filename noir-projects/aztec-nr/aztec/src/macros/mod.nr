mod functions;
mod utils;
mod note;
mod storage;

use functions::STUBS;
use storage::STORAGE_LAYOUT_NAME;
use functions::transform_unconstrained;

pub comptime fn generate_contract_interface(m: Module) -> Quoted {
    let module_name = m.name();
    let fn_stubs_quote = STUBS.join(quote {});

    quote {
        struct $module_name {
            target_contract: dep::aztec::protocol_types::address::AztecAddress
        }

        impl $module_name {
            $fn_stubs_quote

            pub fn at(
                target_contract: aztec::protocol_types::address::AztecAddress
            ) -> Self {
                Self { target_contract }
            }

            pub fn interface() -> Self {
                Self { target_contract: aztec::protocol_types::address::AztecAddress::zero() }
            }

            pub fn storage_layout() -> StorageLayout {
                $STORAGE_LAYOUT_NAME
            }
        }

        #[contract_library_method]
        pub fn at(
            target_contract: aztec::protocol_types::address::AztecAddress
        ) -> $module_name {
            $module_name { target_contract }
        }

        #[contract_library_method]
        pub fn interface() -> $module_name {
            $module_name { target_contract: aztec::protocol_types::address::AztecAddress::zero() }
        }

        #[contract_library_method]
        pub fn storage_layout() -> StorageLayout {
            $STORAGE_LAYOUT_NAME
        }
    }
}

pub comptime fn aztec_contract(m: Module) -> Quoted {
    let interface = generate_contract_interface(m);
    let functions = m.functions();
    for f in functions.filter(| f | f.) {
        transform_unconstrained(f);
    }
    interface
}
