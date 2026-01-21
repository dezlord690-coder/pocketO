const TI = require('technicalindicators');
const fs = require('fs');
const path = require('path');

// --- PERSISTENCE LAYER ---
const WEIGHTS_FILE = path.join(__dirname, 'analyst_memory.json');
const getLast = (arr) => arr && arr.length > 0 ? arr[arr.length - 1] : null;

// Load memory or initialize if first time
let analystWeights = {
    oscar: 1.0, milo: 1.0, mac: 1.0, rocco: 1.0, stacy: 1.0,
    titan: 1.0, emma: 1.0, paros: 1.0, bianca: 1.0, lexi: 1.0,
    piper: 1.0, jax: 1.0, charlie: 1.0, buster: 1.0, shadow: 1.0,
    finn: 1.0, obie: 1.0
};
let tradeCount = 0; // Added memory for weight reversion timing

if (fs.existsSync(WEIGHTS_FILE)) {
    try {
        const memory = JSON.parse(fs.readFileSync(WEIGHTS_FILE));
        analystWeights = memory.weights;
        tradeCount = memory.tradeCount;
    } catch (e) { console.log("Memory corrupted, starting fresh."); }
}

const saveMemory = () => {
    const memory = { weights: analystWeights, tradeCount: tradeCount };
    fs.writeFileSync(WEIGHTS_FILE, JSON.stringify(memory, null, 2));
};

// --- ANALYST TEAM (17 Members) ---
const analysts = {
    oscar: (d, s) => { const r = getLast(s.rsi); return { v: r < 25 ? 3 : (r > 75 ? -3 : 0), t: 2 }; },
    milo: (d, s) => {
        const r = s.rsi; const lp = getLast(d.close), pp = d.close[d.close.length - 2];
        const lr = getLast(r), pr = r[r.length - 2];
        if (lp < pp && lr > pr) return { v: 2, t: 4 }; if (lp > pp && lr < pr) return { v: -2, t: 4 };
        return { v: 0, t: 0 };
    },
    mac: (d) => { const m = getLast(TI.MACD.calculate({ values: d.close, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 })); return { v: m.histogram > 0 ? 1 : -1, t: 5 }; },
    rocco: (d) => { const r = getLast(TI.ROC.calculate({ values: d.close, period: 14 })); return { v: r < -1 ? 1 : (r > 1 ? -1 : 0), t: 3 }; },
    stacy: (d) => { const s = getLast(TI.Stochastic.calculate({ high: d.high, low: d.low, close: d.close, period: 14, signalPeriod: 3 })); return { v: (s.k < 20 && s.k > s.d) ? 2 : (s.k > 80 && s.k < s.d ? -2 : 0), t: 3 }; },
    titan: (d, s) => { const a = getLast(s.adx); return { v: a.adx > 30 ? (a.pdi > a.mdi ? 5 : -5) : 0, t: 5, strongTrend: a.adx > 30 }; },
    emma: (d, s) => { const e = getLast(s.ema200); return { v: getLast(d.close) > e ? 2 : -2, t: 5 }; },
    paros: (d) => { const p = getLast(TI.PSAR.calculate({ high: d.high, low: d.low, step: 0.02, max: 0.2 })); return { v: getLast(d.close) > p ? 1 : -1, t: 4 }; },
    bianca: (d, s, tt) => { 
        if (tt?.strongTrend) return { v: 0, t: 0 };
        const b = getLast(s.bb); const p = getLast(d.close);
        return { v: p < b.lower ? 3 : (p > b.upper ? -3 : 0), t: 1, m_predict: 'M1' };
    },
    lexi: (d, s) => {
        const b = getLast(s.bb), k = getLast(s.kc);
        if (b.upper < k.upper && b.lower > k.lower) return { v: 0, t: 0, status: "SQUEEZING" };
        return { v: getLast(d.close) > k.middle ? 1 : -1, t: 3 };
    },
    piper: (d, s) => { const e = getLast(s.ema20); const p = ((getLast(d.close) - e) / e) * 100; return { v: p > 2 ? -2 : (p < -2 ? 2 : 0), t: 3 }; },
    jax: (d, s) => { const r = Math.abs(getLast(d.high) - getLast(d.low)); return { v: r > getLast(s.atr) * 3 ? (getLast(d.close) > getLast(d.open) ? -4 : 4) : 0, t: 2 }; },
    charlie: (d) => { const c = getLast(TI.CCI.calculate({ high: d.high, low: d.low, close: d.close, period: 20 })); return { v: c < -150 ? 2 : (c > 150 ? -2 : 0), t: 2 }; },
    buster: (d) => {
        const v = d.volume; const av = (v.slice(-10).reduce((a,b)=>a+b,0)/10);
        const p = getLast(d.close), h = Math.max(...d.high.slice(-10, -1));
        return { v: (getLast(v) > av * 1.5 && p > h) ? 4 : 0, t: 2 };
    },
    shadow: (d) => {
        const o=getLast(d.open), c=getLast(d.close), h=getLast(d.high), l=getLast(d.low);
        const b = Math.abs(o-c), lw = Math.min(o,c)-l, uw = h-Math.max(o,c);
        return { v: lw > b * 2 ? 2 : (uw > b * 2 ? -2 : 0), t: 1 };
    },
    finn: (d) => {
        const r = d.close.slice(-20); const h = Math.max(...r), l = Math.min(...r);
        const f = h - (h - l) * 0.618; return { v: Math.abs(getLast(d.close) - f) / getLast(d.close) < 0.001 ? 2 : 0, t: 5 };
    },
    obie: (d) => {
        const o = TI.OBV.calculate({ values: d.close, volume: d.volume });
        const lastOBV = getLast(o), prevOBV = o[o.length-2];
        return { v: lastOBV > prevOBV ? 1 : -1, t: 4 };
    }
};

