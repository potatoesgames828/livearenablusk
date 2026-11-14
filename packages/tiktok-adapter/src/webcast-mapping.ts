import type { RawSourceEvent } from '@live-arena/event-engine';

/**
 * Mapeamento de mensagens "Webcast" (formato usado pelo TikTok-Live-Connector
 * e serviços derivados) para o formato bruto interno. Campos ausentes NÃO são
 * inventados: se a fonte não informar, o campo fica indefinido.
 */
type Any = Record<string, unknown> | undefined;

function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v);
  return s.length ? s : undefined;
}
function num(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
}
function obj(v: unknown): Any {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : undefined;
}

export function mapUser(data: Any): RawSourceEvent['user'] {
  const u = obj(data?.user) ?? data;
  const id = str(u?.userId) ?? str(u?.id);
  if (!id) return undefined;
  const avatar = obj(u?.profilePicture);
  const urls = (avatar?.url ?? avatar?.urls ?? avatar?.urlList) as unknown;
  const avatarUrl = Array.isArray(urls) ? str(urls[0]) : undefined;
  return { id, username: str(u?.uniqueId), nickname: str(u?.nickname), avatarUrl };
}

function msgId(data: Any): string | undefined {
  const common = obj(data?.common);
  return str(common?.msgId) ?? str(data?.msgId);
}

function ts(data: Any): number | undefined {
  const common = obj(data?.common);
  return num(common?.createTime) ?? num(data?.createTime);
}

export function mapChat(data: Any): RawSourceEvent {
  return { sourceEventId: msgId(data), source: 'tiktok', type: 'CHAT', user: mapUser(data), payload: { comment: str(data?.comment) ?? '' }, timestamp: ts(data) };
}

export function mapGift(data: Any): RawSourceEvent {
  const details = obj(data?.giftDetails) ?? obj(data?.gift);
  const extended = obj(data?.extendedGiftInfo);
  const giftType = num(details?.giftType ?? data?.giftType);
  const payload: Record<string, unknown> = {
    giftId: str(data?.giftId) ?? str(details?.id) ?? 'unknown',
    repeatCount: Math.max(1, num(data?.repeatCount) ?? 1),
  };
  const name = str(details?.giftName) ?? str(extended?.name);
  if (name) payload.giftName = name;
  const diamonds = num(details?.diamondCount) ?? num(extended?.diamond_count);
  if (diamonds !== undefined) payload.diamondValue = diamonds;
  if (typeof data?.repeatEnd === 'boolean') payload.repeatEnd = data.repeatEnd;
  else if (num(data?.repeatEnd) !== undefined) payload.repeatEnd = num(data?.repeatEnd) === 1;
  // giftType 1 = presente sequenciável (streak) no protocolo Webcast.
  if (giftType !== undefined) payload.streakable = giftType === 1;
  const group = str(data?.groupId);
  if (group) payload.groupId = group;
  return { sourceEventId: msgId(data), source: 'tiktok', type: 'GIFT', user: mapUser(data), payload, timestamp: ts(data) };
}

export function mapLike(data: Any): { likes: number; total?: number; user: RawSourceEvent['user'] } {
  return { likes: Math.max(0, num(data?.likeCount) ?? num(data?.count) ?? 0), total: num(data?.totalLikeCount) ?? num(data?.total), user: mapUser(data) };
}

export function mapSocial(type: 'FOLLOW' | 'SHARE', data: Any): RawSourceEvent {
  return { sourceEventId: msgId(data), source: 'tiktok', type, user: mapUser(data), payload: {}, timestamp: ts(data) };
}

export function mapMember(data: Any): RawSourceEvent {
  return { sourceEventId: msgId(data), source: 'tiktok', type: 'MEMBER', user: mapUser(data), payload: {}, timestamp: ts(data) };
}

export function mapRoomUser(data: Any): RawSourceEvent | null {
  const vc = num(data?.viewerCount) ?? num(data?.total);
  if (vc === undefined) return null;
  return { sourceEventId: msgId(data), source: 'tiktok', type: 'ROOM_USER', payload: { viewerCount: vc }, timestamp: ts(data) };
}

export function mapSubscription(data: Any): RawSourceEvent {
  return { sourceEventId: msgId(data), source: 'tiktok', type: 'SUBSCRIPTION', user: mapUser(data), payload: {}, timestamp: ts(data) };
}

export function mapBattle(data: Any): RawSourceEvent {
  const payload: Record<string, unknown> = {};
  const battleId = str(data?.battleId);
  if (battleId) payload.battleId = battleId;
  const status = num(data?.battleStatus) ?? num(data?.action);
  if (status !== undefined) payload.status = status;
  return { sourceEventId: msgId(data), source: 'tiktok', type: 'BATTLE', payload, timestamp: ts(data) };
}
