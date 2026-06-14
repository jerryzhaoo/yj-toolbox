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
    data.updatedAt = db.serverDate();
    await db.collection('participants').doc(participantId).update({ data });
    return { success: true };
  } catch (err) {
    return { success: false, msg: err.message };
  }
};
