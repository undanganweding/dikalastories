import React from 'react';
import { useInfrastructureState } from './useInfrastructureState';

export const LogsWorkspace: React.FC = () => {
  const { logs, loading } = useInfrastructureState();
  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-white font-mono">Decision Logs</h2>
      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {logs.slice(-20).reverse().map((l, i) => (
          <div key={i} className="text-xs font-mono p-2 bg-zinc-900 rounded text-zinc-300">
            {l.time} | {l.task} | {l.model} | {l.status}
          </div>
        ))}
      </div>
    </div>
  );
};
