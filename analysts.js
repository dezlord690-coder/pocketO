const TI = require('technicalindicators');

// --- UTILITIES ---
const getLast = (arr) => arr && arr.length > 0 ? arr[arr.length - 1] : null;
const getPrev = (arr) => arr && arr.length > 1 ? arr[arr.length - 2] : null;
const getAvg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

// --- THE TEAM OF 15 ---
const analysts = {
    // Momentum
    oscar: (data) => {
        const rsi = getLast(TI.RSI.calculate({ values: data.close, period: 14 }));
        if (rsi < 20) return 3; if (rsi > 80) return -3; return 0;
    },
    stacy: (data) => {
        const s = getLast(TI.Stochastic.calculate({ high: data.high, low: data.low, close: data.close, period: 14, signalPeriod: 3 }));
        if (s.k < 20 && s.k > s.d) return 2; if (s.k > 80 && s.k < s.d) return -2; return 0;
    },
    willy: (data) => {
        const w = getLast(TI.WilliamsR.calculate({ high: data.high, low: data.low, close: data.close, period: 14 }));
        if (w < -90) return 2; if (w > -10) return -2; return 0;
    },
    mac: (data) => {
        const m = getLast(TI.MACD.calculate({ values: data.close, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }));
        return m.histogram > 0 ? 1 : -1;
    },
    rocco: (data) => {
        const r = getLast(TI.ROC.calculate({ values: data.close, period: 14 }));
        if (r < -1) return 1; if (r > 1) return -1; return 0;
    },
    
    // Volatility
    bianca: (data) => {
        const b = getLast(TI.BollingerBands.calculate({ period: 20, values: data.close, stdDev: 2.2 }));
        const p = getLast(data.close);
        if (p < b.lower) return 3; if (p > b.upper) return -3; return 0;
    },
    charlie: (data) => {
        const c = getLast(TI.CCI.calculate({ high: data.high, low: data.low, close: data.close, period: 20 }));
        if (c < -150) return 2; if (c > 150) return -2; return 0;
    },
    kelt: (data) => {
        const ema = getLast(TI.EMA.calculate({ period: 20, values: data.close }));
        const p = getLast(data.close);
        return p < ema ? 1 : -1; // Mean reversion bias
    },
    atria: (data) => { return 0; }, // Neutral volatility observer

    // Trend & Safety
    titan: (data) => {
        const a = getLast(TI.ADX.calculate({ high: data.high, low: data.low, close: data.close, period: 14 }));
        if (a.adx > 35) return a.pdi > a.mdi ? 5 : -5; // Trend Follower
        return 0;
    },
    emma: (data) => {
        const e = getLast(TI.EMA.calculate({ period: 200, values: data.close }));
        const p = getLast(data.close);
        return p > e ? 1 : -1;
    },
    paros: (data) => {
        const p = getLast(TI.PSAR.calculate({ high: data.high, low: data.low, step: 0.02, max: 0.2 }));
        const pr = getLast(data.close);
        return pr > p ? 1 : -1;
    },

    // Pattern
    cipher: (data) => {
        const c = data.close.slice(-7); const o = data.open.slice(-7);
        let r=0, g=0;
        for(let i=6; i>=2; i--) { c[i]>o[i] ? g++ : r++; }
        if(r>=4) return 2; if(g>=4) return -2; return 0;
    },
    shadow: (data) => {
        const o=getLast(data.open), c=getLast(data.close), h=getLast(data.high), l=getLast(data.low);
        if((Math.min(o,c)-l) > Math.abs(o-c)*2) return 1; // Hammer
        return 0;
    },
    vola: (data) => { return 0; } // Volume placeholder
};

module.exports = async function getConsensus(marketData) {
    if (!marketData || !marketData.close || marketData.close.length < 50) return { total_score: 0, risk_level: "WAIT" };

    let totalScore = 0;
    let votes = {};
    let insights = [];

    for (let name in analysts) {
        try {
            const vote = analysts[name](marketData);
            votes[name] = vote;
            totalScore += vote;
            if (Math.abs(vote) >= 2) insights.push(`${name}: ${vote}`);
        } catch (e) { votes[name] = 0; }
    }

    const adx = getLast(TI.ADX.calculate({ high: marketData.high, low: marketData.low, close: marketData.close, period: 14 }));
    let risk = "LOW";
    if (adx.adx > 40) risk = "HIGH (Martingale Dangerous)";

    return { total_score: totalScore, risk_level: risk, key_insights: insights };
};
