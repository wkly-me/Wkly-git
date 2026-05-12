import { MenuBtnProps } from '@components/menu-btn';
// import MenuBtn from '@components/menu-btn';
import { useState, useEffect, useRef } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
// import menuClosedIcon from '/images/button-menu.svg';
import { Sun, Moon, Home, Text, Target, ThumbsUp, HomeIcon, CircleQuestionMark, UserCheck, ThumbsUpIcon } from 'lucide-react';
import { classTabItem } from '@styles/classes';
// import { classMenuItem } from '@styles/classes';
// supabase client not needed here; use useAuth hook's session instead
import useAuth from '@hooks/useAuth';
import { Menu, MenuItem, Tabs, Tab, Tooltip, useMediaQuery } from '@mui/material';
import Modal from 'react-modal';
import { ARIA_HIDE_APP, useOverlayDebug } from '@lib/modal';
import { modalClasses, overlayClasses } from '@styles/classes';
import Avatar from '@components/Avatar';
import PersistentDrawerRight from './MenuDrawer';
import ProfileManagement from './ProfileManagement';
import Logo from '@components/Logo';
import { styled } from '@mui/material/styles';
import FeedbackDialog from '@components/FeedbackDialog';




// Module-level configurable patterns for hiding the menu. Developers can
// call the exported helpers below to change which routes hide the menu in
// runtime or in tests. A pattern may be either a string (exact match) or a
// RegExp (test against pathname).
let _hiddenMenuPatterns: Array<string | RegExp> = ['/profile'];
addHiddenMenuPath('/mui-demo');
addHiddenMenuPath('/notifications');

export function setHiddenMenuPaths(patterns: Array<string | RegExp>) {
    _hiddenMenuPatterns = patterns.slice();
}

export function addHiddenMenuPath(pattern: string | RegExp) {
    _hiddenMenuPatterns.push(pattern);
}

export function removeHiddenMenuPath(pattern: string | RegExp) {
    _hiddenMenuPatterns = _hiddenMenuPatterns.filter((p) => {
        if (p === pattern) return false;
        // extra equality for string values
        if (typeof p === 'string' && typeof pattern === 'string' && p === pattern) return false;
        return true;
    });
}

// Exported helper so other modules can check whether the menu should be hidden.
// We export a function so the value is derived at call time from the current location.
export function isMenuHidden(): boolean {
    try {
        if (typeof window === 'undefined') return false;
        const path = window.location.pathname;
        return _hiddenMenuPatterns.some((pat) => (typeof pat === 'string' ? pat === path : pat.test(path)));
    } catch (e) {
        return false;
    }
}

// Update `HeaderProps` to make `isOpen` optional
export interface HeaderProps {
    theme: 'theme-dark' | 'theme-light';
    toggleTheme: () => void;
    isOpen?: boolean; // Made optional
    handleLogout?: () => Promise<void>; // Optional logout function
    onLoginClick?: () => void; // Optional login click handler
}

// Theme is provided by the parent App via props; avoid local ThemeState here.

// interface MenuState {
//     isOpen: boolean;
// }


interface StyledTabsProps extends React.ComponentProps<typeof Tabs> {
  children?: React.ReactNode;
  value: number | false;
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
    maxWidth: 80,
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
  fontSize: theme.typography.pxToRem(12),
  marginRight: theme.spacing(1),
  color: 'var(--primary-text)',
  '&.MuiButtonBase-root.MuiTab-root:hover': {
    backgroundColor: 'transparent',
    color: 'var(--primary-link)',
  },
  '&.Mui-selected': {
    color: 'var(--primary-text)',
    // fontWeight: theme.typography.fontWeightMedium,
  },
  '&.Mui-focusVisible': {
    backgroundColor: 'rgba(100, 95, 228, 0.32)',
  },
}));

