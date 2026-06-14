const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()

  try {
    // 校验管理员身份
    const adminRes = await db.collection('admins').where({
      _openid: wxContext.OPENID,
    }).limit(1).get()
    let isAdmin = adminRes.data.length > 0
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

    // 删除旧记录
    const oldRes = await db.collection('communities').get()
    if (oldRes.data.length > 0) {
      const batch = db.collection('communities')
      for (const doc of oldRes.data) {
        await batch.doc(doc._id).remove()
      }
    }

    // 添加新记录
    const groups = event.groups || []
    for (let i = 0; i < groups.length; i++) {
      await db.collection('communities').add({
        data: {
          imageUrl: groups[i].imageUrl || '',
          description: groups[i].description || '',
          isFull: !!groups[i].isFull,
          order: i,
          createdAt: db.serverDate(),
        }
      })
    }

    return { success: true, msg: '保存成功' }
  } catch (err) {
    console.error('[saveCommunity] 错误:', err)
    return { success: false, msg: err.message || '保存失败' }
  }
}
