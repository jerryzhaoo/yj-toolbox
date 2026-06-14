const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    isEditing: false,
    isAdmin: false,
    userId: null, // 云数据库中用户记录的 _id
    formData: {
      avatar: '',
      name: '用户昵称',
      gender: '男',
      birthday: '',
      realName: '',
      phone: '',
      carNumber: '',
      wechat: '',
      needInvoice: false,
      companyName: '',
      invoiceType: '普票',
      taxNumber: '',
      receiveEmail: '',
      bankAccountName: '',
      bankCardNumber: '',
      bankName: '',
    },
  },

  async onLoad(options) {
    // 先从缓存加载，避免闪烁
    const cached = wx.getStorageSync('userInfo');
    if (cached) {
      this.setData({ userId: cached.userId, formData: { ...this.data.formData, ...cached.formData } });
    }
    // 检查管理员身份（使用缓存）
    const openid = await this.getOpenid();
    if (openid) {
      const cached = app.getAdminCache(openid);
      if (cached) {
        this.setData({ isAdmin: cached.isAdmin });
      } else {
        let adminRes = await db.collection('admins').where({ _openid: openid }).limit(1).get();
        let isAdmin = false, role = '';
        if (adminRes.data.length > 0) {
          isAdmin = true;
          role = adminRes.data[0].role || '';
        } else {
          adminRes = await db.collection('admins').where({ openid: openid, activated: true }).limit(1).get();
          isAdmin = adminRes.data.length > 0;
        }
        this.setData({ isAdmin });
        app.setAdminCache(openid, { isAdmin, isSuperAdmin: role === 'super' });
      }
    }
    // 从云数据库加载用户数据（异步刷新缓存）
    this.loadUserInfo();
    // 如果 URL 参数有 edit=1，自动进入编辑状态
    if (options.edit === '1') {
      this.setData({ isEditing: true });
    }
  },

  // 获取当前用户 openid
  async getOpenid() {
    try {
      const res = await wx.cloud.callFunction({ name: 'getOpenid' });
      return res.result.openid;
    } catch (e) {
      return null;
    }
  },

  // 加载用户信息
  async loadUserInfo() {
    try {
      const openid = await this.getOpenid();
      if (!openid) return;
      const res = await db.collection('users').where({
        _openid: openid,
      }).get();
      if (res.data.length > 0) {
        const userInfo = res.data[0];
        // 过滤系统保留字段
        const { _id: uid, _openid: oid, ...cleanInfo } = userInfo;
        const formData = { ...this.data.formData, ...cleanInfo };
        this.setData({
          userId: uid,
          formData,
        });
        // 写入缓存
        wx.setStorageSync('userInfo', { userId: uid, formData });
      }
    } catch (err) {
      console.error('加载用户信息失败:', err);
    }
  },

  // 返回
  onBack() {
    wx.navigateBack();
  },

  // 输入处理
  onInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({
      [`formData.${field}`]: value
    });
  },

  // 保存数据
  async onSave() {
    // 如果当前是预览模式，切换到编辑模式
    if (!this.data.isEditing) {
      this.setData({ isEditing: true });
      return;
    }
    // 如果需要发票，则公司名称和税号必填
    if (this.data.formData.needInvoice) {
      if (!this.data.formData.companyName.trim()) {
        wx.showToast({ title: '请填写公司名称', icon: 'none' });
        return;
      }
      if (!this.data.formData.taxNumber.trim()) {
        wx.showToast({ title: '请填写税号', icon: 'none' });
        return;
      }
    }
    // 保存到云数据库
    wx.showLoading({ title: '保存中...' });
    try {
      const { formData, userId } = this.data;
      // 过滤掉系统保留字段，避免 add/update 报错
      const { _id, _openid, ...cleanData } = formData;
      const saveData = {
        ...cleanData,
        updatedAt: db.serverDate(),
      };
      if (userId) {
        // 更新已有记录
        await db.collection('users').doc(userId).update({ data: saveData });
      } else {
        // 新建记录
        const res = await db.collection('users').add({ data: saveData });
        this.setData({ userId: res._id });
      }
      // 同时同步到本地存储 - 展平 formData 以便 profile 直接使用
      wx.setStorageSync('userInfo', { ...cleanData });
      wx.hideLoading();
      wx.showToast({ title: '保存成功', icon: 'success' });
      this.setData({ isEditing: false });
    } catch (err) {
      wx.hideLoading();
      console.error('保存失败:', err);
      wx.showToast({ title: '保存失败', icon: 'error' });
    }
  },

  // 选择性别
  onSelectGender(e) {
    const gender = e.currentTarget.dataset.gender;
    this.setData({
      'formData.gender': gender
    });
  },

  // 选择生日
  onBirthdayChange(e) {
    this.setData({
      'formData.birthday': e.detail.value
    });
  },

  // 选择头像（上传到云存储）
  async onChooseAvatar() {
    try {
      const res = await wx.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
      });
      const tempFilePath = res.tempFilePaths[0];
      wx.showLoading({ title: '上传中...' });
      const cloudRes = await wx.cloud.uploadFile({
        cloudPath: `avatars/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`,
        filePath: tempFilePath,
      });
      wx.hideLoading();
      this.setData({ 'formData.avatar': cloudRes.fileID });
    } catch (err) {
      wx.hideLoading();
      console.error('上传头像失败:', err);
    }
  },

  // 切换发票开关
  onToggleInvoice() {
    this.setData({
      'formData.needInvoice': !this.data.formData.needInvoice
    });
  },

  // 选择发票类型
  onSelectInvoiceType(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({
      'formData.invoiceType': type
    });
  },
});
