import { Box, useMediaQuery } from '@mui/material';
import logoLight from '../assets/logo_light.svg';
import logoLightMobile from '../assets/logo_light_mobile.svg';
import { colors } from '../global.styles';

interface AztecLogoProps {
  height?: number;
}

export function AztecLogo({ height = 48 }: AztecLogoProps) {
  const isMobile = useMediaQuery('(max-width: 900px)');

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: isMobile ? '0.5rem' : '1rem',
        height: `${height}px`,
      }}
    >
      {/* AZTEC Logo Image - use mobile version on small screens */}
      <Box
        component="img"
        src={isMobile ? logoLightMobile : logoLight}
        alt="Aztec"
        sx={{
          height: `${height}px`,
          width: 'auto',
        }}
      />

      {/* PLAYGROUND in Workbench */}

      <Box
        component="span"
        sx={{
          fontFamily: 'Workbench, monospace',
          fontWeight: 400,
          fontStyle: 'normal',
          color: colors.secondary.light,
          letterSpacing: '0.05em',
          fontSize: `${height * 0.6}px`,
          marginTop: `${height * 0.15}px`,
        }}
      >
        PLAYGROUND
      </Box>
    </Box>
  );
}
