import type { Metadata } from 'next';
import UserManagementClient from './UserManagementClient';

export const metadata: Metadata = { title: { absolute: 'Gestione Utenti — Backend' } };

export default function Page() {
  return <UserManagementClient />;
}
