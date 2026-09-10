'use strict';

/**
 * Keep user-controlled values as literal spreadsheet text. Excel interprets
 * values beginning with these characters as formulas, including after spaces.
 */
function excelSafe(value) {
  const text = String(value ?? '');
  return /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
}

module.exports = { excelSafe };
