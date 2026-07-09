// TOON (Token-Oriented Object Notation) — compact tabular encoding for LLM prompts.
// For uniform arrays of objects it uses ~40-60% fewer tokens than JSON: one header
// line declares the fields, then one comma-separated line per row.
//
//   descriptions[3]{id,text}:
//     0,UPI-SWIGGY BANGALORE
//     1,NACH-HDFC MUTUAL FUND
//     2,POS AMAZON PAY

export function encodeToon(
  name: string,
  rows: Array<Record<string, string | number | null>>,
  fields: string[],
): string {
  const header = `${name}[${rows.length}]{${fields.join(',')}}:`
  const lines = rows.map(
    (row) => '  ' + fields.map((f) => sanitize(row[f])).join(','),
  )
  return [header, ...lines].join('\n')
}

// Values must not contain the delimiters TOON relies on
function sanitize(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  return String(v).replace(/[,\n]/g, ' ').trim()
}
