import type { Metadata } from 'next';
import DeviceCheckoutForm, { type CheckoutConfig } from '@/components/DeviceCheckoutForm';
import { DEV_ICONS, SIGNER_ICONS, DETAIL_ICONS } from '@/lib/deviceIcons';

export const metadata: Metadata = { title: { absolute: 'Employee Check-in / Check-out — Device Management' } };

const config: CheckoutConfig = {
  kind: 'employee',
  roles: ['it', 'admin'],
  backHref: '/employee-checkinout-hub',
  backLabel: 'Back to Employee Check-in / Check-out',
  headerIcon: DETAIL_ICONS.briefcase,
  headerTitle: 'Employee Device Check-in / Check-out',
  detailsIcon: DETAIL_ICONS.briefcase,
  detailsTitle: 'Employee details',
  companyLabel: 'Company',
  formTypeByOp: { 'Check-in': 'employee_checkin', 'Check-out': 'employee_checkout' },
  devices: [
    { name: 'MacBook', icon: DEV_ICONS.macbook },
    { name: 'MacBook Charger', icon: DEV_ICONS.charger },
    { name: 'MacBook Cable', icon: DEV_ICONS.cable },
    { name: 'iPad', icon: DEV_ICONS.ipad },
    { name: 'iPad Charger', icon: DEV_ICONS.charger },
    { name: 'iPad Cable', icon: DEV_ICONS.cable },
    { name: 'Accessories', icon: DEV_ICONS.accessories },
    { name: 'Monitor', icon: DEV_ICONS.monitor },
  ],
  needsId: ['MacBook', 'iPad', 'Accessories', 'Monitor'],
  needsPhotos: ['MacBook', 'iPad', 'Monitor'],
  signers: [
    { label: 'Assignee', icon: SIGNER_ICONS.assignee },
    { label: 'IT Support', icon: SIGNER_ICONS.itSupport },
  ],
  signerCols: 2,
  hasQR: false,
  hasParents: false,
};

export default function Page() {
  return <DeviceCheckoutForm config={config} />;
}
