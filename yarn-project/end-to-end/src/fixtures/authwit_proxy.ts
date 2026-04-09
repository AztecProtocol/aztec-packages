import type {
  ContractFunctionInteraction,
  SendInteractionOptions,
  SimulateInteractionOptions,
} from '@aztec/aztec.js/contracts';
import type { GenericProxyContract } from '@aztec/noir-test-contracts.js/GenericProxy';

/**
 * Builds a proxy forwarding call from an action, selecting the right forward_private_N method.
 */
async function buildProxyCall(proxy: GenericProxyContract, action: ContractFunctionInteraction) {
  const call = await action.getFunctionCall();
  const argCount = call.args.length;
  if (argCount === 2) {
    return proxy.methods.forward_private_2(call.to, call.selector, call.args);
  } else if (argCount === 3) {
    return proxy.methods.forward_private_3(call.to, call.selector, call.args);
  } else if (argCount === 4) {
    return proxy.methods.forward_private_4(call.to, call.selector, call.args);
  } else if (argCount === 5) {
    return proxy.methods.forward_private_5(call.to, call.selector, call.args);
  } else if (argCount === 6) {
    return proxy.methods.forward_private_6(call.to, call.selector, call.args);
  }
  throw new Error(`No forward_private_${argCount} method on proxy`);
}

/**
 * Sends a contract call through the authwit proxy.
 * The proxy becomes msg_sender in the target (triggering authwit validation),
 * while the actual tx sender retains their keys in scope.
 */
export async function sendThroughAuthwitProxy(
  proxy: GenericProxyContract,
  action: ContractFunctionInteraction,
  options: SendInteractionOptions,
) {
  const proxyCall = await buildProxyCall(proxy, action);
  return proxyCall.send(options);
}

/**
 * Simulates a contract call through the authwit proxy.
 * The proxy becomes msg_sender in the target (triggering authwit validation),
 * while the actual tx sender retains their keys in scope.
 */
export async function simulateThroughAuthwitProxy(
  proxy: GenericProxyContract,
  action: ContractFunctionInteraction,
  options: SimulateInteractionOptions,
) {
  const proxyCall = await buildProxyCall(proxy, action);
  return proxyCall.simulate(options);
}
