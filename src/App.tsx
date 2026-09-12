import { useEffect, useMemo, useState } from 'react';
import {
  evaluate,
  parseSequence,
  recordObservation,
  type Analysis,
  type Hole,
  type HolePair,
  type Observation,
  type Resolution,
} from './lib/holes';

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

function PairsTable({ pairs }: { pairs: HolePair[] }) {
  return (
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
        {pairs.map(p => (
          <tr key={p.refIndex}>
            <td>{p.refIndex}</td>
            <td>{p.ref}</td>
            <td>{p.candIndex}</td>
            <td>{p.cand}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function UniqueResult({ analysis }: { analysis: Extract<Analysis, { kind: 'unique' }> }) {
  return (
    <section className="panel result result-unique" data-testid="result-unique">
      <h2>可装</h2>
      <p>恰有一个逐孔相等的相位。</p>
      <p>移动孔数：顺时针 {analysis.k} 孔</p>
      <p>箭头新位置：参考环索引 {analysis.k}</p>
      <PairsTable pairs={analysis.pairs} />
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

function MultipleResult({
  analysis,
  resolution,
}: {
  analysis: Extract<Analysis, { kind: 'multiple' }>;
  resolution: Resolution;
}) {
  return (
    <section className="panel result result-multiple" data-testid="result-multiple">
      <h2>相位不唯一</h2>
      <p>
        共 {analysis.ks.length} 个完整匹配相位：k = {analysis.ks.join('、')}
      </p>
      {resolution.kind === 'pending' && (
        <p data-testid="remaining-phases">
          剩余相位：k = {resolution.remaining.join('、')}，请继续按参考环索引观察待装版箭头位置。
        </p>
      )}
      {resolution.kind === 'resolved' && (
        <div data-testid="obs-resolved">
          <h3>观察收敛为唯一相位</h3>
          <p>移动孔数：顺时针 {resolution.k} 孔</p>
          <p>箭头新位置：参考环索引 {resolution.k}</p>
          <PairsTable pairs={resolution.pairs} />
        </div>
      )}
      {resolution.kind === 'contradiction' && (
        <p className="error" data-testid="obs-contradiction" role="alert">
          全部候选相位均被观察排除：观察与孔序不一致，请核对观察记录或清空后重新观察。
        </p>
      )}
    </section>
  );
}

function ObservationPanel({
  n,
  observations,
  obsError,
  onRecord,
  onClear,
}: {
  n: number;
  observations: Observation[];
  obsError: string | null;
  /** 返回是否记录成功；失败（索引越界）时保留当前筛选结果 */
  onRecord: (refIndex: number, seen: boolean) => boolean;
  onClear: () => void;
}) {
  const [indexRaw, setIndexRaw] = useState('');
  const [seen, setSeen] = useState<'seen' | 'unseen'>('seen');
  return (
    <section className="panel" data-testid="obs-panel">
      <h2>实物观察排除相位</h2>
      <p className="hint">
        按参考环索引记录该位置是否看见待装版箭头；同一索引再次提交将替换旧值。
      </p>
      <label htmlFor="obs-index">参考环索引（0–{n - 1}）</label>
      <input
        id="obs-index"
        data-testid="obs-index"
        type="text"
        inputMode="numeric"
        placeholder="例如：2"
        value={indexRaw}
        onChange={e => setIndexRaw(e.target.value)}
        autoComplete="off"
      />
      <label htmlFor="obs-seen">是否看见待装版箭头</label>
      <select
        id="obs-seen"
        data-testid="obs-seen"
        value={seen}
        onChange={e => setSeen(e.target.value as 'seen' | 'unseen')}
      >
        <option value="seen">看见箭头</option>
        <option value="unseen">未见箭头</option>
      </select>
      <div className="obs-actions">
        <button
          type="button"
          data-testid="obs-add"
          onClick={() => {
            const idx = indexRaw.trim() === '' ? NaN : Number(indexRaw);
            if (onRecord(idx, seen === 'seen')) setIndexRaw('');
          }}
        >
          记录观察
        </button>
        <button
          type="button"
          data-testid="obs-clear"
          onClick={onClear}
          disabled={observations.length === 0}
        >
          清空全部观察
        </button>
      </div>
      {obsError && (
        <p className="error" data-testid="obs-error" role="alert">
          {obsError}
        </p>
      )}
      <ul data-testid="obs-list">
        {observations.map(o => (
          <li key={o.refIndex}>
            参考索引 {o.refIndex}：{o.seen ? '看见箭头' : '未见箭头'}
          </li>
        ))}
      </ul>
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

  // 实物观察记录：仅在「相位不唯一」时用于逐步排除候选相位。
  const [observations, setObservations] = useState<Observation[]>([]);
  const [obsError, setObsError] = useState<string | null>(null);

  // 修改任一孔序或箭头起点都会使既有观察失效，立即清除。
  useEffect(() => {
    setObservations(prev => (prev.length === 0 ? prev : []));
    setObsError(null);
  }, [refRaw, candRaw, refArrow, candArrow]);

  // 任一输入变化都会重新求值：非法或未完成时不渲染任何旧结论。
  const verdict = useMemo(
    () => evaluate({ refRaw, candRaw, refArrow, candArrow, observations }),
    [refRaw, candRaw, refArrow, candArrow, observations],
  );

  const handleRecord = (refIndex: number, seen: boolean): boolean => {
    if (verdict.status !== 'ok') return false;
    const r = recordObservation(observations, verdict.n, refIndex, seen);
    if (!r.ok) {
      // 索引越界：仅在录入处反馈，不改变当前筛选结果。
      setObsError(r.message);
      return false;
    }
    setObservations(r.observations);
    setObsError(null);
    return true;
  };

  const handleClearObservations = () => {
    setObservations([]);
    setObsError(null);
  };

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
      {verdict.status === 'ok' && verdict.analysis.kind === 'multiple' && verdict.resolution && (
        <>
          <MultipleResult analysis={verdict.analysis} resolution={verdict.resolution} />
          <ObservationPanel
            n={verdict.n}
            observations={observations}
            obsError={obsError}
            onRecord={handleRecord}
            onClear={handleClearObservations}
          />
        </>
      )}

      <footer>结论仅由本页在本地计算，不调用任何在线服务。</footer>
    </main>
  );
}
