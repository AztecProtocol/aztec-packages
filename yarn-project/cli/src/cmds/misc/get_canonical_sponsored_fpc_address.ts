import type { LogFn } from '@aztec/foundation/log';

import { getSponsoredFPCAddress } from '../../utils/setup_contracts.js';

export async function getCanonicalSponsoredFPCAddress(log: LogFn) {
  log(`Canonical SponsoredFPC Address: ${(await getSponsoredFPCAddress()).toString()}`);
}
