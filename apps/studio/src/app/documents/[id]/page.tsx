import { notFound } from 'next/navigation';
import { cms } from '@/lib/cms';
import { StudioEditor } from '@/components/editor';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DocumentEditorPage({ params }: Props) {
  const { id } = await params;

  const doc = await cms.documentService.getDocument(id).catch(() => null);
  if (!doc) notFound();

  const revisions = await cms.revRepo.listByDocumentId(id);
  const latestRev = revisions.length > 0 ? revisions[0] : null;

  return (
    <StudioEditor
      initialDocument={doc}
      initialRevision={latestRev}
      revisions={revisions}
    />
  );
}
