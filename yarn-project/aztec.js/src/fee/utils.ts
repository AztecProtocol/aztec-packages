import { DefaultEntrypoint } from '@aztec/entrypoints/default';
import { type FunctionAbi, decodeFromAbi } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { GasSettings } from '@aztec/stdlib/gas';

import { ContractFunctionInteraction } from '../contract/contract_function_interaction.js';
import type { Wallet } from '../wallet/wallet.js';
import { FeeJuicePaymentMethod } from './fee_juice_payment_method.js';

export async function simulateWithoutSignature(wallet: Wallet, contractAddress: AztecAddress, abi: FunctionAbi) {
  const interaction = new ContractFunctionInteraction(wallet, contractAddress, abi, []);

  const request = await interaction.request();
  const maxFeesPerGas = (await wallet.getCurrentBaseFees()).mul(1.5);
  const paymentMethod = new FeeJuicePaymentMethod(AztecAddress.ZERO);
  const gasSettings = GasSettings.default({ maxFeesPerGas });
  const fee = { gasSettings, paymentMethod };

  const { l1ChainId: chainId, protocolVersion } = await wallet.getNodeInfo();
  const entrypoint = new DefaultEntrypoint(chainId, protocolVersion);
  const signerlessTxExecutionRequest = await entrypoint.createTxExecutionRequest(request, fee, {});

  const simulationResult = await wallet.simulateTx(signerlessTxExecutionRequest, false, undefined, undefined, true);
  const rawReturnValues = simulationResult.getPrivateReturnValues().values;
  return decodeFromAbi(abi.returnTypes, rawReturnValues!);
}
