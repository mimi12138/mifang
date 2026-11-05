const store = require('../../utils/store.js')
const nutrition = require('../../utils/nutrition.js')
const format = require('../../utils/format.js')

Page({
  data: {
    statusBar: 20,
    recipe: null,
    calc: null,
    groupCount: 1,
    ignoreSeasoning: false,
    shownKcal: 0,
    lastCookedText: '',
    cookedCount: 0
  },

  onLoad(query) {
    this.recipeId = query.id
    const app = getApp()
    this.setData({ statusBar: (app.globalData && app.globalData.statusBarHeight) || 20 })
  },

  onShow() {
    this.load()
  },

  load() {
    const r = store.getRecipe(this.recipeId)
    if (!r) {
      wx.showToast({ title: '菜谱不见了', icon: 'none' })
      setTimeout(() => this.goBack(), 700)
      return
    }

    const settings = store.getSettings()
    const calc = nutrition.calcRecipe(r, { spoons: settings.spoons || {} })

    const view = Object.assign({ tags: [], steps: [], groups: [], servings: 1 }, r)

    this.setData({
      recipe: view,
      calc,
      groupCount: (r.groups || []).length,
      shownKcal: this.data.ignoreSeasoning ? calc.perServingMain : calc.perServing,
      lastCookedText: format.fromNow(r.lastCookedAt),
      cookedCount: r.cookedCount || 0
    })
  },

  toggleSeasoning() {
    const next = !this.data.ignoreSeasoning
    this.setData({
      ignoreSeasoning: next,
      shownKcal: next ? this.data.calc.perServingMain : this.data.calc.perServing
    })
  },

  cookedOne() {
    store.touchCooked(this.recipeId)
    const r = store.getRecipe(this.recipeId)
    this.setData({
      cookedCount: r.cookedCount,
      lastCookedText: format.fromNow(r.lastCookedAt)
    })
    wx.showToast({ title: '熟练度 +1', icon: 'none' })
  },

  goCook() {
    wx.navigateTo({ url: '/pages/cook/cook?id=' + this.recipeId })
  },

  goEdit() {
    wx.navigateTo({ url: '/pages/edit/edit?id=' + this.recipeId })
  },

  previewCover() {
    if (this.data.recipe && this.data.recipe.cover) {
      wx.previewImage({ urls: [this.data.recipe.cover] })
    }
  },

  goBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) wx.navigateBack()
    else wx.reLaunch({ url: '/pages/list/list' })
  }
})
