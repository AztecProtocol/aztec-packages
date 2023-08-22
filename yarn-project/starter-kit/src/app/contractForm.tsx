import { ContractAbi } from "@aztec/foundation/abi";
import { useFormik } from 'formik';
import * as Yup from 'yup';

/**
 * hacky schema to get through compiler issues
 */
type yupSchema = {
  [key: string]: any;
};


/**
 * Not working...
 * @param contractAbi - contract ABI JSON, parsed as a ContractAbi object
 * @returns a formik form for interacting with the contract
 */
// eslint-disable-next-line jsdoc/require-jsdoc
export default function DynamicContractForm({ contractAbi }: { contractAbi: ContractAbi }) {
    return (
        <div>
            <h1>{contractAbi.name + ' Noir Smart Contract'}</h1>
            {contractAbi.functions.map(func => {
                // Create validation schema for this function
                const validationSchema = Yup.object().shape(
                    func.parameters.reduce((acc: yupSchema, input) => {
                        acc[input.name] = Yup.string().required('Required').nonNullable();
                        return acc;
                    }, {})
                );

                const initialValues = func.parameters.reduce((acc: yupSchema, input) => {
                    acc[input.name] = '111';
                    return acc;
                }, {});

                const formik = useFormik({
                    initialValues: initialValues,
                    validationSchema: validationSchema,
                    onSubmit: values => {
                        // eslint-disable-next-line no-console
                        console.log(`Function ${func.name} called with:`, values);
                    },
                });

                return (
                    <div key={func.name} className="bg-black">
                        <h1>{func.name}</h1>
                        <form onSubmit={formik.handleSubmit}>
                            <div className="item-center px-24 flex">
                            {func.parameters.map(input => (
                                <div key={input.name}>
                                    <label htmlFor={input.name}>
                                        {input.name} ({input.type.kind})
                                    </label>
                                    <div className="grid w-full text-black items-center grid-cols-5">
                                    <input
                                        className="block w-full border-gray-300 rounded-md shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
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
                            <button type="submit">Call {func.name}</button>
                            </div>
                        </form>
                    </div>
                );
            })}
        </div>
    );
}