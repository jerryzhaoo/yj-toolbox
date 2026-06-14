const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { participantId } = event

  if (!participantId) {
    return { success: false, msg: '缺少参与者ID' }
  }

  try {
    // 校验管理员身份
    const adminRes = await db.collection('admins').where({
      _openid: wxContext.OPENID,
    }).limit(1).get()
    let isAdmin = adminRes.data.length > 0
    // 兼容邀请码激活（自定义 openid 字段）
    if (!isAdmin) {
      const r2 = await db.collection('admins').where({
        openid: wxContext.OPENID,
        activated: true,
      }).limit(1).get()
      isAdmin = r2.data.length > 0
    }
    if (!isAdmin) {
      return { success: false, msg: '无权限操作' }
    }

    await db.collection('participants').doc(participantId).remove()
    return { success: true, msg: '删除成功' }
  } catch (err) {
    console.error('[deleteParticipant] 错误:', err)
    return { success: false, msg: err.message || '删除失败' }
  }
}
