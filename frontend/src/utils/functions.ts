import React from "react";
import supabase from "@lib/supabase";
import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyError, notifySuccess, notifyTierLimit } from "@components/ToastyNotification";
import { v4 as uuidv4 } from "uuid";
import { Category, Goal, Summary, Win } from "@utils/goalUtils"; // Adjust the import path as necessary
// import { error } from "console";

const baseUrl = import.meta.env.DEV ? 'http://localhost:8888' : ''; // Use localhost for dev, empty for production
const backend = '/api';

// export const backendUrl = backend + '/api/summaries';
export const supabaseUrl = ((import.meta as unknown) as { env?: { VITE_SUPABASE_URL?: string } }).env?.VITE_SUPABASE_URL ?? '';
export const openaiApiKey = ((import.meta as unknown) as { env?: { VITE_OPENAI_API_KEY?: string } }).env?.VITE_OPENAI_API_KEY ?? '';

export const handleError = (error: unknown, setError: React.Dispatch<React.SetStateAction<string | null>>) => {
  console.error(error);
  setError(error instanceof Error ? error.message : 'An unknown error occurred');
};

export const fetchWithAuth = async (url: string): Promise<unknown> => {
    const token = await getSessionToken();
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
    });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Failed to fetch');
  }
  return await response.json();
};

export const getSessionToken = async (): Promise<string> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('User is not authenticated');

  // If the token is expired or within 60 seconds of expiry, force a refresh
  // before making a request. This is especially important on Android where
  // the app can be backgrounded for longer than the 1-hour token lifetime.
  const expiresAt = session.expires_at; // unix seconds
  const nowSec = Math.floor(Date.now() / 1000);
  if (expiresAt && expiresAt - nowSec < 60) {
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.session?.access_token) throw new Error('Session refresh failed');
    return data.session.access_token;
  }

  return session.access_token;
};


export const handleSignIn = async (email: string, password: string, setError: React.Dispatch<React.SetStateAction<string | null>>) => {
    try {
        const { data: { session }, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        if (error) throw new Error(error.message);
        return session;
    } catch (err) {
        handleError(err, setError);
    }
};
export const handleSignOut = async (setError: React.Dispatch<React.SetStateAction<string | null>>) => {
    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw new Error(error.message);
        return true;
    } catch (err) {
        handleError(err, setError);
    }
};


export const fetchAllGoals = async (includeArchived = false): Promise<Goal[]> => {
  const token = await getSessionToken();
  const params = includeArchived ? '?include_archived=true' : '';

  const response = await fetch(`/api/getAllGoals${params}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Error fetching all goals:', errorText);
    throw new Error('Failed to fetch all goals');
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    const body = await response.text();
    console.error('getAllGoals returned non-JSON response:', body.slice(0, 200));
    throw new Error('Unexpected response from server');
  }

  const goals = await response.json();
  // Sort by created date ascending
  goals.sort((a: { created_at: string | number | Date }, b: { created_at: string | number | Date }) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  // console.log('Fetched all goals:', goals);
  // // console.log('Request Query Parameters:', response.body);
  // // console.log('User ID:', userId);
  return goals;
};

/**
 * Fetch goals for a specific date range, optionally including archived goals.
 * Used by summary generation to include archived goals that fall within the scope.
 */
export const fetchGoalsForRange = async (
  start: string,
  end: string,
  includeArchived = false,
): Promise<Goal[]> => {
  const token = await getSessionToken();
  const params = new URLSearchParams({ start, end });
  if (includeArchived) params.set('include_archived', 'true');

  const response = await fetch(`/api/getAllGoals?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Error fetching goals for range:', errorText);
    throw new Error('Failed to fetch goals for range');
  }

  const goals: Goal[] = await response.json();
  goals.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  return goals;
};

// // Refined type definitions for `Goal`, `Summary`, and `Win`
// interface Goal {
//   id: string;
//   title: string;
//   description: string;
//   category: string;
//   user_id: string;
//   created_at: string;
//   week_start: string;
// }

// Added missing `description` property to `Summary` type
// interface Summary {
//   id: string;
//   scope: string;
//   title: string;
//   description: string;
//   content: string;
//   type: string;
//   user_id: string;
//   created_at: string;
//   week_start: string;
// }

