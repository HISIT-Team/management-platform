import type { Metadata } from 'next';
import DeviceDraftsClient from './DeviceDraftsClient';

export const metadata: Metadata = { title: { absolute: 'Bozze consegne — IT' } };

export default function Page() {
  return <DeviceDraftsClient />;
}
