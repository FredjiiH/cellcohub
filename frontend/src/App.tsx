import React, { useState, useEffect } from 'react';
import { MsalProvider, AuthenticatedTemplate, UnauthenticatedTemplate, useMsal } from '@azure/msal-react';
import { PublicClientApplication } from '@azure/msal-browser';
import { msalConfig } from './authConfig';
import Login from './components/Login';
import WorkloadDashboard from './components/WorkloadDashboard';
import UnassignedTasksModule from './components/UnassignedTasksModule';
import CapacityManager from './components/CapacityManager';
import EnhancedCapacityManager from './components/EnhancedCapacityManager';
import BoardInspector from './components/BoardInspector';
import ContentApprovalDashboard from './components/ContentApprovalDashboard';
import PermissionGuard from './components/PermissionGuard';
import { usePermissions } from './hooks/usePermissions';
import { fetchGroups, fetchTasks, Task, Group } from './api/monday';
import axios from 'axios';
import './App.css';

// Initialize MSAL
const msalInstance = new PublicClientApplication(msalConfig);

// Check Environment Access
console.log('=== CELLCO HUB DEBUG INFO ===');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('REACT_APP_MONDAY_API_TOKEN:', process.env.REACT_APP_MONDAY_API_TOKEN ? 'SET' : 'NOT SET');
console.log('REACT_APP_MONDAY_BOARD_ID:', process.env.REACT_APP_MONDAY_BOARD_ID);
console.log('REACT_APP_BACKEND_URL:', process.env.REACT_APP_BACKEND_URL);
console.log('REACT_APP_AZURE_CLIENT_ID:', process.env.REACT_APP_AZURE_CLIENT_ID ? 'SET' : 'NOT SET');
console.log('REACT_APP_AZURE_TENANT_ID:', process.env.REACT_APP_AZURE_TENANT_ID);
console.log('Current URL:', window.location.href);
console.log('================================');

// Trigger deployment - small change to force rebuild

interface TeamMember {
  name: string;
  email: string;
  capacity: number;
  role: 'admin' | 'user';
  permissions: {
    modules: string[];
    subcategories: string[];
  };
  createdAt?: string;
  updatedAt?: string;
}

interface User {
  name: string;
  email: string;
  account: any;
}

