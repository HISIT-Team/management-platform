import type { Metadata } from 'next';
import DeviceCheckoutForm, { type CheckoutConfig } from '@/components/DeviceCheckoutForm';
import { DEV_ICONS, SIGNER_ICONS, DETAIL_ICONS } from '@/lib/deviceIcons';

export const metadata: Metadata = { title: { absolute: 'Student Check-in / Check-out — Device Management' } };

const config: CheckoutConfig = {
  kind: 'student',
  roles: ['it', 'admin'],
  backHref: '/student-checkinout-hub',
  backLabel: 'Back to Student Check-in / Check-out',
  headerIcon: DETAIL_ICONS.boxStudent,
  headerTitle: 'Student Device Check-in / Check-out',
  detailsIcon: DETAIL_ICONS.student,
  detailsTitle: 'Student details',
  companyLabel: 'School',
  formTypeByOp: { 'Check-in': 'student_checkin', 'Check-out': 'student_checkout' },
  devices: [
    { name: 'MacBook', icon: DEV_ICONS.macbook },
    { name: 'MacBook Charger', icon: DEV_ICONS.charger },
    { name: 'MacBook Cable', icon: DEV_ICONS.cable },
    { name: 'iPad', icon: DEV_ICONS.ipad },
    { name: 'iPad Charger', icon: DEV_ICONS.charger },
    { name: 'iPad Cable', icon: DEV_ICONS.cable },
    { name: 'Accessories', icon: DEV_ICONS.accessories },
  ],
  needsId: ['MacBook', 'iPad', 'Accessories'],
  needsPhotos: ['MacBook', 'iPad'],
  signers: [
    { label: 'Student', icon: SIGNER_ICONS.student },
    { label: 'Parent', icon: SIGNER_ICONS.parent },
    { label: 'IT Support', icon: SIGNER_ICONS.itSupport },
  ],
  signerCols: 3,
  hasQR: true,
  hasParents: true,
};

export default function Page() {
  return <DeviceCheckoutForm config={config} />;
}
