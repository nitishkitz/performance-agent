'use client';

import { useEffect, useState } from 'react';

export function Header() {
  const [profile, setProfile] = useState<{ name: string } | null>(null);

  useEffect(() => {
    fetch('/api/profile')
      .then((res) => res.json())
      .then(setProfile);
  }, []);

  return <header>{profile ? `Signed in as ${profile.name}` : 'Loading…'}</header>;
}
