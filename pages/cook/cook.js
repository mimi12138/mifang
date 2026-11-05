const store = require('../../utils/store.js')
const nutrition = require('../../utils/nutrition.js')

Page({
  data: {
    statusBar: 20,
    navPad: 44,
    recipe: null,
    steps: [],
    index: 0,
    fontSize: 24,
    showMaterials: false,
    materials: [],
    done: false,
    cookedCount: 0
  },

  onLoad(query) {
    this.recipeId = query.id
    const app = getApp()
    const settings = store.getSettings()
    const statusBar = (app.globalData && app.globalData.statusBarHeight) || 20

    // 顶栏要躲开右上角的系统胶囊：按它的实际位置算需要让出多少
    let navPad = 44
    if (wx.getMenuButtonBoundingClientRect) {
      const m = wx.getMenuButtonBoundingClientRect()
      if (m && m.bottom && m.height) {
        navPad = Math.max(12, m.bottom - statusBar + 8)
      }
    }

    this.setData({
      statusBar,
      navPad,
      fontSize: settings.fontSize || 24
    })
    this.load()

    wx.setKeepScreenOn({ keepScreenOn: true })
  },

  onUnload() {
    wx.setKeepScreenOn({ keepScreenOn: false })
  },

  load() {
    const r = store.getRecipe(this.recipeId)
    if (!r) {
      wx.showToast({ title: '菜谱不见了', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 700)
      return
    }

    const settings = store.getSettings()
    const calc = nutrition.calcRecipe(r, { spoons: settings.spoons || {} })

    const steps = (r.steps || []).filter((s) => String(s.text || '').trim())

    this.setData({
      recipe: r,
      steps,
      materials: calc.groups,
      cookedCount: r.cookedCount || 0
    })
  },

  onTouchStart(e) {
    const t = e.touches[0]
    this.touch = { x: t.clientX, y: t.clientY }
  },

  onTouchEnd(e) {
    if (!this.touch) return
    const t = e.changedTouches[0]
    const dx = t.clientX - this.touch.x
    const dy = t.clientY - this.touch.y
    this.touch = null

    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy)) return
    if (dx < 0) this.next(true)
    else this.prev()
  },

  /* bySwipe 只有滑动传 true；按钮点击传进来的是事件对象，别当成 true */
  next(bySwipe) {
    if (this.data.done) return
    const swipe = bySwipe === true
    const last = this.data.steps.length - 1
    if (this.data.index >= last) {
      // 最后一屏再往左滑就停住：手滑一下不该直接把菜做成「收工」
      if (swipe) return
      this.setData({ done: true })
      return
    }
    this.setData({ index: this.data.index + 1 })
  },

  prev() {
    if (this.data.index <= 0) return
    this.setData({ index: this.data.index - 1 })
  },

  /* 收工页也能退回最后一步，免得误触后只能重进 */
  backToStep() {
    const last = Math.max(0, this.data.steps.length - 1)
    this.setData({ done: false, index: last })
  },

  toggleFont() {
    const next = this.data.fontSize === 24 ? 28 : 24
    this.setData({ fontSize: next })
    store.saveSettings({ fontSize: next })
  },

  openMaterials() {
    this.setData({ showMaterials: true })
  },

  closeMaterials() {
    this.setData({ showMaterials: false })
  },

  markCooked() {
    store.touchCooked(this.recipeId)
    wx.showToast({ title: '熟练度 +1', icon: 'none' })
    setTimeout(() => this.exit(), 500)
  },

  exit() {
    const pages = getCurrentPages()
    if (pages.length > 1) wx.navigateBack()
    else wx.reLaunch({ url: '/pages/list/list' })
  }
})
