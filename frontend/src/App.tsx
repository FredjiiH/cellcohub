import React, { useState, useEffect } from 'react';
import { MsalProvider, AuthenticatedTemplate, UnauthenticatedTemplate, useMsal } from '@azure/msal-react';
import { PublicClientApplication } from '@azure/msal-browser';
import { msalConfig } from './authConfig';
import Login from './components/Login';
import WorkloadDashboard from './components/WorkloadDashboard';
import CapacityManager from './components/CapacityManager';
import BoardInspector from './components/BoardInspector';
import { fetchGroups, fetchTasks, Task, Group } from './api/monday';
import axios from 'axios';
import './App.css';

// Initialize MSAL
const msalInstance = new PublicClientApplication(msalConfig);

// Check Environment Access
console.log('REACT_APP_MONDAY_API_TOKEN:', process.env.REACT_APP_MONDAY_API_TOKEN);
console.log('REACT_APP_MONDAY_BOARD_ID:', process.env.REACT_APP_MONDAY_BOARD_ID);
console.log('REACT_APP_BACKEND_URL:', process.env.REACT_APP_BACKEND_URL);

// Trigger deployment - small change to force rebuild

interface TeamMember {
  name: string;
  capacity: number;
}

interface User {
  name: string;
  email: string;
  account: any;
}

