const aud = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
});

function validNumber(value) {
  return (
    value !== null &&
    value !== undefined &&
    value !== '' &&
    Number.isFinite(Number(value))
  );
}

// Convert integer cents to an AUD display value.
export function money(cents) {
  return validNumber(cents)
    ? aud.format(Number(cents) / 100)
    : '—';
}

export function number(value, digits = 0) {
  if (!validNumber(value)) return '—';

  return new Intl.NumberFormat('en-AU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value));
}

export function label(value) {
  return String(value ?? '')
    .replaceAll('_', ' ')
    .replace(/^./, (character) => character.toUpperCase());
}

export function numericColumn(
  key,
  caption,
  format = number
) {
  return {
    key,
    label: caption,
    numeric: true,
    render: (row) => format(row[key]),
  };
}

