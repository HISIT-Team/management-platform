import { Suspense } from 'react';
import ManagedBudgetClient from '../ManagedBudgetClient';
export default function Page() { return <Suspense fallback={null}><ManagedBudgetClient /></Suspense>; }
