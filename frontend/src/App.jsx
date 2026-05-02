import './index.css'
import Header from './components/Header'
import PredictionPanel from './components/PredictionPanel'
import ResultsPanel from './components/ResultsPanel'
import AnalyticsSidebar from './components/AnalyticsSidebar'
import { useBtcEngine } from './hooks/useBtcEngine'
import { useAnalytics } from './hooks/useAnalytics'

export default function App() {
  const engine = useBtcEngine()
  const analytics = useAnalytics()

  return (
    <div className="app-shell">
      <Header
        currentPrice={engine.currentPrice}
        priceAtCandleStart={engine.priceAtCandleStart}
      />

      <div className="body-row">
        {/* ── LEFT: Analytics Sidebar ── */}
        <AnalyticsSidebar
          hourly={analytics.hourly}
          daily={analytics.daily}
          trades={analytics.trades}
          scorePerformance={analytics.scorePerformance}
          summary={analytics.summary}
          heatmap={analytics.heatmap}
          selectedDate={analytics.selectedDate}
          changeDate={analytics.changeDate}
          loading={analytics.loading}
        />

        {/* ── CENTER: Main Content ── */}
        <main className="main-content">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
            <PredictionPanel
              priceToBeat={engine.priceToBeat}
              ptbSource={engine.ptbSource}
              currentPrice={engine.currentPrice}
              priceAtCandleStart={engine.priceAtCandleStart}
              candleTs={engine.candleTs}
              countdown={engine.countdown}
              prediction={engine.prediction}
              predStatus={engine.predStatus}
            />
            <ResultsPanel
              trades={analytics.trades}
              selectedDate={analytics.selectedDate}
              changeDate={analytics.changeDate}
            />
          </div>

          <div style={{
            textAlign: 'center',
            fontSize: '.6rem',
            color: 'var(--dim)',
            padding: '8px 0',
            letterSpacing: '.08em',
          }}>
            BTC 5M PREDICTOR · Data: Polymarket RTDS + Chainlink · Analytics stored in MongoDB
          </div>
        </main>
      </div>
    </div>
  )
}