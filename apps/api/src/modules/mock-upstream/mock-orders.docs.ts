import { z } from 'zod';

import { documentRoute } from '../../docs/registry';
import { mockOrderBody, mockOrderParams, mockQuery } from './mock-orders.routes';

const order = z.object({
  id: z.number().int(),
  item: z.string(),
  quantity: z.number().int(),
  status: z.string(),
});
const description =
  'A sample upstream service used by the demo. Normally called through the gateway. ' +
  '`delayMs` and `fail` simulate slow responses and errors.';

documentRoute({
  method: 'get',
  path: '/mock/orders',
  tag: 'Sample upstream',
  summary: 'List orders',
  description,
  query: mockQuery,
  responses: { 200: { description: 'All orders', data: z.array(order) } },
});

documentRoute({
  method: 'get',
  path: '/mock/orders/:id',
  tag: 'Sample upstream',
  summary: 'Get an order',
  description,
  params: mockOrderParams,
  query: mockQuery,
  responses: {
    200: { description: 'The order', data: order },
    404: { description: 'Not found (ORDER_NOT_FOUND)' },
  },
});

documentRoute({
  method: 'post',
  path: '/mock/orders',
  tag: 'Sample upstream',
  summary: 'Create an order (echoed, not saved)',
  description,
  query: mockQuery,
  body: mockOrderBody,
  responses: { 201: { description: 'The new order', data: order } },
});
