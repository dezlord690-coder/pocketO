const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const getConsensus = require('./analysts');
const config = require('./config');

puppeteer.use(StealthPlugin());

let tradeState = {
    active: false,
    id: null,
    stake: config.INITIAL_STAKE,
    level: 0,
    lastDirection: null
};

(async () => {
    const browser = await puppeteer.launch({ 
        headless: false, 
        defaultViewport: null,
        args: ['--start-maximized'] 
    });
    
    const [page] = await browser.pages();
    
    // IMPORTANT: Login manually if needed, or rely on existing session
    await page.goto('https://pocketoption.com/en/cabinet/demo-quick-high-low/', { waitUntil: 'networkidle2' });

    console.log("🚀 PocketO Engine Online. Waiting for WebSocket data...");

    // INJECT WS INTERCEPTOR
    await page.evaluateOnNewDocument(() => {
        // Simple shim to capture candles from UI updates or WS
        // Note: Real implementations often hook WebSocket.prototype.send or onmessage
        window.marketCandles = { open: [], close: [], high: [], low: [] };
        // Placeholder: You must have your WS interception script here
        // pushing data into window.marketCandles
    });

    async function tick() {
        // 1. ABSOLUTE LOCK: Do nothing if trade is running
        if (tradeState.active) return;

        try {
            // 2. Get Data
            const marketData = await page.evaluate(() => {
                if (window.marketCandles && window.marketCandles.close.length > 50) {
                    return window.marketCandles;
                }
                return null;
            });

            if (!marketData) return;

            // 3. Check Martingale Sequence
            if (tradeState.level > 0) {
                console.log(`⚠️ RECOVERY MODE: Level ${tradeState.level}. Forcing ${tradeState.lastDirection}...`);
                await executeTrade(tradeState.lastDirection);
                return;
            }

            // 4. Analyze
            const analysis = await getConsensus(marketData);

            // 5. Decide
            const isBuy = analysis.total_score >= config.MIN_VOTES;
            const isSell = analysis.total_score <= -config.MIN_VOTES;

            if ((isBuy || isSell) && analysis.risk_level !== "HIGH (Martingale Dangerous)") {
                
                // 6. CHECK PAYOUT BEFORE COMMITTING
                const payout = await page.evaluate(() => {
                    // Try to find payout text on the call button or nearby
                    // Selector: Adjust '.btn-call span' to where the % is located
                    const el = document.querySelector('.btn-call .profit-percent') || document.querySelector('.btn-call'); 
                    return el ? parseInt(el.innerText) : 0;
                });

                if (payout < config.MIN_PAYOUT) {
                    console.log(`📉 Signal ignored. Payout ${payout}% < ${config.MIN_PAYOUT}%`);
                    return;
                }

                const dir = isBuy ? "CALL" : "PUT";
                console.log(`\n🧠 CONSENSUS: ${dir} (Score: ${analysis.total_score})`);
                tradeState.lastDirection = dir;
                await executeTrade(dir);
            }

        } catch (e) {
            console.error("Tick Error:", e);
        }
    }

    async function executeTrade(direction) {
        tradeState.active = true;
        tradeState.id = config.generateTradeId();
        
        console.log(`⚡ [${tradeState.id}] EXECUTING ${direction} | $${tradeState.stake} | L${tradeState.level}`);

        try {
            await page.evaluate(async (dir, amount) => {
                // 1. SET AMOUNT
                // We use click + type because strictly setting value often fails in React apps
                const input = document.querySelector('input[name="amount"]'); // Verify Selector
                if (input) {
                    input.click();
                    input.value = ''; // clear
                    document.execCommand('insertText', false, amount);
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                }

                // 2. CLICK BUTTON
                const btnClass = dir === 'CALL' ? '.btn-call' : '.btn-put';
                const btn = document.querySelector(btnClass);
                if (btn) btn.click();
                
            }, direction, tradeState.stake);

            console.log(`⏳ [${tradeState.id}] Trade placed. Waiting for result...`);

            // WAIT for Trade Duration (e.g. 5m candles = 5m wait)
            // Adding a small buffer
            await new Promise(r => setTimeout(r, 302000)); 

            // CHECK RESULT
            const win = await checkWin();
            
            // PROCESS OUTCOME
            const next = config.getOutcome(tradeState.stake, win, tradeState.level);
            
            console.log(`🏁 [${tradeState.id}] Result: ${win ? "WIN" : "LOSS"}`);

            if (next.cooldown) {
                console.log("🛑 MAX LOSS REACHED. Cooldown 60s.");
                await new Promise(r => setTimeout(r, 60000));
            }

            // Update State
            tradeState.stake = next.stake;
            tradeState.level = next.level;
            tradeState.active = false;
            tradeState.id = null;
            if (next.reset) tradeState.lastDirection = null;

        } catch (e) {
            console.error(`[${tradeState.id}] Execution Failed:`, e);
            tradeState.active = false; // Release lock so we can try again
        }
    }

    async function checkWin() {
        // Implement scraping logic for "Closed Trades" list
        // Returning random for safety in this snippet
        return await page.evaluate(() => {
            // Logic: Look at last closed trade in the list sidebar
            // const lastProfit = document.querySelector('.closed-trades .profit').innerText;
            // return !lastProfit.includes('$0');
            return Math.random() > 0.5; 
        });
    }

    setInterval(tick, 5000);
})();
