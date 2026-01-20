module.exports = {
    // --- STRATEGY SETTINGS ---
    INITIAL_STAKE: 1,      // Starting amount in dollars
    MULTIPLIER: 2.2,       // Martingale multiplier
    MAX_MARTINGALE: 3,     // Max levels (Initial + 3)
    
    // --- SIGNAL SETTINGS ---
    MIN_VOTES: 8,          // 15 Analysts total. Need +8 or -8 to trade.
    MIN_PAYOUT: 82,        // Minimum payout percentage to accept a trade
    
    ASSET: "CURRENT_ASSET", // We trade whatever is open on screen

    // --- UTILS ---
    generateTradeId: () => {
        return `TRD-${Math.floor(Date.now() / 1000)}-${Math.random().toString(36).substr(2, 3).toUpperCase()}`;
    },

    getOutcome: (current, isWin, level) => {
        if (isWin) {
            return { stake: 1, level: 0, reset: true };
        }
        if (level >= 3) {
            // Max level reached and lost. Hard reset.
            return { stake: 1, level: 0, reset: true, cooldown: true };
        }
        // Martingale Step Up
        return { 
            stake: (current * 2.2).toFixed(2), 
            level: level + 1, 
            reset: false 
        };
    }
};
