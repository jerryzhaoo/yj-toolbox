const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    post: null,
    postId: null,
    isAuthor: false,
    currentUserId: null,
    typeLabel: '',
    detailsList: [],
    displayRegion: '',
    displayRegionFormatted: '',
    validPeriodText: '',
    loading: true,
    _loaded: false,
  },

  async onLoad(options) {
    if (options.id) {
      this.setData({ postId: options.id });
      await this.loadPageData(options.id);
      this.setData({ _loaded: true });
    }
  },

  // 从编辑页返回时刷新数据
  async onShow() {
    if (this.data._loaded && this.data.postId) {
      await this.loadPageData(this.data.postId);
    }
  },

  // 加载页面数据的公共方法
  async loadPageData(id) {
    // 并行获取帖子详情和 openid
    const [post, openid] = await Promise.all([
      this.fetchPost(id),
      this.getOpenid()
    ]);

    // 判断是否为作者
    let isAuthor = false;
    if (openid && post) {
      isAuthor = post._openid === openid;
    }

    // 兜底：如果云函数获取 openid 失败，通过查询比对
    if (!isAuthor && post && openid) {
      try {
        const userPosts = await db.collection('activities')
          .where({ _openid: openid })
          .get();
        isAuthor = userPosts.data.some(p => p._id === id);
      } catch (e) {
        console.error('[post-detail] 兜底查询失败:', e);
      }
    }

    const typeLabel = this.getTypeLabel(post.type);
    const detailsList = this.buildDetailsList(post);
    // 所在区域：优先用 region，没有则从 location 提取省市区
    const displayRegion = post.region || (post.location ? this.extractRegion(post.location) : '');
    // 格式化为 广东省·深圳市·南山区
    const displayRegionFormatted = this.formatRegion(displayRegion);
    // 有效期：有起止日期则完整显示，否则只显示截止日期
    let validPeriodText = '';
    if (post.validFrom && post.validUntil) {
      validPeriodText = `${post.validFrom} 至 ${post.validUntil}`;
    } else if (post.validUntil) {
      validPeriodText = `至 ${post.validUntil}`;
    }

    const descHtml = (post.description || '').replace(/\n/g, '<br/>');
    // 同步转换云图片ID为可共享临时链接（先转换再渲染）
    if (post.images && post.images.length > 0) {
      const cloudIds = post.images.filter(u => u && u.startsWith('cloud://'));
      if (cloudIds.length > 0) {
        try {
          const res = await wx.cloud.callFunction({ name: 'getTempFileUrls', data: { fileList: cloudIds } });
          const urlMap = {};
          (res.result.fileList || []).forEach(f => { if (f.tempFileURL) urlMap[f.fileID] = f.tempFileURL; });
          post.images = post.images.map(u => urlMap[u] || u);
        } catch (e) { console.error('转换图片链接失败:', e); }
      }
    }
    this.setData({ post, descHtml, typeLabel, detailsList, isAuthor, loading: false, displayRegion, displayRegionFormatted, validPeriodText, currentUserId: openid });
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

  // 获取帖子数据（不 setData）
  async fetchPost(id) {
    try {
      const res = await db.collection('activities').doc(id).get();
      return res.data;
    } catch (err) {
      console.error('加载帖子详情失败:', err);
      return null;
    }
  },

  // 构建详细信息列表
  buildDetailsList(post) {
    const list = [];
    if (!post) return list;
    if (post.type === 'transfer') {
      if (post.parkingLot || post.parkingAddress) list.push({ key: '活动地点', value: post.parkingLot || post.parkingAddress });
    } else if (post.type === 'secondhand') {
      if (post.price) list.push({ key: '价格', value: `¥${post.price}` });
      if (post.brand) list.push({ key: '品牌', value: post.brand });
      if (post.condition) list.push({ key: '成色', value: post.condition });
      if (post.purchaseDate) list.push({ key: '购买时间', value: post.purchaseDate });
      if (post.location) list.push({ key: '所在区域', value: post.location });
    } else if (post.type === 'job') {
      if (post.salary) list.push({ key: '薪资', value: post.salary });
      if (post.jobType) list.push({ key: '工作类型', value: post.jobType });
      if (post.location) list.push({ key: '工作地点', value: post.location });
      if (post.requirements) list.push({ key: '岗位要求', value: post.requirements });
      if (post.benefits) list.push({ key: '福利待遇', value: post.benefits });
      if (post.workTime) list.push({ key: '工作时间', value: post.workTime });
    }
    return list;
  },

  // 检查是否已收藏
  // 返回上一页
  onBack() {
    wx.navigateBack();
  },

  // 获取类型标签
  getTypeLabel(type) {
    switch (type) {
      case 'transfer':
        return '月卡转让';
      case 'secondhand':
        return '闲置二手';
      case 'job':
        return '招聘信息';
      default:
        return '其他';
    }
  },

  // 从完整地址中提取省市区
  extractRegion(address) {
    if (!address) return '';
    const match = address.match(/(.+?省)?(.+?市)?(.+?[区县])?/);
    if (match) {
      return [match[1], match[2], match[3]].filter(Boolean).join('');
    }
    return address;
  },

  // 格式化区域：广东省·深圳市·南山区
  formatRegion(region) {
    if (!region) return '';
    // 按省/市/区拆分，用 · 连接
    const parts = region.match(/(.+?省)?(.+?(?:市|自治州|盟))?(.+?[区县旗])?/);
    if (parts) {
      return [parts[1], parts[2], parts[3]].filter(Boolean).join('·');
    }
    return region;
  },

  // 获取图片样式
  getImageStyle(index) {
    const gradients = ['gradient-0', 'gradient-1', 'gradient-2', 'gradient-3'];
    return gradients[index % gradients.length];
  },

  // 复制微信号
  onCopyWechat() {
    wx.setClipboardData({
      data: this.data.post.publisher.wechat,
      success: () => {
        wx.showToast({ title: '复制成功', icon: 'success' });
      }
    });
  },

  // 拨打电话
  onCall() {
    if (this.data.post.publisher.phone) {
      wx.makePhoneCall({
        phoneNumber: this.data.post.publisher.phone
      });
    }
  },

  // 预览大图
  onPreviewImage(e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.post.images;
    if (images && images.length > 0) {
      wx.previewImage({
        current: images[index],
        urls: images,
      });
    }
  },

  // 复制联系方式
  onCopyContact() {
    const { post } = this.data;
    if (!post || !post.contact) {
      wx.showToast({ title: '暂无联系方式', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: post.contact,
      success: () => {
        wx.showToast({ title: '已复制联系方式', icon: 'success' });
      },
    });
  },

  // 编辑帖子
  onEdit() {
    wx.navigateTo({
      url: `/pages/create/index?edit=1&id=${this.data.postId}`
    });
  },

  // 删除帖子
  onDeletePost() {
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条帖子吗？删除后不可恢复。',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          try {
            await db.collection('activities').doc(this.data.postId).remove();
            wx.hideLoading();
            wx.showToast({ title: '已删除', icon: 'success' });
            setTimeout(() => wx.navigateBack(), 1500);
          } catch (err) {
            wx.hideLoading();
            console.error('删除帖子失败:', err);
            wx.showToast({ title: '删除失败', icon: 'error' });
          }
        }
      },
    });
  },

  // 分享
  onShareAppMessage() {
    const { post } = this.data;
    if (!post) return { title: '分享', path: '/pages/index/index' };
    const title = post.title || '分享';
    const imageUrl = post.images && post.images.length > 0 ? post.images[0] : '';
    return {
      title,
      path: `/pages/post-detail/index?id=${this.data.postId}`,
      imageUrl,
    };
  },

  // 分享到朋友圈
  onShareTimeline() {
    const { post } = this.data;
    if (!post) return;
    const title = post.title || '分享';
    return {
      title,
      query: `id=${this.data.postId}`,
    };
  },
});
