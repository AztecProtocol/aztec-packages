import { type ProtocolContract, getCanonicalProtocolContract } from '../protocol_contract.js';

export function getCanonicalMultiCallEntrypointContract(): ProtocolContract {
  return getCanonicalProtocolContract('MultiCallEntrypoint');
}