// interface Win {
//   id: string;
//   title: string;
//   description: string;
//   impact: string;
//   // category: string;
//   goal_id: string;
//   user_id: string;
//   created_at: string;
//   week_start: string;
// }

// Ensured `scope` is always defined in `indexDataByScope`
export const indexDataByScope = <T extends { week_start: string; id: string; title: string; description: string; category?: string; user_id?: string; created_at?: string; content?: string; type?: string; impact?: string; goal_id?: string; scope: string }>(
  data: T[],
  scope: 'week' | 'month' | 'year'
): Record<string, T[]> => {
  const indexedData: Record<string, T[]> = {};

  data.forEach((item) => {
    const itemDate = new Date(item.week_start);
    let key: string;

    switch (scope) {
      case 'week':
        key = item.week_start; // Use the exact week_start date
        break;
      case 'month':
        key = `${itemDate.getFullYear()}-${String(itemDate.getMonth() + 1).padStart(2, '0')}`; // Format as YYYY-MM
        break;
      case 'year':
        key = `${itemDate.getFullYear()}`; // Use the year
        break;
      default:
        throw new Error('Invalid scope');
    }

    if (!indexedData[key]) {
      indexedData[key] = [];
    }
    indexedData[key].push({ ...item, scope });
  });

  return indexedData;
};

export const getPagesFromIndexedData = <T>( indexedData: Record<string, T[]> ): string[] => {
  return Object.keys(indexedData).sort(); // Sort keys to ensure chronological order
};

// Fetch all goals indexed by week, month, or year

export const fetchAllGoalsIndexed = async (
    scope: 'week' | 'month' | 'year',
    page?: string, // optional page param: legacy YYYY-MM for month, YYYY for year, or exact week_start
    start?: string, // optional ISO start date inclusive
    end?: string, // optional ISO end date exclusive
    includeArchived = false, // include archived goals
): Promise<{ indexedGoals: Record<string, Goal[]>; pages: string[] }> =>
  {
    const token = await getSessionToken();

    try {
      // Build URL with optional parameters (page, start, end)
      const params = new URLSearchParams({ scope });
      if (page) params.set('page', page);
      if (start) params.set('start', start);
      if (end) params.set('end', end);
      if (includeArchived) params.set('include_archived', 'true');
      const url = `/api/getAllGoals?${params.toString()}`;
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) {
        const errorText = await response.text(); // Read the body once for error logging
        console.error('Error fetching all goals:', errorText);
        console.error('Response headers:', response.headers);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error('Invalid content-type:', contentType);
        const rawResponse = await response.text(); // Log raw response for debugging
        console.error('Raw response:', rawResponse);
        throw new Error('Invalid response format: Expected JSON');
      }

      const goals: Goal[] = await response.json(); // Read the body once for JSON parsing
      // // console.log('Fetched all goals:', goals);

      // Sort goals by created date descending
      goals.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      // Index goals by the selected scope
      const goalsWithScope = goals.map((goal) => ({ ...goal, scope }));
      const indexedGoals = indexDataByScope(goalsWithScope, scope);

      // Get pages sorted in descending order
      const pages = Object.keys(indexedGoals).sort((a, b) => (a > b ? -1 : 1));

      // console.log('Indexed goals:', indexedGoals);
      // console.log('Pages:', pages);
      return { indexedGoals, pages };
    } catch (error) {
      console.error('Error in fetchAllGoalsIndexed:', error);
      throw error;
    }
  };
  // export const DefaultCategories: string[] = [
  //   'Technical skills',
  //   'Business',
  //   'Eminence',
  //   'Concepts',
  //   'Community'
  // ];

  // export const fetchUserCategories = async (): Promise<string[]> => {
  //   try {
  //     const { data, error } = await supabase.from('categories').select('name');
  //     if (error) {
  //       console.error('Error fetching user categories:', error.message);
  //       return [];
  //     }

  //     return data.map((category) => category.name);
  //   } catch (err) {
  //     console.error('Unexpected error fetching user categories:', err);
  //     return [];
  //   }
  // };


