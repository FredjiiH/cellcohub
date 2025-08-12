import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface TeamMember {
  name: string;
  capacity: number;
}

interface Workload {
  [name: string]: number; // name -> assigned hours
}

const COLORS = {
  normal: '#82ca9d',
  overloaded: '#ff4d4f',
};

const WorkloadDashboard: React.FC<{
  team: TeamMember[];
  workload: Workload;
}> = ({ team, workload }) => {
  const data = team.map(member => ({
    name: member.name,
    capacity: member.capacity,
    workload: workload[member.name] || 0,
    overloaded: (workload[member.name] || 0) > member.capacity,
  }));

  return (
    <div>
      <h2>Workload Dashboard</h2>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
          <XAxis 
            dataKey="name" 
            angle={-45}
            textAnchor="end"
            height={80}
            tick={{ fontSize: 12, fill: '#333' }}
            interval={0}
          />
          <YAxis />
          <Tooltip />
          <Bar dataKey="workload">
            {data.map((entry, idx) => (
              <Cell key={`cell-${idx}`} fill={entry.overloaded ? COLORS.overloaded : COLORS.normal} />
            ))}
          </Bar>
          <Bar dataKey="capacity" fill="#8884d8" />
        </BarChart>
      </ResponsiveContainer>
      <ul>
        {data.map((entry, idx) => (
          <li key={idx} style={{ color: entry.overloaded ? COLORS.overloaded : undefined }}>
            {entry.name}: {entry.workload} / {entry.capacity} hrs {entry.overloaded ? '⚠️ Overloaded' : ''}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default WorkloadDashboard; 