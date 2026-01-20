const TI = require('technicalindicators');

// Strategy logic for different bodies
const bodies = {
    rsi: (data) => {
        const rsi = TI.RSI.calculate({ values: data.close, period: 14 });
        const last = rsi[rsi.length - 1];
        if (last < 30) return 1; // CALL
        if (last > 70) return -1; // PUT
        return 0;
    },
    bollinger: (data) => {
        const bb = TI.BollingerBands.calculate({ period: 20, values: data.close, stdDev: 2 });
        const last = bb[bb.length - 1];
        const price = data.close[data.close.length - 1];
        if (price <= last.lower) return 1;
        if (price >= last.upper) return -1;
        return 0;
    },
    emaCross: (data) => {
        const ema9 = TI.EMA.calculate({ period: 9, values: data.close });
        const ema21 = TI.EMA.calculate({ period: 21, values: data.close });
        if (ema9[ema9.length - 1] > ema21[ema21.length - 1]) return 1;
        return -1;
    },
    historian: (data) => {
        // Body 10: Compare last 20 candles
        const last20 = data.close.slice(-20);
        const greenCount = last20.filter((c, i) => c > data.open[i]).length;
        return greenCount > 12 ? 1 : (greenCount < 8 ? -1 : 0);
    }
};

module.exports = async function getConsensus(marketData) {
    let score = 0;
    // Simulate 10 different analytical approaches
    score += bodies.rsi(marketData);
    score += bodies.bollinger(marketData);
    score += bodies.emaCross(marketData) * 2; // Weighting heavy on trend
    score += bodies.historian(marketData) * 3; // Weighting heavy on history
    
    // Total of 10 "votes"
    return score; 
};
