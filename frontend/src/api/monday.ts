import axios from 'axios';

// Monday.com API configuration
const API_TOKEN = process.env.REACT_APP_MONDAY_API_TOKEN;
const BOARD_ID = process.env.REACT_APP_MONDAY_BOARD_ID || '2038576678';
const API_URL = 'https://api.monday.com/v2';

// Debug environment variables
console.log('=== MONDAY.COM API DEBUG ===');
console.log('Environment variables:', {
  REACT_APP_MONDAY_API_TOKEN: process.env.REACT_APP_MONDAY_API_TOKEN ? 'SET' : 'NOT SET',
  REACT_APP_MONDAY_BOARD_ID: process.env.REACT_APP_MONDAY_BOARD_ID || 'NOT SET'
});
console.log('API_TOKEN available:', !!API_TOKEN);
console.log('BOARD_ID:', BOARD_ID);
console.log('API_URL:', API_URL);
console.log('================================');

// Validate that API token is available
if (!API_TOKEN) {
  throw new Error('REACT_APP_MONDAY_API_TOKEN environment variable is required');
}

const headers = {
  'Authorization': API_TOKEN,
  'Content-Type': 'application/json',
  'API-Version': '2024-01'
};

export interface Task {
  id: string;
  name: string;
  effort: number; // in hours
  assignee: string;
  status: string;
  dueDate: string;
  isSubitem: boolean;
  parentId?: string;
  groupId: string;
}

export interface Column {
  id: string;
  title: string;
  type: string;
}

export interface Group {
  id: string;
  title: string;
}

// Fetch board columns to understand the structure
export async function fetchBoardColumns(): Promise<Column[]> {
  const query = `
    query {
      boards(ids: ${BOARD_ID}) {
        columns {
          id
          title
          type
        }
      }
    }
  `;

  try {
    console.log('Making API call to Monday.com with headers:', headers);
    const response = await axios.post(API_URL, { query }, { headers });
    console.log('API response received:', response.status);
    return response.data.data.boards[0].columns;
  } catch (error: any) {
    console.error('Error fetching board columns:', error);
    console.error('Error details:', error.response?.data || error.message);
    return [];
  }
}

// Fetch all items from the board
export async function fetchBoardItems(): Promise<any[]> {
  const query = `
    query {
      boards(ids: ${BOARD_ID}) {
        items_page {
          items {
            id
            name
            column_values {
              id
              text
              value
              type
            }
            subitems {
              id
              name
              column_values {
                id
                text
                value
                type
              }
            }
          }
        }
      }
    }
  `;

  try {
    console.log('Making API call to fetch board items with query:', query);
    const response = await axios.post(API_URL, { query }, { headers });
    console.log('Board items API response received:', response.status);
    return response.data.data.boards[0].items_page.items;
  } catch (error: any) {
    console.error('Error fetching board items:', error);
    console.error('Error response:', error.response?.data);
    console.error('Error status:', error.response?.status);
    return [];
  }
}

// Parse column values to extract effort, assignee, status, and due date
function parseColumnValues(columnValues: any[]): { effort: number; assignee: string; status: string; dueDate: string } {
  let effort = 0;
  let assignee = '';
  let status = '';
  let dueDate = '';

  columnValues.forEach(col => {
    if (col.id === 'numeric_mksee97s' && col.text) {
      // Effort (hours) column
      const effortValue = parseFloat(col.text);
      if (!isNaN(effortValue)) {
        effort = effortValue;
      }
    }
    if (col.id === 'person' && col.value) {
      // Assigned To (people) column
      try {
        const parsed = JSON.parse(col.value);
        if (parsed && parsed.personsAndTeams && parsed.personsAndTeams.length > 0) {
          // Use the first person assigned (or you can join names for multiple assignees)
          assignee = parsed.personsAndTeams[0].name;
        }
      } catch (e) {
        // fallback
        assignee = col.text || '';
      }
    }
    if (col.id === 'status' && col.text) {
      status = col.text;
    }
    if (col.id === 'date4' && col.text) {
      dueDate = col.text;
    }
  });

  return { effort, assignee, status, dueDate };
}

