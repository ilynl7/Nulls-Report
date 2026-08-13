// ---------------------------------------------------------------------------
// Games. Only Null's Brawl is enabled for now; the others render as disabled
// "coming soon" options and can be turned on by flipping `enabled` without
// touching the report flow (the backend enforces the same gate).
//
// Each game carries its own icon + color so branding is centralized: the same
// icon is reused on the homepage, report cards, filters, game selection and
// staff panels. Game icons are real graphics (lucide), never letter badges.
// ---------------------------------------------------------------------------

import { Castle, Crown, Infinity as InfinityIcon, Swords, type LucideIcon } from 'lucide-react';

export interface GameInfo {
  id: string;
  name: string;
  short: string;
  /** Ticket-ID prefix, e.g. NB for Null's Brawl (letters are fine for IDs). */
  prefix: string;
  enabled: boolean;
  tagline: string;
  color: string;
  /** Centralized game icon (lucide family, consistent across the portal). */
  icon: LucideIcon;
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
    icon: Swords,
  },
  {
    id: 'nulls-clash-of-clans',
    name: "Null's Clash of Clans",
    short: 'Clash',
    prefix: 'NC',
    enabled: false,
    tagline: 'Clan, village and economy reports.',
    color: '#ce9d40',
    icon: Castle,
  },
  {
    id: 'nulls-royale',
    name: "Null's Royale",
    short: 'Royale',
    prefix: 'NR',
    enabled: false,
    tagline: 'Deck, arena and matchmaking reports.',
    color: '#7468b6',
    icon: Crown,
  },
  {
    id: 'nulls-royale-infinity',
    name: "Null's Royale Infinity",
    short: 'Infinity',
    prefix: 'NI',
    enabled: false,
    tagline: 'Infinity game reports.',
    color: '#2e9f91',
    icon: InfinityIcon,
  },
];

export const gameById = (id: string): GameInfo =>
  GAMES.find((g) => g.id === id) ?? GAMES[0];

// ---------------------------------------------------------------------------
// Ticket statuses & verification — canonical labels used everywhere.
// ---------------------------------------------------------------------------

export interface StatusInfo {
  value: string;
  label: string;
  cls: string;
  dot: string;
}

export const STATUSES: Record<string, StatusInfo> = {
  open: { value: 'open', label: 'Open', cls: 'bg-[#fff0ed] text-[#ca4e44]', dot: '#ca4e44' },
  under_review: { value: 'under_review', label: 'Under review', cls: 'bg-[#fff6df] text-[#936b16]', dot: '#ce9d40' },
  awaiting_admin: { value: 'awaiting_admin', label: 'Awaiting administrator', cls: 'bg-[#f2f0fb] text-[#5b50a8]', dot: '#7468b6' },
  in_progress: { value: 'in_progress', label: 'In progress', cls: 'bg-[#e8f6f3] text-[#247c70]', dot: '#2e9f91' },
  waiting_for_user: { value: 'waiting_for_user', label: 'Waiting for user', cls: 'bg-[#fff6df] text-[#936b16]', dot: '#ce9d40' },
  resolved: { value: 'resolved', label: 'Resolved', cls: 'bg-[#e9f5eb] text-[#39824b]', dot: '#39824b' },
  closed: { value: 'closed', label: 'Closed', cls: 'bg-[#eef0f4] text-[#687385]', dot: '#687385' },
};

export const statusInfo = (status: string): StatusInfo =>
  STATUSES[status] ?? { value: status, label: humanize(status), cls: 'bg-[#eef0f4] text-[#687385]', dot: '#687385' };

export interface VerificationInfo {
  value: string;
  label: string;
  cls: string;
  dot: string;
}

export const VERIFICATIONS: Record<string, VerificationInfo> = {
  unverified: { value: 'unverified', label: 'Unverified', cls: 'bg-[#eef0f4] text-[#687385]', dot: '#98a1ad' },
  verified: { value: 'verified', label: 'Verified', cls: 'bg-[#e9f5eb] text-[#39824b]', dot: '#39824b' },
  rejected: { value: 'rejected', label: 'Rejected', cls: 'bg-[#fdecec] text-[#b03030]', dot: '#b03030' },
};

