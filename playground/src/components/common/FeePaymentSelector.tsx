import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import FormControl from '@mui/material/FormControl';
import { CircularProgress, MenuItem } from '@mui/material';
import { useContext, useEffect, useState } from 'react';
import Typography from '@mui/material/Typography';
import { type FeePaymentMethod } from '@aztec/aztec.js';
import { AztecContext } from '../../aztecContext';
import { progressIndicator, select } from '../../styles/common';
import { INFO_TEXT } from '../../constants';
import { InfoText } from './InfoText';
import { prepareForFeePayment } from '../../utils/sponsoredFPC';

const FeePaymentMethods = ['sponsored_fpc', 'private_fpc', 'public_fpc', 'none', 'bridged_fee_juice'] as const;
type FeePaymentMethodType = (typeof FeePaymentMethods)[number];

interface FeePaymentSelectorProps {
  setFeePaymentMethod: (method: FeePaymentMethod) => void;
}

export function FeePaymentSelector({ setFeePaymentMethod }: FeePaymentSelectorProps) {
  const { network, wallet, embeddedWalletSelected } = useContext(AztecContext);

  const [isMethodChanging, setIsMethodChanging] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<FeePaymentMethodType | undefined>(
    network.hasSponsoredFPC ? 'sponsored_fpc' : 'none',
  );

  useEffect(() => {
    handleMethodChange(selectedMethod);
  }, []);

  const handleMethodChange = async (method: FeePaymentMethodType) => {
    setIsMethodChanging(true);
    setSelectedMethod(method);
    switch (method) {
      case 'sponsored_fpc': {
        const feePaymentMethod = await prepareForFeePayment(
          wallet,
          network.sponsoredFPC?.address,
          network.sponsoredFPC?.version,
        );
        setFeePaymentMethod(feePaymentMethod);
        break;
      }
      default: {
        setFeePaymentMethod(undefined);
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
          size="small"
        >
          {network.hasSponsoredFPC && <MenuItem value="sponsored_fpc">Sponsored Fee Paying Contract</MenuItem>}
          {wallet && embeddedWalletSelected && <MenuItem value="none">Fee Juice</MenuItem>}
        </Select>
      </FormControl>
      {isMethodChanging && (
        <div css={progressIndicator}>
          <Typography variant="body2" sx={{ mr: 1 }}>
            Loading fee payment method...
          </Typography>
          <CircularProgress size={20} />
        </div>
      )}
      <InfoText>{INFO_TEXT.FEE_ABSTRACTION}</InfoText>
    </div>
  );
}
