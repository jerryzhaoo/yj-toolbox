const app = getApp();
const db = wx.cloud.database();
const _ = db.command;
const privacy = require('../../utils/privacy');

Page({
  data: {
    activity: null,
    activityId: null,
    loading: true,
    isExpired: false,
    isAuthor: false,
    showSignUpModal: false,
    showSuccessModal: false,
    showExportConfirm: false,
    showExportResult: false,
    exportResultSuccess: true,
    exportErrorMsg: '',
    exportOnlyTransferred: false,
    exportFilePath: '',
    participants: [],
    signForm: { name: '', phone: '', carNumber: '', months: '', hasTransfer: false, voucherUrl: '', effectDate: '', needInvoice: false, companyName: '', invoiceType: '普票', taxNumber: '', email: '' },
    hasSignedUp: false,
    mySignUpId: null,
    targetMonths: 0,
    currentMonths: 0,
    progress: 0,
    location: '',
    monthlyPrice: 0,
    originalPrice: 0,
    startDate: '',
    currentUserId: null,
    isAdmin: false,
    showViewModal: false,
    viewParticipant: null,
    viewReadonly: true,
    viewSignForm: { name: '', phone: '', carNumber: '', months: '', hasTransfer: false, voucherUrl: '', effectDate: '', needInvoice: false, companyName: '', invoiceType: '普票', taxNumber: '', email: '' },
    viewParticipantId: null,
    transferredCount: 0,
    untransferredCount: 0,
    displayBankAccountName: '',
    displayBankCardNumber: '',
    displayBankName: '',
    focusedField: '',
    showPrivacyModal: false,
    privacyPurposes: [],
    pendingSave: null, // 保存回调，同意后执行
  },

  async onLoad(options) {
    if (options.id) {
      this.setData({ activityId: options.id });
      await this.loadActivity(options.id);
    }
  },

  onShow() {
    if (this.data.activityId) {
      this.loadActivity(this.data.activityId);
    }
  },

  async getOpenid() {
    try {
      const res = await wx.cloud.callFunction({ name: 'getOpenid' });
      return res.result.openid;
    } catch (e) {
      return null;
    }
  },

  async loadActivity(id) {
    try {
      const [docRes, openid] = await Promise.all([
        db.collection('activities').doc(id).get(),
        this.getOpenid()
      ]);
      const activity = docRes.data;
      const toDateStr = (v) => {
        if (!v) return '';
        if (typeof v === 'string') return v.slice(0, 10);
        try { return new Date(v).toISOString().slice(0, 10); } catch (e) { return String(v).slice(0, 10); }
      };
      const todayStr = new Date().toISOString().slice(0, 10);
      const dateExpired = activity.validUntil && toDateStr(activity.validUntil) <= todayStr;
      const isExpired = activity.isClosed || dateExpired;
      // 同步更新数据库，确保首页也能读到已截止
      if (dateExpired && !activity.isClosed) {
        wx.cloud.callFunction({ name: 'autoExpireActivity', data: { activityId: id } }).catch(() => {});
      }

      const tipsList = activity.tips
        ? activity.tips.split('\n').map(t => t.trim()).filter(Boolean)
        : [];

      const [partRes, adminRes] = await Promise.all([
        wx.cloud.callFunction({ name: 'getParticipants', data: { activityId: id } }),
        openid ? (() => {
          // 先查缓存
          const cached = app.getAdminCache(openid);
          if (cached) return Promise.resolve({ data: cached.isAdmin ? [{ role: cached.isSuperAdmin ? 'super' : 'admin' }] : [] });
          // 缓存未命中，查库
          return db.collection('admins').where({
            _openid: openid
          }).limit(1).get().then(async (r) => {
            if (r.data.length > 0) {
              app.setAdminCache(openid, { isAdmin: true, isSuperAdmin: r.data[0].role === 'super' });
              return r;
            }
            const r2 = await db.collection('admins').where({ openid: openid, activated: true }).limit(1).get();
            app.setAdminCache(openid, { isAdmin: r2.data.length > 0, isSuperAdmin: r2.data.length > 0 && r2.data[0].role === 'super' });
            return { data: r2.data };
          });
        })() : Promise.resolve({ data: [] })
      ]);
      const participantsData = (partRes.result && partRes.result.data) || [];
      const participants = participantsData.sort((a, b) => {
        if (!!a.hasTransfer !== !!b.hasTransfer) return a.hasTransfer ? 1 : -1;
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      });
      const voucherUrls = participants.map(p => p.voucherUrl).filter(Boolean);
      if (voucherUrls.length > 0) {
        try {
          const { result } = await wx.cloud.callFunction({
            name: 'getTempFileUrls',
            data: { fileList: voucherUrls }
          });
          if (result && result.fileList) {
            const urlMap = {};
            for (const item of result.fileList) {
              urlMap[item.fileID] = item.tempFileURL;
            }
            for (const p of participants) {
              if (p.voucherUrl && urlMap[p.voucherUrl]) {
                p._voucherTempUrl = urlMap[p.voucherUrl];
              }
            }
          }
        } catch (e) {
          console.warn('获取凭证临时URL失败:', e);
        }
      }
      const isAdmin = adminRes.data.length > 0;

      for (const p of participants) {
        const isOwn = p._openid === openid;
        if (!isAdmin && !isOwn) {
          if (p.name) {
            const n = p.name.trim();
            if (n.length <= 2) p._displayName = n[0] + '*';
            else p._displayName = n.slice(0, n.length - 2) + '**';
          }
          if (p.carNumber) {
            const c = p.carNumber.trim();
            if (c.length <= 3) p._displayCarNumber = c[0] + '**';
            else if (c.length <= 6) p._displayCarNumber = c.slice(0, 3) + '***';
            else p._displayCarNumber = c.slice(0, 3) + '***' + c.slice(6);
          }
        } else {
          p._displayName = p.name;
          p._displayCarNumber = p.carNumber;
        }
      }

      const currentMonths = participants.reduce((sum, p) => sum + (Number(p.months) || 0), 0);
      const targetMonths = activity.targetMonths || 0;
      const myRecord = participants.find(p => p._openid === openid);
      const transferredCount = participants.filter(p => p.hasTransfer).length;
      const untransferredCount = participants.length - transferredCount;
      let closeTimeText = '';
      if (activity.closeTime) {
        const d = new Date(activity.closeTime);
        closeTimeText = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      } else if (activity.validUntil) {
        closeTimeText = activity.validUntil;
      }

      this.setData({
        activity, isExpired, isAdmin,
        isAuthor: openid ? activity._openid === openid : false,
        currentUserId: openid, targetMonths,
        location: activity.location || '',
        monthlyPrice: activity.groupPrice || 0,
        originalPrice: activity.originalPrice || 0,
        startDate: activity.validFrom || '',
        tipsList, participants, currentMonths,
        progress: targetMonths ? Math.round((currentMonths / targetMonths) * 100) : 0,
        hasSignedUp: !!myRecord,
        mySignUpId: myRecord ? myRecord._id : null,
        transferredCount, untransferredCount, closeTimeText,
        displayBankAccountName: this.maskAccountName(activity.bankAccountName),
        displayBankCardNumber: this.maskCardNumber(activity.bankCardNumber),
        displayBankName: this.maskBankName(activity.bankName),
      });
    } catch (err) {
      console.error('加载活动详情失败:', err);
    }
    this.setData({ loading: false });
    try {
      setTimeout(() => {
        this.generateShareImage().then(path => {
          if (path) this.setData({ _shareImage: path });
        }).catch(err => {
          console.warn('生成分享图失败:', err);
        });
      }, 500);
    } catch (e) {
      console.warn('启动分享图生成失败:', e);
    }
  },

  async loadParticipants(activityId) {
    try {
      const res = await wx.cloud.callFunction({ name: 'getParticipants', data: { activityId } });
      const participants = ((res.result && res.result.data) || []).sort((a, b) => {
        if (!!a.hasTransfer !== !!b.hasTransfer) return a.hasTransfer ? 1 : -1;
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      });
      const voucherUrls = participants.map(p => p.voucherUrl).filter(Boolean);
      if (voucherUrls.length > 0) {
        try {
          const { result } = await wx.cloud.callFunction({
            name: 'getTempFileUrls',
            data: { fileList: voucherUrls }
          });
          if (result && result.fileList) {
            const urlMap = {};
            for (const item of result.fileList) {
              urlMap[item.fileID] = item.tempFileURL;
            }
            for (const p of participants) {
              if (p.voucherUrl && urlMap[p.voucherUrl]) {
                p._voucherTempUrl = urlMap[p.voucherUrl];
              }
            }
          }
        } catch (e) {
          console.warn('获取凭证临时URL失败:', e);
        }
      }
      const currentMonths = participants.reduce((sum, p) => sum + (Number(p.months) || 0), 0);
      const targetMonths = this.data.targetMonths;
      const currentUserId = this.data.currentUserId;
      const myRecord = participants.find(p => p._openid === currentUserId);
      const transferredCount = participants.filter(p => p.hasTransfer).length;
      const untransferredCount = participants.length - transferredCount;
      this.setData({ 
        participants, currentMonths,
        progress: targetMonths ? Math.round((currentMonths / targetMonths) * 100) : 0,
        hasSignedUp: !!myRecord,
        mySignUpId: myRecord ? myRecord._id : null,
        transferredCount, untransferredCount,
      });
    } catch (err) {
      console.error('加载参与者失败:', err);
    }
  },

  onBack() { wx.navigateBack(); },

  async onShowSignUp() {
    if (this.data.isExpired) return;
    const { participants, currentUserId } = this.data;
    const myRecord = participants.find(p => p._openid === currentUserId);
    
    let presetInvoice = { effectDate: '', needInvoice: false, companyName: '', invoiceType: '普票', taxNumber: '', email: '' };
    try {
      if (currentUserId) {
        const userRes = await db.collection('users').where({ _openid: currentUserId }).limit(1).get();
        if (userRes.data.length > 0) {
          const user = userRes.data[0];
          presetInvoice = {
            effectDate: '',
            needInvoice: !!user.needInvoice,
            companyName: user.companyName || '',
            invoiceType: user.invoiceType || '普票',
            taxNumber: user.taxNumber || '',
            email: user.email || '',
          };
        }
      }
    } catch (e) {}

    if (myRecord) {
      wx.showModal({
        title: '您已报名',
        content: '您已报名此活动，本次打开将修改您的报名信息。',
        confirmText: '修改信息',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            this.setData({
              showSignUpModal: true,
              signForm: {
                name: myRecord.name || '',
                phone: myRecord.phone || '',
                carNumber: myRecord.carNumber || '',
                months: String(myRecord.months || ''),
                hasTransfer: !!myRecord.hasTransfer,
                voucherUrl: myRecord.voucherUrl || '',
                effectDate: myRecord.effectDate || '',
                needInvoice: myRecord.needInvoice !== undefined ? !!myRecord.needInvoice : presetInvoice.needInvoice,
                companyName: myRecord.companyName || presetInvoice.companyName,
                invoiceType: myRecord.invoiceType || presetInvoice.invoiceType,
                taxNumber: myRecord.taxNumber || presetInvoice.taxNumber,
                email: myRecord.email || presetInvoice.email,
              },
            });
          }
        },
      });
    } else {
      this.setData({
        showSignUpModal: true,
        signForm: {
          name: '', phone: '', carNumber: '', months: '',
          hasTransfer: false, voucherUrl: '',
          effectDate: '',
          needInvoice: false,
          companyName: '', invoiceType: '普票', taxNumber: '', email: '',
        },
      });
    }
  },

  onCloseSignUp() { this.setData({ showSignUpModal: false }); },
  onSignInput(e) {
    const { field } = e.currentTarget.dataset;
    let value = e.detail.value;
    // 张数只能输入数字，且至少为1
    if (field === 'months') {
      value = value.replace(/\D/g, '');
      if (value !== '' && Number(value) < 1) value = '1';
    }
    this.setData({ [`signForm.${field}`]: value });
  },
  onClearSignInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [`signForm.${field}`]: '' });
  },
  onFocus(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ focusedField: field });
  },
  onBlur() { this.setData({ focusedField: '' }); },
  onSetEffectDefer() { this.setData({ 'signForm.effectDate': '' }); },
  onEffectDateChange(e) { this.setData({ 'signForm.effectDate': e.detail.value }); },
  onToggleInvoice() { this.setData({ 'signForm.needInvoice': !this.data.signForm.needInvoice }); },
  onSetInvoiceType(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ 'signForm.invoiceType': type });
  },

  async onFillInvoiceFromPreset() {
    try {
      const openid = this.data.currentUserId;
      if (!openid) { wx.showToast({ title: '获取用户信息失败', icon: 'none' }); return; }
      const userRes = await db.collection('users').where({ _openid: openid }).limit(1).get();
      if (userRes.data.length > 0) {
        const u = userRes.data[0];
        this.setData({
          'signForm.name': u.realName || u.name || '',
          'signForm.phone': u.phone || '',
          'signForm.carNumber': u.carNumber || '',
          'signForm.needInvoice': !!u.needInvoice,
          'signForm.companyName': u.companyName || '',
          'signForm.invoiceType': u.invoiceType || '普票',
          'signForm.taxNumber': u.taxNumber || '',
          'signForm.email': u.email || '',
        });
        wx.showToast({ title: '已填写', icon: 'success' });
      } else {
        wx.showToast({ title: '暂无预设信息', icon: 'none' });
      }
    } catch (err) {
      console.error('加载预设信息失败:', err);
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
      pending(); // 执行待保存操作
    }
  },

  // 隐私授权 - 不同意
  onPrivacyDisagree() {
    this.setData({ showPrivacyModal: false, pendingSave: null });
    wx.showToast({ title: '已取消保存', icon: 'none' });
  },

  async onSaveInvoiceToPreset() {
    // 检查隐私授权
    if (!privacy.hasAgreed()) {
      const purposes = privacy.getPurposesByKeys(['realName', 'phone', 'carNumber', 'invoice']);
      this.setData({
        privacyPurposes: purposes,
        showPrivacyModal: true,
        pendingSave: () => this._doSaveInvoiceToPreset(),
      });
      return;
    }
    await this._doSaveInvoiceToPreset();
  },

  async _doSaveInvoiceToPreset() {
    const { name, phone, carNumber, needInvoice, companyName, invoiceType, taxNumber, email } = this.data.signForm;
    wx.showLoading({ title: '保存中...' });
    try {
      const openid = this.data.currentUserId;
      if (!openid) { wx.hideLoading(); return; }
      const userRes = await db.collection('users').where({ _openid: openid }).limit(1).get();
      const saveData = {
        realName: name.trim(),
        phone: phone.trim(),
        carNumber: carNumber.trim().toUpperCase(),
        needInvoice: !!needInvoice,
        companyName: needInvoice ? companyName.trim() : '',
        invoiceType: needInvoice ? invoiceType : '',
        taxNumber: needInvoice ? taxNumber.trim() : '',
        email: needInvoice ? email.trim() : '',
        updatedAt: db.serverDate(),
      };
      if (userRes.data.length > 0) {
        await db.collection('users').doc(userRes.data[0]._id).update({ data: saveData });
      } else {
        await db.collection('users').add({ data: { ...saveData, _openid: openid, createdAt: db.serverDate() } });
      }
      wx.hideLoading();
      wx.showToast({ title: '已保存到预设', icon: 'success' });
    } catch (err) {
      console.error('保存预设信息失败:', err);
      wx.hideLoading();
      wx.showToast({ title: '保存失败', icon: 'error' });
    }
  },

  onUploadVoucher() {
    wx.chooseImage({
      count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0];
        wx.compressImage({
          src: tempFilePath, quality: 70, compressedWidth: 800,
          success: (compressRes) => {
            wx.cloud.uploadFile({
              cloudPath: `vouchers/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`,
              filePath: compressRes.tempFilePath,
              success: (uploadRes) => { this.setData({ 'signForm.voucherUrl': uploadRes.fileID }); },
              fail: () => { wx.showToast({ title: '上传失败', icon: 'error' }); }
            });
          },
          fail: () => {
            wx.cloud.uploadFile({
              cloudPath: `vouchers/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`,
              filePath: tempFilePath,
              success: (uploadRes) => { this.setData({ 'signForm.voucherUrl': uploadRes.fileID }); },
              fail: () => { wx.showToast({ title: '上传失败', icon: 'error' }); }
            });
          }
        });
      }
    });
  },
  onRemoveVoucher() { this.setData({ 'signForm.voucherUrl': '' }); },
  onPreviewVoucher(e) { const url = e.currentTarget.dataset.url; wx.previewImage({ urls: [url] }); },
  stopPropagation() {},

  async onSubmitSignUp() {
    const { name, phone, carNumber, months, hasTransfer, voucherUrl, effectDate, needInvoice, companyName, invoiceType, taxNumber, email } = this.data.signForm;
    if (!name || name.trim().length < 2) { wx.showToast({ title: '请输入车主姓名（需与车牌绑定）', icon: 'none', duration: 2000 }); return; }
    if (!phone || !phone.trim()) { wx.showToast({ title: '请输入手机号', icon: 'none' }); return; }
    if (!carNumber || !carNumber.trim()) { wx.showToast({ title: '请输入车牌号', icon: 'none' }); return; }
    if (!months || Number(months) < 1) { wx.showToast({ title: '请调整张数（至少1张）', icon: 'none' }); return; }
    if (hasTransfer && !voucherUrl) { wx.showToast({ title: '请上传签到凭证', icon: 'none' }); return; }
    if (needInvoice) {
      if (!companyName || !companyName.trim()) { wx.showToast({ title: '请输入公司名称', icon: 'none' }); return; }
      if (!email || !email.trim()) { wx.showToast({ title: '请输入接收邮箱', icon: 'none' }); return; }
    }
    try {
      const { mySignUpId, currentUserId, activityId } = this.data;
      const payload = {
        name: name.trim(), phone: phone.trim(),
        carNumber: carNumber.trim().toUpperCase(), months: Number(months),
        hasTransfer: !!hasTransfer, voucherUrl: voucherUrl || '',
        effectDate: effectDate || '', needInvoice: !!needInvoice,
        companyName: needInvoice ? companyName.trim() : '',
        invoiceType: needInvoice ? invoiceType : '',
        taxNumber: needInvoice ? taxNumber.trim() : '',
        email: needInvoice ? email.trim() : '',
      };
      let signUpId = mySignUpId;
      let monthsDiff = Number(months); // 新增时diff为正数

      if (mySignUpId) {
        // 更新已有记录
        await db.collection('participants').doc(mySignUpId).update({
          data: { ...payload, modifiedBy: currentUserId, updatedAt: db.serverDate() },
        });
        // 增量更新currentMonths（新张数 - 旧张数）
        monthsDiff = Number(months) - (this.data.participants.find(p => p._id === mySignUpId)?.months || 0);
      } else {
        // 实时检查是否已报名，防止重复添加
        const existRes = await db.collection('participants').where({
          activityId,
          _openid: currentUserId,
        }).limit(1).get();
        if (existRes.data && existRes.data.length > 0) {
          const existId = existRes.data[0]._id;
          monthsDiff = Number(months) - (existRes.data[0].months || 0);
          await db.collection('participants').doc(existId).update({
            data: { ...payload, modifiedBy: currentUserId, updatedAt: db.serverDate() },
          });
          signUpId = existId;
          this.setData({ mySignUpId: existId });
        } else {
          const addRes = await db.collection('participants').add({
            data: { ...payload, activityId, createdAt: db.serverDate() },
          });
          signUpId = addRes._id;
          this.setData({ mySignUpId: signUpId });
        }
      }

      // 增量更新活动报名张数
      if (monthsDiff !== 0) {
        try {
          await db.collection('activities').doc(activityId).update({
            data: { currentMonths: db.command.inc(monthsDiff) },
          });
        } catch (e) {
          console.warn('更新活动报名数失败:', e);
        }
      }

      this.setData({ showSignUpModal: false, showSuccessModal: true });
      this.loadActivity(this.data.activityId);
    } catch (err) {
      console.error('报名失败:', err);
      wx.showToast({ title: '报名失败', icon: 'error' });
    }
  },

  onCancelSignUp() {
    wx.showModal({
      title: '确认取消',
      content: '确定要取消报名吗？取消后您的报名记录将被删除。',
      success: async (res) => {
        if (res.confirm) {
          try {
            const myRecord = this.data.participants.find(p => p._id === this.data.mySignUpId);
            const monthsToDec = myRecord ? Number(myRecord.months) || 0 : 0;
            await db.collection('participants').doc(this.data.mySignUpId).remove();
            if (monthsToDec > 0) {
              await db.collection('activities').doc(this.data.activityId).update({
                data: { currentMonths: db.command.inc(-monthsToDec) },
              });
            }
            wx.showToast({ title: '已取消报名', icon: 'success' });
            this.loadActivity(this.data.activityId);
          } catch (err) {
            console.error('取消报名失败:', err);
            wx.showToast({ title: '操作失败', icon: 'error' });
          }
        }
      }
    });
  },

  maskCarNumber(num, isOwn = false) {
    if (isOwn || this.data.isAdmin) return num;
    if (!num) return '';
    return '****';
  },
  maskAccountName(name) {
    if (!name) return '';
    name = name.trim();
    if (name.length <= 2) return name[0] + '*';
    return name.slice(0, name.length - 2) + '**';
  },
  maskCardNumber(num) {
    if (!num) return '';
    const s = num.replace(/\s/g, '');
    if (s.length <= 8) return s.slice(0, 4) + '****';
    return s.slice(0, 4) + '****' + s.slice(-4);
  },
  maskBankName(name) {
    if (!name) return '';
    name = name.trim();
    if (name.length <= 6) return '******';
    return name.slice(0, name.length - 6) + '******';
  },
  onCopyBankText(e) {
    const field = e.currentTarget.dataset.field;
    const activity = this.data.activity;
    if (!activity) return;
    let text = '';
    if (field === 'bankAccountName') text = activity.bankAccountName || '';
    else if (field === 'bankCardNumber') text = activity.bankCardNumber || '';
    else if (field === 'bankName') text = activity.bankName || '';
    if (!text) { wx.showToast({ title: '暂无信息', icon: 'none' }); return; }
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: '已复制', icon: 'success' }),
    });
  },

  onViewUploadVoucher() {
    wx.chooseImage({
      count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0];
        wx.compressImage({
          src: tempFilePath, quality: 70, compressedWidth: 800,
          success: (compressRes) => {
            wx.cloud.uploadFile({
              cloudPath: `vouchers/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`,
              filePath: compressRes.tempFilePath,
              success: (uploadRes) => { this.setData({ 'viewSignForm.voucherUrl': uploadRes.fileID }); },
              fail: () => { wx.showToast({ title: '上传失败', icon: 'error' }); }
            });
          },
          fail: () => {
            wx.cloud.uploadFile({
              cloudPath: `vouchers/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`,
              filePath: tempFilePath,
              success: (uploadRes) => { this.setData({ 'viewSignForm.voucherUrl': uploadRes.fileID }); },
              fail: () => { wx.showToast({ title: '上传失败', icon: 'error' }); }
            });
          }
        });
      }
    });
  },
  onViewRemoveVoucher() { this.setData({ 'viewSignForm.voucherUrl': '' }); },

  onViewParticipant(e) {
    const item = e.currentTarget.dataset.item;
    this.setData({
      showViewModal: true, viewParticipant: item, viewParticipantId: item._id,
      viewReadonly: true, _originalVoucherUrl: item.voucherUrl || '',
      viewSignForm: {
        name: item.name || '', phone: item.phone || '', carNumber: item.carNumber || '',
        months: String(item.months || ''), hasTransfer: !!item.hasTransfer,
        voucherUrl: item._voucherTempUrl || item.voucherUrl || '',
        effectDate: item.effectDate || '', needInvoice: !!item.needInvoice,
        companyName: item.companyName || '', invoiceType: item.invoiceType || '普票',
        taxNumber: item.taxNumber || '', email: item.email || '',
      }
    });
  },
  onCloseViewModal() { this.setData({ showViewModal: false, viewParticipant: null }); },
  onToggleEdit() { this.setData({ viewReadonly: !this.data.viewReadonly }); },
  onViewSignInput(e) {
    const { field } = e.currentTarget.dataset;
    let value = e.detail.value;
    // 张数只能输入数字，且至少为1
    if (field === 'months') {
      value = value.replace(/\D/g, '');
      if (value !== '' && Number(value) < 1) value = '1';
    }
    this.setData({ [`viewSignForm.${field}`]: value });
  },
  onClearViewSignInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [`viewSignForm.${field}`]: '' });
  },
  onViewSetEffectDefer() { this.setData({ 'viewSignForm.effectDate': '' }); },
  onViewEffectDateChange(e) { this.setData({ 'viewSignForm.effectDate': e.detail.value }); },
  onViewToggleInvoice() { this.setData({ 'viewSignForm.needInvoice': !this.data.viewSignForm.needInvoice }); },
  onViewSetInvoiceType(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ 'viewSignForm.invoiceType': type });
  },

  async onSubmitViewEdit() {
    const { name, phone, carNumber, months, hasTransfer, voucherUrl, effectDate, needInvoice, companyName, invoiceType, taxNumber, email } = this.data.viewSignForm;
    if (!name || name.trim().length < 2) { wx.showToast({ title: '请输入车主姓名（需与车牌绑定）', icon: 'none', duration: 2000 }); return; }
    if (!phone || !phone.trim()) { wx.showToast({ title: '请输入手机号', icon: 'none' }); return; }
    if (!carNumber || !carNumber.trim()) { wx.showToast({ title: '请输入车牌号', icon: 'none' }); return; }
    if (!months || Number(months) < 1) { wx.showToast({ title: '请调整张数（至少1张）', icon: 'none' }); return; }
    if (hasTransfer && !voucherUrl) { wx.showToast({ title: '请上传签到凭证', icon: 'none' }); return; }
    if (needInvoice) {
      if (!companyName || !companyName.trim()) { wx.showToast({ title: '请输入公司名称', icon: 'none' }); return; }
      if (!taxNumber || !taxNumber.trim()) { wx.showToast({ title: '请输入税号', icon: 'none' }); return; }
      if (!email || !email.trim()) { wx.showToast({ title: '请输入接收邮箱', icon: 'none' }); return; }
    }
    try {
      const pid = this.data.viewParticipantId;
      if (!pid) { wx.showToast({ title: '保存失败：找不到参与者', icon: 'error' }); return; }
      const finalVoucherUrl = voucherUrl && !voucherUrl.startsWith('cloud://') ? (this.data._originalVoucherUrl || voucherUrl) : (voucherUrl || '');
      const payload = {
        name: name.trim(), phone: phone.trim(),
        carNumber: carNumber.trim().toUpperCase(), months: Number(months),
        hasTransfer: !!hasTransfer, voucherUrl: finalVoucherUrl,
        effectDate: effectDate || '', needInvoice: !!needInvoice,
        companyName: needInvoice ? companyName.trim() : '',
        invoiceType: needInvoice ? invoiceType : '',
        taxNumber: needInvoice ? taxNumber.trim() : '',
        email: needInvoice ? email.trim() : '',
        modifiedBy: this.data.currentUserId,
      };
      const { result } = await wx.cloud.callFunction({
        name: 'updateParticipant',
        data: { participantId: pid, data: payload }
      });
      if (!result || !result.success) { wx.showToast({ title: result?.msg || '保存失败', icon: 'error' }); return; }
      wx.showToast({ title: '保存成功', icon: 'success' });
      this.setData({ showViewModal: false, viewParticipant: null });
      this.loadActivity(this.data.activityId);
    } catch (err) {
      console.error('保存失败:', err);
      wx.showToast({ title: '保存失败', icon: 'error' });
    }
  },

  _lastRefreshTime: 0,
  onRefreshParticipants() {
    const now = Date.now();
    if (now - this._lastRefreshTime < 5000) {
      wx.showToast({ title: '刷新中...', icon: 'loading', duration: 1000 });
      return;
    }
    this._lastRefreshTime = now;
    wx.showToast({ title: '刷新中...', icon: 'loading', duration: 1000 });
    this.loadActivity(this.data.activityId);
  },

  onDeleteParticipant(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除该用户的报名信息吗？删除后不可恢复。',
      success: async (res) => {
        if (res.confirm) {
          try {
            const delRes = await wx.cloud.callFunction({
              name: 'deleteParticipant',
              data: { participantId: id },
            });
            if (!delRes.result || !delRes.result.success) {
              wx.showToast({ title: delRes.result?.msg || '删除失败', icon: 'error' });
              return;
            }
            wx.showToast({ title: '已删除', icon: 'success' });
            this.loadActivity(this.data.activityId);
          } catch (err) {
            console.error('删除失败:', err);
            wx.showToast({ title: '删除失败', icon: 'error' });
          }
        }
      }
    });
  },

  onCloseSuccess() { this.setData({ showSuccessModal: false }); },

  // 签到通知
  async onSubscribeTransferRemind() {
    const TEMPLATE_ID = 'OtGg5Rl3jazsLotI0NKepVAs-xMDRdY47uFWBpd4fDg';
    try {
      const res = await wx.requestSubscribeMessage({
        tmplIds: [TEMPLATE_ID],
      });
      if (res[TEMPLATE_ID] === 'accept') {
        // 保存订阅记录
        try {
          await db.collection('subscribers').add({
            data: {
              activityId: this.data.activityId,
              templateId: TEMPLATE_ID,
              createdAt: db.serverDate(),
            }
          });
        } catch (e) { console.warn('保存订阅记录失败:', e); }
        wx.showToast({ title: '已开启提醒', icon: 'success' });
      } else {
        wx.showToast({ title: '取消订阅，别忘了签到', icon: 'none' });
      }
    } catch (err) {
      console.error('订阅消息失败:', err);
      wx.showToast({ title: '订阅失败', icon: 'none' });
    }
    this.setData({ showSuccessModal: false });
  },

  // 管理员一键提醒签到
  async onRemindTransfer() {
    wx.showModal({
      title: '提醒签到',
      content: `将向 ${this.data.untransferredCount} 位未签到用户发送订阅消息提醒，确认发送？`,
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '发送中...' });
          try {
            const { result } = await wx.cloud.callFunction({
              name: 'sendTransferReminder',
              data: {
                activityId: this.data.activityId,
                activityTitle: this.data.activity?.title || '报名活动',
                monthlyPrice: this.data.monthlyPrice || 0,
              }
            });
            wx.hideLoading();
            if (result && result.success) {
              wx.showToast({ title: `已提醒 ${result.sent} 人`, icon: 'success' });
            } else {
              wx.showToast({ title: result?.msg || '发送失败', icon: 'error' });
            }
          } catch (err) {
            wx.hideLoading();
            console.error('提醒转账失败:', err);
            wx.showToast({ title: '发送失败', icon: 'error' });
          }
        }
      }
    });
  },

  onShowExportConfirm() { this.setData({ showExportConfirm: true }); },
  onToggleExportFilter() { this.setData({ exportOnlyTransferred: !this.data.exportOnlyTransferred }); },
  onCloseExportConfirm() { this.setData({ showExportConfirm: false }); },

  onConfirmExport() {
    wx.showLoading({ title: '正在生成...' });
    const activityTitle = (this.data.activity && this.data.activity.title) || '活动';
    const monthlyPrice = this.data.monthlyPrice || 0;
    const onlyTransferred = this.data.exportOnlyTransferred;

    let participants = this.data.participants || [];
    if (onlyTransferred) {
      participants = participants.filter(p => p.hasTransfer);
    }

    const price = Number(monthlyPrice) || 0;

    // 导出列按"月卡在职证明"模板排列，并在表头前加 3 行抬头文本
    const headerRows = [
      'XXX公司',
      '在职证明',
      '兹证明以下人员均为本单位正式员工，烦请贵司协助办理停车月卡团购事宜',
    ];
    const colHeader = '序号,普通月卡类型（9折/85折）,车牌,姓名,车主电话,楼栋号,团购月数（个）,生效日期（月卡有效期内顺延，新办请填写日期）,备注,应付金额,凭证链接';
    let csv = '\uFEFF' + headerRows.map(t => `${t},,,,,,,,,,`).join('\n') + '\n' + colHeader + '\n';

    let totalMonths = 0;
    let totalAmount = 0;
    participants.forEach((p, i) => {
      const months = Number(p.months) || 0;
      const amount = months * price;
      totalMonths += months;
      totalAmount += amount;
      let invoice = '';
      if (p.needInvoice) {
        invoice = `发票:${p.invoiceType || ''};公司:${p.companyName || ''};税号:${p.taxNumber || ''};邮箱:${p.email || ''}`;
      }
      const link = p._voucherTempUrl || p.voucherUrl || '';
      const esc = (v) => String(v || '').replace(/,/g, '，');
      csv += `${i + 1},普通月卡（85折）,${esc(p.carNumber)},${esc(p.name)},${esc(p.phone)},,${months},${esc(p.effectDate || '顺延')},${esc(invoice)},${amount.toFixed(2)},${link}\n`;
    });

    // 底部：合计、优惠说明、公章、日期
    const empty11 = ',,,,,,,,,,';
    csv += `合计,,,,,,${totalMonths},,,${totalAmount.toFixed(2)},\n`;
    csv += `注：团购月卡优惠（600元月卡）${empty11}\n`;
    csv += `1. 同一企业或单位一次性购买月卡20张（含）以上的给予9折优惠，即单张月卡540元；${empty11}\n`;
    csv += `2. 同一企业或单位一次性购买40张（含）以上的给予85折优惠，即单张月卡510元。${empty11}\n`;
    csv += `3. 办理需一次性付款，需提供参与人的在司证明并加盖公章。（优惠月卡不予退费）${empty11}\n`;
    csv += `${empty11}\n`;
    csv += `${empty11}\n`;
    csv += `${empty11.substring(0, empty11.length - 1)}XXX公司\n`;
    csv += `${empty11.substring(0, empty11.length - 1)}（单位公章）\n`;
    csv += `${empty11.substring(0, empty11.length - 1)}日期：2024年X月X日\n`;

    const fileName = `${activityTitle}_报名表_${Date.now()}.csv`;
    const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`;
    wx.getFileSystemManager().writeFileSync(filePath, csv, 'utf8');

    wx.hideLoading();
    this.setData({ showExportConfirm: false, showExportResult: true, exportResultSuccess: true, exportErrorMsg: '', exportFilePath: filePath });
  },

  onOpenFile() {
    const filePath = this.data.exportFilePath;
    if (!filePath) { wx.showToast({ title: '文件不存在', icon: 'none' }); return; }
    wx.openDocument({ filePath, showMenu: true, success: () => wx.showToast({ title: '文件已打开', icon: 'success' }), fail: () => wx.showToast({ title: '打开文件失败', icon: 'error' }) });
  },

  onOpenAndClose() {
    const filePath = this.data.exportFilePath;
    if (!filePath) { wx.showToast({ title: '文件不存在', icon: 'none' }); return; }
    this.setData({ showExportResult: false });
    wx.shareFileMessage({ filePath });
  },

  onCloseExportResult() { this.setData({ showExportResult: false }); },

  onEdit() {
    wx.navigateTo({ url: `/pages/create/index?edit=1&id=${this.data.activityId}` });
  },

  getCardStyle(index) {
    const gradients = [
      'linear-gradient(135deg, #60A5FA, #22D3EE)',
      'linear-gradient(135deg, #A78BFA, #F472B6)',
      'linear-gradient(135deg, #FB923C, #F87171)',
      'linear-gradient(135deg, #4ADE80, #34D399)',
      'linear-gradient(135deg, #818CF8, #60A5FA)',
      'linear-gradient(135deg, #FB7185, #F472B6)',
      'linear-gradient(135deg, #60A5FA, #3B82F6)',
    ];
    return gradients[index % gradients.length];
  },

  // 生成分享缩略图 (500x360, 紧凑布局)
  async generateShareImage() {
    try {
      const activity = this.data.activity || {};
      const canvasW = 500, canvasH = 360; // 减小高度，减少空白
      const dpr = wx.getDeviceInfo().pixelRatio;
      const ctx = wx.createCanvasContext('shareCardCanvas');
      if (!ctx) { console.warn('创建canvas context失败'); return ''; }
      const R = 20;

      const gradients = [
        ['#8B5CF6','#EC4899','#F472B6'],
        ['#3B82F6','#06B6D4','#22D3EE'],
        ['#F59E0B','#EF4444','#FB923C'],
        ['#10B981','#06B6D4','#34D399'],
        ['#6366F1','#A855F7','#C084FC'],
        ['#EC4899','#F43F5E','#FB7185'],
        ['#14B8A6','#10B981','#34D399'],
      ];
      const ci = Math.floor(Math.random() * gradients.length);
      const colors = gradients[ci];
      const headerH = 165; // 稍微减小头部高度

      // 圆角背景 + 渐变
      const fullGrd = ctx.createLinearGradient(0, 0, 0, canvasH);
      fullGrd.addColorStop(0, colors[0]);
      fullGrd.addColorStop(0.35, colors[1]);
      fullGrd.addColorStop(0.5, colors[2]);
      fullGrd.addColorStop(0.5, '#ffffff');
      fullGrd.addColorStop(1, '#ffffff');
      this.roundRect(ctx, 0, 0, canvasW, canvasH, R);
      ctx.setFillStyle(fullGrd);
      ctx.fill();

      // 下半部分背景（白色）
      ctx.beginPath();
      ctx.rect(0, headerH, canvasW, canvasH - headerH);
      ctx.setFillStyle('rgba(255,255,255,0.92)');
      ctx.fill();

      // 装饰圆
      ctx.setFillStyle('rgba(255,255,255,0.1)');
      ctx.beginPath(); ctx.arc(canvasW - 70, 50, 45, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(canvasW - 120, headerH - 18, 30, 0, Math.PI * 2); ctx.fill();

      // 地点
      const loc = activity.location || '';
      ctx.setFillStyle('rgba(255,255,255,0.85)');
      ctx.setFontSize(13);
      ctx.setTextAlign('left');
      ctx.setTextBaseline('top');
      ctx.fillText(loc, 20, 16);

      // 标题
      const title = activity.title || '报名活动';
      ctx.setFillStyle('#ffffff');
      ctx.setFontSize(22);
      let dt = title;
      if (dt.length > 18) dt = dt.slice(0, 17) + '…';
      ctx.fillText(dt, 20, 44);

      // 进度条
      const currentMonths = this.data.currentMonths || 0;
      const targetMonths = activity.targetMonths || 0;
      const pct = targetMonths > 0 ? currentMonths / targetMonths : 0;
      const barY = 95, barH = 14, barW = 360;
      ctx.setFillStyle('rgba(255,255,255,0.3)');
      this.roundRect(ctx, 20, barY, barW, barH, barH / 2);
      ctx.fill();
      ctx.setFillStyle('#ffffff');
      this.roundRect(ctx, 20, barY, barW * Math.min(pct, 1), barH, barH / 2);
      ctx.fill();

      // 百分比徽章
      const pctText = `${Math.round(pct * 100)}%`;
      const badgeX = 20 + barW + 10;
      ctx.setFillStyle('rgba(0,0,0,0.12)');
      this.roundRect(ctx, badgeX, barY + (barH - 22) / 2, 52, 22, 11);
      ctx.fill();
      ctx.setFillStyle('#ffffff');
      ctx.setFontSize(13);
      ctx.setTextAlign('center');
      ctx.setTextBaseline('middle');
      ctx.fillText(pctText, badgeX + 26, barY + barH / 2);

      // 价格区域 - 紧凑布局
      const priceTop = headerH + 16;
      const groupPrice = activity.groupPrice || 0;
      const originalPrice = activity.originalPrice || 0;
      const priceStr = `自驾${groupPrice}km`;
      ctx.setFillStyle('#F97316');
      ctx.setFontSize(34);
      ctx.setTextAlign('left');
      ctx.setTextBaseline('top');
      ctx.fillText(priceStr, 20, priceTop);

      if (originalPrice > groupPrice) {
        const origStr = `原定${originalPrice}km`;
        ctx.setFillStyle('#9CA3AF');
        ctx.setFontSize(16);
        const ox = 20 + priceStr.length * 19;
        ctx.fillText(origStr, ox, priceTop + 8);
        // 删除线
        ctx.beginPath();
        ctx.setStrokeStyle('#9CA3AF');
        ctx.setLineWidth(1.5);
        ctx.moveTo(ox, priceTop + 20);
        ctx.lineTo(ox + origStr.length * 10, priceTop + 20);
        ctx.stroke();
        // 省钱标签
        ctx.setFillStyle('#F97316');
        ctx.setFontSize(14);
        ctx.fillText(`多${originalPrice - groupPrice}km`, ox + origStr.length * 10 + 10, priceTop + 8);
      }

      // 拼团进度行
      const pInfoTop = priceTop + 48;
      // 左边 "拼团进度" 标题
      ctx.setFillStyle('#333333');
      ctx.setFontSize(17);
      ctx.setTextAlign('left');
      ctx.fillText('报名进度', 20, pInfoTop);

      // 右边拼团信息整体右对齐（不用measureText，用固定字符宽度更可靠）
      const curStr = String(currentMonths);
      const tgtStr = String(targetMonths);
      const charW = 15; // 每个中文字符/数字的近似宽度
      
      // 从右往左布局:
      //  张/目标40张      → 长度: 6+数字位数 个字符宽度
      //  40 (橙色数字)   → 长度: 数字位数 个字符宽度
      //  已报             → 长度: 2 个字符宽度
      const rightPartsWidth = (6 + tgtStr.length) * charW;   // "张 / 目标 X张"
      const numPartWidth = curStr.length * charW;            // 数字
      const yipinWidth = 2 * charW;                          // "已报"
      const totalWidth = rightPartsWidth + numPartWidth + yipinWidth + 12;
      
      const rightStartX = canvasW - 20 - totalWidth;
      // "已报"
      ctx.setFillStyle('#666666');
      ctx.setFontSize(15);
      ctx.setTextAlign('left');
      ctx.fillText('已报', rightStartX, pInfoTop);
      // 数字（橙色）
      ctx.setFillStyle('#F97316');
      ctx.setFontSize(17);
      ctx.fillText(curStr, rightStartX + yipinWidth + 6, pInfoTop - 1);
      // "张 / 目标 X张"
      ctx.setFillStyle('#666666');
      ctx.setFontSize(15);
      ctx.fillText(`张 / 目标 ${tgtStr}张`, rightStartX + yipinWidth + numPartWidth + 10, pInfoTop);

      // 下方提示 - 紧凑间距，放大文字
      const tipTop = pInfoTop + 32;
      if (currentMonths >= targetMonths && targetMonths > 0) {
        ctx.setFillStyle('#22C55E');
        ctx.setFontSize(19); // 放大已达成文字
        ctx.setTextAlign('left');
        ctx.fillText('🎉 已达目标张数，即将成行！', 20, tipTop);
      } else if (currentMonths > 0 && targetMonths > 0) {
        const rem = targetMonths - currentMonths;
        const remStr = String(rem);
        ctx.setTextAlign('left');
        ctx.setFillStyle('#6B7280');
        ctx.setFontSize(16);
        ctx.fillText('还差 ', 20, tipTop);
        ctx.setFillStyle('#F97316');
        ctx.setFontSize(18);
        ctx.fillText(remStr, 20 + 34, tipTop - 1);
        ctx.setFillStyle('#6B7280');
        ctx.setFontSize(16);
        ctx.fillText('张即可成行', 20 + 34 + remStr.length * 10, tipTop);
      } else {
        ctx.setFillStyle('#6B7280');
        ctx.setFontSize(16);
        ctx.setTextAlign('left');
        ctx.fillText(`目标 ${targetMonths} 张，快来加入吧`, 20, tipTop);
      }

      // 底部截止日期 - 紧贴底部减少空白
      const vUntil = activity.validUntil || '';
      ctx.setFillStyle('#666666');
      ctx.setFontSize(16);
      ctx.setTextAlign('left');
      ctx.setTextBaseline('bottom');
      ctx.fillText(`⏱ 截止 ${vUntil} · 点击立即加入`, 20, canvasH - 14);

      // 在 draw 回调中导出，确保 canvas 已渲染完成
      return new Promise((resolve) => {
        ctx.draw(false, () => {
          wx.canvasToTempFilePath({
            canvasId: 'shareCardCanvas',
            x: 0, y: 0, width: canvasW, height: canvasH,
            destWidth: canvasW * dpr, destHeight: canvasH * dpr,
            fileType: 'jpg', quality: 0.9,
            success: res => resolve(res.tempFilePath),
            fail: err => { console.error('生成分享图失败:', err); resolve(''); }
          });
        });
      });
    } catch (err) {
      console.error('generateShareImage 异常:', err);
      return '';
    }
  },

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  },

  onShareAppMessage() {
    const activity = this.data.activity || {};
    const shareData = { title: activity.title || '报名活动', path: `/pages/group-detail/index?id=${this.data.activityId}` };
    if (this.data._shareImage) shareData.imageUrl = this.data._shareImage;
    return shareData;
  },
  onShareTimeline() {
    const activity = this.data.activity || {};
    const shareData = { title: activity.title || '报名活动' };
    if (this.data._shareImage) shareData.imageUrl = this.data._shareImage;
    return shareData;
  },
});
