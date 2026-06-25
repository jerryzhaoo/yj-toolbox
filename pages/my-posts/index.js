const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    title: '',
    posts: [],
    type: '',
    loading: true,
  },

  async onLoad(options) {
    if (options.title) {
      this.setData({ title: decodeURIComponent(options.title) });
      wx.setNavigationBarTitle({ title: decodeURIComponent(options.title) });
    }
    if (options.type) {
      this.setData({ type: options.type });
      await this.loadPosts(options.type);
    }
  },

  // 获取当前用户 openid（通过云函数）
  async getOpenid() {
    try {
      const res = await wx.cloud.callFunction({ name: 'getOpenid' });
      return res.result.openid;
    } catch (e) {
      console.error('[my-posts] getOpenid 失败:', e);
      return null;
    }
  },

  // 根据类型加载数据
  async loadPosts(type) {
    wx.showLoading({ title: '加载中...' });
    try {
      const openid = await this.getOpenid();
      if (!openid) {
        wx.hideLoading();
        wx.showToast({ title: '获取用户信息失败', icon: 'none' });
        return;
      }

      let postsData = [];
      if (type === 'posts') {
        const res = await db.collection('activities').where({ _openid: openid }).orderBy('createdAt', 'desc').get();
        postsData = res.data;
      } else if (type === 'joined') {
        const partRes = await db.collection('participants').where({ _openid: openid }).get();
        const activityIds = partRes.data.map(p => p.activityId);
        if (activityIds.length > 0) {
          const res = await db.collection('activities').where({ _id: db.command.in(activityIds) }).get();
          postsData = res.data;
        }
      }
      // 计算是否已截止，补充展示字段
      const today = new Date().toISOString().slice(0, 10);
      const toDateStr = (v) => {
        if (!v) return '';
        if (typeof v === 'string') return v.slice(0, 10);
        try { return new Date(v).toISOString().slice(0, 10); } catch (e) { return String(v).slice(0, 10); }
      };
      postsData = postsData.map((item, i) => {
        const isGroup = item.type === 'group';
        // 拼团显示有效期，非拼团显示创建时间
        let timeStr = '';
        if (isGroup) {
          const from = item.validFrom || '';
          const until = item.validUntil || '';
          timeStr = from ? `${from} 至 ${until}` : (until || '');
        } else if (item.createdAt) {
          const d = new Date(item.createdAt);
          timeStr = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
        }
        return {
          ...item,
          isExpired: item.isExpired || item.isClosed || (item.validUntil ? toDateStr(item.validUntil) <= today : false),
          // 拼团活动需要的字段
          ...(isGroup ? {
            tag: '自驾',
            people: item.people || 0,
            styleIndex: item.styleIndex ?? (i % 7),
          } : {}),
          // 展示用字段
          date: item.validFrom || '',
          endDate: item.validUntil || '',
          time: timeStr,
        };
      });
      // 转换图片为临时URL
      const allImages = [];
      for (const p of postsData) {
        if (p.images && p.images.length > 0) allImages.push(...p.images);
      }
      if (allImages.length > 0) {
        try {
          const { result } = await wx.cloud.callFunction({
            name: 'getTempFileUrls',
            data: { fileList: allImages }
          });
          if (result && result.fileList) {
            const urlMap = {};
            for (const f of result.fileList) urlMap[f.fileID] = f.tempFileURL;
            for (const p of postsData) {
              if (p.images) p.images = p.images.map(id => urlMap[id] || id);
            }
          }
        } catch (e) {
          console.warn('获取图片临时URL失败:', e);
        }
      }
      this.setData({ posts: postsData });
    } catch (err) {
      console.error('加载列表失败:', err);
    } finally {
      wx.hideLoading();
      this.setData({ loading: false });
    }
  },

  // 返回
  onBack() {
    wx.navigateBack();
  },

  // 点击卡片
  onCardClick(e) {
    const item = e.currentTarget.dataset.item;
    const id = item._id || item.id;
    const isGroup = item.type === 'group' || (item.tag === '拼团');
    if (isGroup) {
      wx.navigateTo({
        url: `/pages/group-detail/index?id=${id}`
      });
    } else {
      wx.navigateTo({
        url: `/pages/post-detail/index?id=${id}`
      });
    }
  },

  // 获取图片样式
  getImageStyle(index) {
    const gradients = ['gradient-0', 'gradient-1', 'gradient-2', 'gradient-3', 'gradient-4', 'gradient-5'];
    return gradients[index % gradients.length];
  },

  // 判断是否为活动类型
  isActivityType(item) {
    return item.type === 'group' || item.tag === '拼团';
  },
});
