const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { adminRecordId, openid } = event;
  if (!adminRecordId || !openid) return { success: false, msg: '参数无效' };

  try {
    await db.collection('admins').doc(adminRecordId).update({
      data: {
        openid: openid,
        activated: true,
        activatedAt: db.serverDate(),
      },
    });
    return { success: true };
  } catch (err) {
    return { success: false, msg: err.message };
  }
};
