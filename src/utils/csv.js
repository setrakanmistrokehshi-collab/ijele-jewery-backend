// Spreadsheet programs run text that starts with = + - @ as a formula, so a customer who types one as their name
// could run it on the admin's computer. A leading apostrophe makes such cells plain text. Plain numbers are exempt.
const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

export function csvCell(value) {
  let text = value == null ? '' : String(value);
  if (FORMULA_START.test(text) && !PLAIN_NUMBER.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** columns: [{ header, value: (row) => cell }]. The BOM makes Excel read the file as UTF-8. */
export function toCsv(columns, rows) {
  const lines = [columns.map((column) => csvCell(column.header)), ...rows.map((row) => columns.map((column) => csvCell(column.value(row))))];
  return `﻿${lines.map((line) => line.join(',')).join('\r\n')}\r\n`;
}
