import React from 'react';
import { useInfrastructureState } from './useInfrastructureState';

export const ProvidersWorkspace: React.FC = () => {
  const { providers, loading } = useInfrastructureState();
  if (loading) return <div>Loading...</div>;
  
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-white font-mono">Providers</h2>
      <div className="grid gap-2">
        {providers.map(p => (
          <div key={p.id} className="p-3 bg-zinc-800 rounded flex justify-between">
            <span className="text-white">{p.name}</span>
            <span className="text-emerald-400">{p.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
