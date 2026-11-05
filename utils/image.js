/**
 * 图片处理
 * 选图 → 压缩 → 写入小程序本地目录，全程用户无感知
 */

/**
 * 选一张图，返回临时路径
 * @returns {Promise<string>} 取消则返回空串
 */
function chooseImage() {
  return new Promise((resolve) => {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['original'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0]
        resolve(file ? file.tempFilePath : '')
      },
      fail: () => resolve('')
    })
  })
}

/**
 * 压缩
 * @param {string} src
 * @param {{width:number, quality:number}} conf
 * @returns {Promise<string>}
 */
function compress(src, conf) {
  return new Promise((resolve) => {
    wx.compressImage({
      src,
      quality: conf.quality,
      compressWidth: conf.width,
      success: (res) => resolve(res.tempFilePath || src),
      fail: () => resolve(src)
    })
  })
}

/**
 * 临时文件转永久，存到小程序本地目录
 * @param {string} tempPath
 * @returns {Promise<string>}
 */
function saveToUserDir(tempPath) {
  return new Promise((resolve) => {
    const fs = wx.getFileSystemManager()
    const m = String(tempPath).match(/\.(jpg|jpeg|png|webp)$/i)
    const ext = m ? '.' + m[1].toLowerCase() : '.jpg'
    const name =
      'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) + ext
    const filePath = wx.env.USER_DATA_PATH + '/' + name

    fs.saveFile({
      tempFilePath: tempPath,
      filePath,
      success: () => resolve(filePath),
      fail: () => resolve('')
    })
  })
}

/**
 * 选图 → 压缩 → 保存，一步到位
 * @param {{width:number, quality:number}} conf
 * @returns {Promise<{path:string, size:number}|null>}
 */
async function pickAndSave(conf) {
  const src = await chooseImage()
  if (!src) return null

  const small = await compress(src, conf)
  const path = await saveToUserDir(small)
  if (!path) {
    wx.showToast({ title: '保存失败，可能空间不足', icon: 'none' })
    return null
  }

  let size = 0
  try {
    const s = wx.getFileSystemManager().statSync(path)
    size = (s.stats && s.stats.size) || 0
  } catch (e) {}

  return { path, size }
}

/** 预览图片 */
function preview(path) {
  if (!path) return
  wx.previewImage({ urls: [path], current: path })
}

module.exports = {
  chooseImage,
  compress,
  saveToUserDir,
  pickAndSave,
  preview
}