export const verificationInfo = (verification: string): VerificationInfo =>
  VERIFICATIONS[verification] ?? {
    value: verification,
    label: humanize(verification),
    cls: 'bg-[#eef0f4] text-[#687385]',
    dot: '#98a1ad',
  };

export const STAFF_STAGES: Record<string, { label: string; cls: string }> = {
  moderator_review: { label: 'Moderator review', cls: 'text-[#936b16]' },
  administrator_review: { label: 'Administrator review', cls: 'text-[#5b50a8]' },
  resolution: { label: 'Resolution', cls: 'text-[#39824b]' },
};

export const staffStageInfo = (stage: string) =>
  STAFF_STAGES[stage] ?? { label: humanize(stage), cls: 'text-[#687385]' };

export const ARCHIVED_STATUSES = ['resolved', 'closed'] as const;
export const isArchived = (status: string) => ARCHIVED_STATUSES.includes(status as never);

export const PRIORITIES: Record<string, { label: string; cls: string }> = {
  normal: { label: 'Normal', cls: 'text-[#667085]' },
  high: { label: 'High', cls: 'text-[#b7771b]' },
  critical: { label: 'Critical / Risk', cls: 'text-[#ca4e44]' },
};

export const priorityInfo = (priority: string) =>
  PRIORITIES[priority] ?? { label: priority, cls: 'text-[#667085]' };

// ---------------------------------------------------------------------------
// Issue types & categories (display + old-category fallback)
// ---------------------------------------------------------------------------

export const ISSUE_TYPES: Record<string, { label: string; cls: string }> = {
  community: { label: 'Community issue', cls: 'bg-[#e8f6f3] text-[#247c70]' },
  game: { label: 'Game issue', cls: 'bg-[#f2f0fb] text-[#5b50a8]' },
};

export const issueTypeInfo = (issueType: string) =>
  ISSUE_TYPES[issueType] ?? { label: humanize(issueType), cls: 'bg-[#eef0f4] text-[#687385]' };

// Fallback label for legacy categories that predate the guided flow.
export const CATEGORY_LABELS: Record<string, string> = {
  bug: 'Bug',
  account: 'Account',
  server: 'Server',
};

export function categoryLabel(category: string): string {
  return optionLabel(category) ?? CATEGORY_LABELS[category] ?? humanize(category);
}

// ---------------------------------------------------------------------------
// Guided report flow — data-driven so new categories can be added without
// touching the form logic. The hierarchy stored on a ticket is:
//   game → issueType → category → subtype
// ---------------------------------------------------------------------------

export type ReportFieldType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'date'
  | 'checkbox'
  | 'player'
  | 'email';

export interface ReportField {
  key: string;
  label: string;
  type: ReportFieldType;
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: string[];
  maxLength?: number;
  minLength?: number;
  /** Evidence is strongly expected for this field (attachments step is always available). */
  expectsEvidence?: boolean;
}

export interface IssueOption {
  id: string;
  label: string;
  short: string;
  description: string;
  accent: string;
  fields: ReportField[];
}

export interface ReportFlowBranch {
  id: 'community' | 'game';
  label: string;
  description: string;
  options: IssueOption[];
}

export interface BugSubcategory extends IssueOption {}

const text = (key: string, label: string, extra: Partial<ReportField> = {}): ReportField => ({
  key,
  label,
  type: 'text',
  ...extra,
});

const area = (key: string, label: string, extra: Partial<ReportField> = {}): ReportField => ({
  key,
  label,
  type: 'textarea',
  ...extra,
});

