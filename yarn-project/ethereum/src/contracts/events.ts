import { GovernanceAbi } from '@aztec/l1-artifacts/GovernanceAbi';

import { type Log, parseEventLogs } from 'viem';

export function extractProposalIdFromLogs(logs: Log[]): bigint {
  const parsedLogs = parseEventLogs({
    abi: GovernanceAbi,
    logs: logs,
    eventName: 'Proposed',
  });

  if (parsedLogs.length === 0) {
    throw new Error('Proposal log not found');
  }
  return parsedLogs[0].args.proposalId;
}
