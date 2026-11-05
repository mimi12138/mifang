const store = require('../../utils/store.js')
const nutrition = require('../../utils/nutrition.js')

Page({
  data: {
    tab: 'recipe',
    keyword: '',
    category: '全部',
    categories: ['全部'].concat(store.CATEGORIES),
    recipes: [],
    meals: [],
    filtered: [],
    recipeTotal: 0,
    mealTotal: 0
  },

  onShow() {
    this.load()
  },

  onPullDownRefresh() {
    this.load()
    wx.stopPullDownRefresh()
  },

  load() {
    const settings = store.getSettings()
    const opts = { spoons: settings.spoons || {} }

    const recipes = store.getRecipes().map((r) => {
      const c = nutrition.calcRecipe(r, opts)
      return {
        id: r.id,
        name: r.name || '没名字',
        first: String(r.name || '菜').slice(0, 1),
        cover: r.cover || '',
        category: r.category || '',
        tags: r.tags || [],
        cookedCount: r.cookedCount || 0,
        perServing: c.perServing,
        level: nutrition.kcalLevel(c.perServing),
        unmeasured: c.unmeasured.length
      }
    })

    const meals = store.getMeals().map((m) => {
      let total = 0
      ;(m.items || []).forEach((it) => {
        total += (it.perServing || 0) * (it.servings || 1)
      })
      const people = Number(m.people) || 1
      return {
        id: m.id,
        name: m.name || '没起名的一桌',
        people,
        count: (m.items || []).length,
        total: Math.round(total),
        perPerson: Math.round(total / people)
      }
    })

    this.setData({
      recipes,
      meals,
      recipeTotal: recipes.length,
      mealTotal: meals.length
    })
    this.applyFilter()
  },

  switchTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab })
  },

  onSearch(e) {
    this.setData({ keyword: e.detail.value })
    this.applyFilter()
  },

  clearSearch() {
    this.setData({ keyword: '' })
    this.applyFilter()
  },

  pickCategory(e) {
    const c = e.currentTarget.dataset.c
    this.setData({ category: c })
    this.applyFilter()
  },

  applyFilter() {
    const kw = this.data.keyword.trim().toLowerCase()
    const cat = this.data.category

    // 搜索时去库里拿用料名，一起匹配
    const all = store.getRecipes()

    const filtered = this.data.recipes.filter((r) => {
      if (cat !== '全部' && r.category !== cat) return false
      if (!kw) return true
      if (r.name.toLowerCase().indexOf(kw) >= 0) return true
      if ((r.tags || []).some((t) => String(t).toLowerCase().indexOf(kw) >= 0)) return true

      const raw = all.find((x) => x.id === r.id)
      if (raw) {
        const hit = (raw.groups || []).some((g) =>
          (g.items || []).some((it) => String(it.name || '').toLowerCase().indexOf(kw) >= 0)
        )
        if (hit) return true
      }
      return false
    })

    this.setData({ filtered })
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id
    nav('/pages/detail/detail?id=' + id)
  },

  goMeal(e) {
    const id = e.currentTarget.dataset.id
    nav('/pages/meal-edit/meal-edit?id=' + id)
  },

  createNew() {
    if (this.data.tab === 'recipe') {
      nav('/pages/edit/edit')
    } else {
      nav('/pages/meal-edit/meal-edit')
    }
  },

  goSettings() {
    nav('/pages/settings/settings')
  }
})

/* 跳转失败不再静默，直接弹出来 */
function nav(url) {
  wx.navigateTo({
    url,
    fail(err) {
      wx.showModal({
        title: '跳转失败',
        content: (err && err.errMsg) || '未知原因',
        showCancel: false
      })
    }
  })
}
