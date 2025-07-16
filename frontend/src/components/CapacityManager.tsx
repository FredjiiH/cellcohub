import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface TeamMember {
  name: string;
  capacity: number;
}

const API_URL = process.env.REACT_APP_BACKEND_URL ? `${process.env.REACT_APP_BACKEND_URL}/api/team` : 'http://localhost:4000/api/team';

const CapacityManager: React.FC<{
  team: TeamMember[];
  setTeam: React.Dispatch<React.SetStateAction<TeamMember[]>>;
}> = ({ team, setTeam }) => {
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState<number>(40);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<number>(40);

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

  return (
    <div style={{ padding: '20px' }}>
      <h2 style={{ 
        textAlign: 'center', 
        marginBottom: '30px', 
        color: '#333', 
        fontSize: '1.5rem',
        fontWeight: '600'
      }}>
        Team Member Capacity
      </h2>
      
      <div style={{ 
        display: 'flex', 
        gap: '10px', 
        justifyContent: 'center', 
        alignItems: 'center',
        marginBottom: '30px',
        flexWrap: 'wrap'
      }}>
        <input
          type="text"
          placeholder="Name"
          value={name}
          onChange={e => setName(e.target.value)}
          style={{
            padding: '12px 16px',
            border: '2px solid #e1e5e9',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '500',
            color: '#333',
            background: '#ffffff',
            transition: 'all 0.2s ease',
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
            minWidth: '150px'
          }}
          onFocus={(e) => {
            e.target.style.borderColor = '#0073ea';
            e.target.style.boxShadow = '0 0 0 3px rgba(0, 115, 234, 0.1)';
          }}
          onBlur={(e) => {
            e.target.style.borderColor = '#e1e5e9';
            e.target.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
          }}
        />
        <input
          type="number"
          placeholder="Capacity (hrs)"
          value={capacity}
          onChange={e => setCapacity(Number(e.target.value))}
          min={1}
          style={{
            padding: '12px 16px',
            border: '2px solid #e1e5e9',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '500',
            color: '#333',
            background: '#ffffff',
            transition: 'all 0.2s ease',
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
            width: '120px'
          }}
          onFocus={(e) => {
            e.target.style.borderColor = '#0073ea';
            e.target.style.boxShadow = '0 0 0 3px rgba(0, 115, 234, 0.1)';
          }}
          onBlur={(e) => {
            e.target.style.borderColor = '#e1e5e9';
            e.target.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
          }}
        />
        <button 
          onClick={addMember} 
          disabled={!name || team.some(m => m.name === name)}
          style={{
            padding: '12px 24px',
            backgroundColor: !name || team.some(m => m.name === name) ? '#6c757d' : '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: !name || team.some(m => m.name === name) ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            transition: 'all 0.2s ease',
            boxShadow: '0 2px 4px rgba(40, 167, 69, 0.2)'
          }}
          onMouseEnter={(e) => {
            if (!(!name || team.some(m => m.name === name))) {
              (e.target as HTMLElement).style.backgroundColor = '#218838';
              (e.target as HTMLElement).style.transform = 'translateY(-1px)';
            }
          }}
          onMouseLeave={(e) => {
            if (!(!name || team.some(m => m.name === name))) {
              (e.target as HTMLElement).style.backgroundColor = '#28a745';
              (e.target as HTMLElement).style.transform = 'translateY(0)';
            }
          }}
        >
          Add Member
        </button>
      </div>
      
      <div style={{ 
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        padding: '20px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {team.map((member, idx) => (
            <li key={idx} style={{ 
              marginBottom: '15px',
              padding: '15px',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              border: '1px solid #dee2e6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px'
            }}>
              {editing === member.name ? (
                <>
                  <span style={{ fontWeight: '600', color: '#333', fontSize: '16px' }}>
                    {member.name}:
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input
                      type="number"
                      value={editValue}
                      min={1}
                      className="capacity-input"
                      style={{ width: '80px' }}
                      onChange={e => setEditValue(Number(e.target.value))}
                    />
                    <span style={{ color: '#666', fontSize: '14px' }}>hrs</span>
                    <button 
                      style={{ 
                        padding: '8px 16px',
                        backgroundColor: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '500',
                        transition: 'background-color 0.2s ease'
                      }}
                      onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = '#218838'}
                      onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = '#28a745'}
                      onClick={() => saveEdit(member)}
                    >
                      Save
                    </button>
                    <button 
                      style={{ 
                        padding: '8px 16px',
                        backgroundColor: '#6c757d',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '500',
                        transition: 'background-color 0.2s ease'
                      }}
                      onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = '#5a6268'}
                      onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = '#6c757d'}
                      onClick={cancelEdit}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span style={{ fontWeight: '600', color: '#333', fontSize: '16px' }}>
                    {member.name}: {member.capacity} hrs
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      style={{ 
                        padding: '8px 16px',
                        backgroundColor: '#0073ea',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '500',
                        transition: 'background-color 0.2s ease'
                      }}
                      onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = '#005bb5'}
                      onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = '#0073ea'}
                      onClick={() => startEdit(member)}
                    >
                      Edit
                    </button>
                    <button 
                      style={{ 
                        padding: '8px 16px',
                        backgroundColor: '#6c757d',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '500',
                        transition: 'background-color 0.2s ease'
                      }}
                      onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = '#5a6268'}
                      onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = '#6c757d'}
                      onClick={() => deleteMember(member.name)}
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default CapacityManager; 