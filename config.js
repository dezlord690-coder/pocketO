module.exports = {
    // --- STRATEGY SETTINGS ---
    INITIAL_STAKE: 1,      // Starting amount in dollars
    MULTIPLIER: 2.2,       // Martingale multiplier
    MAX_MARTINGALE: 3,     // Max levels (Initial stake + 3 martingale steps)
    
    // --- SIGNAL SETTINGS ---
    // The analysis file uses a score > 12. 
    // We match that here for clarity, though the config file doesn't use this value internally.
    MIN_VOTES: 12,         
    MIN_PAYOUT: 82,        // Minimum payout percentage to accept a trade
    
    ASSET: "CURRENT_ASSET", // We trade whatever is open on screen

    // --- UTILS ---
    generateTradeId: () => {
        return `TRD-${Math.floor(Date.now() / 1000)}-${Math.random().toString(36).substr(2, 3).toUpperCase()}`;
    },

    /**
     * Determines the next stake and level after a trade finishes.
     * @param {number} currentStake - The amount used in the last trade.
     * @param {boolean} isWin - Whether the trade resulted in a win.
     * @param {number} currentLevel - The current Martingale level (0 is initial stake).
     * @returns {object} Next stake, level, and control flags.
     */
    getOutcome: (currentStake, isWin, currentLevel) => {
        if (isWin) {
            // Success: Reset to initial stake and level
            return { stake: module.exports.INITIAL_STAKE, level: 0, reset: true };
        }
        
        // Loss occurred. Check if we can step up Martingale.
        if (currentLevel >= module.exports.MAX_MARTINGALE) {
            // Max level reached and lost. Hard reset and cooldown.
            return { 
                stake: module.exports.INITIAL_STAKE, 
                level: 0, 
                reset: true, 
                cooldown: true // Signal your bot to pause trading briefly
            };
        }
        
        // Martingale Step Up
        const nextStake = currentStake * module.exports.MULTIPLIER;
        return { 
            // Ensures the stake is a clean number for the broker API
            stake: parseFloat(nextStake.toFixed(2)), 
            level: currentLevel + 1, 
            reset: false 
        };
    }
};
