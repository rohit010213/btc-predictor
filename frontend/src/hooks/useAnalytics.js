import { useState, useEffect, useCallback } from 'react'

const BACKEND = (import.meta.env.VITE_BACKEND_URL || '').replace(/\/$/, '')

function getISTDateString() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
}

export function useAnalytics() {
  const [summary, setSummary] = useState(null)
  const [hourly, setHourly] = useState([])
  const [daily, setDaily] = useState([])
  const [trades, setTrades] = useState([])
  const [scorePerformance, setScorePerformance] = useState([]) // NEW
  const [loading, setLoading] = useState(true)

  const [selectedDate, setSelectedDate] = useState(() => {
    return localStorage.getItem('btc_dashboard_date') || getISTDateString()
  })

  const fetchSummary = useCallback(async () => {
    try {
      const r = await fetch(`${BACKEND}/api/analytics/summary`)
      setSummary(await r.json())
    } catch { }
  }, [])

  const fetchHourly = useCallback(async (date) => {
    try {
      const url = date
        ? `${BACKEND}/api/analytics/hourly?date=${date}`
        : `${BACKEND}/api/analytics/hourly`
      const r = await fetch(url)
      setHourly(await r.json())
    } catch { }
  }, [])

  const fetchDaily = useCallback(async () => {
    try {
      const r = await fetch(`${BACKEND}/api/analytics/daily?limit=30`)
      setDaily(await r.json())
    } catch { }
  }, [])

  const fetchTrades = useCallback(async (date) => {
    try {
      const url = date
        ? `${BACKEND}/api/trades?date=${date}`
        : `${BACKEND}/api/trades`
      const r = await fetch(url)
      setTrades(await r.json())
    } catch { }
  }, [])

  // NEW
  const fetchScorePerformance = useCallback(async () => {
    try {
      const r = await fetch(`${BACKEND}/api/analytics/score-performance`)
      setScorePerformance(await r.json())
    } catch { }
  }, [])

  const refresh = useCallback(async (date) => {
    setLoading(true)
    await Promise.all([
      fetchSummary(),
      fetchHourly(date),
      fetchDaily(),
      fetchTrades(date),
      fetchScorePerformance(), // NEW
    ])
    setLoading(false)
  }, [fetchSummary, fetchHourly, fetchDaily, fetchTrades, fetchScorePerformance])

  useEffect(() => {
    refresh(selectedDate)
    let lastToday = getISTDateString()
    const id = setInterval(() => {
      const currentToday = getISTDateString()
      if (currentToday !== lastToday) {
        lastToday = currentToday
        setSelectedDate(currentToday)
        localStorage.setItem('btc_dashboard_date', currentToday)
        refresh(currentToday)
      } else {
        refresh(selectedDate)
      }
    }, 60000)
    return () => clearInterval(id)
  }, [refresh, selectedDate])

  const changeDate = (date) => {
    setSelectedDate(date)
    localStorage.setItem('btc_dashboard_date', date)
    refresh(date)
  }

  return {
    summary, hourly, daily, trades,
    scorePerformance, // NEW
    loading, selectedDate, changeDate, refresh,
  }
}