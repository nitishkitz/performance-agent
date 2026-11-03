'use client';

import { useEffect, useState } from 'react';

export function LiveClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    setInterval(() => setNow(new Date()), 1000);
  }, []);

  return <time>{now.toLocaleTimeString()}</time>;
}
