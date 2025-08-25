import axios from 'axios';

// Monday.com API configuration - Updated for multiple assignee support
const API_TOKEN = process.env.REACT_APP_MONDAY_API_TOKEN;
const BOARD_ID = process.env.REACT_APP_MONDAY_BOARD_ID || '2038576678';
const API_URL = 'https://api.monday.com/v2';


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
  effortProvided: boolean; // true if effort was explicitly set (even if 0), false if missing
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
    const response = await axios.post(API_URL, { query }, { headers });
    return response.data.data.boards[0].columns;
  } catch (error: any) {
    console.error('Error fetching board columns:', error);
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
    const response = await axios.post(API_URL, { query }, { headers });
    return response.data.data.boards[0].items_page.items;
  } catch (error: any) {
    console.error('Error fetching board items:', error);
    return [];
  }
}

// Parse column values to extract effort, assignees, status, and due date
function parseColumnValues(columnValues: any[]): { effort: number; assignees: string[]; status: string; dueDate: string } {
  let effort = 0;
  let assignees: string[] = [];
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
      // Assigned To (people) column - handle multiple assignees
      try {
        const parsed = JSON.parse(col.value);
        if (parsed && parsed.personsAndTeams && parsed.personsAndTeams.length > 0) {
          // Extract all assignees, not just the first one
          assignees = parsed.personsAndTeams.map((person: any) => person.name);
        }
      } catch (e) {
        // fallback - try to parse as single assignee
        assignees = col.text ? [col.text] : [];
      }
    }
    if (col.id === 'status' && col.text) {
      status = col.text;
    }
    if (col.id === 'date4' && col.text) {
      dueDate = col.text;
    }
  });

  return { effort, assignees, status, dueDate };
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

  // Fetch all items with pagination
  let allItems: any[] = [];
  let cursor: string | null = null;
  
  while (true) {
    const query: string = `
      query {
        boards(ids: ${BOARD_ID}) {
          items_page(limit: 100${cursor ? `, cursor: "${cursor}"` : ''}) {
            cursor
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

    const response: any = await axios.post(API_URL, { query }, { headers });
    const page: any = response.data.data.boards[0].items_page;
    const items: any[] = page.items || [];
    
    allItems.push(...items);
    cursor = page.cursor;
    
    if (!cursor || items.length === 0) break;
  }

  try {
    const items = allItems;
    const tasks: Task[] = [];

    items.forEach((item: any) => {
      // Process subitems first
      const subitems = Array.isArray(item.subitems) ? item.subitems : [];
      
      subitems.forEach((subitem: any) => {
        let effort = 0;
        let effortProvided = false;
        let assignees: string[] = [];
        let status = '';
        let dueDate = '';
        
        subitem.column_values.forEach((col: any) => {
          if (col.id === 'numeric_mksezpbh') {
            if (col.text !== null && col.text !== undefined && col.text !== '') {
              const val = parseFloat(col.text);
              if (!isNaN(val)) {
                effort = val;
                effortProvided = true;
              }
            }
          }
          if (col.id === 'person') {
            if (col.text && col.text.trim()) {
              assignees = col.text.split(',').map((name: string) => name.trim()).filter((name: string) => name.length > 0);
            }
          }
          if (col.id === 'status' && col.text) {
            status = col.text;
          }
          if (col.id.startsWith('date') && col.text) {
            dueDate = col.text;
          }
        });
        
        // Subitems inherit parent item's group ID
        let groupId = item.group?.id || '';
        
        if (assignees.length > 0) {
          assignees.forEach(assignee => {
            tasks.push({
              id: `${subitem.id}-${assignee}`,
              name: subitem.name,
              effort,
              effortProvided,
              assignee,
              status,
              dueDate,
              isSubitem: true,
              parentId: item.id,
              groupId,
            });
          });
        } else {
          tasks.push({
            id: subitem.id,
            name: subitem.name,
            effort,
            effortProvided,
            assignee: '',
            status,
            dueDate,
            isSubitem: true,
            parentId: item.id,
            groupId,
          });
        }
      });
      
      // Process main item if no subitems
      if (subitems.length === 0) {
        let effort = 0;
        let effortProvided = false;
        let assignees: string[] = [];
        let status = '';
        let dueDate = '';
        
        item.column_values.forEach((col: any) => {
          if (col.id === 'numeric_mksee97s') {
            if (col.text !== null && col.text !== undefined && col.text !== '') {
              const val = parseFloat(col.text);
              if (!isNaN(val)) {
                effort = val;
                effortProvided = true;
              }
            }
          }
          if (col.id === 'person') {
            if (col.text && col.text.trim()) {
              assignees = col.text.split(',').map((name: string) => name.trim()).filter((name: string) => name.length > 0);
            }
          }
          if (col.id === 'status' && col.text) {
            status = col.text;
          }
          if (col.id === 'date4' && col.text) {
            dueDate = col.text;
          }
        });
        
        if (assignees.length > 0) {
          assignees.forEach(assignee => {
            const mainItemGroupId = item.group?.id || '';
            
            tasks.push({
              id: `${item.id}-${assignee}`,
              name: item.name,
              effort,
              effortProvided,
              assignee,
              status,
              dueDate,
              isSubitem: false,
              groupId: mainItemGroupId,
            });
          });
        } else {
          tasks.push({
            id: item.id,
            name: item.name,
            effort,
            effortProvided,
            assignee: '',
            status,
            dueDate,
            isSubitem: false,
            groupId: item.group?.id || '',
          });
        }
      }
    });
    
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
    const response = await axios.post(API_URL, { query }, { headers });
    return response.data.data.boards[0].groups;
  } catch (error: any) {
    console.error('Error fetching groups:', error);
    return [];
  }
} 