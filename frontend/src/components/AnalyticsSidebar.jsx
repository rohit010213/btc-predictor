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

  const activeHour = selectedHour !== '' ? parseInt(selectedHour) : hourly[0].hour
  const hourData = hourly.find(h => h.hour === activeHour) || hourly[0]

  return (
    <div>
      <div className="card-label" style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
        <span>Hourly Breakdown</span>
        <select
          value={activeHour}
          onChange={e => setSelectedHour(e.target.value)}
          style={{ width: '100%', maxWidth: '100%', background: '#1c2333', color: '#e8eeff', border: '1px solid #3d4f6e', borderRadius: 4, padding: '4px 8px', fontSize: 10, outline: 'none' }}
        >
          {hourly.map(h => {
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
          <div className="stat-val gold">{hourData.winRate}%</div>
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
        {/* NEW — avg score for this hour */}
        {hourData.avgScore != null && (
          <div className="stat-box">
            <div className="stat-val" style={{ color: '#7eb8ff' }}>{hourData.avgScore}</div>
            <div className="stat-lbl">Avg Score</div>
          </div>
        )}
      </div>

      <div className="card-label" style={{ marginBottom: 10 }}>
        Trades {hourData.hour.toString().padStart(2, '0')}:00–{((hourData.hour + 1) % 24).toString().padStart(2, '0')}:00
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 350, overflowY: 'auto' }}>
        {hourData.trades.map(t => {
          const ptbStr = t.priceToBeat
            ? '$' + parseFloat(t.priceToBeat).toLocaleString('en-US', { maximumFractionDigits: 0 })
            : '—'
          const resStr = t.resolvePrice
            ? '$' + parseFloat(t.resolvePrice).toLocaleString('en-US', { maximumFractionDigits: 0 })
            : '—'
          const res = t.status === 'pending' ? 'PEND' : t.result === 'win' ? 'WIN ✓' : 'LOSS ✗'
          const rCls = t.status === 'pending' ? 'pending' : t.result
          return (
            <div key={t.id} className="trade-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: 6 }}>
              <span className={`tr-dir ${(t.direction || '').toLowerCase()}`} style={{ minWidth: 40 }}>
                {t.direction}
              </span>
              <span style={{ fontSize: 11, color: '#8899bb', flex: 1, textAlign: 'center' }}>
                PTB: <span style={{ color: '#e8eeff' }}>{ptbStr}</span>
                <br />
                Res: <span style={{ color: '#e8eeff' }}>{resStr}</span>
                {/* NEW — score badge */}
                {t.score != null && (
                  <>
                    <br />
                    <span style={{ color: '#7eb8ff' }}>Score: {t.score}/{t.score + (t.bearScore ?? 0)}</span>
                  </>
                )}
              </span>
              <span className={`tr-res ${rCls}`} style={{ minWidth: 50, textAlign: 'right' }}>{res}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Daily History ──────────────────────────────────────────────────
function DailySection({ daily, selectedDate }) {
  const dateData = daily.find(d => d.date === selectedDate)
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
        {/* NEW */}
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
            <th>Avg⚡</th>{/* NEW */}
          </tr>
        </thead>
        <tbody>
          {daily.map(d => (
            <tr
              key={d.date}
              style={{ background: d.date === selectedDate ? 'rgba(255,255,255,0.05)' : undefined }}
            >
              <td style={{ color: '#8899bb' }}>{d.date.slice(5)}</td>
              <td style={{ color: '#e8eeff' }}>{d.total}</td>
              <td style={{ color: '#00e676' }}>{d.wins}</td>
              <td style={{ color: '#ff1744' }}>{d.losses}</td>
              <td><WrPill wr={d.winRate} /></td>
              <td style={{ color: '#7eb8ff', fontSize: 10 }}>{d.avgScore ?? '—'}</td>{/* NEW */}
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
      <div className="card-label" style={{ marginBottom: 10 }}>Trades ({trades.length})</div>
      <div className="trade-list">
        {trades.slice(0, 100).map(t => {
          const time = t.timestamp
            ? `${new Date(t.timestamp).toUTCString().slice(17, 22)} UTC (${new Date(t.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false })} IST)`
            : '—'
          const ptbStr = t.priceToBeat
            ? '$' + parseFloat(t.priceToBeat).toLocaleString('en-US', { maximumFractionDigits: 0 })
            : '—'
          const res = t.status === 'pending' ? 'PEND' : t.result === 'win' ? 'WIN ✓' : 'LOSS ✗'
          const rCls = t.status === 'pending' ? 'pending' : t.result
          return (
            <div key={t.id || t._id} className="trade-row">
              <span className={`tr-dir ${(t.direction || '').toLowerCase()}`}>{t.direction}</span>
              <span className="tr-time">{time}</span>
              <span className="tr-ptb">{ptbStr}</span>
              {/* NEW — score badge inline */}
              {t.score != null && (
                <span style={{ fontSize: 9, color: '#7eb8ff', minWidth: 28 }}>{t.score}⚡</span>
              )}
              <span className={`tr-res ${rCls}`}>{res}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Score Performance (NEW) ────────────────────────────────────────
function ScoreSection({ scorePerformance, summary }) {
  if (!scorePerformance?.length) return (
    <div className="empty-msg">
      No score data yet — trades with score field will appear here
    </div>
  )

  return (
    <div>
      {/* High confidence callout */}
      {summary?.highConfidence?.total > 0 && (
        <div style={{ background: 'rgba(0,230,118,0.07)', border: '1px solid rgba(0,230,118,0.2)', borderRadius: 6, padding: '10px 12px', marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: '#8899bb', marginBottom: 4 }}>Score ≥ 5 (high confidence)</div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'baseline' }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: '#00e676' }}>
              {summary.highConfidence.winRate}%
            </span>
            <span style={{ fontSize: 11, color: '#8899bb' }}>
              {summary.highConfidence.wins}W / {summary.highConfidence.total - summary.highConfidence.wins}L
              &nbsp;({summary.highConfidence.total} trades)
            </span>
          </div>
        </div>
      )}

      {/* Bear signal impact */}
      {summary?.bearSignalImpact?.total > 0 && (
        <div style={{ background: 'rgba(255,23,68,0.06)', border: '1px solid rgba(255,23,68,0.15)', borderRadius: 6, padding: '10px 12px', marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: '#8899bb', marginBottom: 4 }}>
            Trades with opposing signals
          </div>
          <div style={{ fontSize: 11, color: '#ff6b6b' }}>
            Win rate: {summary.bearSignalImpact.winRate}% ({summary.bearSignalImpact.total} trades)
          </div>
          <div style={{ fontSize: 10, color: '#8899bb', marginTop: 4 }}>
            {summary.bearSignalImpact.insight}
          </div>
        </div>
      )}

      {/* Score breakdown table */}
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
          {scorePerformance.map(g => (
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

      {/* UP vs DOWN breakdown per score */}
      <div className="card-label" style={{ marginBottom: 8, marginTop: 16 }}>UP vs DOWN per score</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {scorePerformance.map(g => (
          <div key={g.score} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '8px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 11, color: '#7eb8ff', fontWeight: 600 }}>Score {g.score}/6</span>
              <span style={{ fontSize: 10, color: '#8899bb' }}>{g.total} trades</span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <span style={{ fontSize: 10, color: '#00e676' }}>
                ▲ UP {g.upWinRate}%
              </span>
              <span style={{ fontSize: 10, color: '#ff4444' }}>
                ▼ DOWN {g.downWinRate}%
              </span>
            </div>
            <div style={{ fontSize: 9, color: '#556680', marginTop: 4 }}>
              {g.recommendation}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Sidebar ───────────────────────────────────────────────────
const TABS = ['Hourly', 'Daily', 'Trades', 'Score'] // NEW — Score tab add

export default function AnalyticsSidebar({
  hourly, daily, trades,
  scorePerformance, summary, // NEW props
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
            {/* NEW */}
            {activeTab === 'Score' && <ScoreSection scorePerformance={scorePerformance} summary={summary} />}
          </>
        )}
      </div>
    </aside>
  )
}