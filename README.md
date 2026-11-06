# 蜜方 · mifang

给自己用的菜谱小程序：拍张照、记下用料和步骤、顺手估个热量，做饭时开「开火」模式一步步看。

纯本地，没有后端、没有云开发、没有第三方依赖。数据只存在当前这台手机的微信沙箱里（`wx.setStorageSync` + `USER_DATA_PATH`），不上传任何服务器。

- 形态：原生小程序（WXML / WXSS / JS），不使用 npm，不需要构建
- 定位：个人自用，不发布、不收款、不接入登录
- 存储上限：文字数据 10MB / 图片 200MB

## 目录结构

```
app.js / app.json / app.wxss    入口与全局样式
data/ingredients.js             食材库（别名、每 100g 热量、单重）
data/spoons.js                  勺重表、调料清单
data/seed.js                    内置菜谱（首次安装且库为空时铺进去，生成文件）
assets/covers/                  内置菜谱的封面图（750 宽压缩图；实拍照片，不进公开仓库）
utils/store.js                  数据层唯一出口（菜谱 / 一桌 / 设置 / 备份）
utils/nutrition.js              热量计算、用量文本
utils/units.js                  单位归一、数量解析
utils/parse.js                  粘贴一段文字 → 菜谱结构（纯规则，无 AI）
utils/image.js                  选图压缩、落盘
pages/list/                     首页：菜谱列表
pages/detail/                   详情
pages/edit/                     录入 / 编辑
pages/cook/                     做饭模式（屏幕常亮、可调字号、滑动切步）
pages/meal-edit/                「一桌」编辑
pages/settings/                 设置：勺重、字号、存储统计、备份与恢复
design/                         早期 HTML 设计稿（不进小程序包）
```

## 本地运行

1. 安装[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 「导入项目」选这个目录，AppID 填自己的（或直接用「测试号」）
3. 编译即可，没有 `npm install` 这一步

数据存在设备本地，换设备不会自动同步。备份走「设置 → 导出备份」，导出的 JSON 只有文字，不含图片。