export const addCategory = async (newCategory: string): Promise<void> => {
  try {
    const normalizedCategory = newCategory.trim();

    // Call the Netlify function to create the category (user_id derived from JWT server-side)
    const token = await getSessionToken();
    const payload = { name: normalizedCategory };

    // Call the Netlify function to create the category
    const response = await fetch(`${baseUrl}${backend}/createCategory`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      // Try to parse a structured JSON error from the function first
      let parsed: any = null;
      try {
        parsed = await response.json();
      } catch (e) {
        // ignore JSON parse errors
      }

      if (parsed && parsed.error === 'duplicate_category') {
        notifyError(parsed.message || 'Category already exists.');
        throw new Error('Category already exists');
      }

      // Fallback: try to read text body
      const errorText = parsed?.message || (await response.text().catch(() => ''));
      console.error('Error adding category via Netlify function:', errorText || parsed || response.statusText);
      notifyError('Failed to add category.');
      throw new Error(errorText || 'Failed to add category');
    }

    // On success, parse response and refresh categories
    try {
      await response.json();
    } catch (e) {
      // Ignore parse failures on an otherwise OK response
    }

    // Refresh the UserCategories list
    await initializeUserCategories();
    notifySuccess('Category added successfully.');
  } catch (err) {
    console.error('Unexpected error adding category:', err);
    // Rethrow so callers can handle the failure (UI expects this)
    throw err;
  }
};

export const fetchCategories = async (): Promise<{ UserCategories: Category[] }> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User is not authenticated');

    const userId = user.id;

    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .or(`user_id.eq.${userId},is_default.eq.true`);

    if (error) {
      console.error('Error fetching categories:', error.message);
      return { UserCategories: [] };
    }

    return { UserCategories: data || [] };
  } catch (err) {
    console.error('Unexpected error fetching categories:', err);
    return { UserCategories: [] };
  }
};

// export const fetchCategories = async (): Promise<{ UserCategories: Record<string, Category[]>; }> => {
//   try {
//     // console.log('Supabase URL:', supabaseUrl); // Debug log for Supabase URL
//     // console.log('Supabase Key:', supabaseKey); // Debug log for Supabase Key

//     const response = await fetch(`${supabaseUrl}/rest/v1/categories`, {
//       method: 'GET',
//       headers: {
//         Accept: 'application/json',
//         Authorization: `Bearer ${supabaseKey}`,
//         apikey: supabaseKey, // Explicitly include the apikey header
//       },
//     });

//     if (!response.ok) {
//       console.error('Full response:', response); // Debug log for full response
//       throw new Error(`Error fetching categories: ${response.statusText}`);
//     }

//     const data = await response.json();
//     return { UserCategories: data };
//   } catch (err) {
//     console.error('Error in fetchCategories:', err);
//     throw err;
//   }
// };

// Extract the `name` field from the `data` and set it as a `UserCategories` array that can be accessed globally
export let UserCategories: { id: string; name: string }[] = [];

export const initializeUserCategories = async (): Promise<void> => {
  try {
    const { data, error } = await supabase.from('categories').select('cat_id, name');
    if (error) {
      console.error('Error fetching user categories:', error.message);
      UserCategories = [];
      return;
    }

    UserCategories = (data || []).map((category: unknown) => {
      const row = category as { cat_id?: string; name?: string };
      return { id: row.cat_id ?? '', name: row.name ?? '' };
    });
  } catch (err) {
    console.error('Unexpected error initializing user categories:', err);
    UserCategories = [];
  }
};


