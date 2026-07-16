const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async () => {
  const report = { total: 0, fixed: 0, skipped: 0, errors: [] }

  try {
    // 获取所有未关闭的活动
    const activitiesRes = await db.collection('activities')
      .where({ isClosed: db.command.neq(true) })
      .field({ _id: true, currentMonths: true })
      .get()

    const activities = activitiesRes.data
    report.total = activities.length
    console.log(`[syncCurrentMonths] 检查 ${activities.length} 个活动`)

    for (const activity of activities) {
      try {
        // 从 participants 表累加该活动的月数
        const participantsRes = await db.collection('participants')
          .where({ activityId: activity._id })
          .field({ months: true })
          .get()

        const realSum = participantsRes.data.reduce(
          (sum, p) => sum + (Number(p.months) || 0),
          0
        )

        const storedMonths = Number(activity.currentMonths) || 0

        if (realSum !== storedMonths) {
          await db.collection('activities').doc(activity._id).update({
            data: { currentMonths: realSum }
          })
          report.fixed++
          console.log(`[syncCurrentMonths] 修复: ${activity._id}, ${storedMonths} → ${realSum}`)
        } else {
          report.skipped++
        }
      } catch (err) {
        report.errors.push({ id: activity._id, msg: err.message })
        console.error(`[syncCurrentMonths] 处理失败: ${activity._id}`, err)
      }
    }

    console.log(`[syncCurrentMonths] 完成: 共${report.total}个, 修复${report.fixed}个, 跳过${report.skipped}个`)
    return { success: true, report }
  } catch (err) {
    console.error('[syncCurrentMonths] 整体失败:', err)
    return { success: false, msg: err.message }
  }
}