export const BUG_SUBCATEGORIES: BugSubcategory[] = [
  {
    id: 'visual',
    label: 'Visual',
    short: 'Visual',
    description: 'Graphics, rendering or visuals that look wrong.',
    accent: '#7468b6',
    fields: [
      area('what_looks_wrong', 'What looks wrong?', { required: true, placeholder: 'Describe exactly what looks incorrect…' }),
      text('where_happens', 'Where does it happen?', { placeholder: 'A specific map, screen, or action that triggers it' }),
      area('steps', 'Steps to reproduce', { required: true, placeholder: '1. … 2. … 3. …', help: 'The more precise, the faster staff can reproduce it.' }),
      area('expected', 'Expected behavior', { placeholder: 'What should happen instead?' }),
      area('actual', 'Actual behavior', { placeholder: 'What actually happened?' }),
      text('when_started', 'When did it start?', { placeholder: 'e.g. after the last update, or a specific date' }),
      text('device', 'Device information', { placeholder: 'e.g. iPhone 13, Samsung S22, PC client' }),
      text('game_version', 'Game version', { placeholder: 'e.g. 58.0 (from the settings screen)' }),
      area('additional', 'Additional information', { placeholder: 'Anything else staff should know' }),
    ],
  },
  {
    id: 'brawler_related',
    label: 'Brawler related',
    short: 'Brawler',
    description: 'A specific brawler, skin, gadget, star power or hypercharge.',
    accent: '#ef6358',
    fields: [
      text('brawler', 'Brawler', { required: true, placeholder: 'e.g. Mortis, Shelly, Gene…' }),
      text('skin', 'Skin, if relevant', { placeholder: 'e.g. Love Bunny Mortis' }),
      text('ability', 'Ability / Gadget / Star Power / Hypercharge', { placeholder: 'Which one is involved, if any?' }),
      area('what_happened', 'What happened?', { required: true, placeholder: 'Describe the behavior you saw in the match…' }),
      area('steps', 'Steps to reproduce', { placeholder: '1. … 2. … 3. …' }),
      area('expected', 'Expected behavior', { placeholder: 'What should happen instead?' }),
      area('actual', 'Actual behavior', { placeholder: 'What actually happened?' }),
      text('game_mode', 'Game mode', { placeholder: 'e.g. Gem Grab, Brawl Ball, Showdown…' }),
      text('game_version', 'Game version', { placeholder: 'e.g. 58.0' }),
      area('additional', 'Additional information', { placeholder: 'Screenshots/video links or anything else useful' }),
    ],
  },
  {
    id: 'server_related',
    label: 'Server related',
    short: 'Server',
    description: 'Connection, lag, disconnects or server errors.',
    accent: '#2e9f91',
    fields: [
      area('issue', 'What server-related issue occurred?', { required: true, placeholder: 'e.g. kicked out mid-match, endless loading…' }),
      text('error_message', 'Error / message shown', { placeholder: 'Any error text you saw, if any' }),
      text('when', 'Approximate time', { placeholder: 'e.g. today around 19:00 UTC' }),
      text('context', 'Game mode / action being performed', { placeholder: 'What were you doing when it happened?' }),
      { key: 'reproducible', label: 'Is the issue reproducible?', type: 'select', required: true, options: ['Yes', 'No', 'Not sure'] },
      text('game_version', 'Game version', { placeholder: 'e.g. 58.0' }),
      area('device_network', 'Device / network information', { placeholder: 'Device, Wi-Fi vs mobile data, region if known' }),
      area('additional', 'Additional information', { placeholder: 'Anything else that might help' }),
    ],
  },
  {
    id: 'gameplay',
    label: 'Gameplay',
    short: 'Gameplay',
    description: 'Mechanics, balancing, collisions or in-match behavior.',
    accent: '#ce9d40',
    fields: [
      text('game_mode', 'Game mode', { required: true, placeholder: 'e.g. Brawl Ball, Showdown…' }),
      area('what_happened', 'What happened?', { required: true, placeholder: 'Describe the gameplay issue…' }),
      area('steps', 'Steps to reproduce', { placeholder: '1. … 2. … 3. …' }),
      area('expected', 'Expected behavior', { placeholder: 'What should happen instead?' }),
      area('actual', 'Actual behavior', { placeholder: 'What actually happened?' }),
      text('brawlers', 'Brawler(s) involved', { placeholder: 'e.g. Shelly vs Mortis' }),
      text('game_version', 'Game version', { placeholder: 'e.g. 58.0' }),
      area('additional', 'Additional information', { placeholder: 'Replay/video links or anything else useful' }),
    ],
  },
  {
    id: 'ui_menu',
    label: 'UI / Menu',
    short: 'UI',
    description: 'Menus, buttons, shop or interface problems.',
    accent: '#7468b6',
    fields: [
      text('screen', 'Which screen / menu?', { required: true, placeholder: 'e.g. Shop, Brawlers, Settings…' }),
      text('element', 'What UI element is affected?', { placeholder: 'e.g. the "Buy" button, a badge, the leaderboard row' }),
      area('what_happened', 'What happened?', { required: true, placeholder: 'Describe the UI problem…' }),
      area('steps', 'Steps to reproduce', { placeholder: '1. … 2. … 3. …' }),
      area('expected', 'Expected behavior', { placeholder: 'What should happen instead?' }),
      area('actual', 'Actual behavior', { placeholder: 'What actually happened?' }),
      text('device', 'Device', { placeholder: 'e.g. iPhone 13, Samsung S22, PC client' }),
      text('game_version', 'Game version', { placeholder: 'e.g. 58.0' }),
      area('additional', 'Additional information', { placeholder: 'Screenshot link or anything else useful' }),
    ],
  },
  {
    id: 'account_progress',
    label: 'Account / Progress',
    short: 'Account',
    description: 'Progress, trophies, unlocks or account data that is wrong.',
    accent: '#ca4e44',
    fields: [
      text('player_tag', 'Player / account tag', { required: true, placeholder: 'e.g. #8PY2QLL or your in-game name' }),
      area('progress_affected', 'What progress is affected?', { required: true, placeholder: 'e.g. trophies, brawler levels, gems, unlockables' }),
      area('what_changed', 'What changed?', { required: true, placeholder: 'What did you notice was different?' }),
      area('expected_state', 'Expected state', { placeholder: 'What should your account look like?' }),
      area('current_state', 'Current state', { placeholder: 'What does it look like now?' }),
      text('when', 'When did it happen?', { placeholder: 'e.g. after the last update' }),
      text('game_version', 'Game version', { placeholder: 'e.g. 58.0' }),
      area('additional', 'Additional information', { placeholder: 'Anything else that might help' }),
    ],
  },
  {
    id: 'other',
    label: 'Other',
    short: 'Other',
    description: 'Anything that does not fit the categories above.',
    accent: '#687385',
    fields: [
      text('title', 'Title', { required: true, placeholder: 'A short summary of the bug', minLength: 3, maxLength: 160 }),
      area('description', 'Description', { required: true, placeholder: 'Describe the bug in detail…', minLength: 10 }),
      area('steps', 'Steps to reproduce', { placeholder: '1. … 2. … 3. …' }),
      area('expected', 'Expected behavior', { placeholder: 'What should happen instead?' }),
      area('actual', 'Actual behavior', { placeholder: 'What actually happened?' }),
      text('game_version', 'Game version', { placeholder: 'e.g. 58.0' }),
      text('device', 'Device', { placeholder: 'e.g. iPhone 13, Samsung S22, PC client' }),
      area('additional', 'Additional information', { placeholder: 'Anything else staff should know' }),
    ],
  },
];

