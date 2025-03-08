import type { ContractFunctionInteraction } from '@aztec/aztec.js/contracts';
import { Wallet } from '@aztec/aztec.js/wallet';

export async function captureIvcInputs(
  interaction: ContractFunctionInteraction,
  wallet: Wallet,
): Promise<ContractFunctionInteraction> {
  // Not included in env_var.ts as internal to e2e tests.
  const ivcFolder = process.env.CAPTURE_IVC_FOLDER;
  if (ivcFolder) {
    const txExecutionRequest = await interaction.create();

    // const { origin: contractAddress, functionSelector } = txRequest;

    // try {
    //   const result = await this.simulator.run(txRequest, contractAddress, functionSelector, msgSender, scopes);
    //   this.log.debug(`Private simulation completed for ${contractAddress.toString()}:${functionSelector}`);
    //   return result;
    wallet.simulateTx(
      txExecutionRequest,
      /* simulate public */ false,
      /* sender */ undefined,
      /* skip tx validation */ true,
      /* skip fee enforcement */ false,
    );
  }
  return interaction;
}
