const app = getApp();
const db = wx.cloud.database();
const cache = require('../../utils/cache');

Page({
  data: {
    currentSlide: 0,
    activeTab: '拼团中',
    sortBy: '综合',
    viewMode: 'grid',
    currentPage: 'home',
    showPublish: false,
    selectedActivity: null,
    selectedPost: null,
    groupBuyingData: [],
    transferData: [],
    secondHandData: [],
    jobData: [],
    currentUserId: null,
    isAdmin: false,
    tabs: ['拼团中'],
    banners: [],
    barColors: ['#A855F7', '#D946EF', '#EC4899'],
    // Banner管理
    showBannerMenu: false,
    showBannerEditor: false,
    isNewBanner: false,
    bannerEditor: { title: '', subtitle: '', content: '', images: [], bannerImage: '' },
    bannerMenuTop: 0,
    bannerMenuLeft: 0,
    bannerMenuData: null,
    // 管理菜单（长按卡片）
    showContextMenu: false,
    popupTop: 0,
    popupLeft: 0,
    selectedActivityId: null,
    contextActivityId: null,
    contextActivityData: null,
    scrollLocked: false,
  },

  async onLoad() {
    this.randomBarColors();
    await Promise.all([this.loadAllData(), this.loadBanners(), this.checkAdmin()]);
  },

  async onShow() {
    await this.checkAdmin();
    this.randomBarColors();
    // 从发布页返回后静默刷新列表（延迟避免与 onLoad 冲突）
    setTimeout(() => this.loadAllData(false), 300);
  },

  // 加载所有数据
  async loadAllData(showLoading = true) {
    if (this._loading) return;
    this._loading = true;
    if (showLoading) wx.showLoading({ title: '加载中...' });
    try {
      const [groupRes, transferRes] = await Promise.all([
        db.collection('activities').where({ type: 'group' }).orderBy('createdAt', 'desc').limit(20).get(),
        db.collection('activities').where({ type: 'transfer', status: 'active' }).orderBy('updatedAt', 'desc').limit(20).get(),
      ]);
      let transferData = transferRes.data;
      if (this.data.sortBy === '综合') {
        transferData = this.shuffleArray([...transferData]);
      }
      // 查询每个拼团活动的参与者月数总和
      const groupIds = groupRes.data.map(item => item._id);
      const participantSums = {};
      if (groupIds.length > 0) {
        const partRes = await db.collection('participants').where({
          activityId: db.command.in(groupIds)
        }).get();
        for (const p of partRes.data || []) {
          participantSums[p.activityId] = (participantSums[p.activityId] || 0) + (Number(p.months) || 0);
        }
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      let groupData = groupRes.data.map((item, i) => {
        let isExpired = item.isExpired || item.isClosed || false;
        if (item.validUntil && !isExpired) {
          const endDate = new Date(item.validUntil + 'T23:59:59');
          if (endDate < today) {
            isExpired = true;
            db.collection('activities').doc(item._id).update({
              data: { status: 'expired', isExpired: true }
            }).catch(() => {});
          }
        }
        return {
          ...item,
          isExpired,
          styleIndex: item.styleIndex ?? (i % 7),
          currentMonths: participantSums[item._id] || 0,
        };
      });
      // 排序：未截止在前，已截止在后，各自按 createdAt 倒序
      groupData.sort((a, b) => {
        if (a.isExpired !== b.isExpired) return a.isExpired ? 1 : -1;
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      });
      // 转换月卡转让图片为临时URL
      const transferImages = [];
      for (const t of transferData) {
        if (t.images && t.images.length > 0) transferImages.push(...t.images);
      }
      if (transferImages.length > 0) {
        try {
          const { result } = await wx.cloud.callFunction({
            name: 'getTempFileUrls',
            data: { fileList: transferImages }
          });
          if (result && result.fileList) {
            const urlMap = {};
            for (const f of result.fileList) urlMap[f.fileID] = f.tempFileURL;
            for (const t of transferData) {
              if (t.images) t.images = t.images.map(id => urlMap[id] || id);
            }
          }
        } catch (e) {
          console.warn('获取转让图片临时URL失败:', e);
        }
      }
      this.setData({
        groupBuyingData: groupData,
        transferData,
      });
    } catch (err) {
      console.error('加载数据失败:', err);
    } finally {
      this._loading = false;
      if (showLoading) wx.hideLoading();
    }
  },

  // 随机打乱数组（Fisher-Yates）
  shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  },

  // 下拉刷新
  async onPullDownRefresh() {
    await this.loadAllData();
    wx.stopPullDownRefresh();
  },

  onUnload() {
    if (this._bannerTimer) {
      clearInterval(this._bannerTimer);
    }
  },

  onSwiperChange(e) {
    this.setData({ currentSlide: e.detail.current });
  },



  // 切换Tab
  onTabChange(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      activeTab: this.data.tabs[index]
    });
    // 滚动到首页顶部
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },

  // 切换排序
  onSortTap(e) {
    const sort = e.currentTarget.dataset.sort;
    this.setData({ sortBy: sort });
  },

  // 切换视图模式
  onViewModeChange(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({
      viewMode: mode
    });
  },

  // 点击活动卡片
  onActivityClick(e) {
    const activity = e.currentTarget.dataset.activity;
    const id = activity._id || activity.id;
    const url = activity.tag === '拼团' || activity.type === 'group'
      ? `/pages/group-detail/index?id=${id}`
      : `/pages/post-detail/index?id=${id}`;
    wx.navigateTo({ url });
  },

  // 点击网格卡片
  onGridCardClick(e) {
    const item = e.currentTarget.dataset.item;
    const id = item._id || item.id;
    wx.navigateTo({
      url: `/pages/post-detail/index?id=${id}`
    });
  },

  // ====== 获取当前用户 openid ======
  async getOpenid() {
    try {
      const res = await wx.cloud.callFunction({ name: 'getOpenid' });
      return res.result.openid;
    } catch (e) {
      return null;
    }
  },

  // ====== 检查管理员身份（使用缓存） ======
  async checkAdmin() {
    try {
      const openid = await this.getOpenid();
      if (!openid) return;
      // 先查缓存
      const cached = app.getAdminCache(openid);
      if (cached) {
        this.setData({ isAdmin: cached.isAdmin });
        return;
      }
      // 缓存未命中，查库
      const res = await db.collection('admins').where({
        _openid: openid,
      }).limit(1).get();
      let isAdmin = false;
      let role = '';
      if (res.data.length > 0) {
        isAdmin = true;
        role = res.data[0].role || '';
      } else {
        const r2 = await db.collection('admins').where({ openid: openid, activated: true }).limit(1).get();
        isAdmin = r2.data.length > 0;
        if (isAdmin) role = r2.data[0].role || '';
      }
      this.setData({ isAdmin });
      // 更新缓存
      app.setAdminCache(openid, { isAdmin, isSuperAdmin: role === 'super' });
    } catch (err) {}
  },

  // ====== 加载Banner数据（使用缓存，5分钟有效） ======
  async loadBanners() {
    // 先尝试读缓存
    const cached = cache.get('banners')
    if (cached) {
      this.setData({ banners: cached })
      return
    }
    try {
      const res = await db.collection('banners').orderBy('createdAt', 'desc').limit(5).get();
      const banners = res.data;
      // 转换Banner图片为临时可访问URL
      const allFileIds = [];
      for (const b of banners) {
        if (b.bannerImage) allFileIds.push(b.bannerImage);
        if (b.images && b.images.length > 0) allFileIds.push(...b.images);
      }
      if (allFileIds.length > 0) {
        try {
          const { result } = await wx.cloud.callFunction({
            name: 'getTempFileUrls',
            data: { fileList: allFileIds }
          });
          if (result && result.fileList) {
            const urlMap = {};
            for (const item of result.fileList) {
              urlMap[item.fileID] = item.tempFileURL;
            }
            for (const b of banners) {
              if (b.bannerImage && urlMap[b.bannerImage]) {
                b._bannerImageUrl = urlMap[b.bannerImage];
              }
              if (b.images) {
                b._imageUrls = b.images.map(id => urlMap[id] || id);
              }
            }
          }
        } catch (e) {
          console.warn('获取Banner临时URL失败:', e);
        }
      }
      this.setData({ banners });
      // 写入缓存
      cache.set('banners', banners, 5 * 60 * 1000); // 5分钟
    } catch (err) {
      console.error('加载Banner失败:', err);
    }
  },

  // ====== 加载活动列表（兼容旧引用） ======
  async loadActivities() {
    await this.loadAllData();
  },

  // ====== Banner相关 ======

  onBannerClick(e) {
    const banner = e.currentTarget.dataset.banner;
    if (!banner) return;
    wx.navigateTo({
      url: `/pages/banner-detail/index?id=${banner._id}`
    });
  },

  onBannerLongPress(e) {
    if (!this.data.isAdmin) return;
    const banner = e.currentTarget.dataset.banner;
    if (!banner) return;
    // 获取banner容器位置，居中展示菜单
    const query = wx.createSelectorQuery();
    query.select('.banner-container').boundingClientRect(rect => {
      if (rect) {
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
    this.setData({
      showBannerMenu: true,
      bannerMenuData: banner,
      scrollLocked: true,
      bannerMenuTop: centerY - 60,
      bannerMenuLeft: centerX - 100,
    });
      }
    }).exec();
  },

  onCloseBannerMenu() {
    this.setData({ showBannerMenu: false, bannerMenuData: null, scrollLocked: false });
  },

  openBannerEditor(banner) {
    this.setData({
      showBannerEditor: true,
      scrollLocked: true,
      isNewBanner: !banner,
      bannerEditor: banner ? {
        _id: banner._id || '',
        title: banner.title || '',
        subtitle: banner.subtitle || '',
        content: banner.content || '',
        images: banner.images || [],
        bannerImage: banner.bannerImage || '',
      } : { title: '', subtitle: '', content: '', images: [], bannerImage: '' },
    });
  },

  // 复制新增Banner
  onBannerCopy() {
    const banner = this.data.bannerMenuData;
    this.setData({ showBannerMenu: false });
    // 复制时去掉 _id，作为新增处理
    if (banner) {
      const { _id, ...rest } = banner;
      this.openBannerEditor(null);
      // 把内容填进去
      this.setData({
        isNewBanner: true,
        bannerEditor: {
          title: rest.title || '',
          subtitle: rest.subtitle || '',
          content: rest.content || '',
          images: rest.images || [],
          bannerImage: rest.bannerImage || '',
        },
      });
    }
  },

  // 关闭Banner编辑弹窗
  onCloseBannerEditor() {
    this.setData({ showBannerEditor: false, scrollLocked: false });
  },

  // 编辑Banner
  onBannerEdit() {
    const banner = this.data.bannerMenuData;
    this.setData({ showBannerMenu: false });
    if (banner) this.openBannerEditor(banner);
  },

  // 删除Banner
  async onBannerDelete() {
    const banner = this.data.bannerMenuData;
    if (!banner || !banner._id) return;
    // 至少保留一个Banner
    if (this.data.banners.length <= 1) {
      wx.showToast({ title: '最少保留一个Banner', icon: 'none' });
      this.setData({ showBannerMenu: false });
      return;
    }
    this.setData({ showBannerMenu: false });
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个Banner吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            await db.collection('banners').doc(banner._id).remove();
            wx.showToast({ title: '已删除', icon: 'success' });
            this.loadBanners();
          } catch (err) {
            wx.showToast({ title: '删除失败', icon: 'error' });
          }
        }
      }
    });
  },

  // Banner编辑输入
  onBannerEditorInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({ ['bannerEditor.' + field]: value });
  },

  // 上传Banner主图
  onBannerUploadBannerImage() {
    wx.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'],
      success: (res) => {
        const tempPath = res.tempFilePaths[0];
        wx.cloud.uploadFile({
          cloudPath: 'banners/' + Date.now() + '.jpg',
          filePath: tempPath,
          success: (uploadRes) => {
            this.setData({ 'bannerEditor.bannerImage': uploadRes.fileID });
          },
          fail: () => { wx.showToast({ title: '上传失败', icon: 'error' }); }
        });
      }
    });
  },

  // 上传Banner配图
  onBannerUploadImage() {
    wx.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'],
      success: (res) => {
        const tempPath = res.tempFilePaths[0];
        wx.cloud.uploadFile({
          cloudPath: 'banners/' + Date.now() + '.jpg',
          filePath: tempPath,
          success: (uploadRes) => {
            const images = [...(this.data.bannerEditor.images || []), uploadRes.fileID];
            this.setData({ 'bannerEditor.images': images });
          },
          fail: () => { wx.showToast({ title: '上传失败', icon: 'error' }); }
        });
      }
    });
  },

  // 移除Banner主图
  onBannerRemoveBannerImage() {
    this.setData({ 'bannerEditor.bannerImage': '' });
  },

  // 移除配图
  onBannerRemoveImage(e) {
    const index = e.currentTarget.dataset.index;
    const images = [...(this.data.bannerEditor.images || [])];
    images.splice(index, 1);
    this.setData({ 'bannerEditor.images': images });
  },

  // 保存Banner
  async onBannerSave() {
    const editor = this.data.bannerEditor;
    if (!editor.title || !editor.title.trim()) {
      wx.showToast({ title: '请输入标题', icon: 'none' });
      return;
    }
    if (!editor.subtitle || editor.subtitle.trim().length < 5) {
      wx.showToast({ title: '描述至少5个字', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '保存中...' });
    try {
      const data = {
        title: editor.title.trim(),
        subtitle: editor.subtitle.trim(),
        content: editor.content || '',
        images: editor.images || [],
        bannerImage: editor.bannerImage || '',
        updatedAt: db.serverDate(),
      };
    if (this.data.isNewBanner) {
      // 最多5个Banner
      if (this.data.banners.length >= 5) {
        wx.hideLoading();
        wx.showToast({ title: '最多5个Banner', icon: 'none' });
        return;
      }
      data.createdAt = db.serverDate();
        await db.collection('banners').add({ data });
      } else {
        await db.collection('banners').doc(editor._id).update({ data });
      }
      wx.hideLoading();
      wx.showToast({ title: '保存成功', icon: 'success' });
      this.setData({ showBannerEditor: false });
      this.loadBanners();
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '保存失败', icon: 'error' });
    }
  },

  // ====== 发布 & 导航 ======
  onPublishClick() {
    if (!this.data.isAdmin) return;
    wx.navigateTo({ url: '/pages/publish/index' });
  },

  goToProfile() {
    wx.switchTab({ url: '/pages/profile/index' });
  },

  onHomeTap() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  // ====== 长按卡片管理 ======
  onLongPressCard(e) {
    if (!this.data.isAdmin) return;
    const activity = e.currentTarget.dataset.activity;
    if (!activity) return;
    wx.vibrateShort({ type: 'medium' }).catch(() => {});
    const winInfo = wx.getWindowInfo();
    const rpxToPx = winInfo.windowWidth / 750;
    const popupW = 240 * rpxToPx;
    const popupH = 160 * rpxToPx;
    // longpress 的 e.detail.x/y 是触摸点相对于页面的坐标（含滚动偏移）
    // 弹窗 position:fixed 需要的是视口坐标，所以减去滚动偏移
    const query = wx.createSelectorQuery();
    query.selectViewport().scrollOffset(offset => {
      const scrollY = offset.scrollTop || 0;
      // 触摸点视口坐标 = 页面坐标 - 滚动偏移 - 弹窗尺寸/2（居中）
      let posLeft = e.detail.x - popupW / 2;
      let posTop = (e.detail.y - scrollY) - popupH / 2;
      // 边界限制
      posLeft = Math.max(10, Math.min(posLeft, winInfo.windowWidth - popupW - 10));
      posTop = Math.max(10, Math.min(posTop, winInfo.windowHeight - popupH - 10));
      this.setData({
        showContextMenu: true,
        contextActivityId: activity._id,
        contextActivityData: activity,
        scrollLocked: true,
        popupTop: posTop,
        popupLeft: posLeft,
      });
    }).exec();
  },

  // 随机生成竖条颜色
  randomBarColors() {
    const colorSchemes = [
      ['#A855F7', '#D946EF', '#EC4899'],
      ['#6366F1', '#8B5CF6', '#A855F7'],
      ['#3B82F6', '#06B6D4', '#14B8A6'],
      ['#F97316', '#F59E0B', '#EAB308'],
      ['#EC4899', '#F43F5E', '#EF4444'],
      ['#10B981', '#34D399', '#6EE7B7'],
      ['#8B5CF6', '#A855F7', '#D946EF'],
      ['#06B6D4', '#0EA5E9', '#3B82F6'],
      ['#F59E0B', '#F97316', '#EF4444'],
    ];
    const idx = Math.floor(Math.random() * colorSchemes.length);
    this.setData({ barColors: colorSchemes[idx] });
  },

  onCloseContextMenu() {
    this.setData({ showContextMenu: false, contextActivityId: null, contextActivityData: null, scrollLocked: false });
  },

  stopPropagation() {},

  onCopyActivity() {
    const activity = this.data.contextActivityData;
    if (!activity) return;
    this.setData({ showContextMenu: false });
    const dataStr = JSON.stringify(activity);
    wx.navigateTo({
      url: `/pages/publish/index?edit=1&copy=${encodeURIComponent(dataStr)}`
    });
  },

  async onDeleteActivity() {
    const id = this.data.contextActivityId;
    if (!id) return;
    this.setData({ showContextMenu: false });
    const activity = this.data.contextActivityData;
    const title = activity ? activity.title : '该活动';
    wx.showModal({
      title: '确认删除',
      content: `确定要删除「${title}」吗？该活动及其所有报名信息将被永久删除，不可恢复！`,
      confirmColor: '#EF4444',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          try {
            const res = await wx.cloud.callFunction({
              name: 'deleteActivity',
              data: { activityId: id },
            });
            if (!res.result || !res.result.success) {
              wx.hideLoading();
              wx.showToast({ title: res.result?.msg || '删除失败', icon: 'error' });
              return;
            }
            wx.hideLoading();
            wx.showToast({ title: '已删除', icon: 'success' });
            setTimeout(() => this.loadActivities(), 500);
          } catch (err) {
            wx.hideLoading();
            console.error('删除活动失败:', err);
            wx.showToast({ title: '删除失败', icon: 'error' });
          }
        }
      },
    });
  },

  // ====== 分享功能 ======
  onShareAppMessage() {
    return {
      title: '一起拼 - 组团报名更划算',
      path: '/pages/index/index',
    };
  },
  onShareTimeline() {
    return {
      title: '一起拼 - 组团报名更划算',
    };
  },
});
