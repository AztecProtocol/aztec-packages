pub comptime fn aztec(m: Module) -> Quoted {
    let functions = m.functions();
    let functions = functions.filter(|function: FunctionDefinition| function.has_named_attribute("public"));

    let ifs = functions.map(
        |function: FunctionDefinition| {
        let name = function.name();
        let signature = function_signature(function);
        // Turn the Quoted value into into a str<N>
        let signature = std::meta::unquote!(quote { $signature });

        let reads = function.parameters().map(|param: (Quoted, Type)| {
            let param_name = param.0;
            quote { let $param_name = panic(f"avm_read_calldata"); }
        });
        let read = reads.join(quote { });

        let args = function.parameters().map(|param: (Quoted, Type)| param.0);
        let args = args.join(quote { , });
        let call = quote { $name($args) };

        let if_ = quote { 
            if selector == dep::aztec::protocol_types::abis::function_selector::FunctionSelector::from_signature($signature) {
                $read
                let return_value = $call;
                panic(f"avm_return")
            }
        };
        if_
    }
    );

    let ifs = ifs.push_back(quote { { panic(f"Unknown selector") } });
    let dispatch = ifs.join(quote { else });

    let body = quote {
        pub fn public_entrypoint(selector: Field) {
            let selector = dep::aztec::protocol_types::abis::function_selector::FunctionSelector::from_field(selector);
            $dispatch
        }
    };

    body
}

comptime fn function_signature(function: FunctionDefinition) -> Quoted {
    let name = function.name();

    let types = function.parameters().map(
        |param: (Quoted, Type)| {
            let typ = param.1;
            f"{typ}".as_ctstring()
        }
    );
    let types = types.join(", ".as_ctstring());

    let signature = f"{name}({types})";
    quote { $signature }
}
