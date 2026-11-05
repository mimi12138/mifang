/**
 * 热量计算
 * 公式：单项热量 = 每 100g 热量 × 克重 ÷ 100
 * 算不出来就说算不出来，不编数字
 */

const ingredients = require('../data/ingredients.js')
const spoonData = require('../data/spoons.js')
const units = require('./units.js')

const REASON_TEXT = {
  unknown: '库里没有这个食材',
  novalue: '没填用量',
  zero: '用量为 0',
  season: '按适量处理',
  nopiece: '这个食材没有单个重量',
  nospoon: '这个调料还没记勺重',
  unit: '单位认不出来'
}

function isSeasoning(name, ing) {
  const key = ing ? ing.name : name
  return spoonData.seasoning.indexOf(key) >= 0
}

/* 模糊用量：写这些词的意思是「没称过」，不该再拼上单位 */
const VAGUE_QTY = ['适量', '少许', '少量', '一些', '一点', '若干', '随意', '按需', '适当']

function isVagueQty(text) {
  const s = String(text || '').trim()
  if (!s) return false
  for (let i = 0; i < VAGUE_QTY.length; i++) {
    if (s.indexOf(VAGUE_QTY[i]) >= 0) return true
  }
  return false
}

/**
 * 用料在界面上显示的文本
 * 规则：
 *   - 用量写「适量」「少许」这类 → 只显示这几个字，不拼单位
 *   - 用量空着（说明这行只是记个名字）→ 显示 —，也不拿单位凑数
 *   - 用量里已经带了单位（「2勺」「半碗」）→ 原样显示
 *   - 其余才拼成「200g」「2勺」
 */
function qtyText(item) {
  if (!item) return '—'
  const q = String(item.qty || '').trim()
  const u = String(item.unit || '').trim()

  if (!q) return isVagueQty(u) ? u : '—'
  if (isVagueQty(q)) return q

  const sp = units.splitQtyUnit(q)
  if (sp && sp.unit) return q

  if (!u) return q
  if (isVagueQty(u)) return q
  return q + u
}

/**
 * 把一整句用料按逗号切开
 * 「1勺生抽，少许海盐黑胡椒，1勺淀粉（肉片不需要淀粉）」
 * → ['1勺生抽', '少许海盐黑胡椒', '1勺淀粉']
 */
const SPLIT_RE = /[，,、;；\n\r]+/
const UNIT_ALT = '小勺|大勺|汤匙|茶匙|毫升|千克|勺|碗|杯|个|片|颗|瓣|粒|只|根|把|块|张|条|袋|盒|听|撮|克|ml|ML|kg|KG|g|G|l|L'
const NUM_ALT = '[0-9]+(?:\\.[0-9]+)?|[一二三四五六七八九十百半两]+(?:分)?'

function splitSegments(text) {
  // 括号里通常是补充说明（「肉片不需要淀粉」），先剥掉再切
  const clean = String(text || '').replace(/[（(][^）)]*[）)]/g, ' ')
  return clean.split(SPLIT_RE).map((s) => s.trim()).filter(Boolean)
}

/**
 * 拆一段：「2勺生抽」→ { qty:'2', unit:'勺', name:'生抽' }
 * 拆不出来就把整段当名字
 */
function parseSegment(seg) {
  const s = String(seg || '').trim()
  if (!s) return null

  const m = s.match(new RegExp('^(' + NUM_ALT + ')\\s*(' + UNIT_ALT + ')?\\s*(.*)$'))
  if (m && m[3] && m[3].trim()) {
    return { name: m[3].trim(), qty: m[1], unit: m[2] || '' }
  }

  const v = s.match(/^(适量|少许|少量|一些|一点|若干|随意|按需|适当)\s*(.*)$/)
  if (v && v[2] && v[2].trim()) {
    return { name: v[2].trim(), qty: v[1], unit: '' }
  }

  return { name: s, qty: '', unit: '' }
}

/**
 * 一条里挤了好几样东西时，拆开逐段算，只累加算得出来的
 * 一段都算不出来 → 返回 null，保持原来的「库里有没这食材」
 */
function calcCompound(item, opts) {
  const segs = splitSegments(item.name)
  if (!segs.length) return null

  // 只有一段时，仅当名字里自带数量（「2勺生抽」）才管，纯名字交给原逻辑
  if (segs.length === 1) {
    const only = parseSegment(segs[0])
    if (!only || !only.qty) return null
  }

  const parts = []
  let kcal = 0
  let gram = 0
  let measuredCount = 0
  let seasoningCount = 0

  segs.forEach((seg) => {
    const parsed = parseSegment(seg)
    if (!parsed) return
    const sub = Object.assign({}, opts, { __noCompound: true })
    const r = calcItem({ name: parsed.name, qty: parsed.qty, unit: parsed.unit }, sub)
    if (r.measured) {
      kcal += r.kcal
      gram += r.gram
      measuredCount++
      if (r.seasoning) seasoningCount++
    }
    parts.push({
      text: seg,
      name: parsed.name,
      qtyText: qtyText(parsed),
      kcal: r.measured ? r.kcal : null,
      reasonText: r.measured ? '' : r.reasonText
    })
  })

  if (!measuredCount) return null

  return {
    measured: true,
    compound: segs.length > 1,
    parts,
    gram: Math.round(gram * 10) / 10,
    kcal: Math.round(kcal),
    kcalPer100: 0,
    ing: null,
    reason: 'compound',
    reasonText: segs.length > 1 ? (parts.length + ' 段中算出 ' + measuredCount + ' 段') : '',
    summary: segs.length > 1 ? parts.length + ' 项' : '',
    seasoning: measuredCount > 0 && seasoningCount === measuredCount
  }
}

