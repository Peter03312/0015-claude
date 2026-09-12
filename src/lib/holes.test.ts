import { describe, expect, it } from 'vitest';
import { analyze, evaluate, parseSequence, rotate, type Hole } from './holes';

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
