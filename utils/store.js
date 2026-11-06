/**
 * 数据层 —— 所有 storage 与文件读写都在这里
 * 页面只调这里的接口，不直接碰 wx.setStorageSync
 * 将来要搬云端，只改这一个文件
 */

const seed = require('../data/seed.js')

const KEY_RECIPES = 'mf_recipes'
const KEY_MEALS = 'mf_meals'
const KEY_SETTINGS = 'mf_settings'
const KEY_VERSION = 'mf_version'
const KEY_SNAP_ASKED = 'mf_snap_asked'
const KEY_SEED = 'mf_seed'
const KEY_SEED_COVER = 'mf_seed_cover'
// 内置封面补丁版本：每次给内置菜谱新增封面图就 +1
// v1 只有 8 张 → v2 补凉拌土豆丝、馄饨馅 → v3 补鸡蛋酱
const SEED_COVER_V = 3

const VERSION = 1

/* 固定分类，单选 */
const CATEGORIES = [
  '炒菜', '炖菜', '蒸菜', '凉菜', '汤羹',
  '面食', '米饭', '烧烤', '油炸', '烘焙', '饮品', '其他'
]

const DEFAULT_SETTINGS = {
  imageQuality: 'standard', // low | standard | high
  spoons: {},               // 用户实测勺重，覆盖默认表
  fontSize: 24,             // 做饭模式字号
  lastBackupAt: 0
}

/* 图片画质档位 */
const QUALITY = {
  low: { width: 800, quality: 70 },
  standard: { width: 1080, quality: 80 },
  high: { width: 1440, quality: 85 }
}

function uid(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj))
}

/* ───────────── 初始化 ───────────── */

function init() {
  const v = wx.getStorageSync(KEY_VERSION)
  if (!v) {
    wx.setStorageSync(KEY_VERSION, VERSION)
    if (!wx.getStorageSync(KEY_RECIPES)) wx.setStorageSync(KEY_RECIPES, [])
    if (!wx.getStorageSync(KEY_MEALS)) wx.setStorageSync(KEY_MEALS, [])
    if (!wx.getStorageSync(KEY_SETTINGS)) wx.setStorageSync(KEY_SETTINGS, DEFAULT_SETTINGS)
  }
}

/* ───────────── 设置 ───────────── */

function getSettings() {
  const s = wx.getStorageSync(KEY_SETTINGS)
  if (!s || typeof s !== 'object') return clone(DEFAULT_SETTINGS)
  return Object.assign(clone(DEFAULT_SETTINGS), s)
}

function saveSettings(patch) {
  const next = Object.assign(getSettings(), patch || {})
  wx.setStorageSync(KEY_SETTINGS, next)
  return next
}

function getQuality() {
  const s = getSettings()
  return QUALITY[s.imageQuality] || QUALITY.standard
}

/* ───────────── 内置菜谱 ───────────── */

/**
 * 首次安装（或整个沙箱被清空）时，把内置菜谱铺进库
 * - 库里有东西就只打标记，绝不动现有数据
 * - 打过标记之后，以后她把菜删光也不会再长回来
 * @returns {number} 写进去几条；0 表示这次没动
 */
function seedIfEmpty() {
  if (wx.getStorageSync(KEY_SEED)) return 0

  if (getRecipes().length) {
    wx.setStorageSync(KEY_SEED, seed.version)
    return 0
  }

  const src = seed.recipes || []
  if (!src.length) return 0

  const now = Date.now()
  const list = clone(src).map((r, i) => {
    const t = now - (src.length - i) * 60000
    return Object.assign({}, r, {
      cookedCount: r.cookedCount || 0,
      lastCookedAt: r.lastCookedAt || 0,
      createdAt: t,
      updatedAt: t
    })
  })

  wx.setStorageSync(KEY_RECIPES, list)
  wx.setStorageSync(KEY_SEED, seed.version)
  // 不写快照：内置菜谱随时能重建，写进去只会让「本机备份」看起来像有她的数据
  return list.length
}

/**
 * 给「已经存在但封面为空」的内置菜谱补上封面
 * 只跑一次：老版本先导入过菜谱的人（封面是空的）也能看到图；
 * 补过之后你自己把封面删了，不会再被塞回来
 * @returns {number} 补了几条
 */
