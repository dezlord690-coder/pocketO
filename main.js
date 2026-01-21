const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const tradeEngine = require('./tradingEngine.js'); // The self-learning AI engine
const config = require('./config.js');       // The Martingale/Settings config

puppeteer.use(StealthPlugin());

let tradeState = {
    active: false,
    id: null,
    stake: config.INITIAL_STAKE,
    level: 0,
    lastDirection: null,
    lastVotesSnapshot: null,
    tradeDurationMinutes: 1 // Default duration
};

(async () => {
    console.log("🚀 Launching Deep-Scan Engine & AI Bridge...");
    const browser = await puppeteer.launch({ 
        headless: false, 
        defaultViewport: null,
        args: ['--no-sandbox', '--disable-web-security', '--start-maximized'] 
    });
    
    const [page] = await browser.pages();
    
    // --- DEEP SCANNER: Finds the balance anywhere in the header ---
    const getAccountBalance = async () => {
        return await page.evaluate(() => {
            const possibleSelectors = [
                '.balance', '.user-balance', '[data-balance]', 
                '.balance-value', '.current-balance'
            ];
            
            for (let selector of possibleSelectors) {
                const el = document.querySelector(selector);
                if (el && el.innerText.includes('.')) {
                    const val = parseFloat(el.innerText.replace(/[^0-9.]/g, ''));
                    if (val > 0) return val;
                }
            }
            // Fallback scanner from your code
            const spans = Array.from(document.querySelectorAll('span, div'));
            for (let s of spans) {
                if (s.innerText.length < 20 && s.innerText.includes(',')) {
                    const val = parseFloat(s.innerText.replace(/[^0-9.]/g, ''));
                    if (val > 100) return val; 
                }
            }
            return 0;
        });
    };

    // --- WEBSOCKET INJECTION (The reliable part of your code) ---
    await page.evaluateOnNewDocument(() => {
        const OriginalWS = window.WebSocket;
        window.activeSocket = null;
        window.tradeTemplate = null;

        // Shim to capture candle data from broker's WS (needs implementation)
        window.marketCandles = { open: [], close: [], high: [], low: [], volume: [] };

        window.WebSocket = function(url, protocols) {
            const ws = new OriginalWS(url, protocols);
            if (url.includes('po.market')) {
                window.activeSocket = ws;
                const originalSend = ws.send;
                ws.send = function(data) {
                    // Capture the template needed to fire subsequent trades
                    if (typeof data === 'string' && data.includes('openOrder')) {
                        window.tradeTemplate = data; 
                    }
                    return originalSend.apply(this, arguments);
                };
            }
            return ws;
        };

        // Function available in the browser context to place trades
        window.fireTrade = function(amount, asset) {
            if (!window.activeSocket || !window.tradeTemplate) return false;
            let payload = JSON.parse(window.tradeTemplate.substring(2));
            payload[1].amount = parseFloat(amount);
            payload[1].requestId = Date.now();
            payload[1].asset = asset;
            // Note: This uses the asset currently set by the UI. 
            // To force a specific asset, you need to navigate to that asset's URL first.
            window.activeSocket.send(`42${JSON.stringify(payload)}`);
            return true;
        };
    });

    await page.goto('https://pocketoption.com/en/cabinet/demo-quick-high-low/', { waitUntil: 'networkidle2' });
    
    // ACTION REQUIRED: The bridge needs one manual trade to capture the template payload
    console.log("\x1b[33m👉 ACTION REQUIRED: Manually execute one trade (CALL or PUT) on the screen to prime the bridge.\x1b[0m");

    async function tick() {
        // 1. ABSOLUTE LOCK: Do nothing if trade is running
        if (tradeState.active) return;
        
        const isBridgeReady = await page.evaluate(() => !!window.tradeTemplate);
        if (!isBridgeReady) return; // Wait for the user action

        try {
            // 2. Get Data from the browser's memory (YOU MUST POPULATE window.marketCandles)
            const marketData = await page.evaluate(() => {
                if (window.marketCandles && window.marketCandles.close.length >= 250) {
                    return window.marketCandles;
                }
                return null;
            });

            if (!marketData) {
                console.log("Waiting for sufficient market data (>= 250 candles) or candle interception failure.");
                return;
            }

            // 3. Check Martingale Sequence (Forced trade)
            if (tradeState.level > 0 && tradeState.lastDirection) {
                console.log(`⚠️ RECOVERY MODE: Level ${tradeState.level}. Forcing ${tradeState.lastDirection}...`);
                await executeTrade(tradeState.lastDirection, tradeState.tradeDurationMinutes);
                return;
            }

            // 4. Analyze Market using the AI Engine
            const analysis = await tradeEngine.getConsensus(marketData);

            // 5. Decide (uses the 'signal' output: "CALL", "PUT", or "WAIT")
            if (analysis.signal !== "WAIT") {
                
                // 6. CHECK PAYOUT (UI Scraping)
                const payout = await page.evaluate(() => {
                    const el = document.querySelector('.btn-call .profit-percent'); 
                    return el ? parseInt(el.innerText) : 0;
                });

                if (payout < config.MIN_PAYOUT) {
                    console.log(`📉 Signal ignored. Payout ${payout}% < ${config.MIN_PAYOUT}%`);
                    return;
                }

                console.log(`\n🧠 CONSENSUS: ${analysis.signal} for ${analysis.duration} mins (Score: ${analysis.score})`);
                
                // Store required data for the trade execution and the ML feedback loop
                tradeState.lastDirection = analysis.signal;
                tradeState.lastVotesSnapshot = analysis.vote_snapshot;
                tradeState.tradeDurationMinutes = analysis.duration;

                await executeTrade(analysis.signal, analysis.duration);
            }

        } catch (e) {
            console.error("Tick Error:", e);
        }
    }

    async function executeTrade(direction, durationMinutes) {
        tradeState.active = true;
        tradeState.id = config.generateTradeId();
        
        console.log(`⚡ [${tradeState.id}] EXECUTING ${direction} | $${tradeState.stake} | L${tradeState.level} | ${durationMinutes}m`);

        // Capture balance immediately before firing the trade via WS bridge
        const startBal = await getAccountBalance();

        const tradeFired = await page.evaluate((amount, asset) => {
            // Assumes ASSET is already set in the browser UI context
            return window.fireTrade(amount, asset); 
        }, tradeState.stake, config.ASSET);

        if (!tradeFired) {
            console.error("Failed to fire trade via WS bridge.");
            tradeState.active = false;
            return;
        }

        console.log(`⏳ [${tradeState.id}] Trade placed. Start Balance: $${startBal}. Waiting for result...`);

        // WAIT for Trade Duration + buffer (convert minutes to milliseconds)
        const waitTimeMs = (durationMinutes * 60 * 1000) + 7000; // 7s buffer for platform delay
        await new Promise(r => setTimeout(r, waitTimeMs)); 

        // CHECK RESULT via financial balance comparison
        const endBal = await getAccountBalance();
        // Check if balance increased by roughly the expected profit amount
        const tradeWon = endBal > startBal; 
        
        // PROCESS OUTCOME (Martingale Logic)
        const nextState = config.getOutcome(tradeState.stake, tradeWon, tradeState.level);
        
        console.log(`🏁 [${tradeState.id}] Result: ${tradeWon ? "\x1b[32mWIN\x1b[0m" : "\x1b[31mLOSS\x1b[0m"}. End Balance: $${endBal}`);

        // === MACHINE LEARNING FEEDBACK LOOP ===
        tradeEngine.updatePerformance(
            tradeState.lastDirection,
            tradeWon,
            tradeState.lastVotesSnapshot
        );
        // ======================================

        if (nextState.cooldown) {
            console.log("🛑 MAX LOSS REACHED. Cooldown 60s.");
            await new Promise(r => setTimeout(r, 60000));
        }

        // Update State for the next tick
        tradeState.stake = nextState.stake;
        tradeState.level = nextState.level;
        tradeState.active = false;
        if (nextState.reset) {
            tradeState.lastDirection = null;
            tradeState.lastVotesSnapshot = null;
        }
        console.log(`💰 Next Stake: $${tradeState.stake} | Next Level: ${tradeState.level}`);
    }

    // Run the tick function every 5 seconds when idle
    setInterval(tick, 5000);
})();
