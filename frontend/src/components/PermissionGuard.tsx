import React from 'react';
import { usePermissions } from '../hooks/usePermissions';

interface User {
  name: string;
  email: string;
  account: any;
}

interface PermissionGuardProps {
  user: User | null;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  requireModule?: 'teamSettings' | 'contentApproval' | 'mondayData';
  requireSubcategory?: 
    | 'canManageUsers' 
    | 'canViewUsers'
    | 'canManageContentServices'
    | 'canViewContentLogs'
    | 'canUseMondayDashboard'
    | 'canManageCapacity'
    | 'canViewAnalytics'
    | 'canUseBoardInspector';
  requireAdmin?: boolean;
  silent?: boolean; // When true, just returns null instead of showing permission message
}

const PermissionGuard: React.FC<PermissionGuardProps> = ({
  user,
  children,
  fallback = null,
  requireModule,
  requireSubcategory,
  requireAdmin = false,
  silent = false
}) => {
  const { permissions, loading, hasModuleAccess, hasSubcategoryAccess, isAdmin } = usePermissions(user);

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        padding: '20px' 
      }}>
        <div>Loading permissions...</div>
      </div>
    );
  }

  if (!permissions || !user) {
    if (silent) return null;
    
    return (
      <div style={{ 
        padding: '20px', 
        textAlign: 'center', 
        backgroundColor: '#fff3cd',
        border: '1px solid #ffeaa7',
        borderRadius: '4px',
        color: '#856404'
      }}>
        <p>Authentication required to access this feature.</p>
      </div>
    );
  }

  // Check admin requirement
  if (requireAdmin && !isAdmin()) {
    if (silent) return null;
    
    return (
      <div style={{ 
        padding: '20px', 
        textAlign: 'center', 
        backgroundColor: '#f8d7da',
        border: '1px solid #f5c6cb',
        borderRadius: '4px',
        color: '#721c24'
      }}>
        <p>Administrator access required for this feature.</p>
      </div>
    );
  }

  // Check module access requirement
  if (requireModule && !hasModuleAccess(requireModule)) {
    if (silent) return null;
    
    return (
      <div style={{ 
        padding: '20px', 
        textAlign: 'center', 
        backgroundColor: '#f8d7da',
        border: '1px solid #f5c6cb',
        borderRadius: '4px',
        color: '#721c24'
      }}>
        <p>You don't have access to this module.</p>
        <p style={{ fontSize: '14px', marginTop: '10px' }}>
          Contact an administrator to request access.
        </p>
      </div>
    );
  }

  // Check subcategory access requirement
  if (requireSubcategory && !hasSubcategoryAccess(requireSubcategory)) {
    if (silent) return null;
    
    return (
      <div style={{ 
        padding: '20px', 
        textAlign: 'center', 
        backgroundColor: '#f8d7da',
        border: '1px solid #f5c6cb',
        borderRadius: '4px',
        color: '#721c24'
      }}>
        <p>You don't have permission to access this feature.</p>
        <p style={{ fontSize: '14px', marginTop: '10px' }}>
          Contact an administrator to request access.
        </p>
      </div>
    );
  }

  // If all checks pass, render children
  return <>{children}</>;
};

export default PermissionGuard;