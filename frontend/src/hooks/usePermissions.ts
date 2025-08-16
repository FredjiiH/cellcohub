import { useState, useEffect } from 'react';
import { useMsal } from '@azure/msal-react';
import axios from 'axios';

interface UserPermissions {
  user: {
    name: string;
    email: string;
    capacity: number;
    role: 'admin' | 'user';
    permissions: {
      modules: string[];
      subcategories: string[];
    };
  };
  hasAccess: {
    teamSettings: boolean;
    contentApproval: boolean;
    mondayData: boolean;
  };
  subcategoryAccess: {
    canManageUsers: boolean;
    canViewUsers: boolean;
    canManageContentServices: boolean;
    canViewContentLogs: boolean;
    canUseMondayDashboard: boolean;
    canManageCapacity: boolean;
    canViewAnalytics: boolean;
    canUseBoardInspector: boolean;
  };
}

interface User {
  name: string;
  email: string;
  account: any;
}

export const usePermissions = (user: User | null) => {
  const { instance } = useMsal();
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';

  const getAuthHeaders = async () => {
    if (!user) throw new Error('User not authenticated');
    
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

  const fetchPermissions = async () => {
    if (!user) {
      setPermissions(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const headers = await getAuthHeaders();
      const response = await axios.get(`${backendUrl}/api/user/permissions`, { headers });
      setPermissions(response.data);
    } catch (err: any) {
      console.error('Error fetching permissions:', err);
      setError(err.response?.data?.error || 'Failed to fetch permissions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPermissions();
  }, [user]);

  const hasModuleAccess = (module: keyof UserPermissions['hasAccess']) => {
    return permissions?.hasAccess[module] || false;
  };

  const hasSubcategoryAccess = (subcategory: keyof UserPermissions['subcategoryAccess']) => {
    return permissions?.subcategoryAccess[subcategory] || false;
  };

  const isAdmin = () => {
    return permissions?.user.role === 'admin';
  };

  const refetch = () => {
    fetchPermissions();
  };

  return {
    permissions,
    loading,
    error,
    hasModuleAccess,
    hasSubcategoryAccess,
    isAdmin,
    refetch
  };
};