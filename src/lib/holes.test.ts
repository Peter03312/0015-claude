import { describe, expect, it } from 'vitest';
import {
  analyze,
  evaluate,
  filterCandidates,
  pairsForPhase,
  parseObservationIndex,
  parseSequence,
  recordObservation,
  rotate,
  type Hole,
  type Observation,
} from './holes';

const seq = (s: string): Hole[] => s.split(' ') as Hole[];

describe('parseSequence 录入解析', () => {
  it('忽略首尾及连续空格', () => {
    const r = parseSequence('  A  B   C    D  ');
    expect(r).toEqual({ ok: true, holes: ['A', 'B', 'C', 'D'] });
  });

  it('拒绝非法字符与非法片段', () => {
    for (const raw of ['A B E D', 'A B 1 D', 'a b c d', 'AB C D', 'A B C D-']) {
      const r = parseSequence(raw);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/非法/);
    }
  });

  it('孔数边界：3 拒绝、4 与 48 接受、49 拒绝', () => {
    expect(parseSequence('A B C').ok).toBe(false);
    expect(parseSequence('A B C D').ok).toBe(true);
    expect(parseSequence(Array(48).fill('A').join(' ')).ok).toBe(true);
    const over = parseSequence(Array(49).fill('A').join(' '));
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.message).toMatch(/4–48/);
  });

  it('空文本', () => {
    expect(parseSequence('   ').ok).toBe(false);
  });

  it('制表符不是分隔符：制表分隔的四孔不被当作合法序列', () => {
    for (const raw of ['A\tB\tC\tD', 'A\tB C D', 'A B C\tD']) {
      const r = parseSequence(raw);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/非法/);
    }
    // 只含制表符等非空格白：不是空序列而是含非法片段
    expect(parseSequence('\t\t').ok).toBe(false);
  });

  it('不换行空格与全角空格不是分隔符', () => {
    // U+00A0 NO-BREAK SPACE、U+3000 IDEOGRAPHIC SPACE 均不划分孔位
    for (const raw of [
      'A B C D',
      'A　B　C　D',
      'A B C D',
      'A B C　D',
    ]) {
      const r = parseSequence(raw);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/非法/);
    }
  });
});

describe('rotate 箭头重编号', () => {
  it('以箭头孔为索引 0 沿顺时针编号', () => {
    expect(rotate(seq('A B C D'), 0)).toEqual(seq('A B C D'));
    expect(rotate(seq('A B C D'), 2)).toEqual(seq('C D A B'));
    expect(rotate(seq('A B C D'), 3)).toEqual(seq('D A B C'));
  });
});

describe('analyze 索引方向', () => {
  it('待装环顺时针错位 1 孔时 k=1（而非 n-1）', () => {
    // 参考 A B C D；待装 B C D A = 参考环逆时针错一位的读法，
    // 待装版须顺时针移动 1 孔使箭头落在参考索引 1。
    const r = analyze(seq('A B C D'), 0, seq('B C D A'), 0);
    expect(r.kind).toBe('unique');
    if (r.kind !== 'unique') return;
    expect(r.k).toBe(1);
    // 参考孔 i 对应待装孔 (i-k+n) mod n
    expect(r.pairs.map(p => p.candIndex)).toEqual([3, 0, 1, 2]);
    expect(r.pairs.map(p => p.ref)).toEqual(seq('A B C D'));
    expect(r.pairs.map(p => p.cand)).toEqual(seq('A B C D'));
  });

  it('k 即箭头在参考环上的新位置', () => {
    // 参考 A B C D，待装 D A B C：待装箭头(索引0的D)要落在参考索引 3。
    const r = analyze(seq('A B C D'), 0, seq('D A B C'), 0);
    expect(r).toMatchObject({ kind: 'unique', k: 3 });
  });

  it('箭头起始孔选择影响相位', () => {
    // 同一对待装/参考孔序，仅改变参考环箭头位置。
    const a = analyze(seq('A B C D'), 0, seq('A B C D'), 0);
    expect(a).toMatchObject({ kind: 'unique', k: 0 });
    // 参考环箭头改到索引 1：重编号后参考为 B C D A，需 k=3。
    const b = analyze(seq('A B C D'), 1, seq('A B C D'), 0);
    expect(b).toMatchObject({ kind: 'unique', k: 3 });
    // 待装环箭头改到索引 2：待装重编号为 C D A B，需 k=2。
    const c = analyze(seq('A B C D'), 0, seq('A B C D'), 2);
    expect(c).toMatchObject({ kind: 'unique', k: 2 });
  });

  it('非周期序列仅有零相位', () => {
    const r = analyze(seq('A A B C'), 0, seq('A A B C'), 0);
    expect(r).toMatchObject({ kind: 'unique', k: 0 });
  });
});

