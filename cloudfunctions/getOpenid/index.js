const cloud = require('wx-server-sdk');
cloud.init();
const db = cloud.database();

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();

  // CDK激活管理员
  if (event.action === 'activateCdk') {
    const { code } = event;
    try {
      const res = await db.collection('admins').where({
        inviteCode: code,
        activated: false,
      }).get();

      if (res.data.length === 0) {
        return { success: false, error: 'CDK无效或已被使用' };
      }

      await db.collection('admins').doc(res.data[0]._id).update({
        data: {
          _openid: OPENID,
          activated: true,
          activatedAt: db.serverDate(),
        },
      });

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  return { openid: OPENID };
};