export const REPORT_FLOW: Record<'community' | 'game', ReportFlowBranch> = {
  community: {
    id: 'community',
    label: 'Community issue',
    description: 'Reports about the community: scams, recoveries, sales and win trading.',
    options: [
      {
        id: 'account_scam',
        label: 'Account Scam',
        short: 'Scam',
        description: 'Someone scammed you or another player out of an account or payment.',
        accent: '#ca4e44',
        fields: [
          area('what_happened', 'What happened?', { required: true, placeholder: 'Describe the situation from the start…', minLength: 10 }),
          text('involved_player', 'Username / tag of the person involved', { required: true, placeholder: 'Their in-game name or account tag' }),
          text('when_happened', 'When did it happen?', { placeholder: 'e.g. yesterday, two weeks ago…' }),
          area('what_was_promised', 'What was promised?', { placeholder: 'e.g. account transfer, gems, a deal…' }),
          area('after_transaction', 'What happened after the transaction / agreement?', { placeholder: 'Did they disappear, block you, or deny it?' }),
          area('additional', 'Additional information', { placeholder: 'Chat logs, screenshots or anything else useful' }),
        ],
      },
      {
        id: 'account_recovery',
        label: 'Account Recovery',
        short: 'Recovery',
        description: 'You lost access to your account or it was taken over.',
        accent: '#ce9d40',
        fields: [
          text('player_tag', 'Account / player tag', { required: true, placeholder: 'e.g. #8PY2QLL or your in-game name' }),
          area('what_happened', 'What happened to the account?', { required: true, placeholder: 'Describe how the problem started…', minLength: 10 }),
          area('current_access', 'What access do you currently have?', { placeholder: 'Can you still log in? On which device?' }),
          area('lost_access', 'What access was lost?', { placeholder: 'e.g. cannot log in at all, email changed, password reset…' }),
          text('when_issue', 'Approximate time the issue occurred', { placeholder: 'e.g. last night around 22:00' }),
          area('additional', 'Additional information', { placeholder: 'Anything else that might help. Never share your password.' }),
        ],
      },
      {
        id: 'account_sale',
        label: 'Account Sale',
        short: 'Sale',
        description: 'An account was sold, bought or traded in violation of the rules.',
        accent: '#7468b6',
        fields: [
          text('player_tag', 'Player / account tag', { required: true, placeholder: 'e.g. #8PY2QLL or your in-game name' }),
          area('what_was_sold', 'What was being sold?', { required: true, placeholder: 'The account itself, gems, a brawler, a deal…' }),
          area('what_happened', 'What happened?', { required: true, placeholder: 'Describe the sale or attempted sale…', minLength: 10 }),
          text('who_involved', 'Who was involved?', { placeholder: 'Usernames/tags of everyone involved' }),
          text('when_transaction', 'When did the transaction occur?', { placeholder: 'e.g. three days ago' }),
          area('additional', 'Additional information', { placeholder: 'Proof, chat logs, or anything else useful' }),
        ],
      },
      {
        id: 'win_trading',
        label: 'Win Trading',
        short: 'Win trade',
        description: 'Players deliberately losing or arranging matches to farm trophies.',
        accent: '#2e9f91',
        fields: [
          area('player_tags', 'Player / account tags involved', { required: true, placeholder: 'List every account you suspect, one per line' }),
          area('what_happened', 'What happened?', { required: true, placeholder: 'Describe the observed behavior…', minLength: 10 }),
          area('match_info', 'Match / battle information if available', { placeholder: 'Game mode, replay link, match time…' }),
          text('when_happened', 'Approximate date / time', { placeholder: 'e.g. today around 18:00' }),
          area('why_win_trading', 'Why does it appear to be win trading?', { required: true, placeholder: 'e.g. instantly dying, matching the same player repeatedly, throwing games…' }),
          area('additional', 'Additional information', { placeholder: 'Anything else that might help' }),
        ],
      },
    ],
  },
  game: {
    id: 'game',
    label: 'Game issue',
    description: 'Problems inside the game itself: bugs, mods, exploits and cheats.',
    options: [
      {
        id: 'bug',
        label: 'Bug',
        short: 'Bug',
        description: 'Something in the game behaves incorrectly.',
        accent: '#ef6358',
        fields: [],
      },
      {
        id: 'mod',
        label: 'Mod',
        short: 'Mod',
        description: 'Modified clients, files or gameplay modifications.',
        accent: '#7468b6',
        fields: [
          text('modification', 'What modification is involved?', { required: true, placeholder: 'e.g. modified APK, speed hack, wall hack…' }),
          area('what_changes', 'What does it change?', { required: true, placeholder: 'Describe the effect of the modification…' }),
          text('player_involved', 'Player / account involved, if relevant', { placeholder: 'Their in-game name or tag' }),
          area('how_observed', 'How was it observed?', { required: true, placeholder: 'Where and when did you see it? Match replay, recording…' }),
          area('additional', 'Additional information', { placeholder: 'Anything else that might help' }),
        ],
      },
      {
        id: 'exploit',
        label: 'Exploit',
        short: 'Exploit',
        description: 'Abuse of a flaw to gain an unfair advantage.',
        accent: '#ce9d40',
        fields: [
          area('what_does', 'What does the exploit do?', { required: true, placeholder: 'Describe the advantage it gives…' }),
          text('where_occurs', 'Where does it occur?', { placeholder: 'e.g. in Showdown, in the shop, on the map…' }),
          area('steps', 'Steps to reproduce, if safely appropriate', { placeholder: 'Only share what staff need — do not publish how to abuse it' }),
          area('expected', 'Expected behavior', { placeholder: 'What should happen instead?' }),
          area('actual', 'Actual behavior', { placeholder: 'What actually happened?' }),
          text('game_version', 'Game version', { placeholder: 'e.g. 58.0' }),
          area('additional', 'Additional information', { placeholder: 'Anything else that might help' }),
        ],
      },
      {
        id: 'cheat',
        label: 'Cheat',
        short: 'Cheat',
        description: 'A player using cheats, bots or third-party tools.',
        accent: '#ca4e44',
        fields: [
          text('player_tag', 'Player / account tag', { required: true, placeholder: 'Their in-game name or tag' }),
          area('behavior', 'What behavior was observed?', { required: true, placeholder: 'Describe exactly what the player did…' }),
          text('match_mode', 'Match / game mode', { placeholder: 'e.g. Showdown, Brawl Ball…' }),
          text('when', 'Approximate date / time', { placeholder: 'e.g. yesterday around 21:00' }),
          area('why_cheat', 'Why does it appear to be cheating?', { required: true, placeholder: 'e.g. impossible reaction time, perfect aim through walls…' }),
          area('additional', 'Additional information', { placeholder: 'Replay link, recording, or anything else useful' }),
        ],
      },
    ],
  },
};

