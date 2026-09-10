'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { excelSafe } = require('../lib/excel-safe');

test('neutralizes every Excel formula prefix', () => {
  for (const value of ['=1+1', '+SUM(A1:A2)', '-2+3', '@cmd', '  =HYPERLINK("x")']) {
    assert.equal(excelSafe(value), `'${value}`);
  }
});

test('preserves ordinary and empty values', () => {
  assert.equal(excelSafe('مرحبا'), 'مرحبا');
  assert.equal(excelSafe('123'), '123');
  assert.equal(excelSafe(null), '');
});
