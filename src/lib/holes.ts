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
    const pairs: HolePair[] = [];
    for (let i = 0; i < n; i++) {
      const j = (i - k + n) % n;
      pairs.push({ refIndex: i, ref: ref[i], candIndex: j, cand: cand[j] });
    }
    return { kind: 'unique', k, pairs };
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

export interface EvaluateInput {
  refRaw: string;
  candRaw: string;
  refArrow: number;
  candArrow: number;
}

export type Verdict =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'ok'; n: number; analysis: Analysis };

function clampArrow(arrow: number, n: number): number {
  if (!Number.isFinite(arrow) || arrow < 0) return 0;
  return Math.min(Math.trunc(arrow), n - 1);
}

/** 汇总录入并给出结论；任一输入非法或尚未填完时不产生结论。 */
export function evaluate({ refRaw, candRaw, refArrow, candArrow }: EvaluateInput): Verdict {
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
  const analysis = analyze(
    ref.holes,
    clampArrow(refArrow, n),
    cand.holes,
    clampArrow(candArrow, n),
  );
  return { status: 'ok', n, analysis };
}
