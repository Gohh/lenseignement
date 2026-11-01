import { NetworkView } from './NetworkView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Établissements' };

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default function EtablissementsPage({ searchParams }: Props) {
  return <NetworkView view="etablissements" searchParams={searchParams} />;
}
