import { useState } from 'react'

function WrPill({ wr }) {
  const cls = wr >= 60 ? 'high' : wr >= 40 ? 'mid' : 'low'
  return <span className={`wr-pill ${cls}`}>{wr}%</span>
}

// ── Hourly Breakdown ───────────────────────────────────────────────
function HourlySection({ hourly }) {
  const [selectedHour, setSelectedHour] = useState('')

  if (!hourly?.length) return (
    <div className="empty-msg">No hourly data for this date</div>
  )

  const activeHour = selectedHour !== '' ? parseInt(selectedHour) : (hourly?.[0]?.hour || 0)
  const hourData = hourly?.find(h => h.hour === activeHour) || hourly?.[0]

  return (
    <div>
      <div className="card-label" style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
        <span>Hourly Breakdown</span>
        <select
          value={activeHour}
          onChange={e => setSelectedHour(e.target.value)}
          style={{ width: '100%', maxWidth: '100%', background: '#1c2333', color: '#e8eeff', border: '1px solid #3d4f6e', borderRadius: 4, padding: '4px 8px', fontSize: 10, outline: 'none' }}
        >
          {hourly?.map(h => {
            const istH = h.hour
            const nextH = (istH + 1) % 24
            const todayStr = new Date().toISOString().slice(0, 10)
            const dStart = new Date(`${todayStr}T${istH.toString().padStart(2, '0')}:00:00+05:30`)
            const dEnd = new Date(`${todayStr}T${nextH.toString().padStart(2, '0')}:00:00+05:30`)
            const utcStart = dStart.toLocaleTimeString('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' })
            const utcEnd = dEnd.toLocaleTimeString('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' })
            const etStart = dStart.toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' })
            const etEnd = dEnd.toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' })
            return (
              <option key={h.hour} value={h.hour}>
                {istH.toString().padStart(2, '0')}:00-{nextH.toString().padStart(2, '0')}:00 IST | {utcStart}-{utcEnd} UTC | {etStart}-{etEnd} ET ({h.total}t)
              </option>
            )
          })}
        </select>
      </div>

      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-box">
          <div className="stat-val"><WrPill wr={hourData?.winRate || 0} /></div>
          <div className="stat-lbl">Win Rate</div>
        </div>
        <div className="stat-box">
          <div className="stat-val green">{hourData.wins}</div>
          <div className="stat-lbl">Wins</div>
        </div>
        <div className="stat-box">
          <div className="stat-val red">{hourData.losses}</div>
          <div className="stat-lbl">Losses</div>
        </div>
        {hourData.avgScore != null && (
          <div className="stat-box">
            <div className="stat-val" style={{ color: '#7eb8ff' }}>{hourData.avgScore}</div>
            <div className="stat-lbl">Avg Score</div>
          </div>
        )}
      </div>

      <div className="card-label" style={{ marginBottom: 10 }}>
        Trades {(hourData?.hour ?? 0).toString().padStart(2, '0')}:00–{(((hourData?.hour ?? 0) + 1) % 24).toString().padStart(2, '0')}:00
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 400, overflowY: 'auto' }}>
        {hourData?.trades?.map(t => {
          const time = t.timestamp
            ? new Date(t.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
            : t.candleTs 
              ? new Date(t.candleTs * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
              : '—'
          
          const ptbStr = t.priceToBeat
            ? '$' + parseFloat(t.priceToBeat).toLocaleString('en-US', { maximumFractionDigits: 1 })
            : '—'
          const resPrice = t.resolvePrice
            ? '$' + parseFloat(t.resolvePrice).toLocaleString('en-US', { maximumFractionDigits: 1 })
            : '—'
          
          const res = t.status === 'pending' ? 'PENDING' : t.result === 'win' ? 'WIN ✓' : 'LOSS ✗'
          const rCls = t.status === 'pending' ? 'pending' : t.result
          const score = t.score != null ? `${t.score}/${(t.score || 0) + (t.bearScore || 0)}` : '—'
          
          return (
            <div key={t.id || t._id} className="trade-row" style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, borderLeft: `3px solid var(--${(t.direction || '').toLowerCase()})` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--bright)' }}>{time}</span>
                  <span className={`tr-dir ${(t.direction || '').toLowerCase()}`} style={{ fontSize: 10 }}>
                    {t.direction === 'UP' ? '▲ UP' : '▼ DOWN'}
                  </span>
                </div>
                <span className={`tr-res ${rCls}`} style={{ fontSize: 10, fontWeight: 700 }}>{res}</span>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ fontSize: 10, color: '#8899bb' }}>
                  <div style={{ fontSize: 8, opacity: 0.7 }}>PRICE TO BEAT</div>
                  <span style={{ color: 'var(--gold)', fontWeight: 600 }}>{ptbStr}</span>
                </div>
                <div style={{ fontSize: 10, color: '#8899bb', textAlign: 'right' }}>
                  <div style={{ fontSize: 8, opacity: 0.7 }}>RESOLVE PRICE</div>
                  <span style={{ color: 'var(--bright)', fontWeight: 600 }}>{resPrice}</span>
                </div>
              </div>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 9, color: '#7eb8ff', fontWeight: 600 }}>
                  SCORE: <span style={{ color: 'var(--bright)' }}>{score} ⚡</span>
                </div>
                {t.confidence && (
                  <div style={{ fontSize: 9, color: '#8899bb' }}>
                    {t.confidence}% CONF
                  </div>
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

      <div className="card-label" style={{ marginBottom: 8 }}>Score breakdown</div>
      <table className="daily-table">
        <thead>
          <tr>
            <th>Score</th>
            <th>Total</th>
            <th>W</th>
            <th>L</th>
            <th>Rate</th>
          </tr>
        </thead>
        <tbody>
          {scorePerformance?.map(g => (
            <tr key={g.score}>
              <td style={{ color: '#7eb8ff', fontWeight: 600 }}>{g.score}/6</td>
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
            onChange={e => changeDate(e.target.value)}
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
            {activeTab === 'Hourly' && <HourlySection hourly={hourly} />}
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