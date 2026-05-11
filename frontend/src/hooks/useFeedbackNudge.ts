import { useState, useEffect } from 'react';

const STORAGE_KEY = 'last_feedback_submission';
const COOLDOWN_DAYS = 30;
const NUDGE_DELAY_MS = 5 * 60 * 1000; // 5 minutes after page load

export function useFeedbackNudge() {
  const [shouldNudge, setShouldNudge] = useState(false);

  useEffect(() => {
    const lastSubmission = localStorage.getItem(STORAGE_KEY);
    if (lastSubmission) {
      const daysSinceLast = (Date.now() - new Date(lastSubmission).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceLast < COOLDOWN_DAYS) return;
    }

    const timer = setTimeout(() => setShouldNudge(true), NUDGE_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  function dismissNudge() {
    setShouldNudge(false);
    // Snooze for 7 days without a full submission
    const snoozeUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem(STORAGE_KEY, snoozeUntil);
  }

  return { shouldNudge, dismissNudge };
}
