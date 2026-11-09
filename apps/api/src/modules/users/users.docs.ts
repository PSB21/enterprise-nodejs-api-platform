import { z } from 'zod';

import { documentRoute } from '../../docs/registry';
import { publicUserSchema } from '../../docs/schemas';
import { changeRoleBody, listUsersQuery, userIdParams } from './users.schemas';

documentRoute({
  method: 'get',
  path: '/api/v1/users',
  tag: 'Users',
  summary: 'List users',
  auth: true,
  roles: ['ADMIN'],
  query: listUsersQuery,
  responses: {
    200: { description: 'A page of users', data: z.array(publicUserSchema), paginated: true },
  },
});

documentRoute({
  method: 'patch',
  path: '/api/v1/users/:id/role',
  tag: 'Users',
  summary: "Change a user's role",
  description: "Ends that user's sessions, so the new role applies when they next log in.",
  auth: true,
  roles: ['ADMIN'],
  params: userIdParams,
  body: changeRoleBody,
  responses: {
    200: { description: 'Role changed', data: z.object({ user: publicUserSchema }) },
    404: { description: 'No such user (USER_NOT_FOUND)' },
  },
});
