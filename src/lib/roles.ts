export const MEMBER_ROLES = ['Buyer', 'Seller', 'Exporter'] as const

export const STAFF_ROLES = ['support_agent', 'dispute_officer', 'finance_operator', 'risk_officer', 'admin', 'super_admin'] as const

export const PLATFORMS = ['web', 'ios', 'android', 'admin'] as const

export type MemberRole = (typeof MEMBER_ROLES)[number]
export type StaffRole = (typeof STAFF_ROLES)[number]
export type Platform = (typeof PLATFORMS)[number]

export type Capability =
  | 'cases:read'
  | 'cases:communicate'
  | 'disputes:decide'
  | 'finance:read'
  | 'refunds:execute'
  | 'payouts:execute'
  | 'risk:read'
  | 'compliance:review'
  | 'users:read'
  | 'users:manage'
  | 'marketplace:moderate'
  | 'notifications:send'
  | 'apps:manage'
  | 'inbox:manage'
  | 'staff:manage'
  | 'analytics:read'

const CAPABILITIES: Record<StaffRole, readonly (Capability | '*')[]> = {
  support_agent: ['cases:read', 'cases:communicate', 'users:read', 'inbox:manage', 'analytics:read'],
  dispute_officer: ['cases:read', 'cases:communicate', 'disputes:decide', 'users:read', 'analytics:read'],
  finance_operator: ['finance:read', 'refunds:execute', 'payouts:execute', 'users:read', 'analytics:read'],
  risk_officer: ['risk:read', 'compliance:review', 'users:read', 'users:manage', 'marketplace:moderate', 'analytics:read'],
  admin: ['cases:read', 'cases:communicate', 'disputes:decide', 'finance:read', 'risk:read', 'compliance:review', 'users:read', 'users:manage', 'marketplace:moderate', 'notifications:send', 'apps:manage', 'inbox:manage', 'analytics:read'],
  super_admin: ['*']
}

export function can(role: StaffRole | null | undefined, capability: Capability) {
  if (!role) return false
  const granted = CAPABILITIES[role]
  return granted.includes('*') || granted.includes(capability)
}

export const capabilitiesOf = (role: StaffRole) => (CAPABILITIES[role].includes('*') ? ['*'] : [...CAPABILITIES[role]])
