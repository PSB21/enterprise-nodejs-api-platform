import { Router } from 'express';
import { z } from 'zod';

import { AppError } from '../../errors/app-error';

/**
 * A small sample API that stands in for a real upstream service, so the gateway can be
 * demonstrated without depending on anything outside this project. Data is in memory only.
 */
export const mockOrdersRouter = Router();

export const mockQuery = z.object({
  // Lets a demo produce slow responses and errors, so the analytics have something to show.
  delayMs: z.coerce.number().int().min(0).max(3000).default(0),
  fail: z.coerce.number().int().min(400).max(599).optional(),
});
export const mockOrderParams = z.object({ id: z.coerce.number().int().positive() });
export const mockOrderBody = z.object({
  item: z.string().trim().min(1).max(100),
  quantity: z.number().int().min(1).max(1000),
});

const orders = [
  { id: 1, item: 'Mechanical keyboard', quantity: 1, status: 'shipped' },
  { id: 2, item: 'USB-C cable', quantity: 3, status: 'processing' },
  { id: 3, item: 'Laptop stand', quantity: 1, status: 'delivered' },
];

async function simulate(query: unknown) {
  const { delayMs, fail } = mockQuery.parse(query);
  if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  if (fail) throw new AppError(fail, 'SIMULATED_FAILURE', `Simulated ${fail} response`);
}

mockOrdersRouter.get('/', async (req, res) => {
  await simulate(req.query);
  res.json({ success: true, data: orders });
});

mockOrdersRouter.get('/:id', async (req, res) => {
  await simulate(req.query);
  const { id } = mockOrderParams.parse(req.params);
  const order = orders.find((o) => o.id === id);

  if (!order) {
    throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found');
  }

  res.json({ success: true, data: order });
});

mockOrdersRouter.post('/', async (req, res) => {
  await simulate(req.query);
  const input = mockOrderBody.parse(req.body);

  // Not saved: every caller shares this demo, so it echoes a new order instead.
  res
    .status(201)
    .json({ success: true, data: { id: orders.length + 1, ...input, status: 'processing' } });
});
