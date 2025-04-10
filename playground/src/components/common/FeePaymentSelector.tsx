import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import FormControl from '@mui/material/FormControl';
import { CircularProgress, MenuItem } from '@mui/material';
import { useContext, useEffect, useState } from 'react';
import type { FeePaymentMethod } from '@aztec/aztec.js';
import { AztecContext } from '../../aztecEnv';
import { select } from '../../styles/common';

const FeePaymentMethods = ['sponsored_fpc', 'private_fpc', 'public_fpc', 'fee_juice', 'bridged_fee_juice'] as const;
type FeePaymentMethodType = (typeof FeePaymentMethods)[number];

interface FeePaymentSelectorProps {
  setFeePaymentMethod: (method: FeePaymentMethod) => void;
}

export function FeePaymentSelector({ setFeePaymentMethod }: FeePaymentSelectorProps) {
  const { pxe } = useContext(AztecContext);

  const [isMethodChanging, setIsMethodChanging] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<FeePaymentMethodType | undefined>('sponsored_fpc');

  useEffect(() => {
    handleMethodChange(selectedMethod);
  }, []);

  const handleMethodChange = async (method: FeePaymentMethodType) => {
    setIsMethodChanging(true);
    setSelectedMethod(method);
    switch (method) {
      case 'sponsored_fpc': {
        const { prepareForFeePayment } = await import('../../utils/fees/sponsored_fpc');
        const feePaymentMethod = await prepareForFeePayment(pxe);
        setFeePaymentMethod(feePaymentMethod);
        break;
      }
      default: {
        throw new Error('Unimplemented fee payment method');
      }
    }
    setIsMethodChanging(false);
  };

  return (
    <div>
      <FormControl css={select}>
        <InputLabel>Fee Payment Methods</InputLabel>
        <Select
          value={selectedMethod ?? ''}
          label="Fee Payment Methods"
          onChange={event => handleMethodChange(event.target.value as FeePaymentMethodType)}
          fullWidth
          disabled={isMethodChanging}
        >
          <MenuItem value="sponsored_fpc">Sponsored Fee Paying Contract</MenuItem>
        </Select>
      </FormControl>
      {isMethodChanging && (
        <div style={{ display: 'flex', alignItems: 'center', marginLeft: '0.5rem' }}>
          <CircularProgress size={20} />
        </div>
      )}
    </div>
  );
}
