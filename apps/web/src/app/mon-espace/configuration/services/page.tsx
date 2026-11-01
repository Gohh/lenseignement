import { NetworkView } from '../NetworkView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Services et partenaires' };

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default function ServicesPage({ searchParams }: Props) {
  return <NetworkView view="services" searchParams={searchParams} />;
}
