import React, { useState } from 'react';
import { Task } from '../api/monday';

interface UnassignedTasksModuleProps {
  tasks: Task[];
  selectedGroup: string;
}

const UnassignedTasksModule: React.FC<UnassignedTasksModuleProps> = ({ tasks, selectedGroup }) => {
  const [expandedCategories, setExpandedCategories] = useState<{
    unassigned: boolean;
    noEffort: boolean;
    both: boolean;
  }>({
    unassigned: false,
    noEffort: false,
    both: false
  });

  const toggleCategory = (category: 'unassigned' | 'noEffort' | 'both') => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };
  // Filter tasks for the selected group that are unassigned or have missing effort
  const unassignedTasks = tasks.filter(task => {
    const isInSelectedGroup = !selectedGroup || task.groupId === selectedGroup;
    const isUnassigned = !task.assignee || task.assignee.trim() === '';
    const hasMissingEffort = !task.effortProvided; // Only flag if effort wasn't provided at all
    
    return isInSelectedGroup && (isUnassigned || hasMissingEffort);
  });

  // Group tasks by issue type (mutually exclusive categories)
  const tasksByIssue = {
    // Critical: Both unassigned AND missing effort (highest priority)
    both: unassignedTasks.filter(task => 
      (!task.assignee || task.assignee.trim() === '') && 
      !task.effortProvided
    ),
    // Unassigned only (has effort but no assignee)
    unassigned: unassignedTasks.filter(task => 
      (!task.assignee || task.assignee.trim() === '') && 
      task.effortProvided
    ),
    // Missing effort only (has assignee but no effort provided)
    noEffort: unassignedTasks.filter(task => 
      (task.assignee && task.assignee.trim() !== '') && 
      !task.effortProvided
    )
  };

  // Calculate total unique tasks
  const totalUniqueTasks = tasksByIssue.both.length + tasksByIssue.unassigned.length + tasksByIssue.noEffort.length;

  if (unassignedTasks.length === 0) {
    return (
      <div style={{
        padding: '20px',
        backgroundColor: '#f8f9fa',
        borderRadius: '12px',
        border: '1px solid #dee2e6',
        textAlign: 'center',
        marginBottom: '20px'
      }}>
        <h3 style={{ color: '#28a745', marginBottom: '10px' }}>
          ✅ All Tasks Are Properly Configured
        </h3>
        <p style={{ color: '#6c757d', margin: 0 }}>
          All tasks in this sprint have been assigned and have effort values provided (including intentional 0-hour tasks).
        </p>
      </div>
    );
  }

  return (
    <div style={{
      padding: '20px',
      backgroundColor: '#fff3cd',
      borderRadius: '12px',
      border: '1px solid #ffeaa7',
      marginBottom: '20px'
    }}>
      <h3 style={{ 
        color: '#856404', 
        marginBottom: '15px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
                 ⚠️ Tasks Missing Assignees or Effort Values ({totalUniqueTasks})
      </h3>
      
      <div style={{ marginBottom: '15px' }}>
        <p style={{ color: '#856404', margin: '0 0 10px 0', fontSize: '14px' }}>
          The following tasks need attention:
        </p>
      </div>

      {tasksByIssue.unassigned.length > 0 && (
        <div style={{ marginBottom: '15px' }}>
          <h4 
            style={{ 
              color: '#dc3545', 
              marginBottom: '8px', 
              fontSize: '16px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
            onClick={() => toggleCategory('unassigned')}
          >
            🔴 Unassigned Tasks ({tasksByIssue.unassigned.length})
            <span style={{ fontSize: '12px', fontWeight: 'normal' }}>
              {expandedCategories.unassigned ? '▼' : '▶'}
            </span>
          </h4>
          {expandedCategories.unassigned && (
            <ul style={{ margin: 0, paddingLeft: '20px' }}>
              {tasksByIssue.unassigned.map(task => (
                <li key={task.id} style={{ 
                  color: '#495057', 
                  marginBottom: '5px',
                  fontSize: '14px'
                }}>
                  <strong>{task.name}</strong>
                  {task.isSubitem && (
                    <span style={{ color: '#6c757d', fontSize: '12px' }}> (subtask)</span>
                  )}
                  {task.effortProvided && (
                    <span style={{ color: '#28a745' }}> - {task.effort}h effort</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tasksByIssue.noEffort.length > 0 && (
        <div style={{ marginBottom: '15px' }}>
          <h4 
            style={{ 
              color: '#fd7e14', 
              marginBottom: '8px', 
              fontSize: '16px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
            onClick={() => toggleCategory('noEffort')}
          >
            🟡 Tasks Missing Effort Values ({tasksByIssue.noEffort.length})
            <span style={{ fontSize: '12px', fontWeight: 'normal' }}>
              {expandedCategories.noEffort ? '▼' : '▶'}
            </span>
          </h4>
          {expandedCategories.noEffort && (
            <ul style={{ margin: 0, paddingLeft: '20px' }}>
              {tasksByIssue.noEffort.map(task => (
                <li key={task.id} style={{ 
                  color: '#495057', 
                  marginBottom: '5px',
                  fontSize: '14px'
                }}>
                  <strong>{task.name}</strong>
                  {task.isSubitem && (
                    <span style={{ color: '#6c757d', fontSize: '12px' }}> (subtask)</span>
                  )}
                  {task.assignee && (
                    <span style={{ color: '#007bff' }}> - Assigned to {task.assignee}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tasksByIssue.both.length > 0 && (
        <div style={{ marginBottom: '15px' }}>
          <h4 
            style={{ 
              color: '#dc3545', 
              marginBottom: '8px', 
              fontSize: '16px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
            onClick={() => toggleCategory('both')}
          >
            🔴 Critical: Unassigned & Missing Effort ({tasksByIssue.both.length})
            <span style={{ fontSize: '12px', fontWeight: 'normal' }}>
              {expandedCategories.both ? '▼' : '▶'}
            </span>
          </h4>
          {expandedCategories.both && (
            <ul style={{ margin: 0, paddingLeft: '20px' }}>
              {tasksByIssue.both.map(task => (
                <li key={task.id} style={{ 
                  color: '#495057', 
                  marginBottom: '5px',
                  fontSize: '14px'
                }}>
                  <strong>{task.name}</strong>
                  {task.isSubitem && (
                    <span style={{ color: '#6c757d', fontSize: '12px' }}> (subtask)</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div style={{ 
        marginTop: '15px',
        padding: '10px',
        backgroundColor: '#e2e3e5',
        borderRadius: '6px',
        fontSize: '12px',
        color: '#495057'
      }}>
        <strong>Action Required:</strong> Please assign team members and provide effort values (including 0 for non-work tasks) to these tasks in Monday.com to ensure accurate workload tracking.
      </div>
    </div>
  );
};

export default UnassignedTasksModule;
