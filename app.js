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
  },

  onShow() {
    this.globalData.settings = store.getSettings()
  },

  /**
   * 数据突然空了、但本机快照还有货，就问一句要不要恢复
   * 用来兜住「清数据缓存」「误删」这类事故
   */
  checkSnapshot() {
    if (store.getRecipes().length || store.getMeals().length) return

    const snap = store.peekSnapshot()
    if (!snap || !snap.recipes) return
    if (store.snapshotAsked(snap.exportedAt)) return

    wx.showModal({
      title: '发现本机备份',
      content: (snap.exportedAt ? format.fromNow(snap.exportedAt) : '之前') +
        '的备份里有 ' + snap.recipes + ' 个菜谱，当前是空的。要恢复吗？',
      confirmText: '恢复',
      cancelText: '不用了',
      success: (r) => {
        store.markSnapshotAsked(snap.exportedAt)
        if (!r.confirm) return

        const res = store.importBackup(snap.raw)
        if (!res.ok) {
          wx.showToast({ title: res.message, icon: 'none' })
          return
        }
        wx.showToast({ title: '已恢复 ' + res.recipes + ' 个', icon: 'none' })

        const pages = getCurrentPages()
        const top = pages[pages.length - 1]
        if (top && typeof top.load === 'function') top.load()
      }
    })
  }
})
