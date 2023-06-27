use crate::context::Context;
use crate::oracle;

fn emit_encrypted_log<S>(mut context: Context, log: [Field; S], len: Field) -> Context {
    let hash = oracle::emit_encrypted_log(log);
    context = context.set_encrypted_logs_hash(hash);
    context = context.set_encrypted_log_preimages_length(len);
    context
}

fn emit_unencrypted_log<S>(mut context: Context, log: [Field; S], len: Field) -> Context {
    let hash = oracle::emit_unencrypted_log(log);
    context = context.set_unencrypted_logs_hash(hash);
    context = context.set_unencrypted_log_preimages_length(len);
    context
}
