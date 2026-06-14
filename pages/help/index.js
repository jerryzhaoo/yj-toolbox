Page({
  onBack() {
    wx.navigateBack();
  },

  onShareAppMessage() {
    return { title: '使用帮助 - 一起拼', path: '/pages/help/index' };
  },

  onShareTimeline() {
    return { title: '使用帮助 - 一起拼' };
  },
});
