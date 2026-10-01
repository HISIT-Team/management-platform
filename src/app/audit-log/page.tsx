import type { Metadata } from 'next';
import AuditLogClient from './AuditLogClient';

export const metadata: Metadata = { title: { absolute: 'Registro attività — Backend' } };

export default function Page() {
  return <AuditLogClient />;
}
