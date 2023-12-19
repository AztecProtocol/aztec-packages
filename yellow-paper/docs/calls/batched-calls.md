---
sidebar_position: 3
---

# Batched calls

Calls to private functions can be _batched_ instead of executed [synchronously](./sync-calls.md). When executing a batched call to a private function, the function is not executed on the spot, but enqueued for execution at the end of local execution. Once the private call stack has been emptied, all batched execution requests are grouped by target, defined as recipient and function selector, and executed via a single call to each target.

Batched calls are implemented by pushing a `PrivateCallStackItem` with the flag `is_execution_request` into a `private_batched_queue` in the execution context, and require an oracle call to `batchPrivateFunctionCall` with the same arguments as other oracle function calls.

Batched calls are processed by the private kernel circuit. On each kernel circuit iteration, if the private call stack is not empty, the kernel circuit pops and processes the topmost entry. Otherwise, if the batched queue is not empty, the kernel pops the first item, collects and deletes all other items with the same target, and calls into the target with the concatenation of the arguments for all collected calls. Note that this allows batched calls to trigger synchronous calls.

In pseudocode, the kernel circuit executes the following logic:

```
loop:
  if next_call_stack_item = context.private_call_stack.pop():
    execute(next_call_stack_item.address, next_call_stack_item.function_selector, next_call_stack_item.arguments)
  else if next_batched_call = context.private_batched_queue.pop():
    let calls = context.private_batched_queue.get_and_delete(enqueued_call.target == target)
    execute(target.address, target.function_selector, calls.map(arguments))
  else:
    break
```

The rationale for batched calls is to minimize the number of function calls in private execution, in order to reduce total proving times. Batched calls are mostly intended for usage with note delivery precompiles, since these do not require synchronous execution, and allows for processing all notes to be encrypted and tagged with the same mechanism using the same call. Batched calls can also be used for other common functions that do not require to be executed synchronously and are likely to be invoked multiple times.