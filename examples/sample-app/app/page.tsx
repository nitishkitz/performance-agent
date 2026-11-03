import { Profile } from '../components/Profile';
import { LiveClock } from '../components/LiveClock';

export default function Home() {
  return (
    <main>
      <img src="/hero.jpg" alt="Warehouse overview" loading="lazy" className="hero" />
      <Profile />
      <LiveClock />
    </main>
  );
}
