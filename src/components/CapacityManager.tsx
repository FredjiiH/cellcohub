import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface TeamMember {
  name: string;
  capacity: number;
}

const API_URL = 'http://localhost:4000/api/team';

const CapacityManager: React.FC<{
  team: TeamMember[];
  setTeam: React.Dispatch<React.SetStateAction<TeamMember[]>>;
}> = ({ team, setTeam }) => {
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState<number>(40);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<number>(40);

  // Remove the useEffect that fetches the team from the backend
  // Remove the loading state/logic
  const addMember = async () => {
    if (name && capacity > 0 && !team.some(m => m.name === name)) {
      const res = await axios.post(API_URL, { name, capacity });
      setTeam(res.data);
      setName('');
      setCapacity(40);
    }
  };

  const startEdit = (member: TeamMember) => {
    setEditing(member.name);
    setEditValue(member.capacity);
  };

  const saveEdit = async (member: TeamMember) => {
    const res = await axios.post(API_URL, { name: member.name, capacity: editValue });
    setTeam(res.data);
    setEditing(null);
  };

  const cancelEdit = () => {
    setEditing(null);
  };

  const deleteMember = async (memberName: string) => {
    const res = await axios.delete(`${API_URL}/${encodeURIComponent(memberName)}`);
    setTeam(res.data);
  };

  // Remove loading check
  // if (loading) return <div>Loading team...</div>;

  return (
    <div>
      <h2>Team Member Capacity</h2>
      <input
        type="text"
        placeholder="Name"
        value={name}
        onChange={e => setName(e.target.value)}
      />
      <input
        type="number"
        placeholder="Capacity (hrs)"
        value={capacity}
        onChange={e => setCapacity(Number(e.target.value))}
        min={1}
      />
      <button onClick={addMember} disabled={!name || team.some(m => m.name === name)}>Add Member</button>
      <ul>
        {team.map((member, idx) => (
          <li key={idx} style={{ marginBottom: 8 }}>
            {editing === member.name ? (
              <>
                <span style={{ fontWeight: 'bold' }}>{member.name}:</span> {' '}
                <input
                  type="number"
                  value={editValue}
                  min={1}
                  style={{ width: 60, marginRight: 8 }}
                  onChange={e => setEditValue(Number(e.target.value))}
                /> hrs
                <button style={{ marginLeft: 8 }} onClick={() => saveEdit(member)}>Save</button>
                <button style={{ marginLeft: 8 }} onClick={cancelEdit}>Cancel</button>
              </>
            ) : (
              <>
                {member.name}: {member.capacity} hrs
                <button style={{ marginLeft: 8 }} onClick={() => startEdit(member)}>Edit</button>
                <button style={{ marginLeft: 8 }} onClick={() => deleteMember(member.name)}>Delete</button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default CapacityManager; 