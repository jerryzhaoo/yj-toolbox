const db = wx.cloud.database();

Page({
  data: {
    loading: true,
    isAdmin: false,
    groups: [],
    currentIndex: 0,
    showEditModal: false,
    editGroups: [],
  },

  async onLoad() {
    const openid = await this.getOpenid();
    if (openid) {
      let adminRes = await db.collection('admins').where({ _openid: openid }).limit(1).get();
      if (adminRes.data.length === 0) {
        adminRes = await db.collection('admins').where({ openid: openid, activated: true }).limit(1).get();
      }
      this.setData({ isAdmin: adminRes.data.length > 0 });
    }
    await this.loadGroups();
  },

  onShow() {
    this.loadGroups();
  },

  async getOpenid() {
    try {
      const res = await wx.cloud.callFunction({ name: 'getOpenid' });
      return res.result.openid;
    } catch (e) {
      return null;
    }
  },

  async loadGroups() {
    try {
      let groups = [];
      try {
        const res = await db.collection('communities').orderBy('order', 'asc').get();
        groups = res.data || [];
      } catch (e) {
        if (e.errCode !== -502005) throw e;
      }
      const fileIds = groups.map(g => g.imageUrl).filter(Boolean);
      if (fileIds.length > 0) {
        try {
          const { result } = await wx.cloud.callFunction({
            name: 'getTempFileUrls',
            data: { fileList: fileIds }
          });
          if (result && result.fileList) {
            const urlMap = {};
            for (const f of result.fileList) urlMap[f.fileID] = f.tempFileURL;
            groups = groups.map(g => ({
              ...g,
              _imageUrl: g.imageUrl && urlMap[g.imageUrl] ? urlMap[g.imageUrl] : g._imageUrl
            }));
          }
        } catch (e) {
          console.warn('获取二维码临时URL失败:', e);
        }
      }
      this.setData({ groups, loading: false });
    } catch (err) {
      console.error('加载社群信息失败:', err);
      this.setData({ loading: false });
    }
  },

  // ---- Tab & 轮播切换 ----
  onSwitchTab(e) {
    this.setData({ currentIndex: Number(e.currentTarget.dataset.index) });
  },

  onSwiperChange(e) {
    this.setData({ currentIndex: e.detail.current });
  },

  onPrev() {
    const { currentIndex } = this.data;
    if (currentIndex > 0) this.setData({ currentIndex: currentIndex - 1 });
  },

  onNext() {
    const { currentIndex, groups } = this.data;
    if (currentIndex < groups.length - 1) this.setData({ currentIndex: currentIndex + 1 });
  },

  // ---- 复制群名 ----
  onCopyName(e) {
    const name = e.currentTarget.dataset.name;
    if (!name) return;
    wx.setClipboardData({ data: name, success: () => wx.showToast({ title: '已复制', icon: 'success' }) });
  },

  // ---- 管理员编辑 ----
  onEdit() {
    const editGroups = this.data.groups.length > 0
      ? this.data.groups.map(g => ({ imageUrl: g.imageUrl, description: g.description || '', subDescription: g.subDescription || '', _id: g._id }))
      : [{ imageUrl: '', description: '', subDescription: '' }];
    this.setData({ showEditModal: true, editGroups });
  },

  onCloseEdit() { this.setData({ showEditModal: false }); },

  onEditInput(e) {
    const { index, field } = e.currentTarget.dataset;
    this.setData({ [`editGroups[${index}].${field}`]: e.detail.value });
  },

  onAddGroup() {
    const editGroups = this.data.editGroups;
    editGroups.push({ imageUrl: '', description: '', subDescription: '' });
    this.setData({ editGroups });
  },

  onRemoveGroup(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ editGroups: this.data.editGroups.filter((_, i) => i !== index) });
  },

  async onUploadQr(e) {
    const index = e.currentTarget.dataset.index;
    try {
      const res = await wx.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] });
      wx.showLoading({ title: '上传中...' });
      const cloudRes = await wx.cloud.uploadFile({
        cloudPath: `community/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`,
        filePath: res.tempFilePaths[0],
      });
      wx.hideLoading();
      this.setData({ [`editGroups[${index}].imageUrl`]: cloudRes.fileID });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '上传失败', icon: 'error' });
    }
  },

  onRemoveQr(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ [`editGroups[${index}].imageUrl`]: '' });
  },

  async onSaveEdit() {
    const { editGroups } = this.data;
    const validGroups = editGroups.filter(g => g.imageUrl || g.description.trim());
    if (validGroups.length === 0) {
      wx.showToast({ title: '请至少添加一个群信息', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '保存中...' });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'saveCommunity',
        data: { groups: validGroups.map(g => ({ imageUrl: g.imageUrl || '', description: g.description.trim(), subDescription: g.subDescription?.trim() || '' })) }
      });
      wx.hideLoading();
      if (!result || !result.success) {
        wx.showToast({ title: result?.msg || '保存失败', icon: 'error' });
        return;
      }
      wx.showToast({ title: '保存成功', icon: 'success' });
      this.setData({ showEditModal: false });
      await this.loadGroups();
    } catch (err) {
      wx.hideLoading();
      console.error('保存社群信息失败:', err);
      wx.showToast({ title: '保存失败', icon: 'error' });
    }
  },

  stopPropagation() {},
});
