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
  },

  async onLoad() {
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

  // ====== 社群信息弹窗 ======
  async onCommunity() {
    wx.showLoading({ title: '加载中...' });
    await this.loadCommunityData();
    wx.hideLoading();
    this.setData({ showCommunityModal: true, commIndex: 0 });
  },

  async loadCommunityData(forceRefresh = false) {
    // 非强制刷新时读缓存
    if (!forceRefresh) {
      const cached = cache.get('communities')
      if (cached) {
        this.setData({ commGroups: cached })
        return
      }
    }
    try {
      let groups = [];
      try {
        const res = await db.collection('communities').orderBy('order', 'desc').get();
        groups = res.data || [];
      } catch (e) {
        if (e.errCode !== -502005) throw e;
      }
      // 转换云文件ID为临时URL
      const fileIds = groups.map(g => g.imageUrl).filter(Boolean);
      if (fileIds.length > 0) {
        try {
          const { result } = await wx.cloud.callFunction({ name: 'getTempFileUrls', data: { fileList: fileIds } });
          const urlMap = {};
          for (const f of (result && result.fileList) || []) {
            if (f.tempFileURL) urlMap[f.fileID] = f.tempFileURL;
          }
          groups = groups.map(g => ({ ...g, _imageUrl: urlMap[g.imageUrl] || g.imageUrl }));
        } catch (e) {
          console.error('[社群] 获取临时URL失败:', e);
        }
      }
      this.setData({ commGroups: groups });
      // 写入缓存（5分钟有效）
      cache.set('communities', groups, 5 * 60 * 1000);
    } catch (err) {
      console.error('[社群] 加载失败:', err);
      this.setData({ commGroups: [] });
    }
  },

  onCloseCommunity() { this.setData({ showCommunityModal: false, commEditing: false, commEditGroups: [] }); },
  onCommSwitch(e) { this.setData({ commIndex: Number(e.currentTarget.dataset.index) }); },
  onCommSwiper(e) { this.setData({ commIndex: e.detail.current }); },
  onCommPrev() { if (this.data.commIndex > 0) this.setData({ commIndex: this.data.commIndex - 1 }); },
  onCommNext() { if (this.data.commIndex < this.data.commGroups.length - 1) this.setData({ commIndex: this.data.commIndex + 1 }); },
  onCommCopy(e) {
    const name = e.currentTarget.dataset.name;
    if (name) wx.setClipboardData({ data: name, success: () => wx.showToast({ title: '已复制', icon: 'success' }) });
  },

  // 编辑社群
  onCommStartEdit() {
    this.setData({
      commEditing: true,
      commEditGroups: this.data.commGroups.length > 0
        ? this.data.commGroups.map(g => ({ imageUrl: g.imageUrl, _imageUrl: g._imageUrl, description: g.description || '', isFull: !!g.isFull }))
        : [{ imageUrl: '', description: '', isFull: false }],
    });
  },
  onCommEditInput(e) {
    const { index, field } = e.currentTarget.dataset;
    this.setData({ [`commEditGroups[${index}].${field}`]: e.detail.value });
  },
  onCommEditToggleFull(e) {
    this.setData({ [`commEditGroups[${e.currentTarget.dataset.index}].isFull`]: e.detail.value });
  },
  onCommEditAdd() {
    this.setData({ commEditGroups: [...this.data.commEditGroups, { imageUrl: '', description: '', isFull: false }] });
  },
  onCommEditDel(e) {
    const i = e.currentTarget.dataset.index;
    this.setData({ commEditGroups: this.data.commEditGroups.filter((_, idx) => idx !== i) });
  },
  async onCommEditUpload(e) {
    const i = e.currentTarget.dataset.index;
    try {
      const res = await wx.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] });
      wx.showLoading({ title: '上传中...' });
      const cloudRes = await wx.cloud.uploadFile({
        cloudPath: `community/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`,
        filePath: res.tempFilePaths[0],
      });
      wx.hideLoading();
      this.setData({ [`commEditGroups[${i}].imageUrl`]: cloudRes.fileID });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '上传失败', icon: 'error' });
    }
  },
  onCommEditRemoveQr(e) { this.setData({ [`commEditGroups[${e.currentTarget.dataset.index}].imageUrl`]: '' }); },
  onCommEditCancel() { this.setData({ commEditing: false, commEditGroups: [] }); },
  async onCommEditSave() {
    const { commEditGroups } = this.data;
    const valid = commEditGroups.filter(g => g.imageUrl || g.description.trim());
    if (valid.length === 0) { wx.showToast({ title: '请至少添加一个群', icon: 'none' }); return; }
    wx.showLoading({ title: '保存中...' });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'saveCommunity',
        data: { groups: valid.map(g => ({ imageUrl: g.imageUrl || '', description: g.description.trim(), isFull: !!g.isFull })) },
      });
      wx.hideLoading();
      if (!result || !result.success) { wx.showToast({ title: result?.msg || '保存失败', icon: 'error' }); return; }
      wx.showToast({ title: '保存成功', icon: 'success' });
      this.setData({ commEditing: false, commEditGroups: [] });
      cache.remove('communities'); // 清除缓存，下次加载从库取
      await this.loadCommunityData(true);
    } catch (err) {
      wx.hideLoading();
      console.error('保存社群信息失败:', err);
      wx.showToast({ title: '保存失败', icon: 'error' });
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
    wx.navigateTo({ url: '/pages/publish/index' });
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

  // ====== 分享功能 ======
  onShareAppMessage() {
    return {
      title: '一起拼 - 组团报名更划算',
      path: '/pages/index/index',
    };
  },
});
