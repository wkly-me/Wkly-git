import React, { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Chip,
  CircularProgress,
  Typography,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Box,
  IconButton,
  Switch,
  Tooltip,
  Tabs,
  Tab,
} from '@mui/material';
import { Check, X, RefreshCw, UserMinus, CircleQuestionMark, UserCheck, ThumbsUpIcon, Trash2, Mail, MessageSquare } from 'lucide-react';
import supabase from '@lib/supabase';
import { notifySuccess, notifyError } from '@components/ToastyNotification';
import { fetchPendingAffirmations, moderateAffirmation } from '@utils/affirmationApi';
import type { Affirmation } from '../types/affirmations';
import { styled } from '@mui/material/styles';


interface FeedbackEntry {
  id: string;
  user_id: string | null;
  nps_score: number;
  message: string | null;
  include_email: boolean;
  user_email: string | null;
  github_issue_url: string | null;
  created_at: string;
}

interface AccessRequest {
  id: string;
  email: string;
  name: string | null;
  message: string | null;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  notes: string | null;
}

interface ApprovedUser {
  id: string;
  email: string;
  approved_at: string;
  approved_by: string | null;
  invitation_method: string;
  hasProfile: boolean;
  profileId?: string;
  username?: string;
  fullName?: string;
  tier: string | null;
  isAdmin: boolean;
}

interface StyledTabsProps extends React.ComponentProps<typeof Tabs> {
  children?: React.ReactNode;
  value: number;
  onChange: (event: React.SyntheticEvent, newValue: number) => void;
}

