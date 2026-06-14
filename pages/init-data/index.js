const db = wx.cloud.database();
const mock = require('../../utils/mock.js');

Page({
  data: {
    importing: false,
    result: '',
  },

  // 一键导入初始数据
  async onImport() {
    if (this.data.importing) return;
    this.setData({ importing: true, result: '正在导入...' });

    try {
      const allData = [
        ...mock.groupBuyingData.map(item => ({ ...item, type: 'group', status: item.isExpired ? 'expired' : 'active' })),
        ...mock.transferData.map(item => ({ ...item, type: 'transfer', status: 'active' })),
        ...mock.secondHandData.map(item => ({ ...item, type: 'secondhand', status: 'active' })),
        ...mock.jobData.map(item => ({ ...item, type: 'job', status: 'active' })),
      ];

      let successCount = 0;
      for (const item of allData) {
        // 移除旧 id 字段（云数据库会自动生成 _id）
        delete item.id;
        delete item.authorId;
        delete item.styleIndex;
        delete item.imageStyle;
        // 将 people 转为 participants
        if (item.people !== undefined) {
          item.participants = item.people;
          delete item.people;
        }
        // 设置创建时间
        if (item.date) {
          item.createdAt = new Date(item.date.replace(/\//g, '-'));
        }
        if (item.endDate) {
          item.endDate = new Date(item.endDate.replace(/\//g, '-'));
        }
        await db.collection('activities').add({ data: item });
        successCount++;
      }

      this.setData({
        result: `导入完成！成功导入 ${successCount} 条数据到 activities 集合`,
        importing: false,
      });
    } catch (err) {
      console.error('导入失败:', err);
      this.setData({
        result: `导入失败: ${err.message || '未知错误'}`,
        importing: false,
      });
    }
  },

  // 初始化数据库集合（首次使用需要创建）
  onCreateCollections() {
    this.setData({ result: '请在微信开发者工具 → 云开发 → 数据库中手动创建以下集合：\n\n1. activities（权限：所有用户可读，仅创建者可写）\n2. users（权限：所有用户可读，仅创建者可写）\n3. participants（权限：仅创建者可读写）\n4. favorites（权限：仅创建者可读写）\n5. admins（权限：所有用户可读，仅创建者可写）\n6. banners（权限：所有用户可读，仅创建者可写）\n\n创建完成后点击"导入初始数据"\n\n⚠️ 首次使用需要手动在 admins 集合中添加一条超级管理员记录（通过云开发控制台），填入你自己的微信号' });
  },

  // 设置当前用户为超级管理员
  async onSetSuperAdmin() {
    this.setData({ importing: true, result: '正在设置超级管理员...' });
    try {
      // 先获取 openid
      const openidRes = await wx.cloud.callFunction({ name: 'getOpenid' });
      const openid = openidRes.result.openid;
      if (!openid) {
        this.setData({ result: '获取用户信息失败，请确认云函数 getOpenid 已部署', importing: false });
        return;
      }
      // 检查是否已存在
      let existRes = await db.collection('admins').where({ _openid: openid }).get();
      if (existRes.data.length === 0) {
        existRes = await db.collection('admins').where({ openid: openid, activated: true }).get();
      }
      if (existRes.data.length > 0) {
        this.setData({ result: '你已经是管理员了', importing: false });
        return;
      }
      await db.collection('admins').add({
        data: {
          wechat: '（请手动修改为你的微信号）',
          role: 'super',
          createdAt: db.serverDate(),
        },
      });
      this.setData({
        result: '超级管理员设置成功！\n\n请到云开发控制台 → admins 集合中，修改 wechat 字段为你的真实微信号。',
        importing: false,
      });
    } catch (err) {
      console.error('设置失败:', err);
      this.setData({
        result: `设置失败: ${err.message || '未知错误'}`,
        importing: false,
      });
    }
  },
});
