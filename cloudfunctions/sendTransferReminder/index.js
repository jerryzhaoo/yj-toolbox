const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const TEMPLATE_ID = 'OtGg5Rl3jazsLotI0NKepVAs-xMDRdY47uFWBpd4fDg'

exports.main = async (event) => {
  const { activityId, activityTitle, monthlyPrice } = event
  const wxContext = cloud.getWXContext()

  try {
    // 校验管理员身份
    const adminRes = await db.collection('admins').where({ _openid: wxContext.OPENID }).limit(1).get()
    let isAdmin = adminRes.data.length > 0
    if (!isAdmin) {
      const r2 = await db.collection('admins').where({ openid: wxContext.OPENID, activated: true }).limit(1).get()
      isAdmin = r2.data.length > 0
    }
    if (!isAdmin) {
      return { success: false, msg: '无权限操作' }
    }

    // 查询已订阅用户
    const subscribers = await db.collection('subscribers').where({
      activityId,
      templateId: TEMPLATE_ID,
    }).get()

    // 查该活动的参与者
    const allParticipants = await db.collection('participants').where({
      activityId,
      hasTransfer: false,
    }).limit(500).get()

    // 获取活动收款信息
    const activityRes = await db.collection('activities').doc(activityId).get()
    const activity = activityRes.data || {}
    const bankAccountName = activity.bankAccountName || '请查看活动详情'
    const bankCardNumber = activity.bankCardNumber || ''

    let sent = 0
    for (const sub of subscribers.data) {
      // 检查该订阅者是否是该活动未转账的参与者
      const participantRes = await db.collection('participants').where({
        activityId,
        _openid: sub._openid,
        hasTransfer: false,
      }).limit(1).get()

      const participant = participantRes.data[0]
      if (!participant) continue

      try {
        await cloud.openapi.subscribeMessage.send({
          touser: sub._openid,
          templateId: TEMPLATE_ID,
          page: `pages/group-detail/index?id=${activityId}`,
          data: {
            thing21: { value: (activityTitle || '拼团活动').slice(0, 20) },
            character_string13: { value: bankCardNumber || '暂无' },
            name2: { value: (bankAccountName || '请查看明细').slice(0, 10) },
            amount23: { value: `${((participant.months || 0) * (monthlyPrice || 0)).toFixed(2)}` },
            thing7: { value: '待支付' },
          },
        })
        sent++
      } catch (e) {
        console.warn(`发送给 ${sub._openid} 失败:`, e)
      }
    }

    return { success: true, sent }
  } catch (err) {
    console.error('[sendTransferReminder] 错误:', err)
    return { success: false, msg: err.message || '发送失败' }
  }
}