/**
 * 计算一条用料
 * @param {object} item { name, qty, unit, kcalPer100?, piece? }
 * @param {object} opts { spoons: 用户自定义勺重表 }
 * @returns {{measured:boolean, gram:number, kcal:number, kcalPer100:number, ing:object|null, reason:string, reasonText:string, seasoning:boolean}}
 */
function calcItem(item, opts) {
  opts = opts || {}
  const fail = (reason, extra) => Object.assign(
    { measured: false, gram: 0, kcal: 0, kcalPer100: 0, ing: null, reason, reasonText: REASON_TEXT[reason] || '' },
    extra || {}
  )

  if (!item || !String(item.name || '').trim()) return fail('unknown')

  // 一整句写成一条（「1勺生抽，少许盐，1勺淀粉」）时，先按逗号拆开逐段算
  // 必须放在食材匹配之前：包含匹配会让整句先命中「生抽」，抢在拆分前面
  if (!opts.__noCompound && !item.kcalPer100) {
    const compound = calcCompound(item, opts)
    if (compound) return compound
  }

  // 每 100g 热量：优先用这条用料自己存的（用户手填过）
  let kcalPer100 = Number(item.kcalPer100) || 0
  let ing = null
  if (!kcalPer100) {
    ing = ingredients.find(item.name)
    if (ing) kcalPer100 = ing.kcal
  } else if (item.ingId) {
    ing = ingredients.list.find((x) => x.id === item.ingId) || null
  }

  const seasoning = isSeasoning(item.name, ing)

  if (!kcalPer100) {
    // 盐这类热量为 0 的调料，kcalPer100 会是 0，但要算「已计量」
    if (ing && ing.kcal === 0) {
      kcalPer100 = 0
    } else {
      return fail('unknown', { seasoning })
    }
  }

  let qty = units.parseQty(item.qty)
  let unitRaw = String(item.unit || '').trim()

  // 用量框里混写了单位（「半碗」「2勺」「半颗」）
  // 以用量框里的为准：单位框常被顺手填了 g，两者冲突时听用量框的
  if (item.qty) {
    const sp = units.splitQtyUnit(item.qty)
    if (sp.unit) {
      unitRaw = sp.unit
      qty = units.parseQty(sp.qty)
    }
  }

  if (qty === null) {
    // 单位选了「适量」，用量空着也算不计量，不算「漏填」
    if (isVagueQty(item.qty) || isVagueQty(item.unit)) {
      return fail('season', { seasoning })
    }
    return fail('novalue', { seasoning })
  }
  if (!qty || qty <= 0) return fail('zero', { seasoning })

  const u = units.normUnit(unitRaw)
  let gram = 0

  if (u.type === 'mass') {
    gram = qty * (u.factor || 1)
  } else if (u.type === 'none') {
    return fail('season', { seasoning })
  } else if (u.type === 'count') {
    const piece = (ing && ing.piece) || Number(item.piece) || 0
    if (!piece) return fail('nopiece', { seasoning })
    gram = qty * piece
  } else if (u.type === 'spoonSmall' || u.type === 'spoonBig') {
    const name = ing ? ing.name : String(item.name).trim()
    const custom = opts.spoons || {}
    const row = custom[name] || spoonData.spoons[name]
    if (!row) return fail('nospoon', { seasoning })
    const weight = u.type === 'spoonSmall' ? row.small : row.big
    if (!weight) return fail('nospoon', { seasoning })
    gram = qty * weight
  } else if (u.type === 'bowl') {
    gram = qty * units.BOWL_GRAM * (u.factor || 1)
  } else {
    return fail('unit', { seasoning })
  }

  gram = Math.round(gram * 10) / 10
  const kcal = Math.round((gram * kcalPer100) / 100)

  return {
    measured: true,
    gram,
    kcal,
    kcalPer100,
    ing,
    reason: '',
    reasonText: '',
    seasoning
  }
}

/**
 * 计算整份菜谱
 * @param {object} recipe { servings, groups: [{ name, items: [] }] }
 * @param {object} opts { spoons }
 */
function calcRecipe(recipe, opts) {
  opts = opts || {}
  const servings = Number(recipe && recipe.servings) || 1

  let total = 0
  let totalMain = 0
  let measuredCount = 0
  const unmeasured = []

  const groups = ((recipe && recipe.groups) || []).map((g) => {
    let groupKcal = 0
    const items = (g.items || []).map((it) => {
      const r = calcItem(it, opts)
      const item = Object.assign({}, it)
      item.calc = r
      item.unitText = qtyText(it)
      if (r.measured) {
        groupKcal += r.kcal
        total += r.kcal
        if (!r.seasoning) totalMain += r.kcal
        measuredCount++
      } else if (r.reason !== 'season') {
        unmeasured.push(it.name)
      }
      return item
    })
    return Object.assign({}, g, { items, kcal: groupKcal })
  })

  return {
    groups,
    total,
    totalMain,
    perServing: Math.round(total / servings),
    perServingMain: Math.round(totalMain / servings),
    measuredCount,
    unmeasured,
    unmeasuredText: unmeasured.length ? unmeasured.length + ' 项未计量' : ''
  }
}

/**
 * 热量档位：用于卡片数字上色
 */
function kcalLevel(kcal) {
  if (!kcal) return 'none'
  if (kcal < 200) return 'low'
  if (kcal <= 400) return 'mid'
  return 'high'
}

module.exports = {
  calcItem,
  calcRecipe,
  qtyText,
  isVagueQty,
  kcalLevel,
  isSeasoning,
  REASON_TEXT
}
