const app = getApp();
const db = wx.cloud.database();
const cache = require('../../utils/cache');
const privacy = require('../../utils/privacy');

Page({
  data: {
    publishType: 'group',
    isAdmin: false,
    isEditing: false,
    editData: null,
    editId: null,
    uploadedImages: [],
    imageFileIDs: [], // 云存储 fileID 列表
    showSuccessModal: false,
    isSubmitting: false,
    loading: true,
    // 报名活动表单
    formKey: 0,
    groupForm: {
      title: '',
      location: '',
      locationName: '',
      locationAddress: '',
      locationLat: 0,
      locationLng: 0,
      targetMonths: '',
      groupPrice: '',
      originalPrice: '',
      description: '',
      tips: '',
      isClosed: false,
      closeTime: '',
      bankAccountName: '',
      bankCardNumber: '',
      bankName: '',
      validFrom: '',
      validUntil: '',
    },
    showPrivacyModal: false,
    privacyPurposes: [],
    pendingSave: null,
  },

  async onLoad(options) {
    const isAdmin = await this.checkAdmin();
    // 非管理员直接跳回首页
    if (!isAdmin) {
      wx.switchTab({ url: '/pages/index/index' });
      return;
    }
    
    if (options.edit && options.id) {
      // 编辑模式
      const editData = await this.loadEditData(options.id);
      if (editData) {
        this.setData({ loading: false });
        // 先渲染空表单，延迟回填数据确保 auto-height 正确计算
        setTimeout(() => {
          this.setData({ ...editData, editId: options.id, isAdmin, formKey: this.data.formKey + 1 });
        }, 50);
        return;
      }
    }
    if (options.copy) {
      // 复制模式
      this.setData({ loading: false });
      try {
        const activity = JSON.parse(decodeURIComponent(options.copy));
        const groupForm = this.data.groupForm;
        const filledForm = {
          ...groupForm,
          title: activity.title || '',
          location: activity.location || '',
          locationName: activity.locationName || '',
          locationAddress: activity.locationAddress || '',
          locationLat: activity.locationLat || 0,
          locationLng: activity.locationLng || 0,
          targetMonths: activity.targetMonths || '',
          groupPrice: activity.groupPrice || '',
          originalPrice: activity.originalPrice || '',
          description: activity.description || '',
          tips: activity.tips || '',
          validFrom: activity.validFrom || '',
          validUntil: activity.validUntil || '',
          bankAccountName: activity.bankAccountName || '',
          bankCardNumber: activity.bankCardNumber || '',
          bankName: activity.bankName || '',
        };
        setTimeout(() => {
          this.setData({ groupForm: filledForm, formKey: this.data.formKey + 1 });
        }, 50);
        return;
      } catch (e) {
        console.error('解析复制数据失败:', e);
      }
    }
    // 新建模式：设置默认日期
    const today = this.formatDate(new Date());
    const thirtyDaysLater = this.formatDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
    this.setData({
      isAdmin,
      'groupForm.validFrom': today,
      'groupForm.validUntil': thirtyDaysLater,
      loading: false,
    });
  },

  // 格式化日期为 YYYY-MM-DD
  formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  // 检查管理员身份（使用缓存）
  async checkAdmin() {
    try {
      const openidRes = await wx.cloud.callFunction({ name: 'getOpenid' });
      const openid = openidRes.result.openid;
      if (!openid) return false;
      // 先查缓存
      const cached = app.getAdminCache(openid);
      if (cached) return cached.isAdmin;
      // 缓存未命中，查库
      const res = await db.collection('admins').where({
        _openid: openid
      }).limit(1).get();
      if (res.data.length > 0) {
        app.setAdminCache(openid, { isAdmin: true, isSuperAdmin: res.data[0].role === 'super' });
        return true;
      }
      // 兼容邀请码激活（_openid 不可修改，用自定义 openid 字段匹配）
      const res2 = await db.collection('admins').where({
        openid: openid,
        activated: true,
      }).limit(1).get();
      const isAdmin = res2.data.length > 0;
      app.setAdminCache(openid, { isAdmin, isSuperAdmin: isAdmin && res2.data[0].role === 'super' });
      return isAdmin;
    } catch (err) {
      return false;
    }
  },

  // 加载编辑数据（返回数据对象，不 setData）
  async loadEditData(id) {
    try {
      const res = await db.collection('activities').doc(id).get();
      const editData = res.data;

      const groupForm = {
        title: editData.title || '',
        description: editData.description || '',
        location: editData.location || '',
        locationName: editData.locationName || '',
        locationAddress: editData.locationAddress || '',
        locationLat: editData.locationLat || 0,
        locationLng: editData.locationLng || 0,
        targetMonths: editData.targetMonths || '',
        groupPrice: editData.groupPrice || '',
        originalPrice: editData.originalPrice || '',
        tips: editData.tips || '',
        isClosed: editData.isClosed || false,
        bankAccountName: editData.bankAccountName || '',
        bankCardNumber: editData.bankCardNumber || '',
        bankName: editData.bankName || '',
        participants: editData.participants ?? 0,
        currentMonths: editData.currentMonths ?? 0,
        validFrom: editData.validFrom || '',
        validUntil: editData.validUntil || '',
      };
      const uploadedImages = editData.images || [];
      const imageFileIDs = editData.images || [];

      return {
        isEditing: true,
        editData,
        groupForm,
        uploadedImages,
        imageFileIDs,
      };
    } catch (err) {
      console.error('加载编辑数据失败:', err);
      wx.showToast({ title: '加载失败', icon: 'error' });
      return null;
    }
  },

  // 返回
  onBack() {
    wx.navigateBack();
  },

  // 切换发布类型
  onTypeChange(e) {
    // 编辑模式下不允许切换类型
    if (this.data.isEditing) {
      return;
    }
    const type = e.currentTarget.dataset.type;
    this.setData({
      publishType: type
    });
  },

  // 输入处理
  onInput(e) {
    const { field } = e.currentTarget.dataset;
    let value = e.detail.value;
    // 描述和温馨提示限制 999 字
    if ((field === 'description' || field === 'tips') && value.length > 999) {
      value = value.slice(0, 999);
    }
    this.setData({ [`groupForm.${field}`]: value });
  },

  // 切换开关
  onToggle(e) {
    const field = e.currentTarget.dataset.field;
    const newVal = !this.data.groupForm[field];
    const update = { [`groupForm.${field}`]: newVal };
    // 变更为已截止时记录截止时间
    if (field === 'isClosed' && newVal) {
      update['groupForm.closeTime'] = new Date().toISOString();
    }
    this.setData(update);
  },

  // 一键填写集合信息（从预设加载）
  async onFillBankFromPreset() {
    try {
      const openidRes = await wx.cloud.callFunction({ name: 'getOpenid' });
      const openid = openidRes.result.openid;
      if (!openid) return;
      const userRes = await db.collection('users').where({ _openid: openid }).limit(1).get();
      if (userRes.data.length > 0) {
        const u = userRes.data[0];
        this.setData({
          'groupForm.bankAccountName': u.bankAccountName || '',
          'groupForm.bankCardNumber': u.bankCardNumber || '',
          'groupForm.bankName': u.bankName || '',
        });
        wx.showToast({ title: '已填写', icon: 'success' });
      } else {
        wx.showToast({ title: '暂无预设集合信息', icon: 'none' });
      }
    } catch (err) {
      console.error('加载预设转账信息失败:', err);
      wx.showToast({ title: '加载失败', icon: 'error' });
    }
  },

  // 隐私授权 - 同意
  onPrivacyAgree() {
    privacy.setAgreed();
    this.setData({ showPrivacyModal: false });
    const pending = this.data.pendingSave;
    if (pending) {
      this.setData({ pendingSave: null });
      pending();
    }
  },

  // 隐私授权 - 不同意
  onPrivacyDisagree() {
    this.setData({ showPrivacyModal: false, pendingSave: null });
    wx.showToast({ title: '已取消保存', icon: 'none' });
  },

  // 保存转账信息到预设
  async onSaveBankToPreset() {
    const { bankAccountName, bankCardNumber, bankName } = this.data.groupForm;
    if (!bankAccountName || !bankCardNumber || !bankName) {
      wx.showToast({ title: '请先填写完整的集合信息', icon: 'none' });
      return;
    }
    // 检查隐私授权
    if (!privacy.hasAgreed()) {
      const purposes = privacy.getPurposesByKeys(['bank']);
      this.setData({
        privacyPurposes: purposes,
        showPrivacyModal: true,
        pendingSave: () => this._doSaveBankToPreset(),
      });
      return;
    }
    await this._doSaveBankToPreset();
  },

  async _doSaveBankToPreset() {
    const { bankAccountName, bankCardNumber, bankName } = this.data.groupForm;
    wx.showLoading({ title: '保存中...' });
    try {
      const openidRes = await wx.cloud.callFunction({ name: 'getOpenid' });
      const openid = openidRes.result.openid;
      if (!openid) return;
      const userRes = await db.collection('users').where({ _openid: openid }).limit(1).get();
      const saveData = {
        bankAccountName: bankAccountName.trim(),
        bankCardNumber: bankCardNumber.replace(/\s/g, ''),
        bankName: bankName.trim(),
        updatedAt: db.serverDate(),
      };
      if (userRes.data.length > 0) {
        await db.collection('users').doc(userRes.data[0]._id).update({ data: saveData });
      } else {
        await db.collection('users').add({ data: { ...saveData, _openid: openid, createdAt: db.serverDate() } });
      }
      wx.showToast({ title: '已保存到预设', icon: 'success' });
    } catch (err) {
      console.error('保存预设转账信息失败:', err);
      wx.showToast({ title: '保存失败', icon: 'error' });
    }
    wx.hideLoading();
  },

  // 地图选点
  onChooseLocation() {
    const { groupForm } = this.data;
    wx.chooseLocation({
      latitude: groupForm.locationLat || 22.5431,
      longitude: groupForm.locationLng || 113.9296,
      success: (res) => {
        this.setData({
          'groupForm.location': res.address,
          'groupForm.locationName': res.name,
          'groupForm.locationAddress': res.address,
          'groupForm.locationLat': res.latitude,
          'groupForm.locationLng': res.longitude,
        });
      },
      fail: (err) => {
        if (err.errMsg.indexOf('cancel') === -1) {
          console.error('选点失败:', err);
        }
      },
    });
  },

  // 日期选择
  onDateChange(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [`groupForm.${field}`]: e.detail.value });
  },

  // 上传图片
  async onUploadImage() {
    if (this.data.uploadedImages.length >= 6) {
      wx.showToast({ title: '最多上传6张图片', icon: 'none' });
      return;
    }
    try {
      const res = await wx.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
      });
      const tempFilePath = res.tempFilePaths[0];
      wx.showLoading({ title: '上传中...' });
      const cloudRes = await wx.cloud.uploadFile({
        cloudPath: `activities/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`,
        filePath: tempFilePath,
      });
      wx.hideLoading();
      this.setData({
        uploadedImages: [...this.data.uploadedImages, tempFilePath],
        imageFileIDs: [...this.data.imageFileIDs, cloudRes.fileID],
      });
    } catch (err) {
      wx.hideLoading();
      console.error('上传图片失败:', err);
    }
  },

  // 删除图片
  async onRemoveImage(e) {
    const index = e.currentTarget.dataset.index;
    const removedFileID = this.data.imageFileIDs[index];
    // 删除云存储文件
    if (removedFileID && removedFileID.startsWith('cloud://')) {
      try {
        await wx.cloud.deleteFile({ fileList: [removedFileID] });
      } catch (err) {
        console.error('删除云文件失败:', err);
      }
    }
    this.setData({
      uploadedImages: this.data.uploadedImages.filter((_, i) => i !== index),
      imageFileIDs: this.data.imageFileIDs.filter((_, i) => i !== index),
    });
  },

  // 获取表单数据
  getCurrentFormData() {
    const { groupForm, imageFileIDs, isEditing } = this.data;
    // 从完整地址中提取省市区作为 region
    const fullAddress = groupForm.locationAddress || groupForm.location || '';
    let region = '';
    if (fullAddress) {
      const parts = fullAddress.match(/(.+?省)?(.+?市)?(.+?[区县])?/);
      if (parts) {
        region = [parts[1], parts[2], parts[3]].filter(Boolean).join('');
      }
    }
    return {
      ...groupForm,
      type: 'group',
      location: fullAddress,
      region: region,
      currentMonths: isEditing ? (groupForm.currentMonths ?? 0) : 0,
      participants: isEditing ? (groupForm.participants ?? 0) : 0,
      targetMonths: Number(groupForm.targetMonths) || 0,
      images: imageFileIDs,
      status: 'active',
      styleIndex: Math.floor(Math.random() * 7),
      createdAt: db.serverDate(),
    };
  },

  // 发布
  async onPublish() {
    if (this.data.isSubmitting) return;

    const { groupForm } = this.data;

    // 必填校验
    if (!groupForm.title || !String(groupForm.title).trim()) {
      wx.showToast({ title: '请输入活动标题', icon: 'none' });
      return;
    }
    if (!groupForm.location || !String(groupForm.location).trim()) {
      wx.showToast({ title: '请选择活动地点', icon: 'none' });
      return;
    }
    if (!groupForm.targetMonths && groupForm.targetMonths !== 0) {
      wx.showToast({ title: '请输入目标张数', icon: 'none' });
      return;
    }
    if (!groupForm.groupPrice && groupForm.groupPrice !== 0) {
      wx.showToast({ title: '请输入自驾里程', icon: 'none' });
      return;
    }
    if (!groupForm.originalPrice && groupForm.originalPrice !== 0) {
      wx.showToast({ title: '请输入原定里程', icon: 'none' });
      return;
    }
    if (!groupForm.description || groupForm.description.trim().length < 12) {
      wx.showToast({ title: '详细描述至少12个字', icon: 'none' });
      return;
    }
    if (!groupForm.validFrom) {
      wx.showToast({ title: '请选择起始日期', icon: 'none' });
      return;
    }
    if (!groupForm.validUntil) {
      wx.showToast({ title: '请选择截止日期', icon: 'none' });
      return;
    }
    // 截止日期 ≤ 今天 且 活动状态为"进行中"时，不允许保存
    const todayStr = new Date().toISOString().slice(0, 10);
    if (groupForm.validUntil <= todayStr && !groupForm.isClosed) {
      wx.showToast({ title: '截止日期不能早于今天，请修改日期或将活动状态改为"已截止"', icon: 'none', duration: 2000 });
      return;
    }

    this.setData({ isSubmitting: true });

    try {
      const formData = this.getCurrentFormData();

      // 获取当前用户昵称
      const userInfo = wx.getStorageSync('userInfo') || {};
      const creatorName = userInfo.name || (userInfo.formData && userInfo.formData.name) || '';
      if (creatorName) {
        formData.creatorNickname = creatorName;
      }

      // 内容安全检测
      const secText = [formData.title, formData.description, formData.tips].filter(Boolean).join('\n');
      if (secText) {
        try {
          const secRes = await wx.cloud.callFunction({
            name: 'securityCheck',
            data: { type: 'text', content: secText },
          });
          if (secRes.result && (secRes.result.errcode === 87014 || secRes.result.errCode === 87014)) {
            wx.showToast({ title: '发布内容包含违规信息，请修改', icon: 'none' });
            this.setData({ isSubmitting: false });
            return;
          }
          if (secRes.result && secRes.result.errcode !== 0) {
            wx.showToast({ title: '安全检测异常(' + secRes.result.errcode + ')，请重试', icon: 'none' });
            this.setData({ isSubmitting: false });
            return;
          }
        } catch (e) {
          console.warn('[安全检测] 文本检测异常:', e);
        }
      }

      if (this.data.isEditing && this.data.editId) {
        // 编辑模式：走云函数（兼容管理员编辑他人活动）
        const { _id, _openid, createdAt, updatedAt, ...cleanFormData } = formData;
        const editRes = await wx.cloud.callFunction({
          name: 'updateActivity',
          data: { activityId: this.data.editId, data: cleanFormData },
        });
        if (!editRes.result || !editRes.result.success) {
          wx.showToast({ title: editRes.result?.msg || '保存失败', icon: 'error' });
          this.setData({ isSubmitting: false });
          return;
        }
      } else {
        // 新建
        await db.collection('activities').add({ data: formData });
      }

      this.setData({ showSuccessModal: true, isSubmitting: false });
    } catch (err) {
      console.error('发布失败:', err);
      wx.showToast({ title: '发布失败，请重试', icon: 'error' });
      this.setData({ isSubmitting: false });
    }
  },

  // 阻止冒泡
  stopPropagation() {},

  // 关闭成功弹窗
  onCloseSuccess() {
    this.setData({ showSuccessModal: false });
    wx.navigateBack();
  },
});
