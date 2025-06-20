import { type ABIParameter, type AbiType, AztecAddress, isAddressStruct } from '@aztec/aztec.js';
import { formatFrAsString, parseAliasedBuffersAsString } from '../../utils/conversion';
import { useContext, useState } from 'react';
import EditIcon from '@mui/icons-material/Edit';
import { AztecContext } from '../../aztecEnv';
import TextField from '@mui/material/TextField';
import { css } from '@mui/styled-engine';
import Autocomplete from '@mui/material/Autocomplete';
import CircularProgress from '@mui/material/CircularProgress';
import { capitalize } from '@mui/material/utils';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';


const container = css({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'flex-start',
  justifyContent: 'center',
  marginBottom: '1rem',
  width: '100%',
});

interface FunctionParameterProps {
  required?: boolean;
  parameter: ABIParameter;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onParameterChange: (value: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  defaultValue?: any;
}

export function FunctionParameter({ parameter, required, onParameterChange, defaultValue }: FunctionParameterProps) {
  const { walletDB } = useContext(AztecContext);

  const [manualInput, setManualInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [aliasedAddresses, setAliasedAddresses] = useState([]);
  // Controlled input value only for structs
  const [value, setValue] = useState(defaultValue);

  const handleParameterChange = (newValue: string, type: AbiType) => {
    switch (type.kind) {
      case 'field':
      case 'integer': {
        try {
          let bigintValue;
          if (newValue.startsWith('0x')) {
            bigintValue = BigInt(newValue);
          }
          else {
            bigintValue = BigInt(newValue);
          }
          setError('');
          onParameterChange('0x' + bigintValue.toString(16));
        } catch {
          setError(`Invalid input ${newValue}. Use numeric or hex values.`);
          onParameterChange(undefined);
        }
        break;
      }
      default: {
        onParameterChange(newValue);
        break;
      }
    }
  };

  const handleOpen = () => {
    const setAliases = async () => {
      setLoading(true);
      const accountAliases = await walletDB.listAliases('accounts');
      const contractAliases = await walletDB.listAliases('contracts');
      const senderAliases = await walletDB.listAliases('senders');
      setAliasedAddresses(parseAliasedBuffersAsString([...accountAliases, ...contractAliases, ...senderAliases]));
      setLoading(false);
    };
    if (walletDB) {
      setAliases();
    }
  };

  function getParameterLabel(type: AbiType) {
    switch (type.kind) {
      case 'field':
        return 'field/hex';
      case 'integer':
        return 'number/hex';
      case 'string':
        return 'string';
      case 'boolean':
        return 'bool';
      case 'struct':
        if (isAddressStruct(type)) {
          return 'address';
        }
        return 'struct';
      default:
        return '';
    }
  }

  // type can be 'field','boolean','integer','array','tuple','string','struct'

  if (isAddressStruct(parameter.type)) {
    const options = aliasedAddresses.map(alias => ({
      id: alias.value,
      label: `${alias.key} (${formatFrAsString(alias.value)})`,
    }))

    // Add zero address option
    const zeroAddress = AztecAddress.ZERO.toString();
    options.push({
      id: zeroAddress,
      label: formatFrAsString(zeroAddress),
    })

    return (
      <div css={container}>
        {!manualInput ? (
          <Autocomplete
            disablePortal
            key={parameter.name}
            options={options}
            onChange={(_, newValue) => {
              if (newValue) {
                handleParameterChange(newValue.id, parameter.type);
              }
            }}
            onOpen={handleOpen}
            loading={loading}
            fullWidth
            defaultValue={defaultValue}
            sx={{ width: '100%', minWidth: '226px' }}
            css={css}
            renderInput={params => (
              <TextField
                {...params}
                required={required}
                label={capitalize(parameter.name)}
                size='small'
                slotProps={{
                  input: {
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {loading ? <CircularProgress color="inherit" size={20} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  },
                }}
              />
            )}
          />
        ) : (
          <TextField
            required={required}
            fullWidth
            css={css}
            variant="outlined"
            defaultValue={defaultValue}
            size='small'
            type="text"
            label={`${capitalize(parameter.name)}  (${getParameterLabel(parameter.type)})`}
            onChange={e => {
              handleParameterChange(e.target.value, parameter.type);
            }}
          />
        )}
        <IconButton onClick={() => setManualInput(!manualInput)}>
          <EditIcon />
        </IconButton>
      </div>
    )
  }

  if (parameter.type.kind === 'struct') {
    return (
      <div css={container} style={{ flexDirection: 'column', width: '100%', marginBottom: '0' }}>
        <Typography variant="overline" style={{ marginBottom: '5px' }}>
          {parameter.name} (struct)
        </Typography>

        <div style={{ marginLeft: '1rem', width: 'calc(100% - 1rem)' }}>
          {parameter.type.fields.map((field) => (
            <FunctionParameter
              key={field.name}
              parameter={{ ...field, visibility: parameter.visibility }}
              required={required}
              onParameterChange={(nv) => {
                const newValues = Object.assign({}, value);
                newValues[field.name] = nv;
                setValue(newValues);
                onParameterChange(newValues);
              }}
              defaultValue={defaultValue?.[field.name]}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div css={container}>
      <TextField
        required={required}
        fullWidth
        css={css}
        variant="outlined"
        defaultValue={defaultValue}
        size='small'
        disabled={['array', 'tuple'].includes(parameter.type.kind)}
        key={parameter.name}
        type="text"
        label={`${capitalize(parameter.name)}  (${getParameterLabel(parameter.type)})`}
        helperText={error}
        error={!!error}
        onChange={e => {
          handleParameterChange(e.target.value, parameter.type);
        }}
      />
    </div>
  );
}
