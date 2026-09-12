/**
 * 换网版定位孔相位校验核心逻辑（纯函数，不调用任何在线服务）。
 *
 * 约定：
 * - 每环孔以 A/B/C/D 标记，输入为顺时针孔序，空格分隔。
 * - 用户为每环选定一枚带向外箭头的起始孔；以该孔为索引 0，沿顺时针编号。
 * - 零相位：两枚箭头重合。待装版顺时针移动 k 孔后，其箭头落在参考环索引 k，
 *   参考孔 i 对应待装孔 (i - k + n) mod n。仅枚举顺时针相位，禁止反转匹配。
 */

export type Hole = 'A' | 'B' | 'C' | 'D';

export const MIN_HOLES = 4;
export const MAX_HOLES = 48;

const HOLE_PATTERN = /^[ABCD]$/;

export type ParseResult = { ok: true; holes: Hole[] } | { ok: false; message: string };

/** 解析孔序文本：忽略首尾及连续空格，仅允许 A/B/C/D 单字母，孔数 4–48。 */
export function parseSequence(raw: string): ParseResult {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return { ok: false, message: '孔序为空' };
  }
  for (const token of tokens) {
    if (!HOLE_PATTERN.test(token)) {
      return { ok: false, message: `含非法片段“${token}”，仅允许 A、B、C、D 单字母` };
    }
  }
  if (tokens.length < MIN_HOLES || tokens.length > MAX_HOLES) {
    return { ok: false, message: `孔数 ${tokens.length} 超出 ${MIN_HOLES}–${MAX_HOLES} 范围` };
  }
  return { ok: true, holes: tokens as Hole[] };
}

/** 以箭头孔为索引 0 重新编号（沿顺时针旋转序列）。 */
export function rotate<T>(seq: readonly T[], start: number): T[] {
  const n = seq.length;
  const s = ((start % n) + n) % n;
  return [...seq.slice(s), ...seq.slice(0, s)];
}

export interface HolePair {
  /** 参考环索引（箭头孔为 0，顺时针编号） */
  refIndex: number;
  ref: Hole;
  /** 待装环索引（箭头孔为 0，顺时针编号） */
  candIndex: number;
  cand: Hole;
}

/** 按相位 k 生成全部孔对：参考孔 i 对应待装孔 (i - k + n) mod n（与 analyze 同一映射）。 */
export function pairsForPhase(
  ref: readonly Hole[],
  cand: readonly Hole[],
  k: number,
): HolePair[] {
  const n = ref.length;
  const pairs: HolePair[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i - k + n) % n;
    pairs.push({ refIndex: i, ref: ref[i], candIndex: j, cand: cand[j] });
  }
  return pairs;
}

export type Analysis =
  | { kind: 'unique'; k: number; pairs: HolePair[] }
  | { kind: 'none'; k: number; mismatchCount: number; firstMismatch: HolePair }
  | { kind: 'multiple'; ks: number[] };

/**
 * 枚举 k = 0..n-1：
 * - 恰有一个逐孔相等的相位 → unique（含移动孔数 k 与全部孔对）；
 * - 没有完整匹配 → none（错孔数最少、再按 k 最小选出诊断相位与首个错孔）；
 * - 多个完整匹配 → multiple（列出全部 k）。
 */
export function analyze(
  refSeq: readonly Hole[],
  refArrow: number,
  candSeq: readonly Hole[],
  candArrow: number,
): Analysis {
  const n = refSeq.length;
  const ref = rotate(refSeq, refArrow);
  const cand = rotate(candSeq, candArrow);

  const mismatchesByK: number[][] = [];
  const fullMatches: number[] = [];
  for (let k = 0; k < n; k++) {
    const bad: number[] = [];
    for (let i = 0; i < n; i++) {
      if (ref[i] !== cand[(i - k + n) % n]) bad.push(i);
    }
    mismatchesByK.push(bad);
    if (bad.length === 0) fullMatches.push(k);
  }

  if (fullMatches.length === 1) {
    const k = fullMatches[0];
    return { kind: 'unique', k, pairs: pairsForPhase(ref, cand, k) };
  }

  if (fullMatches.length > 1) {
    return { kind: 'multiple', ks: fullMatches };
  }

  // 无完整匹配：错孔数最少优先，并列时取 k 最小。
  let bestK = 0;
  for (let k = 1; k < n; k++) {
    if (mismatchesByK[k].length < mismatchesByK[bestK].length) bestK = k;
  }
  const first = mismatchesByK[bestK][0];
  const j = (first - bestK + n) % n;
  return {
    kind: 'none',
    k: bestK,
    mismatchCount: mismatchesByK[bestK].length,
    firstMismatch: { refIndex: first, ref: ref[first], candIndex: j, cand: cand[j] },
  };
}

