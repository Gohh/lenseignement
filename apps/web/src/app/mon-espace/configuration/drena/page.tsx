import { NetworkView } from '../NetworkView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Directions régionales' };

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default function DirectionsPage({ searchParams }: Props) {
  return <NetworkView view="drena" searchParams={searchParams} />;
}
