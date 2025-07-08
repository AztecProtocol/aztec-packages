import { DefaultEntrypoint } from '@aztec/entrypoints/default';
import { type FunctionAbi, decodeFromAbi } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { GasSettings } from '@aztec/stdlib/gas';

import { ContractFunctionInteraction } from '../contract/contract_function_interaction.js';
import type { Wallet } from '../wallet/wallet.js';
import { FeeJuicePaymentMethod } from './fee_juice_payment_method.js';

/**
 * Use a wallet to simulate a function avoiding the wallet's entrypoint, as a SignerlessWallet would do
 * @param wallet - The wallet to use for the simulation.
 * @param contractAddress - The address of the contract to call.
 * @param abi - The ABI of the function to simulate.
 * @param args - The arguments to pass to the function.
 * @returns The return values of the function call.
 */
export async function simulateWithoutSignature(
  wallet: Wallet,
  contractAddress: AztecAddress,
  abi: FunctionAbi,
  args: any[],
) {
  const interaction = new ContractFunctionInteraction(wallet, contractAddress, abi, args);

  const request = await interaction.request();
  const maxFeesPerGas = (await wallet.getCurrentBaseFees()).mul(1.5);
  const paymentMethod = new FeeJuicePaymentMethod(AztecAddress.ZERO);
  const gasSettings = GasSettings.default({ maxFeesPerGas });
  const fee = { gasSettings, paymentMethod };

  const { l1ChainId: chainId, rollupVersion } = await wallet.getNodeInfo();
  const entrypoint = new DefaultEntrypoint(chainId, rollupVersion);
  const signerlessTxExecutionRequest = await entrypoint.createTxExecutionRequest(request, fee, {});

  const simulationResult = await wallet.simulateTx(signerlessTxExecutionRequest, false, undefined, true);
  const rawReturnValues = simulationResult.getPrivateReturnValues().values;
  return decodeFromAbi(abi.returnTypes, rawReturnValues!);
}
