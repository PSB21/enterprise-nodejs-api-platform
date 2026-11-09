export const EVENT_TYPES = [
  'access-request.created',
  'access-request.approved',
  'access-request.rejected',
  'access-request.revoked',
  'api-key.created',
  'api-key.revoked',
  'user.role-changed',
  'usage.quota-warning',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

/**
 * Something that happened, published after it was saved. Consumers must be idempotent: a
 * message can be delivered more than once, so the id is used to ignore repeats.
 */
export interface DomainEvent {
  id: string;
  type: EventType;
  occurredAt: string;
  /** The user who caused it, or null for the system. */
  actorId: string | null;
  subject: { type: string; id: string };
  data: Record<string, unknown>;
}

export type NewEvent = Omit<DomainEvent, 'id' | 'occurredAt'>;
