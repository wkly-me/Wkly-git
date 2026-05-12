-- Create feedback table for NPS scores and user comments
CREATE TABLE feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  nps_score integer NOT NULL CHECK (nps_score >= 0 AND nps_score <= 10),
  message text,
  include_email boolean NOT NULL DEFAULT false,
  user_email text,
  github_issue_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Authenticated users can insert their own feedback
CREATE POLICY "Users can submit feedback"
  ON feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can read their own feedback (for nudge cooldown check)
CREATE POLICY "Users can read their own feedback"
  ON feedback
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
