import { createClient } from '@supabase/supabase-js';
import { requireAuth, CORS_HEADERS, withCors } from './lib/auth';

const adminClient = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function isAdmin(userId: string): Promise<boolean> {
  const { data } = await adminClient
    .from('profiles')
    .select('is_admin, email')
    .eq('id', userId)
    .maybeSingle();

  return data?.is_admin === true || data?.email === 'jkimmell@gmail.com';
}

export const handler = withCors(async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  const auth = await requireAuth(event);
  if (auth.error) return auth.error;
  const { userId } = auth;

  const adminCheck = await isAdmin(userId);
  if (!adminCheck) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden: Admin access required' }) };
  }

  try {
    const { data, error } = await adminClient
      .from('feedback')
      .select('id, user_id, nps_score, message, include_email, user_email, github_issue_url, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase error getFeedback:', error);
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to fetch feedback' }) };
    }

    return { statusCode: 200, body: JSON.stringify(data) };
  } catch (err: any) {
    console.error('Unexpected error getFeedback:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Unexpected error' }) };
  }
});