describe('analyze 周期歧义', () => {
  it('ABAB 周期为 2：k=0 与 k=2 均完整匹配', () => {
    const r = analyze(seq('A B A B'), 0, seq('A B A B'), 0);
    expect(r).toEqual({ kind: 'multiple', ks: [0, 2] });
  });

  it('AAAA 全部相位均匹配', () => {
    const r = analyze(seq('A A A A'), 0, seq('A A A A'), 0);
    expect(r).toEqual({ kind: 'multiple', ks: [0, 1, 2, 3] });
  });

  it('ABCABC 周期为 3：k=0 与 k=3', () => {
    const r = analyze(seq('A B C A B C'), 0, seq('A B C A B C'), 0);
    expect(r).toEqual({ kind: 'multiple', ks: [0, 3] });
  });

  it('48 孔周期序列仍正确枚举全部相位', () => {
    const ring = Array.from({ length: 48 }, (_, i) => 'ABCD'[i % 4] as Hole);
    const r = analyze(ring, 0, ring, 0);
    expect(r.kind).toBe('multiple');
    if (r.kind !== 'multiple') return;
    expect(r.ks).toEqual(Array.from({ length: 12 }, (_, i) => i * 4));
  });
});

describe('analyze 无匹配诊断', () => {
  it('错孔数最少优先，首个错孔按参考索引最小给出', () => {
    // 参考 A A A B，待装 A A C D：k=0 与 k=1 均错 2 孔，取 k=0。
    const r = analyze(seq('A A A B'), 0, seq('A A C D'), 0);
    expect(r.kind).toBe('none');
    if (r.kind !== 'none') return;
    expect(r.k).toBe(0);
    expect(r.mismatchCount).toBe(2);
    expect(r.firstMismatch).toEqual({ refIndex: 2, ref: 'A', candIndex: 2, cand: 'C' });
  });

  it('诊断相位可以不是 k=0', () => {
    // 参考 A B C A，待装 A C B D：k=3 仅错 2 孔，其余相位错更多。
    const r = analyze(seq('A B C A'), 0, seq('A C B D'), 0);
    expect(r.kind).toBe('none');
    if (r.kind !== 'none') return;
    expect(r.k).toBe(3);
    expect(r.mismatchCount).toBe(2);
    expect(r.firstMismatch).toEqual({ refIndex: 0, ref: 'A', candIndex: 1, cand: 'C' });
  });

  it('并列最少错孔时取 k 最小', () => {
    // 参考 A A A A，待装 A A A B：每个相位都恰错 1 孔，取 k=0。
    const r = analyze(seq('A A A A'), 0, seq('A A A B'), 0);
    expect(r).toMatchObject({ kind: 'none', k: 0, mismatchCount: 1 });
  });
});

