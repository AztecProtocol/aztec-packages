import { css } from '@mui/styled-engine';
import { FunctionType } from '@aztec/aztec.js';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Input from '@mui/material/Input';
import SearchIcon from '@mui/icons-material/Search';
import Tooltip from '@mui/material/Tooltip';

const searchContainer = css({
  width: '361px',
  height: '36px',
  background: 'rgba(250, 250, 250, 0.93)',
  borderRadius: '6px',
  display: 'flex',
  alignItems: 'center',
  padding: '8px',
  marginBottom: '15px',
});

const filterContainer = css({
  display: 'flex',
  flexDirection: 'row',
  gap: '7px',
  marginBottom: '25px',
});

const filterButton = css({
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '6px 5px',
  gap: '11px',
  height: '36px',
  background: '#CDD1D5',
  borderRadius: '6px',
  cursor: 'pointer',
  position: 'relative',
});

const filterCheckbox = css({
  width: '24px',
  height: '24px',
  background: '#CDD1D5',
  border: '2px solid rgba(255, 255, 255, 0.2)',
  borderRadius: '6px',
  marginLeft: '5px',
});

const filterLabel = css({
  fontFamily: 'Inter, sans-serif',
  fontStyle: 'normal',
  fontWeight: 500,
  fontSize: '16px',
  lineHeight: '19px',
  textAlign: 'center',
  color: '#000000',
});

interface ContractFilterProps {
  filters: {
    searchTerm: string;
    private: boolean;
    public: boolean;
    utility: boolean;
  };
  onFilterChange: (filters: {
    searchTerm: string;
    private: boolean;
    public: boolean;
    utility: boolean;
  }) => void;
}

export function ContractFilter({ filters, onFilterChange }: ContractFilterProps) {
  return (
    <>
      <div css={searchContainer}>
        <SearchIcon style={{ color: 'rgba(60, 60, 67, 0.6)', marginRight: '8px' }} />
        <Input
          type="text"
          fullWidth
          disableUnderline
          placeholder="Search"
          value={filters.searchTerm}
          onChange={e => onFilterChange({ ...filters, searchTerm: e.target.value })}
          style={{
            fontFamily: 'SF Pro Text, sans-serif',
            fontSize: '17px',
            color: 'rgba(60, 60, 67, 0.6)'
          }}
        />
      </div>
      <div css={filterContainer}>
        <Tooltip
          title="These functions are simulated locally and only proofs are sent to Aztec"
          arrow
          componentsProps={{
            tooltip: {
              sx: {
                fontSize: '14px',
                padding: '10px',
                maxWidth: '300px',
                lineHeight: '1.4'
              }
            }
          }}
        >
          <div css={filterButton}>
            <FormControlLabel
              control={
                <Checkbox
                  css={filterCheckbox}
                  checked={filters.private}
                  onChange={e => onFilterChange({ ...filters, private: e.target.checked })}
                />
              }
              label={<span css={filterLabel}>Private</span>}
            />
          </div>
        </Tooltip>
        <Tooltip
          title="These are public functions that work similarly to other blockchains"
          arrow
          componentsProps={{
            tooltip: {
              sx: {
                fontSize: '14px',
                padding: '10px',
                maxWidth: '300px',
                lineHeight: '1.4'
              }
            }
          }}
        >
          <div css={filterButton}>
            <FormControlLabel
              control={
                <Checkbox
                  css={filterCheckbox}
                  checked={filters.public}
                  onChange={e => onFilterChange({ ...filters, public: e.target.checked })}
                />
              }
              label={<span css={filterLabel}>Public</span>}
            />
          </div>
        </Tooltip>
        <Tooltip
          title="Only invoked by applications that interact with contracts to perform state queries from an off-chain client. They are unconstrained, meaning no proofs are generated"
          arrow
          componentsProps={{
            tooltip: {
              sx: {
                fontSize: '14px',
                padding: '10px',
                maxWidth: '350px',
                lineHeight: '1.4'
              }
            }
          }}
        >
          <div css={filterButton}>
            <FormControlLabel
              control={
                <Checkbox
                  css={filterCheckbox}
                  checked={filters.utility}
                  onChange={e => onFilterChange({ ...filters, utility: e.target.checked })}
                />
              }
              label={<span css={filterLabel}>Utility</span>}
            />
          </div>
        </Tooltip>
      </div>
    </>
  );
}