export const flowBranch = (issueType: string): ReportFlowBranch | undefined =>
  REPORT_FLOW[issueType as 'community' | 'game'];

/** Resolves a category/subtype id to its human label anywhere in the flow. */
export function optionLabel(id: string): string | undefined {
  for (const branch of Object.values(REPORT_FLOW)) {
    for (const option of branch.options) {
      if (option.id === id) return option.label;
      if (option.id === 'bug' && option.id === id) return option.label;
    }
  }
  for (const sub of BUG_SUBCATEGORIES) {
    if (sub.id === id) return sub.label;
  }
  return undefined;
}

/** Resolves a full option object (for building forms) by id. */
export function findOption(id: string): IssueOption | undefined {
  for (const branch of Object.values(REPORT_FLOW)) {
    for (const option of branch.options) {
      if (option.id === id) return option;
    }
  }
  return BUG_SUBCATEGORIES.find((s) => s.id === id);
}

export function humanize(value: string): string {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Canonical ticket workflow, shown to users and staff. */
export const WORKFLOW = [
  { step: '01', title: 'Submit a report', detail: 'Describe the issue and attach evidence. It becomes a ticket with its own ID.' },
  { step: '02', title: 'Moderator review', detail: 'A moderator checks the report and verifies whether the issue is real.' },
  { step: '03', title: 'Administrator handling', detail: 'Verified tickets are forwarded to administrators, who fix or resolve them.' },
  { step: '04', title: 'You see the outcome', detail: 'Track the status and history of your ticket at any time.' },
] as const;

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
