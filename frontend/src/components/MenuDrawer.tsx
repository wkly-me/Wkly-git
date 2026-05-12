import * as React from 'react';
import { useState } from 'react';
// import MenuBtn, { MenuBtnProps } from '@components/menu-btn';
import { styled } from '@mui/material/styles';
// import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import MuiAppBar, { AppBarProps as MuiAppBarProps } from '@mui/material/AppBar';
import { Menu, MenuItem, Tooltip } from '@mui/material';
import Toolbar from '@mui/material/Toolbar';
import CssBaseline from '@mui/material/CssBaseline';
import List from '@mui/material/List';
// import Typography from '@mui/material/Typography';
import ProfileManagement from './ProfileManagement';
// import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import { Home, MenuIcon, MessageSquare, Moon, Sun, Target, Text, X, ThumbsUp } from 'lucide-react';
import FeedbackDialog from '@components/FeedbackDialog';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import useAuth from '@hooks/useAuth';
import Modal from 'react-modal';
import Avatar from '@components/Avatar';
import { ARIA_HIDE_APP, useOverlayDebug } from '@lib/modal';
import { modalClasses, overlayClasses } from '@styles/classes';
import { HeaderProps } from './Header';
import { Link, useLocation } from 'react-router-dom';
import Logo from '@components/Logo';


const drawerWidth = 240;


interface AppBarProps extends MuiAppBarProps {
  open?: boolean;
}

const AppBar = styled(MuiAppBar, {
  shouldForwardProp: (prop) => prop !== 'open',
})<AppBarProps>(({ theme }) => ({
  transition: theme.transitions.create(['margin', 'width'], {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
  variants: [
    {
      props: ({ open }) => open,
      style: {
        width: `calc(100% - ${drawerWidth}px)`,
        transition: theme.transitions.create(['margin', 'width'], {
          easing: theme.transitions.easing.easeOut,
          duration: theme.transitions.duration.enteringScreen,
        }),
        marginRight: drawerWidth,
      },
    },
  ],
}));

const DrawerHeader = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  padding: theme.spacing(0, 1),
  // necessary for content to be below app bar
  ...theme.mixins.toolbar,
  justifyContent: 'flex-start',
}));

