const store = require('./utils/store.js')
const format = require('./utils/format.js')

App({
  globalData: {
    settings: null,
    statusBarHeight: 20
  },

  onLaunch() {
    try {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      this.globalData.statusBarHeight = info.statusBarHeight || 20
    } catch (e) {}

    store.init()
    this.globalData.settings = store.getSettings()
    this.checkSnapshot()
    store.fillSeedCovers()
  },

  onShow() {
    this.globalData.settings = store.getSettings()
  },

  /**
   * 启动顺序：先看有没有本机快照要恢复，再决定要不要铺内置菜谱
   * 顺序反了会很糟——内置菜谱一铺，库就不空了，
   * 「发现本机备份」那条提示永远不会弹，她的真实数据就被盖住。
   */
  checkSnapshot() {
    if (store.getRecipes().length || store.getMeals().length) {
      store.seedIfEmpty() // 只打个标记，不动数据
      return
    }

    const snap = store.peekSnapshot()
    if (snap && snap.recipes && !store.snapshotAsked(snap.exportedAt)) {
      wx.showModal({
        title: '发现本机备份',
        content: (snap.exportedAt ? format.fromNow(snap.exportedAt) : '之前') +
          '的备份里有 ' + snap.recipes + ' 个菜谱，当前是空的。要恢复吗？',
        confirmText: '恢复',
        cancelText: '不用了',
        success: (r) => {
          store.markSnapshotAsked(snap.exportedAt)

          if (!r.confirm) {
            this.seedAndRefresh()
            return
          }

          const res = store.importBackup(snap.raw)
          if (!res.ok) {
            wx.showToast({ title: res.message, icon: 'none' })
            return
          }
          wx.showToast({ title: '已恢复 ' + res.recipes + ' 个', icon: 'none' })
          this.refreshTop()
        }
      })
      return
    }

    this.seedAndRefresh()
  },

  /* 库里是空的：铺一次内置菜谱，铺完让当前页重读 */
  seedAndRefresh() {
    if (store.seedIfEmpty()) this.refreshTop()
  },

  refreshTop() {
    const pages = getCurrentPages()
    const top = pages[pages.length - 1]
    if (top && typeof top.load === 'function') top.load()
  }
})
