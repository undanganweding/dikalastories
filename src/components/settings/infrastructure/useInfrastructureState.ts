import { useState, useEffect } from 'react';

export interface InfrastructureState {
  providers: any[];
  projects: any[];
  models: any[];
  routing: any;
  health: any;
  logs: any[];
  loading: boolean;
  error: string | null;
}

export function useInfrastructureState() {
  const [state, setState] = useState<InfrastructureState>({
    providers: [],
    projects: [],
    models: [],
    routing: { mode: 'AUTO' },
    health: {},
    logs: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [projectsRes, catalogRes, logsRes] = await Promise.all([
          fetch('/api/router/gemini-projects'),
          fetch('/api/router/catalog'),
          fetch('/api/router/logs')
        ]);

        if (!projectsRes.ok || !catalogRes.ok || !logsRes.ok) {
          throw new Error('Failed to fetch infrastructure data');
        }

        const projectsData = await projectsRes.json();
        const catalogData = await catalogRes.json();
        const logsData = await logsRes.json();

        setState({
          providers: [{ id: 'google_gemini', name: 'Google Gemini', status: 'live' }],
          projects: projectsData.projects,
          models: catalogData.models.map((m: any) => ({
            ...m,
            project: 'N/A'
          })),
          routing: { mode: 'AUTO' },
          health: { 
            providers: { google_gemini: { status: 'live', availability: '99.8%' } },
            models: catalogData.models.reduce((acc: any, m: any) => ({ ...acc, [m.id]: m.health }), {})
          },
          logs: logsData.logs || [],
          loading: false,
          error: null,
        });
      } catch (err: any) {
        setState(s => ({ ...s, loading: false, error: err.message }));
      }
    };
    fetchData();
  }, []);

  return state;
}
