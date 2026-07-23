(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RouletteDomain = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  const POCKETS = WHEEL_ORDER.length; // 37, European single-zero
  const SLICE_ANGLE = 360 / POCKETS;
  const THEORETICAL_HOUSE_EDGE = 100 / POCKETS; // 2.70%

  function colorOf(n) {
    if (n === 0) return 'green';
    return RED_NUMBERS.has(n) ? 'red' : 'black';
  }

  const BET_TYPES = {
    straight: { label: 'Straight up', odds: 35, trueProbability: 1 / 37, check: (value, num) => num === value },
    red: { label: 'Red', odds: 1, trueProbability: 18 / 37, check: (_, num) => colorOf(num) === 'red' },
    black: { label: 'Black', odds: 1, trueProbability: 18 / 37, check: (_, num) => colorOf(num) === 'black' },
    odd: { label: 'Odd', odds: 1, trueProbability: 18 / 37, check: (_, num) => num !== 0 && num % 2 === 1 },
    even: { label: 'Even', odds: 1, trueProbability: 18 / 37, check: (_, num) => num !== 0 && num % 2 === 0 },
    low: { label: '1 - 18', odds: 1, trueProbability: 18 / 37, check: (_, num) => num >= 1 && num <= 18 },
    high: { label: '19 - 36', odds: 1, trueProbability: 18 / 37, check: (_, num) => num >= 19 && num <= 36 },
    dozen1: { label: '1st dozen (1-12)', odds: 2, trueProbability: 12 / 37, check: (_, num) => num >= 1 && num <= 12 },
    dozen2: { label: '2nd dozen (13-24)', odds: 2, trueProbability: 12 / 37, check: (_, num) => num >= 13 && num <= 24 },
    dozen3: { label: '3rd dozen (25-36)', odds: 2, trueProbability: 12 / 37, check: (_, num) => num >= 25 && num <= 36 },
    col1: { label: 'Column 1', odds: 2, trueProbability: 12 / 37, check: (_, num) => num !== 0 && num % 3 === 1 },
    col2: { label: 'Column 2', odds: 2, trueProbability: 12 / 37, check: (_, num) => num !== 0 && num % 3 === 2 },
    col3: { label: 'Column 3', odds: 2, trueProbability: 12 / 37, check: (_, num) => num !== 0 && num % 3 === 0 },
  };

  const CHIP_VALUES = [1, 5, 10, 25, 100, 500];
  const CHIP_COLORS = { 1: '#8a8a8a', 5: '#b3242c', 10: '#1f6fb2', 25: '#1a7a3c', 100: '#1a1a1a', 500: '#6a3ea1' };

  return { WHEEL_ORDER, RED_NUMBERS, POCKETS, SLICE_ANGLE, THEORETICAL_HOUSE_EDGE, colorOf, BET_TYPES, CHIP_VALUES, CHIP_COLORS };
});
