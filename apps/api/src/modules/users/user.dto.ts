import type { User } from '../../generated/prisma/client';

export type PublicUser = Pick<User, 'id' | 'name' | 'email' | 'role' | 'createdAt'>;

/**
 * The only way user data leaves the API. Listing allowed fields, rather than deleting secret ones,
 * means a column added later stays private unless someone adds it here on purpose.
 */
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}
