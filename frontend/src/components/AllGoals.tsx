import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { fetchAllGoalsIndexed, fetchAllGoals, deleteGoal, updateGoal, saveSummary, UserCategories, initializeUserCategories, addCategory, getWeekStartDate, indexDataByScope, applyHighlight } from '../utils/functions';
import GoalCard from '@components/GoalCard';
import GoalCompletionDonut from '@components/GoalCompletionDonut';
import GoalForm from '@components/GoalForm';
import TasksList from '@components/TasksList';
import TaskCard from '@components/TaskCard';
import AllTasksCalendar from '@components/AllTasksCalendar';
import TasksKanban from '@components/TasksKanban';
import Modal from 'react-modal';
import ConfirmModal from './ConfirmModal';
import WinsModal from './WinsModal';
import SummaryGenerator from '@components/SummaryGenerator';
import WinEditor from './WinEditor';
import SummaryEditor from '@components/SummaryEditor';
import GoalEditor from '@components/GoalEditor';
import { modalClasses, overlayClasses } from '@styles/classes';
import { ARIA_HIDE_APP } from '@lib/modal';
import { Goal as GoalUtilsGoal, Task, calculateGoalCompletion } from '@utils/goalUtils';
import { mapPageForScope, loadPageByScope, savePageByScope } from '@utils/pagination';
import 'react-datepicker/dist/react-datepicker.css';
// import * as goalUtils from '@utils/goalUtils';
import 'react-datepicker/dist/react-datepicker.css';
import { X as CloseButton, Search as SearchIcon, Filter as FilterIcon, PlusIcon, ArrowUp, ArrowDown, CalendarIcon, Check, TagIcon, Table2Icon, LayoutGrid, Kanban, CalendarDays, Edit, Trash, ChevronRight, ChevronDown, Award, FileText as NotesIcon, Save as SaveIcon, CheckSquare2, SquareSlash, ListTodo, MoreVertical, Expand, Shrink, XCircleIcon, Target, Bell, Archive, Sparkles } from 'lucide-react';
import { useGoalsContext } from '@context/GoalsContext';
import { useTimezone } from '@context/TimezoneContext';
import { convertToUTC } from '@utils/timezone';
import useGoalExtras from '@hooks/useGoalExtras';
// notify helpers imported where needed below
import { TextField, InputAdornment, IconButton, FormControl, InputLabel, Select, MenuItem, Tooltip, Menu, Chip, Badge, Checkbox, ListItemText, ToggleButtonGroup, ToggleButton, Table, TableHead, TableBody, TableRow, TableCell, Paper, Typography, Switch, FormControlLabel, useMediaQuery, Button, Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
// dnd-kit was attempted but failed to install; use HTML5 drag/drop fallback
import { useTheme } from '@mui/material/styles';
import supabase from '@lib/supabase';
import { STATUS_COLORS, STATUSES } from '../constants/statuses';
import { notifyError, notifySuccess, notifyWithUndo, notifyTierLimit } from '@components/ToastyNotification';
import { DatePicker, DateTimePicker, LocalizationProvider, TimePicker } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import type { Dayjs } from 'dayjs';
import type { ChangeEvent } from 'react';
import LoadingSpinner from './LoadingSpinner';
import { useTier } from '@hooks/useTier';
import UpgradePrompt from '@components/UpgradePrompt';
// import { Tab } from '@headlessui/react';
type Goal = GoalUtilsGoal & {
  created_at?: string;
};

// Inline per-goal status component (shows completion donut)
const InlineStatus: React.FC<{ tasks?: Task[] }> = ({ tasks = [] }) => {
    const completion = calculateGoalCompletion(tasks);
    
    return (
        <div className="flex items-center justify-center">
            {tasks && tasks.length > 0 && (
                <GoalCompletionDonut percentage={completion} size={50} strokeWidth={4} />
            )}
        </div>
    );
};

// Skeleton placeholder shown while a new goal is being created optimistically
const GoalCardSkeleton: React.FC = () => (
    <div className="animate-pulse shadow-xl rounded-lg p-4 flex flex-col h-full w-full border-2 border-transparent bg-background-color">
        <div className="goal-header flex flex-row w-full justify-between items-start mb-4">
            <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700" />
            <div className="h-4 rounded bg-gray-200 dark:bg-gray-700 w-1/3" />
        </div>
        <div className="flex flex-col gap-2 flex-grow">
            <div className="h-6 rounded bg-gray-200 dark:bg-gray-700 w-3/4" />
            <div className="h-4 rounded bg-gray-200 dark:bg-gray-700 w-full" />
            <div className="h-4 rounded bg-gray-200 dark:bg-gray-700 w-5/6" />
        </div>
        <div className="flex gap-2 mt-4">
            <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700" />
            <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700" />
            <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700" />
        </div>
    </div>
);

const GoalsComponent = () => {
    const { canCreateGoal, remainingGoals, isFree } = useTier();
    const { refreshGoals: ctxRefresh, removeGoalFromCache, updateGoalInCache, lastUpdated, lastAddedIds, setLastAddedIds, goals: ctxGoals } = useGoalsContext();
    // helper to toggle table sorting from header clicks
    const toggleSort = (field: 'date' | 'category' | 'status' | 'title') => {
        if (sortBy === field) {
            setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortBy(field);
            setSortDirection('asc');
        }
    };

    const [indexedGoals, setIndexedGoals] = useState<Record<string, Goal[]>>({});
    const indexedGoalsRef = useRef<Record<string, Goal[]>>({});
    const [pages, setPages] = useState<string[]>([]);
    const [currentPage, setCurrentPage] = useState<string>('');
    const currentPageRef = useRef<string>(currentPage);
    // Remember last selected page per scope so switching maintains context
    const [pageByScope, setPageByScope] = useState<Record<string, string>>({});
    const [scope, setScope] = useState<'week' | 'month' | 'year'>('week');
    const prevScopeRef = useRef<string>(scope);
    const pageByScopeRef = useRef<Record<string, string>>(pageByScope);
    const initializedRef = useRef<boolean>(false);
    const fetchIdRef = useRef(0);
    const lastSwitchFromRef = useRef<string | null>(null);
    // Default: Date Descending
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
    const [sortBy, setSortBy] = useState<'date' | 'category' | 'status' | 'title'>('status');
    const [sortAnchorEl, setSortAnchorEl] = useState<HTMLElement | null>(null);
    const [isGoalModalOpen, setIsGoalModalOpen] = useState(false); // Modal state
    const [goalFormProgress, setGoalFormProgress] = useState(0);
    const [isEditorOpen, setIsEditorOpen] = useState(false); // Editor modal state
    // Add menu (goal vs task choice)
    const [addMenuAnchorEl, setAddMenuAnchorEl] = useState<HTMLElement | null>(null);
    // Standalone "Add a task" modal state
    const [isAddTaskModalOpen, setIsAddTaskModalOpen] = useState(false);
    const [standaloneNewTask, setStandaloneNewTask] = useState<Partial<Task>>({ title: '', description: '' });
    const [standaloneTaskGoalId, setStandaloneTaskGoalId] = useState<string>('');
    const [standaloneCreateNewGoal, setStandaloneCreateNewGoal] = useState(false);
    const [standaloneNewGoalTitle, setStandaloneNewGoalTitle] = useState('');
    const [standaloneNewGoalCategory, setStandaloneNewGoalCategory] = useState('General');
    // Date/time picker + reminder state for standalone Add Task modal
    const [standaloneSelectedDate, setStandaloneSelectedDate] = useState<Dayjs | null>(null);
    const [standaloneSelectedTime, setStandaloneSelectedTime] = useState<Dayjs | null>(null);
    const [standaloneReminderEnabled, setStandaloneReminderEnabled] = useState(false);
    const [standaloneReminderOffset, setStandaloneReminderOffset] = useState('30');
    const [standaloneReminderDatetime, setStandaloneReminderDatetime] = useState('');
    const [standaloneSelectedReminderDatetime, setStandaloneSelectedReminderDatetime] = useState<Dayjs | null>(null);
    const [isGeneratingTasks, setIsGeneratingTasks] = useState(false);
    const [newGoal, setNewGoal] = useState<Goal>({
        id: '',
        title: '',
        description: '',
        category: '',
        week_start: '',
        user_id: '',
        created_at: '',
        status: 'Not started',
        status_notes: '',
    });
    const [selectedGoal, setSelectedGoal] = useState<{
        id: string;
        user_id: string;
        title: string;
        description: string;
        category: string;
        week_start: string;
        created_at: string;
        status?: string | null;
        status_notes?: string | null;
    } | null>(null);
    const [filter, setFilter] = useState<string>('');
    // Debounced version of `filter` — expensive filtering computations use this so
    // they don't fire on every keystroke. The raw `filter` is still used as the
    // controlled input value so the text field responds instantly.
    const [debouncedFilter, setDebouncedFilter] = useState<string>('');
    const [filterFocused, setFilterFocused] = useState<boolean>(false);
    const [clearButtonFocused, setClearButtonFocused] = useState<boolean>(false);
    const [searchBarOpen, setSearchBarOpen] = useState<boolean>(false);
    // Per-row actions menu state (used in table view)
    const [rowActionsAnchorEl, setRowActionsAnchorEl] = useState<HTMLElement | null>(null);
    const [rowActionsTargetId, setRowActionsTargetId] = useState<string | null>(null);
    // Delete confirm modal state
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState<boolean>(false);
    const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
    // Archive confirm modal state
    const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState<boolean>(false);
    const [archiveTargetGoal, setArchiveTargetGoal] = useState<Goal | null>(null);
    const [isArchiving, setIsArchiving] = useState(false);
    // shared wins/notes hook
    const goalExtras = useGoalExtras();
    const { timezone } = useTimezone();
    
    const {
    wins,
    winCountMap,
    isWinLoading,
    isWinModalOpen,
    isEditWinModalOpen,
    selectedWin,
    setSelectedWin,
    setIsEditWinModalOpen,
    deleteWin,
    createWin,
    saveEditedWin,
    openWins,
    closeWins,
    notes,
    notesCountMap,
    isNotesLoading,
    isNotesModalOpen,
    newNoteContent,
    setNewNoteContent,
    editingNoteId,
    setEditingNoteId,
    editingNoteContent,
    setEditingNoteContent,
        openNotes,
        closeNotes,
        createNote,
        updateNote,
        deleteNote,
        fetchNotesCount,
        fetchWinsCount,
        fetchCountsForMany,
    } = goalExtras;
    const [selectedSummary, setSelectedSummary] = useState<{ id: string; content?: string; type?: string; title?: string } | null>(null);
    const [noteDeleteTarget, setNoteDeleteTarget] = useState<string | null>(null);
    // Tasks state
    const [isTasksModalOpen, setIsTasksModalOpen] = useState(false);
    const [tasksCount, setTasksCount] = useState(0);
    const [tasksGoalId, setTasksGoalId] = useState<string | null>(null);
    // simple caches
    
    const filterInputRef = useRef<HTMLInputElement | null>(null);
    const blurTimeoutRef = useRef<number | null>(null);
        // Filter popover state and criteria
    const [filterPanelOpen, setFilterPanelOpen] = useState(false);
    const [filterStatus, setFilterStatus] = useState<string[]>([]);
    const [filterCategory, setFilterCategory] = useState<string[]>([]);
    const [showArchived, setShowArchived] = useState(false);
    const [filterGoal, setFilterGoal] = useState<string[]>([]);
    const [filterScope, setFilterScope] = useState<string[]>([]);
    const [filterStartDate, setFilterStartDate] = useState<Dayjs | null>(null);
    const [filterEndDate, setFilterEndDate] = useState<Dayjs | null>(null);
    const [summaryAnchorEl, setSummaryAnchorEl] = useState<HTMLElement | null>(null);
    // Bulk action UI state
    const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);
    const [bulkActionLoading, setBulkActionLoading] = useState(false);
    const [bulkStatusAnchorEl, setBulkStatusAnchorEl] = useState<HTMLElement | null>(null);
    const [bulkCategoryAnchorEl, setBulkCategoryAnchorEl] = useState<HTMLElement | null>(null);
    // Fallback anchor positions (used when the clicked element isn't attached to the document)
    const [bulkStatusAnchorPos, setBulkStatusAnchorPos] = useState<{ top: number; left: number } | null>(null);
    const [bulkCategoryAnchorPos, setBulkCategoryAnchorPos] = useState<{ top: number; left: number } | null>(null);
    // Always remember the last click position so we can fallback to it if the
    // anchorEl is removed from the DOM (e.g. when switching views quickly).
    const [bulkStatusLastClickPos, setBulkStatusLastClickPos] = useState<{ top: number; left: number } | null>(null);
    const [bulkCategoryLastClickPos, setBulkCategoryLastClickPos] = useState<{ top: number; left: number } | null>(null);
    // Refs for the buttons that open the bulk menus. We restore focus to these
    // when the menu closes to avoid aria-hidden being applied while a focused
    // element remains inside the menu (which triggers accessibility warnings).
    const bulkStatusTriggerRef = useRef<HTMLButtonElement | null>(null);
    const bulkCategoryTriggerRef = useRef<HTMLButtonElement | null>(null);

    const handleCloseBulkStatus = () => {
        try { bulkStatusTriggerRef.current?.focus(); } catch (e) { /* ignore */ }
        setBulkStatusAnchorEl(null);
        setBulkStatusAnchorPos(null);
    };

    const handleCloseBulkCategory = () => {
        try { bulkCategoryTriggerRef.current?.focus(); } catch (e) { /* ignore */ }
        setBulkCategoryAnchorEl(null);
        setBulkCategoryAnchorPos(null);
    };

    // If an anchorEl becomes detached while the menu is open (happens when switching views),
    // fallback to the last click position so the menu remains visible instead of throwing MUI warnings.
    useEffect(() => {
        if (bulkStatusAnchorEl && !document.body.contains(bulkStatusAnchorEl)) {
            if (bulkStatusLastClickPos) {
                setBulkStatusAnchorPos(bulkStatusLastClickPos);
                setBulkStatusAnchorEl(null);
            }
        }
    }, [bulkStatusAnchorEl, bulkStatusLastClickPos]);

    useEffect(() => {
        if (bulkCategoryAnchorEl && !document.body.contains(bulkCategoryAnchorEl)) {
            if (bulkCategoryLastClickPos) {
                setBulkCategoryAnchorPos(bulkCategoryLastClickPos);
                setBulkCategoryAnchorEl(null);
            }
        }
    }, [bulkCategoryAnchorEl, bulkCategoryLastClickPos]);

    // Bulk action helpers
    const applyBulkStatus = async (status: string) => {
        setBulkActionLoading(true);
        try {
            const ids = Array.from(selectedIds).filter((id) => !id?.toString()?.startsWith?.('temp-'));
            if (ids.length === 0) {
                notifySuccess('No persisted goals selected');
            } else {
                // Run updates in parallel for speed; collect results so we can refresh after all complete
                const promises = ids.map((id) => updateGoal(id, { status: status as any }).then(() => ({ id, ok: true })).catch((err) => ({ id, ok: false, err })));
                const results = await Promise.all(promises);
                const successCount = results.filter((r) => r && (r as any).ok).length;
                const failCount = results.length - successCount;
                if (successCount > 0) notifySuccess(`Updated status for ${successCount} goals`);
                if (failCount > 0) notifyError(`Failed to update ${failCount} goals`);
            }
        } catch (err) {
            console.error('Bulk status update failed', err);
            notifyError('Failed to update some goals');
        } finally {
            setBulkActionLoading(false);
            setBulkStatusAnchorEl(null);
            clearSelection();
            // Ensure both the global cache and this component's indexed state are refreshed
            // Awaiting here makes the refresh consistent; keep it quick by letting the
            // context refresh run first (it may be cached) and then refetch the indexed goals.
            (async () => {
                try {
                    if (typeof ctxRefresh === 'function') await ctxRefresh();
                } catch (e) {
                    console.warn('[AllGoals] ctxRefresh after bulk status failed (ignored):', e);
                }
                try {
                    await refreshGoals();
                } catch (e) {
                    console.warn('[AllGoals] refreshGoals after bulk status failed (ignored):', e);
                }
            })();
        }
    };

    const applyBulkCategory = async (category: string) => {
        setBulkActionLoading(true);
        try {
            const ids = Array.from(selectedIds).filter((id) => !id?.toString()?.startsWith?.('temp-'));
            if (ids.length === 0) {
                notifySuccess('No persisted goals selected');
            } else {
                const promises = ids.map((id) => updateGoal(id, { category } as any).then(() => ({ id, ok: true })).catch((err) => ({ id, ok: false, err })));
                const results = await Promise.all(promises);
                const successCount = results.filter((r) => r && (r as any).ok).length;
                const failCount = results.length - successCount;
                if (successCount > 0) notifySuccess(`Updated category for ${successCount} goals`);
                if (failCount > 0) notifyError(`Failed to update ${failCount} goals`);
            }
        } catch (err) {
            console.error('Bulk category update failed', err);
            notifyError('Failed to update some goals');
        } finally {
            setBulkActionLoading(false);
            setBulkCategoryAnchorEl(null);
            clearSelection();
            (async () => {
                try {
                    if (typeof ctxRefresh === 'function') await ctxRefresh();
                } catch (e) {
                    console.warn('[AllGoals] ctxRefresh after bulk category failed (ignored):', e);
                }
                try {
                    await refreshGoals();
                } catch (e) {
                    console.warn('[AllGoals] refreshGoals after bulk category failed (ignored):', e);
                }
            })();
        }
    };



        // filter popover anchor is controlled via `filterAnchorEl` and setFilterAnchorEl

    // derive category options from the currently loaded goals (only categories actually used by goals)
    const allLoadedGoals = Object.values(indexedGoals).flat();
    const categoryOptions = Array.from(new Set(allLoadedGoals.map((g) => (g.category || '').toString()).filter(Boolean)));
        // task status options (fixed list)
        const statusOptions = [...STATUSES];

    // Count of active filters to display as a badge on the filter button
    const selectedFiltersCount =
        (filterStatus?.length || 0) +
        (filterCategory?.length || 0) +
        (filterGoal?.length || 0) +
        (filterScope?.length || 0) +
        (filterStartDate && filterEndDate ? 1 : 0) +
        (showArchived ? 1 : 0);

    const theme = useTheme();
    const isSmall = useMediaQuery(theme.breakpoints.down('sm'));
    // view mode: 'cards' (default), 'table', 'kanban', or 'tasks-calendar'
    const [viewMode, setViewMode] = useState<'cards' | 'table' | 'kanban' | 'tasks-calendar'>(() => {
        try {
            const v = localStorage.getItem('goals_view_mode');
            if (v === 'cards' || v === 'table' || v === 'kanban' || v === 'tasks-calendar') return v;
        } catch (e) {
            // ignore
        }
        return 'cards';
    });

    // Kanban tasks state
    const [kanbanTasks, setKanbanTasks] = useState<Record<string, Task[]>>({});

    // Keep kanban/table task arrays in sync with mutations that happen inside modals
    // (e.g. TasksList opened from GoalCard/GoalKanbanCard dispatching 'task:updated')
    useEffect(() => {
        const applyUpdate = (arr: Task[], taskId: string, status?: string, updates?: Partial<Task>) =>
            arr.map(t =>
                t.id === taskId
                    ? { ...t, ...(status !== undefined ? { status } : {}), ...(updates ?? {}) }
                    : t
            );
        const handleTaskUpdated = (e: Event) => {
            const { taskId, goalId, status, updates } = (e as CustomEvent).detail ?? {};
            if (!goalId) return;
            setKanbanTasks(prev =>
                prev[goalId] ? { ...prev, [goalId]: applyUpdate(prev[goalId], taskId, status, updates) } : prev
            );
            setTableTasksByGoal(prev =>
                prev[goalId] ? { ...prev, [goalId]: applyUpdate(prev[goalId], taskId, status, updates) } : prev
            );
        };
        const handleTaskDeleted = (e: Event) => {
            const { taskId, goalId } = (e as CustomEvent).detail ?? {};
            if (!goalId) return;
            setKanbanTasks(prev =>
                prev[goalId] ? { ...prev, [goalId]: prev[goalId].filter(t => t.id !== taskId) } : prev
            );
            setTableTasksByGoal(prev =>
                prev[goalId] ? { ...prev, [goalId]: prev[goalId].filter(t => t.id !== taskId) } : prev
            );
        };
        window.addEventListener('task:updated', handleTaskUpdated as EventListener);
        window.addEventListener('task:deleted', handleTaskDeleted as EventListener);
        return () => {
            window.removeEventListener('task:updated', handleTaskUpdated as EventListener);
            window.removeEventListener('task:deleted', handleTaskDeleted as EventListener);
        };
    }, []);
    
    // Notification-triggered task edit modal state
    const [notificationTaskModalOpen, setNotificationTaskModalOpen] = useState(false);
    const [notificationTask, setNotificationTask] = useState<Task | null>(null);

    const handleChangeView = (_: React.MouseEvent<HTMLElement>, value: 'cards' | 'table' | 'kanban' | 'tasks-calendar' | null) => {
        if (!value) return;
        setViewMode(value);
        // Clear calendar task IDs when switching away from calendar view
        if (value !== 'tasks-calendar') {
            setCalendarTaskIds([]);
        }
        try { localStorage.setItem('goals_view_mode', value); } catch { /* ignore */ }
    };

    // Compute set of visible goal IDs based on active filters so Kanban can respect the same filter
    // NOTE: moved below after `sortedAndFilteredGoals` is declared to avoid TDZ errors

    // Drag & drop state for Kanban
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [isScopeLoading, setIsScopeLoading] = useState<boolean>(false);

    // Wrapper used to trace and centralize logging for scope-loading state.
    // This temporary debug helper assigns a short sequence id for each transition
    // and records timestamps and a short stack snippet so we can trace which
    // code path set/cleared the flag.
    // Debug logging was previously used here; keep minimal dev-only traces where
    // helpful. The detailed tracing wrapper has been removed to clean up the code.

    // Kanban columns mapping: status -> ordered array of goal ids
    const [kanbanColumns, setKanbanColumns] = useState<Record<string, string[]>>(() => {
        const statuses = ['Not started', 'In progress', 'Blocked', 'On hold', 'Done'];
        const out: Record<string, string[]> = {};
        for (const s of statuses) out[s] = [];
        return out;
    });

    // Cache full (unscoped) goals used by Kanban so board shows all goals by default
    const [fullGoals, setFullGoals] = useState<Goal[] | null>(null);

    // Column collapsed state for Kanban (allow user to hide/show a column)
    const [collapsedColumns, setCollapsedColumns] = useState<Record<string, boolean>>(() => {
        const statuses = ['Not started', 'In progress', 'Blocked', 'On hold', 'Done'];
        const out: Record<string, boolean> = {};
        for (const s of statuses) out[s] = false;
        return out;
    });

    // Track which empty columns the user has manually expanded (session-persisted)
    const [manuallyExpandedEmptyColumns, setManuallyExpandedEmptyColumns] = useState<Set<string>>(new Set());

    // Keep kanbanColumns in sync when indexedGoals change
    useEffect(() => {
    // Always show all goals (ignoring scope toggle)
    const useFull = !!fullGoals && fullGoals.length > 0;
    console.debug('[AllGoals] kanbanColumns effect running. useFull=', useFull, { viewMode, fullGoalsCount: fullGoals ? fullGoals.length : 0, indexedPages: Object.keys(indexedGoals).length, isScopeLoading });
    // If we're loading a new scope clear columns to avoid rendering stale IDs
    if (isScopeLoading && viewMode === 'kanban') {
    setKanbanColumns((_prev) => {
            const statuses = ['Not started', 'In progress', 'Blocked', 'On hold', 'Done'];
            const empty: Record<string, string[]> = {} as Record<string, string[]>;
            for (const s of statuses) empty[s] = [];
            return empty;
        });
        return;
    }
    const sourceGoals = fullGoals || Object.values(indexedGoals).flat();
        const statuses = ['Not started', 'In progress', 'Blocked', 'On hold', 'Done'];
        const cols: Record<string, string[]> = {} as Record<string, string[]>;
        for (const s of statuses) cols[s] = [];
        for (const g of sourceGoals.filter(goalMatchesFilters)) {
            const st = (g.status as string) || 'Not started';
            if (!cols[st]) cols[st] = [];
            cols[st].push(g.id);
        }
        setKanbanColumns(cols);
    }, [indexedGoals, viewMode, fullGoals, currentPage, filter, filterStatus, filterCategory, filterStartDate, filterEndDate, sortBy, sortDirection, kanbanTasks]);

    // Keep kanban columns updated when fullGoals or filters change
    useEffect(() => {
        if (viewMode !== 'kanban') return;
        if (!fullGoals) return;
        const statuses = ['Not started', 'In progress', 'Blocked', 'On hold', 'Done'];
        const cols: Record<string, string[]> = {} as Record<string, string[]>;
        for (const s of statuses) cols[s] = [];
        for (const g of fullGoals.filter(goalMatchesFilters)) {
            const st = (g.status as string) || 'Not started';
            if (!cols[st]) cols[st] = [];
            cols[st].push(g.id);
        }
        setKanbanColumns(cols);
    }, [fullGoals, filter, filterStatus, filterCategory, filterStartDate, filterEndDate, sortBy, sortDirection, viewMode, kanbanTasks]);

    // Fetch the full (unscoped) goals list when entering Kanban view
    useEffect(() => {
        let mounted = true;
        const load = async () => {
            if (viewMode !== 'kanban') return;
            try {
                const all = await fetchAllGoals();
                if (mounted) setFullGoals(all);
            } catch (err) {
                console.error('Failed to fetch full goals for kanban:', err);
            }
        };
        load();
        return () => { mounted = false; };
    }, [viewMode]);

    // HTML5 Drag & Drop Kanban handlers (visual feedback + reorder)
    const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);






    // Task drag & drop handlers for kanban
    const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);




    // Old HTML5 drag/drop handlers removed in favor of dnd-kit sortable implementation.

    // Set the default scope to the current week
            useEffect(() => {
                const today = new Date();
                const currentWeekStart = getWeekStartDate(today); // getWeekStartDate returns YYYY-MM-DD
                setScope('week'); // default scope
                // initialize per-scope page memory to persisted or current date equivalents
                const persisted = loadPageByScope() || {};
                const defaults = {
                    week: currentWeekStart,
                    month: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`,
                    year: `${today.getFullYear()}`,
                };
                setPageByScope((prev) => ({ ...defaults, ...persisted, ...prev }));
                setNewGoal((prevGoal) => ({ ...prevGoal, week_start: currentWeekStart }));
            }, []);

            useEffect(() => {
                    // helper to defer non-urgent work to idle time to avoid blocking the React scheduler
                    const scheduleIdle = (fn: () => void) => {
                        try {
                            if (typeof (window as any).requestIdleCallback === 'function') {
                                (window as any).requestIdleCallback(fn, { timeout: 300 });
                            } else {
                                setTimeout(fn, 0);
                            }
                        } catch (e) {
                            setTimeout(fn, 0);
                        }
                    };

                    const fetchGoalsAndCategories = async () => {
                    const id = ++fetchIdRef.current;
                    // If we have a global in-memory goals cache (from GoalsContext), prefer
                    // building an indexed view from it and skip the network entirely. This
                    // avoids refetches when the user already loaded goals earlier in the session.
                    try {
                        if (ctxGoals && ctxGoals.length > 0) {
                            // ctxGoals items don't include `scope`, add it transiently for indexing
                            const withScope = (ctxGoals as unknown as Goal[]).map((g) => ({ ...g, scope }));
                            const clientIndexed = indexDataByScope(withScope, scope);
                            const clientPages = Object.keys(clientIndexed).sort((a, b) => (a > b ? -1 : 1));
                            if (Object.keys(clientIndexed).length > 0) {
                                    // using client-indexed goals (no fetch)
                                    // Defer heavy state updates to idle time to keep main thread responsive
                                    scheduleIdle(async () => {
                                        setIndexedGoals(clientIndexed as Record<string, Goal[]>);
                                        setPages(clientPages);

                                        const cachedPage = pageByScopeRef.current[scope] || clientPages[0];
                                        if (!initializedRef.current) {
                                            setCurrentPage(cachedPage);
                                            currentPageRef.current = cachedPage;
                                            initializedRef.current = true;
                                        } else {
                                            const cp = currentPageRef.current || currentPage;
                                            if (!cp || !clientPages.includes(cp)) {
                                                setCurrentPage(clientPages[0]);
                                                currentPageRef.current = clientPages[0];
                                            }
                                        }

                                        prevScopeRef.current = scope;
                                        lastSwitchFromRef.current = null;
                                        try { await initializeUserCategories(); } catch (e) { /* ignore init failures */ }
                                        // We used cached client goals to populate pages; clear loading state
                                        setIsScopeLoading(false);
                                    });
                                    return;
                                }
                        }
                    } catch {
                        // ignore and fall back to server fetch
                    }
                    try {
                        // Fetch goals for the selected scope
                        console.debug('[AllGoals] fetchAllGoalsIndexed called with scope=', scope);
                        const { indexedGoals, pages } = await fetchAllGoalsIndexed(scope);
                        // If another fetch started after this one, ignore these results
                        if (id !== fetchIdRef.current) return;
                        // Compute desiredPage synchronously (cheap) so later logic can reference it,
                        // but defer heavy state writes (indexedGoals/pages) to idle time.
                        const prevScope = lastSwitchFromRef.current ?? prevScopeRef.current;
                        const remembered = pageByScope[scope] || pageByScopeRef.current[scope];
                        let desiredPage: string | undefined = remembered;
                        const prevSelected = pageByScopeRef.current[prevScope as string];
                        if (!desiredPage) {
                            if (prevScope !== scope && prevSelected) {
                                const mapped = mapPageForScope(prevSelected, scope, pages);
                                if (mapped) desiredPage = mapped;
                            } else {
                                desiredPage = mapPageForScope(prevSelected, scope, pages);
                            }
                        }

                        if (!desiredPage) {
                            const today = new Date();
                            if (scope === 'week') desiredPage = getWeekStartDate(today);
                            else if (scope === 'month') desiredPage = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
                            else desiredPage = `${today.getFullYear()}`;
                        }

                        // Defer heavy state updates to idle time to keep main thread responsive
                        scheduleIdle(() => {
                            setIndexedGoals(indexedGoals);
                            setPages(pages);
                            try { prevScopeRef.current = scope; } catch {}
                            try { lastSwitchFromRef.current = null; } catch {}
                            try { setIsScopeLoading(false); } catch {}
                        });

                                                // Development debug: show mapping inputs so we can repro scope-switch flips quickly
                                                // mapping debug removed for production

                        // If still no desired page, fall back to sensible defaults (current date)
                        if (!desiredPage) {
                            // Use computeDefaultForScope so defaults remain consistent across code paths
                            const { computeDefaultForScope } = await import('@utils/pagination');
                            desiredPage = computeDefaultForScope(scope);
                        }

                        // Scope-specific adjustments: prefer pages starting with the desired prefix
                        if (pages.length > 0) {
                            if (scope === 'week') {
                                if (desiredPage) {
                                    // Prefer an exact week match, then a page from the same month,
                                    // then the latest page <= today, then fallback to the first page.
                                    const exact = pages.find((p) => p === desiredPage);
                                    if (exact) desiredPage = exact;
                                    else {
                                        const monthPrefix = (desiredPage as string).slice(0, 7);
                                        const sameMonth = pages.find((p) => p.startsWith(monthPrefix));
                                        if (sameMonth) desiredPage = sameMonth;
                                        else {
                                            // find latest page <= today
                                            const today = new Date();
                                            let found: string | undefined;
                                            for (let i = pages.length - 1; i >= 0; i--) {
                                                const p = pages[i];
                                                const [y, m, d] = p.split('-').map(Number);
                                                const pageDate = new Date(y, (m || 1) - 1, d || 1);
                                                if (pageDate <= today) {
                                                    found = p;
                                                    break;
                                                }
                                            }
                                            desiredPage = found ?? pages[0];
                                        }
                                    }
                                } else {
                                    desiredPage = pages[0];
                                }
                            } else {
                                if (desiredPage) {
                                    const dp = desiredPage as string;
                                    const maybe = pages.find((p) => p.startsWith(dp));
                                    desiredPage = maybe || pages[0];
                                } else {
                                    desiredPage = pages[0];
                                }
                            }
                        }

                        // Only set the initial page on first successful fetch to avoid flip-flopping.
                        // On subsequent fetches, only update currentPage if the current value is missing
                        // from the newly-fetched pages (e.g., it was removed) to avoid switching views.
                        if (!initializedRef.current) {
                                                        const initial = desiredPage || (pages[0] ?? '');
                                                        // set initial page
                                                        setCurrentPage(initial);
                                                        currentPageRef.current = initial;
                                                        initializedRef.current = true;
                                                        // after setting initial page
                                                } else {
                                                        const cp = currentPageRef.current || currentPage;
                                                        if (!cp || !pages.includes(cp)) {
                                                                const fallback = desiredPage || (pages[0] ?? '');
                                                                // set fallback page
                                                                setCurrentPage(fallback);
                                                                currentPageRef.current = fallback;
                                                                // after setting fallback page
                                                        }
                                                }
                        
                // We've received scoped data — end the loading state.
                setIsScopeLoading(false);

                        // Keep track of the scope we just loaded so future mappings are correct
                        prevScopeRef.current = scope;
                        // Clear the last-switch marker now that we've handled the mapping
                        lastSwitchFromRef.current = null;

                        // Initialize user categories
                        await initializeUserCategories();
                    } catch (error) {
                        console.error('Error fetching goals or initializing categories:', error);
                            // Ensure we clear loading state on error so the UI doesn't stay blocked
                            try { setIsScopeLoading(false); } catch {}
                    }
                };

                fetchGoalsAndCategories();
                // debug logs removed after fixing mapping race conditions
            // The effect below intentionally only depends on `scope` to control when we fetch
            // goals from the server. `ctxGoals`, `currentPage`, and `pageByScope` are accessed
            // via refs or handled in separate effects to avoid refetch loops. If that behavior
            // needs to change, remove the eslint-disable and add the dependencies.
            // eslint-disable-next-line react-hooks/exhaustive-deps
            }, [scope]);

            // Mirror pageByScope into a ref to avoid re-running the fetch effect on its changes
            useEffect(() => { pageByScopeRef.current = pageByScope; }, [pageByScope]);

            // Keep indexedGoals in sync with the live context cache (ctxGoals) so that goals
            // added or updated via addGoalToCache / replaceGoalInCache appear immediately in the
            // UI without waiting for a network refresh. Temp- goals are excluded because they
            // are rendered as skeleton cards, not as real GoalCards.
            // No network request is made here — this is a pure in-memory re-index.
            useEffect(() => {
                if (!ctxGoals || ctxGoals.length === 0) return;
                const realGoals = ctxGoals.filter(g => !String(g.id).startsWith('temp-'));
                if (realGoals.length === 0) return;
                const withScope = realGoals.map(g => ({ ...g, scope }));
                const newIndexed = indexDataByScope(withScope, scope);
                if (Object.keys(newIndexed).length === 0) return;
                setIndexedGoals(newIndexed);
            // eslint-disable-next-line react-hooks/exhaustive-deps
            }, [ctxGoals, scope]);
    const openGoalModal = () => {
        if (!canCreateGoal) {
            notifyTierLimit(`Goal limit reached (${remainingGoals === 0 ? 'max' : remainingGoals} remaining). Upgrade to create more goals.`);
            return;
        }
        if (!isGoalModalOpen) {
        setNewGoal((prev) => ({
            ...prev,
            // week_start: getWeekStartDate(),
        }));
        setIsGoalModalOpen(true);
        console.debug('Opening Goal Modal' );
        }
    };

    // Auto-open goal modal when navigating here from onboarding
    useEffect(() => {
      try {
        const flag = sessionStorage.getItem('wkly_open_goal_modal');
        if (flag) {
          sessionStorage.removeItem('wkly_open_goal_modal');
          openGoalModal();
        }
      } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
  
    const closeGoalModal = () => {
      setIsGoalModalOpen(false);
      setGoalFormProgress(0);
    };

    const closeAddTaskModal = () => {
        setIsAddTaskModalOpen(false);
        setStandaloneNewTask({ title: '', description: '' });
        setStandaloneTaskGoalId('');
        setStandaloneCreateNewGoal(false);
        setStandaloneNewGoalTitle('');
        setStandaloneNewGoalCategory('General');
        setStandaloneSelectedDate(null);
        setStandaloneSelectedTime(null);
        setStandaloneReminderEnabled(false);
        setStandaloneReminderOffset('30');
        setStandaloneReminderDatetime('');
        setStandaloneSelectedReminderDatetime(null);
    };

    const createStandaloneTask = async () => {
        if (!standaloneNewTask.title?.trim()) { notifyError('Task title is required'); return; }
        if (!standaloneCreateNewGoal && !standaloneTaskGoalId) { notifyError('Please select a goal or choose to create a new one'); return; }
        if (standaloneCreateNewGoal && !standaloneNewGoalTitle.trim()) { notifyError('New goal title is required'); return; }
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            if (!token) throw new Error('Not authenticated');
            let goalId = standaloneTaskGoalId;
            if (standaloneCreateNewGoal) {
                const goalRes = await fetch('/.netlify/functions/createGoal', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({
                        title: standaloneNewGoalTitle.trim(),
                        week_start: getWeekStartDate(),
                        status: 'Not started',
                        description: '',
                        category: standaloneNewGoalCategory || 'General',
                    }),
                });
                if (!goalRes.ok) {
                    const errBody = await goalRes.json().catch(() => ({})) as { error?: string; message?: string };
                    if (errBody?.error === 'tier_limit') {
                        notifyTierLimit(errBody.message || 'Upgrade to create more goals.');
                        throw new Error('tier_limit');
                    }
                    throw new Error(errBody.error || 'Failed to create goal');
                }
                const createdGoal = await goalRes.json() as { id: string };
                goalId = createdGoal.id;
                await refreshGoals();
            }
            const dateStr = standaloneSelectedDate ? standaloneSelectedDate.format('YYYY-MM-DD') : null;
            const timeStr = standaloneSelectedTime ? standaloneSelectedTime.format('HH:mm') : null;
            // Compute reminder datetime in UTC
            let computedReminderDatetime: string | null = null;
            let finalReminderEnabled = standaloneReminderEnabled;
            if (standaloneReminderEnabled) {
                try {
                    if (standaloneReminderOffset === 'custom') {
                        computedReminderDatetime = standaloneReminderDatetime ? new Date(standaloneReminderDatetime).toISOString() : null;
                    } else if (dateStr && timeStr) {
                        const scheduledUTC = convertToUTC(dateStr, timeStr, timezone);
                        const scheduledDate = new Date(scheduledUTC);
                        scheduledDate.setMinutes(scheduledDate.getMinutes() - Number(standaloneReminderOffset));
                        computedReminderDatetime = scheduledDate.toISOString();
                    } else if (standaloneReminderDatetime) {
                        computedReminderDatetime = new Date(standaloneReminderDatetime).toISOString();
                    }
                } catch (e) {
                    computedReminderDatetime = null;
                }
                if (!computedReminderDatetime) finalReminderEnabled = false;
            }
            const response = await fetch('/.netlify/functions/createTask', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    goal_id: goalId,
                    title: standaloneNewTask.title!.trim(),
                    description: standaloneNewTask.description || null,
                    status: 'Not started',
                    scheduled_date: dateStr,
                    scheduled_time: timeStr,
                    reminder_enabled: finalReminderEnabled,
                    reminder_datetime: computedReminderDatetime,
                    order_index: 0,
                }),
            });
            if (!response.ok) {
                let errBody: any = {};
                try { errBody = await response.json(); } catch {}
                if (errBody?.error === 'tier_limit') {
                    notifyTierLimit(errBody.message || 'Upgrade to create more tasks.');
                    throw new Error(errBody.message || 'tier_limit');
                }
                throw new Error('Failed to create task');
            }
            notifySuccess('Task created');
            closeAddTaskModal();
            if (goalId) await fetchTasksForGoal(goalId);
        } catch (err) {
            console.error('[AllGoals] createStandaloneTask error:', err);
            notifyError('Failed to create task');
        }
    };

    const generateStandaloneTasks = async () => {
        if (!standaloneTaskGoalId) {
            notifyError('Please select a goal first');
            return;
        }
        const allGoals = Object.values(indexedGoals).flat();
        const goal = allGoals.find(g => g.id === standaloneTaskGoalId);
        if (!goal) {
            notifyError('Selected goal not found');
            return;
        }
        setIsGeneratingTasks(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            if (!token) throw new Error('Not authenticated');
            const response = await fetch('/.netlify/functions/generatePlan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ title: goal.title, description: goal.description || '' }),
            });
            if (!response.ok) {
                let errBody: any = {};
                try { errBody = await response.json(); } catch {}
                if (errBody?.error === 'tier_limit') {
                    notifyTierLimit(errBody.message || 'Upgrade to generate plans.');
                    throw new Error(errBody.message || 'tier_limit');
                }
                throw new Error('Failed to generate tasks');
            }
            const data = await response.json();
            if (Array.isArray(data.tasks)) {
                for (const task of data.tasks) {
                    await fetch('/.netlify/functions/createTask', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({
                            goal_id: goal.id,
                            title: task.title,
                            description: task.description || null,
                            status: 'Not started',
                            order_index: 0,
                        }),
                    });
                }
                notifySuccess(`Generated ${data.tasks.length} tasks`);
                closeAddTaskModal();
                await fetchTasksForGoal(goal.id);
            }
        } catch (err) {
            console.error('[AllGoals] generateStandaloneTasks error:', err);
            notifyError(err instanceof Error ? err.message : 'Failed to generate tasks');
        } finally {
            setIsGeneratingTasks(false);
        }
    };

    const generateTasksForGoal = async (goalId: string) => {
        const allGoals = Object.values(indexedGoals).flat();
        const goal = allGoals.find(g => g.id === goalId);
        if (!goal) {
            notifyError('Goal not found');
            return;
        }
        setIsGeneratingTasks(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            if (!token) throw new Error('Not authenticated');
            const response = await fetch('/.netlify/functions/generatePlan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ title: goal.title, description: goal.description || '' }),
            });
            if (!response.ok) {
                let errBody: any = {};
                try { errBody = await response.json(); } catch {}
                if (errBody?.error === 'tier_limit') {
                    notifyTierLimit(errBody.message || 'Upgrade to generate plans.');
                    throw new Error(errBody.message || 'tier_limit');
                }
                throw new Error('Failed to generate tasks');
            }
            const data = await response.json();
            if (Array.isArray(data.tasks)) {
                for (const task of data.tasks) {
                    await fetch('/.netlify/functions/createTask', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({
                            goal_id: goal.id,
                            title: task.title,
                            description: task.description || null,
                            status: 'Not started',
                            order_index: 0,
                        }),
                    });
                }
                notifySuccess(`Generated ${data.tasks.length} tasks`);
                await fetchTasksForGoal(goal.id);
            }
        } catch (err) {
            console.error('[AllGoals] generateTasksForGoal error:', err);
            notifyError(err instanceof Error ? err.message : 'Failed to generate tasks');
        } finally {
            setIsGeneratingTasks(false);
        }
    };

    // Sets the selected summary ID and opens the editor modal
    function setLocalSummaryId(id: string): void {
        setSelectedSummary((prev) => prev ? { ...prev, id } : prev);
        setIsEditorOpen(true);
    }
    const closeEditor = () => {
        if (!isEditorOpen) {
            console.warn('closeEditor called but editor is already closed.');
            return; // Prevent redundant calls
        }
    
        setIsEditorOpen(false);
    }

    // Function to refresh goals (keeps current selection where possible)
    const refreshGoals = useCallback(async () : Promise<{indexedGoals: Record<string, Goal[]>, pages: string[]}> => {
        try {
        const { indexedGoals, pages } = await fetchAllGoalsIndexed(scope, undefined, undefined, undefined, showArchived);
        setIndexedGoals(indexedGoals);
        setPages(pages);
        // Keep the latest currentPage in a ref to avoid stale closures from async callers
        // If currentPage is not present in new pages, try to choose a sensible fallback
            if (pages.length > 0) {
            const cp = currentPageRef.current;
            if (!cp || !pages.includes(cp)) {
                setCurrentPage(pages[0]);
                currentPageRef.current = pages[0];
            }
        }
        return { indexedGoals, pages };
        } catch (error) {
        console.error('Error refreshing goals:', error);
        // If refresh failed, ensure we exit the loading state so the UI doesn't stay blocked
    setIsScopeLoading(false);
        return { indexedGoals: {}, pages: [] };
        }
    }, [scope, showArchived]);

    // Re-fetch goals whenever the showArchived toggle changes so the list reflects the new mode.
    // refreshGoals already passes showArchived to fetchAllGoalsIndexed.
    useEffect(() => {
        refreshGoals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showArchived]);

    // Check for notification-triggered task edit on mount
    useEffect(() => {
        const checkNotificationTask = async () => {
            const taskId = sessionStorage.getItem('wkly_edit_task_id');
            if (taskId) {
                sessionStorage.removeItem('wkly_edit_task_id');
                
                try {
                    const { data: { session } } = await supabase.auth.getSession();
                    const token = session?.access_token;
                    if (!token) return;
                    
                    const response = await fetch('/.netlify/functions/getAllTasks', {
                        headers: { 'Authorization': `Bearer ${token}` },
                    });
                    
                    if (!response.ok) return;
                    
                    const allTasks: Task[] = await response.json();
                    const task = allTasks.find((t) => t.id === taskId);
                    
                    if (task) {
                        setNotificationTask(task);
                        setNotificationTaskModalOpen(true);
                    }
                } catch (error) {
                    console.error('Failed to load notification task:', error);
                }
            }
        };
        
        checkNotificationTask();
    }, []);

    // Function to fetch all tasks and group them by goal_id for kanban display
    const fetchKanbanTasks = useCallback(async () => {
        if (viewMode !== 'kanban') return;
        
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            if (!token) throw new Error('User not authenticated');

            const response = await fetch('/.netlify/functions/getAllTasks', {
                headers: { Authorization: `Bearer ${token}` },
            });
            
            if (!response.ok) {
                throw new Error(`Failed to fetch tasks: ${response.status}`);
            }
            
            const allTasks: (Task & { goal?: { id: string } })[] = await response.json();
            
            // Group tasks by goal_id
            const tasksByGoal: Record<string, Task[]> = {};
            allTasks.forEach((task) => {
                const goalId = task.goal_id;
                if (!tasksByGoal[goalId]) {
                    tasksByGoal[goalId] = [];
                }
                tasksByGoal[goalId].push(task);
            });
            
            // Sort tasks within each goal by order_index
            Object.keys(tasksByGoal).forEach((goalId) => {
                tasksByGoal[goalId].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
            });
            
            setKanbanTasks(tasksByGoal);
        } catch (error) {
            console.error('Error fetching kanban tasks:', error);
        }
    }, [viewMode]);

    // Fetch tasks when entering kanban mode
    useEffect(() => {
        if (viewMode === 'kanban') {
            fetchKanbanTasks();
        }
    }, [viewMode, fetchKanbanTasks]);

    // Task handlers for kanban view
    const handleTaskStatusChange = async (taskId: string, newStatus: Task['status']) => {
        // Find the goal_id and old status for this task
        let goalId: string | undefined;
        let oldStatus: Task['status'] | undefined;
        for (const gid of Object.keys(kanbanTasks)) {
            const task = kanbanTasks[gid]?.find(t => t.id === taskId);
            if (task) {
                goalId = gid;
                oldStatus = task.status;
                break;
            }
        }
        
        if (!goalId || !oldStatus) return;
        
        // Optimistic update: update UI immediately
        setKanbanTasks((prev) => {
            const updated = { ...prev };
            if (updated[goalId]) {
                updated[goalId] = updated[goalId].map(t => 
                    t.id === taskId ? { ...t, status: newStatus } : t
                );
            }
            return updated;
        });
        
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            if (!token) throw new Error('User not authenticated');

            const response = await fetch('/.netlify/functions/updateTask', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ id: taskId, status: newStatus }),
            });

            if (!response.ok) {
                const errBody = await response.json().catch(() => ({}));
                if (errBody?.error === 'tier_limit') {
                    notifyTierLimit(errBody.message || 'Upgrade to activate more goals simultaneously.');
                    // Revert optimistic update
                    setKanbanTasks((prev) => {
                        const updated = { ...prev };
                        if (updated[goalId]) {
                            updated[goalId] = updated[goalId].map(t =>
                                t.id === taskId ? { ...t, status: oldStatus } : t
                            );
                        }
                        return updated;
                    });
                    return;
                }
                throw new Error('Failed to update task status');
            }
            notifySuccess('Task status updated');
        } catch (error) {
            console.error('Error updating task status:', error);
            notifyError('Failed to update task status');
            // Revert on error
            setKanbanTasks((prev) => {
                const updated = { ...prev };
                if (updated[goalId]) {
                    updated[goalId] = updated[goalId].map(t => 
                        t.id === taskId ? { ...t, status: oldStatus } : t
                    );
                }
                return updated;
            });
        }
    };

    const handleTaskUpdate = async (taskId: string, updates: Partial<Task>) => {
        // Find the goal_id and task for this update
        let goalId: string | undefined;
        let originalTask: Task | undefined;
        for (const gid of Object.keys(kanbanTasks)) {
            const task = kanbanTasks[gid]?.find(t => t.id === taskId);
            if (task) {
                goalId = gid;
                originalTask = { ...task };
                break;
            }
        }
        
        if (!goalId || !originalTask) return;
        
        // Optimistic update: update UI immediately
        setKanbanTasks((prev) => {
            const updated = { ...prev };
            if (updated[goalId]) {
                updated[goalId] = updated[goalId].map(t => 
                    t.id === taskId ? { ...t, ...updates } : t
                );
            }
            return updated;
        });
        
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            if (!token) throw new Error('User not authenticated');

            const response = await fetch('/.netlify/functions/updateTask', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ id: taskId, ...updates }),
            });

            if (!response.ok) throw new Error('Failed to update task');
            notifySuccess('Task updated');
        } catch (error) {
            console.error('Error updating task:', error);
            notifyError('Failed to update task');
            // Revert on error
            setKanbanTasks((prev) => {
                const updated = { ...prev };
                if (updated[goalId]) {
                    updated[goalId] = updated[goalId].map(t => 
                        t.id === taskId ? originalTask : t
                    );
                }
                return updated;
            });
        }
    };

    const handleTaskDelete = (taskId: string) => {
        // Find the task across kanban buckets first, then table buckets
        let taskToDelete: Task | undefined;
        for (const gid of Object.keys(kanbanTasks)) {
            taskToDelete = kanbanTasks[gid]?.find(t => t.id === taskId);
            if (taskToDelete) { break; }
        }
        if (!taskToDelete) {
            for (const gid of Object.keys(tableTasksByGoal)) {
                taskToDelete = tableTasksByGoal[gid]?.find(t => t.id === taskId);
                if (taskToDelete) { break; }
            }
        }
        if (!taskToDelete) return;
        const prevKanbanTasks = { ...kanbanTasks };
        const prevTableTasksByGoal = { ...tableTasksByGoal };
        // Optimistically remove from both stores
        setKanbanTasks((prev) => {
            const updated: Record<string, Task[]> = {};
            for (const gid of Object.keys(prev)) {
                updated[gid] = prev[gid].filter(t => t.id !== taskId);
            }
            return updated;
        });
        setTableTasksByGoal((prev) => {
            const updated: Record<string, Task[]> = {};
            for (const gid of Object.keys(prev)) {
                updated[gid] = prev[gid].filter(t => t.id !== taskId);
            }
            return updated;
        });
        notifyWithUndo(
            'Task deleted',
            async () => {
                const { data: { session } } = await supabase.auth.getSession();
                const token = session?.access_token;
                if (!token) throw new Error('User not authenticated');
                const response = await fetch('/.netlify/functions/deleteTask', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ id: taskId }),
                });
                if (!response.ok) throw new Error('Failed to delete task');
                await fetchKanbanTasks();
            },
            () => {
                setKanbanTasks(prevKanbanTasks);
                setTableTasksByGoal(prevTableTasksByGoal);
            },
        );
    };
  
// Add a new goal
    //const handleAddGoal = async (event: React.FormEvent, goal?: Goal) => {
    //    event.preventDefault(); // Prevent default form submission
//
    //    const goalToAdd = goal || newGoal; // Use the passed goal or fallback to newGoal state
//
    //    // Log the goal being validated
    
//
    //    // Validation: Ensure all required fields are populated
    //    if (!goalToAdd.title || !goalToAdd.description || !goalToAdd.category || !goalToAdd.week_start || !goalToAdd.user_id) {
                                // prevScopeRef.current = scope; // This line is now moved inside the fetch function
    //        return;
    //    }
//
    //    // Revalidate week_start before adding to the database
    //    if (goalToAdd.week_start) {
    //      goalToAdd.week_start = goalToAdd.week_start.split('T')[0]; // Ensure no timestamp
    //    }
    
//
    //    try {
    
    //        await addGoal(goalToAdd); // Add the new goal
    //        await refreshGoals(); // Refresh the goals list
    //    } catch (error) {
    //        console.error('Error adding goal:', error);
    //    }
    //};
// Delete a goal

    // Periodic refresh of fullGoals and refresh on background signals while Kanban is active
    useEffect(() => {
        let mounted = true;
        const reload = async () => {
            if (viewMode !== 'kanban') {
                console.debug('[AllGoals] reload skipped, not in kanban view', { viewMode });
                return;
            }
            try {
                console.debug('[AllGoals] reload: fetching fullGoals');
                const all = await fetchAllGoals();
                if (mounted) setFullGoals(all);
            } catch (err) {
                console.error('Error refreshing fullGoals:', err);
            }
        };

        // Immediate refresh on background signals
        if (lastUpdated || (lastAddedIds && lastAddedIds.length > 0)) reload();

        const handle = setInterval(() => {
            reload();
        }, 60_000); // refresh every 60 seconds

        return () => { mounted = false; clearInterval(handle); };
    }, [viewMode, lastUpdated, lastAddedIds]);

    // When the global goals cache is updated (via context), ensure this component refreshes
    useEffect(() => {
                    try {
            const added = lastAddedIds && lastAddedIds.length > 0 ? [...lastAddedIds] : undefined;
            (async () => {
                const fresh = await refreshGoals();
                // if there were added ids, navigate to the page containing the first one using fresh data
                if (added && added.length > 0 && fresh.pages && fresh.pages.length > 0) {
                    for (const p of fresh.pages) {
                        const list = fresh.indexedGoals[p] || [];
                        if (list.some((g: Goal) => added.includes(g.id))) {
                            setCurrentPage(p);
                            currentPageRef.current = p;
                            break;
                        }
                    }
                }
                // clear the context marker
                try { if (typeof setLastAddedIds === 'function') setLastAddedIds(undefined); } catch { /* ignore */ }
            })();
        } catch (err) {
            console.warn('[AllGoals] Failed to sync after context update (ignored):', err);
        }
    }, [lastUpdated, lastAddedIds, refreshGoals, setLastAddedIds]);

    const handleDeleteGoal = (goalId: string) => {
        // Snapshot for potential undo
        const previousIndexed: Record<string, Goal[]> = {};
        for (const k of Object.keys(indexedGoals)) previousIndexed[k] = [...(indexedGoals[k] || [])];
        const prevFullSnapshot = fullGoals ? [...fullGoals] : null;

        // Optimistic UI: remove from local indexedGoals immediately
        setIndexedGoals((prev) => {
            const copy: Record<string, Goal[]> = { ...prev };
            if (copy[currentPage]) copy[currentPage] = copy[currentPage].filter((g) => g.id !== goalId);
            return copy;
        });
        try { if (removeGoalFromCache) removeGoalFromCache(goalId); } catch (err) {
            console.warn('[AllGoals] removeGoalFromCache failed (ignored):', err);
        }
        if (fullGoals) {
            setFullGoals((prev) => prev ? prev.filter((g) => g.id !== goalId) : prev);
        }

        notifyWithUndo(
            'Goal deleted',
            async () => {
                await deleteGoal(goalId);

                // Post-delete consistency check with retry
                const maxAttempts = 3;
                let attempt = 0;
                let foundStill = true;
                while (attempt < maxAttempts) {
                    try {
                        const { indexedGoals: freshIndexed, pages: freshPages } = await fetchAllGoalsIndexed(scope);
                        const exists = Object.values(freshIndexed).some((list) => list.some((g) => g.id === goalId));
                        setIndexedGoals(freshIndexed);
                        setPages(freshPages);
                        if (!exists) { foundStill = false; break; }
                    } catch (err) {
                        console.warn('[AllGoals] refresh attempt failed (ignored):', err);
                    }
                    await new Promise((res) => setTimeout(res, 250 * Math.pow(2, attempt)));
                    attempt += 1;
                }

                if (foundStill) {
                    try {
                        if (ctxRefresh) { await ctxRefresh(); }
                        const { indexedGoals: finalIndexed, pages: finalPages } = await fetchAllGoalsIndexed(scope);
                        setIndexedGoals(finalIndexed);
                        setPages(finalPages);
                        const stillExists = Object.values(finalIndexed).some((list) => list.some((g) => g.id === goalId));
                        if (stillExists) {
                            setIndexedGoals(previousIndexed);
                            notifyError('Goal appeared to not be deleted (server still contains it). It has been restored locally.');
                        }
                    } catch (err) {
                        console.warn('[AllGoals] final reconcile after delete failed (ignored):', err);
                    }
                }
            },
            () => {
                // Undo: restore goal in local state
                setIndexedGoals(previousIndexed);
                if (prevFullSnapshot) setFullGoals(prevFullSnapshot);
                try { if (ctxRefresh) ctxRefresh(); } catch { /* ignore */ }
            },
        );
    };

// Update a goal
    const handleUpdateGoal = async (goalId: string, updatedGoal: Goal) => {
        // Snapshot for rollback
        const prevIndexedSnapshot: Record<string, Goal[]> = {};
        for (const k of Object.keys(indexedGoals)) prevIndexedSnapshot[k] = [...(indexedGoals[k] || [])];
        const prevFullSnapshot = fullGoals ? [...fullGoals] : null;
        try {
        // Optimistically update indexedGoals (scoped view)
        setIndexedGoals((prev) => {
            const copy: Record<string, Goal[]> = {};
            for (const k of Object.keys(prev)) copy[k] = [...prev[k]];
            for (const p of Object.keys(copy)) {
                const idx = copy[p].findIndex((g) => g.id === goalId);
                if (idx !== -1) {
                    copy[p][idx] = { ...copy[p][idx], ...(updatedGoal as Partial<Goal>) } as Goal;
                    break;
                }
            }
            return copy;
        });

        // Optimistically update fullGoals if present
        if (fullGoals) {
            setFullGoals((prev) => prev ? prev.map((g) => (g.id === goalId ? { ...(g as Goal), ...(updatedGoal as Partial<Goal>) } : g)) : prev);
        }

        await updateGoal(goalId, updatedGoal);
        // best-effort refresh to reconcile any server-side transforms
        try { await refreshGoals(); } catch { /* ignore */ }
        } catch (error) {
        console.error('Error updating goal:', error);
        // rollback
        try { setIndexedGoals(prevIndexedSnapshot); } catch (e) { /* ignore */ }
        try { if (prevFullSnapshot) setFullGoals(prevFullSnapshot); } catch (e) { /* ignore */ }
        notifyError('Failed to update goal.');
        }
    };

   // Filter goals based on the filter state
  const handleFilterChange = (filterValue: string) => {
        // Keep the filter as a separate piece of state. Don't mutate the source
        // `indexedGoals` — let the derived `sortedAndFilteredGoals` compute the
        // filtered list for each view. This avoids losing data for other pages and
        // prevents runtime errors when some fields are null.
        setFilter(filterValue);
  };

  // Debounce: propagate filter → debouncedFilter after 250 ms of inactivity.
  // This prevents the expensive sortedAndFilteredGoals recomputation on every keystroke.
  useEffect(() => {
      const timer = setTimeout(() => setDebouncedFilter(filter), 250);
      return () => clearTimeout(timer);
  }, [filter]);


    // persist pageByScope whenever it changes (e.g., scope switches)
    useEffect(() => {
        try {
            savePageByScope(pageByScope);
        } catch {
            // ignore
        }
    }, [pageByScope]);

    // Defensive effect: if we're showing a page that already exists in `pages`
    // or Kanban isn't restricted to scoped data, clear any lingering loading
    // indicator. This covers race conditions where a fetch returned early or
    // an error path didn't clear `isScopeLoading`.
    useEffect(() => {
        try {
            if (!isScopeLoading) return;
            // Always showing all goals, so clear the loading state
            setIsScopeLoading(false);
        } catch (err) {
            // best-effort only
            try { setIsScopeLoading(false); } catch {}
        }
    }, [isScopeLoading]);

    

  // Filtering predicate to be shared across views
    // Build a fast set of active goal IDs from the live context (always excludes archived goals
    // because fetchAllGoals backend filters is_archived = false). Used to catch stale
    // indexedGoals entries whose is_archived flag hasn't been updated yet.
    const ctxGoalIds = useMemo(() => new Set(ctxGoals.map(g => g.id)), [ctxGoals]);

    // Set of goal IDs that the context explicitly knows are archived (is_archived: true).
    // Catches the case where updateGoalInCache marks a goal archived in context but
    // indexedGoals still carries the stale is_archived: false (e.g. due to CDN caching).
    const ctxArchivedIds = useMemo(() => new Set(ctxGoals.filter(g => g.is_archived).map(g => g.id)), [ctxGoals]);

    const goalMatchesFilters = (goal: Goal) => {
        // A goal is considered archived if:
        //   (a) the flag on the object is explicitly true, OR
        //   (b) it has disappeared from the live context cache (which the backend always filters
        //       to only return is_archived=false), indicating it was archived even though the
        //       local indexedGoals entry still carries the old flag value.
        const isArchived =
            goal.is_archived === true ||
            ctxArchivedIds.has(goal.id) ||
            (!String(goal.id).startsWith('temp-') && ctxGoals.length > 0 && !ctxGoalIds.has(goal.id));

        // By default hide archived goals. When showArchived is on, include them in the view
        // alongside active goals (inclusive, not exclusive).
        if (!showArchived && isArchived) return false;

        // text filter (defensive) — uses debouncedFilter to avoid recomputing on every keystroke
        const q = (debouncedFilter || '').toString().trim();
        const qLower = q ? q.toLowerCase() : '';
        const safe = (v: unknown) => (typeof v === 'string' ? v : '') as string;
        const textMatch = !qLower || (
            safe(goal.title).toLowerCase().includes(qLower) ||
            safe(goal.category).toLowerCase().includes(qLower) ||
            safe(goal.description).toLowerCase().includes(qLower) ||
            safe(goal.week_start).toLowerCase().includes(qLower)
        );
        if (!textMatch) return false;

        // task status filter — show goals that have at least one task with a matching status
        if (filterStatus && filterStatus.length > 0) {
            const goalTasks: Task[] = tableTasksByGoal[goal.id] || kanbanTasks[goal.id] || [];
            // If tasks are loaded, require at least one to match; if not yet loaded, let the goal through
            if (goalTasks.length > 0) {
                const hasMatchingTask = goalTasks.some((t) => filterStatus.includes(t.status || ''));
                if (!hasMatchingTask) return false;
            }
        }

        // category filter (multi-select)
        if (filterCategory && filterCategory.length > 0 && !filterCategory.includes((goal.category || ''))) return false;

        // scope filter (multi-select) - determines if goal falls into week/month/year scope
        if (filterScope && filterScope.length > 0) {
            const weekStart = goal.week_start;
            if (!weekStart) return false;
            
            const goalDate = new Date(weekStart);
            const now = new Date();
            const currentWeekStart = new Date(getWeekStartDate(now));
            const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const currentYearStart = new Date(now.getFullYear(), 0, 1);
            
            let matchesScope = false;
            for (const scopeFilter of filterScope) {
                if (scopeFilter === 'week') {
                    // Check if goal falls within current week
                    const weekEnd = new Date(currentWeekStart);
                    weekEnd.setDate(weekEnd.getDate() + 7);
                    if (goalDate >= currentWeekStart && goalDate < weekEnd) {
                        matchesScope = true;
                        break;
                    }
                } else if (scopeFilter === 'month') {
                    // Check if goal is in current month
                    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                    if (goalDate >= currentMonthStart && goalDate <= monthEnd) {
                        matchesScope = true;
                        break;
                    }
                } else if (scopeFilter === 'year') {
                    // Check if goal is in current year
                    const yearEnd = new Date(now.getFullYear(), 11, 31);
                    if (goalDate >= currentYearStart && goalDate <= yearEnd) {
                        matchesScope = true;
                        break;
                    }
                }
            }
            if (!matchesScope) return false;
        }

        // Date range filter — a goal passes if any of its tasks falls within [filterStartDate, filterEndDate].
        // The goal's effective date range is derived from its tasks, not week_start.
        if (filterStartDate || filterEndDate) {
            try {
                const isDayjsLike = (v: unknown): v is { toDate: () => Date } =>
                    typeof v === 'object' && v !== null && 'toDate' in v &&
                    typeof (v as { toDate?: unknown }).toDate === 'function';

                const start: Date | null = filterStartDate
                    ? (isDayjsLike(filterStartDate) ? filterStartDate.toDate() : filterStartDate as unknown as Date)
                    : null;
                const end: Date | null = filterEndDate
                    ? (isDayjsLike(filterEndDate) ? filterEndDate.toDate() : filterEndDate as unknown as Date)
                    : null;

                // Gather tasks for this goal from whichever cache is populated
                const goalTasks: Task[] = tableTasksByGoal[goal.id] || kanbanTasks[goal.id] || [];

                // If no tasks are loaded yet, let the goal through (don't exclude it)
                if (goalTasks.length > 0) {
                    const hasMatchingTask = goalTasks.some((t) => {
                        if (!t.scheduled_date) return false;
                        try {
                            const taskDate = new Date(t.scheduled_date);
                            if (isNaN(taskDate.getTime())) return false;
                            if (start && taskDate < start) return false;
                            if (end && taskDate > end) return false;
                            return true;
                        } catch { return false; }
                    });
                    if (!hasMatchingTask) return false;
                }
            } catch { /* ignore parse errors */ }
        }

        return true;
    };

    // Task filter function - applies same filters to tasks
    const taskMatchesFilters = (task: Task, taskGoalId?: string) => {
        // Archive filter: hide tasks belonging to archived goals unless showArchived is on.
        // Use the same 3-part check as goalMatchesFilters:
        //   1. task.goal.is_archived (data from getAllTasks join)
        //   2. ctxArchivedIds (goal marked archived in live context)
        //   3. goal absent from ctxGoals entirely (archived in a prior session, filtered by backend)
        const effectiveGoalId = taskGoalId || (task as any).goal_id;
        if (!showArchived && effectiveGoalId) {
            const taskGoalIsArchived =
                (task as any).goal?.is_archived === true ||
                ctxArchivedIds.has(effectiveGoalId) ||
                (!String(effectiveGoalId).startsWith('temp-') && ctxGoals.length > 0 && !ctxGoalIds.has(effectiveGoalId));
            if (taskGoalIsArchived) return false;
        }

        // text filter (search task title, goal title, category)
        const q = (filter || '').toString().trim();
        const qLower = q ? q.toLowerCase() : '';
        const safe = (v: unknown) => (typeof v === 'string' ? v : '') as string;
        
        if (qLower) {
            const titleMatch = safe(task.title).toLowerCase().includes(qLower);
            // For kanban view, we might need to look up goal info
            const goalInfo = taskGoalId && kanbanTasks[taskGoalId] ? 
                (Object.values(indexedGoals).flat().find(g => g.id === taskGoalId)) : 
                ((task as any).goal);
            const goalTitleMatch = goalInfo ? safe(goalInfo.title).toLowerCase().includes(qLower) : false;
            const categoryMatch = goalInfo ? safe(goalInfo.category).toLowerCase().includes(qLower) : false;
            
            if (!titleMatch && !goalTitleMatch && !categoryMatch) return false;
        }

        // status filter (task status)
        if (filterStatus && filterStatus.length > 0 && !filterStatus.includes((task.status || ''))) return false;

        // category filter (from goal)
        if (filterCategory && filterCategory.length > 0) {
            const goalInfo = taskGoalId && kanbanTasks[taskGoalId] ? 
                (Object.values(indexedGoals).flat().find(g => g.id === taskGoalId)) : 
                ((task as any).goal);
            if (!goalInfo || !filterCategory.includes(safe(goalInfo.category))) return false;
        }

        // goal filter (direct task->goal relationship)
        if (filterGoal && filterGoal.length > 0) {
            const actualGoalId = taskGoalId || (task as any).goal?.id || task.goal_id;
            if (!actualGoalId || !filterGoal.includes(actualGoalId)) return false;
        }

        // date range filter - use scheduled_date for tasks
        if (filterStartDate && task.scheduled_date) {
            try {
                const taskDate = new Date(task.scheduled_date);
                const start = filterStartDate.toDate ? filterStartDate.toDate() : filterStartDate as unknown as Date;
                if (!isNaN(taskDate.getTime()) && start && taskDate < start) return false;
            } catch { /* ignore parse errors */ }
        }
        if (filterEndDate && task.scheduled_date) {
            try {
                const taskDate = new Date(task.scheduled_date);
                const end = filterEndDate.toDate ? filterEndDate.toDate() : filterEndDate as unknown as Date;
                if (!isNaN(taskDate.getTime()) && end && taskDate > end) return false;
            } catch { /* ignore parse errors */ }
        }

        return true;
    };

    // Expanded rows state for table view (declared here so sort memos can reference tableTasksByGoal)
    const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set());
    const [tableTasksByGoal, setTableTasksByGoal] = useState<Record<string, Task[]>>({});
    const [addingTaskForGoal, setAddingTaskForGoal] = useState<string | null>(null);
    const [newTaskData, setNewTaskData] = useState<Partial<Task>>({
        title: '',
        description: '',
        reminder_enabled: false,
    });
    const [tableSelectedDate, setTableSelectedDate] = useState<Dayjs | null>(null);
    const [tableSelectedTime, setTableSelectedTime] = useState<Dayjs | null>(null);
    const [tableReminderDatetime, setTableReminderDatetime] = useState<Dayjs | null>(null);

    // Filtered & sorted list for the current page (cards/table)
    // Always show all goals from all pages (ignoring scope pagination)
    const allIndexedFlattened = Object.values(indexedGoals).flat();
    const sortedAndFilteredGoals = useMemo(() => {
        const source = allIndexedFlattened;
        return source.filter(goalMatchesFilters).sort((a, b) => {
            const dir = sortDirection === 'asc' ? 1 : -1;
            if (sortBy === 'date') {
                return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
            }
            if (sortBy === 'title') {
                const ta = (a.title || '').toLowerCase();
                const tb = (b.title || '').toLowerCase();
                if (ta < tb) return -1 * dir;
                if (ta > tb) return 1 * dir;
                return 0;
            }
            if (sortBy === 'category') {
                const ca = (a.category || '').toLowerCase();
                const cb = (b.category || '').toLowerCase();
                if (ca < cb) return -1 * dir;
                if (ca > cb) return 1 * dir;
                return 0;
            }
            // status sorts by completion percentage (% of tasks done)
            // Fall back to kanbanTasks when tableTasksByGoal is empty (e.g. cards view)
            const pa = calculateGoalCompletion(tableTasksByGoal[a.id] || kanbanTasks[a.id] || []);
            const pb = calculateGoalCompletion(tableTasksByGoal[b.id] || kanbanTasks[b.id] || []);
            return dir * (pa - pb);
        });
    }, [indexedGoals, debouncedFilter, filterStatus, filterCategory, filterStartDate, filterEndDate, sortBy, sortDirection, tableTasksByGoal, kanbanTasks]);
    

    // Proactively fetch counts for visible goals on page load (batched in chunks)
    const visibleIdsMemo = useMemo(() => sortedAndFilteredGoals.map((g) => g.id), [sortedAndFilteredGoals]);
    useEffect(() => {
        if (!visibleIdsMemo || visibleIdsMemo.length === 0) return;
        let mounted = true;
        (async () => {
            try {
                // Batch requests in chunks of 100 to avoid exceeding API limits and ensure faster initial load
                const chunkSize = 100;
                for (let i = 0; i < visibleIdsMemo.length; i += chunkSize) {
                    if (!mounted) break;
                    const chunk = visibleIdsMemo.slice(i, i + chunkSize);
                    try {
                        const result = await (fetchCountsForMany ? fetchCountsForMany(chunk) : null);
                        if (!mounted) break;
                        // If batch failed for this chunk, fall back to individual fetches
                        if (!result) {
                            for (const id of chunk) {
                                if (!mounted) break;
                                try { await fetchNotesCount(id).catch(() => null); } catch { /* ignore */ }
                                if (!mounted) break;
                                try { if (fetchWinsCount) await fetchWinsCount(id).catch(() => null); } catch { /* ignore */ }
                                await new Promise((res) => setTimeout(res, 25));
                            }
                        }
                    } catch (err) {
                        // Log but continue with next chunk
                        console.warn('[AllGoals] fetchCountsForMany chunk failed (ignored):', err);
                    }
                }
            } catch (err) {
                // ignore failures; counts will arrive via individual interactions
                console.warn('[AllGoals] fetchCountsForMany batch failed (ignored):', err);
            }
        })();
        return () => { mounted = false; };
    }, [visibleIdsMemo, fetchCountsForMany, fetchNotesCount, fetchWinsCount]);

    // Filtered & sorted list across all indexed pages (for Kanban view)

    // Filtered & sorted list from the unscoped fullGoals cache (when available)
    const sortedAndFilteredFullGoals = (fullGoals || []).filter(goalMatchesFilters).sort((a, b) => {
        const dir = sortDirection === 'asc' ? 1 : -1;
        if (sortBy === 'date') {
            return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        }
        if (sortBy === 'title') {
            const ta = (a.title || '').toLowerCase();
            const tb = (b.title || '').toLowerCase();
            if (ta < tb) return -1 * dir;
            if (ta > tb) return 1 * dir;
            return 0;
        }
        if (sortBy === 'category') {
            const ca = (a.category || '').toLowerCase();
            const cb = (b.category || '').toLowerCase();
            if (ca < cb) return -1 * dir;
            if (ca > cb) return 1 * dir;
            return 0;
        }
        // status sorts by completion percentage (% of tasks done)
        const pa = calculateGoalCompletion(kanbanTasks[a.id] || []);
        const pb = calculateGoalCompletion(kanbanTasks[b.id] || []);
        return dir * (pa - pb);
    });

    // Compute visible IDs depending on viewMode (kanban uses fullGoals if available)
    const visibleGoalIds = useMemo(() => {
        let list: Goal[];
        if (viewMode === 'kanban') {
            list = sortedAndFilteredFullGoals;
        } else {
            list = sortedAndFilteredGoals;
        }
        return new Set(list.map((g) => g.id));
    }, [viewMode, sortedAndFilteredFullGoals, sortedAndFilteredGoals]);

    // Add a function to highlight filtered words
//   const applyHighlight = (text: string, filter: string) => {
//     if (!filter) return text;
//     // Escape special characters in the filter string
//     const escapedFilter = filter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
//     const regex = new RegExp(`(${escapedFilter})`, 'gi');
//     return text.replace(regex, '<span class="bg-brand-10 text-brand-90 inline-block">$1</span>');
//   };

    // Use shared HTML-producing highlight helper and render via dangerouslySetInnerHTML
    const renderHTML = (text?: string | null) => ({ __html: applyHighlight(text ?? '', filter) });

    // Selection state for bulk actions
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [selectionType, setSelectionType] = useState<'goals' | 'tasks' | null>(null);
    const [selectAllMenuAnchor, setSelectAllMenuAnchor] = useState<HTMLElement | null>(null);
    const [calendarTaskIds, setCalendarTaskIds] = useState<string[]>([]);
    const selectedCount = selectedIds.size;
    const visibleIdsArray = useMemo(() => Array.from(visibleGoalIds), [visibleGoalIds]);
    
    const toggleSelect = (id: string, type: 'goals' | 'tasks') => {
        // In cards view, only goals can be selected
        if (viewMode === 'cards' && type === 'tasks') return;
        
        // In other views, prevent mixing goals and tasks
        if (viewMode !== 'cards' && selectionType && selectionType !== type) {
            notifyError(`Already selecting ${selectionType}. Clear selection to select ${type}.`);
            return;
        }
        
        setSelectedIds((prev) => {
            const copy = new Set(prev);
            if (copy.has(id)) {
                copy.delete(id);
                // If no items left, reset selection type
                if (copy.size === 0) {
                    setSelectionType(null);
                }
            } else {
                copy.add(id);
                // Set selection type on first selection
                if (selectionType === null) {
                    setSelectionType(type);
                }
            }
            return copy;
        });
    };
    
    const clearSelection = () => {
        setSelectedIds(new Set());
        setSelectionType(null);
    };

    // (expandedRowIds, tableTasksByGoal, addingTaskForGoal, newTaskData moved above sortedAndFilteredGoals)
    
    // Calculate visible task IDs for task selection
    const visibleTaskIds = useMemo(() => {
        if (viewMode === 'kanban') {
            const taskIds: string[] = [];
            Object.keys(kanbanTasks).forEach((goalId) => {
                kanbanTasks[goalId]?.forEach((task) => {
                    if (taskMatchesFilters(task, goalId)) {
                        taskIds.push(task.id);
                    }
                });
            });
            return taskIds;
        } else if (viewMode === 'table') {
            const taskIds: string[] = [];
            const visibleGoalIdSet = new Set(visibleIdsArray);
            Object.entries(tableTasksByGoal).forEach(([goalId, tasks]) => {
                if (!visibleGoalIdSet.has(goalId)) return;
                tasks.forEach((task) => {
                    if (taskMatchesFilters(task, goalId)) {
                        taskIds.push(task.id);
                    }
                });
            });
            return taskIds;
        } else if (viewMode === 'tasks-calendar') {
            return calendarTaskIds;
        }
        return [];
    }, [viewMode, kanbanTasks, tableTasksByGoal, calendarTaskIds, visibleIdsArray]);
    
    const selectAllGoals = () => {
        setSelectedIds(new Set(visibleIdsArray));
        setSelectionType('goals');
        setSelectAllMenuAnchor(null);
    };
    
    const selectAllTasks = () => {
        setSelectedIds(new Set(visibleTaskIds));
        setSelectionType('tasks');
        setSelectAllMenuAnchor(null);
    };
    
    const deselectAll = () => {
        setSelectedIds(new Set());
        setSelectionType(null);
    };
    
    const toggleRowExpanded = (id: string) => {
        setExpandedRowIds((prev) => {
            const copy = new Set(prev);
            if (copy.has(id)) {
                copy.delete(id);
            } else {
                copy.add(id);
                // Fetch tasks for this goal if not already loaded
                if (!tableTasksByGoal[id]) {
                    fetchTasksForGoal(id);
                }
            }
            return copy;
        });
    };

    const fetchTasksForGoal = useCallback(async (goalId: string) => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            if (!token) return;

            const response = await fetch('/.netlify/functions/getAllTasks', {
                headers: { Authorization: `Bearer ${token}` },
            });
            
            if (!response.ok) throw new Error('Failed to fetch tasks');
            
            const allTasks: Task[] = await response.json();
            const goalTasks = allTasks.filter(task => task.goal_id === goalId);
            
            setTableTasksByGoal(prev => ({
                ...prev,
                [goalId]: goalTasks
            }));
        } catch (error) {
            console.error('Error fetching tasks for goal:', error);
        }
    }, []);

    // Fetch tasks for all visible goals in table view
    const fetchTasksForAllGoals = useCallback(async (goalIds: string[]) => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            if (!token) return;

            const response = await fetch('/.netlify/functions/getAllTasks', {
                headers: { Authorization: `Bearer ${token}` },
            });
            
            if (!response.ok) throw new Error('Failed to fetch tasks');
            
            const allTasks: Task[] = await response.json();
            
            // Group tasks by goal_id
            const tasksByGoal: Record<string, Task[]> = {};
            goalIds.forEach(gid => {
                tasksByGoal[gid] = allTasks.filter(task => task.goal_id === gid);
            });
            
            setTableTasksByGoal(tasksByGoal);
        } catch (error) {
            console.error('Error fetching tasks for all goals:', error);
        }
    }, []);

    // Create task for a specific goal
    const createTaskForGoal = useCallback(async (goalId: string) => {
        if (!newTaskData.title?.trim()) {
            notifyError('Task title is required');
            return;
        }

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            if (!token) throw new Error('User not authenticated');

            const response = await fetch('/.netlify/functions/createTask', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    goal_id: goalId,
                    title: newTaskData.title,
                    description: newTaskData.description || null,
                    status: 'Not started',
                    scheduled_date: tableSelectedDate ? tableSelectedDate.format('YYYY-MM-DD') : null,
                    scheduled_time: tableSelectedTime ? tableSelectedTime.format('HH:mm') : null,
                    reminder_enabled: newTaskData.reminder_enabled || false,
                    reminder_datetime: tableReminderDatetime ? tableReminderDatetime.toISOString() : null,
                    order_index: (tableTasksByGoal[goalId]?.length || 0),
                }),
            });

            if (!response.ok) throw new Error('Failed to create task');

            notifySuccess('Task created');
            setNewTaskData({
                title: '',
                description: '',
                reminder_enabled: false,
            });
            setTableSelectedDate(null);
            setTableSelectedTime(null);
            setTableReminderDatetime(null);
            setAddingTaskForGoal(null);
            await fetchTasksForGoal(goalId);
        } catch (error) {
            console.error('Error creating task:', error);
            notifyError('Failed to create task');
        }
    }, [newTaskData, tableSelectedDate, tableSelectedTime, tableReminderDatetime, tableTasksByGoal]);

    // Fetch tasks when switching to table view or sorting by status in cards view.
    // indexedGoals (not sortedAndFilteredGoals) is used as the source so that
    // setTableTasksByGoal → sortedAndFilteredGoals changes never re-trigger this effect.
    useEffect(() => {
        const needsTasks = viewMode === 'table' || (viewMode === 'cards' && sortBy === 'status');
        if (!needsTasks) return;
        const allGoalIds = Object.values(indexedGoals).flat().map((g) => g.id);
        if (allGoalIds.length > 0) {
            fetchTasksForAllGoals(allGoalIds);
        }
    }, [viewMode, sortBy, indexedGoals, fetchTasksForAllGoals]);

    // Keep indexedGoalsRef in sync so effects can read current goals without subscribing
    useEffect(() => { indexedGoalsRef.current = indexedGoals; }, [indexedGoals]);

    // Pre-load tasks for all goals when a task-status filter becomes active so
    // goalMatchesFilters can evaluate them. Uses a ref snapshot of indexedGoals
    // to avoid subscribing to indexedGoals and causing a re-fetch loop.
    useEffect(() => {
        if (!filterStatus || filterStatus.length === 0) return;
        const allGoalIds = Object.values(indexedGoalsRef.current).flat().map((g) => g.id);
        if (allGoalIds.length > 0) {
            fetchTasksForAllGoals(allGoalIds);
        }
    }, [filterStatus, fetchTasksForAllGoals]);


  return (
  
    <div className={`space-y-6`}>
        <div className="flex justify-between items-center w-full">
            {/* <h1 className="text-2xl font-bold text-gray-90 block sm:hidden">{scope.charAt(0).toUpperCase() + scope.slice(1)}ly goals</h1> */}
            <h1 className="font-serif mt-4 block sm:hidden">Goals & Tasks</h1>
        </div>

    {(allLoadedGoals.length > 0) ? (
            
        <>
        
        <div className='flex flex-col 2xl:flex-row 2xl:space-x-8 items-start justify-start w-full mb-4'>
            <div id="allGoals" className="flex flex-col gap-4 w-full">
                <div className="flex flex-row items-center gap-4 space-x-4">
                 {/* View mode toggle */}

                    <ToggleButtonGroup
                        value={viewMode}
                        exclusive
                        onChange={handleChangeView}
                        size="small"
                        aria-label="View mode"
                        className="border rounded-md bg-transparent"
                    >
                        <Tooltip title="View goal cards" placement="top" arrow><ToggleButton value="cards" aria-label="Cards view" className='btn-ghost !border-none'><LayoutGrid /></ToggleButton></Tooltip>
                        { !isSmall && (
                        <Tooltip title="View table" placement="top" arrow><ToggleButton value="table" aria-label="Table view" className='btn-ghost !border-none'><Table2Icon /></ToggleButton></Tooltip>
                        )}
                        <Tooltip title="View kanban board" placement="top" arrow><ToggleButton value="kanban" aria-label="Kanban view" className='btn-ghost !border-none'><Kanban /></ToggleButton></Tooltip>
                        <Tooltip title="View tasks calendar" placement="top" arrow><ToggleButton value="tasks-calendar" aria-label="Tasks calendar view" className='btn-ghost !border-none'><CalendarDays /></ToggleButton></Tooltip>
                    </ToggleButtonGroup>
                    {/* Scope Selector */}
                
                </div>
                    
            {/* Filter and Sort Controls */}
                <div className="relative mt-4 h-10 flex items-center space-x-2">
                    
                    {/* Filter toggle button */}
                    <Tooltip title={filterPanelOpen ? 'Close filters' : 'Open filters'} placement="top" arrow>
                        <span>
                            <Badge badgeContent={selectedFiltersCount} color="primary" invisible={selectedFiltersCount === 0}>
                                <IconButton
                                    className={`btn-ghost mr-2 border-2${filterPanelOpen ? ' !bg-gray-20 dark:!bg-gray-80 !text-primary-text !border-primary' : ''}`}
                                    size="small"
                                    aria-label={`${filterPanelOpen ? 'Close' : 'Open'} filters${selectedFiltersCount > 0 ? ` (${selectedFiltersCount} active)` : ''}`}
                                    aria-pressed={filterPanelOpen}
                                    onClick={() => setFilterPanelOpen(prev => !prev)}
                                >
                                    <FilterIcon className="w-5 h-5" />
                                </IconButton>
                            </Badge>
                        </span>
                    </Tooltip>

                    {/* Selected filter tags (status, category, date range) */}
                    <div className="hidden sm:flex items-center space-x-2 ml-2">
                        {selectedFiltersCount >= 4 ? (
                            <>
                                <Chip
                                    label={`${selectedFiltersCount} filters`}
                                    size="small"
                                    onClick={(e) => setSummaryAnchorEl(e.currentTarget)}
                                    className="cursor-pointer"
                                />
                                <Menu
                                    anchorEl={summaryAnchorEl}
                                    open={Boolean(summaryAnchorEl)}
                                    onClose={() => setSummaryAnchorEl(null)}
                                    anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                                    transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                                    PaperProps={{ sx: { bgcolor: 'var(--background-paper)', p: 1 } }}
                                >
                                    {/* build combined list of filters */}
                                    {[
                                        ...((filterStatus || []).map((s) => ({ key: `status:${s}`, type: 'status' as const, label: `Status: ${s}`, value: s }))),
                                        ...((filterCategory || []).map((c) => ({ key: `category:${c}`, type: 'category' as const, label: `Category: ${c}`, value: c }))),
                                        ...((filterScope || []).map((s) => ({ key: `scope:${s}`, type: 'scope' as const, label: `Scope: ${s}`, value: s }))),
                                        ...((filterGoal || []).map((id) => {
                                            const allGoals = Object.values(indexedGoals).flat();
                                            const goal = allGoals.find(g => g.id === id);
                                            return { key: `goal:${id}`, type: 'goal' as const, label: `Goal: ${goal?.title || id}`, value: id };
                                        })),
                                        ...(filterStartDate && filterEndDate ? [{ key: 'range', type: 'range' as const, label: `Range: ${filterStartDate.format('YYYY-MM-DD')} → ${filterEndDate.format('YYYY-MM-DD')}`, value: `${filterStartDate.format('YYYY-MM-DD')}|${filterEndDate.format('YYYY-MM-DD')}` }] : []),
                                        ...(filter && filter.trim() ? [{ key: 'text', type: 'text' as const, label: `Search: ${filter}`, value: filter }] : []),
                                        ...(showArchived ? [{ key: 'archived', type: 'archived' as const, label: 'Including archived', value: 'archived' }] : []),
                                    ].map((item) => (
                                        <MenuItem
                                            key={item.key}
                                            onClick={() => {
                                                // deselect individual
                                                if (item.type === 'status') setFilterStatus((prev) => (prev || []).filter((v) => v !== item.value));
                                                else if (item.type === 'category') setFilterCategory((prev) => (prev || []).filter((v) => v !== item.value));
                                                else if (item.type === 'scope') setFilterScope((prev) => (prev || []).filter((v) => v !== item.value));
                                                else if (item.type === 'goal') setFilterGoal((prev) => (prev || []).filter((v) => v !== item.value));
                                                else if (item.type === 'range') { setFilterStartDate(null); setFilterEndDate(null); }
                                                else if (item.type === 'text') { setFilter(''); }
                                                else if (item.type === 'archived') { setShowArchived(false); }
                                            }}
                                        >
                                            <Checkbox size="small" checked={true} />
                                            <ListItemText primary={item.label} />
                                        </MenuItem>
                                    ))}
                                </Menu>
                                {/* Ghost clear-all button next to summary chip */}
                                
                                <button
                                    type="button"
                                    className="btn-ghost ml-1"
                                    title="Clear all filters"
                                    onClick={() => {
                                        setFilter('');
                                        setFilterStatus([]);
                                        setFilterCategory([]);
                                        setFilterScope([]);
                                        setFilterStartDate(null);
                                        setFilterEndDate(null);
                                        setShowArchived(false);
                                    }}
                                >
                                    <Tooltip title="Clear all filters" placement="top" arrow>
                                        <CloseButton className="w-4 h-4" />
                                    </Tooltip>
                                </button>
                            </>
                        ) : (
                            <>
                                {filterStatus && filterStatus.length > 0 && (
                                    filterStatus.map((s) => (
                                        <Chip
                                            key={`status-${s}`}
                                            label={`Status: ${s}`}
                                            size="small"
                                            onDelete={() => setFilterStatus((prev) => (prev || []).filter((v) => v !== s))}
                                            deleteIcon={<Tooltip title="Remove filter" placement='top' arrow><CloseButton className="btn-ghost block ml-2 w-3 h-3 stroke-gray-90 dark:stroke-gray-10 " /></Tooltip>}
                                            className="cursor-pointer"
                                        />
                                    ))
                                )}
                                {filterCategory && filterCategory.length > 0 && (
                                    filterCategory.map((c) => (
                                        <Chip
                                            key={`cat-${c}`}
                                            label={`Category: ${c}`}
                                            size="small"
                                            onDelete={() => setFilterCategory((prev) => (prev || []).filter((v) => v !== c))}
                                            deleteIcon={<Tooltip title="Remove filter" placement='top' arrow><CloseButton className="btn-ghost block ml-2 w-3 h-3 stroke-gray-90 dark:stroke-gray-10 " /></Tooltip>}
                                            className="cursor-pointer"
                                        />
                                    ))
                                )}
                                {filterScope && filterScope.length > 0 && (
                                    filterScope.map((s) => (
                                        <Chip
                                            key={`scope-${s}`}
                                            label={`Scope: ${s}`}
                                            size="small"
                                            onDelete={() => setFilterScope((prev) => (prev || []).filter((v) => v !== s))}
                                            deleteIcon={<Tooltip title="Remove filter" placement='top' arrow><CloseButton className="btn-ghost block ml-2 w-3 h-3 stroke-gray-90 dark:stroke-gray-10 " /></Tooltip>}
                                            className="cursor-pointer"
                                        />
                                    ))
                                )}
                                {filterGoal && filterGoal.length > 0 && (
                                    filterGoal.map((id) => {
                                        const allGoals = Object.values(indexedGoals).flat();
                                        const goal = allGoals.find(g => g.id === id);
                                        return (
                                            <Chip
                                                key={`goal-${id}`}
                                                label={`Goal: ${goal?.title || id}`}
                                                size="small"
                                                onDelete={() => setFilterGoal((prev) => (prev || []).filter((v) => v !== id))}
                                                deleteIcon={<Tooltip title="Remove filter" placement='top' arrow><CloseButton className="btn-ghost block ml-2 w-3 h-3 stroke-gray-90 dark:stroke-gray-10 " /></Tooltip>}
                                                className="cursor-pointer"
                                            />
                                        );
                                    })
                                )}
                                {filterStartDate && filterEndDate && (
                                    <Chip
                                        label={`Range: ${filterStartDate?.format('YYYY-MM-DD')} → ${filterEndDate?.format('YYYY-MM-DD')}`}
                                        size="small"
                                        onDelete={() => { setFilterStartDate(null); setFilterEndDate(null); }}
                                        deleteIcon={<Tooltip title="Remove filter" placement='top' arrow><CloseButton className="btn-ghost block ml-2 w-3 h-3 stroke-gray-90 dark:stroke-gray-10 " /></Tooltip>}
                                        className="cursor-pointer"
                                    />
                                )}
                                {showArchived && (
                                    <Chip
                                        label="Including archived"
                                        size="small"
                                        icon={<Archive className="w-3 h-3 ml-1" />}
                                        onDelete={() => setShowArchived(false)}
                                        deleteIcon={<Tooltip title="Remove filter" placement='top' arrow><CloseButton className="btn-ghost block ml-2 w-3 h-3 stroke-gray-90 dark:stroke-gray-10 " /></Tooltip>}
                                        className="cursor-pointer"
                                    />
                                )}
                                
                            </>
                        )}
                    </div>
                    {/* Floating compact bulk toolbar - appears at bottom-right on all views when items are selected */}
                    <div className="selectAll">
                        {viewMode !== 'table' && (
                            <>
                        <div className={`floating-bulk${selectedCount > 0 ? '-toolbar flex-row align-start justify-start items-start sm:flex-row' : ''}`} role="toolbar" aria-label="Bulk actions">
                            <Tooltip title={selectedCount > 0 ? `Deselect all ${selectionType || ''}` : (viewMode === 'cards' ? 'Select all goals' : 'Select all tasks')} placement="top" arrow>
                                <Badge badgeContent={selectedCount} color="primary">
                                    <span className="sr-only">{selectedCount} selected</span>
                                    <button
                                        className={`btn-ghost ${selectedCount > 0 ? 'dark:[&>.lucide]:stroke-brand-30 [&>.lucide]:stroke-brand-70' : ''}`}
                                        onClick={() => {
                                            if (selectedCount > 0) {
                                                deselectAll();
                                            } else if (viewMode === 'cards') {
                                                selectAllGoals();
                                            } else {
                                                selectAllTasks();
                                            }
                                        }}
                                        aria-label={selectedCount > 0 ? `Deselect all ${selectionType || ''}` : (viewMode === 'cards' ? 'Select all goals' : 'Select all tasks')}
                                    >
                                        {selectedCount > 0 ? <SquareSlash /> : <CheckSquare2 />}
                                    </button>
                                </Badge>
                            </Tooltip>
                            {selectedCount > 0 && (
                                
                                    <div className="flex flex-col items-start justify-start sm:flex-row ">
                                        <button className="btn-ghost fb-btn" onClick={() => setIsBulkDeleteConfirmOpen(true)} disabled={bulkActionLoading} title="Delete selected" aria-label="Delete selected">Delete</button>
                                        <button
                                            className="btn-ghost fb-btn"
                                            onClick={(e) => {
                                                const el = e.currentTarget as HTMLElement;
                                                // if element is not attached to document, record click coords as fallback
                                                const pos = { top: e.clientY, left: e.clientX };
                                                setBulkStatusLastClickPos(pos);
                                                if (!document.body.contains(el)) {
                                                    setBulkStatusAnchorPos(pos);
                                                    setBulkStatusAnchorEl(null);
                                                } else {
                                                    setBulkStatusAnchorEl(el);
                                                    setBulkStatusAnchorPos(null);
                                                }
                                            }}
                                            disabled={bulkActionLoading}
                                            title="Set status"
                                            aria-label="Set status"
                                            ref={bulkStatusTriggerRef}
                                        >
                                            Status
                                        </button>
                                        <button
                                            className="btn-ghost fb-btn"
                                            onClick={(e) => {
                                                const el = e.currentTarget as HTMLElement;
                                                const pos = { top: e.clientY, left: e.clientX };
                                                setBulkCategoryLastClickPos(pos);
                                                if (!document.body.contains(el)) {
                                                    setBulkCategoryAnchorPos(pos);
                                                    setBulkCategoryAnchorEl(null);
                                                } else {
                                                    setBulkCategoryAnchorEl(el);
                                                    setBulkCategoryAnchorPos(null);
                                                }
                                            }}
                                            disabled={bulkActionLoading}
                                            title="Set category"
                                            aria-label="Set category"
                                            ref={bulkCategoryTriggerRef}
                                        >
                                            Category
                                        </button>
                                    </div>
                                
                            )}
                        {/* Bulk status menu */}
                           <span>
                            <Menu
                                id="bulk-status-menu"
                                anchorEl={bulkStatusAnchorEl}
                                open={Boolean(bulkStatusAnchorEl) || Boolean(bulkStatusAnchorPos)}
                                onClose={handleCloseBulkStatus}
                                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                                anchorReference={bulkStatusAnchorPos ? 'anchorPosition' : 'anchorEl'}
                                anchorPosition={bulkStatusAnchorPos ? { top: Math.round(bulkStatusAnchorPos.top), left: Math.round(bulkStatusAnchorPos.left) } : undefined}
                                PaperProps={{ sx: { bgcolor: 'var(--background-paper)', p: 1 } }}
                            >
                                {statusOptions.map((s) => (
                                    <MenuItem
                                        key={s}
                                        onClick={() => applyBulkStatus(s)}
                                        // disabled={isUpdatingStatus}
                                        className='text-xs'
                                        // selected={s === localStatus}

                                    >
                                        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 6, background: STATUS_COLORS[s], marginRight: 8 }} />
                                        {s}
                                    </MenuItem>
                                ))}
                            </Menu>
                                </span>
                            {/* Bulk category menu */}
                            <span>
                            <Menu
                                id="bulk-category-menu"
                                anchorEl={bulkCategoryAnchorEl}
                                open={Boolean(bulkCategoryAnchorEl) || Boolean(bulkCategoryAnchorPos)}
                                onClose={handleCloseBulkCategory}
                                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                                anchorReference={bulkCategoryAnchorPos ? 'anchorPosition' : 'anchorEl'}
                                anchorPosition={bulkCategoryAnchorPos ? { top: Math.round(bulkCategoryAnchorPos.top), left: Math.round(bulkCategoryAnchorPos.left) } : undefined}
                                PaperProps={{ sx: { bgcolor: 'var(--background-paper)', p: 1, maxHeight: '300px', } }}
                            >
                                {categoryOptions.map((c) => (
                                    c === categoryOptions[0] ? (
                                        <span key={`wrap-${c}`}>
                                            {/* Render the search input as a non-menu element so typing doesn't trigger
                                                the menu's type-to-select behavior. We also stop keydown propagation
                                                from the input and prevent blur when clicking the Add button so the
                                                onClick reliably fires. */}
                                            <div key="bulk-category-search" role="presentation">
                                                <div style={{ width: 260, padding: '4px 0' }}>
                                                    <TextField
                                                        id="bulk-category-search"
                                                        size="small"
                                                        placeholder="Filter or add category"
                                                        sx={{ position: 'sticky', top: 0, bgcolor: 'var(--color-background)', zIndex: 1 }}
                                                        fullWidth
                                                        onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                                            const q = (e.target.value || '').toLowerCase();
                                                            // Filter visible MenuItem entries in this menu by role="menuitem"
                                                            const items = document.querySelectorAll('#bulk-category-menu [role="menuitem"]');
                                                            items.forEach((it) => {
                                                                const txt = (it.textContent || '').toLowerCase();
                                                                (it as HTMLElement).style.display = q && txt.indexOf(q) === -1 ? 'none' : '';
                                                            });
                                                        }}
                                                        onKeyDown={(e) => {
                                                            // Stop the Menu/List from handling type-to-select while typing in the input
                                                            e.stopPropagation();
                                                        }}
                                                        InputProps={{
                                                            endAdornment: (
                                                                <InputAdornment position="end">
                                                                    <Tooltip title="Add category" placement="top" arrow>
                                                                    <IconButton
                                                                        size="small"
                                                                        aria-label="Add category"
                                                                        onMouseDown={(e) => e.preventDefault()}
                                                                        onClick={async () => {
                                                                                const el = document.getElementById('bulk-category-search') as HTMLInputElement | null;
                                                                                const val = el?.value?.trim();
                                                                                if (!val) return;
                                                                                try {
                                                                                    // Try to add the category. On success, apply it to selected goals.
                                                                                    await addCategory(val);
                                                                                    await applyBulkCategory(val);
                                                                                } catch (err: any) {
                                                                                    // If the category already exists, still apply it.
                                                                                    const msg = (err && err.message) || '';
                                                                                    if (msg.toLowerCase().includes('category already exists') || msg.toLowerCase().includes('duplicate')) {
                                                                                        try {
                                                                                            await applyBulkCategory(val);
                                                                                        } catch (innerErr) {
                                                                                            console.error('Failed to apply existing category', innerErr);
                                                                                            notifyError('Failed to apply category');
                                                                                        }
                                                                                    } else {
                                                                                        console.error('Failed to add category', err);
                                                                                        notifyError('Failed to add category');
                                                                                    }
                                                                                }
                                                                            }}
                                                                        type="button"
                                                                    >
                                                                        <PlusIcon className="w-4 h-4" />
                                                                    </IconButton>
                                                                    </Tooltip>
                                                                </InputAdornment>
                                                            ),
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                            <MenuItem
                                                key={c}
                                                onClick={() => applyBulkCategory(c)}
                                            >
                                                {c}
                                            </MenuItem>
                                        </span>
                                    ) : (
                                        <MenuItem
                                            key={c}
                                            onClick={() => applyBulkCategory(c)}
                                        >
                                            {c}
                                        </MenuItem>
                                    )
                                ))}
                            </Menu>
                        </span>
                        </div>
                            </>
                        )}
                        {/* Collapsible search bar */}
                        <div className="relative flex items-center">
                          {/* Search icon: fades out when bar opens */}
                          <div
                            style={{
                              width: (searchBarOpen || filter) ? '0px' : '32px',
                              opacity: (searchBarOpen || filter) ? 0 : 1,
                              overflow: 'hidden',
                              flexShrink: 0,
                              pointerEvents: (searchBarOpen || filter) ? 'none' : 'auto',
                              transition: 'width 0.2s ease, opacity 0.15s ease',
                            }}
                          >
                            <Tooltip title="Search" placement="top" arrow>
                              <IconButton
                                className="btn-ghost"
                                size="small"
                                aria-label="Search"
                                tabIndex={(searchBarOpen || filter) ? -1 : 0}
                                onClick={() => {
                                  setSearchBarOpen(true);
                                  setTimeout(() => filterInputRef.current?.focus(), 50);
                                }}
                              >
                                <SearchIcon className="w-5 h-5" />
                              </IconButton>
                            </Tooltip>
                          </div>
                          {/* TextField: expands open */}
                          <div
                            style={{
                                width: '100%',
                                maxWidth: (searchBarOpen || filter) ? '480px' : '0px',
                                opacity: (searchBarOpen || filter) ? 1 : 0,
                                overflow: 'hidden',
                                flexShrink: 0,
                                transition: 'max-width 0.2s ease, opacity 0.15s ease',
                            }}
                          >
                            <TextField
                              id="goal-filter"
                              size="small"
                              fullWidth
                              value={filter}
                              inputRef={(el) => { filterInputRef.current = el; }}
                              onFocus={() => {
                                if (blurTimeoutRef.current) window.clearTimeout(blurTimeoutRef.current);
                                setFilterFocused(true);
                              }}
                              onBlur={() => {
                                blurTimeoutRef.current = window.setTimeout(() => {
                                  setFilterFocused(false);
                                  blurTimeoutRef.current = null;
                                  if (!filter) setSearchBarOpen(false);
                                }, 150);
                              }}
                              onChange={(e: ChangeEvent<HTMLInputElement>) => handleFilterChange(e.target.value)}
                              placeholder="Search..."
                              InputProps={{
                                startAdornment: (
                                  <InputAdornment position="start">
                                    <IconButton
                                      size="small"
                                      aria-label="Close search"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => {
                                          setSearchBarOpen(false);
                                          setFilter('');
                                        }}
                                    >   

                                        <CloseButton className="w-5 h-5" />
                                    </IconButton>
                                  </InputAdornment>
                                ),
                                endAdornment: (
                                  <InputAdornment position="end">
                                    <Tooltip title={filter ? "Clear text" : ""} placement="top" arrow>
                                      <span>
                                        <IconButton
                                          size="small"
                                          aria-label="Clear text"
                                          disabled={!filter}
                                          onMouseDown={(e) => e.preventDefault()}
                                          onClick={() => {
                                            handleFilterChange('');
                                            filterInputRef.current?.focus();
                                          }}
                                          onFocus={() => { if (blurTimeoutRef.current) window.clearTimeout(blurTimeoutRef.current); setClearButtonFocused(true); }}
                                          onBlur={() => { blurTimeoutRef.current = window.setTimeout(() => setClearButtonFocused(false), 150); }}
                                        >
                                          <XCircleIcon className="w-4 h-4" />
                                        </IconButton>
                                      </span>
                                    </Tooltip>
                                  </InputAdornment>
                                ),
                              }}
                            />
                          </div>
                        </div>
                        {/* Ghost clear-all button */}
                                {selectedFiltersCount > 0 && (
                                <button
                                    type="button"
                                    className="btn-ghost ml-1"
                                    title="Clear all filters"
                                    onClick={() => {
                                        setFilter('');
                                        setFilterStatus([]);
                                        setFilterCategory([]);
                                        setFilterGoal([]);
                                        setFilterStartDate(null);
                                        setFilterEndDate(null);
                                    }}
                                    >
                                    <Tooltip title="Clear all filters" placement='top' arrow>
                                        <CloseButton className="w-4 h-4" />
                                    </Tooltip>
                                </button>
                                )}
                        
                        {/* Edit Win Modal (reuses WinEditor) */}
                        {isEditWinModalOpen && selectedWin && (
                            <div
                                className="fixed inset-0 bg-gray-100 bg-opacity-75 flex items-center justify-center z-50"
                                role="presentation"
                                onMouseDown={(e) => {
                                    // close when clicking the backdrop (only trigger when clicking the overlay itself)
                                    if (e.target === e.currentTarget) {
                                        setSelectedWin(null);
                                        setIsEditWinModalOpen(false);
                                    }
                                }}
                            >
                                <div className={`${modalClasses}`}>
                                    <h3 className="text-lg font-medium text-secondary-text mb-4">Edit Win</h3>
                                    <WinEditor
                                        win={selectedWin}
                                        onSave={async (updatedDescription?: string, updatedTitle?: string, updatedImpact?: string) => {
                                            if (!selectedWin) return;
                                            await saveEditedWin(selectedWin.id, { title: updatedTitle, description: updatedDescription, impact: updatedImpact }, (selectedGoal as any)?.id);
                                        }}
                                        onRequestClose={() => { setSelectedWin(null); setIsEditWinModalOpen(false); }}
                                    />
                                </div>
                            </div>
                        )}
                        {viewMode === 'cards' && (
                        <>
                            <Tooltip title={`Sort: ${sortBy.charAt(0).toUpperCase() + sortBy.slice(1)} (${sortDirection === 'asc' ? 'ascending' : 'descending'})`} placement="top" arrow>
                                <span className="flex items-center space-x-2">
                                    <IconButton
                                        onClick={(e) => setSortAnchorEl(e.currentTarget)}
                                        className="btn-ghost px-3 py-2"
                                        aria-label={`Sort: ${sortBy} ${sortDirection === 'asc' ? 'ascending' : 'descending'}`}
                                        aria-controls={sortAnchorEl ? 'sort-menu' : undefined}
                                        aria-haspopup="true"
                                        aria-expanded={sortAnchorEl ? 'true' : undefined}
                                    >
                                        {/* Visible sort label to indicate active sort field and direction */}
                                        <span className="hidden sm:flex items-center space-x-3 text-gray-70 dark:text-gray-30">
                                            {sortBy === 'date' && ( 
                                                <span role="img" aria-label="Sort by date" title="Sort by date" className='text-brand-60 dark:text-brand-20'>
                                                <CalendarIcon className="w-4 h-4" />
                                            </span>
                                            )}
                                            {sortBy === 'status' && ( 
                                                <span role="img" aria-label="Sort by status" title="Sort by status" className='text-brand-60 dark:text-brand-20'>
                                                <Check className="w-4 h-4" />
                                            </span>
                                            )}
                                            {sortBy === 'category' && ( 
                                                <span role="img" aria-label="Sort by category" title="Sort by category" className='text-brand-60 dark:text-brand-20'>
                                                <TagIcon className="w-4 h-4" />
                                            </span>
                                            )}
                                        </span>
                                        {sortDirection === 'desc' ? <ArrowDown className='w-5 h-5' /> : <ArrowUp className='w-5 h-5' />}
                                    </IconButton>
                                </span>
                            </Tooltip>
                            <Menu
                                id="sort-menu"
                                anchorEl={sortAnchorEl}
                                open={Boolean(sortAnchorEl)}
                                onClose={() => setSortAnchorEl(null)}
                                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                                MenuListProps={{ 'aria-labelledby': 'sort-button' }}
                            >
                                <MenuItem
                                    selected={sortBy === 'date' && sortDirection === 'asc'}
                                    onClick={() => { setSortBy('date'); setSortDirection('asc'); setSortAnchorEl(null); }}
                                >
                                    <CalendarIcon className="w-4 h-4" /><ArrowUp className="w-4 h-4 mr-8" /> Date Ascending 
                                </MenuItem>
                                <MenuItem
                                    selected={sortBy === 'date' && sortDirection === 'desc'}
                                    onClick={() => { setSortBy('date'); setSortDirection('desc'); setSortAnchorEl(null); }}
                                >
                                    <CalendarIcon className="w-4 h-4" /><ArrowDown className="w-4 h-4 mr-8" /> Date Descending 
                                </MenuItem>
                                <MenuItem
                                    selected={sortBy === 'category' && sortDirection === 'asc'}
                                    onClick={() => { setSortBy('category'); setSortDirection('asc'); setSortAnchorEl(null); }}
                                >
                                    <TagIcon className="w-4 h-4" /><ArrowUp className="w-4 h-4 mr-8" /> Category Ascending 
                                </MenuItem>
                                <MenuItem
                                    selected={sortBy === 'category' && sortDirection === 'desc'}
                                    onClick={() => { setSortBy('category'); setSortDirection('desc'); setSortAnchorEl(null); }}
                                >
                                    <TagIcon className="w-4 h-4" /><ArrowDown className="w-4 h-4 mr-8" /> Category Descending 
                                </MenuItem>
                                <MenuItem
                                
                                    selected={sortBy === 'status' && sortDirection === 'asc'}
                                    onClick={() => { setSortBy('status'); setSortDirection('asc'); setSortAnchorEl(null); }}
                                >
                                    <Check className="w-4 h-4" /><ArrowUp className="w-4 h-4 mr-8" /> Status Ascending 
                                </MenuItem>
                                <MenuItem
                                    selected={sortBy === 'status' && sortDirection === 'desc'}
                                    onClick={() => { setSortBy('status'); setSortDirection('desc'); setSortAnchorEl(null); }}
                                >
                                    <Check className="w-4 h-4" /><ArrowDown className="w-4 h-4 mr-8" /> Status Descending 
                                </MenuItem>
                            </Menu>
                            
                        </>
                    )}                  

                        {/* Add (Goal or Task) Button */}
                        <Tooltip title="Add a goal or task" placement="top" arrow>
                            <button
                                onClick={(e) => setAddMenuAnchorEl(e.currentTarget)}
                                className="btn-primary gap-2 flex ml-auto sm:mt-0 md:pr-2 sm:pr-2 xs:pr-0"
                                aria-label="Add a goal or task"
                                aria-haspopup="menu"
                            >
                                <PlusIcon className="w-5 h-5" />
                                <span className="hidden md:inline">Add</span>
                            </button>
                        </Tooltip>
                        <Menu
                            anchorEl={addMenuAnchorEl}
                            open={Boolean(addMenuAnchorEl)}
                            onClose={() => setAddMenuAnchorEl(null)}
                            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                        >
                            <MenuItem onClick={() => { setAddMenuAnchorEl(null); openGoalModal(); }} disabled={!canCreateGoal}>
                                <Target className="w-4 h-4 mr-2 text-primary" />
                                Add a goal
                                {!canCreateGoal && <span className="ml-2 text-xs text-gray-400">(limit reached)</span>}
                            </MenuItem>
                            <MenuItem onClick={() => { setAddMenuAnchorEl(null); setIsAddTaskModalOpen(true); }}>
                                <ListTodo className="w-4 h-4 mr-2 text-primary" />
                                Add a task
                            </MenuItem>
                        </Menu>
                        <div id="summary_btn">
                            <SummaryGenerator 
                            summaryId={selectedSummary?.id || ''} 
                            summaryTitle={selectedSummary?.title || `Summary for ${scope}: ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`}                                                                                                                                                                                selectedRange={new Date()}
                            filteredGoals={sortedAndFilteredGoals} // Pass only the filtered/visible goals
                            scope={scope}
                            />
                        </div>
                    
                    </div>
                </div>

                {/* Filter side panel + content row */}
                <div className="flex flex-row items-start w-full">

                    {/* Slide-in filter panel */}
                    <div
                        style={{
                            width: filterPanelOpen ? '252px' : '0px',
                            overflow: 'hidden',
                            flexShrink: 0,
                            transition: 'width 0.25s ease',
                            position: 'sticky',
                            top: '8rem',
                            zIndex: 1,
                        }}
                    >
                        <div className="pr-4" style={{ width: '252px', minWidth: '252px' }}>
                            <div className="rounded-md border border-gray-20 dark:border-gray-70 bg-background-color p-3 flex flex-col gap-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-semibold text-primary">Filters</span>
                                    <IconButton size="small" className="btn-ghost" onClick={() => setFilterPanelOpen(false)} aria-label="Close filters">
                                        <XCircleIcon className="w-4 h-4" />
                                    </IconButton>
                                </div>
                                {/* Status accordion — filters tasks */}
                                <Accordion defaultExpanded disableGutters elevation={0} sx={{ bgcolor: 'transparent', '&:before': { display: 'none' }, borderBottom: '1px solid', borderColor: 'divider' }}>
                                    <AccordionSummary expandIcon={<ChevronDown className="w-3.5 h-3.5" />} sx={{ p: 0, minHeight: 'unset', '& .MuiAccordionSummary-content': { my: '6px' } }}>
                                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-60 dark:text-gray-40">Task Status</span>
                                    </AccordionSummary>
                                    <AccordionDetails sx={{ p: 0, pb: 1 }}>
                                        <div className="flex flex-col">
                                            {statusOptions.map((s) => (
                                                <label key={s} className="flex items-center gap-2 cursor-pointer text-sm py-0.5 px-1 rounded hover:bg-gray-10 dark:hover:bg-gray-80">
                                                    <Checkbox
                                                        size="small"
                                                        checked={(filterStatus || []).indexOf(s) > -1}
                                                        onChange={(e) => {
                                                            if (e.target.checked) setFilterStatus(prev => [...(prev || []), s]);
                                                            else setFilterStatus(prev => (prev || []).filter(v => v !== s));
                                                        }}
                                                        sx={{ p: 0 }}
                                                    />
                                                    <span className="flex items-center gap-1.5">
                                                        <span style={{ width: 8, height: 8, borderRadius: 4, background: STATUS_COLORS[s], display: 'inline-block', flexShrink: 0 }} />
                                                        {s}
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                    </AccordionDetails>
                                </Accordion>

                                {/* Category accordion */}
                                <Accordion defaultExpanded disableGutters elevation={0} sx={{ bgcolor: 'transparent', '&:before': { display: 'none' }, borderBottom: '1px solid', borderColor: 'divider' }}>
                                    <AccordionSummary expandIcon={<ChevronDown className="w-3.5 h-3.5" />} sx={{ p: 0, minHeight: 'unset', '& .MuiAccordionSummary-content': { my: '6px' } }}>
                                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-60 dark:text-gray-40">Category</span>
                                    </AccordionSummary>
                                    <AccordionDetails sx={{ p: 0, pb: 1 }}>
                                        <div className="flex flex-col">
                                            {categoryOptions.map((c) => (
                                                <label key={c} className="flex items-center gap-2 cursor-pointer text-sm py-0.5 px-1 rounded hover:bg-gray-10 dark:hover:bg-gray-80">
                                                    <Checkbox
                                                        size="small"
                                                        checked={(filterCategory || []).indexOf(c) > -1}
                                                        onChange={(e) => {
                                                            if (e.target.checked) setFilterCategory(prev => [...(prev || []), c]);
                                                            else setFilterCategory(prev => (prev || []).filter(v => v !== c));
                                                        }}
                                                        sx={{ p: 0 }}
                                                    />
                                                    {c}
                                                </label>
                                            ))}
                                        </div>
                                    </AccordionDetails>
                                </Accordion>

                                {/* Scope accordion */}
                                {/* <Accordion defaultExpanded disableGutters elevation={0} sx={{ bgcolor: 'transparent', '&:before': { display: 'none' }, borderBottom: '1px solid', borderColor: 'divider' }}>
                                    <AccordionSummary expandIcon={<ChevronDown className="w-3.5 h-3.5" />} sx={{ p: 0, minHeight: 'unset', '& .MuiAccordionSummary-content': { my: '6px' } }}>
                                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-60 dark:text-gray-40">Scope</span>
                                    </AccordionSummary>
                                    <AccordionDetails sx={{ p: 0, pb: 1 }}>
                                        <div className="flex flex-col">
                                            {['week', 'month', 'year'].map((s) => (
                                                <label key={s} className="flex items-center gap-2 cursor-pointer text-sm py-0.5 px-1 rounded hover:bg-gray-10 dark:hover:bg-gray-80">
                                                    <Checkbox
                                                        size="small"
                                                        checked={(filterScope || []).indexOf(s) > -1}
                                                        onChange={(e) => {
                                                            if (e.target.checked) setFilterScope(prev => [...(prev || []), s]);
                                                            else setFilterScope(prev => (prev || []).filter(v => v !== s));
                                                        }}
                                                        sx={{ p: 0 }}
                                                    />
                                                    <span className="capitalize">{s}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </AccordionDetails>
                                </Accordion> */}

                                {/* Goal accordion — kanban / calendar only */}
                                {(viewMode === 'kanban' || viewMode === 'tasks-calendar') && (
                                    <Accordion defaultExpanded disableGutters elevation={0} sx={{ bgcolor: 'transparent', '&:before': { display: 'none' }, borderBottom: '1px solid', borderColor: 'divider' }}>
                                        <AccordionSummary expandIcon={<ChevronDown className="w-3.5 h-3.5" />} sx={{ p: 0, minHeight: 'unset', '& .MuiAccordionSummary-content': { my: '6px' } }}>
                                            <span className="text-xs font-semibold uppercase tracking-wide text-gray-60 dark:text-gray-40">Goal</span>
                                        </AccordionSummary>
                                        <AccordionDetails sx={{ p: 0, pb: 1 }}>
                                            <div className="flex flex-col">
                                                {(() => {
                                                    const allGoals = Object.values(indexedGoals).flat();
                                                    return allGoals.map((goal) => (
                                                        <label key={goal.id} className="flex items-center gap-2 cursor-pointer text-sm py-0.5 px-1 rounded hover:bg-gray-10 dark:hover:bg-gray-80">
                                                            <Checkbox
                                                                size="small"
                                                                checked={(filterGoal || []).indexOf(goal.id) > -1}
                                                                onChange={(e) => {
                                                                    if (e.target.checked) setFilterGoal(prev => [...(prev || []), goal.id]);
                                                                    else setFilterGoal(prev => (prev || []).filter(v => v !== goal.id));
                                                                }}
                                                                sx={{ p: 0 }}
                                                            />
                                                            <span className="truncate" title={goal.title}>{goal.title}</span>
                                                        </label>
                                                    ));
                                                })()}
                                            </div>
                                        </AccordionDetails>
                                    </Accordion>
                                )}

                                {/* Date range accordion */}
                                <Accordion defaultExpanded disableGutters elevation={0} sx={{ bgcolor: 'transparent', '&:before': { display: 'none' }, borderBottom: '1px solid', borderColor: 'divider' }}>
                                    <AccordionSummary expandIcon={<ChevronDown className="w-3.5 h-3.5" />} sx={{ p: 0, minHeight: 'unset', '& .MuiAccordionSummary-content': { my: '6px' } }}>
                                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-60 dark:text-gray-40">Date Range</span>
                                    </AccordionSummary>
                                    <AccordionDetails sx={{ p: 0, pb: 1 }}>
                                        <LocalizationProvider dateAdapter={AdapterDayjs}>
                                            <div className="flex flex-col gap-2">
                                                <DatePicker
                                                    label="Start"
                                                    value={filterStartDate}
                                                    onChange={(v: Dayjs | null) => setFilterStartDate(v)}
                                                    slotProps={{ textField: { size: 'small', fullWidth: true } }}
                                                    maxDate={filterEndDate ?? undefined}
                                                />
                                                <DatePicker
                                                    label="End"
                                                    value={filterEndDate}
                                                    onChange={(v: Dayjs | null) => setFilterEndDate(v)}
                                                    slotProps={{ textField: { size: 'small', fullWidth: true } }}
                                                    minDate={filterStartDate ?? undefined}
                                                />
                                            </div>
                                        </LocalizationProvider>
                                    </AccordionDetails>
                                </Accordion>

                                {/* Archived toggle */}
                                <div className="flex items-center justify-between py-2 ">
                                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-60 dark:text-gray-40 flex items-center gap-1">
                                        <Archive className="w-3.5 h-3.5" /> Include archived
                                    </span>
                                    {/* <label className="flex items-center gap-2 cursor-pointer text-sm">
                                        <input
                                            type="checkbox"
                                            checked={showArchived}
                                            onChange={(e) => setShowArchived(e.target.checked)}
                                            className="rounded"
                                            aria-label="Show archived goals"
                                        />
                                        <span>Show archived</span>
                                    </label> */}
                                    <Switch
                                        size="small"
                                        checked={showArchived}
                                        onChange={(e) => setShowArchived(e.target.checked)}
                                        inputProps={{ 'aria-label': 'Show archived goals' }}

                                    />
                                </div>

                                <div className="flex justify-between items-center pt-2">
                                    <button
                                        type="button"
                                        className="btn-ghost text-sm"
                                        onClick={() => {
                                            setFilterStatus([]);
                                            setFilterCategory([]);
                                            setFilterGoal([]);
                                            setFilterScope([]);
                                            setFilterStartDate(null);
                                            setFilterEndDate(null);
                                            setShowArchived(false);
                                        }}
                                    >
                                        Clear all
                                    </button>
                                    {/* <button
                                        type="button"
                                        className="btn-primary text-sm"
                                        onClick={() => setFilterPanelOpen(false)}
                                    >
                                        Done
                                    </button> */}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Goals content */}
                    <div className="flex-1 min-w-0">

                {/* Goals List - render by viewMode */}
                {viewMode === 'cards' && (
                        <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 3xl:grid-cols-5 gap-4 w-full'>
                            {ctxGoals.filter(g => String(g.id).startsWith('temp-')).map(g => (
                                <GoalCardSkeleton key={g.id} />
                            ))}
                            {(lastAddedIds || []).filter(id => !sortedAndFilteredGoals.some(g => g.id === id)).map(id => (
                                <GoalCardSkeleton key={`pending-${id}`} />
                            ))}
                            {sortedAndFilteredGoals.map((goal) => (
                            <GoalCard
                                key={goal.id}
                                goal={ctxArchivedIds.has(goal.id) ? { ...goal, is_archived: true } : goal}
                                showAllGoals={true}
                                handleDelete={(goalId) => handleDeleteGoal(goalId)}
                                handleEdit={(goalId) => {
                                    const goalSourceForEdit = Object.values(indexedGoals).flat();
                                    const goalToEdit = goalSourceForEdit.find((g) => g.id === goalId);
                                    if (goalToEdit) {
                                        setSelectedGoal(goalToEdit);
                                        setIsEditorOpen(true);
                                    }
                                }}
                                filter={filter}
                                selectable={true}
                                isSelected={selectedIds.has(goal.id)}
                                onToggleSelect={(id) => toggleSelect(id, 'goals')}
                                onRefresh={refreshGoals}
                                onAddTask={(goalId) => { setStandaloneTaskGoalId(goalId); setIsAddTaskModalOpen(true); }}
                            />
                            ))}
                        </div>
                )}

                {viewMode === 'table' && (
                    isSmall ? (
                        setViewMode('cards'), <div></div>
                    ) : (
                        <Paper elevation={3} sx={{ bgcolor: 'var(--background-color)', color: 'var(--primary-text)' }}>
                        {/* <Paper elevation={6}> */}
                            <Table aria-label="Goals Table">
                                <TableHead className='border-none'>
                                    <TableRow className='bg-background-color border-none'>
                                        <TableCell colSpan={selectedCount > 0 ?  5 : 1} className="px-4 py-2"   >
                                            <div className="flex items-center space-x-4">
                                                <div className={`gap-1 floating-bulk${selectedCount > 0 ? '-toolbar flex-row align-start justify-start items-start sm:flex-row' : ''}`} role="toolbar" aria-label="Bulk actions">
                                                    <Tooltip title={expandedRowIds.size === sortedAndFilteredGoals.length ? "Collapse all goals" : "Expand all goals"} placement="top" arrow>
                                                        <IconButton
                                                            className="btn-ghost fb-btn p-3"
                                                            size="small"
                                                            aria-label={expandedRowIds.size === sortedAndFilteredGoals.length ? "Collapse all goals" : "Expand all goals"}
                                                            onClick={() => {
                                                                if (expandedRowIds.size === sortedAndFilteredGoals.length) {
                                                                    setExpandedRowIds(new Set());
                                                                } else {
                                                                    setExpandedRowIds(new Set(sortedAndFilteredGoals.map(g => g.id)));
                                                                }
                                                            }}
                                                        >
                                                            {expandedRowIds.size === sortedAndFilteredGoals.length ? <Shrink className="w-5 h-5" /> : <Expand className="w-5 h-5" />}
                                                        </IconButton>
                                                    </Tooltip>
                                                    <Tooltip title={selectedCount > 0 ? `Deselect all ${selectionType || ''}` : 'Select all...'} placement="top" arrow>
                                                            <Badge badgeContent={selectedCount} color="primary">
                                                            <span className="sr-only">{selectedCount} selected</span>
                                                            <button
                                                                className={`btn-ghost fb-btn ${selectedCount > 0 ? 'dark:[&>.lucide]:stroke-brand-30 [&>.lucide]:stroke-brand-70' : ''}`}
                                                                onClick={(e) => {
                                                                    if (selectedCount > 0) {
                                                                        deselectAll();
                                                                    } else {
                                                                        setSelectAllMenuAnchor(e.currentTarget);
                                                                    }
                                                                }}
                                                                aria-label={selectedCount > 0 ? `Deselect all ${selectionType || ''}` : 'Select all...'}
                                                            >
                                                                {selectedCount > 0 ? <SquareSlash /> : <CheckSquare2 />}
                                                            </button>
                                                        </Badge>
                                                    </Tooltip>
                                                    <Menu
                                                        anchorEl={selectAllMenuAnchor}
                                                        open={Boolean(selectAllMenuAnchor)}
                                                        onClose={() => setSelectAllMenuAnchor(null)}
                                                    >
                                                        <MenuItem
                                                            onClick={() => {
                                                                selectAllGoals();
                                                                setSelectAllMenuAnchor(null);
                                                            }}
                                                        >
                                                            Select All Goals ({visibleIdsArray.length})
                                                        </MenuItem>
                                                        <MenuItem
                                                            onClick={() => {
                                                                selectAllTasks();
                                                                setSelectAllMenuAnchor(null);
                                                            }}
                                                        >
                                                            Select All Tasks ({visibleTaskIds.length})
                                                        </MenuItem>
                                                    </Menu>
                                
                                                    {selectedCount > 0 && (
                                                    <div className="flex flex-col items-start justify-start sm:flex-row ">
                                                        <button className="btn-ghost fb-btn" onClick={() => setIsBulkDeleteConfirmOpen(true)} disabled={bulkActionLoading} title="Delete selected" aria-label="Delete selected">Delete</button>
                                                        <button
                                                            className="btn-ghost fb-btn"
                                                            onClick={(e) => {
                                                                const el = e.currentTarget as HTMLElement;
                                                                if (!document.body.contains(el)) {
                                                                    setBulkStatusAnchorPos({ top: e.clientY, left: e.clientX });
                                                                    setBulkStatusAnchorEl(null);
                                                                } else {
                                                                    setBulkStatusAnchorEl(el);
                                                                    setBulkStatusAnchorPos(null);
                                                                }
                                                            }}
                                                            disabled={bulkActionLoading}
                                                            title="Set status"
                                                            aria-label="Set status"
                                                            ref={bulkStatusTriggerRef}
                                                        >
                                                            Status
                                                        </button>
                                                        <button
                                                            className="btn-ghost fb-btn"
                                                            onClick={(e) => {
                                                                const el = e.currentTarget as HTMLElement;
                                                                if (!document.body.contains(el)) {
                                                                    setBulkCategoryAnchorPos({ top: e.clientY, left: e.clientX });
                                                                    setBulkCategoryAnchorEl(null);
                                                                } else {
                                                                    setBulkCategoryAnchorEl(el);
                                                                    setBulkCategoryAnchorPos(null);
                                                                }
                                                            }}
                                                            disabled={bulkActionLoading}
                                                            title="Set category"
                                                            aria-label="Set category"
                                                            ref={bulkCategoryTriggerRef}
                                                        >
                                                            Category
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                            {selectedCount === 0 && (
                                                <span className='flex items-center' onClick={() => toggleSort('title')} style={{ cursor: 'pointer' }}>
                                                    Goal
                                                    {sortBy === 'title' && (sortDirection === 'asc' ? <ArrowUp className="w-4 h-4 ml-2" /> : <ArrowDown className="w-4 h-4 ml-2" />)}
                                                </span>
                                            )}
                                            </div>
                                            {/* Bulk status menu */}
                                            <span>
                                                <Menu
                                                    id="bulk-status-menu"
                                                    anchorEl={bulkStatusAnchorEl}
                                                    open={Boolean(bulkStatusAnchorEl) || Boolean(bulkStatusAnchorPos)}
                                                    onClose={handleCloseBulkStatus}
                                                    anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                                                    anchorReference={bulkStatusAnchorPos ? 'anchorPosition' : 'anchorEl'}
                                                    anchorPosition={bulkStatusAnchorPos ? { top: Math.round(bulkStatusAnchorPos.top), left: Math.round(bulkStatusAnchorPos.left) } : undefined}
                                                    PaperProps={{ sx: { bgcolor: 'var(--background-paper)', p: 1 } }}
                                                >
                                                    {statusOptions.map((s) => (
                                                        <MenuItem
                                                            key={s}
                                                            onClick={() => applyBulkStatus(s)}
                                                            // disabled={isUpdatingStatus}
                                                            className='text-xs'
                                                            // selected={s === localStatus}

                                                        >
                                                            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 6, background: STATUS_COLORS[s], marginRight: 8 }} />
                                                            {s}
                                                        </MenuItem>
                                                    ))}
                                                </Menu>
                                                    </span>
                                                {/* Bulk category menu */}
                                                <span>
                                                <Menu
                                                    id="bulk-category-menu"
                                                    anchorEl={bulkCategoryAnchorEl}
                                                    open={Boolean(bulkCategoryAnchorEl) || Boolean(bulkCategoryAnchorPos)}
                                                    onClose={handleCloseBulkCategory}
                                                    anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                                                    anchorReference={bulkCategoryAnchorPos ? 'anchorPosition' : 'anchorEl'}
                                                    anchorPosition={bulkCategoryAnchorPos ? { top: Math.round(bulkCategoryAnchorPos.top), left: Math.round(bulkCategoryAnchorPos.left) } : undefined}
                                                    PaperProps={{ sx: { bgcolor: 'var(--background-paper)', p: 1, height: '500px', } }}
                                                >
                                                    {categoryOptions.map((c) => (
                                                        c === categoryOptions[0] ? (
                                                            <span key={`wrap-${c}`}>
                                                                {/* Render the search input as a non-menu element so typing doesn't trigger
                                                                    the menu's type-to-select behavior. We also stop keydown propagation
                                                                    from the input and prevent blur when clicking the Add button so the
                                                                    onClick reliably fires. */}
                                                                <div key="bulk-category-search" role="presentation">
                                                                    <div style={{ width: 260, padding: '4px 0' }}>
                                                                        <TextField
                                                                            id="bulk-category-search"
                                                                            size="small"
                                                                            placeholder="Filter or add category"
                                                                            sx={{ position: 'sticky', top: 0, bgcolor: 'var(--color-background)', zIndex: 1 }}
                                                                            fullWidth
                                                                            onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                                                                const q = (e.target.value || '').toLowerCase();
                                                                                // Filter visible MenuItem entries in this menu by role="menuitem"
                                                                                const items = document.querySelectorAll('#bulk-category-menu [role="menuitem"]');
                                                                                items.forEach((it) => {
                                                                                    const txt = (it.textContent || '').toLowerCase();
                                                                                    (it as HTMLElement).style.display = q && txt.indexOf(q) === -1 ? 'none' : '';
                                                                                });
                                                                            }}
                                                                            onKeyDown={(e) => {
                                                                                // Stop the Menu/List from handling type-to-select while typing in the input
                                                                                e.stopPropagation();
                                                                            }}
                                                                            InputProps={{
                                                                                endAdornment: (
                                                                                    <InputAdornment position="end">
                                                                                        <Tooltip title="Add category" placement="top" arrow>
                                                                                        <IconButton
                                                                                            size="small"
                                                                                            aria-label="Add category"
                                                                                            onMouseDown={(e) => e.preventDefault()}
                                                                                            onClick={async () => {
                                                                                                    const el = document.getElementById('bulk-category-search') as HTMLInputElement | null;
                                                                                                    const val = el?.value?.trim();
                                                                                                    if (!val) return;
                                                                                                    try {
                                                                                                        // Try to add the category. On success, apply it to selected goals.
                                                                                                        await addCategory(val);
                                                                                                        await applyBulkCategory(val);
                                                                                                    } catch (err: any) {
                                                                                                        // If the category already exists, still apply it.
                                                                                                        const msg = (err && err.message) || '';
                                                                                                        if (msg.toLowerCase().includes('category already exists') || msg.toLowerCase().includes('duplicate')) {
                                                                                                            try {
                                                                                                                await applyBulkCategory(val);
                                                                                                            } catch (innerErr) {
                                                                                                                console.error('Failed to apply existing category', innerErr);
                                                                                                                notifyError('Failed to apply category');
                                                                                                            }
                                                                                                        } else {
                                                                                                            console.error('Failed to add category', err);
                                                                                                            notifyError('Failed to add category');
                                                                                                        }
                                                                                                    }
                                                                                                }}
                                                                                            type="button"
                                                                                        >
                                                                                            <PlusIcon className="w-4 h-4" />
                                                                                        </IconButton>
                                                                                        </Tooltip>
                                                                                    </InputAdornment>
                                                                                ),
                                                                            }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                                <MenuItem
                                                                    key={c}
                                                                    onClick={() => applyBulkCategory(c)}
                                                                >
                                                                    {c}
                                                                </MenuItem>
                                                            </span>
                                                        ) : (
                                                            <MenuItem
                                                                key={c}
                                                                onClick={() => applyBulkCategory(c)}
                                                            >
                                                                {c}
                                                            </MenuItem>
                                                        )
                                                    ))}
                                                </Menu>
                                                
                                            </span>
                                        </TableCell>
                                        {selectedCount === 0 && (
                                            <>
                                            <TableCell onClick={() => toggleSort('category')} style={{ cursor: 'pointer' }}>
                                                <span className="flex items-center">
                                                    Category
                                                    {sortBy === 'category' && (sortDirection === 'asc' ? <ArrowUp className="w-4 h-4 ml-2" /> : <ArrowDown className="w-4 h-4 ml-2" />)}
                                                </span>
                                            </TableCell>
                                            <TableCell onClick={() => toggleSort('status')} style={{ cursor: 'pointer' }}>
                                                <span className="flex items-center">
                                                    Status
                                                    {sortBy === 'status' && (sortDirection === 'asc' ? <ArrowUp className="w-4 h-4 ml-2" /> : <ArrowDown className="w-4 h-4 ml-2" />)}
                                                </span>
                                            </TableCell>
                                            <TableCell onClick={() => toggleSort('date')} style={{ cursor: 'pointer' }}>
                                                <span className="flex items-center">
                                                    Week
                                                    {sortBy === 'date' && (sortDirection === 'asc' ? <ArrowUp className="w-4 h-4 ml-2" /> : <ArrowDown className="w-4 h-4 ml-2" />)}
                                                </span>
                                            </TableCell>
                                            <TableCell>Actions</TableCell>
                                            </>
                                        )}
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {sortedAndFilteredGoals.map((goal) => {
                                        const goalTasks = tableTasksByGoal[goal.id] || [];
                                        const isExpanded = expandedRowIds.has(goal.id);
                                        
                                        return (
                                        <React.Fragment key={goal.id}>
                                            <TableRow
                                                selected={selectedIds.has(goal.id)}
                                            >
                                                
                                                <TableCell>
                                                    <div className="flex items-start gap-2">
                                                        <IconButton
                                                            size="small"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                toggleRowExpanded(goal.id);
                                                            }}
                                                            className="btn-ghost"
                                                        >
                                                            {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                                                        </IconButton>
                                                        <Checkbox size="small" className="!btn-ghost !p-2" onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleSelect(goal.id, 'goals');
                                                        }} checked={selectedIds.has(goal.id)} onChange={() => {}} inputProps={{ 'aria-label': `Select goal ${goal.title}` }}
                                                        />
                                                    <div>
                                                            <Typography variant="h6" className='!font-serif !font-semibold'><span dangerouslySetInnerHTML={renderHTML(goal.title)} /></Typography>
                                                            <Typography variant="body2" className="text-gray-50">
                                                                <span dangerouslySetInnerHTML={renderHTML(((goal.description || '').substring(0, 100) + ((goal.description || '').length > 200 ? '...' : '')))} />
                                                            </Typography>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <span className='card-category text-nowrap' dangerouslySetInnerHTML={renderHTML(goal.category)} />
                                                </TableCell>
                                                <TableCell>
                                                    <InlineStatus tasks={goalTasks} />
                                                </TableCell>
                                                <TableCell><span className='text-xs' dangerouslySetInnerHTML={renderHTML(goal.week_start)} /></TableCell>
                                                <TableCell>
                                                    {/* Single chevron button that opens a per-row actions menu */}
                                                    
                                                    <IconButton
                                                        className="btn-ghost"
                                                        size="small"
                                                        aria-controls={rowActionsAnchorEl && rowActionsTargetId === goal.id ? 'row-actions-menu' : undefined}
                                                        aria-haspopup="true"
                                                        aria-expanded={rowActionsAnchorEl && rowActionsTargetId === goal.id ? 'true' : undefined}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const el = e.currentTarget as HTMLElement;
                                                            
                                                            if (rowActionsTargetId === goal.id && rowActionsAnchorEl) {
                                                                setRowActionsAnchorEl(null);
                                                                setRowActionsTargetId(null);
                                                            } else {
                                                                setRowActionsAnchorEl(el);
                                                                setRowActionsTargetId(goal.id);
                                                            }
                                                        }}
                                                    >
                                                        {/* Rotate chevron when open to indicate expanded state */}
                                                    { (winCountMap[goal.id] || 0) > 0 || (notesCountMap[goal.id] || 0) > 0 ? (
                                                        <Badge 
                                                            badgeContent="" 
                                                            color="primary"
                                                            variant='dot'
                                                            anchorOrigin={{
                                                                vertical: 'top',
                                                                horizontal: 'right',
                                                            }}
                                                        >
                                                            <MoreVertical className={`w-4 h-4 ${rowActionsTargetId === goal.id && rowActionsAnchorEl ? '' : ''}`} />
                                                        </Badge>
                                                    ) : (
                                                        <MoreVertical className={`w-4 h-4 ${rowActionsTargetId === goal.id && rowActionsAnchorEl ? '' : ''}`} />
                                                    )}
                                                    </IconButton>

                                                    <Menu
                                                        id="row-actions-menu"
                                                        anchorEl={rowActionsAnchorEl}
                                                        open={Boolean(rowActionsAnchorEl) && rowActionsTargetId === goal.id}
                                                        onClose={() => { setRowActionsAnchorEl(null); setRowActionsTargetId(null); }}
                                                        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                                                        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                                                        // PaperProps={{ sx: { bgcolor: 'var(--color-background)' } }}
                                                    >
                                                        <MenuItem 
                                                            aria-label="Wins" 
                                                            onClick={() => { setSelectedGoal(goal); openWins(goal); }} 
                                                        >
                                                        <Badge 
                                                            badgeContent={winCountMap[goal.id] ?? 0} 
                                                            color="primary"
                                                            anchorOrigin={{
                                                                vertical: 'top',
                                                                horizontal: 'right',
                                                            }}
                                                        >
                                                            <Award className="w-4 h-4 mr-2" name="Add win" />
                                                        </Badge>
                                                        {/* {wins.length > 0 && (
                                                        <div className={objectCounter}>{wins.length}</div>
                                                        )} */}
                                                            Wins
                                                        </MenuItem>
                                            
                                                        <MenuItem 
                                                            aria-label="Notes" onClick={() => { setSelectedGoal(goal); openNotes(goal); }} 
                                                            id="openNotes"
                                                            >
                                                                <Badge 
                                                                    badgeContent={notesCountMap[goal.id] ?? 0} 
                                                                    color="primary"
                                                                    anchorOrigin={{
                                                                        vertical: 'top',
                                                                        horizontal: 'right',
                                                                    }}
                                                                >
                                                                    <NotesIcon className="w-4 h-4 mr-2" />
                                                                </Badge>
                                                                {/* {(typeof notesCount === 'number' && notesCount != 0) && (
                                                                <div className={objectCounter}>{notes.length > 0 ? notes.length : (notesCount ?? 0)}
                                                                </div>
                                                                )} */}
                                                                Notes
                                                        </MenuItem >
                                                        {/* <MenuItem
                                                            aria-label="Tasks"
                                                            onClick={() => {
                                                                setSelectedGoal(goal);
                                                                setTasksGoalId(goal.id);
                                                                setIsTasksModalOpen(true);
                                                                setRowActionsAnchorEl(null);
                                                                setRowActionsTargetId(null);
                                                            }}
                                                        >
                                                            <ListTodo className="w-4 h-4 mr-2" />
                                                            Tasks
                                                        </MenuItem> */}
                                                        
                                                            <MenuItem
                                                                onClick={() => {
                                                                    setSelectedGoal(goal);
                                                                    setIsEditorOpen(true);
                                                                    setRowActionsAnchorEl(null);
                                                                    setRowActionsTargetId(null);
                                                                }}
                                                            >
                                                                <Edit className="w-4 h-4 mr-2" />
                                                                Edit goal
                                                            </MenuItem>
                                                            <MenuItem
                                                                onClick={() => {
                                                                    setArchiveTargetGoal(goal);
                                                                    setIsArchiveConfirmOpen(true);
                                                                    setRowActionsAnchorEl(null);
                                                                    setRowActionsTargetId(null);
                                                                }}
                                                            >
                                                                <Archive className="w-4 h-4 mr-2" />
                                                                {goal.is_archived ? 'Restore goal' : 'Archive goal'}
                                                            </MenuItem>
                                                            <MenuItem
                                                                onClick={() => {
                                                                    setRowActionsAnchorEl(null);
                                                                    setRowActionsTargetId(null);
                                                                    setDeleteTargetId(goal.id);
                                                                    setIsDeleteConfirmOpen(true);
                                                                }}
                                                            >
                                                                <Trash className="w-4 h-4 mr-2" />
                                                                Delete goal
                                                            </MenuItem>
                                                    </Menu>
                                                </TableCell>
                                            </TableRow>
                                            {/* Add task row */}
                                            {isExpanded && (
                                            <TableRow className="bg-gray-10/60 dark:bg-gray-100/30 border-0">
                                                <TableCell colSpan={5} className="border-0 p-0">
                                                <Table className="w-full">
                                                <TableBody>
                                                    <TableRow key={`add-task-${goal.id}`} className="flex w-full bg-gray-10/60 dark:bg-gray-100/30 !border-none">
                                                        <TableCell className="pl-16 !border-none w-full">
                                                            
                                                            {addingTaskForGoal === goal.id ? (
                                                                <div className="p-3 bg-gray-10/60 dark:bg-gray-100/30 rounded-md border-2 border-dashed border-primary space-y-2">
                                                                    <TextField
                                                                        value={newTaskData.title || ''}
                                                                        onChange={(e) => setNewTaskData(prev => ({ ...prev, title: e.target.value }))}
                                                                        size="small"
                                                                        fullWidth
                                                                        placeholder="Enter task title"
                                                                        label="Title *"
                                                                        autoFocus
                                                                    />
                                                                    <TextField
                                                                        value={newTaskData.description || ''}
                                                                        onChange={(e) => setNewTaskData(prev => ({ ...prev, description: e.target.value }))}
                                                                        size="small"
                                                                        fullWidth
                                                                        multiline
                                                                        rows={2}
                                                                        placeholder="Add description (optional)"
                                                                        label="Description"
                                                                    />
                                                                    <LocalizationProvider dateAdapter={AdapterDayjs}>
                                                                    <div className="flex gap-2 items-end space-y-4">
                                                                        <DatePicker
                                                                            label="Date"
                                                                            value={tableSelectedDate}
                                                                            onChange={(newValue) => setTableSelectedDate(newValue)}
                                                                            slotProps={{ textField: { fullWidth: true, size: 'small' } }}
                                                                        />
                                                                        <TimePicker
                                                                            label="Time (optional)"
                                                                            value={tableSelectedTime}
                                                                            onChange={(newValue) => setTableSelectedTime(newValue)}
                                                                            slotProps={{ textField: { fullWidth: true, size: 'small' } }}
                                                                        />
                                                                        <div className="flex flex-row flex-1 px-4 h-full items-end justify-start">
                                                                            <Tooltip title="Enable reminders" placement="top" arrow>
                                                                                <FormControlLabel
                                                                                    label={<span className="flex flex-col"><Bell className="inline w-4 h-4 mr-2" /></span>}
                                                                                    control={
                                                                                        <Switch
                                                                                            checked={newTaskData.reminder_enabled || false}
                                                                                            onChange={(e) => setNewTaskData(prev => ({ ...prev, reminder_enabled: e.target.checked }))}
                                                                                            size="small"
                                                                                        />
                                                                                    }
                                                                                />
                                                                            </Tooltip>
                                                                            {newTaskData.reminder_enabled && (
                                                                                // <TextField
                                                                                //     type="datetime-local"
                                                                                //     value={newTaskData.reminder_datetime || ''}
                                                                                //     onChange={(e) => setNewTaskData(prev => ({ ...prev, reminder_datetime: e.target.value }))}
                                                                                //     size="small"
                                                                                //     label="Reminder Date & Time"
                                                                                //     InputLabelProps={{ shrink: true }}
                                                                                //     fullWidth
                                                                                // />
                                                                                <DateTimePicker
                                                                                    label="Reminder Date & Time"
                                                                                    value={tableReminderDatetime}
                                                                                    onChange={(newValue) => setTableReminderDatetime(newValue)}
                                                                                    slotProps={{ textField: { fullWidth: true, size: 'small' } }}
                                                                                />
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    </LocalizationProvider>
                                                                    <div className="pt-4 flex gap-2 justify-end">
                                                                        <button 
                                                                            onClick={() => {
                                                                                setAddingTaskForGoal(null);
                                                                                setNewTaskData({
                                                                                    title: '',
                                                                                    description: '',
                                                                                    reminder_enabled: false,
                                                                                });
                                                                                setTableSelectedDate(null);
                                                                                setTableSelectedTime(null);
                                                                                setTableReminderDatetime(null);
                                                                            }} 
                                                                            className="btn-secondary btn-sm"
                                                                        >
                                                                            Cancel
                                                                        </button>
                                                                        <button 
                                                                            onClick={() => createTaskForGoal(goal.id)} 
                                                                            className="btn-primary btn-sm"
                                                                        >
                                                                            Add Task
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div className="flex gap-2">
                                                                    <button
                                                                        onClick={() => setAddingTaskForGoal(goal.id)}
                                                                        className="btn-ghost p-2 text-sm text-brand-60 dark:text-brand-30 hover:underline hover:bg-background-color rounded border border-dashed border-gray-30 dark:border-gray-60 hover:border-primary transition-colors flex items-center justify-start gap-2"
                                                                    >
                                                                        <PlusIcon className="w-4 h-4" />
                                                                        Add task
                                                                    </button>
                                                                    <button
                                                                        onClick={() => generateTasksForGoal(goal.id)}
                                                                        disabled={isGeneratingTasks}
                                                                        className="btn-ghost p-2 text-sm text-brand-60 dark:text-brand-30 hover:underline hover:bg-background-color rounded border border-dashed border-gray-30 dark:border-gray-60 hover:border-primary transition-colors flex items-center justify-start gap-2"
                                                                    >
                                                                        {isGeneratingTasks ? 'Generating...' : <><Sparkles className="w-4 h-4" /> Generate with AI</>}
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                    {/* <div className="flex gap-2">…</div> */}

                                                
                                                    {/* )} */}
                                                    {/* Task rows when expanded */}
                                                    {goalTasks.map((task) => (
                                                        <React.Fragment key={`task-${task.id}`}>
                                                        
                                                            <TableRow key={`task-${task.id}`} className=" w-full bg-gray-10/60 dark:bg-gray-100/30">
                                                                <TableCell className="pl-0 border-none">
                                                                    <TaskCard 
                                                                        task={task}
                                                                        filter={filter}
                                                                        className="bg-transparent border-0 shadow-none p-0"
                                                                        selectable
                                                                        hideGoalChip
                                                                        list
                                                                        isSelected={selectedIds.has(task.id)}
                                                                        onToggleSelect={(id) => toggleSelect(id, 'tasks')}
                                                                        onStatusChange={async (taskId, newStatus) => {
                                                                            try {
                                                                                const { data: { session } } = await supabase.auth.getSession();
                                                                                const token = session?.access_token;
                                                                                if (!token) throw new Error('User not authenticated');

                                                                                const response = await fetch('/.netlify/functions/updateTask', {
                                                                                    method: 'PUT',
                                                                                    headers: {
                                                                                        'Content-Type': 'application/json',
                                                                                        Authorization: `Bearer ${token}`,
                                                                                    },
                                                                                    body: JSON.stringify({ id: taskId, status: newStatus }),
                                                                                });

                                                                                if (!response.ok) {
                                                                                    const errBody = await response.json().catch(() => ({}));
                                                                                    if (errBody?.error === 'tier_limit') {
                                                                                        notifyTierLimit(errBody.message || 'Upgrade to activate more goals simultaneously.');
                                                                                        return;
                                                                                    }
                                                                                    throw new Error('Failed to update task status');
                                                                                }
                                                                                notifySuccess('Task status updated');
                                                                                await fetchTasksForGoal(goal.id);
                                                                            } catch (error) {
                                                                                console.error('Error updating task status:', error);
                                                                                notifyError('Failed to update task status');
                                                                            }
                                                                        }}
                                                                        onUpdate={async (taskId, updates) => {
                                                                            try {
                                                                                const { data: { session } } = await supabase.auth.getSession();
                                                                                const token = session?.access_token;
                                                                                if (!token) throw new Error('User not authenticated');

                                                                                const response = await fetch('/.netlify/functions/updateTask', {
                                                                                    method: 'PUT',
                                                                                    headers: {
                                                                                        'Content-Type': 'application/json',
                                                                                        Authorization: `Bearer ${token}`,
                                                                                    },
                                                                                    body: JSON.stringify({ id: taskId, ...updates }),
                                                                                });

                                                                                if (!response.ok) throw new Error('Failed to update task');
                                                                                notifySuccess('Task updated');
                                                                                await fetchTasksForGoal(goal.id);
                                                                            } catch (error) {
                                                                                console.error('Error updating task:', error);
                                                                                notifyError('Failed to update task');
                                                                            }
                                                                        }}
                                                                        onDelete={(taskId) => {
                                                                            const taskToDelete = (tableTasksByGoal[goal.id] || []).find(t => t.id === taskId);
                                                                            if (!taskToDelete) return;
                                                                            setTableTasksByGoal(prev => ({
                                                                                ...prev,
                                                                                [goal.id]: (prev[goal.id] || []).filter(t => t.id !== taskId),
                                                                            }));
                                                                            notifyWithUndo(
                                                                                'Task deleted',
                                                                                async () => {
                                                                                    const { data: { session } } = await supabase.auth.getSession();
                                                                                    const token = session?.access_token;
                                                                                    if (!token) throw new Error('User not authenticated');
                                                                                    const response = await fetch('/.netlify/functions/deleteTask', {
                                                                                        method: 'DELETE',
                                                                                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                                                                        body: JSON.stringify({ id: taskId }),
                                                                                    });
                                                                                    if (!response.ok) throw new Error('Failed to delete task');
                                                                                },
                                                                                () => {
                                                                                    setTableTasksByGoal(prev => ({
                                                                                        ...prev,
                                                                                        [goal.id]: [...(prev[goal.id] || []), taskToDelete].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)),
                                                                                    }));
                                                                                },
                                                                            );
                                                                        }}
                                                                        allowInlineEdit
                                                                    />
                                                                </TableCell>
                                                            </TableRow>
                                                        </React.Fragment>
                                                    ))}
                                                    </TableBody>
                                                    </Table>
                                                </TableCell>
                                            </TableRow>
                                            )}
                                        </React.Fragment>
                                        )})}
                                </TableBody>
                            </Table>
                        </Paper>
                    )
                )}

                <ConfirmModal
                    isOpen={isBulkDeleteConfirmOpen}
                    title={`Delete ${selectedCount} ${selectionType === 'tasks' ? 'tasks' : 'goals'}?`}
                    message={`Are you sure you want to permanently delete ${selectedCount} selected ${selectionType === 'tasks' ? 'tasks' : 'goals'}? This action cannot be undone.`}
                    onCancel={() => setIsBulkDeleteConfirmOpen(false)}
                    onConfirm={async () => {
                        setBulkActionLoading(true);
                        try {
                            const ids = Array.from(selectedIds);
                            if (selectionType === 'tasks') {
                                for (const id of ids) {
                                    await handleTaskDelete(id);
                                }
                                notifySuccess('Selected tasks deleted');
                            } else {
                                for (const id of ids) {
                                    await deleteGoal(id);
                                }
                                notifySuccess('Selected goals deleted');
                            }
                        } catch (err) {
                            console.error('Bulk delete failed', err);
                            notifyError(`Failed to delete some ${selectionType === 'tasks' ? 'tasks' : 'goals'}`);
                        } finally {
                            setBulkActionLoading(false);
                            setIsBulkDeleteConfirmOpen(false);
                            clearSelection();
                            await refreshGoals();
                        }
                    }}
                    confirmLabel="Delete"
                    cancelLabel="Cancel"
                    loading={bulkActionLoading}
                />
                            {viewMode === 'kanban' && (
                                <div className="w-full mt-2">
                                    {isScopeLoading ? (
                                        <div className="w-full flex items-center justify-center p-8">
                                            <div className="flex items-center space-x-3">
                                                <LoadingSpinner variant="mui" />
                                                <span className="text-sm text-gray-60 dark:text-gray-30">Loading scope…</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <TasksKanban
                                            tasks={(() => {
                                                // Flatten all tasks from kanbanTasks and apply filters
                                                const allTasks: Task[] = [];
                                                Object.keys(kanbanTasks).forEach((goalId) => {
                                                    const goalTasks = kanbanTasks[goalId] || [];
                                                    goalTasks.forEach((task) => {
                                                        // Apply all filters (including text search, category, status, goal, dates)
                                                        if (taskMatchesFilters(task, goalId)) {
                                                            allTasks.push(task);
                                                        }
                                                    });
                                                });
                                                return allTasks;
                                            })()}
                                            filter={filter}
                                            selectedIds={selectedIds}
                                            onToggleSelect={toggleSelect}
                                            onStatusChange={handleTaskStatusChange}
                                            onUpdate={handleTaskUpdate}
                                            onDelete={handleTaskDelete}
                                        />
                                    )}
                                </div>
                            )}

                            {/* Tasks Calendar View */}
                            {viewMode === 'tasks-calendar' && (
                                <div className="w-full h-full">
                                    <AllTasksCalendar 
                                        onRefresh={refreshGoals}
                                        textFilter={filter}
                                        statusFilter={filterStatus}
                                        categoryFilter={filterCategory}
                                        goalFilter={filterGoal}
                                        startDateFilter={filterStartDate?.toDate() || null}
                                        endDateFilter={filterEndDate?.toDate() || null}
                                        showArchived={showArchived}
                                        selectedIds={selectedIds}
                                        onToggleSelect={toggleSelect}
                                        onVisibleTasksChange={setCalendarTaskIds}
                                    />
                                </div>
                            )}
                
                            {/* No results message when filters or search are active */}
                            {sortedAndFilteredGoals.length === 0 && (selectedFiltersCount > 0 || filter.trim()) && viewMode !== 'tasks-calendar' && (
                                <div className="text-center text-gray-50 mt-8 mb-8">
                                    <p className="text-lg mb-2">No goals match your current {filter.trim() ? 'search' : 'filters'}</p>
                                    <p className="text-sm">Try adjusting your {filter.trim() ? 'search terms' : 'filters'} or clearing them to see more results</p>
                                </div>
                            )}
                    </div>{/* end goals content */}
                </div>{/* end filter + content row */}
            </div>
            <div id="summary">
                    <Modal
                        key={selectedSummary?.id || 'summary-editor'}
                        isOpen={!!selectedSummary && isEditorOpen}
                        onRequestClose={() => setSelectedSummary(null)}
                        shouldCloseOnOverlayClick={true}
                        ariaHideApp={ARIA_HIDE_APP}
                        className={`fixed inset-0 flex items-center justify-center z-50`}
                        overlayClassName={`${overlayClasses}`}
                    >
                        <div className={`${modalClasses}`}>
                        {selectedSummary && (
                                                    <SummaryEditor
                                                        id={selectedSummary.id}
                                                        content={selectedSummary.content || ''}
                                                        type={selectedSummary.type === 'AI' || selectedSummary.type === 'User' ? selectedSummary.type : 'User'}
                                                        title={selectedSummary.title || ''}
                                                        onRequestClose={() => setSelectedSummary(null)}
                                                        onSave={async (editedTitle, editedContent) => {
                                                        try {
                                                                await saveSummary(
                                                                    setLocalSummaryId,
                                                                    editedTitle || selectedSummary.title || '',
                                                                    editedContent || selectedSummary.content || '',
                                                                    'User',
                                                                    new Date(),
                                                                    scope
                                                                );
                                                                closeEditor();
                                                        } catch (error) {
                                                                console.error('Error saving edited summary:', error);
                                                        }
                                                        }}
                                                    />
                        )}
                        </div>
                    </Modal>
                </div>
            </div>
            {/* </div> */}

            <div>

                
                    
                {/* Goal Editor Modal */}
                <Modal
                    isOpen={isEditorOpen}
                    onRequestClose={closeEditor}
                    shouldCloseOnOverlayClick={true}
                    ariaHideApp={ARIA_HIDE_APP}
                    className={`fixed inset-0 flex items-center justify-center z-50`}
                    overlayClassName={`${overlayClasses}`}
                >
                    {isEditorOpen && (
                        <GoalEditor
                            title={selectedGoal?.title || ''}
                            description={selectedGoal?.description || ''}
                            category={selectedGoal?.category || ''}
                            week_start={selectedGoal?.week_start || ''}
                            onAddCategory={async (newCategory: string) => {
                                try {
                                    await addCategory(newCategory); // Ensure backend consistency
                                    setSelectedGoal((prevGoal) =>
                                        prevGoal ? { ...prevGoal, category: newCategory } : null
                                    );
                                } catch (error) {
                                    console.error('Error adding category:', error);
                                }
                            }}
                            onRequestClose={closeEditor}
                            onSave={async (updatedDescription: string, updatedTitle: string, updatedCategory: string, updatedWeekStart: string, status?: string, status_notes?: string) => {
                                try {
                                    if (selectedGoal) {
                                        // Narrow status to the allowed Goal['status'] union safely
                                        const allowedStatuses = ['Not started', 'In progress', 'Blocked', 'Done', 'On hold'] as const;
                                        let narrowedStatus: Goal['status'] | undefined;
                                        if (typeof status === 'string' && (allowedStatuses as readonly string[]).includes(status)) {
                                            narrowedStatus = status as Goal['status'];
                                        }

                                        // compute final status ensuring it matches Goal['status'] union
                                        let finalStatus: Goal['status'] | undefined;
                                        if (narrowedStatus) {
                                            finalStatus = narrowedStatus;
                                        } else if (typeof selectedGoal.status === 'string' && (allowedStatuses as readonly string[]).includes(selectedGoal.status)) {
                                            finalStatus = selectedGoal.status as Goal['status'];
                                        } else {
                                            finalStatus = undefined;
                                        }

                                        await handleUpdateGoal(selectedGoal.id, {
                                            id: selectedGoal.id,
                                            user_id: selectedGoal.user_id,
                                            created_at: selectedGoal.created_at,
                                            title: updatedTitle,
                                            description: updatedDescription,
                                            category: updatedCategory,
                                            week_start: updatedWeekStart,
                                            status: finalStatus,
                                            status_notes: status_notes ?? selectedGoal?.status_notes,
                                        });
                                        await refreshGoals(); // Refetch goals after saving
                                    }
                                } catch (error) {
                                    console.error('Error saving goal:', error);
                                }
                            }}
                        />
                    )}
                </Modal>
                    {/* Confirm archive goal modal */}
                    <ConfirmModal
                        isOpen={isArchiveConfirmOpen}
                        title={archiveTargetGoal?.is_archived ? 'Restore goal?' : 'Archive goal?'}
                        message={
                            archiveTargetGoal?.is_archived
                                ? `Restore "${archiveTargetGoal?.title}"? It will reappear in all views.`
                                : `Archive "${archiveTargetGoal?.title}"? It will be hidden from all views but included in summaries for its time range.`
                        }
                        onCancel={() => { setIsArchiveConfirmOpen(false); setArchiveTargetGoal(null); }}
                        onConfirm={async () => {
                            if (!archiveTargetGoal) return;
                            const newArchived = !archiveTargetGoal.is_archived;
                            setIsArchiving(true);
                            try {
                                await updateGoal(archiveTargetGoal.id, { is_archived: newArchived } as any);
                                updateGoalInCache({ ...archiveTargetGoal, is_archived: newArchived });
                                await ctxRefresh();
                                notifySuccess(`Goal ${newArchived ? 'archived' : 'restored'}.`);
                            } catch (err) {
                                console.error('Error archiving goal:', err);
                                notifyError(`Failed to ${newArchived ? 'archive' : 'restore'} goal.`);
                            } finally {
                                setIsArchiving(false);
                                setIsArchiveConfirmOpen(false);
                                setArchiveTargetGoal(null);
                            }
                        }}
                        confirmLabel={archiveTargetGoal?.is_archived ? 'Restore' : 'Archive'}
                        cancelLabel="Cancel"
                        loading={isArchiving}
                    />
                    {/* Confirm delete goal modal (shared for table/mobile actions) */}
                    <ConfirmModal
                        isOpen={isDeleteConfirmOpen}
                        title="Delete goal?"
                        message={deleteTargetId ? `Are you sure you want to permanently delete this goal? This action cannot be undone.` : 'Are you sure you want to delete this goal?'}
                        onCancel={() => { setIsDeleteConfirmOpen(false); setDeleteTargetId(null); }}
                        onConfirm={async () => {
                            try {
                                if (!deleteTargetId) return;
                                await handleDeleteGoal(deleteTargetId);
                            } finally {
                                setIsDeleteConfirmOpen(false);
                                setDeleteTargetId(null);
                            }
                        }}
                        confirmLabel="Delete"
                        cancelLabel="Cancel"
                    />
                    {/* Wins modal used by mobile stacked rows */}
                    <WinsModal
                        goalTitle={(selectedGoal as any)?.title || ''}
                        isOpen={isWinModalOpen}
                        onClose={() => closeWins()}
                        wins={wins}
                        onCreate={async ({ title, description, impact }) => {
                            const gid = (selectedGoal as any)?.id;
                            if (!gid) return;
                            await createWin(gid, { title, description, impact });
                        }}
                        onDelete={async (id) => {
                            await deleteWin(id, (selectedGoal as any)?.id);
                        }}
                        onEdit={(item) => {
                            setSelectedWin(item);
                            setIsEditWinModalOpen(true);
                        }}
                        loading={isWinLoading}
                    />

                    {/* Notes modal used by mobile stacked rows */}
                    {isNotesModalOpen && (
                        <div 
                            id="editNotes" 
                            className={`${overlayClasses} flex items-center justify-center`}
                            onMouseDown={(e) => {
                                // close when clicking the backdrop (only when clicking the overlay itself)
                                if (e.target === e.currentTarget) closeNotes();
                            }}
                        >
                            <div className={`${modalClasses} w-full max-w-2xl`}> 
                                <div className='flex flex-row w-full justify-between items-start'>
                                    <h3 className="text-lg font-medium text-secondary-text mb-4">Notes for <br />"{(selectedGoal as any)?.title}"</h3>
                                    <div className="mb-4 flex justify-end">
                                        <button className="btn-ghost" onClick={() => closeNotes()}>
                                            <CloseButton className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                                { notes.length != 0 ? (
                                    <div>
                                        <h4 className="text-md font-semibold mb-2">Existing notes</h4>
                                        <ul className="space-y-3">
                                            {notes.map((note) => (
                                                <li key={note.id} className="p-3 border rounded bg-background border-background-color">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="text-xs text-secondary-text">{new Date(note.created_at).toLocaleString()}</div>
                                                        <div className="flex items-center justify-end gap-2">
                                                            <button className="btn-ghost" onClick={() => { setEditingNoteId(note.id); setEditingNoteContent(note.content); }} title="Edit note"><Edit className="w-4 h-4" /></button>
                                                            <button className="btn-ghost" onClick={() => setNoteDeleteTarget(note.id)} title="Delete note" disabled={isNotesLoading}><Trash className="w-4 h-4" /></button>
                                                        </div>
                                                    </div>
                                                    <div className="text-sm text-primary-text" dangerouslySetInnerHTML={{ __html: note.content }} />
                                                    {editingNoteId === note.id && (
                                                        <div className="mt-2">
                                                            <TextField
                                                                value={editingNoteContent}
                                                                onChange={(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setEditingNoteContent(e.target.value)}
                                                                multiline
                                                                rows={3}
                                                                size="small"
                                                                className="mt-1 block w-full"
                                                            />
                                                            <div className="mt-2 flex justify-end gap-2">
                                                                <button className="btn-ghost" onClick={() => { setEditingNoteId(null); setEditingNoteContent(''); }}>Cancel</button>
                                                                <button className="btn-primary" onClick={() => updateNote(editingNoteId as string, editingNoteContent)}><SaveIcon className="w-4 h-4 inline mr-1" />Save</button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ): null}
                                <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                                    <div className="mt-4">
                                        <TextField
                                            value={newNoteContent}
                                            onChange={(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setNewNoteContent(e.target.value)}
                                            className="mt-4 block w-full"
                                            label="Add a new note"
                                            multiline
                                            rows={3}
                                            size="small"
                                        />
                                        <div className="mt-2 flex justify-end gap-2">
                                            <button className="btn-primary" onClick={() => createNote((selectedGoal as any)?.id)} disabled={isNotesLoading}><PlusIcon className="w-4 h-4 inline mr-1" />{isNotesLoading ? (<span className="ml-2 text-sm text-gray-50">Adding...</span>) : ( 'Add note') }</button>
                                            
                                        </div>
                                    </div>
                                    {isNotesLoading && notes.length === 0 ? (
                                        <div className="text-sm text-gray-50">Loading notes...</div>
                                    ) : null}
                                </div>
                                <ConfirmModal
                                    isOpen={!!noteDeleteTarget}
                                    title="Delete note?"
                                    message={`Are you sure you want to delete this note? This action cannot be undone.`}
                                    onCancel={() => setNoteDeleteTarget(null)}
                                    onConfirm={async () => {
                                        if (!noteDeleteTarget) return;
                                        await deleteNote(noteDeleteTarget);
                                        setNoteDeleteTarget(null);
                                    }}
                                    confirmLabel="Delete"
                                    cancelLabel="Cancel"
                                />
                            </div>
                        </div>
                    )}

                    {/* Tasks Modal */}
                    {isTasksModalOpen && tasksGoalId && (
                        <div 
                            id="editTasks" 
                            className={`${overlayClasses} flex items-center justify-center`}
                            onMouseDown={(e) => {
                                // close when clicking the backdrop (only when clicking the overlay itself)
                                if (e.target === e.currentTarget) { setIsTasksModalOpen(false); setTasksGoalId(null); }
                            }}
                        >
                            <div className={`${modalClasses} w-3/4`}>
                                <div className='flex flex-row w-full justify-between items-start mb-4'>
                                    <h3 className="text-lg font-medium text-secondary-text">
                                        Tasks for <br />"{(selectedGoal as any)?.title}"
                                    </h3>
                                    <button className="btn-ghost" onClick={() => { setIsTasksModalOpen(false); setTasksGoalId(null); }}>
                                        <CloseButton className="w-4 h-4" />
                                    </button>
                                </div>
                                
                                <div className="max-h-[70vh] overflow-y-auto mt-4">
                                    <TasksList 
                                        goalId={tasksGoalId}
                                        goalTitle={(selectedGoal as any)?.title || ''}
                                        goalDescription={(selectedGoal as any)?.description || ''}
                                        goalCategory={(selectedGoal as any)?.category}
                                        onTaskCountChange={(count) => setTasksCount(count)}
                                        onBeforeFocusMode={() => { setIsTasksModalOpen(false); setTasksGoalId(null); }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
            </div>
            </>
    ) : (
            <div className="text-center text-gray-50 mt-4 justify-center flex flex-col gap-2 items-center h-64">
                <p>No goals yet.</p>
                <p className="mb-4">Create a goal to get started!</p>
                
                <Button
                    onClick={openGoalModal}
                    variant='contained'
                    className="btn-primary gap-3 flex"
                    disabled={!canCreateGoal}
                    aria-label={`Add a new goal`}
                    >
                    <span className="flex text-nowrap">Add a Goal</span>
                    <Target className="w-5 h-5" />
                </Button>
                {!canCreateGoal && (
                    <div className="mt-4 w-full max-w-md">
                        <UpgradePrompt message="You've reached the free goal limit. Upgrade for unlimited goals." />
                    </div>
                )}
                
            </div>
        )}
        {/* Add Task Modal */}
                <Modal
                    isOpen={isAddTaskModalOpen}
                    onRequestClose={closeAddTaskModal}
                    shouldCloseOnOverlayClick={true}
                    ariaHideApp={ARIA_HIDE_APP}
                    className="fixed inset-0 flex md:items-center justify-center z-50"
                    overlayClassName={overlayClasses}
                >
                    <div className={`${modalClasses} max-w-lg w-full`}>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold flex items-center gap-2">
                                <ListTodo className="w-5 h-5 text-primary" />
                                Add a task
                            </h2>
                            <IconButton size="small" onClick={closeAddTaskModal} aria-label="Close">
                                <CloseButton className="w-4 h-4" />
                            </IconButton>
                        </div>

                        <div className="space-y-4">
                            {/* Goal selector */}
                            {!standaloneCreateNewGoal ? (
                                <FormControl fullWidth size="small">
                                    <InputLabel id="standalone-task-goal-label">Goal *</InputLabel>
                                    <Select
                                        labelId="standalone-task-goal-label"
                                        label="Goal *"
                                        value={standaloneTaskGoalId}
                                        onChange={(e) => setStandaloneTaskGoalId(e.target.value as string)}
                                        displayEmpty
                                    >
                                        {Object.values(indexedGoals).flat().map((g) => (
                                            <MenuItem key={g.id} value={g.id}>
                                                <span className="truncate max-w-[320px] block">{g.title}</span>
                                            </MenuItem>
                                        ))}
                                        <MenuItem
                                            value="__new__"
                                            onClick={(e) => { e.stopPropagation(); setStandaloneCreateNewGoal(true); setStandaloneTaskGoalId(''); }}
                                            className="text-primary font-medium"
                                        >
                                            <PlusIcon className="w-4 h-4 mr-1 inline" /> Create new goal…
                                        </MenuItem>
                                    </Select>
                                </FormControl>
                            ) : (
                                <div className="space-y-4">
                                    <TextField
                                        label="New goal title *"
                                        value={standaloneNewGoalTitle}
                                        onChange={(e) => setStandaloneNewGoalTitle(e.target.value)}
                                        size="small"
                                        fullWidth
                                        autoFocus
                                        placeholder="Enter goal title"
                                    />
                                    <FormControl fullWidth size="small">
                                        <InputLabel id="standalone-goal-category-label">Category *</InputLabel>
                                        <Select
                                            labelId="standalone-goal-category-label"
                                            label="Category *"
                                            value={standaloneNewGoalCategory}
                                            onChange={(e) => setStandaloneNewGoalCategory(e.target.value as string)}
                                        >
                                            {(UserCategories.length > 0
                                                ? UserCategories.map((c) => c.name)
                                                : ['General', 'Work', 'Personal', 'Health', 'Finance', 'Learning']
                                            ).map((name) => (
                                                <MenuItem key={name} value={name}>{name}</MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                    <button
                                        className="text-sm text-gray-50 underline"
                                        onClick={() => { setStandaloneCreateNewGoal(false); setStandaloneNewGoalTitle(''); setStandaloneNewGoalCategory('General'); }}
                                    >
                                        ← Pick an existing goal instead
                                    </button>
                                </div>
                            )}

                            {/* Task fields */}
                            <TextField
                                label="Task title *"
                                value={standaloneNewTask.title || ''}
                                onChange={(e) => setStandaloneNewTask((p) => ({ ...p, title: e.target.value }))}
                                size="small"
                                fullWidth
                                autoFocus={standaloneCreateNewGoal ? false : true}
                                placeholder="What needs to be done?"
                            />
                            <TextField
                                label="Description"
                                value={standaloneNewTask.description || ''}
                                onChange={(e) => setStandaloneNewTask((p) => ({ ...p, description: e.target.value }))}
                                size="small"
                                fullWidth
                                multiline
                                rows={2}
                                placeholder="Optional details"
                            />
                            <LocalizationProvider dateAdapter={AdapterDayjs}>
                                <div className="flex flex-col space-y-4 mt-2">
                                    <DatePicker
                                        label="Date"
                                        value={standaloneSelectedDate}
                                        onChange={(newValue) => setStandaloneSelectedDate(newValue)}
                                        slotProps={{ textField: { fullWidth: true, size: 'small' } }}
                                    />
                                    <TimePicker
                                        label="Time (optional)"
                                        value={standaloneSelectedTime}
                                        onChange={(newValue) => setStandaloneSelectedTime(newValue)}
                                        slotProps={{ textField: { fullWidth: true, size: 'small' } }}
                                    />

                                    {/* Alert / Reminder */}
                                    <div className="border border-gray-20 dark:border-gray-70 rounded-lg p-3 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Bell className="w-4 h-4" />
                                                <label className="text-sm font-semibold">Alert</label>
                                            </div>
                                            <FormControlLabel
                                                control={
                                                    <Switch
                                                        checked={standaloneReminderEnabled}
                                                        onChange={(e) => setStandaloneReminderEnabled(e.target.checked)}
                                                        size="small"
                                                    />
                                                }
                                                label={standaloneReminderEnabled ? 'On' : 'Off'}
                                                labelPlacement="start"
                                                sx={{ marginLeft: 0 }}
                                            />
                                        </div>

                                        {standaloneReminderEnabled && (
                                            <div className="flex flex-col space-y-2 gap-2">
                                                {standaloneSelectedDate && standaloneSelectedTime ? (
                                                    <FormControl fullWidth size="small">
                                                        <InputLabel>Alert time</InputLabel>
                                                        <Select
                                                            value={standaloneReminderOffset}
                                                            onChange={(e) => setStandaloneReminderOffset(e.target.value)}
                                                            label="Alert time"
                                                        >
                                                            <MenuItem value="0">At time of task</MenuItem>
                                                            <MenuItem value="15">15 minutes before</MenuItem>
                                                            <MenuItem value="30">30 minutes before</MenuItem>
                                                            <MenuItem value="60">1 hour before</MenuItem>
                                                            <MenuItem value="1440">1 day before</MenuItem>
                                                            <MenuItem value="custom">Custom time</MenuItem>
                                                        </Select>
                                                    </FormControl>
                                                ) : (
                                                    <p className="text-xs text-secondary-text">Set a scheduled date &amp; time above to use relative alerts, or pick a custom time.</p>
                                                )}

                                                {(standaloneReminderOffset === 'custom' || !standaloneSelectedDate || !standaloneSelectedTime) && (
                                                    <DateTimePicker
                                                        label="Custom alert date &amp; time"
                                                        value={standaloneSelectedReminderDatetime}
                                                        onChange={(newValue) => {
                                                            setStandaloneSelectedReminderDatetime(newValue);
                                                            setStandaloneReminderDatetime(newValue ? newValue.format('YYYY-MM-DDTHH:mm') : '');
                                                        }}
                                                        slotProps={{ textField: { size: 'small', fullWidth: true } }}
                                                    />
                                                )}

                                                {(() => {
                                                    const dateStr = standaloneSelectedDate?.format('YYYY-MM-DD');
                                                    const timeStr = standaloneSelectedTime?.format('HH:mm');
                                                    if (standaloneReminderOffset === 'custom' || !dateStr || !timeStr) {
                                                        if (!standaloneReminderDatetime) return null;
                                                        try {
                                                            const preview = new Date(standaloneReminderDatetime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
                                                            return <p className="text-xs text-brand-60 dark:text-brand-30">Alert at: {preview}</p>;
                                                        } catch { return null; }
                                                    }
                                                    try {
                                                        const scheduledUTC = convertToUTC(dateStr, timeStr, timezone);
                                                        const scheduledDate = new Date(scheduledUTC);
                                                        scheduledDate.setMinutes(scheduledDate.getMinutes() - Number(standaloneReminderOffset));
                                                        const preview = scheduledDate.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
                                                        return <p className="text-xs text-brand-60 dark:text-brand-30">Alert at: {preview}</p>;
                                                    } catch { return null; }
                                                })()}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </LocalizationProvider>
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <button className="btn-secondary" onClick={closeAddTaskModal}>Cancel</button>
                            <button
                              className="btn-secondary"
                              onClick={generateStandaloneTasks}
                              disabled={isGeneratingTasks || !standaloneTaskGoalId}
                            >
                              
                              {isGeneratingTasks ? 'Generating...' : <><Sparkles className="w-4 h-4" /> Generate with AI</>}
                            </button>
                            <button className="btn-primary" onClick={createStandaloneTask}>Add task</button>
                        </div>
                    </div>
                </Modal>

        {/* Add Goal Modal */}
                <Modal
                    isOpen={isGoalModalOpen}
                    onRequestClose={closeGoalModal}
                    shouldCloseOnOverlayClick={true}
                    ariaHideApp={ARIA_HIDE_APP}
                    // parentSelector={() => document.getElementById('app')!}
                    className={`fixed inset-0 flex  md:items-center justify-center z-50`}
                    overlayClassName={`${overlayClasses}`}
                    >
                    <div className="bg-background-color rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
                        {/* Top progress bar — value driven by GoalForm via onProgressChange */}
                        <div className="h-1 bg-gray-20 dark:bg-gray-80">
                            <div
                                className="h-full bg-primary transition-all duration-500 ease-out"
                                style={{ width: `${goalFormProgress}%` }}
                            />
                        </div>

                        <div className="p-6 sm:p-8">
                        <div className={`w-full`}>
                            {isGoalModalOpen && (
                                <GoalForm
                                newGoal={newGoal}
                                setNewGoal={setNewGoal}
                                handleClose={closeGoalModal}
                                                categories={UserCategories.map((cat: unknown) => typeof cat === 'string' ? (cat as string) : ((cat as { name?: string })?.name || ''))}
                                                refreshGoals={() => refreshGoals().then(() => {})}
                                                onProgressChange={(pct) => setGoalFormProgress(pct)}
                                />
                            )}
                        </div>
                        </div>
                    </div>
                </Modal>

        {/* Notification Task Edit Modal */}
        <Modal
            isOpen={notificationTaskModalOpen}
            onRequestClose={() => {
                setNotificationTaskModalOpen(false);
                setNotificationTask(null);
            }}
            shouldCloseOnOverlayClick={true}
            ariaHideApp={ARIA_HIDE_APP}
            className={`fixed inset-0 flex md:items-center justify-center z-50`}
            overlayClassName={`${overlayClasses}`}
        >
            <div className={`${modalClasses} max-w-2xl w-full max-h-[90vh] overflow-y-auto`}>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold">Task Reminder</h2>
                    <IconButton
                        onClick={() => {
                            setNotificationTaskModalOpen(false);
                            setNotificationTask(null);
                        }}
                        size="small"
                    >
                        <CloseButton className="w-5 h-5" />
                    </IconButton>
                </div>
                {notificationTask && (
                    <TaskCard
                        task={notificationTask}
                        allowInlineEdit={true}
                        autoOpenEditModal={true}
                        onUpdate={async (taskId, updates) => {
                            try {
                                const { data: { session } } = await supabase.auth.getSession();
                                const token = session?.access_token;
                                if (!token) throw new Error('Not authenticated');
                                
                                const response = await fetch('/.netlify/functions/updateTask', {
                                    method: 'PUT',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${token}`,
                                    },
                                    body: JSON.stringify({ id: taskId, ...updates }),
                                });
                                
                                if (!response.ok) throw new Error('Failed to update task');
                                
                                const updatedTask = await response.json();
                                setNotificationTask(updatedTask);
                                notifySuccess('Task updated');
                                
                                // Refresh kanban tasks if applicable
                                if (viewMode === 'kanban' || viewMode === 'tasks-calendar') {
                                    fetchKanbanTasks();
                                }
                            } catch (error) {
                                console.error('Failed to update task:', error);
                                notifyError('Failed to update task');
                            }
                        }}
                        onDelete={async (taskId) => {
                            try {
                                const { data: { session } } = await supabase.auth.getSession();
                                const token = session?.access_token;
                                if (!token) throw new Error('Not authenticated');
                                
                                const response = await fetch(`/.netlify/functions/deleteTask?task_id=${taskId}`, {
                                    method: 'DELETE',
                                    headers: { 'Authorization': `Bearer ${token}` },
                                });
                                
                                if (!response.ok) throw new Error('Failed to delete task');
                                
                                notifySuccess('Task deleted');
                                setNotificationTaskModalOpen(false);
                                setNotificationTask(null);
                                
                                // Refresh kanban tasks if applicable
                                if (viewMode === 'kanban' || viewMode === 'tasks-calendar') {
                                    fetchKanbanTasks();
                                }
                            } catch (error) {
                                console.error('Failed to delete task:', error);
                                notifyError('Failed to delete task');
                            }
                        }}
                        onStatusChange={async (taskId, newStatus) => {
                            try {
                                const { data: { session } } = await supabase.auth.getSession();
                                const token = session?.access_token;
                                if (!token) throw new Error('Not authenticated');
                                
                                const response = await fetch('/.netlify/functions/updateTask', {
                                    method: 'PUT',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${token}`,
                                    },
                                    body: JSON.stringify({ id: taskId, status: newStatus }),
                                });
                                
                                if (!response.ok) {
                                    const errBody = await response.json().catch(() => ({}));
                                    if (errBody?.error === 'tier_limit') {
                                        notifyTierLimit(errBody.message || 'Upgrade to activate more goals simultaneously.');
                                        return;
                                    }
                                    throw new Error('Failed to update task status');
                                }
                                
                                const updatedTask = await response.json();
                                setNotificationTask(updatedTask);
                                notifySuccess('Task status updated');
                                
                                // Refresh kanban tasks if applicable
                                if (viewMode === 'kanban' || viewMode === 'tasks-calendar') {
                                    fetchKanbanTasks();
                                }
                            } catch (error) {
                                console.error('Failed to update task status:', error);
                                notifyError('Failed to update task status');
                            }
                        }}
                    />
                )}
            </div>
        </Modal>
        </div>
  );
};

export default GoalsComponent;