function fillSeedCovers() {
  // 存版本号而不是布尔：以后内置菜谱再加新图，把 SEED_COVER_V 加一，
  // 启动时就会把「库里还没有封面」的那几条补上，补过的不会重复动
  if (Number(wx.getStorageSync(KEY_SEED_COVER) || 0) >= SEED_COVER_V) return 0

  const map = {}
  ;(seed.recipes || []).forEach((r) => {
    if (r.cover) map[r.id] = r.cover
  })

  const list = getRecipes()
  let n = 0
  list.forEach((r) => {
    if (!r.cover && map[r.id]) {
      r.cover = map[r.id]
      n++
    }
  })

  if (n) wx.setStorageSync(KEY_RECIPES, list)
  wx.setStorageSync(KEY_SEED_COVER, SEED_COVER_V)
  return n
}

/* ───────────── 菜谱 ───────────── */

function getRecipes() {
  const list = wx.getStorageSync(KEY_RECIPES)
  return Array.isArray(list) ? list : []
}

function getRecipe(id) {
  return getRecipes().find((r) => r.id === id) || null
}

function emptyRecipe() {
  return {
    id: '',
    name: '',
    desc: '',
    cover: '',
    category: '炒菜',
    tags: [],
    servings: 1,
    groups: [{ id: uid('g_'), name: '', items: [] }],
    steps: [],
    cookedCount: 0,
    lastCookedAt: 0,
    createdAt: 0,
    updatedAt: 0
  }
}

/**
 * 新建或更新菜谱
 * @returns {string} 菜谱 id
 */
function saveRecipe(recipe) {
  const list = getRecipes()
  const now = Date.now()
  const data = clone(recipe)

  if (!data.id) {
    data.id = uid('r_')
    data.createdAt = now
    data.cookedCount = data.cookedCount || 0
    data.lastCookedAt = data.lastCookedAt || 0
    data.updatedAt = now
    list.unshift(data)
  } else {
    const idx = list.findIndex((r) => r.id === data.id)
    if (idx < 0) {
      data.createdAt = now
      data.updatedAt = now
      list.unshift(data)
    } else {
      data.createdAt = list[idx].createdAt || now
      data.updatedAt = now
      list[idx] = data
    }
  }

  wx.setStorageSync(KEY_RECIPES, list)
  autoSnapshot()
  return data.id
}

function deleteRecipe(id) {
  const list = getRecipes()
  const target = list.find((r) => r.id === id)
  if (!target) return

  // 删它名下的图片
  removeFile(target.cover)
  ;(target.steps || []).forEach((s) => {
    if (s && s.image) removeFile(s.image)
  })

  wx.setStorageSync(KEY_RECIPES, list.filter((r) => r.id !== id))

  // 一桌里引用的快照保留，只标记菜谱已删
  const meals = getMeals()
  let changed = false
  meals.forEach((m) => {
    m.items.forEach((it) => {
      if (it.recipeId === id) {
        it.recipeDeleted = true
        changed = true
      }
    })
  })
  if (changed) wx.setStorageSync(KEY_MEALS, meals)
  autoSnapshot()
}

/** 熟练度 +1 */
function touchCooked(id) {
  const list = getRecipes()
  const idx = list.findIndex((r) => r.id === id)
  if (idx < 0) return null
  list[idx].cookedCount = (list[idx].cookedCount || 0) + 1
  list[idx].lastCookedAt = Date.now()
  wx.setStorageSync(KEY_RECIPES, list)
  autoSnapshot()
  return list[idx]
}

/* ───────────── 一桌 ───────────── */

function getMeals() {
  const list = wx.getStorageSync(KEY_MEALS)
  return Array.isArray(list) ? list : []
}

function getMeal(id) {
  return getMeals().find((m) => m.id === id) || null
}

function emptyMeal() {
  return {
    id: '',
    name: '',
    people: 2,
    note: '',
    items: [], // [{ recipeId, name, perServing, servings, kcal, recipeDeleted }]
    createdAt: 0,
    updatedAt: 0
  }
}

