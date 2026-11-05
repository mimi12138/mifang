const store = require('../../utils/store.js')
const spoonData = require('../../data/spoons.js')
const format = require('../../utils/format.js')

const COMMON_SPOONS = ['盐', '白糖', '生抽', '老抽', '蚝油', '醋', '料酒', '食用油']

const QUALITY_OPTIONS = [
  { key: 'low', label: '省空间', desc: '宽 800 · 约 60KB' },
  { key: 'standard', label: '标准', desc: '宽 1080 · 约 180KB' },
  { key: 'high', label: '高清', desc: '宽 1440 · 约 350KB' }
]

Page({
  data: {
    quality: 'standard',
    qualityOptions: QUALITY_OPTIONS,
    info: { storageKB: 0, imageCount: 0, imageMB: 0, recipeCount: 0, mealCount: 0 },
    percent: 0,
    spoons: [],
    showAllSpoons: false,
    lastBackupText: '',
    snapText: '',
    snapCount: 0,
    busy: false
  },

  onShow() {
    this.load()
  },

  load() {
    const settings = store.getSettings()
    const info = store.getStorageInfo()
    const snap = store.peekSnapshot()

    this.setData({
      quality: settings.imageQuality,
      info,
      percent: Math.min(100, Math.round((info.imageMB / 200) * 100)),
      lastBackupText: settings.lastBackupAt ? format.fromNow(settings.lastBackupAt) : '还没备份过',
      snapText: snap && snap.exportedAt ? format.fromNow(snap.exportedAt) : '',
      snapCount: snap ? snap.recipes : 0,
      snapVal: snap && snap.recipes
        ? (snap.exportedAt ? format.fromNow(snap.exportedAt) : '之前') + ' · ' + snap.recipes + ' 个'
        : '还没有',
      spoons: this.buildSpoons(settings)
    })
  },

  buildSpoons(settings) {
    const custom = settings.spoons || {}
    const all = Object.keys(spoonData.spoons).map((name) => {
      const row = custom[name] || spoonData.spoons[name]
      return {
        name,
        small: row.small,
        big: row.big,
        // 输入框显示用文本，不能用数字：数字回写会吞掉「4.」的小数点
        smallText: String(row.small),
        bigText: String(row.big),
        isCustom: !!custom[name]
      }
    })

    // 常用调料排前面
    const common = []
    const rest = []
    all.forEach((it) => {
      if (COMMON_SPOONS.indexOf(it.name) >= 0) common.push(it)
      else rest.push(it)
    })
    common.sort((a, b) => COMMON_SPOONS.indexOf(a.name) - COMMON_SPOONS.indexOf(b.name))

    return common.concat(rest)
  },

  /* ── 画质 ── */
  pickQuality(e) {
    const q = e.currentTarget.dataset.q
    store.saveSettings({ imageQuality: q })
    this.setData({ quality: q })
    wx.showToast({ title: '之后拍的图按这档存', icon: 'none' })
  },

  /* ── 勺重 ── */
  toggleAllSpoons() {
    this.setData({ showAllSpoons: !this.data.showAllSpoons })
  },

  onSpoonInput(e) {
    const { i, k } = e.currentTarget.dataset
    const index = Number(i)
    const raw = String(e.detail.value == null ? '' : e.detail.value).trim()
    const item = this.data.spoons[index]
    const val = parseFloat(raw)
    // 末尾还是小数点说明她正在敲小数，先别存
    const ok = isFinite(val) && val >= 0 && !/\.$/.test(raw)

    // 显示用的文本始终跟着输入走，这样「4.」「空」这些中间态不会被改写
    const patch = { ['spoons[' + index + '].' + k + 'Text']: raw }

    if (ok) {
      const custom = Object.assign({}, store.getSettings().spoons || {})
      const row = Object.assign({ small: item.small, big: item.big }, custom[item.name] || {})
      row[k] = val
      custom[item.name] = row
      store.saveSettings({ spoons: custom })

      patch['spoons[' + index + '].' + k] = val
      patch['spoons[' + index + '].isCustom'] = true
    }
    // 输入不完整（空、「4.」）时只更新文本，不写进设置，免得把 0 存进去

    this.setData(patch)
  },

  /** 失焦时把「4.」这类半截文本规整成实际存下的数，空的恢复成原值 */
  onSpoonBlur(e) {
    const { i, k } = e.currentTarget.dataset
    const index = Number(i)
    const num = Number(this.data.spoons[index][k])
    this.setData({
      ['spoons[' + index + '].' + k + 'Text']: isFinite(num) ? String(num) : ''
    })
  },

  resetSpoons() {
    store.saveSettings({ spoons: {} })
    this.load()
    wx.showToast({ title: '恢复成通用值', icon: 'none' })
  },

  /* ── 存储 ── */
  cleanOrphans() {
    wx.showModal({
      title: '清理无主图片',
      content: '扫一遍本地目录，删掉没有被任何菜谱引用的图片。',
      confirmText: '清理',
      success: (res) => {
        if (!res.confirm) return
        const r = store.cleanOrphanImages()
        this.load()
        wx.showToast({
          title: r.count ? '清掉 ' + r.count + ' 张，省 ' + r.mb + 'MB' : '没有需要清的',
          icon: 'none'
        })
      }
    })
  },

  /* ── 备份 ── */
  exportBackup() {
    if (this.data.busy) return
    this.setData({ busy: true })

    const path = store.writeBackupFile()
    if (!path) {
      this.setData({ busy: false })
      wx.showToast({ title: '写文件失败', icon: 'none' })
      return
    }

    const today = format.dateStr(Date.now())
    wx.shareFileMessage({
      filePath: path,
      fileName: '蜜方备份-' + today + '.json',
      success: () => {
        this.setData({ busy: false })
        this.load()
      },
      fail: (err) => {
        this.setData({ busy: false })
        const msg = (err && err.errMsg) || ''
        if (msg.indexOf('cancel') < 0) {
          wx.showModal({
            title: '发不出去',
            content: '手机上才行。开发者工具不支持发送文件，用真机预览再试。',
            showCancel: false
          })
        }
      }
    })
  },

  /** 用本机自动快照恢复，不需要选文件 */
  recoverSnapshot() {
    const snap = store.peekSnapshot()
    if (!snap || !snap.recipes) {
      wx.showToast({ title: '本机没有快照', icon: 'none' })
      return
    }

    wx.showModal({
      title: '用本机快照恢复？',
      content: (snap.exportedAt ? format.fromNow(snap.exportedAt) : '之前') +
        '的备份，' + snap.recipes + ' 个菜谱。现在的数据会被替换掉。',
      confirmText: '恢复',
      success: (r) => {
        if (!r.confirm) return
        const res = store.importBackup(snap.raw)
        this.load()
        wx.showModal({
          title: res.ok ? '已恢复' : '恢复失败',
          content: res.ok
            ? '菜谱 ' + res.recipes + ' 个，一桌 ' + res.meals + ' 个。图片不在这份快照里。'
            : res.message,
          showCancel: false
        })
      }
    })
  },

  importBackup() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['json'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file) return

        wx.showModal({
          title: '用这个备份覆盖？',
          content: '现在的菜谱和图片会被全部替换掉。',
          confirmText: '覆盖',
          confirmColor: '#B3452F',
          success: (r) => {
            if (!r.confirm) return
            wx.getFileSystemManager().readFile({
              filePath: file.path,
              encoding: 'utf8',
              success: (fr) => {
                const result = store.importBackup(fr.data)
                this.load()
                wx.showModal({
                  title: result.ok ? '导入完成' : '导入失败',
                  content: result.ok
                    ? '菜谱 ' + result.recipes + ' 个，一桌 ' + result.meals + ' 个。图片没有一起带过来，需要重新拍。'
                    : result.message,
                  showCancel: false
                })
              },
              fail: () => wx.showToast({ title: '读不了这个文件', icon: 'none' })
            })
          }
        })
      }
    })
  },

  /* ── 危险 ── */
  clearAll() {
    wx.showModal({
      title: '清空全部数据',
      content: '菜谱、一桌、图片全删，不可恢复。先确认你导出过备份。',
      confirmText: '清空',
      confirmColor: '#B3452F',
      success: (res) => {
        if (!res.confirm) return
        wx.showModal({
          title: '真的清空？',
          content: '最后一次确认。',
          confirmText: '清空',
          confirmColor: '#B3452F',
          success: (r2) => {
            if (!r2.confirm) return
            store.clearAll()
            this.load()
            wx.showToast({ title: '已清空', icon: 'none' })
          }
        })
      }
    })
  }
})
