import React from 'react';
import { useInfrastructureState } from './useInfrastructureState';

export const RoutingWorkspace: React.FC = () => {
  const { routing, loading } = useInfrastructureState();
  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-white font-mono">Routing Policy</h2>
      <div className="p-4 bg-zinc-800 rounded flex justify-between items-center">
        <span className="text-zinc-300 font-mono">Mode: {routing.mode}</span>
        <span className="px-2 py-1 bg-indigo-600 text-white text-xs rounded font-bold">AUTO</span>
      </div>
    </div>
  );
};
