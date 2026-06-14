const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { activityId } = event;
  if (!activityId) return { success: false, msg: '参数无效' };

  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  // 检查是否为管理员
  const adminRes = await db.collection('admins').where({ _openid: openid }).limit(1).get();
  if (adminRes.data.length === 0) {
    return { success: false, msg: '仅管理员可删除活动' };
  }

  try {
    // 删除活动
    await db.collection('activities').doc(activityId).remove();
    // 删除该活动下所有参与者
    const partRes = await db.collection('participants').where({ activityId }).get();
    const tasks = partRes.data.map(p => db.collection('participants').doc(p._id).remove());
    await Promise.all(tasks);
    return { success: true };
  } catch (err) {
    return { success: false, msg: err.message };
  }
};
