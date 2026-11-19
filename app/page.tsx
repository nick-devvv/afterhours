'use client';
// Home: the night city, a business lookup, optional books upload and texting, and "Send in the crew".
import dynamic from 'next/dynamic';

const Landing = dynamic(() => import('./_ui/Landing').then((m) => m.Landing), { ssr: false });

export default function Home() {
  return <Landing />;
}
