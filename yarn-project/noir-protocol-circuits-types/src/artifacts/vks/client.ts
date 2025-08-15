import type { VerificationKeyData } from '@aztec/stdlib/vks';

import HidingKernelToPublicVkJson from '../../../artifacts/keys/hiding_kernel_to_public.vk.data.json' with { type: 'json' };
import HidingKernelToRollupVkJson from '../../../artifacts/keys/hiding_kernel_to_rollup.vk.data.json' with { type: 'json' };
import PrivateKernelInitVkJson from '../../../artifacts/keys/private_kernel_init.vk.data.json' with { type: 'json' };
import PrivateKernelInnerVkJson from '../../../artifacts/keys/private_kernel_inner.vk.data.json' with { type: 'json' };
import PrivateKernelTailVkJson from '../../../artifacts/keys/private_kernel_tail.vk.data.json' with { type: 'json' };
import PrivateKernelTailToPublicVkJson from '../../../artifacts/keys/private_kernel_tail_to_public.vk.data.json' with { type: 'json' };
import { PrivateKernelResetVks } from '../../private_kernel_reset_vks.js';
import { abiToVKData } from '../../utils/vk_json.js';
import type { ClientProtocolArtifact } from '../types.js';

export const ClientCircuitVks: Record<ClientProtocolArtifact, VerificationKeyData> = {
  PrivateKernelInitArtifact: abiToVKData(PrivateKernelInitVkJson),
  PrivateKernelInnerArtifact: abiToVKData(PrivateKernelInnerVkJson),
  PrivateKernelTailArtifact: abiToVKData(PrivateKernelTailVkJson),
  PrivateKernelTailToPublicArtifact: abiToVKData(PrivateKernelTailToPublicVkJson),
  HidingKernelToRollup: abiToVKData(HidingKernelToRollupVkJson),
  HidingKernelToPublic: abiToVKData(HidingKernelToPublicVkJson),
  ...PrivateKernelResetVks,
};