// Add a new goal
export const addGoal = async (newGoal: Partial<Goal>) => {
  const token = await getSessionToken();

  // Exclude unnecessary fields like id and created_at safely
  const { id: _maybeId, created_at: _maybeCreatedAt, ...filteredGoal } = newGoal as Partial<Record<string, unknown>>;
  void _maybeId;
  void _maybeCreatedAt;
  const goalToSend = { ...filteredGoal } as Record<string, unknown>;

  const response = await fetch(`${baseUrl}${backend}/createGoal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(goalToSend),
  });

  if (!response.ok) {
    let errBody: any = {};
    try { errBody = await response.json(); } catch {}
    if (errBody?.error === 'tier_limit') {
      notifyTierLimit(errBody.message || 'Upgrade to create more goals.');
      throw new Error(errBody.message || 'tier_limit');
    }
    console.error('Error adding goal:', errBody);
    notifyError('Failed to add goal');
    throw new Error('Failed to add goal');
  }

  notifySuccess(`Goal "${newGoal.title}" added successfully!`);
  // console.log(`Goal "${newGoal.title}" added successfully!`);
  return response.json();
};




// export const handleSubmit = async (
//     event: React.FormEvent,
//     supabase: any,
//     newGoal: Omit<any, 'id'>,
//     fetchGoals: () => Promise<void>,
//     setIsModalOpen: React.Dispatch<React.SetStateAction<boolean>>,
//     resetNewGoal: () => void,
//     setError: React.Dispatch<React.SetStateAction<string | null>>
// ) => {
//     event.preventDefault();
//     try {
//       const { data: { user } } = await supabase.auth.getUser();
//       if (!user) throw new Error('User is not authenticated');
//       const userId = user.id;
        
//       const { error } = await supabase.from('goals').insert({
//           ...newGoal,
//           user_id: userId,
//       });
//       if (error) throw new Error(error.message);
      
//       setIsModalOpen(false);
//       resetNewGoal();
//       await fetchGoals();
//     } catch (err) {
//         handleError(err, setError);
//     }
// };

// Set goals in the local state or perform any other action
export function setGoals(_data: unknown) {
  // noop: kept for compatibility; intentionally unimplemented
  void _data;
}
// Delete a goal

export const deleteGoal = async (goalId: string) => {
  const token = await getSessionToken();

  const response = await fetch(`${baseUrl}${backend}/deleteGoal?goal_id=${goalId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    notifyError('Failed to delete goal');
    throw new Error('Failed to delete goal');
  }
  notifySuccess('Goal deleted successfully!');
  return response.json();
};
export const handleDeleteGoal = async (
  supabase: SupabaseClient,
    goalId: string,
    _setFilteredGoals: React.Dispatch<React.SetStateAction<Goal[]>>,
    fetchGoals: () => Promise<void>,
    setError: React.Dispatch<React.SetStateAction<string | null>>
) => {
    try {
        const { error } = await supabase.from('goals').delete().eq('id', goalId);
        if (error) throw new Error(error.message);
        
        await fetchGoals();
    } catch (err) {
        handleError(err, setError);
    }
};

export const updateGoal = async (goalId: string, updatedGoal: Partial<Goal> | Record<string, unknown>) => {
  const token = await getSessionToken();

  if (!goalId) {
    console.error('Goal ID is missing');
    throw new Error('Goal ID is required');
  }

  const payload = JSON.stringify({ id: goalId, ...updatedGoal });

  const response = await fetch(`${baseUrl}${backend}/updateGoal?goal_id=${goalId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: payload,
  });

  // Move the success notification to after the response is validated
  if (!response.ok) {
    const errorText = await response.text();
    console.error('Error response from updateGoal:', errorText);
    notifyError('Failed to update goal');
    throw new Error('Failed to update goal');
  }

  const responseData = await response.json();
  // console.log('Response from updateGoal:', responseData);

  // Notify success only after the goal is successfully saved
  notifySuccess('Goal updated successfully!');
  return responseData;
};

// Notes API wrappers using serverless endpoints
export const fetchNotesForGoal = async (goalId: string) => {
  const token = await getSessionToken();

  const res = await fetch(`${baseUrl}${backend}/getNotes?goal_id=${encodeURIComponent(goalId)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || 'Failed to fetch notes');
  }
  return res.json();
};

export const createGoalNote = async (goalId: string, content: string) => {
  const token = await getSessionToken();

  const res = await fetch(`${baseUrl}${backend}/createNote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ goal_id: goalId, content }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || 'Failed to create note');
  }
  return res.json();
};

export const updateGoalNote = async (noteId: string, content: string) => {
  const token = await getSessionToken();

  const res = await fetch(`${baseUrl}${backend}/updateNote`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ id: noteId, content }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || 'Failed to update note');
  }
  return res.json();
};

export const deleteGoalNote = async (noteId: string) => {
  const token = await getSessionToken();

  const res = await fetch(`${baseUrl}${backend}/deleteNote?note_id=${encodeURIComponent(noteId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || 'Failed to delete note');
  }
  return res.json();
};

// Add a function to highlight filtered words
  export const applyHighlight = (text: string | null | undefined, filter: string | null | undefined) => {
    // If there's no filter or no text, return text (coerce null/undefined to empty string to avoid runtime errors)
    if (!filter) return text ?? '';
    const safeText = text ?? '';
    // Escape special characters in the filter string
    const escapedFilter = (filter || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedFilter})`, 'gi');
    return safeText.replace(regex, '<span class="highlight">$1</span>');
  };

// Enhance HTML links to open in new tab with security attributes
export const enhanceLinks = (html: string | null | undefined): string => {
  if (!html) return '';
  
  // Parse the HTML and add target="_blank" and rel="noopener noreferrer" to all <a> tags
  const temp = document.createElement('div');
  temp.innerHTML = html;
  
  const links = temp.querySelectorAll('a');
  links.forEach(link => {
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
  });
  
  return temp.innerHTML;
};

export const handleUpdateGoal = async (goalId: string, updatedGoal: Goal) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User is not authenticated');
    const userId = user.id;

    const response = await updateGoal(goalId, { ...updatedGoal, user_id: userId });
    return response;
};
// Update a goal
// export const updateGoal = async (goalId: string, updatedGoal: any) => {
//   const { data: { user } } = await supabase.auth.getUser();
//   if (!user) throw new Error('User is not authenticated');
//   const userId = user.id;

//   const response = await fetch(`${baseUrl}${backend}/updateGoal/${goalId}?user_id=${userId}`, {
//     method: 'PUT',
//     headers: {
//       'Content-Type': 'application/json',
//       Authorization: `Bearer ${userId}`,
//     },
//     body: JSON.stringify(updatedGoal),
//   });

//   if (!response.ok) {
//     throw new Error('Failed to update goal');
//   }

//   return response.json();
// };                    

// Filter goals by week
// export const filterGoalsByWeek = (goals: Goal[], selectedWeek: string | Date): Goal[] => {
//   const startOfWeek = new Date(selectedWeek);
//   startOfWeek.setHours(0, 0, 0, 0);

//   const endOfWeek = new Date(selectedWeek);
//   endOfWeek.setDate(endOfWeek.getDate() + 6);
//   endOfWeek.setHours(23, 59, 59, 999);

//   return goals.filter((goal) => {
//     const goalDate = new Date(goal.week_start);
//     return goalDate >= startOfWeek && goalDate <= endOfWeek;
//   });
// };

export const filterGoalsByWeek = (goals: Goal[], selectedWeek: Date) => {
  const weekStart = new Date(selectedWeek);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Get the start of the week (Sunday)
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6); // Get the end of the week (Saturday)

  return goals.filter((goal) => {
    const goalDate = new Date(goal.week_start);
    return goalDate >= weekStart && goalDate <= weekEnd;
  });
};

// Get the start date of the week (Monday)
// For timezone-aware calculations, import getWeekStartDateInTimezone from @utils/timezone
export const getWeekStartDate = (date: Date = new Date(), timezone?: string): string => {
  if (isNaN(date.getTime())) {
    console.error('Invalid date passed to getWeekStartDate:', date);
    return new Date().toISOString().split('T')[0]; // Fallback to current date
  }
  
  // If timezone is provided, use timezone-aware calculation
  if (timezone) {
    try {
      const { getWeekStartDateInTimezone } = require('@utils/timezone');
      return getWeekStartDateInTimezone(date, timezone);
    } catch (e) {
      // Fall through to UTC calculation if timezone utils not available
    }
  }
  
  // Use UTC-based calculations to avoid local timezone shifts affecting the resulting day
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - (day === 0 ? 6 : day - 1); // Adjust when day is Sunday (0)
  d.setUTCDate(diff);
  return d.toISOString().split('T')[0]; // Format as YYYY-MM-DD (UTC)
};

// export const getMonday = (date: Date): string => {
//   const day = date.getDay(); // Get the day of the week (0 = Sunday, 1 = Monday, etc.)
//   const diff = day === 0 ? -6 : 1 - day; // Calculate the difference to the previous Monday
//   const monday = new Date(date);
//   monday.setDate(date.getDate() + diff); // Adjust the date to the previous Monday
//   return monday.toISOString().split('T')[0]; // Return the date in YYYY-MM-DD format
// };

export const filterGoalsByMonth = (goals: Goal[], selectedDate: Date) => {
  const month = selectedDate.getMonth();
  const year = selectedDate.getFullYear();

  return goals.filter((goal) => {
    const goalDate = new Date(goal.week_start);
    return goalDate.getMonth() === month && goalDate.getFullYear() === year;
  });
};


export const filterGoalsByYear = (goals: Goal[], selectedDate: Date) => {
  const year = selectedDate.getFullYear();

  return goals.filter((goal) => {
    const goalDate = new Date(goal.week_start);
    return goalDate.getFullYear() === year;
  });
};

// Generate a summary using OpenAI
export const generateSummary = async (
  id: string,
  scope: 'week' | 'month' | 'year',
  title: string,
  userId: string,
  weekStart: string,
  goalsWithWins: {
    title: string;
    description: string;
    category: string;
    accomplishments: { title: string; description: string; impact: string }[];
  }[],
  responseLength?: number, // Add optional responseLength parameter
  additionalContext?: string // Add optional additionalContext parameter
): Promise<string> => {
  const summaryId = id || uuidv4();
  const token = await getSessionToken();

  const requestBody: Record<string, unknown> = {
    summary_id: summaryId,
    scope,
    summaryTitle: title,
    week_start: weekStart,
    goalsWithAccomplishments: goalsWithWins,
    responseLength, // Include responseLength in the request body if provided
    additionalContext, // Include additionalContext in the request body if provided
  };

  // Add a short correlation id so server logs can be matched to client logs
  const requestId = uuidv4();
  requestBody.requestId = requestId;

  // Defensive debug log — prints the exact payload being sent to the server.
  try {
    console.debug('[frontend generateSummary] sending request body:', {
      requestId,
      summary_id: requestBody.summary_id,
      scope: requestBody.scope,
      summaryTitle_preview: (requestBody.summaryTitle as string | undefined)?.slice?.(0, 200),
      week_start: requestBody.week_start,
      goals_count: Array.isArray(requestBody.goalsWithAccomplishments) ? (requestBody.goalsWithAccomplishments as any[]).length : 0,
      responseLength: requestBody.responseLength,
      additionalContext_preview: (requestBody.additionalContext as string | undefined)?.slice?.(0, 100),
    });
  } catch (e) {
    // ignore logging failures
  }

  const response = await fetch(`${baseUrl}${backend}/generateSummary`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    let errBody: any = {};
    try { errBody = await response.json(); } catch {}
    if (errBody?.error === 'tier_limit') {
      notifyTierLimit(errBody.message || 'Upgrade to generate summaries.');
      throw new Error(errBody.message || 'tier_limit');
    }
    console.error('Error generating summary:', errBody);
    throw new Error('Failed to generate summary');
  }

  const data = await response.json();
  return data.summary;
};

// Save a summary to the database
export const saveSummary = async (
  setLocalSummaryId: (id: string) => void,
  summaryTitle: string,
  summaryContent: string,
  summaryType: string,
  selectedRange: Date,
  scope: 'week' | 'month' | 'year' // Add scope parameter
) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User is not authenticated');

  const weekStart = getWeekStartDate(selectedRange);

  // Use the backend createSummary function instead of direct insert
  try {
    const result = await createSummary({
      user_id: user,
      content: summaryContent,
      summary_type: summaryType,
      week_start: weekStart,
      title: summaryTitle,
    });

    if (result && result.id) {
      setLocalSummaryId(result.id);
      notifySuccess('Summary saved successfully!');
      return result;
    } else {
      throw new Error('No summary ID returned');
    }
  } catch (error) {
    console.error('Error saving summary:', error);
    notifyError('Failed to save summary');
    throw error;
  }
};

// Fetch summaries for a user
// Fetch all goals
export const fetchSummaries = async (userId: string, id: string): Promise<Summary[]> => {
  const token = await getSessionToken();

  const response = await fetch(`${baseUrl}${backend}/getSummaries?summary_id=${id}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Error fetching summaries:', errorText);
    throw new Error('Failed to fetch summaries');
  }

  // return response.json();
  const summaries = await response.json();
  // Sort by created date ascending
  summaries.sort((a: { created_at: string | number | Date; }, b: { created_at: string | number | Date; }) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  // console.log('Fetched summaries:', summaries);
  return summaries;
};

// Add a new summary
export const createSummary = async (newSummary: Record<string, unknown>) => {
  const token = await getSessionToken();

  const response = await fetch(`${baseUrl}${backend}/createSummary`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(newSummary),
  });

  if (!response.ok) {
    let errBody: any = {};
    try { errBody = await response.json(); } catch {}
    if (errBody?.error === 'tier_limit') {
      notifyTierLimit(errBody.message || 'Upgrade to create more summaries.');
      throw new Error(errBody.message || 'tier_limit');
    }
    console.error('Error adding summary:', errBody);
    throw new Error('Failed to add summary');
  }

  return response.json();
};

