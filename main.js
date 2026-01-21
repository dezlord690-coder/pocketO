const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const tradeEngine = require('./analysts.js'); 
const config = require('./config.js');

puppeteer.use(StealthPlugin());

let tradeState = {
    active: false, id: null, stake: config.INITIAL_STAKE, level: 0,
    lastDirection: null, lastVotesSnapshot: null, tradeDurationMinutes: 1
};

// Global log tracker to keep the console clean
let lastLogStatus = '';

(async () => {
    console.log("\x1b[36m🚀 Launching AI-Driven Bridge...\x1b[0m");
    const browser = await puppeteer.launch({ 
        headless: false, defaultViewport: null,
        args: ['--no-sandbox', '--disable-web-security', '--start-maximized'] 
    });
    
    const [page] = await browser.pages();
    
    // --- DEEP SCANNER ---
    const getAccountBalance = async () => {
        return await page.evaluate(() => {
            const possibleSelectors = ['.balance', '.user-balance', '[data-balance]', '.balance-value', '.current-balance'];
            for (let selector of possibleSelectors) {
                const el = document.querySelector(selector);
                if (el && el.innerText.includes('.')) {
                    const val = parseFloat(el.innerText.replace(/[^0-9.]/g, ''));
                    if (val > 0) return val;
                }
            }
            const spans = Array.from(document.querySelectorAll('span, div'));
            for (let s of spans) {
                if (s.innerText.length < 20 && (s.innerText.includes(',') || s.innerText.includes('.'))) {
                    const val = parseFloat(s.innerText.replace(/[^0-9.]/g, ''));
                    if (val > 100) return val; 
                }
            }
            return 0;
        });
    };

    // --- WEBSOCKET INJECTION (Improved Listening) ---
    await page.evaluateOnNewDocument(() => {
        const OriginalWS = window.WebSocket; window.activeSocket = null; window.tradeTemplate = null;
        window.marketCandles = { open: [], close: [], high: [], low: [], volume: [] };
        
        window.WebSocket = function(url, protocols) {
            const ws = new OriginalWS(url, protocols);
            if (url.includes('po.market')) {
                window.activeSocket = ws;
                
                                ws.addEventListener('message', (event) => {
                    try {
                        const msg = event.data;
                        if (typeof msg === 'string' && msg.startsWith('42')) {
                            const parsed = JSON.parse(msg.substring(2));
                            
                            // Check for 'history' or 'candles' topic and extract the data array
                            if (parsed[0] === 'history' || parsed[0] === 'candles') {
                                const data = parsed[1];
                                
                                // Map the raw numeric values for technicalindicators library
                                window.marketCandles.open = data.map(c => parseFloat(c[1]));
                                window.marketCandles.close = data.map(c => parseFloat(c[2]));
                                window.marketCandles.high = data.map(c => parseFloat(c[3]));
                                window.marketCandles.low = data.map(c => parseFloat(c[4]));
                                
                                // Note: Volume is often null in quick H/L interface, so we omit volume mapping here.
                            }
                            // Add handling for live 'candle' updates if needed later
                        }
                    } catch (e) {}
                });

                });

                const originalSend = ws.send;
                ws.send = function(data) {
                    if (typeof data === 'string' && data.includes('openOrder')) {
                        window.tradeTemplate = data; 
                    }
                    return originalSend.apply(this, arguments);
                };
            }
            return ws;
        };

        window.fireTrade = function(amount, asset) {
            if (!window.activeSocket || !window.tradeTemplate) return false;
            let payload = JSON.parse(window.tradeTemplate.substring(2));
            const tradeData = Array.isArray(payload[1]) ? payload[1] : (payload.amount ? payload : payload[1]);
            tradeData.amount = parseFloat(amount); 
            tradeData.requestId = Date.now(); 
            tradeData.asset = asset;
            window.activeSocket.send(`42${JSON.stringify(payload)}`);
            return true;
        };
    });

    await page.goto('https://pocketoption.com', { waitUntil: 'networkidle2' });

    console.log("\n\x1b[36m--- SYSTEM STANDBY ---\x1b[0m");

    async function tick() {
        try {
            const url = page.url();
            const balance = await getAccountBalance();
            const isBridgePrimed = await page.evaluate(() => !!window.tradeTemplate);
            const candlesLength = await page.evaluate(() => window.marketCandles.close.length);

            // Manage Status Output
            let status = '';
            if (!url.includes('/cabinet/')) status = "🟡 Navigation: Enter Trading Cabinet.";
            else if (balance === 0) status = "🟡 Balance: $0.00 (Switch to Demo)";
            else if (!isBridgePrimed) status = "🟠 Bridge: Waiting for manual trade to prime socket.";
            else if (candlesLength < 250) status = `🟠 Data: Warming up analysts... (${candlesLength}/250)`;
            else status = "✅ System Operational. Running 17 Analysts...";

            if (status !== lastLogStatus) {
                console.log(`[Status] ${status}`);
                lastLogStatus = status;
            }

            // Execution Logic
            if (candlesLength < 250 || tradeState.active || !url.includes('/cabinet/') || balance === 0) return;

            const marketData = await page.evaluate(() => window.marketCandles);
            
            if (tradeState.level > 0 && tradeState.lastDirection) {
                await executeTrade(tradeState.lastDirection, tradeState.tradeDurationMinutes);
                return;
            }

            const analysis = await tradeEngine.getConsensus(marketData);

            if (analysis.signal !== "WAIT") {
                const payout = await page.evaluate(() => {
                    const el = document.querySelector('.btn-call .profit-percent') || document.querySelector('.profit-percent');
                    return el ? parseInt(el.innerText) : 0;
                });
                
                if (payout < config.MIN_PAYOUT) return;

                console.log(`\n🧠 SIGNAL: ${analysis.signal} | Score: ${analysis.score}`);
                tradeState.lastDirection = analysis.signal;
                tradeState.lastVotesSnapshot = analysis.vote_snapshot;
                tradeState.tradeDurationMinutes = analysis.duration;

                await executeTrade(analysis.signal, analysis.duration);
            }

        } catch (e) {
            if (!e.message.includes('destroyed')) console.error("Tick Error:", e.message);
        }
    }

    async function executeTrade(direction, durationMinutes) {
        tradeState.active = true;
        tradeState.id = config.generateTradeId();
        const startBal = await getAccountBalance();

        const tradeFired = await page.evaluate((amount, asset) => window.fireTrade(amount, asset), tradeState.stake, config.ASSET);
        if (!tradeFired) { tradeState.active = false; return; }

        console.log(`⚡ [${tradeState.id}] Stake: $${tradeState.stake} | Waiting ${durationMinutes}m...`);
        await new Promise(r => setTimeout(r, (durationMinutes * 60 * 1000) + 8000)); 

        const endBal = await getAccountBalance();
        const tradeWon = endBal > startBal; 
        
        console.log(`🏁 [${tradeState.id}] Result: ${tradeWon ? "WIN" : "LOSS"}`);
        tradeEngine.updatePerformance(tradeState.lastDirection, tradeWon, tradeState.lastVotesSnapshot);

        const next = config.getOutcome(tradeState.stake, tradeWon, tradeState.level);
        if (next.cooldown) await new Promise(r => setTimeout(r, 60000));

        tradeState.stake = next.stake; tradeState.level = next.level; tradeState.active = false;
        if (next.reset) { tradeState.lastDirection = null; tradeState.lastVotesSnapshot = null; }
    }

    setInterval(tick, 2000);
})();
