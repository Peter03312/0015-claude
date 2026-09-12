import { useEffect, useMemo, useState } from 'react';
import { evaluate, parseSequence, type Analysis, type Hole } from './lib/holes';

/** 箭头起始孔选择状态；孔数变化时收敛到合法范围，编辑输入即触发重算。 */
function useArrow(holeCount: number): [number, (v: number) => void] {
  const [arrow, setArrow] = useState(0);
  useEffect(() => {
    setArrow(a => Math.min(a, Math.max(0, holeCount - 1)));
  }, [holeCount]);
  return [arrow, setArrow];
}

function ArrowSelect({
  testId,
  holes,
  value,
  onChange,
}: {
  testId: string;
  holes: Hole[] | null;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <select
      data-testid={testId}
      value={holes ? value : 0}
      disabled={!holes}
      onChange={e => onChange(Number(e.target.value))}
    >
      {holes
        ? holes.map((h, i) => (
            <option key={i} value={i}>
              索引 {i}（{h}）
            </option>
          ))
        : <option value={0}>待输入有效孔序</option>}
    </select>
  );
}

function UniqueResult({ analysis }: { analysis: Extract<Analysis, { kind: 'unique' }> }) {
  return (
    <section className="panel result result-unique" data-testid="result-unique">
      <h2>可装</h2>
      <p>恰有一个逐孔相等的相位。</p>
      <p>移动孔数：顺时针 {analysis.k} 孔</p>
      <p>箭头新位置：参考环索引 {analysis.k}</p>
      <table data-testid="pairs">
        <thead>
          <tr>
            <th>参考索引</th>
            <th>参考孔</th>
            <th>待装索引</th>
            <th>待装孔</th>
          </tr>
        </thead>
        <tbody>
          {analysis.pairs.map(p => (
            <tr key={p.refIndex}>
              <td>{p.refIndex}</td>
              <td>{p.ref}</td>
              <td>{p.candIndex}</td>
              <td>{p.cand}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function NoneResult({ analysis }: { analysis: Extract<Analysis, { kind: 'none' }> }) {
  const m = analysis.firstMismatch;
  return (
    <section className="panel result result-none" data-testid="result-none">
      <h2>无匹配</h2>
      <p>
        诊断相位：k = {analysis.k}（错孔数最少，共 {analysis.mismatchCount} 孔不符）
      </p>
      <p>
        首个错孔：参考索引 {m.refIndex}，参考孔 {m.ref} ≠ 待装孔 {m.cand}（待装索引 {m.candIndex}）
      </p>
    </section>
  );
}

function MultipleResult({ analysis }: { analysis: Extract<Analysis, { kind: 'multiple' }> }) {
  return (
    <section className="panel result result-multiple" data-testid="result-multiple">
      <h2>相位不唯一</h2>
      <p>
        共 {analysis.ks.length} 个完整匹配相位：k = {analysis.ks.join('、')}
      </p>
    </section>
  );
}

export default function App() {
  const [refRaw, setRefRaw] = useState('');
  const [candRaw, setCandRaw] = useState('');

  const refParsed = useMemo(() => parseSequence(refRaw), [refRaw]);
  const candParsed = useMemo(() => parseSequence(candRaw), [candRaw]);
  const refCount = refParsed.ok ? refParsed.holes.length : 0;
  const candCount = candParsed.ok ? candParsed.holes.length : 0;

  const [refArrow, setRefArrow] = useArrow(refCount);
  const [candArrow, setCandArrow] = useArrow(candCount);

  // 任一输入变化都会重新求值：非法或未完成时不渲染任何旧结论。
  const verdict = useMemo(
    () => evaluate({ refRaw, candRaw, refArrow, candArrow }),
    [refRaw, candRaw, refArrow, candArrow],
  );

  return (
    <main>
      <h1>陶瓷贴花印刷 · 换网版定位孔相位校验</h1>
      <p className="hint">
        分别录入参考版与待装版的顺时针孔序（仅 A、B、C、D，空格分隔，每环 4–48 孔，两环孔数相同），
        并为每环选择带向外箭头的起始孔。以各自箭头孔为索引 0 沿顺时针编号，零相位为两箭头重合；
        仅枚举顺时针相位，禁止反转匹配。
      </p>

      <div className="grids">
        <section className="panel">
          <label htmlFor="ref-seq">参考版孔序（顺时针）</label>
          <input
            id="ref-seq"
            data-testid="ref-seq"
            type="text"
            placeholder="例如：A B C D A B"
            value={refRaw}
            onChange={e => setRefRaw(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <p className="hint" data-testid="ref-count">
            {refParsed.ok ? `已解析 ${refCount} 孔` : '等待有效孔序'}
          </p>
          <label htmlFor="ref-arrow">参考版箭头起始孔</label>
          <ArrowSelect
            testId="ref-arrow"
            holes={refParsed.ok ? refParsed.holes : null}
            value={refArrow}
            onChange={setRefArrow}
          />
        </section>

        <section className="panel">
          <label htmlFor="cand-seq">待装版孔序（顺时针）</label>
          <input
            id="cand-seq"
            data-testid="cand-seq"
            type="text"
            placeholder="例如：B C D A B C"
            value={candRaw}
            onChange={e => setCandRaw(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <p className="hint" data-testid="cand-count">
            {candParsed.ok ? `已解析 ${candCount} 孔` : '等待有效孔序'}
          </p>
          <label htmlFor="cand-arrow">待装版箭头起始孔</label>
          <ArrowSelect
            testId="cand-arrow"
            holes={candParsed.ok ? candParsed.holes : null}
            value={candArrow}
            onChange={setCandArrow}
          />
        </section>
      </div>

      {verdict.status === 'idle' && (
        <p className="idle" data-testid="idle">
          请输入两环孔序，结论将实时计算并显示。
        </p>
      )}
      {verdict.status === 'error' && (
        <div className="error" data-testid="error" role="alert">
          {verdict.message}
        </div>
      )}
      {verdict.status === 'ok' && verdict.analysis.kind === 'unique' && (
        <UniqueResult analysis={verdict.analysis} />
      )}
      {verdict.status === 'ok' && verdict.analysis.kind === 'none' && (
        <NoneResult analysis={verdict.analysis} />
      )}
      {verdict.status === 'ok' && verdict.analysis.kind === 'multiple' && (
        <MultipleResult analysis={verdict.analysis} />
      )}

      <footer>结论仅由本页在本地计算，不调用任何在线服务。</footer>
    </main>
  );
}
