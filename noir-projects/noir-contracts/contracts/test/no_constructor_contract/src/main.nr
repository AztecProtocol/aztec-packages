use aztec::macros::aztec;

/// Used to test deployment of a contract with no constructor in deploy_method.test.ts
#[aztec]
pub contract NoConstructor {
    use aztec::macros::functions::public;

    #[public]
    fn emit_public(value: Field) {
        context.emit_public_log(/*message=*/ value);
    }

}