// Delete a summary
export const deleteSummary = async (summary_id: string) => {
  if (!summary_id) {
    throw new Error('No summary ID provided');
  }
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User is not authenticated');

    // Use the backend function to delete summary (respects RLS policies)
    const response = await fetch(`/.netlify/functions/deleteSummary?summary_id=${summary_id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to delete summary');
    }

    notifySuccess('Summary deleted successfully!'); 
  } catch (error) {
    console.error('Error deleting summary:', error);
    notifyError('Failed to delete summary');
    throw error;
  }
}

// Set the summary in the local state or perform any other action
// export function setSummary(content: string, title: string, type: string) {
//   // console.log("Summary Content:", content);
//   // console.log("Summary Title:", title);
//   // console.log("Summary Type:", type);
// }

// Implement fetchAllSummariesIndexed
// Updated `fetchAllSummariesIndexed` to ensure `content` is always defined
export const fetchAllSummariesIndexed = async (
  scope: 'week' | 'month' | 'year'
): Promise<{ indexedSummaries: Record<string, Summary[]>; pages: string[] }> => {
  const token = await getSessionToken();

  try {
    const response = await fetch(`/api/getSummaries?scope=${scope}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error fetching summaries: ${errorText}`);
    }

    const summaries: Summary[] = await response.json();
    const summariesWithScope = summaries.map((summary) => ({
      ...summary,
      scope,
      title: summary.title || '', // Ensure `content` is always defined
      content: summary.content || '', // Ensure `description` is always defined
    }));
    const indexedSummaries = indexDataByScope(summariesWithScope, scope);
    const pages = getPagesFromIndexedData(indexedSummaries);

    return { indexedSummaries, pages };
  } catch (error) {
    console.error('Error fetching summaries:', error);
    throw error;
  }
};

// Implement fetchAllWinsIndexed
export const fetchAllWinsIndexed = async (
  scope: 'week' | 'month' | 'year'
): Promise<{ indexedWins: Record<string, Win[]>; pages: string[] }> => {
  const token = await getSessionToken();

  try {
    const response = await fetch(`/api/getAllAccomplishments?scope=${scope}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error fetching wins: ${errorText}`);
    }

    const wins: Win[] = await response.json();
    const winsWithScope = wins.map((win) => ({
      ...win,
      scope,
      impact: win.impact ?? "",
      // Ensure description and goal_id are strings for indexDataByScope
      description: win.description ?? '',
      goal_id: win.goal_id ?? '',
    }));
    const indexedWins = indexDataByScope(winsWithScope, scope);
    const pages = getPagesFromIndexedData(indexedWins);

    return { indexedWins, pages };
  } catch (error) {
    console.error('Error fetching wins:', error);
    throw error;
  }
};




