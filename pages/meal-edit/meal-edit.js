const store = require('../../utils/store.js')
const nutrition = require('../../utils/nutrition.js')

Page({
  data: {
    isNew: true,
    meal: { name: '', people: 2, note: '', items: [] },
    total: 0,
    perPerson: 0,
    pickerShow: false,
    pickList: [],
    pickCount: 0,
    hasRecipes: false
  },

  onLoad(query) {
    this.mealId = query.id || ''
    this.load()
  },

  load() {
    let meal
    if (this.mealId) {
      meal = store.getMeal(this.mealId)
    }
    if (!meal) {
      meal = store.emptyMeal()
      this.setData({ isNew: !this.mealId })
    } else if (this.data.isNew !== false) {
      this.setData({ isNew: false })
      wx.setNavigationBarTitle({ title: '改这一桌' })
    }

    if (!meal.items) meal.items = []
    this.setData({ meal })
    this.recalc()
  },

  recalc() {
    const m = this.data.meal
    let total = 0
    ;(m.items || []).forEach((it) => {
      total += (Number(it.perServing) || 0) * (Number(it.servings) || 1)
    })
    const people = Number(m.people) || 1
    this.setData({
      total: Math.round(total),
      perPerson: Math.round(total / people)
    })
  },

  /* ── 基本信息 ── */
  onName(e) {
    this.data.meal.name = e.detail.value
  },

  onNote(e) {
    this.data.meal.note = e.detail.value
  },

  incPeople() {
    const n = Math.min(30, (Number(this.data.meal.people) || 1) + 1)
    this.setData({ 'meal.people': n })
    this.recalc()
  },

  decPeople() {
    const n = Math.max(1, (Number(this.data.meal.people) || 1) - 1)
    this.setData({ 'meal.people': n })
    this.recalc()
  },

  /* ── 份数 ── */
  incServ(e) {
    const i = Number(e.currentTarget.dataset.i)
    const it = this.data.meal.items[i]
    it.servings = Math.min(20, (Number(it.servings) || 1) + 1)
    this.setData({ meal: this.data.meal })
    this.recalc()
  },

  decServ(e) {
    const i = Number(e.currentTarget.dataset.i)
    const it = this.data.meal.items[i]
    it.servings = Math.max(1, (Number(it.servings) || 1) - 1)
    this.setData({ meal: this.data.meal })
    this.recalc()
  },

  removeItem(e) {
    const i = Number(e.currentTarget.dataset.i)
    this.data.meal.items.splice(i, 1)
    this.setData({ meal: this.data.meal })
    this.recalc()
  },

  /* ── 选菜 ── */
  openPicker() {
    const settings = store.getSettings()
    const opts = { spoons: settings.spoons || {} }
    const inMeal = {}
    ;(this.data.meal.items || []).forEach((it) => {
      inMeal[it.recipeId] = true
    })

    const list = store.getRecipes().map((r) => {
      const c = nutrition.calcRecipe(r, opts)
      return {
        id: r.id,
        name: r.name || '没名字',
        category: r.category || '',
        perServing: c.perServing,
        checked: !!inMeal[r.id]
      }
    })

    this.setData({
      pickerShow: true,
      pickList: list,
      pickCount: list.filter((x) => x.checked).length,
      hasRecipes: list.length > 0
    })
  },

  closePicker() {
    this.setData({ pickerShow: false })
  },

  togglePick(e) {
    const i = Number(e.currentTarget.dataset.i)
    const list = this.data.pickList
    list[i].checked = !list[i].checked
    this.setData({
      pickList: list,
      pickCount: list.filter((x) => x.checked).length
    })
  },

  confirmPick() {
    const oldMap = {}
    ;(this.data.meal.items || []).forEach((it) => {
      oldMap[it.recipeId] = it
    })

    const items = this.data.pickList
      .filter((p) => p.checked)
      .map((p) => {
        const old = oldMap[p.id]
        return {
          recipeId: p.id,
          name: p.name,
          perServing: p.perServing,
          servings: old ? old.servings : 1,
          recipeDeleted: false
        }
      })

    this.setData({ 'meal.items': items, pickerShow: false })
    this.recalc()
  },

  goCreateRecipe() {
    this.setData({ pickerShow: false })
    wx.navigateTo({ url: '/pages/edit/edit' })
  },

  /* ── 保存 ── */
  save() {
    const m = this.data.meal
    const name = String(m.name || '').trim()
    if (!name) {
      wx.showToast({ title: '给这一桌起个名', icon: 'none' })
      return
    }

    const payload = {
      id: m.id || '',
      name,
      people: Number(m.people) || 1,
      note: String(m.note || '').trim(),
      items: m.items || [],
      createdAt: m.createdAt || 0,
      updatedAt: m.updatedAt || 0
    }

    store.saveMeal(payload)
    store.writeBackupFile()

    wx.showToast({ title: '存好了', icon: 'none' })
    setTimeout(() => {
      wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/list/list' }) })
    }, 400)
  },

  async deleteMeal() {
    const ok = await new Promise((resolve) => {
      wx.showModal({
        title: '拆了这一桌？',
        content: '只是删掉这个搭配，菜谱本身还在。',
        confirmText: '拆了',
        confirmColor: '#B3452F',
        success: (res) => resolve(res.confirm)
      })
    })
    if (!ok) return

    store.deleteMeal(this.mealId)
    store.writeBackupFile()
    wx.showToast({ title: '拆了', icon: 'none' })
    setTimeout(() => {
      const pages = getCurrentPages()
      wx.navigateBack({ delta: Math.min(2, pages.length - 1) })
    }, 360)
  }
})
