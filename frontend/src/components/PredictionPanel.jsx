export default function PredictionPanel({ priceToBeat, ptbSource, currentPrice, priceAtCandleStart, candleTs, countdown, prediction, predStatus }) {

  const diff = priceToBeat && currentPrice
    ? ((currentPrice - priceToBeat) / priceToBeat * 100)
    : null
  const isUp = diff !== null ? diff >= 0 : null
  const fillPct = (countdown / 300) * 100
  const urgent = countdown <= 30

  const fmt = (n) => n?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtK = (n) => n ? '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'

  return (
    <div className="card">
      {/* PTB */}
      <div style={{ marginBottom: 18 }}>
        <div className="card-label">Price To Beat (Chainlink / Candle Open)</div>
        <div className="ptb-value">{priceToBeat ? fmtK(priceToBeat) : '$—'}</div>
        <div className="ptb-sub">
          {ptbSource
            ? `${ptbSource} · Candle ${new Date((candleTs || 0) * 1000).toUTCString().slice(17, 25)} UTC (${new Date((candleTs || 0) * 1000).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false })} IST)`
            : 'Connecting to Chainlink stream…'}
        </div>
      </div>

      {/* Live price */}
      <div className="card-label">Live BTC (Chainlink)</div>
      <div className="live-row">
        <div className="live-price">{currentPrice ? `$${fmt(currentPrice)}` : '$—'}</div>
        {diff !== null && (
          <div className={`live-diff ${isUp ? 'up' : 'down'}`}>
            {isUp ? '+' : ''}{diff.toFixed(3)}%
          </div>
        )}
      </div>

      {/* Countdown */}
      <div className="countdown-row">
        <div className="cd-label">Next candle in</div>
        <div className="cd-val">
          {Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, '0')}
        </div>
        <div className="cd-bar">
          <div
            className={`cd-fill ${urgent ? 'urgent' : 'normal'}`}
            style={{ width: `${fillPct}%` }}
          />
        </div>
      </div>

      {/* Prediction */}
      <div className={`pred-card ${predStatus === 'empty' ? 'empty' : predStatus === 'loading' ? 'loading' : prediction?.direction?.toLowerCase() || 'empty'}`}>
        {predStatus === 'empty' && (
          <div className="empty-msg">Waiting for candle boundary…</div>
        )}
        {predStatus === 'loading' && (
          <div className="pred-dir loading">
            <div className="spin" /> Analysing candle…
          </div>
        )}
        {predStatus === 'done' && prediction && (
          <>
            <div className="pred-top">
              <div className={`pred-dir ${prediction.direction.toLowerCase()}`}>
                {prediction.direction === 'UP' ? '▲ UP' : '▼ DOWN'}
              </div>
              <div className="pred-conf">
                <div className="conf-num">{prediction.confidence}%</div>
                <div>confidence</div>
              </div>
            </div>
            <div className="conf-bar">
              <div
                className={`conf-fill ${prediction.direction.toLowerCase()}`}
                style={{ width: `${prediction.confidence}%` }}
              />
            </div>
            <div className="pred-analysis">{prediction.analysis}</div>
            <div className="pred-risk">⚠ {prediction.risk}</div>
          </>
        )}
      </div>
    </div>
  )
}