function saveMeal(meal) {
  const list = getMeals()
  const now = Date.now()
  const data = clone(meal)

  if (!data.id) {
    data.id = uid('m_')
    data.createdAt = now
    data.updatedAt = now
    list.unshift(data)
  } else {
    const idx = list.findIndex((m) => m.id === data.id)
    if (idx < 0) {
      data.createdAt = now
      data.updatedAt = now
      list.unshift(data)
    } else {
      data.createdAt = list[idx].createdAt || now
      data.updatedAt = now
      list[idx] = data
    }
  }

  wx.setStorageSync(KEY_MEALS, list)
  autoSnapshot()
  return data.id
}

function deleteMeal(id) {
  const list = getMeals()
  wx.setStorageSync(KEY_MEALS, list.filter((m) => m.id !== id))
  autoSnapshot()
}

/* ───────────── 文件 ───────────── */

function fs() {
  return wx.getFileSystemManager()
}

function isUserFile(path) {
  return !!path && String(path).indexOf('usr') >= 0
}

function removeFile(path) {
  if (!isUserFile(path)) return
  try {
    fs().unlinkSync(path)
  } catch (e) {
    // 文件已不存在，忽略
  }
}

/** 列出用户目录下所有图片文件 */
function listImageFiles() {
  try {
    const dir = wx.env.USER_DATA_PATH
    const names = fs().readdirSync(dir)
    return names
      .filter((n) => /\.(jpg|jpeg|png|webp)$/i.test(n))
      .map((n) => ({
        name: n,
        path: dir + '/' + n
      }))
  } catch (e) {
    return []
  }
}

function fileSize(path) {
  try {
    const s = fs().statSync(path)
    return (s.stats && s.stats.size) || 0
  } catch (e) {
    return 0
  }
}

/** 存储用量统计 */
function getStorageInfo() {
  let storageKB = 0
  try {
    const info = wx.getStorageInfoSync()
    storageKB = info.currentSize || 0
  } catch (e) {}

  const files = listImageFiles()
  let imageBytes = 0
  files.forEach((f) => {
    imageBytes += fileSize(f.path)
  })

  const recipes = getRecipes()
  const meals = getMeals()

  return {
    storageKB,
    imageCount: files.length,
    imageBytes,
    imageMB: Math.round((imageBytes / 1024 / 1024) * 10) / 10,
    recipeCount: recipes.length,
    mealCount: meals.length,
    limitMB: 200
  }
}

/** 清理没有被任何菜谱引用的图片 */
function cleanOrphanImages() {
  const used = {}
  getRecipes().forEach((r) => {
    if (r.cover) used[r.cover] = true
    ;(r.steps || []).forEach((s) => {
      if (s && s.image) used[s.image] = true
    })
  })

  const orphans = listImageFiles().filter((f) => !used[f.path])
  let freed = 0
  orphans.forEach((f) => {
    freed += fileSize(f.path)
    removeFile(f.path)
  })

  return {
    count: orphans.length,
    bytes: freed,
    mb: Math.round((freed / 1024 / 1024) * 10) / 10
  }
}

/* ───────────── 备份 ───────────── */

function exportBackup() {
  const data = {
    app: 'mifang',
    version: VERSION,
    exportedAt: Date.now(),
    recipes: getRecipes(),
    meals: getMeals(),
    settings: getSettings()
  }
  return JSON.stringify(data)
}

const BACKUP_FILE = 'mifang-backup.json'

/**
 * 写入备份文件
 * @param {boolean} markManual 只有你手动导出才更新「上次备份」时间，
 *   自动快照每次都写，不能让它把这一栏变成「刚刚」——那会让人以为备份过了
 */
function writeBackupFile(markManual) {
  const path = wx.env.USER_DATA_PATH + '/' + BACKUP_FILE
  try {
    fs().writeFileSync(path, exportBackup(), 'utf8')
    if (markManual !== false) saveSettings({ lastBackupAt: Date.now() })
    return path
  } catch (e) {
    return ''
  }
}

/**
 * 自动快照：每次改动后写一份本机备份
 * 数据全空时不写，避免把上一次的好快照冲掉
 * 注意：它和 storage 在同一个沙箱里，「全部清除」会一起清掉，
 * 真正的保险还是「导出备份」发到聊天。
 */
