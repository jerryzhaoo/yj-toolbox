const cache = require('./utils/cache')

App({
  globalData: {
    // session 级缓存，app 不销毁就不重新查库
    adminCache: null, // { openid, isAdmin, isSuperAdmin, pendingActivation }
    userCache: {},   // { [openid]: { ... } }
  },

  onLaunch() {
    // 强制简体中文
    this.setLocale();
    // 初始化云开发
    wx.cloud.init({
      env: 'cloudbase-d1gg2ripe87c81cd0',
      traceUser: true,
    });
    // 隐藏tabBar
    wx.hideTabBar({ animation: false });
  },
  onShow() {
    // 每次前台展示都强制简体（解决冷启动/热启动后变繁体）
    this.setLocale();
  },
  setLocale() {
    try {
      wx.setLocale({ locale: 'zh_CN' });
    } catch (e) {}
  },

  /**
   * 获取缓存的 admin 状态（优先内存，其次 localStorage）
   */
  getAdminCache(openid) {
    if (!openid) return null
    // 内存缓存（session 级）
    const mem = this.globalData.adminCache
    if (mem && mem.openid === openid) return mem
    // 本地存储（跨 session，5分钟有效，因为 admin 几乎不变化，设长一些）
    const local = cache.get('admin_' + openid)
    if (local) {
      this.globalData.adminCache = local
      return local
    }
    return null
  },

  /**
   * 更新 admin 缓存
   */
  setAdminCache(openid, data) {
    const entry = { openid, ...data, timestamp: Date.now() }
    this.globalData.adminCache = entry
    cache.set('admin_' + openid, entry, 0) // 永久缓存，增删管理员时手动清除
  },

  /**
   * 清除 admin 缓存（退出登录或管理员变更时调用）
   */
  clearAdminCache(openid) {
    this.globalData.adminCache = null
    if (openid) cache.remove('admin_' + openid)
  }
})