// Update the `Header` component to conditionally require `handleLogout`
const Header = ({ isOpen = false, ...props }: HeaderProps) => {
    // navigation not required in this component
    const [menuOpen] = useState<MenuBtnProps['isOpen']>(isOpen);
    const [drawerVisible, setDrawerVisible] = useState(false);
    const drawerContainerRef = useRef<HTMLDivElement | null>(null);
    const headerRef = useRef<HTMLDivElement | null>(null);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
    const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
    const [scrolled, setScrolled] = useState(false);
    const { session, profile } = useAuth();
    const isLarge = useMediaQuery('(min-width: 1024px)');

    // use the module-level `isMenuHidden` exported above

    // const handleLogoutInternal = async (): Promise<void> => {
    //     if (!isAuthenticated || !props.handleLogout) return;
    //     try {
    //         if (!supabase) {
    //             console.error('Supabase client is not initialized');
    //             return;
    //         }
    //         const { error } = await supabase.auth.signOut();
    //         if (error) throw error;
    //         console.log('User logged out successfully');
    //         window.location.href = '/auth'; // Redirect to the auth route
    //     } catch (error) {
    //         console.error('Error logging out:', error);
    //     }
    // };
    
    // Logo is an imported SVG component; render it directly as <Logo /> below
    // const handleClick = (): void => {
    //     setIsOpen((prev) => !prev); 
        
    // };

    // const handleMenuItemClick = (): void => {
    //     setIsOpen(false); // Close the menu when a menu item is selected
    //     menuClosedIcon; // Reset the menu icon to menuClosedIcon
    //     handleClick;
    // };

    // The app-level `theme` and `toggleTheme` are provided via props.
    // Avoid maintaining a separate local themeState here which can diverge
    // from the app-level state. Use the passed-in props directly.

    // Derive authentication state from the session provided by the auth hook.
    // This avoids making unauthenticated calls on mount which produced noisy
    // console errors when the app is rendered on the login screen.
    useEffect(() => {
        setIsAuthenticated(!!session);
    }, [session]);

    // Sticky header scroll-shrink: toggle `scrolled` when crossing the scroll
    // threshold, then lock the handler for the transition duration so layout
    // changes from the animation cannot re-trigger it mid-flight.
    // Only active on sm+ screens (≥640px) where the header is sticky.
    useEffect(() => {
        const mq = window.matchMedia('(min-width: 640px)');
        if (!mq.matches) {
            setScrolled(false);
            return;
        }

        let rafId: number | null = null;
        // Timestamp (ms) before which scroll events are ignored.
        // Set to Date.now() + transition duration whenever scrolled changes.
        const TRANSITION_MS = 420; // slightly over the 0.35s CSS transition
        let lockedUntil = 0;

        const onScroll = () => {
            if (rafId !== null) return;
            rafId = requestAnimationFrame(() => {
                rafId = null;
                // Ignore events fired while a transition is still running
                if (Date.now() < lockedUntil) return;
                setScrolled((prev) => {
                    const next = window.scrollY > 32 ? true : window.scrollY < 16 ? false : prev;
                    if (next !== prev) lockedUntil = Date.now() + TRANSITION_MS;
                    return next;
                });
            });
        };
        window.addEventListener('scroll', onScroll, { passive: true });

        const handleResize = () => {
            if (!mq.matches) setScrolled(false);
        };
        mq.addEventListener('change', handleResize);

        return () => {
            window.removeEventListener('scroll', onScroll);
            mq.removeEventListener('change', handleResize);
            if (rafId !== null) cancelAnimationFrame(rafId);
        };
    }, []);

    // Keep `drawerVisible` in sync with whether the drawer container is actually visible
    useEffect(() => {
        const el = drawerContainerRef.current;
        if (!el) return;

        const checkVisible = () => {
            const style = window.getComputedStyle(el);
            const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
            setDrawerVisible(isVisible);
        };

        // Initial check
        checkVisible();

        // Resize observer for layout changes
        const resizeObserver = new ResizeObserver(() => checkVisible());
        resizeObserver.observe(el);

        // Mutation observer for class/style changes
        const mo = new MutationObserver(() => checkVisible());
        mo.observe(el, { attributes: true, attributeFilter: ['class', 'style'] });

        // also listen to window resize
        window.addEventListener('resize', checkVisible);

        return () => {
            resizeObserver.disconnect();
            mo.disconnect();
            window.removeEventListener('resize', checkVisible);
        };
    }, [drawerContainerRef.current]);

    const toggleThemeInternal = (): void => {
        // Delegate to the app-level toggle so MUI provider and DOM stay in sync.
        props.toggleTheme();
    };

    const handleMenuOpen = (event: React.MouseEvent<HTMLLabelElement>) => {
        setMenuAnchor(event.currentTarget as HTMLElement);
    };

    const handleMenuClose = () => {
        setMenuAnchor(null);
    };

    const handleLogout = async () => {
        if (props.handleLogout) {
            await props.handleLogout();
        }
        handleMenuClose();
    };

    // Development overlay debug (logs overlay element when profile modal opens)
    useOverlayDebug(isProfileOpen);

    // Keep --header-height CSS variable on :root in sync with the actual header height
    // so notifications and other fixed-position elements can offset below the header.
    useEffect(() => {
        const el = headerRef.current;
        if (!el) return;
        // Set initial value (one reflow on mount is unavoidable; offsetHeight avoids forced-reflow)
        document.documentElement.style.setProperty('--header-height', `${el.offsetHeight}px`);
        // Use ResizeObserverEntry data in the callback — avoids forced reflow by not reading layout
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const h = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
                document.documentElement.style.setProperty('--header-height', `${h}px`);
            }
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Listen for programmatic requests to open the preferences modal
    useEffect(() => {
        const handler = () => setIsProfileOpen(true);
        window.addEventListener('wkly:open-preferences', handler);
        return () => window.removeEventListener('wkly:open-preferences', handler);
    }, []);

    const navItems = [
  { to: '/', label: 'Home', icon: HomeIcon, end: true },
  { to: '/goals', label: 'Goals & Tasks', icon: Target },
  { to: '/summaries', label: 'Summaries', icon: Text },
  { to: '/affirmations', label: 'Affirmations', icon: ThumbsUp },
//   { to: '/affirmations/settings', label: 'Settings', icon: Settings },
];

    const location = useLocation();
    const activeTab = navItems.findIndex(({ to, end }) =>
        end ? location.pathname === to : location.pathname.startsWith(to)
    );
    const tabValue = activeTab === -1 ? false : activeTab;

    return (
        <div ref={headerRef} className={`header flex items-end dark relative${menuOpen ? ' header-expanded' : ''}${scrolled ? ' header--scrolled' : ''}`}>
            
            <div className="header-brand">
                {!drawerVisible && (
                    <div className="header-brand--logo-container w-1/4 lg:w-auto relative pr-6  items-end ">
                        <button
                            onClick={toggleThemeInternal}
                            className="header-brand--theme-btn btn-ghost ml-4 p-2 rounded absolute -top-4 lg:top-0 right-0"
                            aria-label="Toggle theme"
                        >
                            {props.theme === 'theme-dark' ? (
                                <Sun className="w-5 h-5 stroke-gray-10 hover:stroke-gray-30 focus:outline-none" />
                            ) : (
                                <Moon className="w-5 h-5 stroke-gray-10 hover:stroke-gray-30 focus:outline-none" />
                            )}
                        </button>
                        <Link
                            to="/"
                            className="header-brand--logo relative overflow-hidden w-full lg:w-auto flex items-end justify-center h-full"
                            style={{ minHeight: '3rem' }} // optional: ensures height
                        >

                            {/* <span className="mask-clip-border absolute bottom-0 left-1/2 -translate-x-1/2 h-8 sm:h-12 w-auto"> */}
                            <span className="mask-clip-border top-0 left-0 h-16 lg:h-24 w-full items-end">
                            <Logo
                                aria-label="Wkly logo"
                                style={{ color: 'var(--brand-30)' }}
                                className="w-full h-auto lg:w-auto"
                            />
                            </span>
                            

                        </Link>
                    </div>
                )}
                {isAuthenticated && !isMenuHidden() && !drawerVisible && (
                    <>
                    <StyledTabs 
                        value={tabValue} 
                        onChange={() => {}} 
                        className="hidden focus:outline-none overflow-x-auto md:flex md:w-2/3 self-end h-full"
                        // variant="scrollable"
                        // scrollButtons="auto"
                        // allowScrollButtonsMobile
                        aria-label="Navigation Tabs"
                        >
                        {navItems.map(({ to, label, icon: Icon, end }) => (
                            <StyledTab
                                key={label}
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                {...{ component: NavLink, to, end } as any}
                                className="focus:ring-0 focus:ring-offset-0 lg:w-auto"
                                label={label}
                                icon={<Icon className="w-4 h-4" />}
                                iconPosition={isLarge ? 'start' : 'top'}
                                wrapped
                            />
                        ))}
                    </StyledTabs>
                    {/* <nav className="tabs hidden sm:flex items-end self-end ml-6 h-full">
                        <ul className="flex -mb-px text-sm font-medium">
                            <li>
                                <Tooltip title="Home" placement="bottom" arrow className='' disableHoverListener={isLarge}>
                                <Link
                                    to="/"
                                    className={`${classTabItem}${location.pathname === '/' ? ' active' : ''}`}
                                >
                                    <Home className="w-4 h-4 mr-1.5" />
                                    <span className='hidden lg:inline'>Home</span>
                                </Link>
                                    </Tooltip>
                            </li>
                            <li>
                                <Tooltip title="Goals & Tasks" placement="bottom" arrow className='' disableHoverListener={isLarge}>
                                <Link
                                    to="/goals"
                                    className={`${classTabItem}${location.pathname === '/goals' ? ' active' : ''}`}
                                >
                                    <Target className="w-4 h-4 mr-1.5" />
                                    <span className='hidden lg:inline'>Goals & Tasks</span>
                                </Link>
                                    </Tooltip>
                            </li>
                            <li>
                                <Tooltip title="Summaries" placement="bottom" arrow className='' disableHoverListener={isLarge}>
                                <Link
                                    to="/summaries"
                                    className={`${classTabItem}${location.pathname === '/summaries' ? ' active' : ''}`}
                                >
                                    <Text className="w-4 h-4 mr-1.5" />
                                    <span className='hidden lg:inline'>Summaries</span>
                                </Link>
                                    </Tooltip>
                            </li>
                            <li>
                                <Tooltip title="Affirmations" placement="bottom" arrow className='' disableHoverListener={isLarge}>
                                <Link
                                    to="/affirmations"
                                    className={`${classTabItem}${location.pathname.startsWith('/affirmations') ? ' active' : ''}`}
                                >
                                    <ThumbsUp className="w-4 h-4 mr-1.5" />
                                    <span className='hidden lg:inline'>Affirmations</span>
                                </Link>
                                    </Tooltip>
                            </li>
                        </ul>
                    </nav> */}
                    </>
                )}
                {/* Mobile drawer — only rendered on medium screens when authenticated */}
                {isAuthenticated && (
                    <>
                    <div ref={drawerContainerRef} className="relative md:hidden">
                        <PersistentDrawerRight
                            theme={props.theme}
                            toggleTheme={props.toggleTheme}
                            isOpen={menuOpen}
                            handleLogout={props.handleLogout}
                        />
                    </div>

                    {/* Mobile Bottom Nav */}
                        <nav className="header-brand--bg md:hidden fixed bottom-0 left-0 right-0 z-40 bg-brand-20 dark:bg-brand-60 backdrop-blur-xl border-t border-secondary-border pb-4">
                            <div className="flex items-center justify-around px-2 py-2 pb-[env(safe-area-inset-bottom)]">
                                {navItems.map(({ to, label, icon: Icon, end }) => (
                                <NavLink
                                    key={to}
                                    to={to}
                                    end={end}
                                    style={({ isActive }) => ({
                                        minWidth: '3.5rem',
                                        background: isActive ? 'radial-gradient(circle, var(--brand-90) 0%, rgba(0,0,0,0.0) 80%)' : '',
                                    })}
                                    className={({ isActive }) =>
                                    `flex flex-col items-center justify-center text-center gap-0.5 px-3 py-1.5 text-[10px] uppercase tracking-wider font-medium transition-all duration-200 ${
                                        isActive
                                        ? 'header-mobile--nav text-brand-70 dark:text-brand-40 scale-110 border-b-2 border-brand-60 dark:border-brand-40'
                                        : 'text-white opacity-80 hover:opacity-100'
                                    }`
                                }
                                >
                                    <Icon className="w-5 h-5" />
                                    <span>{label}</span>
                                </NavLink>
                                ))}
                            </div>
                        </nav>
                        </>
                )}

                {/* Desktop: avatar/menu + profile modal — authenticated only */}
                {isAuthenticated && (
                    <>
                        {/* Show avatar/menu only when the drawer is not open */}
                        <div className='header-brand--avatar-wrapper absolute top-8 sm:top-10 right-3 sm:right-10'>
                            {!drawerVisible && (
                                <>
                                    <Tooltip title="Profile" placement="bottom" arrow className='pb-4'>
                                        <span className="w-full h-full">
                                            <Avatar
                                                isEdit={false}
                                                onClick={handleMenuOpen}
                                                size={drawerVisible ? 'sm' : 'md'}
                                            />
                                         </span>
                                    </Tooltip>
                                    <Menu
                                        anchorEl={menuAnchor}
                                        open={Boolean(menuAnchor)}
                                        onClose={handleMenuClose}
                                        onClick={handleMenuClose}
                                        className='p-4'
                                    >
                                        <label className="px-4 pb-4 opacity-50" htmlFor="profile-menu">{session?.user?.email}</label>
                                        <MenuItem onClick={() => setIsProfileOpen(true)}>Preferences</MenuItem>
                                        <MenuItem onClick={() => { setIsFeedbackOpen(true); }} divider>Share Feedback</MenuItem>
                                        <MenuItem onClick={handleLogout}>Sign Out</MenuItem>
                                        {profile?.is_admin === true && <MenuItem onClick={() => window.location.href = '/admin/access'}>Admin Access Requests</MenuItem>}
                                    </Menu>
                                </>
                            )}
                        </div>
                        <FeedbackDialog isOpen={isFeedbackOpen} onClose={() => setIsFeedbackOpen(false)} />
                        <Modal
                            isOpen={isProfileOpen}
                            id='Profile'
                            ariaHideApp={ARIA_HIDE_APP}
                            className={`fixed inset-0 flex items-center justify-center z-50`}
                            overlayClassName={`${overlayClasses}`}
                        >
                            {isProfileOpen && (
                                <div className={`${modalClasses}`}>
                                    <ProfileManagement onClose={() => setIsProfileOpen(false)} />
                                </div>
                            )}
                        </Modal>
                    </>
                )}
                
                {/* Login button for logged-out users */}
                {!isAuthenticated && props.onLoginClick && (
                    <div className='header-brand--login-wrapper absolute bottom-3 right-3 sm:right-10'>
                        <button
                            onClick={props.onLoginClick}
                            className="btn-primary px-4 py-2 font-medium"
                        >
                            Login
                        </button>
                    </div>
                )}
            </div>

            
        </div>
    );
};
        export default Header;
