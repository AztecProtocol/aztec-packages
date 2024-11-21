import { type ProtocolContract, getCanonicalProtocolContract } from '../protocol_contract.js';

export async function getCanonicalMultiCallEntrypointContract(): Promise<ProtocolContract> {
  return await getCanonicalProtocolContract('MultiCallEntrypoint');
}
