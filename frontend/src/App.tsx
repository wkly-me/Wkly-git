import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { GoalsProvider } from '@context/GoalsContext';
import { TimezoneProvider } from '@context/TimezoneContext';
import ToastNotification, { notifySuccess, notifyError, notifyReminder } from '@components/ToastyNotification';
import { SessionContextProvider } from '@supabase/auth-helpers-react';
import supabase from '@lib/supabase';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import useAuth from '@hooks/useAuth';
import { useReminderService } from '@hooks/useReminderService';
import LandingPage from '@components/LandingPage';
import LoadingSpinner from '@components/LoadingSpinner';
import AppMuiThemeProvider from './mui/muiTheme';
import appColors from '@styles/appColors';
import { FocusTimerProvider } from '@components/focus/FocusTimerContext';
import { FocusModeProvider } from '@context/FocusModeContext';
import { FireworksProvider } from '@context/FireworksContext';
import { TierProvider } from '@context/TierContext';
const PrivacyPage = lazy(() => import('@components/Privacy'));
const TermsPage = lazy(() => import('@components/Terms'));
const CookieConsent = lazy(() => import('@components/CookieConsent'));


// Lazy-loaded authenticated routes — not downloaded until the user logs in
const AllGoals = lazy(() => import('@components/AllGoals'));
const HomePage = lazy(() => import('@components/HomePage'));
const Header = lazy(() => import('@components/Header'));
const AllSummaries = lazy(() => import('@components/AllSummaries'));
const ProfileManagement = lazy(() => import('@components/ProfileManagement'));
const NotificationsSettings = lazy(() => import('@components/NotificationsSettings'));
const MuiCompareDemo = lazy(() => import('@components/MuiCompareDemo'));
const AdminAccessRequests = lazy(() => import('@components/AdminAccessRequests'));
const Footer = lazy(() => import('@components/Footer'));
const PullToRefresh = lazy(() => import('@components/PullToRefresh'));
const PricingPage = lazy(() => import('@components/PricingPage'));
const AffirmationsLayout = lazy(() => import('@components/affirmations/AffirmationsLayout'));
const AffirmationToday = lazy(() => import('@components/affirmations/AffirmationToday'));
const AffirmationArchive = lazy(() => import('@components/affirmations/AffirmationArchive'));
const AffirmationSubmit = lazy(() => import('@components/affirmations/AffirmationSubmit'));
const AffirmationSaved = lazy(() => import('@components/affirmations/AffirmationSaved'));
const AffirmationSettings = lazy(() => import('@components/affirmations/AffirmationSettings'));
const OnboardingAssistant = lazy(() => import('@components/OnboardingAssistant'));
const WeeklyResetFlow = lazy(() => import('@components/weekly/WeeklyResetFlow'));
const WeeklyReflectionFlow = lazy(() => import('@components/weekly/WeeklyReflectionFlow'));
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Chip, Snackbar, IconButton } from '@mui/material';
import { shouldShowWeeklyReset, shouldShowWeeklyReflection } from '@hooks/useWeeklyFlows';
import { Bell, Calendar, FileText, MessageSquare, X as XIcon } from 'lucide-react';
import { useFeedbackNudge } from '@hooks/useFeedbackNudge';
import FeedbackDialog from '@components/FeedbackDialog';
import { loadSession, saveSession } from '@components/focus/useFocusSession';


if (import.meta.env.DEV) {
  (window as any).__notifyReminder = notifyReminder;
  (window as any).__notifyReminders = (count = 3) => {
    for (let i = 1; i <= count; i++) {
      notifyReminder(`Debug Task ${i}`, `This is test reminder #${i}`, () => console.log(`View Task ${i} clicked`));
    }
  };
}

