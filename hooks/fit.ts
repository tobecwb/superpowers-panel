const ELLIPSIS = '…'

type Names = { full: string; short: string; width: number }

// The date prefix and the extension say the least about a plan, so they go before any of the slug does.
export const fitName = ({ full, short, width }: Names): string => {
  if (full.length <= width) return full
  if (short.length <= width) return short
  if (width <= 0) return ''
  return `${short.slice(0, width - 1)}${ELLIPSIS}`
}
