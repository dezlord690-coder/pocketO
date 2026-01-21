const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const tradeEngine = require('./analysts.js'); 
const config = require('./config.js');

puppeteer.use(StealthPlugin());

let tradeState = {
    active: false, id: null, stake: config.INITIAL_STAKE, level: 0,
    lastDirection: null, lastVotesSnapshot: null, tradeDurationMinutes: 1
};

(async () => {
    console.log("\x1b[36m🚀 Launching AI-Driven Bridge...\x1b[0m");
    const browser = await puppeteer.launch({ 
        headless: false, defaultViewport: null,
        args: ['--no-sandbox', '--disable-web-security', '--start-maximized'] 
    });
    
    const [page] = await browser.pages();
    
    // --- UTILITY: Deep Scanner for Financial Balance ---
    const getAccountBalance = async () => {
        return await page.evaluate(() => {
            const selectors = ['.balance', '.user-balance', '[data-balance]', '.balance-value', '.current-balance', '.platform-header__balance'];
            for (let selector of selectors) {
                const el = document.querySelector(selector);
                if (el && el.innerText.includes('.')) return parseFloat(el.innerText.replace(/[^0-9.]/g, ''));
            }
            return 0;
        });
    };

    // --- WEBSOCKET INJECTION (Bridge Hook) ---
    await page.evaluateOnNewDocument(() => {
        const OriginalWS = window.WebSocket; window.activeSocket = null; window.tradeTemplate = null;
        window.marketCandles = { open: [], close: [], high: [], low: [], volume: [] };
        window.WebSocket = function(url, protocols) {
            const ws = new OriginalWS(url, protocols);
            if (url.includes('po.market')) {
                window.activeSocket = ws;
                console.log("%c[WS Bridge] Intercepted active socket.", "color: green;");
                const originalSend = ws.send;
                ws.send = function(data) {
                    if (typeof data === 'string' && data.includes('openOrder')) {
                        window.tradeTemplate = data; 
                        console.log("%c[WS Bridge] Captured trade template.", "color: green;");
                    }
                    return originalSend.apply(this, arguments);
                };
            }
            return ws;
        };
        window.fireTrade = function(amount, asset) {
            if (!window.activeSocket || !window.tradeTemplate) return false;
            let payload = JSON.parse(window.tradeTemplate.substring(2));
            const tradeData = Array.isArray(payload) ? payload : payload;
            tradeData.amount = parseFloat(amount); tradeData.requestId = Date.now(); tradeData.asset = asset;
            window.activeSocket.send(`42${JSON.stringify(payload)}`);
            return true;
        };
    });

    // Initial Navigation
    await page.goto('https://pocketoption.com', { waitUntil: 'networkidle2' });

    console.log("\n\x1b[36m--- SYSTEM STANDBY: Awaiting Auth & Data ---\x1b[0m");

    async function tick() {
        try {
            const url = page.url();
            const balance = await getAccountBalance();
            const isBridgePrimed = await page.evaluate(() => !!window.tradeTemplate);
            const candlesLength = await page.evaluate(() => window.marketCandles.close.length);

            // 1. Authentication and Navigation Status
            if (!url.includes('/cabinet/')) {
                console.log(`[Status] 🟡 Not on trading page. URL: ${url}`);
                return;
            }
            if (balance === 0) {
                console.log(`[Status] 🟡 Logged in, but balance is zero. Check account type.`);
                return;
            }

            // 2. Data Monitoring Status
            if (!isBridgePrimed) {
                console.log(`[Status] 🟠 Waiting for manual trade to prime the bridge.`);
                return;
            }
            if (candlesLength < 250) {
                console.log(`[Status] 🟠 Analysts waiting for sufficient data: ${candlesLength}/250 candles.`);
                return;
            }

            // --- Everything below this line means the system is fully operational ---
            if (tradeState.active) return; // Lock during trade execution

            // 3. System Operational Log (Once conditions are met)
            console.log(`\n\x1b[32m[Status] ✅ System Operational. Balance: $${balance} | Candles: ${candlesLength}\x1b[0m`);

            // Extract Data
            const marketData = await page.evaluate(() => window.marketCandles);
            
            // Martingale Logic
            if (tradeState.level > 0 && tradeState.lastDirection) {
                console.log(`⚠️ RECOVERY: Level ${tradeState.level}. Re-entry: ${tradeState.lastDirection}`);
                await executeTrade(tradeState.lastDirection, tradeState.tradeDurationMinutes);
                return;
            }

            // Run Analysis
            const analysis = await tradeEngine.getConsensus(marketData);

            if (analysis.signal !== "WAIT") {
                const payout = await page.evaluate(() => document.querySelector('.btn-call .profit-percent')?.innerText ? parseInt(document.querySelector('.btn-call .profit-percent').innerText) : 0);
                if (payout < config.MIN_PAYOUT) return;

                console.log(`\n🧠 SIGNAL: ${analysis.signal} | Confidence: ${analysis.confidence}`);
                
                tradeState.lastDirection = analysis.signal;
                tradeState.lastVotesSnapshot = analysis.vote_snapshot;
                tradeState.tradeDurationMinutes = analysis.duration;

                await executeTrade(analysis.signal, analysis.duration);
            }

        } catch (e) {
            if (!e.message.includes('Execution context was destroyed')) {
                console.error("Tick Error:", e.message);
            }
        }
    }

    async function executeTrade(direction, durationMinutes) {
        tradeState.active = true;
        tradeState.id = config.generateTradeId();
        
        const startBal = await getAccountBalance();
        console.log(`⚡ [${tradeState.id}] Stake: $${tradeState.stake}`);

        const tradeFired = await page.evaluate((amount, asset) => window.fireTrade(amount, asset), tradeState.stake, config.ASSET);
        if (!tradeFired) { tradeState.active = false; return; }

        const waitTimeMs = (durationMinutes * 60 * 1000) + 8000;
        await new Promise(r => setTimeout(r, waitTimeMs)); 

        const endBal = await getAccountBalance();
        const tradeWon = endBal > startBal; 
        
        console.log(`🏁 [${tradeState.id}] Result: ${tradeWon ? "\x1b[32mWIN\x1b[0m" : "\x1b[31mLOSS\x1b[0m"}`);

        tradeEngine.updatePerformance(tradeState.lastDirection, tradeWon, tradeState.lastVotesSnapshot);

        const next = config.getOutcome(tradeState.stake, tradeWon, tradeState.level);

        if (next.cooldown) await new Promise(r => setTimeout(r, 60000));

        tradeState.stake = next.stake; tradeState.level = next.level; tradeState.active = false;
        if (next.reset) { tradeState.lastDirection = null; tradeState.lastVotesSnapshot = null; }
    }

    setInterval(tick, 2000);
})();