function AppContent({ user, setUser }: { user: User | null; setUser: (user: User | null) => void }) {
  const { instance } = useMsal();
  const { permissions, hasModuleAccess } = usePermissions(user);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [workload, setWorkload] = useState<{ [name: string]: number }>({});
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [showInspector, setShowInspector] = useState(false);
  const [tab, setTab] = useState<'monday-data' | 'team-settings' | 'content-approval'>('monday-data');
  const [overrides, setOverrides] = useState<{ [name: string]: number }>({});
  const [overrideMember, setOverrideMember] = useState<string>('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Add loading states
  const [isLoading, setIsLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Handle override change (local state only)
  const [pendingOverride, setPendingOverride] = useState<number | undefined>(undefined);

  const handleOverrideInput = (value: number) => {
    setPendingOverride(value);
  };

  const handleSaveOverride = async () => {
    if (overrideMember && pendingOverride !== undefined) {
      await handleOverrideChange(overrideMember, pendingOverride);
      setOverrideMember('');
      setPendingOverride(undefined);
    }
  };

  // When overrideMember changes, reset pendingOverride to current value
  useEffect(() => {
    if (!overrideMember) {
      setPendingOverride(undefined);
    } else {
      setPendingOverride(
        overrides[overrideMember] !== undefined
          ? overrides[overrideMember]
          : team.find(m => m.name === overrideMember)?.capacity || 40
      );
    }
    // eslint-disable-next-line
  }, [overrideMember]);

  // Close mobile menu on window resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768 && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [mobileMenuOpen]);

  // Handle logout
  const handleLogout = async () => {
    try {
      // Clear all local state
      setUser(null);
      setTeam([]);
      setTasks([]);
      setWorkload({});
      setGroups([]);
      setSelectedGroup('');
      setOverrides({});
      setOverrideMember('');
      setPendingOverride(undefined);
      setTab('monday-data');
      setShowInspector(false);
      
      // Logout from MSAL
      await instance.logout({
        account: user?.account,
        postLogoutRedirectUri: window.location.origin
      });
    } catch (error) {
      console.error('Logout error:', error);
      // Even if MSAL logout fails, clear local state
      setUser(null);
    }
  };

  // Handle logout with confirmation
  const handleLogoutWithConfirmation = () => {
    if (window.confirm('Are you sure you want to sign out?')) {
      handleLogout();
    }
  };

  // Handle refresh data
  const handleRefreshData = async () => {
    if (!user) return;
    
    console.log('=== MANUAL DATA REFRESH ===');
    setIsLoading(true);
    setDataLoaded(false);
    
    try {
      console.log('Fetching all data for user:', user.email);
      
              // Fetch all data in parallel
        const [groupsData, tasksData, teamData] = await Promise.all([
          fetchGroups().catch(err => {
            console.error('Error fetching groups:', err);
            return [];
          }),
          fetchTasks().catch(err => {
            console.error('Error fetching tasks:', err);
            return [];
          }),
          (async () => {
            const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';
            try {
              const response = await instance.acquireTokenSilent({
                scopes: ['User.Read'],
                account: user.account
              });
              
              const res = await axios.get(`${backendUrl}/api/team`, {
                headers: {
                  'Authorization': `Bearer ${response.accessToken}`,
                  'x-user-email': user.email,
                  'x-user-name': user.name
                }
              });
              return res.data;
            } catch (err: any) {
              console.error('Error fetching team from backend:', err);
              console.error('Backend URL attempted:', backendUrl);
              console.error('Response details:', err.response?.data || 'No response data');
              console.error('Status code:', err.response?.status || 'No status code');
              
              // Return existing team data instead of throwing error
              // This prevents losing team members when backend is temporarily unavailable
              console.log('Keeping existing team data due to backend error');
              return team; // Return current team state instead of throwing
            }
          })()
        ]);
      
      console.log('Manual refresh - All data fetched successfully');
      console.log('Groups:', groupsData);
      console.log('Tasks:', tasksData);
      console.log('Team:', teamData);
      
      setGroups(groupsData);
      setTasks(tasksData);
      setTeam(teamData);
      
      // Set selected group if groups are available
      if (groupsData.length > 0) {
        setSelectedGroup(groupsData[0].id);
      }
      
      setDataLoaded(true);
      setIsLoading(false);
      
    } catch (error) {
      console.error('Error during manual refresh:', error);
      setIsLoading(false);
    }
  };

  // Fetch all data when user logs in
  useEffect(() => {
    if (!user) return;
    
    console.log('=== STARTING DATA FETCH ===');
    setIsLoading(true);
    setDataLoaded(false);
    
    const fetchAllData = async () => {
      try {
        console.log('Fetching all data for user:', user.email);
        
        // Fetch all data in parallel
        const [groupsData, tasksData, teamData] = await Promise.all([
          fetchGroups().catch(err => {
            console.error('Error fetching groups:', err);
            return [];
          }),
          fetchTasks().catch(err => {
            console.error('Error fetching tasks:', err);
            return [];
          }),
          (async () => {
            const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';
            try {
              const response = await instance.acquireTokenSilent({
                scopes: ['User.Read'],
                account: user.account
              });
              
              const res = await axios.get(`${backendUrl}/api/team`, {
                headers: {
                  'Authorization': `Bearer ${response.accessToken}`,
                  'x-user-email': user.email,
                  'x-user-name': user.name
                }
              });
              return res.data;
            } catch (err: any) {
              console.error('Error fetching team from backend:', err);
              console.error('Backend URL attempted:', backendUrl);
              console.error('Response details:', err.response?.data || 'No response data');
              console.error('Status code:', err.response?.status || 'No status code');
              
              // Return existing team data instead of throwing error
              // This prevents losing team members when backend is temporarily unavailable
              console.log('Keeping existing team data due to backend error');
              return team; // Return current team state instead of throwing
            }
          })()
        ]);
        
        console.log('All data fetched successfully');
        console.log('Groups:', groupsData);
        console.log('Tasks:', tasksData);
        console.log('Team:', teamData);
        
        setGroups(groupsData);
        setTasks(tasksData);
        setTeam(teamData);
        
        // Set selected group if groups are available
        if (groupsData.length > 0) {
          setSelectedGroup(groupsData[0].id);
        }
        
        setDataLoaded(true);
        setIsLoading(false);
        
      } catch (error) {
        console.error('Error fetching all data:', error);
        setIsLoading(false);
      }
    };
    
    fetchAllData();
  }, [user, instance]);

  // Fetch overrides for selected group
  useEffect(() => {
    if (!selectedGroup || !user) return;
    const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';
    console.log('=== FETCHING OVERRIDES ===');
    console.log('Backend URL for overrides:', backendUrl);
    console.log('Selected group:', selectedGroup);
    console.log('User:', user.email);
    
    // Get access token for backend
    instance.acquireTokenSilent({
      scopes: ['User.Read'],
      account: user.account
    }).then(response => {
      console.log('Access token acquired successfully');
      console.log('Making request to:', `${backendUrl}/api/overrides/${selectedGroup}`);
      axios.get(`${backendUrl}/api/overrides/${selectedGroup}`, {
        headers: {
          'Authorization': `Bearer ${response.accessToken}`,
          'x-user-email': user.email,
          'x-user-name': user.name
        }
      }).then(res => {
        console.log('Overrides fetched successfully:', res.data);
        setOverrides(res.data);
      }).catch(err => {
        console.error('Error fetching overrides:', err);
        console.error('Error response:', err.response?.data);
        console.error('Error status:', err.response?.status);
        console.error('Error headers:', err.response?.headers);
        setOverrides({});
      });
    }).catch(err => {
      console.error('Error getting access token:', err);
      console.error('Error details:', err.message);
      setOverrides({});
    });
  }, [selectedGroup, user, instance]);

  // Workload calculation with main/subitem logic
  useEffect(() => {
    let filteredTasks = tasks;
    if (selectedGroup) {
      filteredTasks = tasks.filter((task: any) => task.groupId === selectedGroup);
    }
    // Remove main items that have subitems in the same group
    const mainItemIdsWithSubitems = new Set(
      filteredTasks.filter(t => t.isSubitem).map(t => t.parentId)
    );
    const filteredForWorkload = filteredTasks.filter(
      t => t.isSubitem || (!t.isSubitem && !mainItemIdsWithSubitems.has(t.id))
    );
    // Calculate workload per team member (only for tasks with effort and assignees)
    const wl: { [name: string]: number } = {};
    filteredForWorkload.forEach(task => {
      if (task.effort > 0 && task.assignee && task.assignee.trim() !== '') {
        wl[task.assignee] = (wl[task.assignee] || 0) + task.effort;
      }
    });
    setWorkload(wl);
  }, [tasks, selectedGroup]);

  // Handle override change
  const handleOverrideChange = async (name: string, value: number) => {
    if (!user) return;
    const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';
    try {
      const response = await instance.acquireTokenSilent({
        scopes: ['User.Read'],
        account: user.account
      });
      
      await axios.post(`${backendUrl}/api/overrides/${selectedGroup}`, 
        { name, capacity: value },
        {
          headers: {
            'Authorization': `Bearer ${response.accessToken}`,
            'x-user-email': user.email,
            'x-user-name': user.name
          }
        }
      );
      setOverrides(prev => ({ ...prev, [name]: value }));
    } catch (err) {
      console.error('Error saving override:', err);
      alert('Failed to save override. Backend might be unavailable.');
    }
  };
  
  // Handle mobile menu
  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  const handleMobileNavClick = (newTab: 'monday-data' | 'team-settings' | 'content-approval') => {
    setTab(newTab);
    closeMobileMenu();
  };

  // Handle reset override
  const handleResetOverride = async (name: string) => {
    if (!user) return;
    const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';
    try {
      const response = await instance.acquireTokenSilent({
        scopes: ['User.Read'],
        account: user.account
      });
      
      await axios.delete(`${backendUrl}/api/overrides/${selectedGroup}/${encodeURIComponent(name)}`, {
        headers: {
          'Authorization': `Bearer ${response.accessToken}`,
          'x-user-email': user.email,
          'x-user-name': user.name
        }
      });
      setOverrides(prev => {
        const copy = { ...prev };
        delete copy[name];
        return copy;
      });
      // If the reset member is currently selected, update the input to the default value
      if (overrideMember === name) {
        const defaultCapacity = team.find(m => m.name === name)?.capacity || 40;
        setPendingOverride(defaultCapacity);
      }
    } catch (err) {
      console.error('Error resetting override:', err);
      alert('Failed to reset override. Backend might be unavailable.');
    }
  };

  return (
    <div className="App">
      {user && (
        <header style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          position: 'sticky',
          top: 0,
          zIndex: 1000
        }}>
          <div className="header-container" style={{
            maxWidth: '1400px',
            margin: '0 auto',
            padding: '0 24px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              height: '70px'
            }}>
              {/* Left side - Logo/Brand */}
              <div className="header-brand" style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px'
              }}>
                <div className="header-logo" style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.1) 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '22px',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
                }}>
                  ⚡
                </div>
                <div>
                  <h1 style={{
                    color: 'white',
                    fontSize: '26px',
                    fontWeight: '700',
                    margin: 0,
                    letterSpacing: '-0.8px'
                  }}>
                    Cellco Hub
                  </h1>
                  <p style={{
                    color: 'rgba(255, 255, 255, 0.8)',
                    fontSize: '13px',
                    fontWeight: '500',
                    margin: 0,
                    letterSpacing: '0.5px',
                    textTransform: 'uppercase'
                  }}>
                    Marketing Operations
                  </p>
                </div>
              </div>

              {/* Center - Navigation */}
              {!isLoading && dataLoaded && (
                <nav className="header-nav" style={{
                  display: 'flex',
                  gap: '8px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  padding: '6px',
                  borderRadius: '12px',
                  backdropFilter: 'blur(10px)'
                }}>
                  {hasModuleAccess('mondayData') && (
                    <button
                      className="nav-button"
                      onClick={() => setTab('monday-data')}
                      style={{
                        padding: '10px 20px',
                        backgroundColor: tab === 'monday-data' ? 'rgba(255, 255, 255, 0.9)' : 'transparent',
                        color: tab === 'monday-data' ? '#667eea' : 'rgba(255, 255, 255, 0.9)',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: '500',
                        fontSize: '15px',
                        transition: 'all 0.2s ease',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      📈 Monday.com Data
                    </button>
                  )}
                  
                  {hasModuleAccess('teamSettings') && (
                    <button
                      className="nav-button"
                      onClick={() => setTab('team-settings')}
                      style={{
                        padding: '10px 20px',
                        backgroundColor: tab === 'team-settings' ? 'rgba(255, 255, 255, 0.9)' : 'transparent',
                        color: tab === 'team-settings' ? '#667eea' : 'rgba(255, 255, 255, 0.9)',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: '500',
                        fontSize: '15px',
                        transition: 'all 0.2s ease',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      👥 Team Settings
                    </button>
                  )}
                  
                  {hasModuleAccess('contentApproval') && (
                    <button
                      className="nav-button"
                      onClick={() => setTab('content-approval')}
                      style={{
                        padding: '10px 20px',
                        backgroundColor: tab === 'content-approval' ? 'rgba(255, 255, 255, 0.9)' : 'transparent',
                        color: tab === 'content-approval' ? '#667eea' : 'rgba(255, 255, 255, 0.9)',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: '500',
                        fontSize: '15px',
                        transition: 'all 0.2s ease',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      ✅ Content Approval
                    </button>
                  )}
                </nav>
              )}

              {/* Right side - User info and actions */}
              <div className="user-section" style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px'
              }}>
                {/* Hamburger Menu Button (Mobile Only) */}
                <button
                  className={`hamburger-button ${mobileMenuOpen ? 'open' : ''}`}
                  onClick={toggleMobileMenu}
                  style={{ display: 'none' }}
                >
                  <div className="hamburger-line"></div>
                  <div className="hamburger-line"></div>
                  <div className="hamburger-line"></div>
                </button>

                <button
                  className="refresh-btn"
                  onClick={handleRefreshData}
                  disabled={isLoading}
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    color: 'white',
                    border: 'none',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    transition: 'all 0.2s ease',
                    opacity: isLoading ? 0.6 : 1,
                    backdropFilter: 'blur(10px)'
                  }}
                >
                  {isLoading ? '⏳' : '🔄'}
                </button>
                
                <div className="user-info" style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '8px 16px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '12px',
                  backdropFilter: 'blur(10px)'
                }}>
                  <div className="user-avatar" style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: 'rgba(255, 255, 255, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '16px'
                  }}>
                    👤
                  </div>
                  <span style={{
                    color: 'white',
                    fontWeight: '500',
                    fontSize: '15px'
                  }}>
                    {user.name}
                  </span>
                  <button
                    className="signout-btn"
                    onClick={handleLogoutWithConfirmation}
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.2)',
                      color: 'white',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: '500',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>
      )}
      
      {/* Mobile Menu Overlay and Sidebar */}
      {user && (
        <>
          <div 
            className={`mobile-menu-overlay ${mobileMenuOpen ? 'open' : ''}`}
            onClick={closeMobileMenu}
          ></div>
          
          <div className={`mobile-menu ${mobileMenuOpen ? 'open' : ''}`}>
            <h3 style={{
              color: 'white',
              fontSize: '20px',
              fontWeight: '600',
              marginBottom: '32px',
              textAlign: 'center'
            }}>
              Cellco Hub
            </h3>
            
            {hasModuleAccess('mondayData') && (
              <button
                className={`mobile-menu-item ${tab === 'monday-data' ? 'active' : ''}`}
                onClick={() => handleMobileNavClick('monday-data')}
              >
                📈 Monday.com Data
              </button>
            )}
            
            {hasModuleAccess('teamSettings') && (
              <button
                className={`mobile-menu-item ${tab === 'team-settings' ? 'active' : ''}`}
                onClick={() => handleMobileNavClick('team-settings')}
              >
                👥 Team Settings
              </button>
            )}
            
            {hasModuleAccess('contentApproval') && (
              <button
                className={`mobile-menu-item ${tab === 'content-approval' ? 'active' : ''}`}
                onClick={() => handleMobileNavClick('content-approval')}
              >
                ✅ Content Approval
              </button>
            )}
            
            <div style={{
              position: 'absolute',
              bottom: '24px',
              left: '24px',
              right: '24px',
              padding: '16px',
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              textAlign: 'center'
            }}>
              <p style={{
                color: 'rgba(255, 255, 255, 0.8)',
                fontSize: '14px',
                margin: '0 0 12px 0'
              }}>
                Signed in as
              </p>
              <p style={{
                color: 'white',
                fontSize: '16px',
                fontWeight: '600',
                margin: '0 0 16px 0'
              }}>
                {user.name}
              </p>
              <button
                onClick={() => {
                  closeMobileMenu();
                  handleLogoutWithConfirmation();
                }}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'rgba(255, 255, 255, 0.2)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                Sign Out
              </button>
            </div>
          </div>
        </>
      )}
      
      <main className="main-content" style={{ 
        maxWidth: '1400px', 
        margin: '0 auto', 
        padding: '32px 24px',
        minHeight: 'calc(100vh - 70px)',
        background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
        position: 'relative',
        zIndex: 1
      }}>
        
        {isLoading && (
          <div style={{
            textAlign: 'center',
            padding: '60px 40px',
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            borderRadius: '20px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            marginBottom: '30px'
          }}>
            <div style={{
              display: 'inline-block',
              width: '50px',
              height: '50px',
              border: '4px solid rgba(102, 126, 234, 0.1)',
              borderTop: '4px solid #667eea',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              marginBottom: '24px'
            }}></div>
            <p style={{ 
              color: '#667eea', 
              fontSize: '18px', 
              fontWeight: '500',
              margin: 0 
            }}>
              Initializing Cellco Hub...
            </p>
          </div>
        )}
        
        {!isLoading && !dataLoaded && user && (
          <div style={{
            textAlign: 'center',
            padding: '60px 40px',
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            borderRadius: '20px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            marginBottom: '30px'
          }}>
            <div style={{
              fontSize: '48px',
              marginBottom: '24px'
            }}>⚠️</div>
            <p style={{ 
              color: '#667eea', 
              fontSize: '18px', 
              fontWeight: '500',
              marginBottom: '24px' 
            }}>
              No data loaded. This might be a temporary issue.
            </p>
            <button 
              onClick={handleRefreshData}
              style={{
                padding: '14px 28px',
                backgroundColor: '#667eea',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: '600',
                transition: 'all 0.2s ease',
                boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)'
              }}
            >
              🔄 Retry Loading Data
            </button>
          </div>
        )}
        
        {!isLoading && dataLoaded && (
          <>
            {tab === 'monday-data' && (
              <PermissionGuard user={user} requireModule="mondayData">
                <div style={{ 
                  margin: '30px 0', 
                  textAlign: 'center',
                  padding: '20px',
                  backgroundColor: '#ffffff',
                  borderRadius: '12px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                }}>
                  <label htmlFor="group-select" style={{ fontWeight: '600', marginRight: '10px', color: '#333' }}>
                    Select Sprint/Group:
                  </label>
                  <select
                    id="group-select"
                    className="custom-dropdown"
                    value={selectedGroup}
                    onChange={e => setSelectedGroup(e.target.value)}
                    style={{ marginLeft: '10px' }}
                  >
                    {groups.map(group => (
                      <option key={group.id} value={group.id}>{group.title}</option>
                    ))}
                  </select>
                </div>
                
                <PermissionGuard user={user} requireSubcategory="canManageCapacity" silent>
                  <div style={{ 
                    margin: '30px 0',
                    padding: '20px',
                    backgroundColor: '#ffffff',
                    borderRadius: '12px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                  }}>
                    <h2 style={{ textAlign: 'center', marginBottom: '20px', color: '#333', fontSize: '1.5rem' }}>
                      Team Member Capacity (Sprint Override)
                    </h2>
                  <div style={{ marginBottom: '20px', textAlign: 'center' }}>
                    <label htmlFor="override-member" style={{ fontWeight: '600', marginRight: '10px', color: '#333' }}>
                      Select Team Member:
                    </label>
                    <select
                      id="override-member"
                      className="custom-dropdown"
                      value={overrideMember}
                      onChange={e => setOverrideMember(e.target.value)}
                      style={{ marginLeft: '10px' }}
                    >
                      <option value="">-- Select --</option>
                      {team.map(member => (
                        <option key={member.name} value={member.name}>{member.name}</option>
                      ))}
                    </select>
                  </div>
                    {overrideMember && (
                      <div style={{ 
                        marginBottom: '20px', 
                        textAlign: 'center',
                        padding: '20px',
                        backgroundColor: '#f8f9fa',
                        borderRadius: '12px',
                        border: '1px solid #dee2e6',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                      }}>
                        <span style={{ fontWeight: '600', color: '#333', fontSize: '16px' }}>{overrideMember}:</span> {' '}
                        <input
                          type="number"
                          value={pendingOverride}
                          min={1}
                          className="capacity-input"
                          style={{ 
                            width: '80px', 
                            marginRight: '10px'
                          }}
                          onChange={e => handleOverrideInput(Number(e.target.value))}
                        /> hrs
                        <button 
                          style={{ 
                            marginLeft: '10px',
                            padding: '10px 20px',
                            backgroundColor: '#28a745',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: '500',
                            transition: 'all 0.2s ease',
                            boxShadow: '0 2px 4px rgba(40, 167, 69, 0.2)'
                          }}
                          onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = '#218838'}
                          onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = '#28a745'}
                          onClick={handleSaveOverride}
                        >
                          Save
                        </button>
                        {overrides[overrideMember] !== undefined && (
                          <button 
                            style={{ 
                              marginLeft: '10px',
                              padding: '10px 20px',
                              backgroundColor: '#6c757d',
                              color: 'white',
                              border: 'none',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              fontSize: '14px',
                              fontWeight: '500',
                              transition: 'all 0.2s ease',
                              boxShadow: '0 2px 4px rgba(108, 117, 125, 0.2)'
                            }}
                            onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = '#5a6268'}
                            onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = '#6c757d'}
                            onClick={() => handleResetOverride(overrideMember)}
                          >
                            Reset to Default
                          </button>
                        )}
                        {overrides[overrideMember] !== undefined && (
                          <span className="status-overridden" style={{ marginLeft: '10px' }}>(Overridden)</span>
                        )}
                        {overrides[overrideMember] === undefined && (
                          <span className="status-default" style={{ marginLeft: '10px' }}>(Default)</span>
                        )}
                      </div>
                    )}
                  </div>
                </PermissionGuard>
                
                <div style={{
                  padding: '20px',
                  backgroundColor: '#ffffff',
                  borderRadius: '12px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                }}>
                  <h2 style={{ 
                    textAlign: 'center', 
                    marginBottom: '20px', 
                    color: '#333', 
                    fontSize: '1.5rem',
                    fontWeight: '600'
                  }}>
                    Workload Dashboard
                  </h2>
                  
                  <WorkloadDashboard
                    team={team.map(m => ({ ...m, capacity: overrides[m.name] !== undefined ? overrides[m.name] : m.capacity }))}
                    workload={workload}
                  />
                  
                  {/* Add the Unassigned Tasks Module */}
                  <UnassignedTasksModule 
                    tasks={tasks} 
                    selectedGroup={selectedGroup} 
                  />
                </div>
              </PermissionGuard>
            )}
            
            {tab === 'team-settings' && (
              <PermissionGuard user={user} requireModule="teamSettings">
                <div style={{
                  padding: '20px',
                  backgroundColor: '#ffffff',
                  borderRadius: '12px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                }}>
                  <EnhancedCapacityManager team={team} setTeam={setTeam} user={user} />
                </div>
                
                <PermissionGuard user={user} requireSubcategory="canUseBoardInspector">
                  <div style={{ 
                    marginTop: '30px',
                    textAlign: 'center',
                    padding: '20px',
                    backgroundColor: '#ffffff',
                    borderRadius: '12px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                  }}>
                    <button 
                      onClick={() => setShowInspector(v => !v)} 
                      style={{ 
                        marginBottom: '20px',
                        padding: '12px 24px',
                        backgroundColor: '#17a2b8',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '16px',
                        fontWeight: '500',
                        transition: 'all 0.2s ease',
                        boxShadow: '0 2px 4px rgba(23, 162, 184, 0.3)'
                      }}
                      onMouseEnter={(e) => {
                        (e.target as HTMLElement).style.backgroundColor = '#138496';
                        (e.target as HTMLElement).style.transform = 'translateY(-1px)';
                      }}
                      onMouseLeave={(e) => {
                        (e.target as HTMLElement).style.backgroundColor = '#17a2b8';
                        (e.target as HTMLElement).style.transform = 'translateY(0)';
                      }}
                    >
                      {showInspector ? 'Hide' : 'Show'} Board Structure Inspector
                    </button>
                    {showInspector && <BoardInspector />}
                  </div>
                </PermissionGuard>
              </PermissionGuard>
            )}

            {tab === 'content-approval' && (
              <PermissionGuard user={user} requireModule="contentApproval">
                <div style={{
                  padding: '20px',
                  backgroundColor: '#ffffff',
                  borderRadius: '12px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                }}>
                  <ContentApprovalDashboard user={user} />
                </div>
              </PermissionGuard>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function App() {
  const [user, setUser] = useState<User | null>(null);

  // Restore user state from MSAL account on app load
  useEffect(() => {
    const restoreUserFromAccount = async () => {
      try {
        // Check if there's an active account
        const accounts = msalInstance.getAllAccounts();
        if (accounts.length > 0) {
          const activeAccount = accounts[0];
          console.log('=== RESTORING USER FROM ACCOUNT ===');
          console.log('Active account found:', activeAccount);
          
          // Get user info from the account
          const userData: User = {
            name: activeAccount.name || 'Unknown User',
            email: activeAccount.username || '',
            account: activeAccount
          };
          
          console.log('Restored user data:', userData);
          setUser(userData);
        } else {
          console.log('No active accounts found, user needs to login');
        }
      } catch (error) {
        console.error('Error restoring user from account:', error);
      }
    };

    // Restore user state when app loads
    restoreUserFromAccount();
  }, []);

  const handleLoginSuccess = (userData: User) => {
    console.log('=== LOGIN SUCCESS CALLBACK ===');
    console.log('User data received:', userData);
    setUser(userData);
    console.log('User state set:', userData);
  };

  return (
    <MsalProvider instance={msalInstance}>
      <UnauthenticatedTemplate>
        <Login onLoginSuccess={handleLoginSuccess} />
      </UnauthenticatedTemplate>
      <AuthenticatedTemplate>
        <AppContent user={user} setUser={setUser} />
      </AuthenticatedTemplate>
    </MsalProvider>
  );
}

export default App;
