import { Fr } from '@aztec/foundation/fields';

import express from 'express';
import type { Request, Response } from 'express';

import { executeBytecodeBase64 } from './avm.js';
import { stringArrayToFields } from './utils.js';

const app = express();
const port = process.env.PORT || 51446;

app.use(express.json({ limit: '1000mb' }));
app.use(express.urlencoded({ extended: true }));

interface AvmRequest {
  avm_bytecode: string;
  inputs: string[];
}

interface AvmResponse {
  reverted: boolean;
  outputs: string[];
  error?: string;
}

function validateAndProcessInputs(data: AvmRequest): { bytecode: string; inputs: Fr[] } {
  if (!data.avm_bytecode || typeof data.avm_bytecode !== 'string') {
    throw new Error('Missing or invalid avm_bytecode field');
  }

  if (!Array.isArray(data.inputs)) {
    throw new Error('Missing or invalid inputs field - must be an array');
  }

  const inputs = stringArrayToFields(data.inputs);

  return {
    bytecode: data.avm_bytecode,
    inputs,
  };
}

function formatOutputs(outputs: Fr[]): string[] {
  return outputs.map(fr => fr.toString());
}

app.post('/execute', async (req: Request, res: Response) => {
  console.time('execute');
  try {
    const { bytecode, inputs } = validateAndProcessInputs(req.body);

    console.log(`Executing AVM bytecode with ${inputs.length} inputs`);

    const result = await executeBytecodeBase64(bytecode, inputs);

    const response: AvmResponse = {
      reverted: result.reverted,
      outputs: formatOutputs(result.output),
    };

    res.json(response);
  } catch (error) {
    console.error('Error executing AVM bytecode:', error);

    const response: AvmResponse = {
      reverted: true,
      outputs: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };

    res.status(400).json(response);
  } finally {
    console.timeEnd('execute');
  }
});

app.listen(port, () => {
  console.log(`AVM Simulator Server running on port ${port}`);
  console.log(`POST JSON: http://localhost:${port}/execute`);
});

export default app;
