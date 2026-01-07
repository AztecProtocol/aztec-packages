import { AztecAddress } from '@aztec/stdlib/aztec-address';

export const DEFAULT_ADDRESS = AztecAddress.fromNumber(42);

/** Job ID for TXE operations. TXE runs tests in isolation, so a constant job ID is sufficient. */
export const TXE_JOB_ID = 'txe-job';
