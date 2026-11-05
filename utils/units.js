/**
 * 单位与数量解析
 * 用户在录入时写什么就是什么，这里负责把「八分勺」「半碗」这类文本翻译成数字
 */

const CN_NUM = {
  零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4,
  五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10
}

/* 常见单位 → 内部类型 */
const UNIT_MAP = {
  /* 重量 */
  g: { type: 'mass', factor: 1 },
  克: { type: 'mass', factor: 1 },
  公克: { type: 'mass', factor: 1 },
  kg: { type: 'mass', factor: 1000 },
  千克: { type: 'mass', factor: 1000 },
  公斤: { type: 'mass', factor: 1000 },
  斤: { type: 'mass', factor: 500 },
  两: { type: 'mass', factor: 50 },

  /* 体积（按 1ml≈1g 近似，油和酒有 5–8% 误差，忽略） */
  ml: { type: 'mass', factor: 1 },
  毫升: { type: 'mass', factor: 1 },
  L: { type: 'mass', factor: 1000 },
  升: { type: 'mass', factor: 1000 },

  /* 勺子 */
  小勺: { type: 'spoonSmall' },
  茶勺: { type: 'spoonSmall' },
  小匙: { type: 'spoonSmall' },
  汤勺: { type: 'spoonBig' },
  大勺: { type: 'spoonBig' },
  大匙: { type: 'spoonBig' },
  勺: { type: 'spoonBig' },
  调羹: { type: 'spoonBig' },

  /* 碗 */
  碗: { type: 'bowl' },
  小碗: { type: 'bowl', factor: 0.6 },
  大碗: { type: 'bowl', factor: 1.5 },

  /* 计数 */
  个: { type: 'count' },
  只: { type: 'count' },
  颗: { type: 'count' },
  枚: { type: 'count' },
  根: { type: 'count' },
  条: { type: 'count' },
  片: { type: 'count' },
  块: { type: 'count' },
  瓣: { type: 'count' },
  头: { type: 'count' },
  粒: { type: 'count' },
  节: { type: 'count' },
  把: { type: 'count' },
  束: { type: 'count' },
  朵: { type: 'count' },
  张: { type: 'count' },
  杯: { type: 'count' },

  /* 不计量 */
  适量: { type: 'none' },
  少许: { type: 'none' },
  若干: { type: 'none' },
  一点: { type: 'none' },
  随意: { type: 'none' },
  按需: { type: 'none' },
  一点点点: { type: 'none' }
}

/* 一标准碗按 150g 计 */
const BOWL_GRAM = 150

/**
 * 解析中文/阿拉伯数字
 * @returns {number|null}
 */
function parseNum(str) {
  if (str === null || str === undefined) return null
  const s = String(str).trim().replace(/[０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 65248)
  )
  if (!s) return null
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s)

  // 十一 到 十九、二十、二十五
  if (/^十[一二三四五六七八九]?$/.test(s)) {
    const tail = s.slice(1)
    return 10 + (tail ? CN_NUM[tail] : 0)
  }
  if (/^[一二三四五六七八九]十[一二三四五六七八九]?$/.test(s)) {
    const head = CN_NUM[s[0]]
    const tail = s.slice(2)
    return head * 10 + (tail ? CN_NUM[tail] : 0)
  }
  // 一百 / 两百 / 一百二十 / 二百零五
  const h = s.match(/^([一二两三四五六七八九])?百([零一二三四五六七八九十]*)$/)
  if (h) {
    const base = h[1] ? CN_NUM[h[1]] : 1
    const rest = h[2].replace(/^零/, '')
    if (!rest) return base * 100
    const tail = parseNum(rest)
    return tail === null ? null : base * 100 + tail
  }
  if (CN_NUM[s] !== undefined) return CN_NUM[s]
  return null
}

/**
 * 解析数量文本
 * 支持：1 / 1.5 / 半 / 两个 / 八分 / 1/2 / 适量
 * @returns {number|null} null 表示不计入计算
 */
function parseQty(raw) {
  if (raw === null || raw === undefined) return null
  let s = String(raw).trim()
  if (!s) return null

  // 「八分」= 0.8，用于「八分勺」
  let m = s.match(/^([一二三四五六七八九十\d.]+)\s*分$/)
  if (m) {
    const base = parseNum(m[1])
    return base === null ? null : base / 10
  }

  // 1/2
  m = s.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/)
  if (m) {
    const d = parseFloat(m[2])
    return d ? parseFloat(m[1]) / d : null
  }

  // 半 / 半个 / 半勺
  if (/^半/.test(s)) return 0.5

  // 数字夹在文本里：两个、3个
  m = s.match(/(\d+(?:\.\d+)?)/)
  if (m) return parseFloat(m[1])

  m = s.match(/^([一二两三四五六七八九十百]+)/)
  if (m) return parseNum(m[1])

  return null
}

/**
 * 数量框里混写单位时拆分，如「半碗」「2勺」
 * @returns {{qty:string, unit:string}}
 */
function splitQtyUnit(text) {
  const s = String(text || '').trim()
  if (!s) return { qty: '', unit: '' }

  const units = Object.keys(UNIT_MAP).sort((a, b) => b.length - a.length)
  for (let i = 0; i < units.length; i++) {
    const u = units[i]
    if (s.length > u.length && s.slice(-u.length) === u) {
      return { qty: s.slice(0, -u.length).trim(), unit: u }
    }
  }
  return { qty: s, unit: '' }
}

/**
 * 单位归一化
 * @returns {{type:string, factor:number, raw:string}}
 */
function normUnit(unit) {
  const u = String(unit || '').trim()
  if (!u) return { type: 'mass', factor: 1, raw: '' }
  if (UNIT_MAP[u]) return Object.assign({ raw: u }, UNIT_MAP[u])

  // 带方括号或空格的脏数据
  const clean = u.replace(/[\s（）()]/g, '')
  if (UNIT_MAP[clean]) return Object.assign({ raw: u }, UNIT_MAP[clean])

  return { type: 'unknown', factor: 1, raw: u }
}

/* 录入时给用户的常用单位建议 */
const UNIT_SUGGESTIONS = [
  'g', 'ml', '个', '勺', '小勺', '汤勺', '碗', '片', '根', '瓣', '适量'
]

module.exports = {
  parseNum,
  parseQty,
  splitQtyUnit,
  normUnit,
  UNIT_MAP,
  UNIT_SUGGESTIONS,
  BOWL_GRAM
}
