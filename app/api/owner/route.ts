import { ensureTelegramWebhook } from '@/lib/text/telegramSetup';
import { z } from 'zod';
import { config } from '@/lib/config';
import { body, ok, route } from '@/lib/http';
import { newId } from '@/lib/ids';
import { saveOwner } from '@/lib/store';
import type { Owner } from '@/lib/types';

export const POST = route(async (req: Request) => {
  await ensureTelegramWebhook();
  const input = z
    .object({
      name: z.string().min(1).max(80),
      phone: z.string().regex(/^\+[1-9]\d{6,14}$/, 'E.164, like +14155550123').optional(),
      channel: z.enum(['imessage', 'telegram', 'sms']),
      timezone: z.string().max(60).optional(),
    })
    .parse(await body(req));
  const c = config();
  const owner: Owner = {
    id: newId('own'),
    name: input.name,
    ...(input.phone ? { phone: input.phone } : {}),
    channel: input.channel,
    verified: false,
    timezone: input.timezone ?? 'America/Los_Angeles',
    briefAt: '07:30',
    quiet: { from: '21:00', to: '07:00' },
    stopped: false,
    runIds: [],
  };
  await saveOwner(owner);
  const verify =
    owner.channel === 'telegram'
      ? { telegramLink: c.telegramUsername ? `https://t.me/${c.telegramUsername}?start=${owner.id}` : undefined }
      : { textTo: c.sendblueFrom || undefined };
  return ok({ owner, verify }, 201);
});
