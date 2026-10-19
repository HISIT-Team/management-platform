import type { Metadata } from 'next';
import LostAccessoriesClient from './LostAccessoriesClient';

export const metadata: Metadata = { title: { absolute: 'Accessori smarriti — IT' } };

export default function Page() {
  return <LostAccessoriesClient />;
}
