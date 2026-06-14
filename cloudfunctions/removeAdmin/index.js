const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { adminId } = event;
  if (!adminId) return { success: false, msg: '参数无效' };

  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  // 检查当前用户是否为超级管理员
  const adminRes = await db.collection('admins').where({ _openid: openid, role: 'super' }).limit(1).get();
  if (adminRes.data.length === 0) {
    return { success: false, msg: '仅超级管理员可移除管理员' };
  }

  // 检查被移除的管理员信息
  const targetRes = await db.collection('admins').doc(adminId).get();
  if (!targetRes.data) return { success: false, msg: '管理员不存在' };
  if (targetRes.data.role === 'super') return { success: false, msg: '不能移除超级管理员' };

  try {
    await db.collection('admins').doc(adminId).remove();
    return { success: true };
  } catch (err) {
    return { success: false, msg: err.message };
  }
};