/** 一条实物观察：在参考环某索引位置是否看见待装版箭头。 */
export interface Observation {
  /** 参考环索引（箭头孔为 0，顺时针编号） */
  refIndex: number;
  /** true = 看见待装版箭头；false = 未见 */
  seen: boolean;
}

export type RecordObservationResult =
  | { ok: true; observations: Observation[] }
  | { ok: false; message: string };

/**
 * 记录一条观察：同一参考索引再次提交替换旧值，结果按索引升序保存。
 * 索引越界（非整数或超出 0..n-1）时报错，不返回新观察，调用方保留旧值。
 */
export function recordObservation(
  observations: readonly Observation[],
  n: number,
  refIndex: number,
  seen: boolean,
): RecordObservationResult {
  if (!Number.isInteger(refIndex) || refIndex < 0 || refIndex >= n) {
    return { ok: false, message: `参考索引须为 0–${n - 1} 的整数` };
  }
  const next = observations.filter(o => o.refIndex !== refIndex);
  next.push({ refIndex, seen });
  next.sort((a, b) => a.refIndex - b.refIndex);
  return { ok: true, observations: next };
}

/**
 * 依据观察筛选既有候选相位：候选 k 即箭头在参考环上的新位置。
 * 看见箭头（i, seen）→ 仅保留 k === i；未见 → 排除 k === i。
 * 仅复用既有候选与映射，不重新定义顺时针方向。
 */
export function filterCandidates(
  ks: readonly number[],
  observations: readonly Observation[],
): number[] {
  return ks.filter(k =>
    observations.every(o => (o.seen ? o.refIndex === k : o.refIndex !== k)),
  );
}

/** 观察筛选结论：在「相位不唯一」基础上按观察逐步排除。 */
export type Resolution =
  | { kind: 'pending'; remaining: number[] } // 仍有多个候选，继续观察
  | { kind: 'resolved'; k: number; pairs: HolePair[] } // 收敛为唯一相位
  | { kind: 'contradiction' }; // 全部排除：观察与孔序不一致

export interface EvaluateInput {
  refRaw: string;
  candRaw: string;
  refArrow: number;
  candArrow: number;
  /** 实物观察记录（可选）；仅在多个完整匹配相位时参与筛选 */
  observations?: readonly Observation[];
}

export type Verdict =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'ok'; n: number; analysis: Analysis; resolution: Resolution | null };

function clampArrow(arrow: number, n: number): number {
  if (!Number.isFinite(arrow) || arrow < 0) return 0;
  return Math.min(Math.trunc(arrow), n - 1);
}

/** 汇总录入并给出结论；任一输入非法或尚未填完时不产生结论。 */
export function evaluate({
  refRaw,
  candRaw,
  refArrow,
  candArrow,
  observations,
}: EvaluateInput): Verdict {
  if (refRaw.trim() === '' || candRaw.trim() === '') {
    return { status: 'idle' };
  }
  const ref = parseSequence(refRaw);
  if (!ref.ok) return { status: 'error', message: `参考版孔序：${ref.message}` };
  const cand = parseSequence(candRaw);
  if (!cand.ok) return { status: 'error', message: `待装版孔序：${cand.message}` };
  if (ref.holes.length !== cand.holes.length) {
    return {
      status: 'error',
      message: `两环孔数必须相同（参考版 ${ref.holes.length} 孔，待装版 ${cand.holes.length} 孔）`,
    };
  }
  const n = ref.holes.length;
  const refArrowClamped = clampArrow(refArrow, n);
  const candArrowClamped = clampArrow(candArrow, n);
  const analysis = analyze(ref.holes, refArrowClamped, cand.holes, candArrowClamped);

  // 仅「相位不唯一」时按观察筛选候选；唯一可装与无匹配结论不受影响。
  let resolution: Resolution | null = null;
  if (analysis.kind === 'multiple') {
    const remaining = filterCandidates(analysis.ks, observations ?? []);
    if (remaining.length === 1) {
      const k = remaining[0];
      resolution = {
        kind: 'resolved',
        k,
        pairs: pairsForPhase(
          rotate(ref.holes, refArrowClamped),
          rotate(cand.holes, candArrowClamped),
          k,
        ),
      };
    } else if (remaining.length === 0) {
      resolution = { kind: 'contradiction' };
    } else {
      resolution = { kind: 'pending', remaining };
    }
  }
  return { status: 'ok', n, analysis, resolution };
}
