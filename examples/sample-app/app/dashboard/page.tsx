import { prisma } from '../../lib/db';

export default async function Dashboard() {
  const orders = await prisma.order.count();
  const customers = await prisma.customer.count();
  return (
    <section>
      <p>Orders: {orders}</p>
      <p>Customers: {customers}</p>
    </section>
  );
}
