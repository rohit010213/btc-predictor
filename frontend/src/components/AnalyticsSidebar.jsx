// Analytics Sidebar — date filter, hourly breakdown, daily table, trades
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
          style={{ width: '100%', maxWidth: '100%', background: '#1c2333', color: '#e8eeff', border: '1px solid #3d4f6e', borderRadius: 4, padding: '4px 8px', fontSize: 10, outline: 'none', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}
        >
          {hourly.map(h => {
            const istH = h.hour;
            const nextH = (istH + 1) % 24;
            
            const todayStr = new Date().toISOString().slice(0, 10);
            const dStart = new Date(`${todayStr}T${istH.toString().padStart(2, '0')}:00:00+05:30`);
            const dEnd = new Date(`${todayStr}T${nextH.toString().padStart(2, '0')}:00:00+05:30`);
            
            const utcStart = dStart.toLocaleTimeString('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' });
            const utcEnd = dEnd.toLocaleTimeString('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' });
            
            const etStart = dStart.toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' });
            const etEnd = dEnd.toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' });

            return (
              <option key={h.hour} value={h.hour}>
                {istH.toString().padStart(2, '0')}:00 - {nextH.toString().padStart(2, '0')}:00 IST | {utcStart} - {utcEnd} UTC | {etStart} - {etEnd} ET ({h.total} trades)
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
      </div>

      <div className="card-label" style={{ marginBottom: 10 }}>Trades from {hourData.hour.toString().padStart(2, '0')}:00 to {((hourData.hour + 1) % 24).toString().padStart(2, '0')}:00</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 350, overflowY: 'auto' }}>
        {hourData.trades.map(t => {
          const ptbStr = t.priceToBeat ? '$' + parseFloat(t.priceToBeat).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'
          const resStr = t.resolvePrice ? '$' + parseFloat(t.resolvePrice).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'
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
  // Filter daily data to show only the selected date's stats
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
          </tr>
        </thead>
        <tbody>
          <tr key={dateData.date} style={{ background: 'rgba(255,255,255,0.05)' }}>
            <td style={{ color: '#8899bb' }}>{dateData.date.slice(5)}</td>
            <td style={{ color: '#e8eeff' }}>{dateData.total}</td>
            <td style={{ color: '#00e676' }}>{dateData.wins}</td>
            <td style={{ color: '#ff1744' }}>{dateData.losses}</td>
            <td><WrPill wr={dateData.winRate} /></td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ── Trade List (date filtered) ─────────────────────────────────────
function TradeListSection({ trades }) {
  if (!trades?.length) return <div className="empty-msg">No trades for this date</div>

  return (
    <div>
      <div className="card-label" style={{ marginBottom: 10 }}>
        Trades ({trades.length})
      </div>
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
              <span className={`tr-dir ${(t.direction || '').toLowerCase()}`}>
                {t.direction}
              </span>
              <span className="tr-time">{time}</span>
              <span className="tr-ptb">{ptbStr}</span>
              <span className={`tr-res ${rCls}`}>{res}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Sidebar ───────────────────────────────────────────────────
const TABS = ['Hourly', 'Daily', 'Trades']

export default function AnalyticsSidebar({ hourly, daily, trades, selectedDate, changeDate, loading }) {
  const [activeTab, setActiveTab] = useState('Hourly')

  return (
    <aside className="sidebar">
      {/* Tabs */}
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

      {/* Date filter */}
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

      {/* Content */}
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
          </>
        )}
      </div>
    </aside>
  )
}
