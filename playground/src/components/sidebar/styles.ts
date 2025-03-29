import { css } from '@mui/styled-engine';

export const container = css({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  width: '100%',
  backgroundColor: 'var(--mui-palette-primary-light)',
  overflow: 'hidden',
  padding: '0 0.5rem',
  textAlign: 'center',
});

export const select = css({
  display: 'flex',
  flexDirection: 'row',
  width: '100%',
  margin: '0.5rem 0rem',
});

export const header = css({
  display: 'flex',
  flexDirection: 'row',
  height: '5rem',
  width: '100%',
  alignItems: 'center',
  marginBottom: '1rem',
});

export const buttonContainer = css({
  marginTop: '1rem',
  width: '100%',
});

export const sectionHeader = css({
  marginTop: '1.5rem',
});

export const nestedContainer = css({
  marginTop: '1.5rem', 
  transition: 'opacity 0.3s ease',
}); 