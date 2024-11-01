import { EthAddress } from '@aztec/circuits.js';

import { type MockProxy, mock } from 'jest-mock-extended';

import { BondManager } from '../bond/bond-manager.js';
import { type EscrowContract } from '../bond/escrow-contract.js';
import { type TokenContract } from '../bond/token-contract.js';

describe('BondManager', () => {
  let bondManager: BondManager;

  let tokenContract: MockProxy<TokenContract>;
  let escrowContract: MockProxy<EscrowContract>;

  beforeEach(() => {
    tokenContract = mock<TokenContract>();
    escrowContract = mock<EscrowContract>();

    escrowContract.getEscrowAddress.mockReturnValue(EthAddress.random());
    tokenContract.getBalance.mockResolvedValue(10000n);
    bondManager = new BondManager(tokenContract, escrowContract, 100n, 1000n);
  });

  it('ensures bond if current bond is below minimum', async () => {
    escrowContract.getProverDeposit.mockResolvedValue(50n);

    await bondManager.ensureBond();

    expect(escrowContract.getProverDeposit).toHaveBeenCalled();
    expect(tokenContract.ensureAllowance).toHaveBeenCalledWith(escrowContract.getEscrowAddress());
    expect(escrowContract.depositProverBond).toHaveBeenCalledWith(950n);
  });

  it('does not ensure bond if current bond is above minimum', async () => {
    escrowContract.getProverDeposit.mockResolvedValue(200n);

    await bondManager.ensureBond();

    expect(escrowContract.getProverDeposit).toHaveBeenCalled();
    expect(tokenContract.ensureAllowance).not.toHaveBeenCalled();
    expect(escrowContract.depositProverBond).not.toHaveBeenCalled();
  });

  it('throws error if not enough balance to top-up bond', async () => {
    escrowContract.getProverDeposit.mockResolvedValue(50n);
    tokenContract.getBalance.mockResolvedValue(100n);

    await expect(bondManager.ensureBond()).rejects.toThrow(/Not enough balance/i);
  });

  it('overrides minimum bond threshold', async () => {
    escrowContract.getProverDeposit.mockResolvedValue(150n);

    await bondManager.ensureBond();
    expect(escrowContract.depositProverBond).not.toHaveBeenCalled();

    await bondManager.ensureBond(200n);
    expect(escrowContract.getProverDeposit).toHaveBeenCalled();
    expect(tokenContract.ensureAllowance).toHaveBeenCalled();
    expect(escrowContract.depositProverBond).toHaveBeenCalledWith(850n);
  });

  it('overrides target bond threshold', async () => {
    escrowContract.getProverDeposit.mockResolvedValue(150n);

    await bondManager.ensureBond();
    expect(escrowContract.depositProverBond).not.toHaveBeenCalled();

    await bondManager.ensureBond(2000n);
    expect(escrowContract.getProverDeposit).toHaveBeenCalled();
    expect(tokenContract.ensureAllowance).toHaveBeenCalled();
    expect(escrowContract.depositProverBond).toHaveBeenCalledWith(1850n);
  });
});