function autoSnapshot() {
  if (!getRecipes().length && !getMeals().length) return ''
  return writeBackupFile(false)
}

/** 读本机快照，没有或损坏返回 null */
function peekSnapshot() {
  const path = wx.env.USER_DATA_PATH + '/' + BACKUP_FILE
  try {
    const text = fs().readFileSync(path, 'utf8')
    const data = JSON.parse(text)
    if (!data || data.app !== 'mifang' || !Array.isArray(data.recipes)) return null
    return {
      exportedAt: data.exportedAt || 0,
      recipes: data.recipes.length,
      meals: (data.meals || []).length,
      raw: text
    }
  } catch (e) {
    return null
  }
}

/** 这个快照是不是已经问过要不要恢复了 */
function snapshotAsked(exportedAt) {
  return wx.getStorageSync(KEY_SNAP_ASKED) === exportedAt
}

function markSnapshotAsked(exportedAt) {
  wx.setStorageSync(KEY_SNAP_ASKED, exportedAt)
}

/**
 * 从 JSON 字符串导入，覆盖现有数据
 * @returns {{ok:boolean, recipes:number, meals:number, message:string}}
 */
function importBackup(text) {
  let data
  try {
    data = JSON.parse(text)
  } catch (e) {
    return { ok: false, recipes: 0, meals: 0, message: '文件不是合法的 JSON' }
  }

  if (!data || data.app !== 'mifang' || !Array.isArray(data.recipes)) {
    return { ok: false, recipes: 0, meals: 0, message: '这不是蜜方的备份文件' }
  }

  // 不要无脑删图：在同一个沙箱里导入自己的备份时，recipes 里的 cover
  // 指向的就是这些文件，先删等于把封面全弄成死链。
  // 改成导入完成后按「谁还被引用」清一次孤儿图。
  wx.setStorageSync(KEY_RECIPES, data.recipes)
  wx.setStorageSync(KEY_MEALS, Array.isArray(data.meals) ? data.meals : [])
  // 导入过的数据说了算：以后库空了也别再往里塞内置菜谱
  wx.setStorageSync(KEY_SEED, seed.version)
  if (data.settings) {
    wx.setStorageSync(KEY_SETTINGS, Object.assign(getSettings(), data.settings))
  }
  cleanOrphanImages()

  // 导进来的这份数据可能压根没封面（旧备份、手工整理的 json）。
  // 内置菜谱的封面在代码里，不是数据，所以重跑一遍补齐：只填空的，已有的一律不动。
  wx.removeStorageSync(KEY_SEED_COVER)
  fillSeedCovers()

  return {
    ok: true,
    recipes: data.recipes.length,
    meals: (data.meals || []).length,
    message: '导入完成'
  }
}

/** 清空全部数据（含图片）—— 内置菜谱的标记故意不删，清空了就该是空的 */
function clearAll() {
  listImageFiles().forEach((f) => removeFile(f.path))
  wx.setStorageSync(KEY_RECIPES, [])
  wx.setStorageSync(KEY_MEALS, [])
  wx.setStorageSync(KEY_SETTINGS, clone(DEFAULT_SETTINGS))
  try {
    fs().unlinkSync(wx.env.USER_DATA_PATH + '/' + BACKUP_FILE)
  } catch (e) {}
  wx.removeStorageSync(KEY_SNAP_ASKED)
}

module.exports = {
  CATEGORIES,
  QUALITY,
  uid,
  init,
  getSettings,
  saveSettings,
  getQuality,
  getRecipes,
  getRecipe,
  seedIfEmpty,
  fillSeedCovers,
  emptyRecipe,
  saveRecipe,
  deleteRecipe,
  touchCooked,
  getMeals,
  getMeal,
  emptyMeal,
  saveMeal,
  deleteMeal,
  listImageFiles,
  getStorageInfo,
  cleanOrphanImages,
  exportBackup,
  writeBackupFile,
  autoSnapshot,
  peekSnapshot,
  snapshotAsked,
  markSnapshotAsked,
  importBackup,
  clearAll,
  removeFile,
  isUserFile
}
