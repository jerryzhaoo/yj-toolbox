const app = getApp();
const db = wx.cloud.database();
const cache = require('../../utils/cache');

Page({
  data: {
    userData: {
      avatar: '',
      name: '用户昵称',
      location: '深圳市·南山区',
      myPostsCount: 0,
      myJoinedCount: 0,
    },
    myPosts: [],
    myJoined: [],
    showMyPosts: false,
    showMyJoined: false,
    adminChecked: false,
    isAdmin: false,
    isSuperAdmin: false,
    showAdminModal: false,
    adminList: [],
    adminInviteCode: '',
    showInviteCode: false,
    showCdkModal: false,
    cdkCode: '',
    cdkError: '',
    showCommunityModal: false,
    commGroups: [],
    commIndex: 0,
    commEditing: false,
    commEditGroups: [],
    showActivateModal: false,
    activateCode: '',
    activateError: '',
    appVersion: '',
    envLabel: '',
    versionText: '',
    checkingUpdate: false,
  },

  async onLoad() {
    // 加载版本信息（version 只有正式版才有值，开发版/体验版为空）
    try {
      const accountInfo = wx.getAccountInfoSync();
      const { version, envVersion } = accountInfo.miniProgram;
      const envMap = { develop: '开发版', trial: '体验版', release: '正式版' };
      const envLabel = envMap[envVersion] || envVersion;
      this.setData({
        appVersion: version || '',
        envLabel,
        versionText: version ? `v${version}` : envLabel,
      });
    } catch (e) {
      this.setData({ appVersion: '', envLabel: '未知', versionText: '未知' });
    }
    await this.loadUserInfo();
    await this.loadCounts();
    await this.checkAdmin();
  },

  async onShow() {
    await this.loadUserInfo();
    await this.loadCounts();
    await this.checkAdmin();
  },

  async loadUserInfo() {
    try {
      const userInfo = wx.getStorageSync('userInfo');
      if (userInfo) {
        const data = userInfo.formData ? { ...userInfo.formData } : userInfo;
        this.setData({ userData: { ...this.data.userData, ...data } });
        return;
      }
      const openid = await this.getOpenid();
      if (!openid) return;
      const res = await db.collection('users').where({ _openid: openid }).get();
      if (res.data.length > 0) {
        const dbUser = res.data[0];
        this.setData({ userData: { ...this.data.userData, ...dbUser } });
        const { _id, _openid, createdAt, updatedAt, ...cleanUser } = dbUser;
        wx.setStorageSync('userInfo', cleanUser);
      }
    } catch (err) {
      console.error('加载用户信息失败:', err);
    }
  },

  async getOpenid() {
    try {
      const res = await wx.cloud.callFunction({ name: 'getOpenid' });
      return res.result.openid;
    } catch (e) {
      console.error('[profile] getOpenid 失败:', e);
      return null;
    }
  },

  async loadCounts() {
    try {
      const openid = await this.getOpenid();
      if (!openid) { console.warn('[profile] loadCounts: openid 为空'); return; }
      const [postsRes, joinedRes] = await Promise.all([
        db.collection('activities').where({ _openid: openid }).count(),
        db.collection('participants').where({ _openid: openid }).count(),
      ]);
      this.setData({
        'userData.myPostsCount': postsRes.total,
        'userData.myJoinedCount': joinedRes.total,
      });
    } catch (err) {
      console.error('[profile] loadCounts 异常:', err);
    }
  },

  async checkAdmin() {
    try {
      const openid = await this.getOpenid();
      if (!openid) { this.setData({ adminChecked: true }); return; }
      // 先查缓存
      const cached = app.getAdminCache(openid);
      if (cached) {
        this.setData({ adminChecked: true, isAdmin: cached.isAdmin, isSuperAdmin: cached.isSuperAdmin || false, pendingActivation: cached.pendingActivation || false });
        return;
      }
      // 缓存未命中，查库
      const res = await db.collection('admins').where({ _openid: openid }).limit(1).get();
      let isAdmin = res.data.length > 0;
      let adminRecord = res.data[0] || {};
      if (!isAdmin) {
        const r2 = await db.collection('admins').where({ openid, activated: true }).limit(1).get();
        if (r2.data.length > 0) { isAdmin = true; adminRecord = r2.data[0]; }
      }
      let pendingActivation = false;
      if (!isAdmin) {
        const userRes = await db.collection('users').where({ _openid: openid }).get();
        if (userRes.data.length > 0 && userRes.data[0].wechat) {
          const pendingRes = await db.collection('admins').where({ wechat: userRes.data[0].wechat, activated: false }).get();
          pendingActivation = pendingRes.data.length > 0;
        }
      }
      this.setData({ adminChecked: true, isAdmin, isSuperAdmin: adminRecord.role === 'super', pendingActivation });
      // 更新缓存
      app.setAdminCache(openid, { isAdmin, isSuperAdmin: adminRecord.role === 'super', pendingActivation });
    } catch (err) {
      this.setData({ adminChecked: true });
    }
  },

  onMyPosts() { wx.navigateTo({ url: '/pages/my-posts/index?type=posts&title=我发布的' }); },
  onMyJoined() { wx.navigateTo({ url: '/pages/my-posts/index?type=joined&title=我参与的' }); },
  onHelp() { wx.navigateTo({ url: '/pages/help/index' }); },

  // ====== 社群信息弹窗（审核期间隐藏） ======
  async onCommunity() { return; },
  async loadCommunityData(forceRefresh = false) { return; },
  onCloseCommunity() { return; },
  onCommSwitch(e) { return; },
  onCommSwiper(e) { return; },
  onCommPrev() { return; },
  onCommNext() { return; },
  onCommCopy(e) { return; },
  onCommStartEdit() { return; },
  onCommEditInput(e) { return; },
  onCommEditToggleFull(e) { return; },
  onCommEditAdd() { return; },
  onCommEditDel(e) { return; },
  async onCommEditUpload(e) { return; },
  onCommEditRemoveQr(e) { return; },
  onCommEditCancel() { return; },
  async onCommEditSave() { return; },

  // 预览头像
  onPreviewAvatar() {
    const avatar = this.data.userData.avatar;
    if (avatar) {
      wx.previewImage({ urls: [avatar] });
    }
  },
  // 编辑个人信息
  onEditProfile() { wx.navigateTo({ url: '/pages/user-info-edit/index' }); },
  onEditProfileDirect() { wx.navigateTo({ url: '/pages/user-info-edit/index?edit=1' }); },
  onPublishClick() {
    if (!this.data.isAdmin) {
      wx.showToast({ title: '仅管理员可发布', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/create/index' });
  },
  goToHome() { wx.switchTab({ url: '/pages/index/index' }); },
  goToProfileSelf() { wx.pageScrollTo({ scrollTop: 0 }); },

  getImageStyle(index) {
    const gradients = ['gradient-0', 'gradient-1', 'gradient-2', 'gradient-3', 'gradient-4', 'gradient-5'];
    return gradients[index % gradients.length];
  },

  // ====== 管理员配置 ======
  async onSetSelfAsSuperAdmin() {
    try {
      const openid = await this.getOpenid();
      if (!openid) { wx.showToast({ title: '获取用户信息失败', icon: 'none' }); return; }
      let existRes = await db.collection('admins').where({ _openid: openid }).get();
      if (existRes.data.length === 0) existRes = await db.collection('admins').where({ openid, activated: true }).get();
      if (existRes.data.length > 0) { wx.showToast({ title: '你已经是管理员了', icon: 'none' }); this.checkAdmin(); return; }
      await db.collection('admins').add({ data: { wechat: '', role: 'super', createdAt: db.serverDate() } });
      wx.showToast({ title: '设置成功', icon: 'success' });
      app.clearAdminCache(openid);
      this.checkAdmin();
    } catch (err) { wx.showToast({ title: '设置失败', icon: 'none' }); }
  },

  onManageAdmins() { if (!this.data.isSuperAdmin) return; this.setData({ showAdminModal: true }); this.loadAdminList(); },
  async loadAdminList() { try { const res = await db.collection('admins').get(); this.setData({ adminList: res.data }); } catch (e) { console.error(e); } },
  onCloseAdminModal() { this.setData({ showAdminModal: false, showAddAdmin: false, showInviteCode: false, adminInviteCode: '', newAdminWechat: '', addAdminError: '' }); },
  onShowAddAdmin() { this.setData({ showAddAdmin: true, newAdminWechat: '', addAdminError: '' }); },
  onCancelAddAdmin() { this.setData({ showAddAdmin: false, newAdminWechat: '', addAdminError: '' }); },
  onShowExistingInviteCode(e) { const c = e.currentTarget.dataset.invite; if (c) this.setData({ adminInviteCode: c, showInviteCode: true }); },
  onAdminWechatInput(e) { this.setData({ newAdminWechat: e.detail.value, addAdminError: '' }); },

  async onAddAdmin() {
    const wechat = this.data.newAdminWechat.trim();
    if (!wechat) { this.setData({ addAdminError: '请输入微信号' }); return; }
    const existRes = await db.collection('admins').where({ wechat }).get();
    if (existRes.data.length > 0) {
      const exist = existRes.data[0];
      if (exist._openid) { this.setData({ addAdminError: '该微信号已是管理员' }); }
      else { this.setData({ addAdminError: '该微信号已有待激活的邀请码' }); }
      return;
    }
    const inviteCode = Math.random().toString(36).slice(2, 8).toUpperCase();
    try {
      await db.collection('admins').add({ data: { wechat, role: 'admin', inviteCode, activated: false, createdAt: db.serverDate() } });
      this.setData({ showAddAdmin: false, newAdminWechat: '', addAdminError: '', adminInviteCode: inviteCode, showInviteCode: true });
      this.loadAdminList();
    } catch (err) { console.error(err); this.setData({ addAdminError: '添加失败，请重试' }); }
  },

  async onRemoveAdmin(e) {
    const adminId = e.currentTarget.dataset.id;
    const adminWechat = e.currentTarget.dataset.wechat;
    const adminRole = e.currentTarget.dataset.role;
    if (adminRole === 'super') { wx.showToast({ title: '不能删除超级管理员', icon: 'none' }); return; }
    const res = await new Promise(resolve => { wx.showModal({ title: '确认删除', content: `确定移除管理员 "${adminWechat}" 吗？`, success: r => resolve(r.confirm) }); });
    if (!res) return;
    try {
      const result = await wx.cloud.callFunction({ name: 'removeAdmin', data: { adminId } });
      if (result.result.success) {
        wx.showToast({ title: '已移除', icon: 'success' });
        // 清除本地缓存，被删除管理员在自设备上的缓存无法远程清除
        // 但他的操作权限已在云函数端即时收回（所有写操作都走云函数校验）
        const openid = await this.getOpenid();
        if (openid) app.clearAdminCache(openid);
        this.loadAdminList();
        this.checkAdmin();
      }
      else { wx.showToast({ title: result.result.msg || '操作失败', icon: 'error' }); }
    } catch (err) { console.error(err); wx.showToast({ title: '操作失败', icon: 'error' }); }
  },

  // ====== 激活管理员 ======
  onShowActivateAdmin() { this.setData({ showActivateModal: true, activateCode: '', activateError: '' }); },
  onCloseActivateModal() { this.setData({ showActivateModal: false, activateCode: '', activateError: '' }); },
  onCloseInviteCode() { this.setData({ showInviteCode: false, adminInviteCode: '' }); },
  onCopyInviteCode() { wx.setClipboardData({ data: this.data.adminInviteCode, success: () => wx.showToast({ title: '已复制邀请码', icon: 'success' }) }); },

  // ====== CDK激活 ======
  onShowCdkActivate() { this.setData({ showCdkModal: true, cdkCode: '', cdkError: '' }); },
  onCloseCdkActivate() { this.setData({ showCdkModal: false, cdkCode: '', cdkError: '' }); },
  onGoEditProfile() { this.setData({ showCdkModal: false, cdkCode: '', cdkError: '' }); wx.navigateTo({ url: '/pages/user-info-edit/index' }); },
  onCdkCodeInput(e) { this.setData({ cdkCode: e.detail.value.toUpperCase(), cdkError: '' }); },

  async onConfirmCdkActivate() {
    const code = this.data.cdkCode.trim().toUpperCase();
    if (!code) { this.setData({ cdkError: '请输入邀请码' }); return; }
    if (this.data.isAdmin && !this.data.isSuperAdmin) { this.setData({ cdkError: '口令无效或已使用' }); return; }
    const openid = await this.getOpenid();
    if (!openid) { this.setData({ cdkError: '获取用户信息失败' }); return; }
    if (!this.data.isSuperAdmin) {
      const userRes = await db.collection('users').where({ _openid: openid }).get();
      const userWechat = userRes.data.length > 0 ? (userRes.data[0].wechat || '') : '';
      if (!userWechat) { this.setData({ cdkError: '请先在「预设报名信息」中填写微信号后再来激活' }); return; }
    }
    try {
      const res = await db.collection('admins').where({ inviteCode: code, activated: false }).get();
      if (res.data.length === 0) { this.setData({ cdkError: '口令无效或已使用' }); return; }
      const adminRecord = res.data[0];
      if (!this.data.isSuperAdmin) {
        const userRes2 = await db.collection('users').where({ _openid: openid }).get();
        const userWechat = userRes2.data.length > 0 ? (userRes2.data[0].wechat || '') : '';
        if (adminRecord.wechat !== userWechat) { this.setData({ cdkError: '该口令与你微信号不匹配' }); return; }
      }
      const actRes = await wx.cloud.callFunction({ name: 'activateAdmin', data: { adminRecordId: adminRecord._id, openid } });
      if (!actRes.result || !actRes.result.success) { this.setData({ cdkError: actRes.result?.msg || '激活失败，请重试' }); return; }
      wx.showToast({ title: '激活成功', icon: 'success' });
      this.setData({ showCdkModal: false });
      await this.checkAdmin();
    } catch (err) { console.error('激活失败:', err); this.setData({ cdkError: '激活失败，请重试' }); }
  },

  onActivateCodeInput(e) { this.setData({ activateCode: e.detail.value.toUpperCase(), activateError: '' }); },
  stopPropagation() {},

  // ====== 检查更新 ======
  onCheckUpdate() {
    if (this.data.checkingUpdate) return;
    const updateManager = app.globalData.updateManager;
    if (!updateManager) {
      wx.showToast({ title: '当前环境不支持更新检测', icon: 'none' });
      return;
    }

    this.setData({ checkingUpdate: true });

    // 监听更新检测结果（3秒超时）
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        this.setData({ checkingUpdate: false });
        wx.showToast({ title: '当前已是最新版本', icon: 'none' });
      }
    }, 3000);

    updateManager.onCheckForUpdate((res) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      this.setData({ checkingUpdate: false });
      if (res.hasUpdate) {
        wx.showToast({ title: '发现新版本，正在后台下载...', icon: 'none', duration: 2000 });
      } else {
        wx.showToast({ title: '当前已是最新版本', icon: 'none' });
      }
    });

    // 监听下载完成
    updateManager.onUpdateReady(() => {
      wx.showModal({
        title: '更新就绪',
        content: '新版本已下载完成，是否立即重启应用？',
        confirmText: '立即重启',
        cancelText: '稍后',
        success: (modalRes) => {
          if (modalRes.confirm) {
            updateManager.applyUpdate();
          }
        }
      });
    });
  },

  // ====== 分享功能 ======
  onShareAppMessage() {
    return {
      title: '一起拼 - 组团报名更划算',
      path: '/pages/index/index',
    };
  },
});
