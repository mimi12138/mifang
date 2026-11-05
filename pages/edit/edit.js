const store = require('../../utils/store.js')
const nutrition = require('../../utils/nutrition.js')
const units = require('../../utils/units.js')
const imageUtil = require('../../utils/image.js')
const parser = require('../../utils/parse.js')

Page({
  data: {
    isNew: true,
    recipe: null,
    categories: store.CATEGORIES,
    tagInput: '',
    saving: false,
    unitHints: units.UNIT_SUGGESTIONS,
    unitOptions: ['g', '小勺', '汤勺', '适量'],
    imp: { show: false, text: '' }
  },

  onLoad(query) {
    // 记键盘高度：聚焦底部步骤时要算"键盘上沿在哪"
    this.kbHeight = 0
    if (wx.onKeyboardHeightChange) {
      this.kbHandler = (res) => { this.kbHeight = res.height || 0 }
      wx.onKeyboardHeightChange(this.kbHandler)
    }

    if (query.id) {
      const r = store.getRecipe(query.id)
      if (r) {
        this.recipeId = r.id
        this.setData({ isNew: false, recipe: this.decorate(r) })
        wx.setNavigationBarTitle({ title: '改菜谱' })
        return
      }
    }
    this.setData({ isNew: true, recipe: this.decorate(store.emptyRecipe()) })
    wx.setNavigationBarTitle({ title: '记一道菜' })
  },

  onUnload() {
    clearTimeout(this.stepTimer)
    clearTimeout(this.stepTimer2)
    if (this.kbHandler && wx.offKeyboardHeightChange) wx.offKeyboardHeightChange(this.kbHandler)
  },

  /* 给每条用料补上实时热量预览 */
  decorate(r) {
    const settings = store.getSettings()
    const opts = { spoons: settings.spoons || {} }
    const data = JSON.parse(JSON.stringify(r))

    if (!data.groups || !data.groups.length) {
      data.groups = [{ id: store.uid('g_'), name: '', items: [] }]
    }
    if (!data.steps) data.steps = []
    if (!data.tags) data.tags = []
    if (!data.servings) data.servings = 1
    if (!data.category) data.category = '炒菜'

    const unitOptions = this.data.unitOptions
    data.groups.forEach((g) => {
      if (!g.items) g.items = []
      g.items = g.items.map((it) => {
        // 老数据把「适量」写在用量框里：统一挪到单位下拉，避免两个框都占着
        if (/^(适量|少许|少量|一些|一点|若干|随意|按需|适当)$/.test(String(it.qty || '').trim())) {
          it.qty = ''
          it.unit = '适量'
        }
        if (!String(it.unit || '').trim()) it.unit = 'g'
        it.unitIndex = Math.max(0, unitOptions.indexOf(String(it.unit || 'g').trim()))
        const c = nutrition.calcItem(it, opts)
        it.previewKcal = c.measured ? c.kcal : null
        // 自己选的「适量」不用再提示一遍
        it.calcNote = it.unit === '适量' ? '' : (c.measured ? (c.compound ? c.reasonText : '') : c.reasonText)
        return it
      })
    })
    return data
  },

  /* ── 封面 ── */
  async pickCover() {
    const conf = store.getQuality()
    const res = await imageUtil.pickAndSave(conf)
    if (!res) return
    const old = this.data.recipe.cover
    this.setData({ 'recipe.cover': res.path })
    if (old && old !== res.path) store.removeFile(old)
  },

  async removeCover() {
    const cur = this.data.recipe.cover
    const r = await new Promise((resolve) => {
      wx.showModal({
        title: '换一张？',
        content: '当前封面会被删掉',
        confirmText: '换',
        success: (res) => resolve(res.confirm)
      })
    })
    if (!r) return
    this.setData({ 'recipe.cover': '' })
    if (cur) store.removeFile(cur)
    this.pickCover()
  },

  /* ── 基本信息 ── */
  onName(e) {
    this.data.recipe.name = e.detail.value
  },

  onDesc(e) {
    this.data.recipe.desc = e.detail.value
  },

  pickCat(e) {
    this.setData({ 'recipe.category': e.currentTarget.dataset.c })
  },

  incServ() {
    const n = Math.min(20, (this.data.recipe.servings || 1) + 1)
    this.setData({ 'recipe.servings': n })
  },

  decServ() {
    const n = Math.max(1, (this.data.recipe.servings || 1) - 1)
    this.setData({ 'recipe.servings': n })
  },

  /* ── 标签 ── */
  onTagInput(e) {
    this.tagInput = e.detail.value
  },

  addTag() {
    const v = String(this.tagInput || '').trim()
    this.tagInput = ''
    this.setData({ tagInput: '' })
    if (!v) return
    const tags = this.data.recipe.tags || []
    if (tags.indexOf(v) >= 0 || tags.length >= 8) return
    this.setData({ 'recipe.tags': tags.concat([v]) })
  },

  delTag(e) {
    const t = e.currentTarget.dataset.t
    this.setData({
      'recipe.tags': this.data.recipe.tags.filter((x) => x !== t)
    })
  },

  /* ── 用料 ── */
  addItem(e) {
    const gi = Number(e.currentTarget.dataset.gi)
    const groups = this.data.recipe.groups
    const items = groups[gi].items
    items.push({
      id: store.uid('it_'),
      name: '',
      qty: '',
      unit: 'g',
      unitIndex: 0,
      previewKcal: null,
      calcNote: ''
    })
    // 只更新这一组，别整份 recipe 重渲染（会让所有原生 textarea 重新挂载）
    this.setData({ ['recipe.groups[' + gi + '].items']: items })
  },

  delItem(e) {
    const gi = Number(e.currentTarget.dataset.gi)
    const ii = Number(e.currentTarget.dataset.ii)
    this.data.recipe.groups[gi].items.splice(ii, 1)
    this.setData({ recipe: this.data.recipe })
  },

  onItemName(e) {
    const gi = Number(e.currentTarget.dataset.gi)
    const ii = Number(e.currentTarget.dataset.ii)
    const it = this.data.recipe.groups[gi].items[ii]
    it.name = e.detail.value
    // 名称变了，之前的食材匹配作废，重新算
    it.ingId = ''
    it.kcalPer100 = 0
    this.calcOne(gi, ii)
  },

  onItemQty(e) {
    const gi = Number(e.currentTarget.dataset.gi)
    const ii = Number(e.currentTarget.dataset.ii)
    this.data.recipe.groups[gi].items[ii].qty = e.detail.value
    this.calcOne(gi, ii)
  },

  /* 单位下拉：选「适量」时清掉用量，第一个输入框会跟着收起来 */
  onItemUnit(e) {
    const gi = Number(e.currentTarget.dataset.gi)
    const ii = Number(e.currentTarget.dataset.ii)
    const idx = Number(e.detail.value) || 0
    const unit = this.data.unitOptions[idx] || 'g'
    const it = this.data.recipe.groups[gi].items[ii]
    it.unit = unit
    it.unitIndex = idx
    if (unit === '适量') it.qty = ''

    const path = 'recipe.groups[' + gi + '].items[' + ii + ']'
    this.setData({
      [path + '.unit']: unit,
      [path + '.unitIndex']: idx,
      [path + '.qty']: it.qty
    })
    this.calcOne(gi, ii)
  },

  calcOne(gi, ii) {
    const it = this.data.recipe.groups[gi].items[ii]
    const settings = store.getSettings()
    const c = nutrition.calcItem(it, { spoons: settings.spoons || {} })
    const path = 'recipe.groups[' + gi + '].items[' + ii + ']'
    this.setData({
      [path + '.previewKcal']: c.measured ? c.kcal : null,
      [path + '.calcNote']: it.unit === '适量' ? '' : (c.measured ? (c.compound ? c.reasonText : '') : c.reasonText)
    })
  },

  onGroupName(e) {
    const gi = Number(e.currentTarget.dataset.gi)
    this.data.recipe.groups[gi].name = e.detail.value
  },

  addGroup() {
    this.data.recipe.groups.push({
      id: store.uid('g_'),
      name: '',
      items: []
    })
    this.setData({ recipe: this.data.recipe })
  },

  /* 上移 / 下移一组：只换位置，组内用料跟着整体走 */
  moveGroup(e) {
    const gi = Number(e.currentTarget.dataset.gi)
    const dir = Number(e.currentTarget.dataset.dir)
    const groups = this.data.recipe.groups
    const to = gi + dir
    if (to < 0 || to >= groups.length) return

    const next = groups.slice()
    const moved = next.splice(gi, 1)[0]
    next.splice(to, 0, moved)
    this.setData({ 'recipe.groups': next })
  },

  delGroup(e) {
    const gi = Number(e.currentTarget.dataset.gi)
    this.data.recipe.groups.splice(gi, 1)
    this.setData({ recipe: this.data.recipe })
  },

  /* ── 步骤 ── */
  onStep(e) {
    const si = Number(e.currentTarget.dataset.si)
    this.data.recipe.steps[si].text = e.detail.value
  },

  /* 聚焦底部步骤：系统自己滚的位置不可靠（安卓会滚到页面顶部），
     等键盘落定后自己再校正一次——只在校不到时滚，避免每次点都跳 */
  onStepFocus(e) {
    const si = Number(e.currentTarget.dataset.si)
    this.focusStep = si
    // 两次：键盘动画结束时补一次，防止第一次量到的是过渡中的位置
    clearTimeout(this.stepTimer)
    this.stepTimer = setTimeout(() => this.locateFocus('step-' + si, si), 280)
    clearTimeout(this.stepTimer2)
    this.stepTimer2 = setTimeout(() => this.locateFocus('step-' + si, si), 640)
  },

  onStepBlur() {
    this.focusStep = -1
    clearTimeout(this.stepTimer)
    clearTimeout(this.stepTimer2)
  },

  locateFocus(sel, si) {
    if (si !== undefined && this.focusStep !== si) return
    const q = wx.createSelectorQuery()
    q.select('#' + sel).boundingClientRect()
    q.selectViewport().scrollOffset()
    q.exec((res) => {
      if (!res || !res[0] || !res[1]) return
      const rect = res[0]
      const scrollTop = res[1].scrollTop || 0
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      const winH = info.windowHeight
      const kb = this.kbHeight || Math.round(winH * 0.42)
      const topLimit = 80
      // 再让出 100px：底部「存好」按钮固定在屏幕下方，键盘弹起后会顶在键盘上沿
      const bottomLimit = winH - kb - 100

      let delta = 0
      if (rect.top < topLimit) delta = rect.top - topLimit
      else if (rect.bottom > bottomLimit) delta = rect.bottom - bottomLimit
      if (!delta || Math.abs(delta) < 4) return

      wx.pageScrollTo({ scrollTop: Math.max(0, scrollTop + delta), duration: 150 })
    })
  },

  addStep() {
    this.data.recipe.steps.push({ id: store.uid('s_'), text: '' })
    this.setData({ recipe: this.data.recipe })
  },

  delStep(e) {
    const si = Number(e.currentTarget.dataset.si)
    this.data.recipe.steps.splice(si, 1)
    this.setData({ recipe: this.data.recipe })
  },

  /* ── 从文字导入 ── */
  noop() {},

  openImport() {
    this.setData({ imp: { show: true, text: '' } })
  },

  closeImport() {
    this.setData({ 'imp.show': false })
  },

  onImpText(e) {
    this.setData({ 'imp.text': e.detail.value })
  },

  runImport() {
    const text = String(this.data.imp.text || '').trim()
    if (!text) {
      wx.showToast({ title: '先贴点内容', icon: 'none' })
      return
    }

    const res = parser.parseRecipeText(text)
    const itemCount = res.groups.reduce((n, g) => n + g.items.length, 0)

    if (!itemCount && !res.steps.length) {
      wx.showModal({
        title: '没认出来',
        content: '这段文字里找不到用料和步骤。可以手动加，或者检查一下是不是没粘全。',
        showCancel: false
      })
      return
    }

    const r = this.data.recipe
    const hasContent =
      (r.groups || []).some((g) => (g.items || []).length) || (r.steps || []).length
    if (hasContent) {
      wx.showModal({
        title: '换掉现在的内容？',
        content: '已经填的用料和步骤会被这次识别结果替换。',
        confirmText: '替换',
        success: (x) => {
          if (x.confirm) this.applyImport(res)
        }
      })
      return
    }

    this.applyImport(res)
  },

  applyImport(res) {
    const r = this.data.recipe

    if (res.name && !String(r.name || '').trim()) r.name = res.name
    if (res.servings) r.servings = res.servings

    if (res.groups.length) {
      r.groups = res.groups.map((g) => ({
        id: store.uid('g_'),
        name: g.name || '',
        items: g.items.map((it) => ({
          id: store.uid('it_'),
          name: it.name,
          qty: it.qty || '',
          unit: it.unit || 'g'
        }))
      }))
    }

    if (res.steps.length) {
      r.steps = res.steps.map((s) => ({ id: store.uid('s_'), text: s.text }))
    }

    this.setData({ recipe: this.decorate(r), 'imp.show': false })
    wx.showToast({ title: '识别到 ' + parser.describe(res), icon: 'none' })
  },

  /* ── 保存 ── */
  save() {
    if (this.data.saving) return
    const r = this.data.recipe

    const name = String(r.name || '').trim()
    if (!name) {
      wx.showToast({ title: '先起个菜名', icon: 'none' })
      return
    }

    this.setData({ saving: true })

    const settings = store.getSettings()
    const opts = { spoons: settings.spoons || {} }

    const groups = (r.groups || [])
      .map((g) => {
        const items = (g.items || [])
          .filter((it) => String(it.name || '').trim())
          .map((it) => {
            const c = nutrition.calcItem(it, opts)
            return {
              id: it.id,
              name: String(it.name).trim(),
              qty: String(it.qty || '').trim(),
              unit: String(it.unit || '').trim(),
              kcalPer100: c.kcalPer100 || Number(it.kcalPer100) || 0,
              ingId: c.ing ? c.ing.id : '',
              gram: c.measured ? c.gram : 0,
              kcal: c.measured ? c.kcal : 0
            }
          })
        return {
          id: g.id,
          name: String(g.name || '').trim(),
          items
        }
      })
      .filter((g) => g.items.length)

    const steps = (r.steps || [])
      .filter((s) => String(s.text || '').trim())
      .map((s) => ({ id: s.id, text: String(s.text).trim() }))

    const payload = {
      id: r.id || '',
      name,
      desc: String(r.desc || '').trim(),
      cover: r.cover || '',
      category: r.category || '其他',
      tags: r.tags || [],
      servings: Number(r.servings) || 1,
      groups: groups.length ? groups : [{ id: store.uid('g_'), name: '', items: [] }],
      steps,
      cookedCount: r.cookedCount || 0,
      lastCookedAt: r.lastCookedAt || 0,
      createdAt: r.createdAt || 0,
      updatedAt: r.updatedAt || 0
    }

    const id = store.saveRecipe(payload)
    store.writeBackupFile()

    wx.showToast({ title: '记下了', icon: 'none' })
    setTimeout(() => {
      const pages = getCurrentPages()
      if (this.data.isNew) {
        // 新建：回到上一页，若上一页是列表就直接刷新
        wx.navigateBack({
          fail: () => wx.reLaunch({ url: '/pages/list/list' })
        })
      } else {
        wx.navigateBack({
          fail: () => wx.redirectTo({ url: '/pages/detail/detail?id=' + id })
        })
      }
    }, 420)
  },

  /* ── 删除 ── */
  async deleteRecipe() {
    const ok = await new Promise((resolve) => {
      wx.showModal({
        title: '删掉这道菜？',
        content: '用料和步骤都会一起没，图片也会删。搭过的桌保留热量快照。',
        confirmText: '删掉',
        confirmColor: '#B3452F',
        success: (res) => resolve(res.confirm)
      })
    })
    if (!ok) return

    store.deleteRecipe(this.recipeId)
    store.writeBackupFile()
    wx.showToast({ title: '删了', icon: 'none' })
    setTimeout(() => {
      const pages = getCurrentPages()
      wx.navigateBack({ delta: Math.min(2, pages.length - 1) })
    }, 380)
  }
})
