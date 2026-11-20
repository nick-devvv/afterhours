// The demo owner: the team's own Telegram chat, set once in OWNER_TELEGRAM_CHAT_ID. Runs started without an
// ownerId text this chat, so nobody has to reconnect Telegram on every browser. Only that one chat id, which
// is also in TEXT_ALLOWLIST: we never text anyone else this way.
import { newId } from '../ids';
import { findOwner, saveOwner } from '../store';
import type { Owner } from '../types';

export async function defaultOwnerId(): Promise<string | undefined> {
  const chat = process.env.OWNER_TELEGRAM_CHAT_ID?.trim();
  if (!chat) return undefined;
  const found = await findOwner({ telegramChatId: chat });
  if (found) return found.id;
  const owner: Owner = {
    id: newId('own'),
    name: process.env.OWNER_NAME?.trim() || 'there',
    channel: 'telegram',
    telegramChatId: chat,
    verified: true,
    timezone: 'America/Los_Angeles',
    briefAt: '07:30',
    quiet: { from: '21:00', to: '07:00' },
    stopped: false,
    runIds: [],
  };
  await saveOwner(owner);
  return owner.id;
}
