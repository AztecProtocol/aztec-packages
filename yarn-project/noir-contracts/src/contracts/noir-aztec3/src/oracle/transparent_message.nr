#[oracle(notifyCreatedTransparentMessage)]
fn notify_created_transparent_message_oracle(
    _content: Field,
    _secretHash: Field
) -> Field {}

unconstrained fn notify_created_transparent_message(
    content: Field,
    secretHash: Field
) -> Field {
    notify_created_transparent_message_oracle(content, secretHash)
}