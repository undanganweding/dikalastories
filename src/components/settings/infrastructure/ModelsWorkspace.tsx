import React from 'react';
import { useInfrastructureState } from './useInfrastructureState';

export const ModelsWorkspace: React.FC = () => {
  const { models, loading } = useInfrastructureState();
  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-white font-mono">Models & Projects</h2>
      <div className="grid gap-2">
        {models.map((m, i) => (
          <div key={i} className="p-3 bg-zinc-800 rounded flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <span className="text-white font-mono text-sm">{m.id}</span>
              <div className="flex gap-2 text-xs">
                <span className={`px-2 py-1 rounded ${m.health?.status === 'healthy' ? 'bg-emerald-900 text-emerald-200' : 'bg-red-900 text-red-200'}`}>{m.health?.status}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {Object.entries(m.capabilities || {}).filter(([_, val]) => val).map(([key]) => (
                <span key={key} className="text-[10px] bg-zinc-700 text-zinc-300 px-1.5 py-0.5 rounded">{key}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
