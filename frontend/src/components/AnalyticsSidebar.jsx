import { useState } from 'react'

function WrPill({ wr }) {
  const cls = wr >= 60 ? 'high' : wr >= 40 ? 'mid' : 'low'
  return <span className={`wr-pill ${cls}`}>{wr}%</span>
}


// ── Hourly Breakdown ───────────────────────────────────────────────
function HourlySection({ hourly, trades, selectedHour, setSelectedHour }) {

  console.log('HourlySection render:', {
    selectedHour,
    activeHour: selectedHour !== null ? Number(selectedHour) : Number(hourly?.[0]?.hour ?? 0),
    tradesLength: trades?.length,
    hourlyHours: hourly?.map(h => h.hour)
  })

  if (!hourly?.length) return (
    <div className="empty-msg">No hourly data for this date</div>
  )

  const activeHour = selectedHour !== null ? Number(selectedHour) : Number(hourly?.[0]?.hour ?? 0)
  const hourData = hourly?.find(h => Number(h.hour) === activeHour) || hourly?.[0]

  // Filter trades for selected hour
  const hourTrades = (trades || []).filter(t => {
    if (t.hour !== undefined && t.hour !== null) {
      return Number(t.hour) === activeHour
    }
    if (t.timestamp) {
      const d = new Date(t.timestamp)
      const hStr = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: 'numeric',
        hour12: false,
      }).format(d)
      return (parseInt(hStr) % 24) === activeHour
    }
    return false
  }).sort((a, b) => {
    const timeA = a.timestamp ? new Date(a.timestamp).getTime() : (a.candleTs * 1000 || 0)
    const timeB = b.timestamp ? new Date(b.timestamp).getTime() : (b.candleTs * 1000 || 0)
    return timeB - timeA
  })

  return (
    <div>
      {/* ── Dropdown ── */}
      <div style={{ marginBottom: 12 }}>
        <div className="card-label" style={{ marginBottom: 6 }}>Hourly Breakdown</div>
        <select
          value={activeHour.toString()}
          onChange={e => setSelectedHour(e.target.value)}
          style={{
            width: '100%',
            background: '#1c2333',
            color: '#e8eeff',
            border: '1px solid #3d4f6e',
            borderRadius: 4,
            padding: '4px 8px',
            fontSize: 10,
            outline: 'none',
          }}
        >
          {hourly?.map(h => {
            const hNum = Number(h.hour)
            const nextH = (hNum + 1) % 24
            const todayStr = new Date().toISOString().slice(0, 10)
            const dStart = new Date(`${todayStr}T${hNum.toString().padStart(2, '0')}:00:00+05:30`)
            const dEnd = new Date(`${todayStr}T${nextH.toString().padStart(2, '0')}:00:00+05:30`)
            const utcS = dStart.toLocaleTimeString('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' })
            const utcE = dEnd.toLocaleTimeString('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' })
            const etS = dStart.toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' })
            const etE = dEnd.toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' })
            return (
              <option key={h.hour} value={hNum.toString()}>
                {hNum.toString().padStart(2, '0')}:00–{nextH.toString().padStart(2, '0')}:00 IST | {utcS}–{utcE} UTC | {etS}–{etE} ET ({h.total}t)
              </option>
            )
          })}
        </select>
      </div>

      {/* ── Hour Stats ── */}
      <div className="stat-grid" style={{ marginBottom: 14 }}>
        <div className="stat-box">
          <div className="stat-val"><WrPill wr={hourData?.winRate || 0} /></div>
          <div className="stat-lbl">Win Rate</div>
        </div>
        <div className="stat-box">
          <div className="stat-val green">{hourData?.wins ?? 0}</div>
          <div className="stat-lbl">Wins</div>
        </div>
        <div className="stat-box">
          <div className="stat-val red">{hourData?.losses ?? 0}</div>
          <div className="stat-lbl">Losses</div>
        </div>
        {hourData?.avgScore != null && (
          <div className="stat-box">
            <div className="stat-val" style={{ color: '#7eb8ff' }}>{hourData.avgScore}</div>
            <div className="stat-lbl">Avg Score</div>
          </div>
        )}
      </div>

      {/* ── Trade Cards ── */}
      <div className="card-label" style={{ marginBottom: 8 }}>
        Trades ({hourTrades.length})
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflowY: 'auto' }}>
        {!hourTrades.length ? (
          <div className="empty-msg">No trades for this hour.</div>
        ) : hourTrades.map(t => {
          // Time
          const d = new Date(t.timestamp || (t.candleTs * 1000))
          const istTime = d.toLocaleTimeString('en-IN', {
            timeZone: 'Asia/Kolkata',
            hour: '2-digit', minute: '2-digit', hour12: false,
          }) + ' IST'
          const etTime = d.toLocaleTimeString('en-US', {
            timeZone: 'America/New_York',
            hour: '2-digit', minute: '2-digit', hour12: false,
          }) + ' ET'

          // Price to Beat
          const ptbStr = t.priceToBeat
            ? '$' + parseFloat(t.priceToBeat).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
            : '—'

          // Resolve Price
          const resPrice = t.resolvePrice
            ? '$' + parseFloat(t.resolvePrice).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
            : '—'

          // Prediction
          const dir = t.direction || '—'
          const isUp = dir === 'UP'

          // Outcome
          const isPending = t.status === 'pending'
          const isWin = t.result === 'win'
          const isLoss = t.result === 'loss'

          // Score
          const scoreVal = isUp
            ? (t.weightedBull ?? t.score ?? 0)
            : (t.weightedBear ?? t.bearScore ?? 0)
          const scoreNum = Number(scoreVal)
          const scoreStr = scoreVal != null ? `${scoreNum.toFixed(1)} / 10.5` : '—'
          const isHighScore = scoreNum >= 5.0

          return (
            <div
              key={t.id || t._id}
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 8,
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 7,
              }}
            >
              {/* Row 1 — Time */}
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', fontSize: 9, color: '#8899bb', fontWeight: 600,
              }}>
                <span>🕐 {istTime} | {etTime}</span>
              </div>

              {/* Row 2 — Price to Beat + Resolve Price */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 8, color: '#667799', fontWeight: 700, letterSpacing: '0.3px' }}>PTB</span>
                  <span style={{ fontSize: 11, color: 'var(--gold, #ffd600)', fontWeight: 700 }}>{ptbStr}</span>
                </div>
                {t.resolvePrice && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 8, color: '#667799', fontWeight: 700, letterSpacing: '0.3px' }}>RES</span>
                    <span style={{ fontSize: 11, color: '#e8eeff', fontWeight: 700 }}>{resPrice}</span>
                  </div>
                )}
              </div>

              {/* Row 3 — Prediction + Win/Loss */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {/* Prediction */}
                <span style={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: isUp ? '#00e676' : dir === 'DOWN' ? '#ff1744' : '#8899bb',
                  letterSpacing: '0.5px',
                }}>
                  {isUp ? '▲ UP' : dir === 'DOWN' ? '▼ DOWN' : dir}
                </span>

                {/* Result */}
                <span style={{
                  fontSize: 10,
                  fontWeight: 900,
                  padding: '2px 10px',
                  borderRadius: 4,
                  background: isPending ? 'rgba(255,214,0,0.1)'
                    : isWin ? 'rgba(0,230,118,0.12)'
                      : 'rgba(255,23,68,0.12)',
                  color: isPending ? '#ffd600'
                    : isWin ? '#00e676'
                      : '#ff1744',
                  border: `1px solid ${isPending ? 'rgba(255,214,0,0.3)'
                    : isWin ? 'rgba(0,230,118,0.3)'
                      : 'rgba(255,23,68,0.3)'
                    }`,
                }}>
                  {isPending ? 'PENDING' : isWin ? 'WIN ✓' : isLoss ? 'LOSS ✗' : '—'}
                </span>
              </div>

              {/* Row 4 — Score + Confidence */}
              <div style={{
                paddingTop: 6,
                borderTop: '1px dashed rgba(255,255,255,0.06)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: 10,
              }}>
                <span style={{ color: '#7eb8ff', fontWeight: 700 }}>
                  ⚡ Score: <span style={{ color: isHighScore ? '#ffd600' : '#fff' }}>{scoreStr}</span>
                </span>
                {t.confidence != null && (
                  <span style={{ fontSize: 9, color: '#8899bb', fontWeight: 500 }}>
                    CONF: {t.confidence}%
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Daily History ──────────────────────────────────────────────────
function DailySection({ daily, selectedDate }) {
  const dateData = daily?.find(d => d.date === selectedDate)
  if (!dateData) return <div className="empty-msg">No daily data for {selectedDate}</div>

  return (
    <div>
      <div className="card-label" style={{ marginBottom: 10 }}>Stats for {selectedDate}</div>
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat-box">
          <div className="stat-val gold">{dateData.winRate}%</div>
          <div className="stat-lbl">Win Rate</div>
        </div>
        <div className="stat-box">
          <div className="stat-val green">{dateData.wins}</div>
          <div className="stat-lbl">Wins</div>
        </div>
        <div className="stat-box">
          <div className="stat-val red">{dateData.losses}</div>
          <div className="stat-lbl">Losses</div>
        </div>
        {dateData.avgScore != null && (
          <div className="stat-box">
            <div className="stat-val" style={{ color: '#7eb8ff' }}>{dateData.avgScore}</div>
            <div className="stat-lbl">Avg Score</div>
          </div>
        )}
      </div>

      <div className="card-label" style={{ marginBottom: 10 }}>Overall Daily Summary</div>
      <table className="daily-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Total</th>
            <th>W</th>
            <th>L</th>
            <th>Rate</th>
            <th>Avg⚡</th>
          </tr>
        </thead>
        <tbody>
          {daily?.map(d => (
            <tr
              key={d.date}
              style={{ background: d.date === selectedDate ? 'rgba(255,255,255,0.05)' : undefined }}
            >
              <td style={{ color: '#8899bb' }}>{d.date.slice(5)}</td>
              <td style={{ color: '#e8eeff' }}>{d.total}</td>
              <td style={{ color: '#00e676' }}>{d.wins}</td>
              <td style={{ color: '#ff1744' }}>{d.losses}</td>
              <td><WrPill wr={d.winRate} /></td>
              <td style={{ color: '#7eb8ff', fontSize: 10 }}>{d.avgScore ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Trade List ─────────────────────────────────────────────────────
function TradeListSection({ trades }) {
  if (!trades?.length) return <div className="empty-msg">No trades for this date</div>

  return (
    <div>
      <div className="card-label" style={{ marginBottom: 10 }}>Trades ({trades?.length || 0})</div>
      <div className="trade-list">
        {trades?.slice(0, 100).map(t => {
          const time = t.timestamp
            ? `${new Date(t.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false })} IST`
            : '—'
          const ptbStr = t.priceToBeat
            ? '$' + parseFloat(t.priceToBeat).toLocaleString('en-US', { maximumFractionDigits: 0 })
            : '—'
          const res = t.status === 'pending' ? 'PEND' : t.result === 'win' ? 'WIN ✓' : 'LOSS ✗'
          const rCls = t.status === 'pending' ? 'pending' : t.result
          const diffStr = t.entryDiff != null ? (t.entryDiff > 0 ? '+' : '') + t.entryDiff.toFixed(2) + '%' : null

          return (
            <div key={t.id || t._id} className="trade-row" style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`tr-dir ${(t.direction || '').toLowerCase()}`} style={{ fontSize: 10 }}>{t.direction}</span>
                  <span style={{ fontSize: 9, color: '#8899bb' }}>{time}</span>
                </div>
                <span className={`tr-res ${rCls}`} style={{ fontSize: 9 }}>{res}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 10, color: '#e8eeff' }}>{ptbStr}</span>
                {diffStr && <span style={{ fontSize: 8, color: t.entryDiff > 0 ? '#00e676' : '#ff1744', opacity: 0.8 }}>{diffStr} from Entry</span>}
                {t.score != null && <span style={{ fontSize: 9, color: '#7eb8ff' }}>{t.score}⚡</span>}
              </div>
              {t.resolveSource && <div style={{ fontSize: 7, color: 'var(--dim)', textAlign: 'right' }}>src: {t.resolveSource}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Score Performance ──────────────────────────────────────────────
function ScoreSection({ scorePerformance, summary }) {
  if (!scorePerformance?.length) return (
    <div className="empty-msg">No score data yet</div>
  )

  return (
    <div>
      {summary?.highConfidence?.total > 0 && (
        <div style={{ background: 'rgba(0,230,118,0.07)', border: '1px solid rgba(0,230,118,0.2)', borderRadius: 6, padding: '10px 12px', marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: '#8899bb', marginBottom: 4 }}>Score ≥ 5 (high confidence)</div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'baseline' }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: '#00e676' }}>
              {summary.highConfidence.winRate}%
            </span>
            <span style={{ fontSize: 11, color: '#8899bb' }}>
              {summary.highConfidence.wins}W / {summary.highConfidence.total - summary.highConfidence.wins}L ({summary.highConfidence.total} trades)
            </span>
          </div>
        </div>
      )}

      <div className="card-label" style={{ marginBottom: 8 }}>Confluence Breakdown</div>
      <table className="daily-table">
        <thead>
          <tr>
            <th>Level</th>
            <th>Total</th>
            <th>W</th>
            <th>L</th>
            <th>Rate</th>
          </tr>
        </thead>
        <tbody>
          {scorePerformance?.map(g => (
            <tr key={g.score}>
              <td style={{ color: '#7eb8ff', fontWeight: 600, fontSize: 9 }}>{g.score}</td>
              <td style={{ color: '#e8eeff' }}>{g.total}</td>
              <td style={{ color: '#00e676' }}>{g.wins}</td>
              <td style={{ color: '#ff1744' }}>{g.losses}</td>
              <td><WrPill wr={g.winRate} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Heatmap ────────────────────────────────────────────────────────
function HeatmapSection({ heatmap }) {
  if (!heatmap?.length) return <div className="empty-msg">No historical data for heatmap</div>

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div>
      <div className="card-label" style={{ marginBottom: 12 }}>Win Rate Heatmap (Day vs Hour)</div>
      <div className="heatmap-container" style={{ overflowX: 'auto', paddingBottom: 8 }}>
        <table className="daily-table" style={{ minWidth: 400 }}>
          <thead>
            <tr>
              <th style={{ width: 40 }}>Day</th>
              {Array.from({ length: 24 }).map((_, h) => (
                <th key={h} style={{ textAlign: 'center', padding: '4px 2px', fontSize: 8 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((day, dIdx) => (
              <tr key={day}>
                <td style={{ fontSize: 9, color: '#8899bb', fontWeight: 600 }}>{day}</td>
                {Array.from({ length: 24 }).map((_, hour) => {
                  const cell = heatmap?.find(c => c.dayIndex === dIdx && c.hour === hour)
                  const wr = cell?.winRate
                  const opacity = cell?.total ? Math.min(1, 0.2 + (cell.total / 20)) : 0
                  const color = wr == null ? 'transparent'
                    : wr >= 60 ? `rgba(0, 230, 118, ${opacity})`
                      : wr >= 45 ? `rgba(255, 214, 0, ${opacity})`
                        : `rgba(255, 23, 68, ${opacity})`

                  return (
                    <td
                      key={hour}
                      style={{
                        background: color,
                        border: '1px solid rgba(255,255,255,0.02)',
                        padding: 0,
                        height: 18,
                        textAlign: 'center',
                        fontSize: 7,
                        color: wr != null && opacity > 0.6 ? '#000' : '#8899bb'
                      }}
                      title={cell ? `${day} ${hour}:00 - WR: ${wr}% (${cell.total} trades)` : ''}
                    >
                      {cell ? Math.round(wr) : ''}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main Sidebar ───────────────────────────────────────────────────
const TABS = ['Hourly', 'Daily', 'Trades', 'Score', 'Heatmap']

export default function AnalyticsSidebar({
  hourly, daily, trades, scorePerformance, summary, heatmap,
  selectedDate, changeDate, loading
}) {
  const [activeTab, setActiveTab] = useState('Hourly')
  const [selectedHour, setSelectedHour] = useState(null)

  return (
    <aside className="sidebar">
      <div className="sidebar-tabs">
        {TABS.map(tab => (
          <button
            key={tab}
            className={`sidebar-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {!loading && summary && (
        <div style={{ padding: '16px 16px 0' }}>
          <div className="stat-grid" style={{ marginBottom: 16 }}>
            <div className="stat-box" style={{ background: 'var(--accent-dim)', borderColor: 'var(--accent)' }}>
              <div className="stat-val" style={{ color: 'var(--bright)' }}>{summary.winRate}%</div>
              <div className="stat-lbl">ALL TIME</div>
            </div>
            <div className="stat-box">
              <div className="stat-val gold">{summary.today?.winRate}%</div>
              <div className="stat-lbl">TODAY</div>
            </div>
            <div className="stat-box">
              <div className="stat-val green" style={{ color: 'var(--teal)' }}>{summary.last24h?.winRate}%</div>
              <div className="stat-lbl">24H</div>
            </div>
          </div>
          <div className="section-divider" style={{ marginTop: 0 }} />
        </div>
      )}

      <div style={{ padding: '12px 16px 0', borderBottom: '1px solid var(--border)' }}>
        <div className="filter-row" style={{ marginBottom: 12 }}>
          <label>Date</label>
          <input
            type="date"
            className="date-input"
            value={selectedDate}
            onChange={e => {
              setSelectedHour(null)
              changeDate(e.target.value)
            }}
          />
        </div>
      </div>

      <div className="sidebar-content">
        {loading && (
          <div className="empty-msg" style={{ padding: '30px 0' }}>
            <div className="spin" style={{ margin: '0 auto 8px' }} />
            Loading analytics…
          </div>
        )}
        {!loading && (
          <>
            {activeTab === 'Hourly' && (
              <HourlySection
                hourly={hourly}
                trades={trades}
                selectedHour={selectedHour}
                setSelectedHour={setSelectedHour}
              />
            )}
            {activeTab === 'Daily' && <DailySection daily={daily} selectedDate={selectedDate} />}
            {activeTab === 'Trades' && <TradeListSection trades={trades} />}
            {activeTab === 'Score' && <ScoreSection scorePerformance={scorePerformance} summary={summary} />}
            {activeTab === 'Heatmap' && <HeatmapSection heatmap={heatmap} />}
          </>
        )}
      </div>
    </aside>
  )
}