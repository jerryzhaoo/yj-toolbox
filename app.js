const cache = require('./utils/cache')

App({
  globalData: {
    // session 级缓存，app 不销毁就不重新查库
    adminCache: null, // { openid, isAdmin, isSuperAdmin, pendingActivation }
    userCache: {},   // { [openid]: { ... } }
  },

  onLaunch() {
    // 强制版本更新
    this.checkUpdate();
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
   * 强制版本更新：检测到新版本时弹窗，用户确认后立即重启
   */
  checkUpdate() {
    try {
      const updateManager = wx.getUpdateManager();

      updateManager.onCheckForUpdate((res) => {
        console.log('[更新] 是否有新版本:', res.hasUpdate);
      });

      updateManager.onUpdateReady(() => {
        wx.showModal({
          title: '更新提示',
          content: '发现新版本，请重启小程序以使用最新功能',
          showCancel: false, // 强制更新，不可取消
          confirmText: '立即重启',
          success: (res) => {
            if (res.confirm) {
              updateManager.applyUpdate();
            }
          }
        });
      });

      updateManager.onUpdateFailed(() => {
        // 更新失败：让用户删除小程序重试
        wx.showModal({
          title: '更新失败',
          content: '新版本下载失败，请删除当前小程序后重新搜索打开',
          showCancel: false,
          confirmText: '知道了'
        });
      });
    } catch (e) {
      console.warn('[更新] 更新管理器不可用', e);
    }
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
