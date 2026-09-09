import type { Metadata } from 'next';
import TaskManagerClient from './TaskManagerClient';

export const metadata: Metadata = { title: { absolute: 'Task Manager — IT' } };

export default function Page() {
  return <TaskManagerClient />;
}