const App: React.FC = () => {
  const { session, isLoading } = useAuth();
  // Allow E2E runs to bypass auth by passing ?test=1 or setting localStorage.WKLY_E2E_TEST = '1'
  const testing = typeof window !== 'undefined' && (window.location.search.includes('test=1') || typeof localStorage !== 'undefined' && localStorage.getItem('WKLY_E2E_TEST') === '1');
  const effectiveSession = testing ? {} : session;
  const navigate = useNavigate();
  const [theme, setTheme] = useState<'theme-dark' | 'theme-light'>(() => {
    // Prefer an explicit user preference saved in localStorage, then fall
    // back to dark theme as the default.
    const stored = typeof window !== 'undefined' ? localStorage.getItem('theme') : null;
    if (stored === 'theme-dark' || stored === 'theme-light') return stored;
    return 'theme-dark';
  });
  const [isOpen, /*setIsOpen*/] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showWeeklyReset, setShowWeeklyReset] = useState(false);
  const [showWeeklyReflection, setShowWeeklyReflection] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const { shouldNudge, dismissNudge } = useFeedbackNudge();

  // Refresh the Supabase session when the Android/iOS app comes back from background.
  // Without this, the 1-hour access token can expire while backgrounded and all
  // API calls return 401 until the user manually signs out and back in.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let listener: Awaited<ReturnType<typeof CapApp.addListener>> | null = null;
    CapApp.addListener('appStateChange', async ({ isActive }) => {
      if (!isActive) return;
      const { error } = await supabase.auth.refreshSession();
      if (error) {
        // Refresh token expired — sign out so the user is prompted to log in again
        await supabase.auth.signOut();
      }
    }).then(l => { listener = l; });
    return () => { listener?.remove(); };
  }, []);

  const toggleTheme = () => setTheme(prev => {
    const next = prev === 'theme-dark' ? 'theme-light' : 'theme-dark';
    // Apply the class synchronously so CSS variables are updated before React
    // re-renders the MUI theme provider (which reads CSS vars at render time).
    if (next === 'theme-dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    try { localStorage.setItem('theme', next); } catch {}
    return next;
  });

  // const handleToast = () => {
  //   notifySuccess('Action completed successfully!');
  //   notifyError('Something went wrong!');
  // };
  const handleLogout = async () => {
    try {
      if (!supabase) {
        console.error('Supabase client is not initialized');
        return;
      }

      // Clear all localStorage except theme preference
      const themePreference = localStorage.getItem('theme');
      
      // Clear localStorage (preserving only theme, not palette — reset to default on logout)
      localStorage.clear();
      if (themePreference) localStorage.setItem('theme', themePreference);

      // Reset brand colour to default
      appColors.applyPaletteToRoot('purple');

      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      notifySuccess('Logged out successfully');
      window.location.href = '/auth'; // Redirect to the auth route
    } catch (error) {
      notifyError('Error logging out.');
      console.error('Error logging out:', error);
    }
  };


  useEffect(() => {
    // Keep the DOM attributes & localStorage in sync with the app-level
    // theme so CSS variables and class-based styles update for both
    // Tailwind/class-based styling and the MUI theme provider.
    if (theme === 'theme-dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    try {
      document.documentElement.setAttribute('data-theme', theme);
    } catch (e) {
      // ignore
    }
    try {
      localStorage.setItem('theme', theme);
    } catch (e) {
      // ignore
    }
  }, [theme]);

  const current = theme;

  // Apply user preferred palette (if any) on mount and when profile changes
  const { profile } = useAuth();
  useEffect(() => {
    try {
      if (profile?.primary_color) {
        appColors.applyPaletteToRoot(profile.primary_color);
      } else {
        const stored = appColors.getStoredPalette();
        if (stored) {
          appColors.applyPaletteToRoot(stored);
        } else {
          // Ensure colors are always initialized, even on first load
          appColors.applyPaletteToRoot('purple');
        }
      }
    } catch (e) {
      // ignore
    }
  }, [profile]);

  // Show onboarding wizard for first-time users (no meaningful username set and
  // no completion flag in localStorage).
  useEffect(() => {
    if (testing || !profile || !session) return;
    try {
      const completed = localStorage.getItem('wkly_onboarding_complete');
      if (completed) return;
      const hasUsername = profile.username && !profile.username.includes('@');
      if (!hasUsername) {
        setShowOnboarding(true);
      }
    } catch { /* ignore */ }
  }, [profile, session, testing]);

  const handleOnboardingComplete = (createGoal: boolean) => {
    setShowOnboarding(false);
    if (createGoal) {
      navigate('/goals');
    }
  };

  // Trigger weekly flows only after session is ready and onboarding is done
  useEffect(() => {
    if (testing || !session) return;
    try {
      const onboardingDone = !!localStorage.getItem('wkly_onboarding_complete');
      if (!onboardingDone) return;
      setShowWeeklyReset(shouldShowWeeklyReset());
      setShowWeeklyReflection(shouldShowWeeklyReflection());
    } catch { /* ignore */ }
  }, [session?.user?.id, testing]);

  // Identify the authenticated user in Pendo once session + profile are loaded
  useEffect(() => {
    if (!session?.user?.id) return;
    try {
      window.pendo.initialize({
        visitor: {
          id: session.user.id,
          email: session.user.email ?? '',
          firstName: profile?.full_name ?? profile?.username ?? '',
        },
        account: {
          id: session.user.id,
          businessTier: profile?.tier ?? 'free',
        },
      });
    } catch {
      // Pendo not loaded yet or unavailable — silently ignore
    }
  }, [session?.user?.id, profile]);

  // Redirect to profile password change when user arrives via a password reset link
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        navigate('/profile?changePassword=true');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Start reminder service when user is authenticated
  const { pendingReminderTask, dismissReminderTask } = useReminderService();

  // ── App bootstrap: runs once per authenticated session ──────────────
  useEffect(() => {
    if (!effectiveSession) return;
    const bootstrap = async () => {
      try {
        const { data: { session: authSess } } = await supabase.auth.getSession();
        const token = authSess?.access_token;
        if (!token) return;

        // 1. Reschedule overdue tasks so scheduled_date is always up-to-date on first load
        fetch('/.netlify/functions/rescheduleOverdueTasks', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});

        // 2. Hydrate localStorage focus sessions from DB so they're available
        //    before the user ever opens the focus view
        const res = await fetch('/.netlify/functions/getAllFocusSessions', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const dbSessions: Array<{
          task_id: string;
          elapsed_seconds: number;
          accumulated_seconds?: number;
          started_at?: string | null;
          timer_state: string;
          chat_messages: unknown[];
          suggested_tasks: unknown[];
          added_task_titles: string[];
          pending_chat_tasks: unknown[];
          pending_chat_links: unknown[];
          created_at: string;
          updated_at: string;
        }> = await res.json();

        for (const db of dbSessions) {
          const dbUpdatedAt = new Date(db.updated_at).getTime();
          const existing = loadSession(db.task_id);
          // Only write if DB is newer than what's already in localStorage
          if (!existing || dbUpdatedAt > existing.updatedAt) {
            saveSession({
              taskId: db.task_id,
              elapsed: db.elapsed_seconds,
              // Never restore as 'running' — user must resume manually
              timerState: db.timer_state === 'running' ? 'paused' : db.timer_state as 'paused' | 'idle',
              // Notes live in task_notes table; preserve any local ones
              notes: existing?.notes ?? [],
              chatMessages: (db.chat_messages ?? []) as any,
              savedNoteIds: existing?.savedNoteIds ?? [],
              suggestedTasks: (db.suggested_tasks ?? []) as any,
              addedTaskTitles: db.added_task_titles ?? [],
              pendingChatTasks: (db.pending_chat_tasks ?? []) as any,
              pendingChatLinks: (db.pending_chat_links ?? []) as any,
              createdAt: new Date(db.created_at).getTime(),
              updatedAt: dbUpdatedAt,
            });
          }
        }
      } catch {
        // Non-critical: silently ignore bootstrap errors
      }
    };
    bootstrap();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!effectiveSession]);

  const handleEditReminderTask = () => {
    if (!pendingReminderTask) return;
    try { sessionStorage.setItem('wkly_edit_task_id', pendingReminderTask.id); } catch { /* ignore */ }
    dismissReminderTask();
    navigate('/goals');
  };


  
  
  // All hooks are called above, now conditionally render UI:
   // Redirect to "/" after login if currently on "/auth"
  useEffect(() => {
    if (effectiveSession && window.location.pathname === '/auth') {
      navigate('/');
    }
  }, [effectiveSession, navigate]);
  
  // Goals are fetched by the GoalsProvider on mount; no need to fetch here.
  
  if (isLoading && !testing) return (
    <div className="fixed top-0 mt-0 h-[100vh] w-full bg-gray-10 dark:bg-gray-90 flex justify-center items-center">
      <div className="loader"><LoadingSpinner variant="mui" /></div>
      {/* <span className="ml-2">Generating plan...</span> */}
    </div>
  );
  if (!effectiveSession) {
    return (
      <Routes>
        {/* <Route path="/auth" element={<Auth />} />
        <Route path="*" element={<Auth />} /> */}
        <Route path="/auth" element={<LandingPage />} />
+        <Route path="*" element={<LandingPage />} />
      </Routes>
    );
  }

  // no local loading placeholder; child components can show their own spinners

  return (
    <SessionContextProvider supabaseClient={supabase}>
    <AppMuiThemeProvider mode={theme}>
    <TierProvider>
    <TimezoneProvider>
    <FocusTimerProvider>
    <FocusModeProvider>
    <FireworksProvider>
    <div className={`${current}`}>
      <div className={`min-h-screen bg-background text-primary-text ${current}`}>
        <Suspense fallback={null}>
        <Header   
          theme={theme}
          toggleTheme={toggleTheme}
          isOpen={isOpen}
          handleLogout={handleLogout}
          />
        <GoalsProvider>
          <PullToRefresh>
          <main className="max-w-8xl min-h-[100vh] mx-auto px-4 sm:px-8 lg:px-16 py-8">

            <Suspense fallback={<div className="flex justify-center items-center h-64"><LoadingSpinner variant="mui" /></div>}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/goals" element={<AllGoals />} />
              <Route path="/mui-demo" element={<MuiCompareDemo />} />
              {/* <Route path="/wins" element={<AllWins />} /> */}
              <Route path="/summaries" element={<AllSummaries />} />
              <Route path="/notifications" element={<NotificationsSettings />} />
              <Route path="/auth" element={<Navigate to="/" replace />} />
              <Route path="/profile" element={<ProfileManagement />} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />

              <Route path="/admin/access" element={<AdminAccessRequests />} />
              <Route path="/affirmations" element={<AffirmationsLayout />}>
                <Route index element={<AffirmationToday />} />
                <Route path="archive" element={<AffirmationArchive />} />
                <Route path="submit" element={<AffirmationSubmit />} />
                <Route path="saved" element={<AffirmationSaved />} />
                <Route path="settings" element={<AffirmationSettings />} />
              </Route>
            </Routes>
            </Suspense>
          </main>
          <Footer />
          </PullToRefresh>
          <Suspense fallback={null}><CookieConsent /></Suspense>
          {showOnboarding && (
            <Suspense fallback={null}>
              <OnboardingAssistant onComplete={handleOnboardingComplete} />
            </Suspense>
          )}
          {showWeeklyReset && (
            <Suspense fallback={null}>
              <WeeklyResetFlow onDismiss={() => setShowWeeklyReset(false)} />
            </Suspense>
          )}
          {showWeeklyReflection && (
            <Suspense fallback={null}>
              <WeeklyReflectionFlow onDismiss={() => setShowWeeklyReflection(false)} />
            </Suspense>
          )}
        </GoalsProvider>
        </Suspense>
      </div>
    </div>
    </FireworksProvider>
    </FocusModeProvider>
    </FocusTimerProvider>
    </TimezoneProvider>
    </TierProvider>

      {/* ── Task Reminder Dialog ───────────────────────────────────────── */}
      <Dialog open={!!pendingReminderTask} onClose={dismissReminderTask} maxWidth="sm" fullWidth>
        <div className={`${current}`}>
        <DialogTitle className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary" />
          Task Reminder
        </DialogTitle>
        <DialogContent className="space-y-3">
          {pendingReminderTask && (
            <>
              <h3 className="font-semibold text-primary-text text-base pt-3">{pendingReminderTask.title}</h3>
              {pendingReminderTask.description && (
                <p className="text-sm text-secondary-text">{pendingReminderTask.description}</p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {pendingReminderTask.scheduled_date && (
                  <Chip icon={<Calendar className="w-3 h-3" />} label={pendingReminderTask.scheduled_date} size="small" variant="outlined" />
                )}
                {pendingReminderTask.scheduled_time && (
                  <Chip icon={<FileText className="w-3 h-3" />} label={pendingReminderTask.scheduled_time} size="small" variant="outlined" />
                )}
                {pendingReminderTask.status && (
                  <Chip label={pendingReminderTask.status} size="small" variant="outlined" />
                )}
              </div>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button className='!normal-case btn-secondary' onClick={dismissReminderTask} color="inherit">Cancel</Button>
          <Button className='!normal-case btn-primary' onClick={handleEditReminderTask} variant="contained">Edit Task</Button>
        </DialogActions>
        </div>
      </Dialog>

    </AppMuiThemeProvider>
        <ToastNotification theme={theme} />
        <Snackbar
          open={shouldNudge && !isFeedbackOpen}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          message={
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <MessageSquare size={16} />
              How are we doing? Share your feedback
            </span>
          }
          action={
            <>
              <Button
                size="small"
                color="primary"
                variant="contained"
                onClick={() => { dismissNudge(); setIsFeedbackOpen(true); }}
                sx={{ mr: 1, textTransform: 'none' }}
              >
                Give Feedback
              </Button>
              <IconButton
                size="small"
                color="inherit"
                onClick={dismissNudge}
                aria-label="dismiss feedback nudge"
              >
                <XIcon size={16} />
              </IconButton>
            </>
          }
        />
        <FeedbackDialog isOpen={isFeedbackOpen} onClose={() => setIsFeedbackOpen(false)} />
    </SessionContextProvider>
  );
}

export default App;

