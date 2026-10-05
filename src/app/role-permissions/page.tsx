import type { Metadata } from 'next';
import RolePermissionsClient from './RolePermissionsClient';

export const metadata: Metadata = { title: { absolute: 'Permessi ruoli — Backend' } };

export default function Page() {
  return <RolePermissionsClient />;
}
