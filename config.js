module.exports = {
    ASSET: "EURUSD_otc",
    INITIAL_STAKE: 1,
    MULTIPLIER: 2.2,
    MAX_MARTINGALE: 3,
    MIN_VOTES: 7, // Trade only if 7/10 agree
    
    calculateNextStake: (current, isWin, level) => {
        if (isWin) return { stake: 1, level: 0 };
        if (level >= 3) return { stake: 1, level: 0, reset: true }; // Hard Reset
        return { 
            stake: (current * 2.2).toFixed(2), 
            level: level + 1 
        };
    }
};
