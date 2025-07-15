import React, { useEffect, useState } from 'react';
import { fetchBoardColumns, fetchBoardItems, Column } from '../api/monday';

const BoardInspector: React.FC = () => {
  const [columns, setColumns] = useState<Column[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const inspectBoard = async () => {
      try {
        const [boardColumns, boardItems] = await Promise.all([
          fetchBoardColumns(),
          fetchBoardItems()
        ]);
        setColumns(boardColumns);
        setItems(boardItems);
      } catch (error) {
        console.error('Error inspecting board:', error);
      } finally {
        setLoading(false);
      }
    };

    inspectBoard();
  }, []);

  if (loading) {
    return <div>Loading board structure...</div>;
  }

  return (
    <div style={{ margin: '20px 0', padding: '20px', border: '1px solid #ccc', borderRadius: '8px' }}>
      <h3>Board Structure Inspector</h3>
      
      <div style={{ marginBottom: '20px' }}>
        <h4>Columns ({columns.length})</h4>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #ddd', padding: '8px' }}>ID</th>
              <th style={{ border: '1px solid #ddd', padding: '8px' }}>Title</th>
              <th style={{ border: '1px solid #ddd', padding: '8px' }}>Type</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((col, idx) => (
              <tr key={idx}>
                <td style={{ border: '1px solid #ddd', padding: '8px' }}>{col.id}</td>
                <td style={{ border: '1px solid #ddd', padding: '8px' }}>{col.title}</td>
                <td style={{ border: '1px solid #ddd', padding: '8px' }}>{col.type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h4>Sample Items ({items.length})</h4>
        {items.slice(0, 3).map((item, idx) => (
          <div key={idx} style={{ marginBottom: '10px', padding: '10px', border: '1px solid #eee' }}>
            <strong>{item.name}</strong> (ID: {item.id})
            <div style={{ marginTop: '5px', fontSize: '12px' }}>
              <strong>Column Values:</strong>
              <ul>
                {item.column_values.map((col: any, colIdx: number) => (
                  <li key={colIdx}>
                    {col.id}: {col.text || col.value || 'empty'}
                  </li>
                ))}
              </ul>
              {item.subitems && item.subitems.length > 0 && (
                <div>
                  <strong>Subitems ({item.subitems.length}):</strong>
                  <ul>
                    {item.subitems.slice(0, 2).map((subitem: any, subIdx: number) => (
                      <li key={subIdx}>
                        {subitem.name} - {subitem.column_values.map((col: any) => `${col.id}: ${col.text}`).join(', ')}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BoardInspector; 