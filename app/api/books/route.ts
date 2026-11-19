import { ApiErr, ok, route } from '@/lib/http';
import { mustGetRun } from '@/lib/store';
import { sortUpload, type Upload } from '@/lib/books/dot';

export const maxDuration = 60;

const MAX_FILES = 25;
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * The owner sends everything at once: multipart with `runId` plus any number of files under any field names.
 * Dot sorts them into expenses / sales / catalog / other / skipped. No need to say which file is which.
 */
export const POST = route(async (req: Request) => {
  const form = await req.formData().catch(() => {
    throw new ApiErr('invalid_request', 'Send multipart/form-data with runId and the files');
  });
  const runId = String(form.get('runId') ?? '');
  if (!runId) throw new ApiErr('invalid_request', 'runId is required');
  await mustGetRun(runId);
  const files = [...form.values()].filter((v): v is File => typeof v === 'object' && v !== null && 'arrayBuffer' in v);
  if (!files.length) throw new ApiErr('invalid_request', 'No files attached');
  if (files.length > MAX_FILES) throw new ApiErr('invalid_request', `At most ${MAX_FILES} files at once`);
  const uploads: Upload[] = await Promise.all(
    files.map(async (f) => {
      if (f.size > MAX_BYTES) return { name: f.name, bytes: f.size, text: null };
      const buf = Buffer.from(await f.arrayBuffer());
      const text = buf.toString('utf8');
      return { name: f.name || 'file', bytes: f.size, text: text.includes('�') && !/\.(csv|tsv|txt|json)$/i.test(f.name) ? null : text };
    }),
  );
  const sorted = await sortUpload(runId, uploads);
  const rows = sorted.reduce((n, f) => n + f.rows, 0);
  return ok({ ok: true, rows, files: sorted });
});
