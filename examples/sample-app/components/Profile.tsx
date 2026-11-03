'use client';

import { useEffect, useState } from 'react';
import { titleCase } from '../lib/format';

export function Profile() {
  const [profile, setProfile] = useState<{ name: string; email: string } | null>(null);

  useEffect(() => {
    fetch('/api/profile')
      .then((res) => res.json())
      .then(setProfile);
  }, []);

  if (!profile) return <p>Loading profile…</p>;
  return (
    <section>
      <h2>{titleCase(profile.name)}</h2>
      <p>{profile.email}</p>
    </section>
  );
}
