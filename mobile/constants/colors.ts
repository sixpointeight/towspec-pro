export const colors = {
  background: '#0f172a',
  surface: '#1e293b',
  surfaceLight: '#334155',
  border: '#334155',
  borderLight: '#475569',
  primary: '#facc15',
  primaryForeground: '#0f172a',
  text: '#f8fafc',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  radius: 12,
} as const;

export const sectionStyles: Record<string, { bg: string; border: string; label: string; icon: string }> = {
  'Tow Information':          { bg: '#1c0808', border: '#ef4444', label: '#fca5a5', icon: 'truck' },
  'Shift Interlock Override': { bg: '#1c1008', border: '#f97316', label: '#fdba74', icon: 'settings' },
  'Service Information':      { bg: '#1c1a08', border: '#eab308', label: '#fde047', icon: 'construct' },
  'Battery Location':         { bg: '#081c0e', border: '#22c55e', label: '#86efac', icon: 'battery-charging' },
  'Jump Starting':            { bg: '#080f1c', border: '#3b82f6', label: '#93c5fd', icon: 'flash' },
  'Tire Service':             { bg: '#0e081c', border: '#6366f1', label: '#a5b4fc', icon: 'disc' },
  'Fuel Type':                { bg: '#14081c', border: '#a855f7', label: '#d8b4fe', icon: 'water' },
  'Fuel Delivery':            { bg: '#14081c', border: '#a855f7', label: '#d8b4fe', icon: 'flask' },
  'Electronic Key':           { bg: '#181818', border: '#94a3b8', label: '#cbd5e1', icon: 'key' },
};

export const defaultSectionStyle = { bg: '#181818', border: '#64748b', label: '#94a3b8', icon: 'document-text' };
