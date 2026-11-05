/**
 * 把一段菜谱文字拆成结构化内容（纯规则，没有 AI）
 *
 * 能认的：分组标题、每行的「食材 + 数量 + 单位」、编号步骤、几人份、菜名
 * 认不出的：一律当食材名留着，不猜数字——宁可少算热量，也不编。
 */

const units = require('./units.js')

/* 分组标题词：出现这些词的短行当作一组的开始 */
const SECTION_WORDS = [
  '用料', '食材', '材料', '配料', '主料', '辅料', '调料', '调味料', '佐料',
  '腌料', '腌制', '腌肉', '料汁', '酱汁', '配菜', '蘸料', '浇头', '汤底',
  '面糊', '其他', '表面'
]

/* 步骤区标题词 */
const STEP_WORDS = ['做法', '步骤', '制作', '烹饪', '操作', '流程', '开始做']

/* 单位表按长度倒序，避免「小勺」被「勺」抢先匹配 */
const UNIT_KEYS = Object.keys(units.UNIT_MAP).sort((a, b) => b.length - a.length)
const UNIT_ALT = UNIT_KEYS.map(escapeRe).join('|')

const NUM = '(?:\\d+\\s*\\/\\s*\\d+|\\d+(?:\\.\\d+)?|[一二两三四五六七八九十百]+\\s*分?|半)'
const RE_TAIL = new RegExp('^(.+?)\\s*(' + NUM + ')\\s*(' + UNIT_ALT + ')\\s*$')
const RE_HEAD = new RegExp('^(' + NUM + ')\\s*(' + UNIT_ALT + ')\\s*(.+)$')
const RE_VAGUE = /^(.*?)\s*(适量|少许|若干|一点|随意|按需)\s*$/

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/* ── 汉字数字 → 阿拉伯数字 ── */

const CN_RUN = /[零一二两三四五六七八九十]+/g

/** 一段汉字数字转成数字文本；转不了就原样返回 */
function cnNumText(m, allowLiang) {
  const n = units.parseNum(m)
  if (n !== null) return String(n)
  // 「三两」= 数字 3 + 重量单位「两」，不能当「32」用
  // 但只在确定后面没有量词时才敢这么拆：「一两分钟」不是 1 两分钟
  if (allowLiang !== false && m.length > 1 && m.slice(-1) === '两') {
    const head = units.parseNum(m.slice(0, -1))
    if (head !== null) return head + '两'
  }
  return m
}

/** 整段替换：只用在「本来就是数量」的字段上（用量框），别往句子正文上套 */
function digitText(text) {
  return String(text || '').replace(CN_RUN, (m) => cnNumText(m, true))
}

/* 步骤正文里只转「数字 + 量词/单位」的组合，避免「一起」「一定」「两面金黄」被改坏 */
const STEP_UNITS = [
  '分钟', '小时', '秒钟', '毫升', '厘米', '汤勺', '小勺', '大勺', '公斤', '千克',
  '秒', '勺', '匙', '碗', '杯', '个', '颗', '片', '块', '根', '条',
  '瓣', '粒', '只', '枚', '张', '把', '束', '朵', '节', '斤', '克', '升',
  '袋', '包', '盒', '罐', 'cm', '度'
]
const RE_STEP_NUM = new RegExp('(' + CN_RUN.source + ')\\s*(' + STEP_UNITS.join('|') + ')', 'g')

function digitStep(text) {
  return String(text || '').replace(RE_STEP_NUM, (m, cn, unit) => cnNumText(cn, false) + unit)
}

/** 用量框里的数字文本：汉字数字转阿拉伯；「八分」这种按 0.8 记，「半」保留原字 */
function qtyDigit(raw) {
  const s = digitText(raw)
  const m = s.match(/^(\d+(?:\.\d+)?)分$/)
  if (m) return String(Math.round((parseFloat(m[1]) / 10) * 100) / 100)
  return s
}

function clean(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 65248))
    .replace(/[\u00a0\u3000]/g, ' ')
    // 「…番茄2个 用料：」这种挤在一行里的标题，强行断行
    .replace(/([^\n])\s*(用料|食材|材料|配料|调料|做法|步骤|制作|烹饪)\s*[：:]/g, '$1\n$2：')
}

