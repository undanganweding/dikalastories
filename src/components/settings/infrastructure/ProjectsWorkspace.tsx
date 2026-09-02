import React from 'react';
import { CredentialPoolManager } from '../CredentialPoolManager';

export const ProjectsWorkspace: React.FC = () => (
  <div className="space-y-4">
    <h2 className="text-lg font-bold text-white font-mono">Projects / Connections</h2>
    <CredentialPoolManager />
  </div>
);
