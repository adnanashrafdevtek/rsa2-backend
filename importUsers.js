const fs = require('fs');
const path = require('path');

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseImportRows(fileBuffer, fileName) {
  const content = Buffer.isBuffer(fileBuffer) ? fileBuffer.toString('utf8') : String(fileBuffer || '');
  const ext = path.extname(fileName || '').toLowerCase();

  if (ext === '.csv') {
    const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (!lines.length) return [];

    const headers = lines[0].split(',').map(normalizeHeader);
    return lines.slice(1).map((line) => {
      const values = line.split(',').map((value) => value.trim());
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      return row;
    });
  }

  if (ext === '.xlsx' || ext === '.xls') {
    throw new Error('Excel import is not supported in this backend build');
  }

  return [];
}

module.exports = {
  parseImportRows,
  normalizeHeader
};
