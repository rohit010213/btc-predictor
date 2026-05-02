import { WebSocket } from 'ws';

let chainlinkBtcPrice = null;
let chainlinkPriceTs = null;
const candlePriceLock = new Map(); // candleTs -> { price, capturedAt, chainlinkTs }

export function getCurrentCandleTs() {
  return Math.floor(Date.now() / 1000 / 300) * 300;
}

export function connectChainlinkStream() {
  const ws = new WebSocket('wss://ws-live-data.polymarket.com');

  ws.on('open', () => {
    console.log('✅ Polymarket RTDS connected');
    ws.send(JSON.stringify({
      action: 'subscribe',
      subscriptions: [{
        topic: 'crypto_prices_chainlink',
        type: '*',
        filters: '{"symbol":"btc/usd"}'
      }]
    }));

    setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send('PING');
    }, 5000);
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.topic === 'crypto_prices_chainlink' && msg.payload?.symbol === 'btc/usd') {
        chainlinkBtcPrice = msg.payload.value;
        chainlinkPriceTs = msg.payload.timestamp;

        const candleTs = getCurrentCandleTs();
        if (!candlePriceLock.has(candleTs)) {
          candlePriceLock.set(candleTs, {
            price: chainlinkBtcPrice,
            capturedAt: Date.now(),
            chainlinkTs: chainlinkPriceTs
          });
          console.log(`🕯 Candle ${candleTs} locked at $${chainlinkBtcPrice} (Chainlink)`);

          if (candlePriceLock.size > 100) {
            const oldest = [...candlePriceLock.keys()].sort()[0];
            candlePriceLock.delete(oldest);
          }
        }
      }
    } catch (e) {}
  });

  ws.on('close', () => {
    console.warn('⚠ RTDS disconnected — reconnecting in 3s');
    setTimeout(connectChainlinkStream, 3000);
  });

  ws.on('error', (err) => {
    console.error('RTDS error:', err.message);
    ws.terminate();
  });
}

export function getChainlinkState() {
  return { chainlinkBtcPrice, chainlinkPriceTs, candlePriceLock };
}