// Convert Monday.com items to our Task interface
export async function fetchTasks(): Promise<Task[]> {
  // Fetch all groups first to get valid group IDs
  const groupQuery = `query { boards(ids: ${BOARD_ID}) { groups { id } } }`;
  let validGroupIds: string[] = [];
  try {
    const groupRes = await axios.post(API_URL, { query: groupQuery }, { headers });
    validGroupIds = groupRes.data.data.boards[0].groups.map((g: any) => g.id);
  } catch (e) {
    // fallback: no group validation
  }

  const query = `
    query {
      boards(ids: ${BOARD_ID}) {
        items_page {
          items {
            id
            name
            group { id }
            column_values {
              id
              text
              value
              type
            }
            subitems {
              id
              name
              group { id }
              column_values {
                id
                text
                value
                type
              }
            }
          }
        }
      }
    }
  `;

  try {
    const response = await axios.post(API_URL, { query }, { headers });
    const items = response.data.data.boards[0].items_page.items;
    const tasks: Task[] = [];

    items.forEach((item: any) => {
      // Find subitems with valid effort and assignee
      const validSubitems = (Array.isArray(item.subitems) ? item.subitems : []).filter((subitem: any) => {
        let effort = 0;
        let assignee = '';
        subitem.column_values.forEach((col: any) => {
          if (col.id === 'numeric_mksezpbh' && col.text) {
            const val = parseFloat(col.text);
            if (!isNaN(val)) effort = val;
          }
          if (col.id === 'person' && col.text) {
            assignee = col.text;
          }
        });
        return effort > 0 && assignee;
      });
      if (validSubitems.length > 0) {
        // Only count valid subitems, ignore main item effort
        validSubitems.forEach((subitem: any) => {
          let effort = 0;
          let assignee = '';
          let status = '';
          let dueDate = '';
          subitem.column_values.forEach((col: any) => {
            if (col.id === 'numeric_mksezpbh' && col.text) {
              const val = parseFloat(col.text);
              if (!isNaN(val)) effort = val;
            }
            if (col.id === 'person' && col.text) {
              assignee = col.text;
            }
            if (col.id === 'status' && col.text) {
              status = col.text;
            }
            if (col.id.startsWith('date') && col.text) {
              dueDate = col.text;
            }
          });
          // Subitem inherits parent group if missing or invalid
          let groupId = subitem.group?.id || item.group?.id || '';
          if (!validGroupIds.includes(groupId)) {
            groupId = item.group?.id || '';
          }
          if (effort > 0 && assignee) {
            tasks.push({
              id: subitem.id,
              name: subitem.name,
              effort,
              assignee,
              status,
              dueDate,
              isSubitem: true,
              parentId: item.id,
              groupId,
            });
          }
        });
      } else {
        // No valid subitems, use main item effort
        let effort = 0;
        let assignee = '';
        let status = '';
        let dueDate = '';
        item.column_values.forEach((col: any) => {
          if (col.id === 'numeric_mksee97s' && col.text) {
            const val = parseFloat(col.text);
            if (!isNaN(val)) effort = val;
          }
          if (col.id === 'person' && col.text) {
            assignee = col.text;
          }
          if (col.id === 'status' && col.text) {
            status = col.text;
          }
          if (col.id === 'date4' && col.text) {
            dueDate = col.text;
          }
        });
        if (effort > 0 && assignee) {
          tasks.push({
            id: item.id,
            name: item.name,
            effort,
            assignee,
            status,
            dueDate,
            isSubitem: false,
            groupId: item.group?.id || '',
          });
        }
      }
    });
    // Debug: print all extracted tasks
    console.log('Extracted tasks:', JSON.stringify(tasks, null, 2));
    return tasks;
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return [];
  }
}

export async function fetchGroups(): Promise<Group[]> {
  const query = `
    query {
      boards(ids: ${BOARD_ID}) {
        groups {
          id
          title
        }
      }
    }
  `;
  try {
    console.log('Making API call to fetch groups with headers:', headers);
    const response = await axios.post(API_URL, { query }, { headers });
    console.log('Groups API response received:', response.status);
    return response.data.data.boards[0].groups;
  } catch (error: any) {
    console.error('Error fetching groups:', error);
    console.error('Error details:', error.response?.data || error.message);
    return [];
  }
} 