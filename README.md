# PocketO Trading Engine

PocketO is an adaptive, multi-analyst trading bot core. It uses a **Board of Advisors** architecture where 17 different technical analysts vote on trade signals (CALL/PUT). The engine features a **Neural Weighted Voting** system that learns and adjusts the influence of each analyst based on their historical performance.

## Key Features
*   **17 Technical Analysts**: Includes RSI, MACD, Bollinger Bands, Fibonacci, and more.
*   **Adaptive Learning**: Automatically adjusts analyst weights after every trade via a feedback loop.
*   **Persistence Layer**: Saves "learned" weights to a local `analyst_memory.json` file.
*   **Weighted Duration**: Dynamically calculates trade duration based on the conviction of the strongest voters.

## Getting Started
1. **Clone the repo**: `git clone https://github.com/dezlord690-coder/pocketO.git`
2. **Install dependencies**: `npm install`
3. **Run the engine**: Import the module into your main execution script and pass OHLCV market data to `getConsensus()`.

## Usage
The engine requires a `marketData` object containing arrays for `open`, `high`, `low`, `close`, and `volume`.

```javascript
const Engine = require('./engine.js');
const consensus = await Engine.getConsensus(myMarketData);
console.log(consensus.signal); // "CALL", "PUT", or "WAIT"