export default function PersistentDrawerRight({...props }: HeaderProps) {
  const [open, setOpen] = React.useState(false);

  const handleDrawerOpen = () => {
    setOpen(true);
  };

  const handleDrawerClose = () => {
    setOpen(false);
  };

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  // const [isAuthenticated, setIsAuthenticated] = useState(false);
  const { session, profile } = useAuth();
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

    // Dev-only overlay debug
    useOverlayDebug(isProfileOpen);

const handleMenuOpen = (event: React.MouseEvent<HTMLLabelElement>) => {
        setMenuAnchor(event.currentTarget as HTMLElement);
    };
const toggleThemeInternal = (): void => {
        // Delegate to the app-level toggle so MUI provider and DOM stay in sync.
        props.toggleTheme();
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

  const location = useLocation();
  const navItems = [
    { label: 'Home', href: '/', icon: <Home className='w-4 h-4' /> },
    { label: 'Goals & Tasks', href: '/goals', icon: <Target className='w-4 h-4' /> },
    { label: 'Summaries', href: '/summaries', icon: <Text className='w-4 h-4' /> },
    { label: 'Affirmations', href: '/affirmations', icon: <ThumbsUp className='w-4 h-4' /> },
  ];

  return (
    <div className="flex"> 
    {/* sx={{ display: 'flex' }}> */}
      <CssBaseline />
      <AppBar className='header-brand--logo-container' position="fixed" open={open} sx={{ background: 'linear-gradient(180deg, var(--brand-90, variables.$brand-90) 0%, var(--brand-70, variables.$brand-70) 100%)' }}>
        <Toolbar className='justify-between gap-4'>
            <div>
                <Link
                    to="/"
                    className="header-brand--logo overflow-hidden flex-0 w-auto block items-end justify-start h-[3.5rem]"
                    style={{ minHeight: '2rem' }} // optional: ensures height
                >

                    {/* <span className="mask-clip-border absolute bottom-0 left-1/2 -translate-x-1/2 h-8 sm:h-12 w-auto"> */}
                    <span className="mask-clip-border h-auto w-full">
                    <Logo
                        aria-label="Wkly logo"
                        style={{ color: 'var(--brand-30)' }}
                        className="min-w-[134px] w-1/2 h-full pt-3"
                    />
                    </span>
                    

                </Link>
            </div>
                    <div className='flex flex-row w-auto gap-2 items-center'>    
                        <IconButton
                            onClick={toggleThemeInternal}
                            className="btn-ghost ml-4 p-2 rounded"
                            aria-label="Toggle theme"
                        >
                            {props.theme === 'theme-dark' ? (
                                <Sun className="w-5 h-5 stroke-gray-10 hover:stroke-gray-30 focus:outline-none" />
                            ) : (
                                <Moon className="w-5 h-5 stroke-gray-10 hover:stroke-gray-30 focus:outline-none" />
                            )}
                        </IconButton>
                        <Tooltip title="Profile" placement="bottom" arrow>
                            <span>
                                <Avatar
                                    isEdit={false}
                                    onClick={handleMenuOpen}
                                    size='sm'
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
                        

                        {/* <IconButton
                            color="inherit"
                            aria-label="open drawer"
                            edge="end"
                            onClick={handleDrawerOpen}
                            className="btn-ghost ml-4 p-2 rounded"
                            sx={[open && { display: 'none' }]}
                        >
                            <MenuIcon />
                        </IconButton> */}

                    </div>        
        </Toolbar>
      </AppBar>
      {/* <Main open={open}>
        <DrawerHeader />
        Main content goes here.
      </Main> */}
      <Drawer
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: drawerWidth,
          },
          backgroundColor: 'transparent',
          border: 'none',
        }}
        variant="persistent"
        anchor="right"
        open={open}
      >
        <DrawerHeader className='flex w-full justify-end' sx={{ background: 'linear-gradient(180deg, var(--brand-90, variables.$brand-90) 0%, var(--brand-70, variables.$brand-70) 100%)', border: 'none', justifyContent: 'flex-end' }}>
          <Tooltip className='' title="Close menu" arrow>
            <IconButton onClick={handleDrawerClose} className="btn-ghost w-auto p-2">
               {/* {props.theme === 'theme-dark' && ( */}
                    <X className="flex w-5 h-5 stroke-gray-10 hover:stroke-gray-30 focus:outline-none" />
                {/* )} */}

            </IconButton>
          </Tooltip>
        </DrawerHeader>
        {/* <Divider /> */}
        <List>
                
                            {/* <Link onClick={handleMenuItemClick} to="/" className={`${classMenuItem}`}>
                                <Home className="w-5 h-5 mr-2" />
                                Goals
                            </Link>
                            <Link onClick={handleMenuItemClick} to="/summaries" className={`${classMenuItem}`}>
                                <Text className="w-5 h-5 mr-2" />
                                Summaries
                            </Link> */}
                            

          {navItems.map(({ label, href, icon }) => {
            const isActive = location.pathname === href;
            return (
              <ListItem key={label} disablePadding className="border-l-4" sx={{ borderColor: isActive ? 'primary.main' : 'transparent' }}>
                <ListItemButton
                  component={Link}
                  to={href}
                  onClick={handleDrawerClose}
                  className={`flex gap-0 ${isActive ? 'border-2 border-brand-70 dark:border-brand-30' : 'border-none'}`}
                >
                  <ListItemIcon 
                    sx={{ 
                      color: isActive ? 'primary.main' : 'text.primary'
                    }}
                  >
                    {icon}
                  </ListItemIcon>
                  <ListItemText 
                    primary={label}
                    primaryTypographyProps={{
                      sx: {
                        color: isActive ? 'primary.main' : 'text.primary'
                      }
                    }}
                  />
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
      </Drawer>
    </div>
  );
}