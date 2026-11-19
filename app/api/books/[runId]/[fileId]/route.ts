import { ApiErr, ok, route } from '@/lib/http';
import { mustGetRun } from '@/lib/store';
import { readSortedRows } from '@/lib/books/dot';

/** The source link for an owner's file: how Dot sorted it, plus the first 20 rows. */
export const GET = route(async (_req: Request, { params }: { params: Promise<{ runId: string; fileId: string }> }) => {
  const { runId, fileId } = await params;
  const run = await mustGetRun(runId);
  const file = run.books?.find((f) => f.id === fileId);
  const data = await readSortedRows(runId, fileId);
  if (!file || !data) throw new ApiErr('not_found', `No file ${fileId}`);
  return ok({ file, headers: data.headers, preview: data.rows.slice(0, 20) });
});
