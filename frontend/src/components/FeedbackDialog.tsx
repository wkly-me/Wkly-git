import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControlLabel,
  Checkbox,
  Typography,
  Box,
  CircularProgress,
} from '@mui/material';
import { getSessionToken } from '@utils/functions';
import { notifySuccess, notifyError } from '@components/ToastyNotification';

interface FeedbackDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type Stage = 'score' | 'comment' | 'success';

function getNpsLabel(score: number): { label: string; color: string } {
  if (score <= 5) return { label: 'Detractor', color: '#ef4444' };
  if (score <= 8) return { label: 'Passive', color: '#f59e0b' };
  return { label: 'Promoter', color: '#22c55e' };
}

function getScoreColor(score: number): string {
  if (score <= 5) return '#ef4444';
  if (score <= 8) return '#f59e0b';
  return '#22c55e';
}

function getCommentPrompt(score: number): string {
  if (score <= 5) return 'What could we improve?';
  if (score <= 8) return 'What would make Wkly better for you?';
  return "What do you love most? We'd love to hear it!";
}

const SCORES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export default function FeedbackDialog({ isOpen, onClose }: FeedbackDialogProps) {
  const [stage, setStage] = useState<Stage>('score');
  const [selectedScore, setSelectedScore] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [includeEmail, setIncludeEmail] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function handleClose() {
    // Reset state when closing
    setStage('score');
    setSelectedScore(null);
    setMessage('');
    setIncludeEmail(false);
    setSubmitting(false);
    onClose();
  }

  function handleScoreSelect(score: number) {
    setSelectedScore(score);
    setStage('comment');
  }

  async function handleSubmit() {
    if (selectedScore === null) return;
    setSubmitting(true);
    try {
      const token = await getSessionToken();
      const res = await fetch('/api/submitFeedback', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nps_score: selectedScore,
          message: message.trim() || null,
          include_email: includeEmail,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Submission failed');
      }

      // Persist submission time for nudge cooldown
      localStorage.setItem('last_feedback_submission', new Date().toISOString());
      setStage('success');
    } catch (err: any) {
      notifyError(err.message || 'Failed to submit feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const npsInfo = selectedScore !== null ? getNpsLabel(selectedScore) : null;

  return (
    <Dialog
      open={isOpen}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 2 } }}
    >
      {stage === 'score' && (
        <>
          <DialogTitle sx={{ pb: 1 }}>Share Your Feedback</DialogTitle>
          <DialogContent>
            <Typography variant="body1" sx={{ mb: 3 }}>
              How likely are you to recommend Wkly to a friend or colleague?
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              0 = Not at all likely &nbsp;·&nbsp; 10 = Extremely likely
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
              {SCORES.map((score) => (
                <Button
                  key={score}
                  variant="outlined"
                  onClick={() => handleScoreSelect(score)}
                  sx={{
                    minWidth: 40,
                    height: 40,
                    p: 0,
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    borderColor: getScoreColor(score),
                    color: getScoreColor(score),
                    '&:hover': {
                      backgroundColor: getScoreColor(score),
                      color: '#fff',
                      borderColor: getScoreColor(score),
                    },
                  }}
                >
                  {score}
                </Button>
              ))}
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClose} color="inherit">
              Cancel
            </Button>
          </DialogActions>
        </>
      )}

      {stage === 'comment' && selectedScore !== null && npsInfo && (
        <>
          <DialogTitle sx={{ pb: 1 }}>Share Your Feedback</DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Your score:
              </Typography>
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  backgroundColor: npsInfo.color,
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '1rem',
                }}
              >
                {selectedScore}
              </Box>
              <Typography variant="body2" sx={{ color: npsInfo.color, fontWeight: 600 }}>
                {npsInfo.label}
              </Typography>
              <Button
                size="small"
                variant="text"
                color="inherit"
                onClick={() => setStage('score')}
                sx={{ ml: 'auto', fontSize: '0.75rem' }}
              >
                Change
              </Button>
            </Box>

            <TextField
              label={getCommentPrompt(selectedScore)}
              placeholder="Your feedback helps us improve Wkly…"
              multiline
              rows={4}
              fullWidth
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              inputProps={{ maxLength: 500 }}
              helperText={`${message.length} / 500`}
              sx={{ mb: 2 }}
            />

            <FormControlLabel
              control={
                <Checkbox
                  checked={includeEmail}
                  onChange={(e) => setIncludeEmail(e.target.checked)}
                  size="small"
                />
              }
              label={
                <Typography variant="body2" color="text.secondary">
                  Include my email so you can follow up with me
                </Typography>
              }
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClose} color="inherit" disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              variant="contained"
              disabled={submitting}
              startIcon={submitting ? <CircularProgress size={16} /> : undefined}
            >
              {submitting ? 'Sending…' : 'Submit Feedback'}
            </Button>
          </DialogActions>
        </>
      )}

      {stage === 'success' && (
        <>
          <DialogTitle sx={{ pb: 1 }}>Thank You!</DialogTitle>
          <DialogContent>
            <Typography variant="body1">
              Your feedback has been received. We really appreciate you taking the time to share your thoughts — it helps us make Wkly better.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClose} variant="contained">
              Close
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
