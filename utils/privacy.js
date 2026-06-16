/**
 * 隐私授权工具
 * 记录用户对个人信息用途的同意授权，授权记录存本地缓存
 */

const STORAGE_KEY = 'privacyAgreed'
const VERSION = 'v1'

// 各字段用途说明
const FIELD_PURPOSES = [
  { key: 'avatar',   label: '头像',       purpose: '在活动报名列表中展示个人形象，方便拼友识别' },
  { key: 'name',     label: '昵称',       purpose: '在活动中标识您的身份，让拼友知道如何称呼您' },
  { key: 'gender',   label: '性别',       purpose: '活动分组匹配及个性化服务' },
  { key: 'realName', label: '真实姓名',   purpose: '活动报名实名登记，确保参与者身份真实性' },
  { key: 'phone',    label: '手机号',     purpose: '活动联系、紧急通知以及拼友之间联系' },
  { key: 'carNumber',label: '车牌号',     purpose: '停车场车牌识别、停车安排及拼车匹配' },
  { key: 'wechat',   label: '微信号',     purpose: '拼友之间互相添加微信进行沟通协调' },
  { key: 'invoice',  label: '发票信息',   purpose: '包括公司名称、税号等，用于活动费用报销开具发票' },
  { key: 'bank',     label: '银行卡信息', purpose: '包括户名、卡号、开户行，用于转账结算（仅管理员可用）' },
]

/** 获取全量字段用途列表 */
function getAllPurposes() {
  return FIELD_PURPOSES
}

/** 获取指定字段的用途列表 */
function getPurposesByKeys(keys) {
  return FIELD_PURPOSES.filter(p => keys.includes(p.key))
}

/** 检查用户是否已同意授权（单次会话有效） */
function hasAgreed() {
  try {
    const record = wx.getStorageSync(STORAGE_KEY)
    return record && record.version === VERSION && record.agreed === true
  } catch (e) {
    return false
  }
}

/** 标记用户已同意授权 */
function setAgreed() {
  try {
    wx.setStorageSync(STORAGE_KEY, { version: VERSION, agreed: true, time: Date.now() })
  } catch (e) {}
}

/** 清除授权记录（用于测试或用户主动撤销） */
function clearAgreed() {
  try {
    wx.removeStorageSync(STORAGE_KEY)
  } catch (e) {}
}

module.exports = {
  getAllPurposes,
  getPurposesByKeys,
  hasAgreed,
  setAgreed,
  clearAgreed,
}
