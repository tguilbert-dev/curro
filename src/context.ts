import { createContext, useContext } from 'react';
import type { ISODate } from './lib/dates';
import type { Run, Settings, StoredPlan } from './types';

export interface AppState {
  settings: Settings;
  today: ISODate;
  runs: Run[];
  /** undefined while loading, null when no plan is active. */
  plan: StoredPlan | null | undefined;
  openRunForm: (opts: { date?: ISODate; run?: Run }) => void;
  openDay: (date: ISODate) => void;
  goTo: (tab: Tab) => void;
}

export type Tab = 'today' | 'calendar' | 'progress' | 'cross' | 'plan' | 'settings';

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppContext');
  return ctx;
}
