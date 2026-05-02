// Results panel shown in main content area (quick summary + recent trades)
import { useState } from 'react'

export default function ResultsPanel({ trades, selectedDate, changeDate }) {
  const resolved = trades.filter(t => t.status === 'resolved')
  const wins = resolved.filter(t => t.result === 'win').length
  const losses = resolved.filter(t => t.result === 'loss').length
  const wr = resolved.length ? ((wins / resolved.length) * 100).toFixed(0) : 0

  return (
    <div className="card">
      <div className="card-title">
        <span>📊</span> Results
        <span style={{ marginLeft: 'auto', fontSize: '.65rem', color: 'var(--dim)', fontFamily: 'IBM Plex Mono' }}>
          {selectedDate}
        </span>
      </div>

      {/* Summary */}
      <div className="stat-grid" style={{ marginBottom: 14 }}>
        <div className="stat-box">
          <div className="stat-val gold">{wr}%</div>
          <div className="stat-lbl">Win Rate</div>
        </div>
        <div className="stat-box">
          <div className="stat-val green">{wins}</div>
          <div className="stat-lbl">Wins</div>
        </div>
        <div className="stat-box">
          <div className="stat-val red">{losses}</div>
          <div className="stat-lbl">Losses</div>
        </div>
      </div>

      {/* Trade list */}
      <div className="card-label">Recent Trades</div>
      <div className="trade-list" style={{ maxHeight: 280 }}>
        {!trades.length
          ? <div className="empty-msg">No trades for this date</div>
          : trades.slice(0, 50).map(t => {
            const time = t.timestamp
              ? `${new Date(t.timestamp).toUTCString().slice(17, 22)} UTC (${new Date(t.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false })} IST)`
              : '—'
            const ptbStr = t.priceToBeat
              ? '$' + parseFloat(t.priceToBeat).toLocaleString('en-US', { maximumFractionDigits: 0 })
              : '—'
            const res = t.status === 'pending' ? 'PEND' : t.result === 'win' ? 'WIN ✓' : 'LOSS ✗'
            const rCls = t.status === 'pending' ? 'pending' : t.result
            return (
              <div key={t.id || t._id} className="trade-row" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span className={`tr-dir ${(t.direction || '').toLowerCase()}`} style={{ fontWeight: 600 }}>{t.direction}</span>
                <span className="tr-time" style={{ fontSize: 9, color: 'var(--dim)', flex: 1 }}>{time}</span>
                
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 60 }}>
                  <span className="tr-ptb" style={{ fontWeight: 500 }}>{ptbStr}</span>
                  {t.entryDiff != null && (
                    <span style={{ fontSize: 8, color: t.entryDiff > 0 ? 'var(--up)' : 'var(--down)', opacity: 0.9 }}>
                      {t.entryDiff > 0 ? '+' : ''}{t.entryDiff.toFixed(2)}%
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 60 }}>
                  <span className={`tr-res ${rCls}`} style={{ fontWeight: 600 }}>{res}</span>
                  {t.resolveSource && (
                    <span style={{ fontSize: 7, color: 'var(--dim)', textTransform: 'uppercase' }}>
                      {t.resolveSource.replace('_', ' ')}
                    </span>
                  )}
                </div>

                {t.score != null && (
                  <div style={{ padding: '2px 4px', background: 'rgba(126, 184, 255, 0.1)', border: '1px solid rgba(126, 184, 255, 0.2)', borderRadius: 4, fontSize: 8, color: '#7eb8ff' }}>
                    {t.score}⚡
                  </div>
                )}
              </div>
            )
          })
        }
      </div>

      {/* Hourly breakdown inside results */}
      {trades.length > 0 && <HourlyMini trades={resolved} />}
    </div>
  )
}

function HourlyMini({ trades }) {
  const hourMap = {}
  trades.forEach(t => {
    let h = t.hour
    if (h == null && t.timestamp) {
      const hfmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false })
      h = parseInt(hfmt.format(new Date(t.timestamp))) % 24
    }
    if (h === null) return
    if (!hourMap[h]) hourMap[h] = { total: 0, wins: 0 }
    hourMap[h].total++
    if (t.result === 'win') hourMap[h].wins++
  })

  const hours = Object.keys(hourMap).map(Number).sort((a, b) => a - b)
  if (!hours.length) return null

  return (
    <div style={{ marginTop: 14 }}>
      <div className="section-divider" />
      <div className="card-label" style={{ marginBottom: 8 }}>Hourly Breakdown</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 200, overflowY: 'auto' }}>
        {hours.map(h => {
          const d = hourMap[h]
          const wr = Math.round((d.wins / d.total) * 100)
          const cls = wr >= 60 ? 'high' : wr >= 40 ? 'mid' : 'low'
          return (
            <div key={h} className="hour-row">
              <span className="hour-label" style={{ fontSize: 9, lineHeight: 1.2 }}>{h.toString().padStart(2, '0')}:00<br/>to {((h + 1) % 24).toString().padStart(2, '0')}:00</span>
              <div className="hour-bar-wrap">
                <div className={`hour-bar ${cls}`} style={{ width: `${wr}%` }} />
              </div>
              <span className="hour-trades">{d.total}t</span>
              <span className={`hour-rate ${cls}`}>{wr}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
