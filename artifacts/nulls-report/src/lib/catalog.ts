// ---------------------------------------------------------------------------
// Games. Only Null's Brawl is enabled for now; the others render as disabled
// "coming soon" options and can be turned on by flipping `enabled` without
// touching the report flow (the backend enforces the same gate).
// ---------------------------------------------------------------------------

export interface GameInfo {
  id: string;
  name: string;
  short: string;
  prefix: string;
  enabled: boolean;
  tagline: string;
  color: string;
}

export const GAMES: GameInfo[] = [
  {
    id: 'nulls-brawl',
    name: "Null's Brawl",
    short: 'Brawl',
    prefix: 'NB',
    enabled: true,
    tagline: 'Private servers, gameplay and account reports.',
    color: '#ef6358',
  },
  {
    id: 'nulls-clash-of-clans',
    name: "Null's Clash of Clans",
    short: 'Clash',
    prefix: 'NC',
    enabled: false,
    tagline: 'Clan, village and economy reports.',
    color: '#ce9d40',
  },
  {
    id: 'nulls-royale',
    name: "Null's Royale",
    short: 'Royale',
    prefix: 'NR',
    enabled: false,
    tagline: 'Deck, arena and matchmaking reports.',
    color: '#7468b6',
  },
  {
    id: 'nulls-royale-infinity',
    name: "Null's Royale Infinity",
    short: 'Infinity',
    prefix: 'NI',
    enabled: false,
    tagline: 'Infinity game reports.',
    color: '#2e9f91',
  },
];

export const gameById = (id: string): GameInfo =>
  GAMES.find((g) => g.id === id) ?? GAMES[0];

// ---------------------------------------------------------------------------
// Categories & subtypes
// ---------------------------------------------------------------------------

export interface CategoryInfo {
  id: string;
  label: string;
  subtypes: string[];
  color: string;
}

export const CATEGORIES: Record<string, CategoryInfo> = {
  bug: {
    id: 'bug',
    label: 'Bug',
    subtypes: ['Visual', 'Exploit', 'Cheat/abuse', 'Gameplay', 'Performance', 'UI/UX', 'Other'],
    color: '#ca4e44',
  },
  account: {
    id: 'account',
    label: 'Account',
    subtypes: ['Account recovery', 'Account scam', 'Win-trading'],
    color: '#7468b6',
  },
  server: {
    id: 'server',
    label: 'Server',
    subtypes: ['Server down', 'Connection/latency', 'Matchmaking', 'Login/authentication', 'Other'],
    color: '#247c70',
  },
};

// ---------------------------------------------------------------------------
// Statuses & priorities
// ---------------------------------------------------------------------------

export interface StatusInfo {
  value: string;
  label: string;
  cls: string;
  dot: string;
}

export const STATUSES: Record<string, StatusInfo> = {
  submitted: { value: 'submitted', label: 'Submitted', cls: 'bg-[#fff0ed] text-[#ca4e44]', dot: '#ca4e44' },
  verifying: { value: 'verifying', label: 'Verifying', cls: 'bg-[#fff6df] text-[#936b16]', dot: '#ce9d40' },
  rejected: { value: 'rejected', label: 'Rejected', cls: 'bg-[#fdecec] text-[#b03030]', dot: '#b03030' },
  verified: { value: 'verified', label: 'Verified', cls: 'bg-[#e9f5eb] text-[#39824b]', dot: '#39824b' },
  forwarded: { value: 'forwarded', label: 'Forwarded', cls: 'bg-[#eef0f4] text-[#687385]', dot: '#687385' },
  waiting_for_user: { value: 'waiting_for_user', label: 'Waiting for reporter', cls: 'bg-[#fff6df] text-[#936b16]', dot: '#ce9d40' },
  in_progress: { value: 'in_progress', label: 'In progress', cls: 'bg-[#e8f6f3] text-[#247c70]', dot: '#2e9f91' },
  resolved: { value: 'resolved', label: 'Resolved', cls: 'bg-[#e9f5eb] text-[#39824b]', dot: '#39824b' },
  closed: { value: 'closed', label: 'Closed', cls: 'bg-[#eef0f4] text-[#687385]', dot: '#687385' },
};

export const statusInfo = (status: string): StatusInfo => STATUSES[status] ?? { value: status, label: status, cls: 'bg-[#eef0f4] text-[#687385]', dot: '#687385' };

export const PRIORITIES: Record<string, { label: string; cls: string }> = {
  low: { label: 'Low', cls: 'text-[#84909e]' },
  normal: { label: 'Normal', cls: 'text-[#667085]' },
  high: { label: 'High', cls: 'text-[#b7771b]' },
  urgent: { label: 'Urgent', cls: 'text-[#ca4e44]' },
};

export const priorityInfo = (priority: string) =>
  PRIORITIES[priority] ?? { label: priority, cls: 'text-[#667085]' };

/** Canonical ticket workflow, shown to users and staff. */
export const WORKFLOW = [
  { step: '01', title: 'Submit a report', detail: 'Describe the issue and attach evidence. It becomes a ticket with its own ID.' },
  { step: '02', title: 'Moderator review', detail: 'A moderator checks the report and verifies whether the issue is real.' },
  { step: '03', title: 'Administrator handling', detail: 'Verified tickets are forwarded to administrators, who fix or resolve them.' },
  { step: '04', title: 'You see the outcome', detail: 'Track the status and history of your ticket at any time.' },
] as const;

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
