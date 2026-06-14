const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { activityId, data } = event;
  if (!activityId || !data) return { success: false, msg: '参数无效' };

  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  // 检查是否为管理员
  const adminRes = await db.collection('admins').where({
    _openid: openid
  }).limit(1).get();
  if (adminRes.data.length === 0) {
    // 用自定义 openid 字段兼容邀请码激活
    const r2 = await db.collection('admins').where({ openid: openid, activated: true }).limit(1).get();
    if (r2.data.length === 0) return { success: false, msg: '仅管理员可编辑活动' };
  }

  try {
    data.updatedAt = db.serverDate();
    await db.collection('activities').doc(activityId).update({ data });
    return { success: true };
  } catch (err) {
    return { success: false, msg: err.message };
  }
};
