import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppContext, type AppState, type Tab } from './context';
import { requestPersistentStorage, THEME_KEY, useActivePlan, useRuns, useSettings } from './db';
import { DayDetail } from './components/DayDetail';
import { RunForm } from './components/RunForm';
import { UpdateBanner } from './components/UpdateBanner';
import { Icon } from './components/ui';
import { mergeDuplicateActivities } from './lib/activities';
import { setWeekStart, today as todayISO, type ISODate } from './lib/dates';
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

let staleModalChecked = false;

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
    mergeDuplicateActivities().catch(() => {});
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const theme = settings?.theme;
  useEffect(() => {
    if (!theme) return;
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore: see saveSetting
    }
  }, [theme]);

  // An open dialog gets its own history entry, so the phone's Back button closes the dialog
  // instead of switching tabs underneath it. Closing it any other way removes that entry.
  const modalOpen = runForm != null || day != null;
  const modalEntry = useRef(false);
  useEffect(() => {
    if (modalOpen && !modalEntry.current) {
      history.pushState({ curroModal: true }, '');
      modalEntry.current = true;
    } else if (!modalOpen && modalEntry.current) {
      modalEntry.current = false;
      history.back();
    }
  }, [modalOpen]);
  useEffect(() => {
    // Reloaded while a dialog was open: that dialog's history entry is left behind, so the
    // first Back press would appear to do nothing. Step back past it.
    if (!staleModalChecked && (history.state as { curroModal?: boolean } | null)?.curroModal) history.back();
    staleModalChecked = true; // once per page load (dev mode runs effects twice)
    const onPop = () => {
      if (!modalEntry.current) return;
      modalEntry.current = false;
      setRunForm(null);
      setDay(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const goTo = useCallback((t: Tab) => {
    if (modalEntry.current) {
      // Navigating from inside a dialog: close it and reuse its history entry for the tab.
      modalEntry.current = false;
      setRunForm(null);
      setDay(null);
      history.replaceState(null, '', `#/${t}`);
      setTab(t);
    } else {
      location.hash = `#/${t}`;
    }
    window.scrollTo(0, 0);
  }, []);

  const openRunForm = useCallback((opts: { date?: ISODate; run?: Run }) => {
    setDay(null);
    setRunForm(opts);
  }, []);

  const state: AppState | null = useMemo(
    () => (settings && runs && plan !== undefined ? { settings, today, runs, plan, openRunForm, openDay: setDay, goTo } : null),
    [settings, today, runs, plan, openRunForm, goTo],
  );

  // Loading takes a few milliseconds; render nothing rather than flash default units and empty data.
  if (!state) return null;
  // Applied during render so every view computes weeks with the current setting.
  setWeekStart(state.settings.weekStart);

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
        <UpdateBanner />
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