describe('evaluate 录入汇总', () => {
  it('任一孔序未填时为 idle，不产生结论', () => {
    expect(evaluate({ refRaw: '', candRaw: '', refArrow: 0, candArrow: 0 }).status).toBe('idle');
    expect(evaluate({ refRaw: 'A B C D', candRaw: '  ', refArrow: 0, candArrow: 0 }).status).toBe('idle');
  });

  it('制表符/全角空白不算“未填”，按非法片段报错而非静默', () => {
    const tab = evaluate({ refRaw: '\t\t', candRaw: 'A B C D', refArrow: 0, candArrow: 0 });
    expect(tab.status).toBe('error');
    if (tab.status === 'error') expect(tab.message).toMatch(/参考版孔序/);
    const ideo = evaluate({ refRaw: 'A B C D', candRaw: 'A　B　C　D', refArrow: 0, candArrow: 0 });
    expect(ideo.status).toBe('error');
  });

  it('非法字符立即报错并指明哪一环', () => {
    const r = evaluate({ refRaw: 'A B X D', candRaw: 'A B C D', refArrow: 0, candArrow: 0 });
    expect(r).toMatchObject({ status: 'error' });
    if (r.status === 'error') expect(r.message).toMatch(/参考版孔序：含非法片段“X”/);
  });

  it('孔数越界报错', () => {
    const r = evaluate({ refRaw: 'A B C', candRaw: 'A B C', refArrow: 0, candArrow: 0 });
    expect(r).toMatchObject({ status: 'error' });
    if (r.status === 'error') expect(r.message).toMatch(/超出 4–48 范围/);
  });

  it('两环孔数不同报错', () => {
    const r = evaluate({ refRaw: 'A B C D', candRaw: 'A B C D A', refArrow: 0, candArrow: 0 });
    expect(r).toMatchObject({ status: 'error' });
    if (r.status === 'error') expect(r.message).toMatch(/必须相同（参考版 4 孔，待装版 5 孔）/);
  });

  it('合法录入给出唯一相位结论', () => {
    const r = evaluate({ refRaw: ' A  B C D ', candRaw: 'B C D A', refArrow: 0, candArrow: 0 });
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.n).toBe(4);
    expect(r.analysis).toMatchObject({ kind: 'unique', k: 1 });
  });

  it('箭头索引越界时防御性收敛，不崩溃', () => {
    const r = evaluate({ refRaw: 'A B C D', candRaw: 'A B C D', refArrow: 99, candArrow: -3 });
    expect(r.status).toBe('ok');
  });
});

describe('pairsForPhase 孔对映射', () => {
  it('与 analyze 唯一相位的孔对一致', () => {
    const ref = rotate(seq('A B C D'), 0);
    const cand = rotate(seq('B C D A'), 0);
    expect(pairsForPhase(ref, cand, 1)).toEqual([
      { refIndex: 0, ref: 'A', candIndex: 3, cand: 'A' },
      { refIndex: 1, ref: 'B', candIndex: 0, cand: 'B' },
      { refIndex: 2, ref: 'C', candIndex: 1, cand: 'C' },
      { refIndex: 3, ref: 'D', candIndex: 2, cand: 'D' },
    ]);
  });
});

describe('parseObservationIndex 观察索引十进制校验', () => {
  it('仅接受普通十进制整数', () => {
    expect(parseObservationIndex('0')).toBe(0);
    expect(parseObservationIndex('2')).toBe(2);
    expect(parseObservationIndex(' 3 ')).toBe(3); // 首尾普通空格允许
    expect(parseObservationIndex('47')).toBe(47);
  });

  it('拒绝十六进制文本（即使 Number 能解释为整数）', () => {
    for (const raw of ['0x0', '0X2', '0x10', '0xff']) {
      expect(parseObservationIndex(raw)).toBeNull();
    }
  });

  it('拒绝指数格式文本', () => {
    for (const raw of ['2e0', '1e1', '2E0', '0e0']) {
      expect(parseObservationIndex(raw)).toBeNull();
    }
  });

  it('拒绝其它非十进制整数写法', () => {
    for (const raw of [
      '',
      '   ',
      'x',
      '1.5',
      '2.0',
      '+1',
      '-1',
      '1 2',
      '1\n2',
      ' 1\t',
      ' 1 ', // 不换行空格
      '１', // 全角数字
      'Infinity',
      'NaN',
    ]) {
      expect(parseObservationIndex(raw)).toBeNull();
    }
  });
});

describe('recordObservation 观察记录', () => {
  it('同一索引再次提交替换旧值', () => {
    const first = recordObservation([], 4, 1, true);
    expect(first).toEqual({ ok: true, observations: [{ refIndex: 1, seen: true }] });
    if (!first.ok) return;
    const second = recordObservation(first.observations, 4, 1, false);
    expect(second).toEqual({ ok: true, observations: [{ refIndex: 1, seen: false }] });
  });

  it('不同索引按参考索引升序保存', () => {
    const a = recordObservation([], 6, 4, true);
    if (!a.ok) return;
    const b = recordObservation(a.observations, 6, 1, false);
    expect(b).toEqual({
      ok: true,
      observations: [
        { refIndex: 1, seen: false },
        { refIndex: 4, seen: true },
      ],
    });
  });

  it('索引越界（含非整数）报错且不产生新观察', () => {
    const base: Observation[] = [{ refIndex: 0, seen: true }];
    for (const bad of [-1, 4, 1.5, NaN]) {
      const r = recordObservation(base, 4, bad, false);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/0–3/);
    }
  });
});