/** 去掉行首的项目符号和序号 */
function stripMarks(line) {
  return String(line || '')
    .replace(/^[\s\-–—•·※*#>]+/, '')
    .replace(/^\(?\d+[\.、\)．]\s*/, '')
    .replace(/^第[一二三四五六七八九十]+步[：:]\s*/, '')
    .replace(/^[一二三四五六七八九十]{1,3}\s*[、．\)]\s*/, '')
    .trim()
}

/** 去掉括号里的补充说明，避免干扰匹配 */
function dropNotes(s) {
  return String(s || '')
    .replace(/[（(][^）)]*[）)]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function bareHead(line) {
  return dropNotes(line).replace(/[：:]\s*$/, '').trim()
}

function isSectionHead(line) {
  const t = bareHead(line)
  if (!t || t.length > 6) return false
  return SECTION_WORDS.some((w) => t.indexOf(w) >= 0)
}

function isStepHead(line) {
  const t = bareHead(line)
  if (!t || t.length > 6) return false
  return STEP_WORDS.some((w) => t.indexOf(w) >= 0)
}

/** 一段文字像是操作说明，不是用料 */
function looksProse(line) {
  const t = stripMarks(line)
  if (!t || /[：:]/.test(t)) return false
  if (t.length > 24) return true
  return /[。！？]$/.test(t)
}

/**
 * 把「数量 + 单位 + 名字」组装成一条用料
 * 单位尽量落到我们那四个选项上：g / 小勺 / 汤勺 / 适量
 *
 * 规则（2026-11-05 按她的要求定）：
 *   - 克 / 毫升 / 斤 / 两 → 折成克
 *   - 勺类 → 小勺 / 汤勺
 *   - 碗、以及认不出的单位（"一小撮"）→ 数量+单位并进名字，用量空、按适量记
 *     （"半碗淀粉水" 就存成名字「半碗淀粉水」，不往用量里塞"半碗"）
 *   - 什么都没写的 → 适量
 */
function build(name, numText, unitText) {
  const n = String(name || '').trim().replace(/^[的:：]+/, '').trim()
  if (!n) return null

  const u = units.normUnit(unitText)
  const num = units.parseQty(numText)
  const qtyText = qtyDigit(String(numText || '').replace(/\s+/g, ''))

  if (u.type === 'none' || num === null) return { name: n, qty: '', unit: '适量' }
  if (u.type === 'spoonSmall') return { name: n, qty: qtyText, unit: '小勺' }
  if (u.type === 'spoonBig') return { name: n, qty: qtyText, unit: '汤勺' }

  if (u.type === 'mass') {
    const grams = Math.round(num * (u.factor || 1) * 10) / 10
    return { name: n, qty: String(grams), unit: 'g' }
  }

  // 碗 / 认不出的单位：并进名字，用量留空
  if (u.type === 'bowl' || u.type === 'unknown') {
    const head = qtyText + String(u.raw || unitText || '').trim()
    return { name: head + n, qty: '', unit: '适量' }
  }

  // 个 / 片 / 颗…：数量连单位一起写进用量框，计算时程序认得出来
  return { name: n, qty: qtyText + (u.raw || unitText), unit: 'g' }
}

/** 解析单个片段（已按逗号切开） */
function parseSegment(seg) {
  let s = stripMarks(dropNotes(seg))
  if (!s) return null
  s = s.replace(/^[的:：\s]+/, '').trim()
  if (!s) return null

  const vague = s.match(RE_VAGUE)
  if (vague) {
    const n = vague[1].trim()
    return n ? { name: n, qty: '', unit: '适量' } : null
  }

  // 「少许海盐黑胡椒」：模糊词跑到了前面
  const lead = s.match(/^(一点点|一点|适量|少许|若干|随意|按需)\s*(.+)$/)
  if (lead) {
    const n = lead[2].trim()
    return n ? { name: n, qty: '', unit: '适量' } : null
  }

  let m = s.match(RE_TAIL)
  if (m) return build(m[1], m[2], m[3])

  m = s.match(RE_HEAD)
  if (m) return build(m[3], m[1], m[2])

  // 没写克数、没写勺、也没写「适量」→ 就按适量记，别再塞个 g 进去
  return { name: s, qty: '', unit: '适量' }
}

/** 一行里可能塞了好几个食材，按逗号顿号切开 */
function parseLineItems(line) {
  const flat = dropNotes(stripMarks(line))
  if (!flat) return []
  return flat
    .split(/[、，,；;\/]+/)
    .map((seg) => parseSegment(seg))
    .filter(Boolean)
}

/** 操作说明切成几步：先按句号分，再把「，再…」这类顺承句拆开 */
function splitProse(text) {
  const out = []
  const sentences = String(text || '').match(/[^。；;！!？?]+[。；;！!？?]?/g) || []
  sentences.forEach((chunk) => {
    const t = chunk.trim()
    if (!t) return
    const parts = t.split(/[，,]\s*(?=(?:再|然后|接着|最后|之后|随后|另起|出锅前))/)
    parts.forEach((p) => {
      const v = p.trim()
      if (v) out.push(digitStep(v))
    })
  })
  return out
}

/** 「一、腌肉 二、热锅」→「1. 腌肉 2. 热锅」，好让下一步按编号切 */
function normalizeStepMarks(text) {
  return String(text || '').replace(
    /(^|[\s。；;！!？?，,])([一二三四五六七八九十]{1,3})\s*[、．\)]\s*/g,
    (m, pre, cn) => pre + cnNumText(cn) + '. '
  )
}

/** 一段文字切成几步：先按「1. 2. 3.」编号切，没有编号再按句号切 */
function splitStepsLine(text) {
  const t = normalizeStepMarks(String(text || '').trim())
  if (!t) return []
  const numbered = t.split(/\s*(?=\d+\s*[\.、\)．])/)
  const segs = numbered.length > 1 ? numbered : splitProse(t)
  return segs.map(stripMarks).filter(Boolean).map(digitStep)
}

