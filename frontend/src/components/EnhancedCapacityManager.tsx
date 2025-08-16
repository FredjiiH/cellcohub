import React, { useState, useEffect } from 'react';
import { useMsal } from '@azure/msal-react';
import axios from 'axios';

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

interface RolesPermissions {
  roles: { [key: string]: string };
  modules: { [key: string]: string };
  subcategories: { [key: string]: string };
  defaultPermissions: {
    [key: string]: {
      modules: string[];
      subcategories: string[];
    };
  };
}

interface User {
  name: string;
  email: string;
  account: any;
}

interface EnhancedCapacityManagerProps {
  team: TeamMember[];
  setTeam: (team: TeamMember[]) => void;
  user: User | null;
}

const EnhancedCapacityManager: React.FC<EnhancedCapacityManagerProps> = ({ team, setTeam, user }) => {
  const { instance } = useMsal();
  const [newMember, setNewMember] = useState({
    name: '',
    email: '',
    capacity: 40,
    role: 'user' as 'admin' | 'user'
  });
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [rolesPermissions, setRolesPermissions] = useState<RolesPermissions | null>(null);
  const [userPermissions, setUserPermissions] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';

  const getAuthHeaders = async () => {
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    try {
      const response = await instance.acquireTokenSilent({
        scopes: ['User.Read'],
        account: user.account
      });

      return {
        'Authorization': `Bearer ${response.accessToken}`,
        'x-user-email': user.email,
        'x-user-name': user.name
      };
    } catch (error) {
      console.error('Error getting auth headers:', error);
      throw error;
    }
  };

  useEffect(() => {
    if (user) {
      fetchRolesAndPermissions();
      fetchUserPermissions();
    }
  }, [user]);

  const fetchRolesAndPermissions = async () => {
    try {
      const headers = await getAuthHeaders();
      const response = await axios.get(`${backendUrl}/api/roles-permissions`, { headers });
      setRolesPermissions(response.data);
    } catch (error) {
      console.error('Error fetching roles and permissions:', error);
    }
  };

  const fetchUserPermissions = async () => {
    try {
      const headers = await getAuthHeaders();
      const response = await axios.get(`${backendUrl}/api/user/permissions`, { headers });
      setUserPermissions(response.data);
    } catch (error) {
      console.error('Error fetching user permissions:', error);
    }
  };

  const handleAddMember = async () => {
    if (!newMember.name.trim() || !newMember.email.trim()) {
      setError('Name and email are required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const headers = await getAuthHeaders();
      const response = await axios.post(`${backendUrl}/api/team`, newMember, { headers });
      setTeam(response.data);
      setNewMember({ name: '', email: '', capacity: 40, role: 'user' });
    } catch (error: any) {
      setError(error.response?.data?.error || 'Failed to add team member');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateMember = async (member: TeamMember) => {
    setLoading(true);
    setError(null);

    try {
      const headers = await getAuthHeaders();
      const response = await axios.post(`${backendUrl}/api/team`, member, { headers });
      setTeam(response.data);
      setEditingMember(null);
    } catch (error: any) {
      setError(error.response?.data?.error || 'Failed to update team member');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMember = async (name: string) => {
    if (!window.confirm(`Are you sure you want to delete ${name}?`)) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const headers = await getAuthHeaders();
      const response = await axios.delete(`${backendUrl}/api/team/${encodeURIComponent(name)}`, { headers });
      setTeam(response.data);
    } catch (error: any) {
      setError(error.response?.data?.error || 'Failed to delete team member');
    } finally {
      setLoading(false);
    }
  };

  const toggleModuleAccess = (member: TeamMember, module: string) => {
    const updatedPermissions = { ...member.permissions || { modules: [], subcategories: [] } };
    if (updatedPermissions.modules.includes(module)) {
      updatedPermissions.modules = updatedPermissions.modules.filter(m => m !== module);
      // Also remove related subcategories
      updatedPermissions.subcategories = updatedPermissions.subcategories.filter(s => !s.startsWith(module));
    } else {
      updatedPermissions.modules.push(module);
      // Add default subcategories for this module
      if (rolesPermissions) {
        const moduleSubcategories = Object.values(rolesPermissions.subcategories)
          .filter(s => s.startsWith(module));
        moduleSubcategories.forEach(subcategory => {
          if (!updatedPermissions.subcategories.includes(subcategory)) {
            updatedPermissions.subcategories.push(subcategory);
          }
        });
      }
    }

    const updatedMember = { ...member, permissions: updatedPermissions };
    handleUpdateMember(updatedMember);
  };

  const toggleSubcategoryAccess = (member: TeamMember, subcategory: string) => {
    const updatedPermissions = { ...member.permissions || { modules: [], subcategories: [] } };
    if (updatedPermissions.subcategories.includes(subcategory)) {
      updatedPermissions.subcategories = updatedPermissions.subcategories.filter(s => s !== subcategory);
    } else {
      updatedPermissions.subcategories.push(subcategory);
    }

    const updatedMember = { ...member, permissions: updatedPermissions };
    handleUpdateMember(updatedMember);
  };

  const getModuleDisplayName = (moduleKey: string) => {
    switch (moduleKey) {
      case 'team_settings': return 'Team Settings';
      case 'content_approval': return 'Content Approval';
      case 'monday_data': return 'Monday.com Data';
      default: return moduleKey;
    }
  };

  const getSubcategoryDisplayName = (subcategoryKey: string) => {
    const parts = subcategoryKey.split('.');
    const action = parts[1]?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    return action || subcategoryKey;
  };

  if (!user) {
    return <div>Please log in to access team settings.</div>;
  }

  if (!userPermissions) {
    return <div>Loading permissions...</div>;
  }

  if (!userPermissions.subcategoryAccess.canViewUsers) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p>You don't have permission to view team settings.</p>
      </div>
    );
  }

  const canManageUsers = userPermissions.subcategoryAccess.canManageUsers;

  return (
    <div style={{ padding: '20px' }}>
      <h2>Enhanced Team Management</h2>
      
      {error && (
        <div style={{ 
          background: '#ffebee', 
          border: '1px solid #f44336', 
          padding: '10px', 
          borderRadius: '4px',
          marginBottom: '20px',
          color: '#c62828'
        }}>
          {error}
        </div>
      )}

      {canManageUsers && (
        <div style={{ 
          marginBottom: '30px', 
          padding: '20px', 
          border: '1px solid #ddd', 
          borderRadius: '8px',
          backgroundColor: '#f9f9f9'
        }}>
          <h3>Add New Team Member</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px 100px auto', gap: '10px', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Name"
              value={newMember.name}
              onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
              style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
            />
            <input
              type="email"
              placeholder="Email"
              value={newMember.email}
              onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
              style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
            />
            <input
              type="number"
              placeholder="Capacity"
              min="1"
              value={newMember.capacity}
              onChange={(e) => setNewMember({ ...newMember, capacity: Number(e.target.value) })}
              style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
            />
            <select
              value={newMember.role}
              onChange={(e) => setNewMember({ ...newMember, role: e.target.value as 'admin' | 'user' })}
              style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
            <button 
              onClick={handleAddMember}
              disabled={loading}
              style={{ 
                padding: '8px 16px', 
                backgroundColor: '#4caf50', 
                color: 'white', 
                border: 'none', 
                borderRadius: '4px',
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? 'Adding...' : 'Add Member'}
            </button>
          </div>
        </div>
      )}

      <div>
        <h3>Team Members</h3>
        {team.map((member) => (
          <div key={member.name} style={{ 
            marginBottom: '20px', 
            padding: '20px', 
            border: '1px solid #ddd', 
            borderRadius: '8px',
            backgroundColor: '#ffffff'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <div>
                <h4 style={{ margin: '0 0 5px 0' }}>{member.name}</h4>
                <p style={{ margin: '0', color: '#666', fontSize: '14px' }}>
                  {member.email || 'No email'} • {member.capacity} hrs/week • {(member.role || 'user').toUpperCase()}
                </p>
              </div>
              {canManageUsers && (
                <div>
                  <button 
                    onClick={() => setEditingMember(member)}
                    style={{ 
                      padding: '6px 12px', 
                      backgroundColor: '#2196f3', 
                      color: 'white', 
                      border: 'none', 
                      borderRadius: '4px',
                      marginRight: '10px',
                      cursor: 'pointer'
                    }}
                  >
                    Edit
                  </button>
                  <button 
                    onClick={() => handleDeleteMember(member.name)}
                    style={{ 
                      padding: '6px 12px', 
                      backgroundColor: '#f44336', 
                      color: 'white', 
                      border: 'none', 
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>

            {/* Module Permissions */}
            <div style={{ marginBottom: '15px' }}>
              <h5 style={{ margin: '0 0 10px 0' }}>Module Access</h5>
              <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                {rolesPermissions && Object.entries(rolesPermissions.modules).map(([key, value]) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', cursor: canManageUsers ? 'pointer' : 'default' }}>
                    <input
                      type="checkbox"
                      checked={member.permissions?.modules?.includes(value) || false}
                      onChange={() => canManageUsers && toggleModuleAccess(member, value)}
                      disabled={!canManageUsers}
                      style={{ marginRight: '5px' }}
                    />
                    {getModuleDisplayName(value)}
                  </label>
                ))}
              </div>
            </div>

            {/* Subcategory Permissions */}
            <div>
              <h5 style={{ margin: '0 0 10px 0' }}>Feature Access</h5>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                {rolesPermissions && Object.entries(rolesPermissions.subcategories).map(([key, value]) => {
                  const modulePrefix = value.split('.')[0];
                  if (!member.permissions?.modules?.includes(modulePrefix)) return null;
                  
                  return (
                    <label key={key} style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      fontSize: '14px',
                      cursor: canManageUsers ? 'pointer' : 'default'
                    }}>
                      <input
                        type="checkbox"
                        checked={member.permissions?.subcategories?.includes(value) || false}
                        onChange={() => canManageUsers && toggleSubcategoryAccess(member, value)}
                        disabled={!canManageUsers}
                        style={{ marginRight: '5px' }}
                      />
                      {getSubcategoryDisplayName(value)}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Edit Member Modal */}
      {editingMember && canManageUsers && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '30px',
            borderRadius: '8px',
            width: '500px',
            maxHeight: '80vh',
            overflow: 'auto'
          }}>
            <h3>Edit Team Member</h3>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>Name:</label>
              <input
                type="text"
                value={editingMember.name}
                onChange={(e) => setEditingMember({ ...editingMember, name: e.target.value })}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
              />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>Email:</label>
              <input
                type="email"
                value={editingMember.email}
                onChange={(e) => setEditingMember({ ...editingMember, email: e.target.value })}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
              />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>Capacity (hours/week):</label>
              <input
                type="number"
                min="1"
                value={editingMember.capacity}
                onChange={(e) => setEditingMember({ ...editingMember, capacity: Number(e.target.value) })}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
              />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>Role:</label>
              <select
                value={editingMember.role}
                onChange={(e) => setEditingMember({ ...editingMember, role: e.target.value as 'admin' | 'user' })}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setEditingMember(null)}
                style={{ 
                  padding: '8px 16px', 
                  backgroundColor: '#6c757d', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button 
                onClick={() => handleUpdateMember(editingMember)}
                disabled={loading}
                style={{ 
                  padding: '8px 16px', 
                  backgroundColor: '#4caf50', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnhancedCapacityManager;