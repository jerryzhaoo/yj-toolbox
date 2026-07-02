const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 云函数入口函数
exports.main = async (event, context) => {
  const { activityId } = event;
  if (!activityId) {
    return { success: false, msg: '缺少activityId' };
  }

  try {
    const res = await db.collection('participants')
      .where({ activityId })
      .limit(500)
      .get();
    return { success: true, data: res.data, total: res.data.length };
  } catch (err) {
    return { success: false, msg: err.message || '查询失败' };
  }
};
