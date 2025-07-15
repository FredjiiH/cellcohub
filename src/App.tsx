import React, { useEffect, useState } from 'react';
import './App.css';
import CapacityManager from './components/CapacityManager';
import WorkloadDashboard from './components/WorkloadDashboard';
import BoardInspector from './components/BoardInspector';
import { fetchTasks, Task, fetchGroups, Group } from './api/monday';
import axios from 'axios';

// Check Environment Access
console.log('REACT_APP_MONDAY_API_TOKEN:', process.env.REACT_APP_MONDAY_API_TOKEN);
console.log('REACT_APP_MONDAY_BOARD_ID:', process.env.REACT_APP_MONDAY_BOARD_ID);

interface TeamMember {
  name: string;
  capacity: number;
}

function App() {
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

  // Fetch groups
  useEffect(() => {
    fetchGroups().then(gs => {
      setGroups(gs);
      if (gs.length > 0) setSelectedGroup(gs[0].id);
    });
  }, []);

  // Fetch tasks
  useEffect(() => {
    fetchTasks().then(ts => {
      setTasks(ts);
      console.log('All tasks with groupId:', ts);
    });
  }, []);

  // Fetch overrides for selected group
  useEffect(() => {
    if (!selectedGroup) return;
    axios.get(`http://localhost:4000/api/overrides/${selectedGroup}`).then(res => {
      setOverrides(res.data);
    });
  }, [selectedGroup]);

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
    await axios.post(`http://localhost:4000/api/overrides/${selectedGroup}`, { name, capacity: value });
    setOverrides(prev => ({ ...prev, [name]: value }));
  };
  // Handle reset override
  const handleResetOverride = async (name: string) => {
    await axios.delete(`http://localhost:4000/api/overrides/${selectedGroup}/${encodeURIComponent(name)}`);
    setOverrides(prev => {
      const copy = { ...prev };
      delete copy[name];
      return copy;
    });
  };

  return (
    <div className="App">
      <h1>Monday.com Workload Tracker</h1>
      <div style={{ margin: '20px 0' }}>
        <button onClick={() => setTab('dashboard')} style={{ marginRight: 10, fontWeight: tab === 'dashboard' ? 'bold' : undefined }}>Dashboard</button>
        <button onClick={() => setTab('settings')} style={{ fontWeight: tab === 'settings' ? 'bold' : undefined }}>Team Settings</button>
      </div>
      {tab === 'dashboard' && (
        <>
          <div style={{ margin: '20px 0' }}>
            <label htmlFor="group-select"><strong>Select Sprint/Group:</strong> </label>
            <select
              id="group-select"
              className="custom-dropdown"
              value={selectedGroup}
              onChange={e => setSelectedGroup(e.target.value)}
            >
              {groups.map(group => (
                <option key={group.id} value={group.id}>{group.title}</option>
              ))}
            </select>
          </div>
          <h2>Team Member Capacity (Sprint Override)</h2>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="override-member"><strong>Select Team Member:</strong> </label>
            <select
              id="override-member"
              className="custom-dropdown"
              value={overrideMember}
              onChange={e => setOverrideMember(e.target.value)}
            >
              <option value="">-- Select --</option>
              {team.map(member => (
                <option key={member.name} value={member.name}>{member.name}</option>
              ))}
            </select>
          </div>
          {overrideMember && (
            <div style={{ marginBottom: 24 }}>
              <span style={{ fontWeight: 'bold' }}>{overrideMember}:</span> {' '}
              <input
                type="number"
                value={pendingOverride}
                min={1}
                style={{ width: 60, marginRight: 8 }}
                onChange={e => handleOverrideInput(Number(e.target.value))}
              /> hrs
              <button style={{ marginLeft: 8 }} onClick={handleSaveOverride}>Save</button>
              {overrides[overrideMember] !== undefined && (
                <button style={{ marginLeft: 8 }} onClick={() => handleResetOverride(overrideMember)}>Reset to Default</button>
              )}
              {overrides[overrideMember] !== undefined && <span style={{ color: '#888', marginLeft: 8 }}>(Overridden)</span>}
              {overrides[overrideMember] === undefined && <span style={{ color: '#888', marginLeft: 8 }}>(Default)</span>}
            </div>
          )}
          <WorkloadDashboard
            team={team.map(m => ({ ...m, capacity: overrides[m.name] !== undefined ? overrides[m.name] : m.capacity }))}
            workload={workload}
          />
        </>
      )}
      {tab === 'settings' && (
        <>
          <CapacityManager team={team} setTeam={setTeam} />
          <div style={{ marginTop: 40 }}>
            <button onClick={() => setShowInspector(v => !v)} style={{ marginBottom: 10 }}>
              {showInspector ? 'Hide' : 'Show'} Board Structure Inspector
            </button>
            {showInspector && <BoardInspector />}
          </div>
        </>
      )}
    </div>
  );
}

export default App;
