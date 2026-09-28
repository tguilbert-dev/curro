import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppContext, type AppState, type Tab } from './context';
import { requestPersistentStorage, useActivePlan, useRuns, useSettings } from './db';
import { DayDetail } from './components/DayDetail';
import { RunForm } from './components/RunForm';
import { Icon } from './components/ui';
import { today as todayISO, type ISODate } from './lib/dates';
import type { Run } from './types';
import { ActivitiesView } from './views/ActivitiesView';
import { CalendarView } from './views/CalendarView';
import { PlanView } from './views/PlanView';
import { ProgressView } from './views/ProgressView';
import { SettingsView } from './views/SettingsView';
import { TodayView } from './views/TodayView';

const TABS: { id: Tab; label: string; icon: Parameters<typeof Icon>[0]['name'] }[] = [
  { id: 'today', label: 'Today', icon: 'today' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'progress', label: 'Progress', icon: 'progress' },
  { id: 'cross', label: 'Cross', icon: 'cross' },
  { id: 'plan', label: 'Plan', icon: 'plan' },
];
const ALL_TABS: Tab[] = ['today', 'calendar', 'progress', 'cross', 'plan', 'settings'];

function tabFromHash(): Tab {
  const h = location.hash.replace('#/', '') as Tab;
  return ALL_TABS.includes(h) ? h : 'today';
}

/** Today's date, refreshed when the app comes back to the foreground or the day rolls over. */
function useToday(): ISODate {
  const [today, setToday] = useState(todayISO());
  useEffect(() => {
    const tick = () => setToday(todayISO());
    const id = setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);
  return today;
}

export function App() {
  const settings = useSettings();
  const runs = useRuns();
  const plan = useActivePlan();
  const today = useToday();
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [runForm, setRunForm] = useState<{ date?: ISODate; run?: Run } | null>(null);
  const [day, setDay] = useState<ISODate | null>(null);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    requestPersistentStorage();
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  const goTo = useCallback((t: Tab) => {
    location.hash = `#/${t}`;
    window.scrollTo(0, 0);
  }, []);

  const openRunForm = useCallback((opts: { date?: ISODate; run?: Run }) => {
    setDay(null);
    setRunForm(opts);
  }, []);

  const state: AppState = useMemo(
    () => ({ settings, today, runs, plan, openRunForm, openDay: setDay, goTo }),
    [settings, today, runs, plan, openRunForm, goTo],
  );

  return (
    <AppContext.Provider value={state}>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <img src="./icon.svg" alt="" />
            Curro
          </div>
          <button className="btn ghost icon" aria-label="Settings" aria-current={tab === 'settings' ? 'page' : undefined} onClick={() => goTo('settings')} style={{ width: 44 }}>
            <Icon name="settings" />
          </button>
        </header>
        <nav className="tabbar" aria-label="Main">
          {TABS.map((t) => (
            <button key={t.id} aria-current={tab === t.id ? 'page' : undefined} onClick={() => goTo(t.id)}>
              <Icon name={t.icon} />
              {t.label}
            </button>
          ))}
        </nav>
        <main>
          {tab === 'today' && <TodayView />}
          {tab === 'calendar' && <CalendarView />}
          {tab === 'progress' && <ProgressView />}
          {tab === 'cross' && <ActivitiesView />}
          {tab === 'plan' && <PlanView />}
          {tab === 'settings' && <SettingsView />}
        </main>
        {(tab === 'today' || tab === 'calendar' || tab === 'progress') && (
          <button className="fab" onClick={() => openRunForm({})}>
            + Log run
          </button>
        )}
        {runForm && <RunForm {...runForm} onClose={() => setRunForm(null)} />}
        {day && <DayDetail date={day} onClose={() => setDay(null)} />}
      </div>
    </AppContext.Provider>
  );
}
