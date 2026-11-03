import { readFileSync } from 'node:fs';
import { prisma } from '../../../lib/db';

export async function GET() {
  const rates = JSON.parse(readFileSync('./data/tax-rates.json', 'utf8'));
  const orders = await prisma.order.findMany();

  const result = [];
  for (const order of orders) {
    const customer = await prisma.customer.findUnique({ where: { id: order.customerId } });
    result.push({ ...order, customer, tax: rates[order.region] });
  }

  const fx = await fetch('https://fx.example.test/latest');
  return Response.json({ orders: result, fx: await fx.json() });
}
