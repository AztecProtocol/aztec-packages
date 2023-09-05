import { AztecAddress, CompleteAddress, Fr } from '@aztec/aztec.js';
import { ContractAbi, FunctionAbi } from '@aztec/foundation/abi';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { rpcClient } from '../config.js';
import { callContractFunction, deployContract, viewContractFunction } from '../scripts/index.js';
import { Button } from './components/index.js';

// hack: add `any` at the end to get the array schema to typecheck
type NoirFunctionYupSchema = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: Yup.NumberSchema | Yup.ArraySchema<number[], object> | Yup.BooleanSchema | any;
};

type NoirFunctionFormValues = {
  [key: string]: string | number | number[] | boolean;
};

function generateYupSchema(functionAbi: FunctionAbi) {
  const parameterSchema: NoirFunctionYupSchema = {};
  const initialValues: NoirFunctionFormValues = {};
  for (const param of functionAbi.parameters) {
      if (param.name === 'owner'){
          // ALICE public key
        parameterSchema[param.name] = Yup.string().required();
          initialValues[param.name] = '0x2e13f0201905944184fc2c09d29fcf0cac07647be171656a275f63d99b819360';
          continue;
      }
    // set some super crude default values
    switch (param.type.kind) {
      case 'field':
        // todo: make these hex strings instead, because they are bigints
        // and yup doesn't support bigint
        parameterSchema[param.name] = Yup.number().required();
        initialValues[param.name] = 1000000;
        break;
      case 'array':
        // eslint-disable-next-line no-case-declarations
        const arrayLength = param.type.length;
        parameterSchema[param.name] = Yup.array().of(Yup.number()).min(arrayLength).max(arrayLength);
        initialValues[param.name] = Array(arrayLength).fill(200);
        break;
      case 'boolean':
        parameterSchema[param.name] = Yup.boolean().required();
        initialValues[param.name] = false;
        break;
    }
  }

  return { validationSchema: Yup.object().shape(parameterSchema), initialValues };
}

async function handleFunctionCall(
  contractAddress: AztecAddress | undefined,
  contractAbi: ContractAbi,
  functionName: string,
  args: any,
  wallet?: CompleteAddress,
) {
  if (functionName === 'constructor' && !!wallet) {
    const salt = Fr.ZERO;
    return await deployContract(wallet, contractAbi, args, salt, rpcClient);
  }

  const functionAbi = contractAbi.functions.find(f => f.name === functionName)!;
  if (functionAbi.functionType === 'unconstrained') {
    return await viewContractFunction(contractAddress!, contractAbi, functionName, args, rpcClient);
  } else {
    return await callContractFunction(contractAddress!, contractAbi, functionName, args, rpcClient);
  }
}

interface ContractFunctionFormProps {
  wallet?: CompleteAddress;
  contractAddress?: AztecAddress;
  contractAbi: ContractAbi;
  functionAbi: FunctionAbi;
  title?: string;
  buttonText?: string;
  isLoading: boolean;
  disabled: boolean;
  onSubmit: () => void;
  onSuccess: (result: any) => void;
  onError: (msg: string) => void;
}

export function ContractFunctionForm({
  wallet,
  contractAddress,
  contractAbi,
  functionAbi,
  title,
  buttonText = 'Submit',
  isLoading,
  disabled,
  onSubmit,
  onSuccess,
  onError,
}: ContractFunctionFormProps) {
  const { validationSchema, initialValues } = generateYupSchema(functionAbi);
  const formik = useFormik({
    initialValues: initialValues,
    validationSchema: validationSchema,
    onSubmit: async (values: any) => {
      onSubmit();
      try {
        const result = await handleFunctionCall(contractAddress, contractAbi, functionAbi.name, values, wallet);
        onSuccess(result);
      } catch (e: any) {
        onError(e.message);
      }
    },
  });

  return (
    <div className="rounded-sm py-8">
      <h2 className="py-4 text-lg">{title || `${functionAbi.name} (${functionAbi.functionType})`}</h2>
      <form onSubmit={formik.handleSubmit} className="flex justify-between items-end py-4">
        <div className="flex flex-wrap justify-start">
          {functionAbi.parameters.map(input => (
            <div key={input.name} className="inline-block text-left p-1">
              <label htmlFor={input.name} className="block p-1">
                {input.name} ({input.type.kind})
              </label>
              <div className="block p-1">
                <input
                  className="border-gray-300 rounded-md shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 p-2"
                  id={input.name}
                  name={input.name}
                  type="text"
                  onChange={formik.handleChange}
                  value={formik.values[input.name]}
                />
              </div>
              {formik.touched[input.name] && formik.errors[input.name] && (
                <div>{formik.errors[input.name]?.toString()}</div>
              )}
            </div>
          ))}
        </div>
        <div className="p-2">
          <Button isLoading={isLoading} disabled={disabled}>
            {buttonText}
          </Button>
        </div>
      </form>
    </div>
  );
}
