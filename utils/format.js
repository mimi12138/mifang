/** 时间格式化 */

function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

/** 2026-11-05 */
function dateStr(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

/** 11-05 */
function shortDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

/** 今天 / 昨天 / 3 天前 / 2026-09-01 */
function fromNow(ts) {
  if (!ts) return ''
  const now = Date.now()
  const diff = now - ts
  const day = 86400000

  if (diff < day && new Date(ts).getDate() === new Date(now).getDate()) return '今天'
  if (diff < day * 2) return '昨天'
  if (diff < day * 30) return Math.floor(diff / day) + ' 天前'
  if (diff < day * 365) return Math.floor(diff / (day * 30)) + ' 个月前'
  return dateStr(ts)
}

module.exports = {
  dateStr,
  shortDate,
  fromNow
}
