/* eslint-disable camelcase */

/* eslint-disable jsdoc/require-jsdoc */
import { z } from 'zod';


const noirBasicAbiTypeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('boolean') }),
  z.object({ kind: z.literal('field') }),
  z.object({
    kind: z.literal('integer'),
    sign: z.union([z.literal('signed'), z.literal('unsigned')]),
    width: z.number(),
  }),
  z.object({ kind: z.literal('string'), length: z.number() }),
]);

type NoirAbiType =
  | z.infer<typeof noirBasicAbiTypeSchema>
  | { kind: 'struct'; fields: { name: string; type: NoirAbiType }[]; path: string }
  | { kind: 'array'; length: number; type: NoirAbiType };

const noirAbiTypeSchema: z.ZodType<NoirAbiType> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    ...noirBasicAbiTypeSchema.options,
    z.object({ kind: z.literal('array'), length: z.number(), type: noirAbiTypeSchema }),
    z.object({
      kind: z.literal('struct'),
      path: z.string(),
      fields: z.array(noirAbiVariableSchema),
    }),
  ]),
);

const noirAbiVariableSchema = z.object({
  name: z.string(),
  type: noirAbiTypeSchema,
});

const noirAbiParameterVisibilitySchema = z.union([z.literal('databus'), z.literal('private'), z.literal('public')]);

const noirFunctionVisibilitySchema = z.union([z.literal('Secret'), z.literal('Open'), z.literal('Unconstrained')]);

const noirContractCompilationArtifactSchema = z.object({
  name: z.string(),
  noir_version: z.string(),
  functions: z.array(
    z.object({
      name: z.string(),
      function_type: noirFunctionVisibilitySchema,
      is_internal: z.boolean(),
      debug_symbols: z.string().optional(),
      abi: z.object({
        parameters: z.array(
          z.object({
            name: z.string(),
            type: noirAbiTypeSchema,
            visibility: noirAbiParameterVisibilitySchema,
          }),
        ),
        param_witnesses: z.object({
          input: z.array(
            z.object({
              start: z.number(),
              end: z.number(),
            }),
          ),
        }),
        return_type: z
          .object({
            abi_type: noirAbiTypeSchema,
            visibility: z.string(),
          })
          .optional(),
        return_witnesses: z.array(z.number()),
      }),
      bytecode: z.string(),
      proving_key: z.string(),
      verification_key: z.string(),
    }),
  ),
  events: z.array(
    z.object({
      name: z.string(),
      path: z.string(),
      fields: z.array(noirAbiVariableSchema),
    }),
  ),
  warnings: z.array(z.any()).optional(),
  file_map: z.record(z.number(), z.object({ source: z.string(), path: z.string() })).optional()
});

/** Contract compilation artifact as outputted by Nargo */
export type NoirContractCompilationArtifact = z.infer<typeof noirContractCompilationArtifactSchema>;

/** Parses any object into a noir contract compilation artifact, throwing on validation error. */
export function parseNoirContractCompilationArtifact(artifact: any): NoirContractCompilationArtifact {
  return noirContractCompilationArtifactSchema.parse(artifact);
}