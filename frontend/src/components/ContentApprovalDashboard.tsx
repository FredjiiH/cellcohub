import React, { useState, useEffect } from 'react';
import { useMsal } from '@azure/msal-react';
import axios from 'axios';

interface ServiceStatus {
  initialized: boolean;
  fileMonitor: {
    running: boolean;
    intervalMinutes: number;
  };
  statusRouter: {
    running: boolean;
    intervalMinutes: number;
  };
}

interface ProcessingLog {
  _id: string;
  fileId: string;
  fileName: string;
  action: string;
  status: string;
  details: string;
  timestamp: string;
  retryCount: number;
}

interface ProcessingStat {
  _id: {
    action: string;
    status: string;
  };
  count: number;
  lastProcessed: string;
}

interface HealthCheck {
  status: string;
  services?: ServiceStatus;
  recentStats?: ProcessingStat[];
  recentErrors?: number;
  timestamp: string;
  error?: string;
}

interface ContentApprovalDashboardProps {
  user?: {
    name: string;
    email: string;
    account: any;
  } | null;
}

const ContentApprovalDashboard: React.FC<ContentApprovalDashboardProps> = ({ user }) => {
  const { instance } = useMsal();
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(null);
  const [health, setHealth] = useState<HealthCheck | null>(null);
  const [processingLogs, setProcessingLogs] = useState<ProcessingLog[]>([]);
  const [stats, setStats] = useState<ProcessingStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';

  const getAuthHeaders = async () => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    try {
      const response = await instance.acquireTokenSilent({
        scopes: ['User.Read', 'Sites.ReadWrite.All', 'Files.ReadWrite.All'],
        account: user.account
      });

      return {
        'Authorization': `Bearer ${response.accessToken}`,
        'x-user-email': user.email,
        'x-user-name': user.name
      };
    } catch (error: any) {
      // If silent acquisition fails, try interactive authentication
      if (error.name === 'InteractionRequiredAuthError') {
        console.log('Consent required for SharePoint permissions, triggering interactive auth...');
        try {
          const response = await instance.acquireTokenPopup({
            scopes: ['User.Read', 'Sites.ReadWrite.All', 'Files.ReadWrite.All'],
            account: user.account
          });

          return {
            'Authorization': `Bearer ${response.accessToken}`,
            'x-user-email': user.email,
            'x-user-name': user.name
          };
        } catch (popupError) {
          console.error('Interactive authentication failed:', popupError);
          throw new Error('SharePoint permissions required. Please grant consent when prompted.');
        }
      }
      console.error('Error getting auth headers:', error);
      throw error;
    }
  };

  const fetchData = async () => {
    if (!user) {
      setError('User not authenticated');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const headers = await getAuthHeaders();

      const [statusRes, healthRes, logsRes, statsRes] = await Promise.all([
        axios.get(`${backendUrl}/api/content-approval/status`, { headers }),
        axios.get(`${backendUrl}/api/content-approval/health`, { headers }),
        axios.get(`${backendUrl}/api/content-approval/logs/processing?limit=20`, { headers }),
        axios.get(`${backendUrl}/api/content-approval/stats`, { headers })
      ]);

      setServiceStatus(statusRes.data);
      setHealth(healthRes.data);
      setProcessingLogs(logsRes.data);
      setStats(statsRes.data);
    } catch (err: any) {
      console.error('Error fetching data:', err);
      setError(err.response?.data?.error || err.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const startServices = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const headers = await getAuthHeaders();
      await axios.post(`${backendUrl}/api/content-approval/start`, {}, { headers });
      await fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to start services');
    } finally {
      setLoading(false);
    }
  };

  const stopServices = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const headers = await getAuthHeaders();
      await axios.post(`${backendUrl}/api/content-approval/stop`, {}, { headers });
      await fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to stop services');
    } finally {
      setLoading(false);
    }
  };

  const restartServices = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const headers = await getAuthHeaders();
      await axios.post(`${backendUrl}/api/content-approval/restart`, {}, { headers });
      await fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to restart services');
    } finally {
      setLoading(false);
    }
  };

  const triggerFileCheck = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const headers = await getAuthHeaders();
      await axios.post(`${backendUrl}/api/content-approval/trigger/file-check`, {}, { headers });
      setTimeout(fetchData, 2000); // Refresh after 2 seconds
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to trigger file check');
    } finally {
      setLoading(false);
    }
  };

  const triggerStatusCheck = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const headers = await getAuthHeaders();
      await axios.post(`${backendUrl}/api/content-approval/trigger/status-check`, {}, { headers });
      setTimeout(fetchData, 2000); // Refresh after 2 seconds
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to trigger status check');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchData();
      const interval = setInterval(fetchData, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [user]);

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const getStatusBadge = (status: string) => {
    const className = status === 'success' ? 'badge-success' : 
                     status === 'error' ? 'badge-error' : 'badge-warning';
    return <span className={`badge ${className}`}>{status}</span>;
  };

  const getHealthBadge = () => {
    if (!health) return <span className="badge badge-warning">Unknown</span>;
    
    const className = health.status === 'healthy' ? 'badge-success' : 'badge-error';
    return <span className={`badge ${className}`}>{health.status}</span>;
  };

  return (
    <div className="content-approval-dashboard">
      <h2>Content Approval Automation</h2>
      
      {error && (
        <div className="error-message" style={{ 
          background: '#ffebee', 
          border: '1px solid #f44336', 
          padding: '15px', 
          borderRadius: '4px',
          marginBottom: '20px',
          color: '#c62828'
        }}>
          <strong>Error:</strong> {error}
          {error.includes('SharePoint permissions') && (
            <div style={{ marginTop: '10px', fontSize: '14px' }}>
              <strong>What to do:</strong>
              <ol style={{ marginTop: '5px', paddingLeft: '20px' }}>
                <li>A popup should appear asking for SharePoint permissions</li>
                <li>Click "Accept" to grant access to SharePoint files</li>
                <li>If no popup appears, allow popups for this site</li>
                <li>Try clicking "Start Services" again after granting consent</li>
              </ol>
            </div>
          )}
        </div>
      )}

      {/* Service Controls */}
      <div className="service-controls" style={{ marginBottom: '30px' }}>
        <h3>Service Controls</h3>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <button 
            onClick={startServices} 
            disabled={loading || serviceStatus?.fileMonitor.running}
            style={{ 
              padding: '8px 16px', 
              backgroundColor: '#4caf50', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading || serviceStatus?.fileMonitor.running ? 0.6 : 1
            }}
          >
            Start Services
          </button>
          <button 
            onClick={stopServices} 
            disabled={loading || !serviceStatus?.fileMonitor.running}
            style={{ 
              padding: '8px 16px', 
              backgroundColor: '#f44336', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading || !serviceStatus?.fileMonitor.running ? 0.6 : 1
            }}
          >
            Stop Services
          </button>
          <button 
            onClick={restartServices} 
            disabled={loading}
            style={{ 
              padding: '8px 16px', 
              backgroundColor: '#ff9800', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1
            }}
          >
            Restart Services
          </button>
          <button 
            onClick={fetchData} 
            disabled={loading}
            style={{ 
              padding: '8px 16px', 
              backgroundColor: '#2196f3', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Manual Triggers */}
      <div className="manual-triggers" style={{ marginBottom: '30px' }}>
        <h3>Manual Triggers</h3>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            onClick={triggerFileCheck} 
            disabled={loading}
            style={{ 
              padding: '8px 16px', 
              backgroundColor: '#607d8b', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1
            }}
          >
            Trigger File Check
          </button>
          <button 
            onClick={triggerStatusCheck} 
            disabled={loading}
            style={{ 
              padding: '8px 16px', 
              backgroundColor: '#607d8b', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1
            }}
          >
            Trigger Status Check
          </button>
        </div>
      </div>

      {/* Service Status */}
      {serviceStatus && (
        <div className="service-status" style={{ marginBottom: '30px' }}>
          <h3>Service Status {getHealthBadge()}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '4px' }}>
              <h4>File Monitor Service</h4>
              <p>Status: <strong>{serviceStatus.fileMonitor.running ? '🟢 Running' : '🔴 Stopped'}</strong></p>
              <p>Check Interval: {serviceStatus.fileMonitor.intervalMinutes} minutes</p>
            </div>
            <div style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '4px' }}>
              <h4>Status Router Service</h4>
              <p>Status: <strong>{serviceStatus.statusRouter.running ? '🟢 Running' : '🔴 Stopped'}</strong></p>
              <p>Check Interval: {serviceStatus.statusRouter.intervalMinutes} minutes</p>
            </div>
          </div>
        </div>
      )}

      {/* Processing Stats */}
      {stats.length > 0 && (
        <div className="processing-stats" style={{ marginBottom: '30px' }}>
          <h3>Processing Statistics</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #ddd' }}>
            <thead>
              <tr style={{ backgroundColor: '#f5f5f5' }}>
                <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ddd' }}>Action</th>
                <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ddd' }}>Status</th>
                <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ddd' }}>Count</th>
                <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ddd' }}>Last Processed</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((stat, index) => (
                <tr key={index}>
                  <td style={{ padding: '10px', border: '1px solid #ddd' }}>{stat._id.action}</td>
                  <td style={{ padding: '10px', border: '1px solid #ddd' }}>{getStatusBadge(stat._id.status)}</td>
                  <td style={{ padding: '10px', border: '1px solid #ddd' }}>{stat.count}</td>
                  <td style={{ padding: '10px', border: '1px solid #ddd' }}>{formatTimestamp(stat.lastProcessed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent Processing Logs */}
      {processingLogs.length > 0 && (
        <div className="processing-logs">
          <h3>Recent Processing Logs (Last 20)</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #ddd' }}>
            <thead>
              <tr style={{ backgroundColor: '#f5f5f5' }}>
                <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ddd' }}>Timestamp</th>
                <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ddd' }}>File Name</th>
                <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ddd' }}>Action</th>
                <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ddd' }}>Status</th>
                <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ddd' }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {processingLogs.map((log) => (
                <tr key={log._id}>
                  <td style={{ padding: '10px', border: '1px solid #ddd', fontSize: '12px' }}>
                    {formatTimestamp(log.timestamp)}
                  </td>
                  <td style={{ padding: '10px', border: '1px solid #ddd' }}>{log.fileName}</td>
                  <td style={{ padding: '10px', border: '1px solid #ddd' }}>{log.action}</td>
                  <td style={{ padding: '10px', border: '1px solid #ddd' }}>{getStatusBadge(log.status)}</td>
                  <td style={{ padding: '10px', border: '1px solid #ddd', fontSize: '12px' }}>{log.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style dangerouslySetInnerHTML={{
        __html: `
          .badge {
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
          }
          .badge-success {
            background-color: #4caf50;
            color: white;
          }
          .badge-error {
            background-color: #f44336;
            color: white;
          }
          .badge-warning {
            background-color: #ff9800;
            color: white;
          }
        `
      }} />
    </div>
  );
};

export default ContentApprovalDashboard;