/**
 * 主入口
 * @param {string} text 用户粘贴的一整段
 * @returns {{name:string, servings:number, groups:Array, steps:Array, warnings:Array}}
 */
function parseRecipeText(text) {
  const raw = clean(text)
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)

  const out = { name: '', servings: 0, groups: [], steps: [], warnings: [] }
  if (!lines.length) {
    out.warnings.push('内容是空的')
    return out
  }

  // 份数：2 人份 / 两人份
  const sv = raw.match(/(\d+|[一二两三四五六七八九十]+)\s*人\s*份?/)
  if (sv) {
    const n = units.parseNum(sv[1])
    if (n && n > 0 && n < 20) out.servings = n
  }

  // 菜名：显式写「菜名：」的优先
  const nm = raw.match(/(?:菜名|名称|标题)\s*[：:]\s*(.+)/)
  if (nm) out.name = nm[1].trim().slice(0, 30)

  let cur = null
  let inSteps = false

  function ensureGroup(name) {
    cur = { name: String(name || '').trim(), items: [] }
    out.groups.push(cur)
    return cur
  }

  lines.forEach((line, i) => {
    const stripped = stripMarks(line)

    // 「做法：1.鸡蛋打散 2.热锅炒蛋」——标题和步骤挤在同一行
    const inline = stripped.match(/^(?:做法|步骤|制作|烹饪|操作)\s*[：:]\s*(.*)$/)
    if (!inSteps && inline) {
      inSteps = true
      if (inline[1].trim()) {
        splitStepsLine(inline[1]).forEach((t) => out.steps.push({ text: t }))
      }
      return
    }

    // 步骤区标题
    if (!inSteps && isStepHead(stripped)) {
      inSteps = true
      return
    }

    // 已经在步骤区，整行都是步骤
    if (inSteps) {
      splitStepsLine(stripped).forEach((t) => out.steps.push({ text: t }))
      return
    }

    // 单行分组标题，如「用料」「配料」
    if (isSectionHead(stripped) && !/[：:]/.test(stripped)) {
      ensureGroup(bareHead(stripped))
      return
    }

    // 「配料：青红椒，洋葱」「料汁（一人份）：2勺生抽…」
    const ci = stripped.search(/[：:]/)
    if (ci > 0) {
      const head = stripped.slice(0, ci).trim()
      const rest = stripped.slice(ci + 1).trim()
      const headBare = dropNotes(head)
      if (headBare.length <= 8) {
        ensureGroup(headBare || '')
        if (rest) parseLineItems(rest).forEach((it) => cur.items.push(it))
        return
      }
    }

    // 长句子：当作操作说明
    if (looksProse(stripped)) {
      splitProse(stripped).forEach((t) => out.steps.push({ text: t }))
      return
    }

    // 第一行且不像用料 → 当菜名
    if (!out.name && !cur && i === 0 && !/[：:]/.test(stripped) && stripped.length <= 20) {
      const probe = parseLineItems(stripped)
      const hasQty = probe.some((it) => it.qty)
      if (!hasQty && probe.length <= 1) {
        out.name = stripped.replace(/[\d一二两三四五六七八九十]+\s*人\s*份?/, '').trim().slice(0, 30)
        return
      }
    }

    // 其余当用料
    if (!cur) ensureGroup('')
    const items = parseLineItems(stripped)
    if (!items.length) {
      out.warnings.push('第 ' + (i + 1) + ' 行没看懂：' + stripped.slice(0, 16))
      return
    }
    items.forEach((it) => cur.items.push(it))
  })

  // 收拾一下：空组去掉、组名过长去掉
  out.groups = out.groups.filter((g) => g.items.length > 0)
  if (!out.groups.length) out.warnings.push('没认出用料，这段可能不是菜谱')
  if (!out.steps.length) out.warnings.push('没认出步骤，可以在下面手动加')

  return out
}

/** 解析结果的简短说明，给界面用 */
function describe(res) {
  const items = res.groups.reduce((n, g) => n + g.items.length, 0)
  const parts = []
  if (res.groups.length) parts.push(res.groups.length + ' 组用料 ' + items + ' 条')
  if (res.steps.length) parts.push(res.steps.length + ' 步')
  return parts.join(' · ') || '什么也没认出来'
}

module.exports = {
  parseRecipeText,
  describe,
  splitProse,
  parseLineItems
}
