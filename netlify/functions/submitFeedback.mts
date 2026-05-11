import supabase from './lib/supabase';
import { requireAuth, CORS_HEADERS, withCors } from './lib/auth';
import { createClient } from '@supabase/supabase-js';

const adminClient = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const GITHUB_API_URL = 'https://api.github.com/repos/wkly-me/Wkly-git/issues';
const GITHUB_LABELS_URL = 'https://api.github.com/repos/wkly-me/Wkly-git/labels';
const NPS_NEGATIVE_THRESHOLD = 5;

async function ensureFeedbackLabel(token: string): Promise<void> {
  // Check if label exists
  const check = await fetch(`${GITHUB_LABELS_URL}/Feedback`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (check.status === 200) return; // already exists

  // Create it
  await fetch(GITHUB_LABELS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ name: 'Feedback', color: '5319e7', description: 'User-submitted feedback' }),
  });
}

async function createGitHubIssue(
  npsScore: number,
  message: string | null,
  includeEmail: boolean,
  userEmail: string | null,
): Promise<string | null> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error('GITHUB_TOKEN env var is not set — skipping issue creation');
    return null;
  }

  const snippet = message ? message.slice(0, 60) + (message.length > 60 ? '…' : '') : 'No comment';
  const title = `[Feedback] NPS ${npsScore} – ${snippet}`;

  const bodyLines = [
    `**NPS Score:** ${npsScore} / 10`,
    '',
    `**Message:**`,
    message ? message : '_No message provided._',
    '',
    includeEmail && userEmail ? `**User Email:** ${userEmail}` : '_User opted out of email disclosure._',
    '',
    `**Submitted:** ${new Date().toISOString()}`,
    '',
    '---',
    '_Auto-generated from in-app feedback submission._',
  ];

  // Ensure the label exists before creating the issue
  await ensureFeedbackLabel(token);

  const res = await fetch(GITHUB_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      title,
      body: bodyLines.join('\n'),
      labels: ['Feedback'],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('GitHub issue creation failed:', res.status, text);
    return null;
  }

  const json: { html_url: string } = await res.json();
  return json.html_url;
}

export const handler = withCors(async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  const auth = await requireAuth(event);
  if (auth.error) return auth.error;
  const { userId } = auth;

  try {
    const body = JSON.parse(event.body || '{}');
    const { nps_score, message, include_email } = body;

    if (nps_score === undefined || nps_score === null || !Number.isInteger(nps_score) || nps_score < 0 || nps_score > 10) {
      return { statusCode: 400, body: JSON.stringify({ error: 'nps_score must be an integer between 0 and 10' }) };
    }

    if (message !== undefined && message !== null && typeof message !== 'string') {
      return { statusCode: 400, body: JSON.stringify({ error: 'message must be a string' }) };
    }

    if (message && message.length > 500) {
      return { statusCode: 400, body: JSON.stringify({ error: 'message must be 500 characters or fewer' }) };
    }

    // Resolve user email only if opted in
    let userEmail: string | null = null;
    if (include_email) {
      const { data: userData } = await adminClient.auth.admin.getUserById(userId);
      userEmail = userData?.user?.email ?? null;
    }

    // Create GitHub issue for negative scores
    let githubIssueUrl: string | null = null;
    if (nps_score <= NPS_NEGATIVE_THRESHOLD) {
      githubIssueUrl = await createGitHubIssue(nps_score, message ?? null, !!include_email, userEmail);
    }

    const { data, error } = await supabase
      .from('feedback')
      .insert({
        user_id: userId,
        nps_score,
        message: message?.trim() ?? null,
        include_email: !!include_email,
        user_email: userEmail,
        github_issue_url: githubIssueUrl,
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase error submitFeedback:', error);
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to save feedback' }) };
    }

    return { statusCode: 201, body: JSON.stringify(data) };
  } catch (err: any) {
    console.error('Unexpected error submitFeedback:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Unexpected error' }) };
  }
});
