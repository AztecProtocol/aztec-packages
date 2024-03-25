import { NoirCompiledCircuit } from '@aztec/types/noir';

import { AbiParameter, AbiType, Sign, Visibility } from '@noir-lang/types';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VisibilitySchema: z.ZodType<Visibility> = z.union([
  z.literal('public'),
  z.literal('private'),
  z.literal('databus'),
]);

const ABIVariableSchema = z.object({
  name: z.string(),
  type: z.lazy(() => ABITypeSchema),
});

const ABIParameterSchema: z.ZodType<AbiParameter> = z.object({
  name: z.string(),
  type: z.lazy(() => ABITypeSchema),
  visibility: VisibilitySchema,
});

const BasicTypeSchema = z.object({
  kind: z.string(),
});

const SignSchema: z.ZodType<Sign> = z.union([z.literal('unsigned'), z.literal('signed')]);
const IntegerTypeSchema = BasicTypeSchema.extend({
  kind: z.literal('integer'),
  sign: SignSchema,
  width: z.number(),
});

const StringTypeSchema: z.ZodType<AbiType> = BasicTypeSchema.extend({
  kind: z.literal('string'),
  length: z.number(),
});

const ArrayTypeSchema: z.ZodType<AbiType> = BasicTypeSchema.extend({
  kind: z.literal('array'),
  length: z.number(),
  type: z.lazy(() => ABITypeSchema),
});

const TupleTypeSchema: z.ZodType<AbiType> = BasicTypeSchema.extend({
  kind: z.literal('tuple'),
  fields: z.lazy(() => z.array(ABITypeSchema)),
});

const StructTypeSchema: z.ZodType<AbiType> = BasicTypeSchema.extend({
  kind: z.literal('struct'),
  path: z.string(),
  fields: z.array(ABIVariableSchema),
});

const ABITypeSchema: z.ZodType<AbiType> = z.union([
  BasicTypeSchema.extend({ kind: z.literal('field') }),
  BasicTypeSchema.extend({ kind: z.literal('boolean') }),
  IntegerTypeSchema,
  ArrayTypeSchema,
  StringTypeSchema,
  StructTypeSchema,
  TupleTypeSchema,
]);

const NoirFunctionAbiSchema = z.object({
  parameters: z.array(ABIParameterSchema),
  // eslint-disable-next-line camelcase
  param_witnesses: z.record(z.array(z.any())),
  // eslint-disable-next-line camelcase
  return_type: z.object({
    // eslint-disable-next-line camelcase
    abi_type: ABITypeSchema,
    visibility: VisibilitySchema,
  }),
  // eslint-disable-next-line camelcase
  return_witnesses: z.array(z.number()),
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const NoirCompiledCircuitSchema = z.object({
  hash: z.number().optional(),
  abi: NoirFunctionAbiSchema,
  bytecode: z.string(),
  // eslint-disable-next-line camelcase
  debug_symbols: z.string(),
  // eslint-disable-next-line camelcase
  file_map: z.record(
    z.object({
      path: z.string(),
      source: z.string(),
    }),
  ),
});

// compensate for the fact that we might be executing from ../dest
const artifactDir = '../src/target';

function parseArtifact(fileName: string) {
  const artifactPath = path.join(__dirname, artifactDir, fileName);
  // return NoirCompiledCircuitSchema.parse(JSON.parse(readFileSync(artifactPath, 'utf-8'))) as NoirCompiledCircuit;
  return JSON.parse(readFileSync(artifactPath, 'utf-8')) as NoirCompiledCircuit;
}

export const PrivateKernelInitArtifact = parseArtifact('private_kernel_init.json');
export const PrivateKernelInitSimulatedArtifact = parseArtifact('private_kernel_init_simulated.json');
export const PrivateKernelInnerArtifact = parseArtifact('private_kernel_inner.json');
export const PrivateKernelInnerSimulatedArtifact = parseArtifact('private_kernel_inner_simulated.json');
export const PrivateKernelTailArtifact = parseArtifact('private_kernel_tail.json');
export const PrivateKernelTailSimulatedArtifact = parseArtifact('private_kernel_tail_simulated.json');
export const PublicKernelSetupArtifact = parseArtifact('public_kernel_setup.json');
export const PublicKernelSetupSimulatedArtifact = parseArtifact('public_kernel_setup_simulated.json');
export const PublicKernelAppLogicArtifact = parseArtifact('public_kernel_app_logic.json');
export const PublicKernelAppLogicSimulatedArtifact = parseArtifact('public_kernel_app_logic_simulated.json');
export const PublicKernelTeardownArtifact = parseArtifact('public_kernel_teardown.json');
export const PublicKernelTeardownSimulatedArtifact = parseArtifact('public_kernel_teardown_simulated.json');
export const PublicKernelTailArtifact = parseArtifact('public_kernel_tail.json');
export const PublicKernelTailSimulatedArtifact = parseArtifact('public_kernel_tail_simulated.json');
export const BaseParityArtifact = parseArtifact('parity_base.json');
export const RootParityArtifact = parseArtifact('parity_root.json');
export const BaseRollupArtifact = parseArtifact('rollup_base.json');
export const BaseRollupSimulatedArtifact = parseArtifact('rollup_base_simulated.json');
export const MergeRollupArtifact = parseArtifact('rollup_merge.json');
export const RootRollupArtifact = parseArtifact('rollup_root.json');
