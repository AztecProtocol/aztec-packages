import { FunctionAbi, encodeArguments } from '@aztec/foundation/abi';
// hack: addresses are stored as string in the form to avoid bigint compatibility issues with formik
// convert those back to bigints before sending
export function convertArgs(functionAbi: FunctionAbi, args: any, encode: boolean = true) {
  const untypedArgs = functionAbi.parameters.map(param => {
    // param => args[param.name],
    switch (param.type.kind) {
      case 'field':
        return BigInt(args[param.name]);
      default:
        console.log('not converting argument', param.name, param.type.kind, args[param.name]);
        return args[param.name];
    }
  });
  if (!encode) {
    return untypedArgs;
  }
  const typedArgs = encodeArguments(functionAbi, untypedArgs);
  return typedArgs;
}
