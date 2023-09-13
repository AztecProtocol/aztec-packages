use crate::context::{PrivateContext, PublicContext};
use crate::oracle::compute_selector::compute_selector;

global IS_VALID_SELECTOR = 0xe86ab4ff;

fn assert_valid_message_for(context: &mut PrivateContext, whom: Field, message_hash: Field) {
  let result = context.call_private_function(whom, IS_VALID_SELECTOR, [message_hash])[0];
  assert(result == IS_VALID_SELECTOR, "Message not authorised by account");
}

fn assert_valid_public_message_for(context: &mut PublicContext, whom: Field, message_hash: Field) {
  let selector = compute_selector("is_valid_public(Field)");
  let result = context.call_public_function(whom, selector, [message_hash])[0];
  assert(result == IS_VALID_SELECTOR, "Message not authorised by account");
}