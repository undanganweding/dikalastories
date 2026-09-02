import React from 'react';
import { useInfrastructureState } from './useInfrastructureState';

export const HealthWorkspace: React.FC = () => {
  const { health, loading } = useInfrastructureState();
  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-white font-mono">Health Monitoring</h2>
      <div className="space-y-2">
        <div className="p-3 bg-zinc-800 rounded">
          <h3 className="text-xs text-zinc-400 font-bold uppercase mb-2">Providers</h3>
          {Object.entries(health.providers || {}).map(([id, data]: [string, any]) => (
            <div key={id} className="flex justify-between text-sm">
              <span className="text-zinc-300">{id}</span>
              <span className="text-emerald-400">{data.status}</span>
            </div>
          ))}
        </div>
        <div className="p-3 bg-zinc-800 rounded">
          <h3 className="text-xs text-zinc-400 font-bold uppercase mb-2">Models</h3>
          {Object.entries(health.models || {}).map(([id, healthData]: [string, any]) => (
            <div key={id} className="flex justify-between text-sm">
              <span className="text-zinc-300 font-mono text-xs">{id}</span>
              <span className={healthData.status === 'healthy' ? 'text-emerald-400' : 'text-red-400'}>{healthData.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
