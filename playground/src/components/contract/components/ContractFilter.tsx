import { css } from '@mui/styled-engine';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import FindInPageIcon from '@mui/icons-material/FindInPage';
import Input from '@mui/material/Input';
import InputAdornment from '@mui/material/InputAdornment';
import FormGroup from '@mui/material/FormGroup';
import Tooltip from '@mui/material/Tooltip';

const search = css({
  display: 'flex',
  overflow: 'hidden',
  '@media (width <= 800px)': {
    width: '100%',
  },
  '@media (width > 800px)': {
    maxWidth: '500px',
  },
  marginBottom: '1rem',
});

const checkBoxLabel = css({
  height: '1.5rem',
  marginLeft: '-10px',
});

interface ContractFilterProps {
  filters: {
    searchTerm: string;
    private: boolean;
    public: boolean;
    utility: boolean;
  };
  onFilterChange: (filters: { searchTerm: string; private: boolean; public: boolean; utility: boolean }) => void;
}

export function ContractFilter({ filters, onFilterChange }: ContractFilterProps) {
  return (
    <div css={search}>
      <FormGroup sx={{ width: '100%' }}>
        <Input
          type="text"
          fullWidth
          placeholder="Search function"
          value={filters.searchTerm}
          onChange={e => onFilterChange({ ...filters, searchTerm: e.target.value })}
          endAdornment={
            <InputAdornment position="end">
              <FindInPageIcon />
            </InputAdornment>
          }
        />
        <div
          css={{
            display: 'flex',
            flexDirection: 'row',
            marginTop: '0.5rem',
            width: '100%',
          }}
        >
          <Tooltip
            title="Function signature and execution are kept private by executing locally and generating a zk proof of correct execution. The proof is sent to Aztec."
            arrow
            slotProps={{
              tooltip: {
                sx: {
                  fontSize: '14px',
                  padding: '10px',
                  maxWidth: '300px',
                  lineHeight: '1.4',
                },
              },
            }}
          >
            <FormControlLabel
              css={checkBoxLabel}
              control={
                <Checkbox
                  sx={{ paddingRight: 0 }}
                  checked={filters.private}
                  onChange={e => onFilterChange({ ...filters, private: e.target.checked })}
                />
              }
              label="Private"
            />
          </Tooltip>

          <Tooltip
            title="These are public functions that work similarly to other blockchains"
            arrow
            slotProps={{
              tooltip: {
                sx: {
                  fontSize: '14px',
                  padding: '10px',
                  maxWidth: '300px',
                  lineHeight: '1.4',
                },
              },
            }}
          >
            <FormControlLabel
              css={checkBoxLabel}
              control={
                <Checkbox
                  sx={{ padding: 0 }}
                  checked={filters.public}
                  onChange={e => onFilterChange({ ...filters, public: e.target.checked })}
                />
              }
              label="Public"
            />
          </Tooltip>

          <Tooltip
            title="These are off-chain getters (for you to query the state) without generating any proofs. They are unconstrained, so no proof is generated and data is fetched locally."
            arrow
            slotProps={{
              tooltip: {
                sx: {
                  fontSize: '14px',
                  padding: '10px',
                  maxWidth: '350px',
                  lineHeight: '1.4',
                },
              },
            }}
          >
            <FormControlLabel
              css={checkBoxLabel}
              control={
                <Checkbox
                  sx={{ padding: 0 }}
                  checked={filters.utility}
                  onChange={e =>
                    onFilterChange({
                      ...filters,
                      utility: e.target.checked,
                    })
                  }
                />
              }
              label="Utility"
            />
          </Tooltip>
        </div>
      </FormGroup>
    </div>
  );
}
