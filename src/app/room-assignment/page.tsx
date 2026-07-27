import type { Metadata } from 'next';
import RoomAssignmentClient from './RoomAssignmentClient';

export const metadata: Metadata = { title: { absolute: 'Room Assignment' } };

export default function Page() {
  return <RoomAssignmentClient />;
}
