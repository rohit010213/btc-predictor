import { useState, useEffect } from 'react'

export default function Header({ currentPrice, priceAtCandleStart }) {
  const [clock, setClock] = useState('')

  useEffect(() => {
    const tick = () => {
      const d = new Date()
      const utc = d.toUTCString().slice(17, 25) + ' UTC'
      const ist = d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }) + ' IST'
      setClock(`${utc} (${ist})`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  const diff = currentPrice && priceAtCandleStart
    ? ((currentPrice - priceAtCandleStart) / priceAtCandleStart * 100)
    : null

  const isUp = diff !== null ? diff >= 0 : null

  return (
    <header className="header">
      <div className="header-left">
        <div className="header-title">
          BTC <span>5M</span> PREDICTOR · POLYMARKET
        </div>
        <div className={`header-badge ${currentPrice ? 'live' : ''}`}>
          {currentPrice ? 'LIVE' : 'CONNECTING'}
        </div>
      </div>
      <div className="header-right">
        {currentPrice && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="header-price">
              ${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            {diff !== null && (
              <span className={`live-diff ${isUp ? 'up' : 'down'}`} style={{ fontSize: '.75rem' }}>
                {isUp ? '+' : ''}{diff.toFixed(3)}%
              </span>
            )}
          </div>
        )}
        <div className="header-clock">{clock}</div>
      </div>
    </header>
  )
}