// --- CORE ENGINE ---
module.exports = {
    getConsensus: async (marketData) => {
        // Data Integrity Check (Requires more history for EMA200/MACD/OBV accuracy)
        if (!marketData || marketData.close.length < 250) {
            return { signal: "WAIT", reason: "Insufficient Data History (>250 needed)" };
        }

        const shared = {
            rsi: TI.RSI.calculate({ values: marketData.close, period: 14 }),
            adx: TI.ADX.calculate({ high: marketData.high, low: marketData.low, close: marketData.close, period: 14 }),
            ema200: TI.EMA.calculate({ values: marketData.close, period: 200 }),
            ema20: TI.EMA.calculate({ values: marketData.close, period: 20 }),
            bb: TI.BollingerBands.calculate({ values: marketData.close, period: 20, stdDev: 2 }),
            kc: TI.KeltnerChannels.calculate({ high: marketData.high, low: marketData.low, close: marketData.close, period: 20, multiplier: 1.5 }),
            atr: TI.ATR.calculate({ high: marketData.high, low: marketData.low, close: marketData.close, period: 14 })
        };

        const titanReport = analysts.titan(marketData, shared);
        const lexiReport = analysts.lexi(marketData, shared);
        
        let totalScore = 0;
        let voteSnapshot = {};
        const weightedTimes = [];

        // Neural Weighted Voting
        Object.keys(analysts).forEach(name => {
            const report = (name === 'bianca') ? analysts[name](marketData, shared, titanReport) : analysts[name](marketData, shared);
            const weight = analystWeights[name] || 1.0;
            
            const weightedVote = report.v * weight;
            
            totalScore += weightedVote;
            voteSnapshot[name] = report.v; 

            // Weighted Duration Logic: Stronger votes get more weight in time calculation
            if (report.v !== 0) {
                for (let i = 0; i < Math.abs(report.v); i++) {
                    weightedTimes.push(report.t);
                }
            }
        });

        // Calculate average duration, weighted by conviction
        const avgTime = weightedTimes.length > 0 
            ? Math.round(weightedTimes.reduce((a, b) => a + b, 0) / weightedTimes.length) 
            : 3; 

        // Risk Tolerance Dial: Threshold determines how consensus-driven the signal is.
        // 12 = Moderate/Aggressive, 25 = Conservative, 40 = Sniper
        const threshold = 12; 
        
        const isSqueezing = lexiReport.status === "SQUEEZING";
        
        const signal = (totalScore >= threshold && !isSqueezing) ? "CALL" : 
                       (totalScore <= -threshold && !isSqueezing) ? "PUT" : "WAIT";

        return {
            signal,
            duration: Math.max(1, Math.min(5, avgTime)),
            vote_snapshot: voteSnapshot, 
            martingale_advice: Math.abs(totalScore) < 20 ? "M1-M2 Likely Recovery" : "Direct Win Bias",
            score: totalScore.toFixed(2),
            confidence: `${Math.min(Math.abs(totalScore) * 3.5, 100).toFixed(0)}%`
        };
    },

    // CALL THIS AFTER EVERY TRADE TO MAKE THE BOT SMARTER
    updatePerformance: (lastSignal, wasWin, voteSnapshot) => {
        if (!voteSnapshot) return;
        const learningRate = 0.05;
        const meanReversionRate = 0.001; // Tiny drift back to 1.0 over time

        Object.keys(analystWeights).forEach(name => {
            const vote = voteSnapshot[name];
            if (vote === 0) return;

            const correct = (lastSignal === "CALL" && vote > 0) || (lastSignal === "PUT" && vote < 0);
            
            if (wasWin && correct) {
                analystWeights[name] += learningRate;
            } else if (!wasWin && correct) {
                analystWeights[name] -= learningRate;
            } else if (wasWin && !correct) {
                analystWeights[name] -= (learningRate * 0.5); 
            }

            // Mean Reversion: Slowly nudge weight back to 1.0 to prevent permanent silencing
            if (analystWeights[name] > 1.0) analystWeights[name] -= meanReversionRate;
            if (analystWeights[name] < 1.0) analystWeights[name] += meanReversionRate;

            // Clamp final weights
            analystWeights[name] = Math.max(0.3, Math.min(2.5, analystWeights[name]));
        });

        tradeCount++;
        saveMemory(); // Commit to JSON file
        return analystWeights;
    }
};
