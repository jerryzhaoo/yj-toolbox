const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { activityId } = event;
  if (!activityId) return { success: false, msg: '缺少 activityId' };

  try {
    await db.collection('activities').doc(activityId).update({
      data: {
        isClosed: true,
        updatedAt: db.serverDate(),
      }
    });
    return { success: true };
  } catch (err) {
    return { success: false, msg: err.message };
  }
};
