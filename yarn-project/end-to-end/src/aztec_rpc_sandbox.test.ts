import { aztecRpcTestSuite } from '@aztec/aztec-rpc';
import { createAztecRpcClient } from '@aztec/aztec.js';

const { SANDBOX_URL = 'http://localhost:8080' } = process.env;

aztecRpcTestSuite('aztec_rpc_sandbox', createAztecRpcClient(SANDBOX_URL));
