const app = getApp();
const db = wx.cloud.database();
const cache = require('../../utils/cache');

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
    // 拼团表单
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
    // 转让表单
    transferForm: {
      title: '',
      price: '',
      originalPrice: '',
      parkingLot: '',
      parkingName: '',
      parkingAddress: '',
      parkingLat: 0,
      parkingLng: 0,
      validFrom: '',
      validUntil: '',
      description: '',
    },
    // 二手表单
    secondhandForm: {
      title: '',
      price: '',
      location: '',
      brand: '',
      condition: '9成新',
      purchaseDate: '',
      description: '',
    },
    // 招聘表单
    jobForm: {
      title: '',
      salary: '',
      jobType: '全职',
      location: '',
      requirements: '',
      benefits: '',
      workTime: '',
      description: '',
    },
  },

  types: ['group', 'transfer', 'secondhand', 'job'],
  typeLabels: ['拼团活动', '月卡转让', '闲置二手', '招聘信息'],

  async onLoad(options) {
    const isAdmin = await this.checkAdmin();
    const publishType = isAdmin ? 'group' : 'transfer';
    
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
      publishType,
      'transferForm.validFrom': today,
      'transferForm.validUntil': thirtyDaysLater,
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
      let publishType = editData.type || 'group';

      let groupForm = { ...this.data.groupForm };
      let transferForm = { ...this.data.transferForm };
      let secondhandForm = { ...this.data.secondhandForm };
      let jobForm = { ...this.data.jobForm };
      let uploadedImages = editData.images || [];
      let imageFileIDs = editData.images || [];

      if (publishType === 'transfer') {
        transferForm = {
          title: editData.title || '',
          price: editData.price || '',
          originalPrice: editData.originalPrice || '',
          parkingLot: editData.parkingLot || '',
          parkingName: editData.parkingName || '',
          parkingAddress: editData.parkingAddress || '',
          parkingLat: editData.parkingLat || 0,
          parkingLng: editData.parkingLng || 0,
          validFrom: editData.validFrom || '',
          validUntil: editData.validUntil || '',
          description: editData.description || '',
        };
      } else if (publishType === 'secondhand') {
        secondhandForm = {
          title: editData.title || '',
          price: editData.price || '',
          location: editData.location || '',
          brand: editData.brand || '',
          condition: editData.condition || '9成新',
          purchaseDate: editData.purchaseDate || '',
          description: editData.description || '',
        };
      } else if (publishType === 'job') {
        jobForm = {
          title: editData.title || '',
          salary: editData.salary || '',
          jobType: editData.jobType || '全职',
          location: editData.location || '',
          requirements: editData.requirements || '',
          benefits: editData.benefits || '',
          workTime: editData.workTime || '',
          description: editData.description || '',
        };
      } else {
        groupForm = {
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
          validFrom: editData.validFrom || '',
          validUntil: editData.validUntil || '',
        };
      }

      return {
        isEditing: true,
        editData,
        publishType,
        groupForm,
        transferForm,
        secondhandForm,
        jobForm,
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
    const { field, type } = e.currentTarget.dataset;
    let value = e.detail.value;
    // 描述和温馨提示限制 999 字
    if ((field === 'description' || field === 'tips') && value.length > 999) {
      value = value.slice(0, 999);
    }
    
    switch (type) {
      case 'group':
        this.setData({
          [`groupForm.${field}`]: value
        });
        break;
      case 'transfer':
        this.setData({
          [`transferForm.${field}`]: value
        });
        break;
      case 'secondhand':
        this.setData({
          [`secondhandForm.${field}`]: value
        });
        break;
      case 'job':
        this.setData({
          [`jobForm.${field}`]: value
        });
        break;
    }
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

  // 一键填写转账信息（从预设加载）
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
        wx.showToast({ title: '暂无预设转账信息', icon: 'none' });
      }
    } catch (err) {
      console.error('加载预设转账信息失败:', err);
      wx.showToast({ title: '加载失败', icon: 'error' });
    }
  },

  // 保存转账信息到预设
  async onSaveBankToPreset() {
    const { bankAccountName, bankCardNumber, bankName } = this.data.groupForm;
    if (!bankAccountName || !bankCardNumber || !bankName) {
      wx.showToast({ title: '请先填写完整的转账信息', icon: 'none' });
      return;
    }
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

  // 地图选点 - 停车场位置
  onChooseLocation() {
    const { publishType, transferForm, groupForm } = this.data;
    const isGroup = publishType === 'group';
    const currentLat = isGroup ? groupForm.locationLat : transferForm.parkingLat;
    const currentLng = isGroup ? groupForm.locationLng : transferForm.parkingLng;
    // 默认定位到深圳南山（如果没有已选坐标）
    const params = {
      latitude: currentLat || 22.5431,
      longitude: currentLng || 113.9296,
    };
    wx.chooseLocation({
      ...params,
      success: (res) => {
        const prefix = isGroup ? 'groupForm' : 'transferForm';
        const fieldMap = isGroup
          ? { name: 'locationName', address: 'locationAddress', lat: 'locationLat', lng: 'locationLng', full: 'location' }
          : { name: 'parkingName', address: 'parkingAddress', lat: 'parkingLat', lng: 'parkingLng', full: 'parkingLot' };
        this.setData({
          [`${prefix}.${fieldMap.full}`]: isGroup ? res.name : res.address,
          [`${prefix}.${fieldMap.name}`]: res.name,
          [`${prefix}.${fieldMap.address}`]: res.address,
          [`${prefix}.${fieldMap.lat}`]: res.latitude,
          [`${prefix}.${fieldMap.lng}`]: res.longitude,
        });
      },
      fail: (err) => {
        if (err.errMsg.indexOf('cancel') === -1) {
          console.error('选点失败:', err);
        }
      },
    });
  },

  // 日期选择 - 起止日期
  onDateChange(e) {
    const { field, type } = e.currentTarget.dataset;
    const value = e.detail.value;
    const prefix = type || 'transfer';
    this.setData({ [`${prefix}Form.${field}`]: value });
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

  // 获取当前表单数据
  getCurrentFormData() {
    const { publishType, groupForm, transferForm, secondhandForm, jobForm, imageFileIDs } = this.data;
    let formData = {};
    if (publishType === 'group') {
      // 从完整地址中提取省市区作为 region
      const fullAddress = groupForm.locationAddress || groupForm.location || '';
      let region = '';
      if (fullAddress) {
        const parts = fullAddress.match(/(.+?省)?(.+?市)?(.+?[区县])?/);
        if (parts) {
          region = [parts[1], parts[2], parts[3]].filter(Boolean).join('');
        }
      }
      formData = {
        ...groupForm,
        location: fullAddress,
        region: region,
        participants: this.data.isEditing ? (groupForm.participants ?? 0) : 0,
        targetMonths: Number(groupForm.targetMonths) || 0,
      };
    } else     if (publishType === 'transfer') {
      // 从完整地址中提取省市区作为 region
      const fullAddress = transferForm.parkingAddress || transferForm.parkingLot || '';
      // 地址格式通常为 "广东省深圳市南山区xxx"，取前三级
      let region = '';
      if (fullAddress) {
        const parts = fullAddress.match(/(.+?省)?(.+?市)?(.+?[区县])?/);
        if (parts) {
          region = [parts[1], parts[2], parts[3]].filter(Boolean).join('');
        }
      }
      formData = {
        ...transferForm,
        location: fullAddress,
        parkingLot: transferForm.parkingName || '',
        region: region,
      };
    } else if (publishType === 'secondhand') {
      formData = { ...secondhandForm };
    } else if (publishType === 'job') {
      formData = { ...jobForm, salary: jobForm.salary || '', category: jobForm.jobType };
    }
    return {
      ...formData,
      type: publishType,
      images: imageFileIDs,
      status: 'active',
      styleIndex: Math.floor(Math.random() * 7),
      createdAt: db.serverDate(),
    };
  },

  // 发布
  async onPublish() {
    if (this.data.isSubmitting) return;

    const { publishType, transferForm, groupForm } = this.data;

    // 拼团活动必填校验
    if (publishType === 'group') {
      if (!groupForm.title || !String(groupForm.title).trim()) {
        wx.showToast({ title: '请输入活动标题', icon: 'none' });
        return;
      }
      if (!groupForm.location || !String(groupForm.location).trim()) {
        wx.showToast({ title: '请选择活动地点', icon: 'none' });
        return;
      }
      if (!groupForm.targetMonths && groupForm.targetMonths !== 0) {
        wx.showToast({ title: '请输入目标月数', icon: 'none' });
        return;
      }
      if (!groupForm.groupPrice && groupForm.groupPrice !== 0) {
        wx.showToast({ title: '请输入拼团价', icon: 'none' });
        return;
      }
      if (!groupForm.originalPrice && groupForm.originalPrice !== 0) {
        wx.showToast({ title: '请输入原价', icon: 'none' });
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
    } else if (publishType === 'transfer') {
      if (!transferForm.title || !transferForm.title.trim()) {
        wx.showToast({ title: '请输入标题', icon: 'none' });
        return;
      }
      if (!transferForm.price || !transferForm.price.trim()) {
        wx.showToast({ title: '请输入转让价格', icon: 'none' });
        return;
      }
      if (!transferForm.parkingLot || !transferForm.parkingLot.trim()) {
        wx.showToast({ title: '请选择停车场位置', icon: 'none' });
        return;
      }
      if (!transferForm.validFrom) {
        wx.showToast({ title: '请选择起始日期', icon: 'none' });
        return;
      }
      if (!transferForm.validUntil) {
        wx.showToast({ title: '请选择截止日期', icon: 'none' });
        return;
      }
      if (!transferForm.description || transferForm.description.trim().length < 12) {
        wx.showToast({ title: '详细描述至少12个字', icon: 'none' });
        return;
      }
    } else {
      // 其他类型：至少校验标题
      const formData = this.getCurrentFormData();
      if (!formData.title || !formData.title.trim()) {
        wx.showToast({ title: '请输入标题', icon: 'none' });
        return;
      }
    }

    this.setData({ isSubmitting: true });

    try {
      const formData = this.getCurrentFormData();

      // 获取当前用户昵称
      const userInfo = wx.getStorageSync('userInfo') || {};
      if (userInfo.name) {
        formData.creatorNickname = userInfo.name;
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
