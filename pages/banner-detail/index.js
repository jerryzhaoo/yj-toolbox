const db = wx.cloud.database();

Page({
  data: {
    banner: null,
    loading: true,
  },

  onLoad(options) {
    if (options.id) {
      this.loadBanner(options.id);
    }
  },

  async loadBanner(id) {
    try {
      const res = await db.collection('banners').doc(id).get();
      const banner = res.data;
      const fileIds = [];
      if (banner.bannerImage) fileIds.push(banner.bannerImage);
      if (banner.images && banner.images.length > 0) fileIds.push(...banner.images);
      if (fileIds.length > 0) {
        try {
          const { result } = await wx.cloud.callFunction({
            name: 'getTempFileUrls',
            data: { fileList: fileIds }
          });
          if (result && result.fileList) {
            const urlMap = {};
            for (const f of result.fileList) urlMap[f.fileID] = f.tempFileURL;
            if (banner.bannerImage && urlMap[banner.bannerImage]) banner.bannerImage = urlMap[banner.bannerImage];
            if (banner.images) banner.images = banner.images.map(id => urlMap[id] || id);
          }
        } catch (e) {
          console.warn('获取Banner临时URL失败:', e);
        }
      }
      this.setData({ banner, loading: false });
      wx.setNavigationBarTitle({ title: banner.title || '详情' });
    } catch (err) {
      wx.showToast({ title: '加载失败', icon: 'error' });
      this.setData({ loading: false });
    }
  },

  onBack() {
    wx.navigateBack();
  },

  onShareAppMessage() {
    const banner = this.data.banner;
    return {
      title: banner ? banner.title : '分享',
      path: `/pages/banner-detail/index?id=${this.data.banner?._id}`,
    };
  },

  onShareTimeline() {
    const banner = this.data.banner;
    return { title: banner ? banner.title : '分享' };
  },
});