const StyledTabs = styled((props: StyledTabsProps) => (
  <Tabs
    {...props}
    slotProps={{
      indicator: { children: <span className="MuiTabs-indicatorSpan" /> },
    }}
  />
))({
  '& .MuiTabs-indicator': {
    display: 'flex',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  '& .MuiTabs-indicatorSpan': {
    maxWidth: 60,
    width: '100%',
    backgroundColor: 'var(--primary-link)',
  },
});

interface StyledTabProps extends React.ComponentProps<typeof Tab> {
  label: string;
}

const StyledTab = styled((props: StyledTabProps) => (
  <Tab disableRipple {...props} />
))(({ theme }) => ({
  textTransform: 'none',
  fontWeight: theme.typography.fontWeightRegular,
  fontSize: theme.typography.pxToRem(15),
  marginRight: theme.spacing(1),
  color: 'var(--primary-text)',
  '&.Mui-selected': {
    color: 'var(--primary-link)',
  },
  '&.Mui-focusVisible': {
    backgroundColor: 'rgba(100, 95, 228, 0.32)',
  },
}));

const AdminAccessRequests: React.FC = () => {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [approvedUsers, setApprovedUsers] = useState<ApprovedUser[]>([]);
  const [affirmations, setAffirmations] = useState<Affirmation[]>([]);
  const [feedbackEntries, setFeedbackEntries] = useState<FeedbackEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [affirmationFilter, setAffirmationFilter] = useState<string>('pending');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        notifyError('Not authenticated');
        return;
      }

      const response = await fetch(`/api/getAccessRequests?status=${statusFilter}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 403) {
          notifyError('Admin access required');
          return;
        }
        throw new Error('Failed to fetch access requests');
      }

      const data = await response.json();
      setRequests(data);
    } catch (err: any) {
      console.error('Error fetching access requests:', err);
      notifyError(err?.message || 'Failed to load access requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 0) {
      fetchRequests();
    } else if (activeTab === 1) {
      fetchApprovedUsers();
    } else if (activeTab === 2) {
      fetchAffirmationSubmissions();
    } else if (activeTab === 3) {
      fetchFeedback();
    }
  }, [statusFilter, affirmationFilter, activeTab]);

  const fetchAffirmationSubmissions = async () => {
    setLoading(true);
    try {
      const data = await fetchPendingAffirmations(affirmationFilter);
      setAffirmations(data);
    } catch (err: any) {
      console.error('Error fetching affirmation submissions:', err);
      notifyError(err?.message || 'Failed to load affirmation submissions');
    } finally {
      setLoading(false);
    }
  };

  const fetchFeedback = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        notifyError('Not authenticated');
        return;
      }
      const response = await fetch('/api/getFeedback', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) {
        if (response.status === 403) { notifyError('Admin access required'); return; }
        throw new Error('Failed to fetch feedback');
      }
      const data = await response.json();
      setFeedbackEntries(data);
    } catch (err: any) {
      console.error('Error fetching feedback:', err);
      notifyError(err?.message || 'Failed to load feedback');
    } finally {
      setLoading(false);
    }
  };

  const handleAffirmationModerate = async (id: string, action: 'approve' | 'reject') => {
    if (action === 'reject' && !confirm('Are you sure you want to reject this affirmation?')) return;
    setProcessingId(id);
    try {
      await moderateAffirmation(id, action);
      notifySuccess(`Affirmation ${action === 'approve' ? 'approved' : 'rejected'}`);
      fetchAffirmationSubmissions();
    } catch (err: any) {
      console.error(`Error ${action}ing affirmation:`, err);
      notifyError(err?.message || `Failed to ${action} affirmation`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleToggleAnonymous = async (id: string) => {
    setProcessingId(id);
    try {
      await moderateAffirmation(id, 'toggle_anonymous');
      notifySuccess('Anonymous setting toggled');
      fetchAffirmationSubmissions();
    } catch (err: any) {
      console.error('Error toggling anonymous:', err);
      notifyError(err?.message || 'Failed to toggle anonymous');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeleteAffirmation = async (id: string) => {
    if (!confirm('Are you sure you want to permanently delete this affirmation?')) return;
    setProcessingId(id);
    try {
      await moderateAffirmation(id, 'delete');
      notifySuccess('Affirmation deleted');
      fetchAffirmationSubmissions();
    } catch (err: any) {
      console.error('Error deleting affirmation:', err);
      notifyError(err?.message || 'Failed to delete affirmation');
    } finally {
      setProcessingId(null);
    }
  };

  const fetchApprovedUsers = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        notifyError('Not authenticated');
        return;
      }

      const response = await fetch('/.netlify/functions/getApprovedUsers', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 403) {
          notifyError('Admin access required');
          return;
        }
        throw new Error('Failed to fetch approved users');
      }

      const data = await response.json();
      setApprovedUsers(data);
    } catch (err: any) {
      console.error('Error fetching approved users:', err);
      notifyError(err?.message || 'Failed to load approved users');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (requestId: string, email: string) => {
    setProcessingId(requestId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        notifyError('Not authenticated');
        return;
      }

      const response = await fetch('/.netlify/functions/approveAccessRequest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ requestId }),
      });

      if (!response.ok) {
        throw new Error('Failed to approve access request');
      }

      notifySuccess(`Approved access for ${email}`);
      fetchRequests(); // Refresh the list
    } catch (err: any) {
      console.error('Error approving request:', err);
      notifyError(err?.message || 'Failed to approve request');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (requestId: string, email: string) => {
    if (!confirm(`Are you sure you want to reject the access request from ${email}?`)) {
      return;
    }

    setProcessingId(requestId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        notifyError('Not authenticated');
        return;
      }

      const response = await fetch('/.netlify/functions/rejectAccessRequest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ requestId }),
      });

      if (!response.ok) {
        throw new Error('Failed to reject access request');
      }

      notifySuccess(`Rejected access request from ${email}`);
      fetchRequests(); // Refresh the list
    } catch (err: any) {
      console.error('Error rejecting request:', err);
      notifyError(err?.message || 'Failed to reject request');
    } finally {
      setProcessingId(null);
    }
  };

  const handleResendInvitation = async (approvedUserId: string, email: string) => {
    setProcessingId(approvedUserId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        notifyError('Not authenticated');
        return;
      }

      const response = await fetch('/.netlify/functions/resendInvitation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ approvedUserId, email }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || 'Failed to resend invitation');
      }

      notifySuccess(`Invitation email resent to ${email}`);
    } catch (err: any) {
      console.error('Error resending invitation:', err);
      notifyError(err?.message || 'Failed to resend invitation');
    } finally {
      setProcessingId(null);
    }
  };

  const handleRevoke = async (approvedUserId: string, email: string) => {
    if (!confirm(`Are you sure you want to revoke access for ${email}? This will prevent them from registering new accounts.`)) {
      return;
    }

    setProcessingId(approvedUserId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        notifyError('Not authenticated');
        return;
      }

      const response = await fetch('/.netlify/functions/revokeAccess', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ approvedUserId }),
      });

      if (!response.ok) {
        throw new Error('Failed to revoke access');
      }

      notifySuccess(`Revoked access for ${email}`);
      fetchApprovedUsers(); // Refresh the list
    } catch (err: any) {
      console.error('Error revoking access:', err);
      notifyError(err?.message || 'Failed to revoke access');
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusColor = (status: string): "default" | "success" | "error" | "warning" => {
    switch (status) {
      case 'approved': return 'success';
      case 'rejected': return 'error';
      case 'pending': return 'warning';
      default: return 'default';
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Box className="p-6">
      <div className="flex justify-between items-center mb-6">
        <Typography variant="h4">Admin Workspace</Typography>
        <Tooltip title="Refresh">
          <span>
            <IconButton onClick={() => {
              if (activeTab === 0) fetchRequests();
              else if (activeTab === 1) fetchApprovedUsers();
              else if (activeTab === 2) fetchAffirmationSubmissions();
              else fetchFeedback();
            }} disabled={loading}>
              <RefreshCw className={loading ? 'animate-spin' : ''} />
            </IconButton>
          </span>
        </Tooltip>
      </div>

      <StyledTabs 
        value={activeTab} 
        onChange={(_, newValue) => setActiveTab(newValue)} 
        className="mb-6 focus:outline-none border-b-2 border-gray-20 dark:border-gray-80 overflow-x-auto"
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        aria-label="Admin Tabs"
        >
        <StyledTab className='focus:ring-0 focus:ring-offset-0' label="Access Requests" icon={<CircleQuestionMark className="w-4 h-4" />} iconPosition="start" />
        <StyledTab className='focus:ring-0 focus:ring-offset-0' label="Approved Users" icon={<UserCheck className="w-4 h-4" />} iconPosition="start" />
        <StyledTab className='focus:ring-0 focus:ring-offset-0' label="Affirmation Submissions" icon={<ThumbsUpIcon className="w-4 h-4" />} iconPosition="start" />
        <StyledTab className='focus:ring-0 focus:ring-offset-0' label="Feedback" icon={<MessageSquare className="w-4 h-4" />} iconPosition="start" />
      </StyledTabs>

      {activeTab === 0 && (
        <>
          <div className="flex gap-4 mb-6">
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>Status Filter</InputLabel>
              <Select
                value={statusFilter}
                label="Status Filter"
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <MenuItem value="pending">Pending</MenuItem>
                <MenuItem value="approved">Approved</MenuItem>
                <MenuItem value="rejected">Rejected</MenuItem>
                <MenuItem value="all">All</MenuItem>
              </Select>
            </FormControl>
          </div>

          {loading ? (
            <div className="flex justify-center items-center h-64">
              <CircularProgress />
            </div>
          ) : requests.length === 0 ? (
            <Paper className="p-8 text-center">
              <Typography variant="body1" color="text.secondary">
                No {statusFilter !== 'all' ? statusFilter : ''} access requests found
              </Typography>
            </Paper>
          ) : (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Email</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell>Message</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Requested</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {requests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell>{request.email}</TableCell>
                      <TableCell>{request.name || '—'}</TableCell>
                      <TableCell>
                        <div className="max-w-xs truncate" title={request.message || ''}>
                          {request.message || '—'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={request.status}
                          color={getStatusColor(request.status)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{formatDate(request.requested_at)}</TableCell>
                      <TableCell align="right">
                        {request.status === 'pending' && (
                          <div className="flex gap-2 justify-end">
                            <Tooltip title="Approve">
                              <Button
                                variant="contained"
                                color="success"
                                size="small"
                                onClick={() => handleApprove(request.id, request.email)}
                                disabled={processingId === request.id}
                                startIcon={processingId === request.id ? <CircularProgress size={16} /> : <Check className="w-4 h-4" />}
                              >
                                Approve
                              </Button>
                            </Tooltip>
                            <Tooltip title="Reject">
                              <Button
                                variant="outlined"
                                color="error"
                                size="small"
                                onClick={() => handleReject(request.id, request.email)}
                                disabled={processingId === request.id}
                                startIcon={<X className="w-4 h-4" />}
                              >
                                Reject
                              </Button>
                            </Tooltip>
                          </div>
                        )}
                        {request.status !== 'pending' && (
                          <Typography variant="caption" color="text.secondary">
                            {request.reviewed_at ? formatDate(request.reviewed_at) : '—'}
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}

      {activeTab === 1 && (
        <>
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <CircularProgress />
            </div>
          ) : approvedUsers.length === 0 ? (
            <Paper className="p-8 text-center">
              <Typography variant="body1" color="text.secondary">
                No approved users found
              </Typography>
            </Paper>
          ) : (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Email</TableCell>
                    <TableCell>Registered</TableCell>
                    <TableCell>Username</TableCell>
                    <TableCell>Full Name</TableCell>
                    <TableCell>Tier</TableCell>
                    <TableCell>Approved</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {approvedUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        {user.hasProfile ? (
                          <Chip label="Yes" color="success" size="small" />
                        ) : (
                          <Chip label="Not yet" color="default" size="small" />
                        )}
                      </TableCell>
                      <TableCell>{user.username || '—'}</TableCell>
                      <TableCell>{user.fullName || '—'}</TableCell>
                      <TableCell>
                        {!user.hasProfile ? (
                          <Typography variant="caption" color="text.secondary">—</Typography>
                        ) : user.isAdmin ? (
                          <Chip label="Admin" color="secondary" size="small" />
                        ) : user.tier === 'subscription' ? (
                          <Chip label="Pro" color="success" size="small" />
                        ) : user.tier === 'one_time' ? (
                          <Chip label="Lifetime" color="info" size="small" />
                        ) : (
                          <Chip label="Free" size="small" />
                        )}
                      </TableCell>
                      <TableCell>{formatDate(user.approved_at)}</TableCell>
                      <TableCell className='flex flex-wrap w-40 gap-4 items-start justify-start space-x-2' align="right">
                        <Tooltip className='w-auto' title="Resend invitation" arrow placement="top">
                          <Button
                            // variant="outlined"
                            className='button-ghost'
                            color="error"
                            size="small"
                            onClick={() => handleResendInvitation(user.id, user.email)}
                            disabled={processingId === user.id}
                            startIcon={processingId === user.id ? <CircularProgress size={16} /> : <Mail className="w-4 h-4" />}
                            >
                            Resend
                          </Button>
                        </Tooltip>
                        <Tooltip className='w-auto' title="Revoke access" arrow placement="top">
                          <Button
                            // variant="outlined"
                            className='button-ghost'
                            color="error"
                            size="small"
                            onClick={() => handleRevoke(user.id, user.email)}
                            disabled={processingId === user.id}
                            startIcon={processingId === user.id ? <CircularProgress size={16} /> : <UserMinus className="w-4 h-4" />}
                            >
                            Revoke
                          </Button>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}

      {activeTab === 2 && (
        <>
          <div className="flex gap-4 mb-6">
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>Status Filter</InputLabel>
              <Select
                value={affirmationFilter}
                label="Status Filter"
                onChange={(e) => setAffirmationFilter(e.target.value)}
              >
                <MenuItem value="pending">Pending</MenuItem>
                <MenuItem value="approved">Approved</MenuItem>
                <MenuItem value="rejected">Rejected</MenuItem>
                <MenuItem value="all">All</MenuItem>
              </Select>
            </FormControl>
          </div>

          {loading ? (
            <div className="flex justify-center items-center h-64">
              <CircularProgress />
            </div>
          ) : affirmations.length === 0 ? (
            <Paper className="p-8 text-center">
              <Typography variant="body1" color="text.secondary">
                No {affirmationFilter !== 'all' ? affirmationFilter : ''} affirmation submissions found
              </Typography>
            </Paper>
          ) : (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Text</TableCell>
                    <TableCell>Submitted By</TableCell>
                    <TableCell>Category</TableCell>
                    <TableCell>Anonymous</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Submitted</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {affirmations.map((aff) => (
                    <TableRow key={aff.id}>
                      <TableCell>
                        <div className="max-w-md" title={aff.text}>
                          {aff.text}
                        </div>
                      </TableCell>
                      <TableCell>
                        {aff.submitter_username || aff.submitter_email || '—'}
                      </TableCell>
                      <TableCell>{aff.category}</TableCell>
                      <TableCell>
                        <Tooltip title={aff.is_anonymous ? 'Click to make public' : 'Click to make anonymous'}>
                          <Switch
                            checked={aff.is_anonymous}
                            onChange={() => handleToggleAnonymous(aff.id)}
                            disabled={processingId === aff.id}
                            size="small"
                          />
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={aff.status}
                          color={getStatusColor(aff.status)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{formatDate(aff.created_at)}</TableCell>
                      <TableCell align="right">
                        <div className="flex gap-2 justify-end">
                          {aff.status === 'pending' && (
                            <>
                              <Tooltip title="Approve">
                                <Button
                                  variant="contained"
                                  color="success"
                                  size="small"
                                  onClick={() => handleAffirmationModerate(aff.id, 'approve')}
                                  disabled={processingId === aff.id}
                                  startIcon={processingId === aff.id ? <CircularProgress size={16} /> : <Check className="w-4 h-4" />}
                                >
                                  Approve
                                </Button>
                              </Tooltip>
                              <Tooltip title="Reject">
                                <Button
                                  variant="outlined"
                                  color="error"
                                  size="small"
                                  onClick={() => handleAffirmationModerate(aff.id, 'reject')}
                                  disabled={processingId === aff.id}
                                  startIcon={<X className="w-4 h-4" />}
                                >
                                  Reject
                                </Button>
                              </Tooltip>
                            </>
                          )}
                          {aff.status !== 'pending' && (
                            <Typography variant="caption" color="text.secondary" className="self-center mr-2">
                              {aff.updated_at ? formatDate(aff.updated_at) : '—'}
                            </Typography>
                          )}
                          <Tooltip title="Delete">
                            <IconButton
                              color="error"
                              size="small"
                              onClick={() => handleDeleteAffirmation(aff.id)}
                              disabled={processingId === aff.id}
                            >
                              <Trash2 className="w-4 h-4" />
                            </IconButton>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}
      {activeTab === 3 && (
        <>
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <CircularProgress />
            </div>
          ) : feedbackEntries.length === 0 ? (
            <Paper className="p-8 text-center">
              <Typography variant="body1" color="text.secondary">
                No feedback submissions yet
              </Typography>
            </Paper>
          ) : (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>NPS Score</TableCell>
                    <TableCell>Message</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>GitHub Issue</TableCell>
                    <TableCell>Submitted</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {feedbackEntries.map((entry) => {
                    const scoreColor = entry.nps_score <= 5 ? 'error' : entry.nps_score <= 8 ? 'warning' : 'success';
                    return (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <Chip
                            label={entry.nps_score}
                            color={scoreColor as 'error' | 'warning' | 'success'}
                            size="small"
                            sx={{ fontWeight: 700, minWidth: 40 }}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="max-w-sm" title={entry.message || ''}>
                            {entry.message || <span className="text-gray-400 italic">No comment</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          {entry.include_email && entry.user_email ? (
                            <span>{entry.user_email}</span>
                          ) : (
                            <span className="text-gray-400 italic">Anonymous</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {entry.github_issue_url ? (
                            <a
                              href={entry.github_issue_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand-60 underline text-sm"
                            >
                              View Issue
                            </a>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </TableCell>
                        <TableCell>{formatDate(entry.created_at)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}
    </Box>
  );
};

export default AdminAccessRequests;
