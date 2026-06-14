Component({
  data: {
    selected: 0,
    list: [
      {
        pagePath: '/pages/index/index',
        text: '首页',
        icon: 'home',
        selectedIcon: 'home-fill'
      },
      {
        pagePath: '/pages/profile/index',
        text: '我的',
        icon: 'user',
        selectedIcon: 'user-fill'
      }
    ],
    centerButton: {
      icon: 'add'
    }
  },
  attached() {
    this.setSelected();
  },
  methods: {
    setSelected() {
      const pages = getCurrentPages();
      const currentPage = pages[pages.length - 1];
      const route = '/' + currentPage.route;
      const selected = this.data.list.findIndex(item => item.pagePath === route);
      if (selected !== -1) {
        this.setData({ selected });
      }
    },
    switchTab(e) {
      const index = e.currentTarget.dataset.index;
      const pagePath = this.data.list[index].pagePath;
      wx.switchTab({ url: pagePath });
    },
    onCenterTap() {
      wx.navigateTo({
        url: '/pages/publish/index'
      });
    }
  }
});
