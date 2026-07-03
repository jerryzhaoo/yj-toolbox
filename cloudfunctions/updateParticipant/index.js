const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { participantId, data } = event;
  if (!participantId || !data) return { success: false, msg: '参数无效' };

  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  // 检查是否为管理员
  const adminRes = await db.collection('admins').where({ _openid: openid }).limit(1).get();
  if (adminRes.data.length === 0) {
    return { success: false, msg: '仅管理员可执行此操作' };
  }

  try {
    // 先查旧记录，获取 activityId 和旧 months
    const old = await db.collection('participants').doc(participantId).get();
    if (!old.data) return { success: false, msg: '参与者不存在' };
    const activityId = old.data.activityId;
    const oldMonths = Number(old.data.months) || 0;
    const newMonths = (data.months !== undefined) ? Number(data.months) || 0 : oldMonths;

    data.updatedAt = db.serverDate();
    await db.collection('participants').doc(participantId).update({ data });

    // 增量同步 currentMonths
    const monthsDiff = newMonths - oldMonths;
    if (monthsDiff !== 0 && activityId) {
      await db.collection('activities').doc(activityId).update({
        data: { currentMonths: db.command.inc(monthsDiff) }
      });
    }

    return { success: true };
  } catch (err) {
    return { success: false, msg: err.message };
  }
};