describe('filterCandidates 观察筛选', () => {
  it('肯定观察仅保留箭头落在该参考索引的候选', () => {
    expect(filterCandidates([0, 2], [{ refIndex: 2, seen: true }])).toEqual([2]);
    expect(filterCandidates([0, 1, 2, 3], [{ refIndex: 1, seen: true }])).toEqual([1]);
  });

  it('否定观察排除箭头落在该参考索引的候选', () => {
    expect(filterCandidates([0, 2], [{ refIndex: 0, seen: false }])).toEqual([2]);
    expect(
      filterCandidates(
        [0, 1, 2, 3],
        [
          { refIndex: 0, seen: false },
          { refIndex: 1, seen: false },
        ],
      ),
    ).toEqual([2, 3]);
  });

  it('肯定与否定组合可收敛唯一，也可能全部排除', () => {
    expect(
      filterCandidates(
        [0, 1, 2, 3],
        [
          { refIndex: 0, seen: false },
          { refIndex: 3, seen: true },
        ],
      ),
    ).toEqual([3]);
    // 两个位置都看见箭头：没有任何 k 能同时成立
    expect(
      filterCandidates(
        [0, 2],
        [
          { refIndex: 0, seen: true },
          { refIndex: 2, seen: true },
        ],
      ),
    ).toEqual([]);
  });
});

describe('evaluate 观察筛选结论', () => {
  // ABAB 周期序列：基础候选 k = 0、2
  const ambiguous = { refRaw: 'A B A B', candRaw: 'A B A B', refArrow: 0, candArrow: 0 };

  it('无观察时剩余全部候选，提示继续观察', () => {
    const r = evaluate(ambiguous);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.analysis).toEqual({ kind: 'multiple', ks: [0, 2] });
    expect(r.resolution).toEqual({ kind: 'pending', remaining: [0, 2] });
  });

  it('逐步排除后收敛为唯一相位，给出移动孔数与原有孔对', () => {
    const r = evaluate({ ...ambiguous, observations: [{ refIndex: 0, seen: false }] });
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.resolution).toMatchObject({ kind: 'resolved', k: 2 });
    if (r.resolution?.kind !== 'resolved') return;
    // 与 analyze 唯一相位同一映射：参考孔 i 对应待装孔 (i - 2 + 4) mod 4
    expect(r.resolution.pairs.map(p => p.candIndex)).toEqual([2, 3, 0, 1]);
    expect(r.resolution.pairs.every(p => p.ref === p.cand)).toBe(true);
  });

  it('观察与孔序不一致时全部排除，基础候选保留', () => {
    // 候选只有 k = 0、2，却在参考索引 1 看见箭头
    const r = evaluate({ ...ambiguous, observations: [{ refIndex: 1, seen: true }] });
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.analysis).toEqual({ kind: 'multiple', ks: [0, 2] });
    expect(r.resolution).toEqual({ kind: 'contradiction' });
  });

  it('唯一可装与无匹配结论不受观察影响', () => {
    const observations: Observation[] = [{ refIndex: 0, seen: false }];
    const u = evaluate({
      refRaw: 'A B C D',
      candRaw: 'B C D A',
      refArrow: 0,
      candArrow: 0,
      observations,
    });
    expect(u.status).toBe('ok');
    if (u.status !== 'ok') return;
    expect(u.analysis).toMatchObject({ kind: 'unique', k: 1 });
    expect(u.resolution).toBeNull();

    const none = evaluate({
      refRaw: 'A A A B',
      candRaw: 'A A C D',
      refArrow: 0,
      candArrow: 0,
      observations,
    });
    expect(none.status).toBe('ok');
    if (none.status !== 'ok') return;
    expect(none.analysis.kind).toBe('none');
    expect(none.resolution).toBeNull();
  });
});
