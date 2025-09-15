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
  
  // Archive functionality state
  const [sprintName, setSprintName] = useState('');
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveResult, setArchiveResult] = useState<any>(null);

  // Web page review functionality state
  const [webPageReviewLoading, setWebPageReviewLoading] = useState(false);
  const [webPageReviewResult, setWebPageReviewResult] = useState<any>(null);

  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';

  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const getAuthHeaders = async () => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    if (isAuthenticating) {
      throw new Error('Authentication already in progress. Please wait...');
    }

    try {
      const response = await instance.acquireTokenSilent({
        scopes: ['User.Read', 'Sites.ReadWrite.All', 'Files.ReadWrite.All'],
        account: user.account,
        forceRefresh: true // Force refresh to get new scopes
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
          setIsAuthenticating(true);
          
          const response = await instance.acquireTokenPopup({
            scopes: ['User.Read', 'Sites.ReadWrite.All', 'Files.ReadWrite.All'],
            account: user.account
          });

          return {
            'Authorization': `Bearer ${response.accessToken}`,
            'x-user-email': user.email,
            'x-user-name': user.name
          };
        } catch (popupError: any) {
          console.error('Interactive authentication failed:', popupError);
          if (popupError.name === 'BrowserAuthError' && popupError.message.includes('interaction_in_progress')) {
            throw new Error('Authentication popup blocked or already in progress. Please refresh page and try again.');
          }
          if (popupError.message?.includes('admin')) {
            throw new Error('Admin consent required. Please ask your administrator to approve SharePoint permissions for this application.');
          }
          throw new Error('SharePoint permissions required. Please grant consent when prompted.');
        } finally {
          setIsAuthenticating(false);
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
      console.log('🚀 Starting content approval services...');
      
      console.log('📝 Getting auth headers...');
      const headers = await getAuthHeaders();
      console.log('✅ Auth headers obtained successfully');
      
      console.log('📤 Making POST request to start services...');
      const response = await axios.post(`${backendUrl}/api/content-approval/start`, {}, { headers });
      console.log('✅ Start services response:', response.data);
      
      console.log('🔄 Refreshing dashboard data...');
      await fetchData();
      console.log('✅ Services started successfully!');
    } catch (err: any) {
      console.error('❌ Error in startServices:', err);
      if (err.name === 'Error' && err.message.includes('Authentication')) {
        setError('Authentication required. Please refresh the page and grant consent when prompted.');
      } else {
        setError(err.response?.data?.error || err.message || 'Failed to start services');
      }
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

  const testSharePointPermissions = async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);
      console.log('🔍 Testing SharePoint permissions...');
      
      const headers = await getAuthHeaders();
      const response = await axios.post(`${backendUrl}/test/sharepoint-permissions`, {}, { headers });
      
      console.log('✅ SharePoint permissions test results:', response.data);
      
      // Show detailed results in console and as error message for now
      const { tests, summary } = response.data;
      const failedTests = tests.filter((t: any) => t.status === 'failed');
      
      if (failedTests.length === 0) {
        setError(`All tests passed! (${summary.passed}/${summary.total})`);
      } else {
        const errorDetails = failedTests.map((t: any) => `${t.name}: ${t.error}`).join('\n');
        setError(`Tests failed (${summary.failed}/${summary.total}):\n${errorDetails}`);
      }
    } catch (err: any) {
      console.error('❌ SharePoint permissions test failed:', err);
      setError(err.response?.data?.error || 'Failed to test SharePoint permissions');
    } finally {
      setLoading(false);
    }
  };

  const archiveContent = async () => {
    if (!user) return;
    if (!sprintName.trim()) {
      setError('Sprint name is required for archiving');
      return;
    }
    
    try {
      setArchiveLoading(true);
      setError(null);
      setArchiveResult(null);
      
      console.log(`🗃️ Starting archive process for sprint: ${sprintName}`);
      
      const headers = await getAuthHeaders();
      const response = await axios.post(`${backendUrl}/api/content-approval/archive`, 
        { sprintName: sprintName.trim() }, 
        { headers }
      );
      
      console.log('✅ Archive process completed:', response.data);
      setArchiveResult(response.data.results);
      
      // Clear the sprint name on success
      setSprintName('');
      
    } catch (err: any) {
      console.error('❌ Archive process failed:', err);
      setError(err.response?.data?.details || err.response?.data?.error || 'Archive process failed');
    } finally {
      setArchiveLoading(false);
    }
  };

  const handleWebPageReview = async () => {
    if (!user) {
      setError('You must be logged in to process web page reviews');
      return;
    }
    
    try {
      setWebPageReviewLoading(true);
      setError(null);
      setWebPageReviewResult(null);
      
      console.log('🌐 Starting web page review process...');
      
      const headers = await getAuthHeaders();
      const response = await axios.post(`${backendUrl}/api/content-approval/process-web-pages`, 
        {},
        { headers }
      );
      
      console.log('✅ Web page review process completed:', response.data);
      setWebPageReviewResult(response.data.results);
      
    } catch (err: any) {
      console.error('❌ Web page review process failed:', err);
      setError(err.response?.data?.details || err.response?.data?.error || 'Web page review process failed');
    } finally {
      setWebPageReviewLoading(false);
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
          {error.includes('Admin consent required') && (
            <div style={{ marginTop: '10px', fontSize: '14px' }}>
              <strong>Admin Consent Required:</strong>
              <ol style={{ marginTop: '5px', paddingLeft: '20px' }}>
                <li>Your organization requires administrator approval for SharePoint access</li>
                <li>Ask your IT administrator to grant consent for these permissions:
                  <ul style={{ marginLeft: '15px', marginTop: '5px' }}>
                    <li><code>Sites.ReadWrite.All</code> (delegated)</li>
                    <li><code>Files.ReadWrite.All</code> (delegated)</li>
                  </ul>
                </li>
                <li>They can do this in Azure Portal → App registrations → [Your App] → API permissions → "Grant admin consent"</li>
                <li>Once approved, refresh this page and try again</li>
              </ol>
            </div>
          )}
          {error.includes('SharePoint permissions') && !error.includes('Admin consent') && (
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
          {error.includes('Authentication already in progress') && (
            <div style={{ marginTop: '10px', fontSize: '14px' }}>
              <strong>Authentication Conflict:</strong>
              <ol style={{ marginTop: '5px', paddingLeft: '20px' }}>
                <li>Refresh the page to clear the authentication state</li>
                <li>Wait a moment before trying again</li>
                <li>Make sure no authentication popups are open in other tabs</li>
              </ol>
            </div>
          )}
        </div>
      )}

      {/* Service Controls */}
      <div className="service-controls" style={{ marginBottom: '30px' }}>
        <h3>Service Controls</h3>
        <div className="control-buttons" style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
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

      {/* Web Page Review Functionality */}
      <div className="web-page-review-section" style={{ marginBottom: '30px' }}>
        <h3>Web Page Review Processing</h3>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '15px', 
          flexWrap: 'wrap',
          backgroundColor: '#f9f9f9',
          padding: '15px',
          borderRadius: '4px',
          border: '1px solid #e0e0e0'
        }}>
          <button
            onClick={handleWebPageReview}
            disabled={webPageReviewLoading}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              backgroundColor: webPageReviewLoading ? '#ccc' : '#17a2b8',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: webPageReviewLoading ? 'not-allowed' : 'pointer'
            }}
          >
            {webPageReviewLoading ? '🌐 Processing Web Pages...' : '🌐 Process Web Page Reviews'}
          </button>
        </div>
        
        <div style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
          <strong>Process Description:</strong> Reads web pages from "Web pages Ready to Review.xlsx", 
          scrapes content from each URL, and creates Word documents in the "Files Ready to Review" folder 
          for manual review and commenting.
        </div>

        {webPageReviewResult && (
          <div style={{ 
            marginTop: '15px', 
            padding: '15px', 
            backgroundColor: webPageReviewResult.errors?.length > 0 ? '#fff3cd' : '#d4edda', 
            border: `1px solid ${webPageReviewResult.errors?.length > 0 ? '#ffc107' : '#28a745'}`,
            borderRadius: '4px'
          }}>
            <h4>Web Page Review Results</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px', marginTop: '10px' }}>
              <div>
                <strong>Pages Processed:</strong> {webPageReviewResult.processed}
              </div>
              {webPageReviewResult.errors?.length > 0 && (
                <div>
                  <strong>Errors:</strong> {webPageReviewResult.errors.length}
                  <ul style={{ marginTop: '5px' }}>
                    {webPageReviewResult.errors.map((err: any, index: number) => (
                      <li key={index} style={{ color: '#dc3545' }}>
                        {err.url}: {err.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {webPageReviewResult.files?.length > 0 && (
                <div>
                  <strong>Files Created:</strong>
                  <ul style={{ marginTop: '5px' }}>
                    {webPageReviewResult.files.map((file: any, index: number) => (
                      <li key={index} style={{ color: '#28a745' }}>
                        {file.fileName} (from {file.url})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Manual Triggers */}
      <div className="manual-triggers" style={{ marginBottom: '30px' }}>
        <h3>Manual Triggers & Diagnostics</h3>
        <div className="trigger-buttons" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
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
          <button 
            onClick={testSharePointPermissions} 
            disabled={loading}
            style={{ 
              padding: '8px 16px', 
              backgroundColor: '#9c27b0', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1
            }}
          >
            Test SharePoint Permissions
          </button>
        </div>
      </div>

      {/* Archive Functionality */}
      <div className="archive-section" style={{ marginBottom: '30px' }}>
        <h3>Archive Content</h3>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '15px', 
          flexWrap: 'wrap',
          border: '1px solid #ddd',
          padding: '15px',
          borderRadius: '4px',
          backgroundColor: '#f9f9f9'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label htmlFor="sprintName" style={{ fontWeight: 'bold', fontSize: '14px' }}>
              Sprint Name:
            </label>
            <input
              id="sprintName"
              type="text"
              value={sprintName}
              onChange={(e) => setSprintName(e.target.value)}
              placeholder="Enter sprint name (e.g., 2024-Q4)"
              disabled={archiveLoading}
              style={{
                padding: '8px 12px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                fontSize: '14px',
                minWidth: '200px'
              }}
            />
          </div>
          <button 
            onClick={archiveContent} 
            disabled={archiveLoading || !sprintName.trim()}
            style={{ 
              padding: '8px 16px', 
              backgroundColor: archiveLoading ? '#ccc' : '#ff5722', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px',
              cursor: (archiveLoading || !sprintName.trim()) ? 'not-allowed' : 'pointer',
              opacity: (archiveLoading || !sprintName.trim()) ? 0.6 : 1,
              minHeight: '36px'
            }}
          >
            {archiveLoading ? '🗃️ Archiving...' : '🗃️ Archive Content'}
          </button>
        </div>
        
        <div style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
          <strong>Archive Process:</strong> Moves "Fast track" rows from Step1 Review and ALL rows from MCL Review to the archive sheet, 
          copies files to Archives/{sprintName}/ folder, and updates file URLs.
        </div>

        {archiveResult && (
          <div style={{ 
            marginTop: '15px', 
            padding: '15px', 
            backgroundColor: '#e8f5e8', 
            border: '1px solid #4caf50',
            borderRadius: '4px'
          }}>
            <h4>Archive Results for Sprint: {archiveResult.sprintName}</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
              <div>
                <strong>Step1_Review:</strong> {archiveResult.step1Rows.processed} rows archived
              </div>
              <div>
                <strong>MCL_Review:</strong> {archiveResult.mclRows.processed} rows archived
              </div>
              <div>
                <strong>Files Processed:</strong> {archiveResult.filesProcessed}
              </div>
              <div>
                <strong>File Errors:</strong> {archiveResult.filesErrors.length}
              </div>
            </div>
            
            {archiveResult.filesErrors.length > 0 && (
              <div style={{ marginTop: '10px' }}>
                <strong>File Errors:</strong>
                <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                  {archiveResult.filesErrors.map((error: any, index: number) => (
                    <li key={index}>{error.fileName}: {error.error}</li>
                  ))}
                </ul>
              </div>
            )}
            
            <pre style={{ 
              marginTop: '15px', 
              fontSize: '12px', 
              backgroundColor: '#f5f5f5', 
              padding: '10px', 
              borderRadius: '4px',
              whiteSpace: 'pre-wrap' 
            }}>
              {archiveResult.summary}
            </pre>
          </div>
        )}
      </div>

      {/* Service Status */}
      {serviceStatus && (
        <div className="service-status" style={{ marginBottom: '30px' }}>
          <h3>Service Status {getHealthBadge()}</h3>
          <div className="status-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
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
          <table className="stats-table" style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #ddd' }}>
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
          <table className="logs-table" style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #ddd' }}>
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
                  <td data-label="Timestamp" style={{ padding: '10px', border: '1px solid #ddd', fontSize: '12px' }}>
                    {formatTimestamp(log.timestamp)}
                  </td>
                  <td data-label="File Name" style={{ padding: '10px', border: '1px solid #ddd' }}>{log.fileName}</td>
                  <td data-label="Action" style={{ padding: '10px', border: '1px solid #ddd' }}>{log.action}</td>
                  <td data-label="Status" style={{ padding: '10px', border: '1px solid #ddd' }}>{getStatusBadge(log.status)}</td>
                  <td data-label="Details" style={{ padding: '10px', border: '1px solid #ddd', fontSize: '12px' }}>{log.details}</td>
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