function AppContent({ user, setUser }: { user: User | null; setUser: (user: User | null) => void }) {
  const { instance } = useMsal();
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [workload, setWorkload] = useState<{ [name: string]: number }>({});
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [showInspector, setShowInspector] = useState(false);
  const [tab, setTab] = useState<'dashboard' | 'settings'>('dashboard');
  const [overrides, setOverrides] = useState<{ [name: string]: number }>({});
  const [overrideMember, setOverrideMember] = useState<string>('');

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
      setTab('dashboard');
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

  // Fetch groups
  useEffect(() => {
    if (!user) return;
    fetchGroups().then(gs => {
      setGroups(gs);
      if (gs.length > 0) setSelectedGroup(gs[0].id);
    });
  }, [user]);

  // Fetch tasks
  useEffect(() => {
    if (!user) return;
    fetchTasks().then(ts => {
      setTasks(ts);
      console.log('All tasks with groupId:', ts);
    });
  }, [user]);

  // Fetch overrides for selected group
  useEffect(() => {
    if (!selectedGroup || !user) return;
    const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';
    console.log('Backend URL for overrides:', backendUrl);
    
    // Get access token for backend
    instance.acquireTokenSilent({
      scopes: ['User.Read'],
      account: user.account
    }).then(response => {
      axios.get(`${backendUrl}/api/overrides/${selectedGroup}`, {
        headers: {
          'Authorization': `Bearer ${response.accessToken}`,
          'x-user-email': user.email,
          'x-user-name': user.name
        }
      }).then(res => {
        setOverrides(res.data);
      }).catch(err => {
        console.error('Error fetching overrides:', err);
        setOverrides({});
      });
    }).catch(err => {
      console.error('Error getting access token:', err);
      setOverrides({});
    });
  }, [selectedGroup, user, instance]);

  // Fetch team from backend on mount
  useEffect(() => {
    if (!user) return;
    const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';
    console.log('Backend URL for team:', backendUrl);
    console.log('User data:', user);
    
    // Get access token for backend
    instance.acquireTokenSilent({
      scopes: ['User.Read'],
      account: user.account
    }).then(response => {
      console.log('Got access token, making API call to:', `${backendUrl}/api/team`);
      axios.get(`${backendUrl}/api/team`, {
        headers: {
          'Authorization': `Bearer ${response.accessToken}`,
          'x-user-email': user.email,
          'x-user-name': user.name
        }
      }).then(res => {
        console.log('Backend team response:', res.data);
        setTeam(res.data);
      }).catch(err => {
        console.error('Error fetching team from backend:', err);
        console.error('Error details:', err.response?.data || err.message);
        setTeam([
          { name: 'Fredrik Helander', capacity: 40 },
          { name: 'Fanny Wilgodt', capacity: 40 }
        ]);
      });
    }).catch(err => {
      console.error('Error getting access token:', err);
      setTeam([
        { name: 'Fredrik Helander', capacity: 40 },
        { name: 'Fanny Wilgodt', capacity: 40 }
      ]);
    });
  }, [user, instance]);

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
    // Calculate workload per team member
    const wl: { [name: string]: number } = {};
    filteredForWorkload.forEach(task => {
      if (task.status !== 'Done') {
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
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          padding: '15px 20px',
          backgroundColor: '#ffffff',
          borderBottom: '1px solid #e1e5e9',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          position: 'sticky',
          top: 0,
          zIndex: 1000
        }}>
          <div>
            <span style={{ fontWeight: '600', fontSize: '16px', color: '#333' }}>Welcome, {user.name}</span>
            <span style={{ color: '#666', marginLeft: '10px', fontSize: '14px' }}>({user.email})</span>
          </div>
          <button 
            onClick={handleLogoutWithConfirmation}
            style={{
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              transition: 'background-color 0.2s ease',
              boxShadow: '0 2px 4px rgba(108, 117, 125, 0.2)'
            }}
            onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = '#5a6268'}
            onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = '#6c757d'}
          >
            Sign Out
          </button>
        </div>
      )}
      
      <div style={{ 
        maxWidth: '1200px', 
        margin: '0 auto', 
        padding: '20px',
        minHeight: 'calc(100vh - 80px)'
      }}>
        <h1 style={{ 
          textAlign: 'center', 
          marginBottom: '30px',
          color: '#333',
          fontSize: '2.5rem',
          fontWeight: '600'
        }}>Monday.com Workload Tracker</h1>
        
        <div style={{ 
          textAlign: 'center', 
          margin: '30px 0',
          display: 'flex',
          justifyContent: 'center',
          gap: '10px'
        }}>
          <button 
            onClick={() => setTab('dashboard')} 
            style={{ 
              padding: '12px 24px',
              backgroundColor: tab === 'dashboard' ? '#0073ea' : '#f8f9fa',
              color: tab === 'dashboard' ? 'white' : '#333',
              border: '1px solid #dee2e6',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: tab === 'dashboard' ? '600' : '500',
              fontSize: '16px',
              transition: 'all 0.2s ease',
              boxShadow: tab === 'dashboard' ? '0 4px 8px rgba(0, 115, 234, 0.3)' : '0 2px 4px rgba(0,0,0,0.1)'
            }}
            onMouseEnter={(e) => {
              if (tab !== 'dashboard') {
                (e.target as HTMLElement).style.backgroundColor = '#e9ecef';
                (e.target as HTMLElement).style.transform = 'translateY(-1px)';
              }
            }}
            onMouseLeave={(e) => {
              if (tab !== 'dashboard') {
                (e.target as HTMLElement).style.backgroundColor = '#f8f9fa';
                (e.target as HTMLElement).style.transform = 'translateY(0)';
              }
            }}
          >
            Dashboard
          </button>
          <button 
            onClick={() => setTab('settings')} 
            style={{ 
              padding: '12px 24px',
              backgroundColor: tab === 'settings' ? '#0073ea' : '#f8f9fa',
              color: tab === 'settings' ? 'white' : '#333',
              border: '1px solid #dee2e6',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: tab === 'settings' ? '600' : '500',
              fontSize: '16px',
              transition: 'all 0.2s ease',
              boxShadow: tab === 'settings' ? '0 4px 8px rgba(0, 115, 234, 0.3)' : '0 2px 4px rgba(0,0,0,0.1)'
            }}
            onMouseEnter={(e) => {
              if (tab !== 'settings') {
                (e.target as HTMLElement).style.backgroundColor = '#e9ecef';
                (e.target as HTMLElement).style.transform = 'translateY(-1px)';
              }
            }}
            onMouseLeave={(e) => {
              if (tab !== 'settings') {
                (e.target as HTMLElement).style.backgroundColor = '#f8f9fa';
                (e.target as HTMLElement).style.transform = 'translateY(0)';
              }
            }}
          >
            Team Settings
          </button>
        </div>
        
        {tab === 'dashboard' && (
          <>
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
            </div>
          </>
        )}
        
        {tab === 'settings' && (
          <>
            <div style={{
              padding: '20px',
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}>
              <CapacityManager team={team} setTeam={setTeam} />
            </div>
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
          </>
        )}
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState<User | null>(null);

  const handleLoginSuccess = (userData: User) => {
    setUser(userData);
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
